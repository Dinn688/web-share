const archiver = require("archiver");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const mime = require("mime-types");
const os = require("os");
const path = require("path");

const APP_NAME = "邻享";
const HOST = process.env.HOST || "0.0.0.0";
const DEFAULT_PORT = Number(process.env.PORT || 5832);
const PORT_RETRY_LIMIT = Number(process.env.PORT_RETRY_LIMIT || 20);
const UPLOAD_CHUNK_LIMIT_MB = Number(process.env.UPLOAD_CHUNK_LIMIT_MB || 16);
const DEFAULT_MAX_SHARED_STORAGE_MB = Number(process.env.DEFAULT_MAX_SHARED_STORAGE_MB || 10240);
const ADMIN_USERNAME = "admin";
const ADMIN_DEFAULT_PASSWORD = "admin123";
const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));
const FILES_DIR = path.join(DATA_DIR, "files");
const PEER_DIR = path.join(DATA_DIR, "peer-files");
const TEMP_DIR = path.join(DATA_DIR, "temp");
const DB_FILE = path.join(DATA_DIR, "db.json");

const app = express();
app.disable("x-powered-by");

const activeDownloads = new Map();
const activeAdminSessions = new Map();
let dbQueue = Promise.resolve();
let activePort = DEFAULT_PORT;

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyAdminPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, expectedHex] = parts;
  let expected;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch (error) {
    return false;
  }
  if (!expected.length) {
    return false;
  }
  const actual = crypto.scryptSync(String(password || ""), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeIp(address) {
  if (!address) {
    return "";
  }
  if (address.startsWith("::ffff:")) {
    return address.slice(7);
  }
  return address;
}

function isPrivateIPv4(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.some((num) => Number.isNaN(num) || num < 0 || num > 255)) {
    return false;
  }
  if (parts[0] === 10) {
    return true;
  }
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }
  if (parts[0] === 127) {
    return true;
  }
  return false;
}

function isLocalAddress(address) {
  if (!address) {
    return false;
  }
  const normalized = normalizeIp(address).toLowerCase();
  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }
  if (normalized.includes(":")) {
    return normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
  }
  return isPrivateIPv4(normalized);
}

function getLanIPv4List() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const records of Object.values(interfaces)) {
    for (const item of records || []) {
      if (item.family === "IPv4" && !item.internal && isPrivateIPv4(item.address)) {
        addresses.push(item.address);
      }
    }
  }
  if (addresses.length === 0) {
    addresses.push("127.0.0.1");
  }
  return addresses;
}

function sanitizeFileName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return "未命名文件";
  }
  const replaced = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return replaced.slice(0, 255) || "未命名文件";
}

function getTempPath(uploadId) {
  return path.join(TEMP_DIR, `${uploadId}.part`);
}

function getFilePath(storedName) {
  return path.join(FILES_DIR, storedName);
}

function getPeerFilePath(storedName) {
  return path.join(PEER_DIR, storedName);
}

function getPeerTempPath(uploadId) {
  return path.join(TEMP_DIR, `peer-${uploadId}.part`);
}

function buildFingerprint({ name, size, lastModified, clientIp }) {
  return crypto
    .createHash("sha256")
    .update(`${name}::${size}::${lastModified}::${clientIp}`)
    .digest("hex");
}

function createDefaultSettings() {
  return {
    autoSync: true,
    theme: "system",
    defaultUploadPath: "",
    chunkSizeMb: UPLOAD_CHUNK_LIMIT_MB,
    notifications: true,
    maxSharedStorageMb: DEFAULT_MAX_SHARED_STORAGE_MB,
  };
}

function createDefaultAdmin() {
  return {
    username: ADMIN_USERNAME,
    passwordHash: hashAdminPassword(ADMIN_DEFAULT_PASSWORD),
    updatedAt: nowIso(),
  };
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(PEER_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      files: [],
      peerSessions: {},
      peerTransfers: [],
      settings: createDefaultSettings(),
      admin: createDefaultAdmin(),
      sessions: {},
      logs: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readDb() {
  const text = await fsp.readFile(DB_FILE, "utf8");
  const db = JSON.parse(text);
  db.files = Array.isArray(db.files) ? db.files : [];
  db.logs = Array.isArray(db.logs) ? db.logs : [];
  db.sessions = db.sessions && typeof db.sessions === "object" ? db.sessions : {};
  db.peerTransfers = Array.isArray(db.peerTransfers) ? db.peerTransfers : [];
  db.peerSessions = db.peerSessions && typeof db.peerSessions === "object" ? db.peerSessions : {};
  db.settings = {
    ...createDefaultSettings(),
    ...(db.settings && typeof db.settings === "object" ? db.settings : {}),
  };
  db.admin = {
    ...createDefaultAdmin(),
    ...(db.admin && typeof db.admin === "object" ? db.admin : {}),
    username: ADMIN_USERNAME,
  };
  return db;
}

async function writeDb(db) {
  await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function updateDb(mutator) {
  const run = async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  };
  const next = dbQueue.then(run, run);
  dbQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function appendLog(action, payload) {
  await updateDb((db) => {
    db.logs.unshift({
      id: createId(),
      action,
      createdAt: nowIso(),
      ...payload,
    });
    if (db.logs.length > 5000) {
      db.logs.length = 5000;
    }
    return null;
  });
}

function incrementDownload(fileId) {
  activeDownloads.set(fileId, (activeDownloads.get(fileId) || 0) + 1);
}

function decrementDownload(fileId) {
  const count = activeDownloads.get(fileId) || 0;
  if (count <= 1) {
    activeDownloads.delete(fileId);
    return;
  }
  activeDownloads.set(fileId, count - 1);
}

function getDownloadCount(fileId) {
  return activeDownloads.get(fileId) || 0;
}

function resolveSortField(input) {
  if (input === "name") {
    return "name";
  }
  if (input === "size") {
    return "size";
  }
  return "uploadedAt";
}

function resolveSortOrder(input) {
  return input === "asc" ? "asc" : "desc";
}

function compareFiles(a, b, sortBy, sortOrder) {
  const factor = sortOrder === "asc" ? 1 : -1;
  if (sortBy === "name") {
    return a.name.localeCompare(b.name, "zh-CN") * factor;
  }
  if (sortBy === "size") {
    return (a.size - b.size) * factor;
  }
  return (new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()) * factor;
}

function classifyFileType(file) {
  const name = String(file?.name || "").toLowerCase();
  const mimeType = String(file?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(name)) {
    return "image";
  }
  if (mimeType.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(name)) {
    return "video";
  }
  if (mimeType.startsWith("audio/") || /\.(mp3|wav|flac|aac|ogg|m4a)$/.test(name)) {
    return "audio";
  }
  if (/\.(zip|rar|7z|tar|gz|bz2)$/.test(name) || mimeType.includes("zip") || mimeType.includes("archive")) {
    return "archive";
  }
  if (
    /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|txt|md|rtf)$/.test(name) ||
    mimeType.includes("pdf") ||
    mimeType.startsWith("text/")
  ) {
    return "document";
  }
  return "other";
}

function parseDateTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function fileMatchesTimeRange(file, range, start, end) {
  const uploaded = parseDateTime(file.uploadedAt);
  if (uploaded === null) {
    return false;
  }
  const now = new Date();
  if (range === "today") {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return uploaded >= startOfDay;
  }
  if (range === "7d") {
    return now.getTime() - uploaded <= 7 * 24 * 60 * 60 * 1000;
  }
  if (range === "custom") {
    const startTime = start ? parseDateTime(start) : null;
    const endTime = end ? parseDateTime(end) : null;
    if (startTime !== null && uploaded < startTime) {
      return false;
    }
    if (endTime !== null && uploaded > endTime + 24 * 60 * 60 * 1000 - 1) {
      return false;
    }
    return true;
  }
  return true;
}

function parsePageSize(value) {
  const num = Number(value);
  if (num === 20) {
    return 20;
  }
  if (Number.isFinite(num) && num > 0 && num <= 200) {
    return Math.floor(num);
  }
  return 10;
}

function toPublicFile(item) {
  return {
    ...item,
    category: classifyFileType(item),
    isDownloading: getDownloadCount(item.id) > 0,
    canPreview: isPreviewable(item),
  };
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      continue;
    }
    cookies[rawName] = decodeURIComponent(rawValue.join("=") || "");
  }
  return cookies;
}

function cleanupAdminSessions() {
  const now = Date.now();
  for (const [token, session] of activeAdminSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      activeAdminSessions.delete(token);
    }
  }
}

function createAdminSession(username) {
  cleanupAdminSessions();
  const token = crypto.randomBytes(32).toString("hex");
  activeAdminSessions.set(token, {
    username,
    createdAt: nowIso(),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  return token;
}

function readAdminSession(req) {
  cleanupAdminSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = activeAdminSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    activeAdminSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function setAdminSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
      ADMIN_SESSION_TTL_MS / 1000,
    )}`,
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function requireAdmin(req, res, next) {
  const session = readAdminSession(req);
  if (!session) {
    res.status(401).json(safeJson("Admin login required."));
    return;
  }
  req.admin = session;
  next();
}

function parseStorageLimitMb(value, fallback = DEFAULT_MAX_SHARED_STORAGE_MB) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(1048576, Math.floor(parsed)));
}

function getSharedStorageUsedBytes(db) {
  return (db.files || []).reduce((sum, file) => sum + Math.max(0, Number(file.size || 0)), 0);
}

function getSharedUploadReservedBytes(db) {
  return Object.values(db.sessions || {}).reduce((sum, session) => {
    return sum + Math.max(0, Number(session?.size || 0));
  }, 0);
}

function getSharedStorageLimitBytes(settings) {
  return parseStorageLimitMb(settings?.maxSharedStorageMb) * 1024 * 1024;
}

function canReserveSharedUpload(db, size) {
  const incomingSize = Math.max(0, Number(size || 0));
  const used = getSharedStorageUsedBytes(db);
  const reserved = getSharedUploadReservedBytes(db);
  return used + reserved + incomingSize <= getSharedStorageLimitBytes(db.settings);
}

function findUploadIpForSharedFile(file, logs) {
  if (file.clientIp) {
    return file.clientIp;
  }
  const match = (logs || []).find((log) => {
    return log && log.clientIp && (log.fileId === file.id || (log.fileName === file.name && Number(log.size || 0) === Number(file.size || 0)));
  });
  return match?.clientIp || "";
}

function buildAdminFileRows(db) {
  const rows = [];
  for (const file of db.files || []) {
    rows.push({
      key: `shared:${file.id}`,
      id: file.id,
      fileId: file.id,
      transferId: null,
      uploadType: "shared",
      uploadTypeLabel: "共享文件",
      name: file.name,
      storedName: file.storedName,
      size: Number(file.size || 0),
      mimeType: file.mimeType || "application/octet-stream",
      uploadedAt: file.uploadedAt,
      uploaderIp: findUploadIpForSharedFile(file, db.logs),
      category: classifyFileType(file),
      sha256: file.sha256 || "",
      isDownloading: getDownloadCount(file.id) > 0,
    });
  }
  for (const transfer of db.peerTransfers || []) {
    for (const file of transfer.files || []) {
      rows.push({
        key: `peer:${transfer.id}:${file.id}`,
        id: file.id,
        fileId: file.id,
        transferId: transfer.id,
        transferCode: transfer.code,
        uploadType: "peer",
        uploadTypeLabel: "对端互传文件",
        name: file.name,
        storedName: file.storedName,
        size: Number(file.size || 0),
        mimeType: file.mimeType || "application/octet-stream",
        uploadedAt: file.uploadedAt,
        expiresAt: transfer.expiresAt,
        uploaderIp: file.clientIp || transfer.clientIp || "",
        category: classifyFileType(file),
        sha256: file.sha256 || "",
        isDownloading: false,
      });
    }
  }
  return rows;
}

function filterAdminFileRows(rows, query) {
  const search = String(query.search || "").trim().toLowerCase();
  const uploadType = ["shared", "peer"].includes(query.uploadType) ? query.uploadType : "all";
  const category = ["image", "document", "archive", "video", "audio", "other"].includes(query.category) ? query.category : "all";
  return rows.filter((row) => {
    const matchesSearch =
      !search ||
      [row.name, row.uploaderIp, row.mimeType, row.uploadTypeLabel, row.transferCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    return matchesSearch && (uploadType === "all" || row.uploadType === uploadType) && (category === "all" || row.category === category);
  });
}

function compareAdminFileRows(a, b, sortBy, sortOrder) {
  const factor = sortOrder === "asc" ? 1 : -1;
  if (sortBy === "name") {
    return a.name.localeCompare(b.name, "zh-CN") * factor;
  }
  if (sortBy === "size") {
    return (a.size - b.size) * factor;
  }
  if (sortBy === "uploadType") {
    return a.uploadType.localeCompare(b.uploadType, "zh-CN") * factor;
  }
  if (sortBy === "uploaderIp") {
    return String(a.uploaderIp || "").localeCompare(String(b.uploaderIp || ""), "zh-CN") * factor;
  }
  return (new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()) * factor;
}

function parseAdminFileKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "shared" && parts[1]) {
    return { uploadType: "shared", fileId: parts[1] };
  }
  if (parts[0] === "peer" && parts[1] && parts[2]) {
    return { uploadType: "peer", transferId: parts[1], fileId: parts[2] };
  }
  return null;
}

async function deleteAdminFileByKey(key, clientIp) {
  const parsed = parseAdminFileKey(key);
  if (!parsed) {
    return { status: 400, body: safeJson("Invalid file key.") };
  }

  return updateDb(async (db) => {
    if (parsed.uploadType === "shared") {
      const file = db.files.find((item) => item.id === parsed.fileId);
      if (!file) {
        return { status: 404, body: safeJson("File not found.") };
      }
      if (getDownloadCount(file.id) > 0) {
        return { status: 409, body: safeJson("File is being downloaded.") };
      }
      const filePath = getFilePath(file.storedName);
      if (fs.existsSync(filePath)) {
        await fsp.unlink(filePath);
      }
      db.files = db.files.filter((item) => item.id !== parsed.fileId);
      db.logs.unshift({
        id: createId(),
        action: "admin-delete-shared",
        fileId: file.id,
        fileName: file.name,
        size: file.size,
        clientIp,
        createdAt: nowIso(),
      });
      return { status: 200, body: safeJson("File deleted.", { deletedKey: key }) };
    }

    const transfer = db.peerTransfers.find((item) => item.id === parsed.transferId);
    const file = transfer?.files?.find((item) => item.id === parsed.fileId);
    if (!transfer || !file) {
      return { status: 404, body: safeJson("File not found.") };
    }
    const filePath = getPeerFilePath(file.storedName);
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath);
    }
    transfer.files = transfer.files.filter((item) => item.id !== parsed.fileId);
    db.logs.unshift({
      id: createId(),
      action: "admin-delete-peer",
      fileId: file.id,
      fileName: file.name,
      size: file.size,
      clientIp,
      createdAt: nowIso(),
    });
    return { status: 200, body: safeJson("File deleted.", { deletedKey: key }) };
  });
}

function isValidTransferCode(code) {
  return /^[A-Za-z0-9]{1,10}$/.test(String(code || ""));
}

function generateTransferCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const length = 8 + Math.floor(Math.random() * 3);
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function isPeerTransferExpired(transfer, now = Date.now()) {
  if (!transfer) {
    return true;
  }
  if (transfer.expireAfterDownload) {
    return false;
  }
  const expiresAt = parseDateTime(transfer.expiresAt);
  return expiresAt !== null && expiresAt <= now;
}

function serializePeerTransfer(transfer) {
  return {
    id: transfer.id,
    code: transfer.code,
    createdAt: transfer.createdAt,
    expiresAt: transfer.expiresAt,
    expireAfterDownload: Boolean(transfer.expireAfterDownload),
    files: (transfer.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      uploadedAt: file.uploadedAt,
      expiresAt: transfer.expiresAt,
      expireAfterDownload: Boolean(transfer.expireAfterDownload),
    })),
  };
}

async function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function isPreviewable(file) {
  const type = String(file.mimeType || "");
  if (type.startsWith("image/")) {
    return true;
  }
  if (type === "application/pdf") {
    return true;
  }
  if (type.startsWith("text/")) {
    return true;
  }
  return false;
}

function safeJson(message, details) {
  return {
    message,
    ...(details || {}),
  };
}

function toChunkBuffer(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  return Buffer.alloc(0);
}

async function deletePeerFiles(files) {
  for (const file of files) {
    const filePath = getPeerFilePath(file.storedName);
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath).catch(() => undefined);
    }
  }
}

async function cleanupExpiredPeerTransfers() {
  const now = Date.now();
  const filesToDelete = [];
  await updateDb((db) => {
    const active = [];
    for (const transfer of db.peerTransfers) {
      if (isPeerTransferExpired(transfer, now)) {
        filesToDelete.push(...(transfer.files || []));
      } else {
        active.push(transfer);
      }
    }
    db.peerTransfers = active;
    return null;
  });
  await deletePeerFiles(filesToDelete);
}

ensureStorage();
cleanupExpiredPeerTransfers().catch(() => undefined);
setInterval(() => {
  cleanupExpiredPeerTransfers().catch(() => undefined);
}, 5 * 60 * 1000).unref();

app.use((req, res, next) => {
  const clientIp = normalizeIp(req.socket.remoteAddress || "");
  if (!isLocalAddress(clientIp)) {
    res.status(403).json(safeJson("仅支持同一内部网络访问，请连接内网后重试。"));
    return;
  }
  next();
});

app.use(express.json({ limit: "4mb" }));

app.get("/api/system/info", (req, res) => {
  const ips = getLanIPv4List();
  res.json({
    appName: APP_NAME,
    port: activePort,
    primaryIp: ips[0],
    accessAddress: `http://${ips[0]}:${activePort}`,
    allAddresses: ips.map((ip) => `http://${ip}:${activePort}`),
    now: nowIso(),
  });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.post("/api/admin/login", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const db = await readDb();
    if (username !== db.admin.username || !verifyAdminPassword(password, db.admin.passwordHash)) {
      res.status(401).json(safeJson("Invalid admin credentials."));
      return;
    }
    const token = createAdminSession(db.admin.username);
    setAdminSessionCookie(res, token);
    res.json({ admin: { username: db.admin.username } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  activeAdminSessions.delete(req.admin.token);
  clearAdminSessionCookie(res);
  res.json(safeJson("Logged out."));
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ admin: { username: req.admin.username } });
});

app.post("/api/admin/password", requireAdmin, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 8) {
      res.status(400).json(safeJson("New password must be at least 8 characters."));
      return;
    }

    const result = await updateDb((db) => {
      if (!verifyAdminPassword(currentPassword, db.admin.passwordHash)) {
        return { status: 401, body: safeJson("Current password is incorrect.") };
      }
      db.admin = {
        username: ADMIN_USERNAME,
        passwordHash: hashAdminPassword(newPassword),
        updatedAt: nowIso(),
      };
      return { status: 200, body: safeJson("Admin password updated.", { admin: { username: ADMIN_USERNAME } }) };
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/files", requireAdmin, async (req, res, next) => {
  try {
    const db = await readDb();
    const sortBy = ["uploadedAt", "name", "size", "uploadType", "uploaderIp"].includes(req.query.sortBy)
      ? String(req.query.sortBy)
      : "uploadedAt";
    const sortOrder = resolveSortOrder(String(req.query.sortOrder || ""));
    const pageSize = parsePageSize(req.query.pageSize || 20);
    const requestedPage = Math.max(1, Number(req.query.page || 1));
    const filtered = filterAdminFileRows(buildAdminFileRows(db), req.query).sort((a, b) =>
      compareAdminFileRows(a, b, sortBy, sortOrder),
    );
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;
    res.json({
      files: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/files/:key", requireAdmin, async (req, res, next) => {
  try {
    const result = await deleteAdminFileByKey(req.params.key, normalizeIp(req.socket.remoteAddress || ""));
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/files/batch-delete", requireAdmin, async (req, res, next) => {
  try {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String).filter(Boolean) : [];
    if (!keys.length) {
      res.status(400).json(safeJson("No files selected."));
      return;
    }
    const deletedKeys = [];
    const failed = [];
    for (const key of keys) {
      const result = await deleteAdminFileByKey(key, normalizeIp(req.socket.remoteAddress || ""));
      if (result.status >= 200 && result.status < 300) {
        deletedKeys.push(result.body.deletedKey || key);
      } else {
        failed.push({ key, message: result.body.message || "Delete failed." });
      }
    }
    res.json({ deletedKeys, failed });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/settings", requireAdmin, async (req, res, next) => {
  try {
    const db = await readDb();
    const sharedUsedBytes = getSharedStorageUsedBytes(db);
    const peerFileCount = (db.peerTransfers || []).reduce((sum, transfer) => sum + (transfer.files || []).length, 0);
    res.json({
      settings: {
        maxSharedStorageMb: parseStorageLimitMb(db.settings.maxSharedStorageMb),
        chunkSizeMb: db.settings.chunkSizeMb,
        notifications: db.settings.notifications,
      },
      storage: {
        sharedUsedBytes,
        sharedLimitBytes: getSharedStorageLimitBytes(db.settings),
        sharedFileCount: (db.files || []).length,
        peerFileCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/settings", requireAdmin, async (req, res, next) => {
  try {
    const settings = await updateDb((db) => {
      db.settings = {
        ...createDefaultSettings(),
        ...db.settings,
        maxSharedStorageMb: parseStorageLimitMb(req.body?.maxSharedStorageMb, db.settings.maxSharedStorageMb),
      };
      return {
        maxSharedStorageMb: db.settings.maxSharedStorageMb,
        chunkSizeMb: db.settings.chunkSizeMb,
        notifications: db.settings.notifications,
      };
    });
    const db = await readDb();
    res.json({
      settings,
      storage: {
        sharedUsedBytes: getSharedStorageUsedBytes(db),
        sharedLimitBytes: getSharedStorageLimitBytes(db.settings),
        sharedFileCount: (db.files || []).length,
        peerFileCount: (db.peerTransfers || []).reduce((sum, transfer) => sum + (transfer.files || []).length, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/files", async (req, res, next) => {
  try {
    const db = await readDb();
    const search = String(req.query.search || "").trim().toLowerCase();
    const sortBy = resolveSortField(String(req.query.sortBy || ""));
    const sortOrder = resolveSortOrder(String(req.query.sortOrder || ""));
    const timeRange = String(req.query.timeRange || "all");
    const type = String(req.query.type || "all");
    const pageSize = parsePageSize(req.query.pageSize || 10);
    const requestedPage = Math.max(1, Number(req.query.page || 1));

    const filtered = db.files
      .filter((item) => !search || item.name.toLowerCase().includes(search))
      .filter((item) => type === "all" || classifyFileType(item) === type)
      .filter((item) => fileMatchesTimeRange(item, timeRange, req.query.start, req.query.end))
      .sort((a, b) => compareFiles(a, b, sortBy, sortOrder))
      .map(toPublicFile);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;
    const files = filtered.slice(start, start + pageSize);

    res.json({
      files,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/logs", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const db = await readDb();
    res.json({
      logs: db.logs.slice(0, Math.max(1, limit)),
      total: db.logs.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (req, res, next) => {
  try {
    const db = await readDb();
    res.json({ settings: db.settings });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", async (req, res, next) => {
  try {
    const nextSettings = req.body && typeof req.body === "object" ? req.body : {};
    const settings = await updateDb((db) => {
      db.settings = {
        ...createDefaultSettings(),
        ...db.settings,
        autoSync: Object.prototype.hasOwnProperty.call(nextSettings, "autoSync")
          ? Boolean(nextSettings.autoSync)
          : db.settings.autoSync,
        theme: ["light", "dark", "system"].includes(nextSettings.theme) ? nextSettings.theme : db.settings.theme,
        defaultUploadPath: String(nextSettings.defaultUploadPath || "").slice(0, 260),
        chunkSizeMb: Math.max(1, Math.min(128, Number(nextSettings.chunkSizeMb || db.settings.chunkSizeMb))),
        notifications: Object.prototype.hasOwnProperty.call(nextSettings, "notifications")
          ? Boolean(nextSettings.notifications)
          : db.settings.notifications,
      };
      return db.settings;
    });
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

app.post("/api/upload/init", async (req, res, next) => {
  try {
    const incomingName = sanitizeFileName(req.body?.name);
    const size = Number(req.body?.size);
    const lastModified = Number(req.body?.lastModified || 0);

    if (!Number.isFinite(size) || size < 0) {
      res.status(400).json(safeJson("文件大小无效，请重新选择文件。"));
      return;
    }

    if (!incomingName) {
      res.status(400).json(safeJson("文件名称无效，请重新选择文件。"));
      return;
    }

    const clientIp = normalizeIp(req.socket.remoteAddress || "");
    const fingerprint = buildFingerprint({
      name: incomingName,
      size,
      lastModified,
      clientIp,
    });

    if (size === 0) {
      const result = await updateDb(async (db) => {
        if (!canReserveSharedUpload(db, size)) {
          return { status: 413, body: safeJson("Shared storage quota exceeded.") };
        }
        const extension = path.extname(incomingName);
        const storedName = `${Date.now()}-${createId()}${extension}`;
        const storedPath = getFilePath(storedName);
        await fsp.writeFile(storedPath, Buffer.alloc(0));
        const file = {
          id: createId(),
          name: incomingName,
          storedName,
          size: 0,
          mimeType: mime.lookup(incomingName) || "application/octet-stream",
          uploadedAt: nowIso(),
          sha256: await hashFileSha256(storedPath),
          clientIp,
        };
        db.files.unshift(file);
        db.logs.unshift({
          id: createId(),
          action: "上传",
          fileId: file.id,
          fileName: file.name,
          size: file.size,
          clientIp,
          createdAt: nowIso(),
        });
        if (db.logs.length > 5000) {
          db.logs.length = 5000;
        }
        return {
          status: 200,
          body: {
            uploadId: null,
            uploadedBytes: 0,
            complete: true,
            file,
          },
        };
      });
      res.status(result.status).json(result.body);
      return;
    }

    const result = await updateDb(async (db) => {
      const sessions = Object.values(db.sessions);
      for (const session of sessions) {
        if (session.fingerprint !== fingerprint) {
          continue;
        }
        const tempPath = getTempPath(session.id);
        if (fs.existsSync(tempPath)) {
          return { status: 200, body: { reused: true, session } };
        }
        delete db.sessions[session.id];
      }

      if (!canReserveSharedUpload(db, size)) {
        return { status: 413, body: safeJson("Shared storage quota exceeded.") };
      }

      const sessionId = createId();
      const session = {
        id: sessionId,
        name: incomingName,
        size,
        uploadedBytes: 0,
        lastModified,
        fingerprint,
        clientIp,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.sessions[sessionId] = session;
      await fsp.writeFile(getTempPath(sessionId), Buffer.alloc(0), { flag: "a" });
      return { status: 200, body: { reused: false, session } };
    });

    if (result.status !== 200) {
      res.status(result.status).json(result.body);
      return;
    }

    res.json({
      uploadId: result.body.session.id,
      uploadedBytes: result.body.session.uploadedBytes,
      complete: false,
      chunkLimitBytes: UPLOAD_CHUNK_LIMIT_MB * 1024 * 1024,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/upload/status/:uploadId", async (req, res, next) => {
  try {
    const uploadId = req.params.uploadId;
    const db = await readDb();
    const session = db.sessions[uploadId];
    if (!session) {
      res.status(404).json(safeJson("未找到上传任务。"));
      return;
    }
    res.json({
      uploadId: session.id,
      uploadedBytes: session.uploadedBytes,
      size: session.size,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/upload/session/:uploadId", async (req, res, next) => {
  try {
    const uploadId = req.params.uploadId;
    const tempPath = getTempPath(uploadId);
    await updateDb((db) => {
      delete db.sessions[uploadId];
      return null;
    });
    if (fs.existsSync(tempPath)) {
      await fsp.unlink(tempPath);
    }
    res.json(safeJson("上传任务已取消。"));
  } catch (error) {
    next(error);
  }
});

app.put(
  "/api/upload/chunk/:uploadId",
  express.raw({ type: () => true, limit: `${UPLOAD_CHUNK_LIMIT_MB}mb` }),
  async (req, res, next) => {
    try {
      const uploadId = req.params.uploadId;
      const startByte = Number(req.headers["x-start-byte"]);
      const chunk = toChunkBuffer(req.body);
      if (!Number.isFinite(startByte) || startByte < 0) {
        res.status(400).json(safeJson("分片起始位置无效。"));
        return;
      }
      if (!chunk.length) {
        res.status(400).json(safeJson("上传分片为空，请重试。"));
        return;
      }

      const clientIp = normalizeIp(req.socket.remoteAddress || "");

      const result = await updateDb(async (db) => {
        const session = db.sessions[uploadId];
        if (!session) {
          return { status: 404, body: safeJson("上传会话不存在，请重新上传。") };
        }

        if (startByte !== session.uploadedBytes) {
          return {
            status: 409,
            body: safeJson("分片位置不一致，已自动同步上传进度。", {
              uploadedBytes: session.uploadedBytes,
            }),
          };
        }

        if (session.uploadedBytes + chunk.length > session.size) {
          return {
            status: 400,
            body: safeJson("分片大小超过文件总大小，请重新上传。"),
          };
        }

        const tempPath = getTempPath(uploadId);
        await fsp.appendFile(tempPath, chunk);
        session.uploadedBytes += chunk.length;
        session.updatedAt = nowIso();

        if (session.uploadedBytes < session.size) {
          return {
            status: 200,
            body: {
              complete: false,
              uploadId: session.id,
              uploadedBytes: session.uploadedBytes,
              size: session.size,
            },
          };
        }

        const extension = path.extname(session.name);
        const storedName = `${Date.now()}-${createId()}${extension}`;
        const finalPath = getFilePath(storedName);
        await fsp.rename(tempPath, finalPath);
        const file = {
          id: createId(),
          name: session.name,
          storedName,
          size: session.size,
          mimeType: mime.lookup(session.name) || "application/octet-stream",
          uploadedAt: nowIso(),
          sha256: await hashFileSha256(finalPath),
          clientIp,
        };
        db.files.unshift(file);
        db.logs.unshift({
          id: createId(),
          action: "上传",
          fileId: file.id,
          fileName: file.name,
          size: file.size,
          clientIp,
          createdAt: nowIso(),
        });
        if (db.logs.length > 5000) {
          db.logs.length = 5000;
        }
        delete db.sessions[uploadId];
        return {
          status: 200,
          body: {
            complete: true,
            uploadId,
            uploadedBytes: file.size,
            size: file.size,
            file,
          },
        };
      });

      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/files/:id/preview", async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const db = await readDb();
    const file = db.files.find((item) => item.id === fileId);
    if (!file) {
      res.status(404).json(safeJson("文件不存在或已被删除。"));
      return;
    }
    if (!isPreviewable(file)) {
      res.status(415).json(safeJson("当前文件类型暂不支持预览。"));
      return;
    }

    const filePath = getFilePath(file.storedName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json(safeJson("文件不存在或已被删除。"));
      return;
    }

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/files/:id/download", async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const db = await readDb();
    const file = db.files.find((item) => item.id === fileId);
    if (!file) {
      res.status(404).json(safeJson("文件不存在或已被删除。"));
      return;
    }

    const filePath = getFilePath(file.storedName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json(safeJson("文件不存在或已被删除。"));
      return;
    }

    const stat = await fsp.stat(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    let start = 0;
    let end = totalSize - 1;
    let statusCode = 200;

    if (range) {
      const matched = /bytes=(\d*)-(\d*)/.exec(range);
      if (!matched) {
        res.status(416).json(safeJson("下载范围无效。"));
        return;
      }
      start = matched[1] ? Number(matched[1]) : 0;
      end = matched[2] ? Number(matched[2]) : totalSize - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= totalSize || start > end) {
        res.status(416).json(safeJson("下载范围无效。"));
        return;
      }
      statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    }

    const chunkSize = end - start + 1;
    res.status(statusCode);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", chunkSize);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("X-File-Sha256", file.sha256 || "");

    incrementDownload(fileId);
    let settled = false;
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      decrementDownload(fileId);
    };
    res.on("close", settle);
    res.on("finish", settle);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", (error) => {
      settle();
      next(error);
    });
    stream.pipe(res);

    res.on("finish", () => {
      appendLog("下载", {
        fileId: file.id,
        fileName: file.name,
        size: chunkSize,
        clientIp: normalizeIp(req.socket.remoteAddress || ""),
      }).catch(() => undefined);
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/batch-download", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      res.status(400).json(safeJson("请先选择需要下载的文件。"));
      return;
    }

    const db = await readDb();
    const selected = db.files.filter((item) => ids.includes(item.id));
    if (!selected.length) {
      res.status(404).json(safeJson("未找到可下载文件。"));
      return;
    }

    const existing = selected.filter((item) => fs.existsSync(getFilePath(item.storedName)));
    if (!existing.length) {
      res.status(404).json(safeJson("目标文件不存在或已被删除。"));
      return;
    }

    existing.forEach((item) => incrementDownload(item.id));
    let settled = false;
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      existing.forEach((item) => decrementDownload(item.id));
    };

    const zipName = `邻享批量下载-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (error) => {
      settle();
      next(error);
    });

    res.on("close", settle);
    res.on("finish", settle);

    archive.pipe(res);
    for (const file of existing) {
      archive.file(getFilePath(file.storedName), { name: file.name });
    }
    archive.finalize().catch((error) => {
      settle();
      next(error);
    });

    appendLog("批量下载", {
      fileCount: existing.length,
      clientIp: normalizeIp(req.socket.remoteAddress || ""),
    }).catch(() => undefined);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/files/:id", async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const db = await readDb();
    const file = db.files.find((item) => item.id === fileId);
    if (!file) {
      res.status(404).json(safeJson("文件不存在或已被删除。"));
      return;
    }

    if (getDownloadCount(fileId) > 0) {
      res.status(409).json(safeJson("文件正在被下载，暂时无法删除。"));
      return;
    }

    const filePath = getFilePath(file.storedName);
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath);
    }

    await updateDb((nextDb) => {
      nextDb.files = nextDb.files.filter((item) => item.id !== fileId);
      nextDb.logs.unshift({
        id: createId(),
        action: "删除",
        fileId: file.id,
        fileName: file.name,
        size: file.size,
        clientIp: normalizeIp(req.socket.remoteAddress || ""),
        createdAt: nowIso(),
      });
      if (nextDb.logs.length > 5000) {
        nextDb.logs.length = 5000;
      }
      return null;
    });

    res.json(safeJson("文件已删除。"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/batch-delete", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      res.status(400).json(safeJson("请先选择需要删除的文件。"));
      return;
    }

    const db = await readDb();
    const byId = new Map(db.files.map((item) => [item.id, item]));

    const deleted = [];
    const failed = [];
    for (const id of ids) {
      const file = byId.get(id);
      if (!file) {
        failed.push({ id, reason: "文件不存在或已被删除。" });
        continue;
      }
      if (getDownloadCount(id) > 0) {
        failed.push({ id, reason: "文件正在被下载，暂时无法删除。" });
        continue;
      }
      const filePath = getFilePath(file.storedName);
      try {
        if (fs.existsSync(filePath)) {
          await fsp.unlink(filePath);
        }
        deleted.push(file);
      } catch (error) {
        failed.push({ id, reason: "删除失败，请稍后重试。" });
      }
    }

    if (deleted.length) {
      await updateDb((nextDb) => {
        const deletedIds = new Set(deleted.map((item) => item.id));
        nextDb.files = nextDb.files.filter((item) => !deletedIds.has(item.id));
        for (const file of deleted) {
          nextDb.logs.unshift({
            id: createId(),
            action: "删除",
            fileId: file.id,
            fileName: file.name,
            size: file.size,
            clientIp: normalizeIp(req.socket.remoteAddress || ""),
            createdAt: nowIso(),
          });
        }
        if (nextDb.logs.length > 5000) {
          nextDb.logs.length = 5000;
        }
        return null;
      });
    }

    res.json({
      message: deleted.length ? "批量删除完成。" : "未删除任何文件。",
      deletedIds: deleted.map((item) => item.id),
      failed,
    });
  } catch (error) {
    next(error);
  }
});

const PEER_EXPIRY_OPTIONS_MS = new Set([
  1 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  5 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]);

app.post("/api/peer/transfers", async (req, res, next) => {
  try {
    await cleanupExpiredPeerTransfers();
    const clientIp = normalizeIp(req.socket.remoteAddress || "");
    const expireAfterDownload = Boolean(req.body?.expireAfterDownload);
    const requestedMs = Number(req.body?.expiresInMs);
    const expiresInMs = PEER_EXPIRY_OPTIONS_MS.has(requestedMs) ? requestedMs : 3 * 60 * 60 * 1000;
    const requestedCode = String(req.body?.code || "").trim();

    if (requestedCode && !isValidTransferCode(requestedCode)) {
      res.status(400).json(safeJson("传输码需为 1-10 位英文字母或数字。"));
      return;
    }

    const result = await updateDb((db) => {
      const activeForIp = db.peerTransfers.filter((item) => {
        return item.clientIp === clientIp && !isPeerTransferExpired(item);
      });
      let code = requestedCode;
      if (!code) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const candidate = generateTransferCode();
          const used = activeForIp.some((item) => item.code.toLowerCase() === candidate.toLowerCase());
          if (!used) {
            code = candidate;
            break;
          }
        }
      }

      if (!code || !isValidTransferCode(code)) {
        return { status: 500, body: safeJson("传输码生成失败，请重试。") };
      }

      const conflict = activeForIp.some((item) => item.code.toLowerCase() === code.toLowerCase());
      if (conflict) {
        return { status: 409, body: safeJson("该传输码未过期，请更换其他传输码") };
      }

      const transfer = {
        id: createId(),
        code,
        clientIp,
        createdAt: nowIso(),
        expiresAt: expireAfterDownload ? null : new Date(Date.now() + expiresInMs).toISOString(),
        expireAfterDownload,
        files: [],
      };
      db.peerTransfers.unshift(transfer);
      return { status: 200, body: { transfer: serializePeerTransfer(transfer) } };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.post("/api/peer/transfers/:transferId/upload/init", async (req, res, next) => {
  try {
    await cleanupExpiredPeerTransfers();
    const transferId = req.params.transferId;
    const incomingName = sanitizeFileName(req.body?.name);
    const size = Number(req.body?.size);
    const lastModified = Number(req.body?.lastModified || 0);
    const clientIp = normalizeIp(req.socket.remoteAddress || "");

    if (!Number.isFinite(size) || size < 0) {
      res.status(400).json(safeJson("文件大小无效，请重新选择文件。"));
      return;
    }

    const result = await updateDb(async (db) => {
      const transfer = db.peerTransfers.find((item) => item.id === transferId && item.clientIp === clientIp);
      if (!transfer) {
        return { status: 404, body: safeJson("传输任务不存在或已过期。") };
      }
      if (isPeerTransferExpired(transfer)) {
        return { status: 410, body: safeJson("传输码已过期或不存在") };
      }

      if (size === 0) {
        const extension = path.extname(incomingName);
        const storedName = `${Date.now()}-${createId()}${extension}`;
        const storedPath = getPeerFilePath(storedName);
        await fsp.writeFile(storedPath, Buffer.alloc(0));
        const file = {
          id: createId(),
          name: incomingName,
          storedName,
          size: 0,
          mimeType: mime.lookup(incomingName) || "application/octet-stream",
          uploadedAt: nowIso(),
          sha256: await hashFileSha256(storedPath),
          clientIp,
        };
        transfer.files.push(file);
        return {
          status: 200,
          body: {
            uploadId: null,
            uploadedBytes: 0,
            complete: true,
            file,
            transfer: serializePeerTransfer(transfer),
          },
        };
      }

      const sessionId = createId();
      const session = {
        id: sessionId,
        transferId,
        name: incomingName,
        size,
        uploadedBytes: 0,
        lastModified,
        clientIp,
        fingerprint: buildFingerprint({ name: incomingName, size, lastModified, clientIp }),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.peerSessions[sessionId] = session;
      await fsp.writeFile(getPeerTempPath(sessionId), Buffer.alloc(0), { flag: "a" });
      return {
        status: 200,
        body: {
          uploadId: session.id,
          uploadedBytes: 0,
          complete: false,
          chunkLimitBytes: UPLOAD_CHUNK_LIMIT_MB * 1024 * 1024,
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.put(
  "/api/peer/upload/chunk/:uploadId",
  express.raw({ type: () => true, limit: `${UPLOAD_CHUNK_LIMIT_MB}mb` }),
  async (req, res, next) => {
    try {
      const uploadId = req.params.uploadId;
      const startByte = Number(req.headers["x-start-byte"]);
      const chunk = toChunkBuffer(req.body);
      const clientIp = normalizeIp(req.socket.remoteAddress || "");

      if (!Number.isFinite(startByte) || startByte < 0 || !chunk.length) {
        res.status(400).json(safeJson("上传分片无效，请重试。"));
        return;
      }

      const result = await updateDb(async (db) => {
        const session = db.peerSessions[uploadId];
        if (!session || session.clientIp !== clientIp) {
          return { status: 404, body: safeJson("上传任务不存在或已过期。") };
        }
        const transfer = db.peerTransfers.find((item) => item.id === session.transferId && item.clientIp === clientIp);
        if (!transfer || isPeerTransferExpired(transfer)) {
          delete db.peerSessions[uploadId];
          return { status: 410, body: safeJson("传输码已过期或不存在") };
        }
        if (startByte !== session.uploadedBytes) {
          return {
            status: 409,
            body: safeJson("分片位置不一致，已自动同步上传进度。", {
              uploadedBytes: session.uploadedBytes,
            }),
          };
        }
        if (session.uploadedBytes + chunk.length > session.size) {
          return { status: 400, body: safeJson("分片大小超过文件总大小，请重新上传。") };
        }

        const tempPath = getPeerTempPath(uploadId);
        await fsp.appendFile(tempPath, chunk);
        session.uploadedBytes += chunk.length;
        session.updatedAt = nowIso();

        if (session.uploadedBytes < session.size) {
          return {
            status: 200,
            body: {
              complete: false,
              uploadId: session.id,
              uploadedBytes: session.uploadedBytes,
              size: session.size,
            },
          };
        }

        const extension = path.extname(session.name);
        const storedName = `${Date.now()}-${createId()}${extension}`;
        const finalPath = getPeerFilePath(storedName);
        await fsp.rename(tempPath, finalPath);
        const file = {
          id: createId(),
          name: session.name,
          storedName,
          size: session.size,
          mimeType: mime.lookup(session.name) || "application/octet-stream",
          uploadedAt: nowIso(),
          sha256: await hashFileSha256(finalPath),
          clientIp: session.clientIp,
        };
        transfer.files.push(file);
        delete db.peerSessions[uploadId];
        return {
          status: 200,
          body: {
            complete: true,
            uploadId,
            uploadedBytes: file.size,
            size: file.size,
            file,
            transfer: serializePeerTransfer(transfer),
          },
        };
      });

      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  },
);

app.delete("/api/peer/upload/session/:uploadId", async (req, res, next) => {
  try {
    const uploadId = req.params.uploadId;
    const clientIp = normalizeIp(req.socket.remoteAddress || "");
    await updateDb((db) => {
      const session = db.peerSessions[uploadId];
      if (session && session.clientIp === clientIp) {
        delete db.peerSessions[uploadId];
      }
      return null;
    });
    const tempPath = getPeerTempPath(uploadId);
    if (fs.existsSync(tempPath)) {
      await fsp.unlink(tempPath);
    }
    res.json(safeJson("上传任务已取消。"));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/peer/transfers/:transferId/files/:fileId", async (req, res, next) => {
  try {
    const clientIp = normalizeIp(req.socket.remoteAddress || "");
    const filesToDelete = [];
    const result = await updateDb((db) => {
      const transfer = db.peerTransfers.find((item) => item.id === req.params.transferId && item.clientIp === clientIp);
      if (!transfer) {
        return { status: 404, body: safeJson("传输任务不存在或已过期。") };
      }
      const file = (transfer.files || []).find((item) => item.id === req.params.fileId);
      if (!file) {
        return { status: 404, body: safeJson("文件不存在或已删除。") };
      }
      filesToDelete.push(file);
      transfer.files = transfer.files.filter((item) => item.id !== req.params.fileId);
      return { status: 200, body: safeJson("文件已移除。", { transfer: serializePeerTransfer(transfer) }) };
    });
    await deletePeerFiles(filesToDelete);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/peer/resolve/:code", async (req, res, next) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!isValidTransferCode(code)) {
      res.status(404).json(safeJson("传输码不存在，请检查输入"));
      return;
    }

    const db = await readDb();
    const transfer = db.peerTransfers.find((item) => item.code.toLowerCase() === code.toLowerCase());
    if (!transfer) {
      res.status(404).json(safeJson("传输码不存在，请检查输入"));
      return;
    }
    if (isPeerTransferExpired(transfer)) {
      await cleanupExpiredPeerTransfers();
      res.status(410).json(safeJson("传输码已过期或不存在"));
      return;
    }
    res.json({ transfer: serializePeerTransfer(transfer) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/peer/download/:code/:fileId", async (req, res, next) => {
  try {
    const code = String(req.params.code || "").trim();
    const db = await readDb();
    const transfer = db.peerTransfers.find((item) => item.code.toLowerCase() === code.toLowerCase());
    if (!transfer || isPeerTransferExpired(transfer)) {
      if (transfer) {
        await cleanupExpiredPeerTransfers();
      }
      res.status(410).json(safeJson("传输码已过期或不存在"));
      return;
    }

    const file = (transfer.files || []).find((item) => item.id === req.params.fileId);
    if (!file) {
      res.status(404).json(safeJson("文件不存在或已删除。"));
      return;
    }

    const filePath = getPeerFilePath(file.storedName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json(safeJson("文件不存在或已删除。"));
      return;
    }

    const stat = await fsp.stat(filePath);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader("X-File-Sha256", file.sha256 || "");

    res.on("finish", () => {
      appendLog("对端下载", {
        fileId: file.id,
        fileName: file.name,
        size: file.size,
        clientIp: normalizeIp(req.socket.remoteAddress || ""),
      }).catch(() => undefined);

      if (!transfer.expireAfterDownload) {
        return;
      }
      const filesToDelete = [...(transfer.files || [])];
      updateDb((nextDb) => {
        nextDb.peerTransfers = nextDb.peerTransfers.filter((item) => item.id !== transfer.id);
        return null;
      })
        .then(() => deletePeerFiles(filesToDelete))
        .catch(() => undefined);
    });

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(PUBLIC_DIR));

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, req, res, next) => {
  const message = error?.message || "系统异常，请稍后重试。";
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json(safeJson(message));
});

function startServer(port, attemptsLeft = PORT_RETRY_LIMIT) {
  const server = app.listen(port, HOST, () => {
    activePort = port;
    const ips = getLanIPv4List();
    const first = ips[0];
    console.log(`\n${APP_NAME} 已启动`);
    console.log(`本机访问: http://127.0.0.1:${activePort}`);
    console.log(`内网访问: http://${first}:${activePort}`);
    if (ips.length > 1) {
      for (const ip of ips.slice(1)) {
        console.log(`备用地址: http://${ip}:${activePort}`);
      }
    }
    console.log("提示: 请确保访问设备与当前主机处于同一内部网络。\n");
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`端口 ${port} 已被占用，正在尝试 ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }
    if (error && error.code === "EACCES") {
      console.error(`端口 ${port} 需要管理员权限，请在配置中改用 5832 或其他未占用的高位端口。`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}

startServer(DEFAULT_PORT);
