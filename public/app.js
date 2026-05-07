const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const REFRESH_INTERVAL = 5000;
const TASK_CLOSE_DELAY = 1200;
const FOUR_HOURS = 4;

const TransferUI = window.TransferUI || {
  formatBytes: (bytes) => `${Number(bytes || 0)} B`,
  classifyFileType: () => "other",
  isUploadedWithinHours: () => false,
  isValidTransferCode: (code) => /^[A-Za-z0-9]{1,10}$/.test(String(code || "")),
  randomProgressSkin: () => "plain",
};

const state = {
  view: "transfer",
  accessAddress: "",
  knownFiles: [],
  knownTotal: 0,
  selectedFiles: new Set(),
  uploadTasks: new Map(),
  confirmResolver: null,
  searchTimer: null,
  refreshTimer: null,
  settings: {
    autoSync: true,
    theme: "light",
    defaultUploadPath: "",
    chunkSizeMb: 16,
    notifications: true,
  },
  shared: {
    files: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    search: "",
    timeRange: "all",
    type: "all",
    sortBy: "uploadedAt",
    sortOrder: "desc",
    start: "",
    end: "",
  },
  peerUpload: null,
  peerReceive: null,
};

const el = {
  pageTitle: document.getElementById("pageTitle"),
  accessAddress: document.getElementById("accessAddress"),
  copyAddressBtn: document.getElementById("copyAddressBtn"),
  dropZone: document.getElementById("dropZone"),
  dropTip: document.getElementById("dropTip"),
  pickFilesBtn: document.getElementById("pickFilesBtn"),
  fileInput: document.getElementById("fileInput"),
  resumeUploadSwitch: document.getElementById("resumeUploadSwitch"),
  uploadQueue: document.getElementById("uploadQueue"),
  recentFileList: document.getElementById("recentFileList"),
  recentEmptyState: document.getElementById("recentEmptyState"),
  searchInput: document.getElementById("searchInput"),
  timeRangeSelect: document.getElementById("timeRangeSelect"),
  typeSelect: document.getElementById("typeSelect"),
  sortBySelect: document.getElementById("sortBySelect"),
  sortOrderSelect: document.getElementById("sortOrderSelect"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  customRange: document.getElementById("customRange"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  sharedFileTable: document.getElementById("sharedFileTable"),
  sharedEmptyState: document.getElementById("sharedEmptyState"),
  selectPageCheckbox: document.getElementById("selectPageCheckbox"),
  selectedCount: document.getElementById("selectedCount"),
  batchDownloadBtn: document.getElementById("batchDownloadBtn"),
  batchDeleteBtn: document.getElementById("batchDeleteBtn"),
  paginationInfo: document.getElementById("paginationInfo"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  fileCountStat: document.getElementById("fileCountStat"),
  storageUsedStat: document.getElementById("storageUsedStat"),
  activeTaskStat: document.getElementById("activeTaskStat"),
  lastSyncStat: document.getElementById("lastSyncStat"),
  openPeerUpload: document.getElementById("openPeerUpload"),
  openPeerReceive: document.getElementById("openPeerReceive"),
  peerUploadModal: document.getElementById("peerUploadModal"),
  peerUploadBody: document.getElementById("peerUploadBody"),
  closePeerUploadBtn: document.getElementById("closePeerUploadBtn"),
  peerReceiveModal: document.getElementById("peerReceiveModal"),
  peerReceiveBody: document.getElementById("peerReceiveBody"),
  closePeerReceiveBtn: document.getElementById("closePeerReceiveBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  autoSyncSwitch: document.getElementById("autoSyncSwitch"),
  themeSelect: document.getElementById("themeSelect"),
  defaultUploadPathInput: document.getElementById("defaultUploadPathInput"),
  chunkSizeInput: document.getElementById("chunkSizeInput"),
  notificationsSwitch: document.getElementById("notificationsSwitch"),
  confirmModal: document.getElementById("confirmModal"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
  toastContainer: document.getElementById("toastContainer"),
  mobilePageTitle: document.getElementById("mobilePageTitle"),
  mobileAccessAddress: document.getElementById("mobileAccessAddress"),
  mobilePickFilesBtn: document.getElementById("mobilePickFilesBtn"),
  mobileFileInput: document.getElementById("mobileFileInput"),
  mobileUploadQueue: document.getElementById("mobileUploadQueue"),
  mobileRecentFileList: document.getElementById("mobileRecentFileList"),
  mobileRecentEmptyState: document.getElementById("mobileRecentEmptyState"),
  mobileFileCountStat: document.getElementById("mobileFileCountStat"),
  mobileStorageUsedStat: document.getElementById("mobileStorageUsedStat"),
  mobileActiveTaskStat: document.getElementById("mobileActiveTaskStat"),
  mobileLastSyncStat: document.getElementById("mobileLastSyncStat"),
  mobileSearchInput: document.getElementById("mobileSearchInput"),
  mobileTypeSelect: document.getElementById("mobileTypeSelect"),
  mobileSortSelect: document.getElementById("mobileSortSelect"),
  mobileSharedFileList: document.getElementById("mobileSharedFileList"),
  mobileSharedEmptyState: document.getElementById("mobileSharedEmptyState"),
  mobilePaginationInfo: document.getElementById("mobilePaginationInfo"),
  mobilePrevPageBtn: document.getElementById("mobilePrevPageBtn"),
  mobileNextPageBtn: document.getElementById("mobileNextPageBtn"),
  mobileOpenPeerUpload: document.getElementById("mobileOpenPeerUpload"),
  mobileOpenPeerReceive: document.getElementById("mobileOpenPeerReceive"),
};

const iconMap = {
  network: '<rect x="16" y="16" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><path d="M12 8v4.2M5.5 16v-2.2h13V16"/>',
  "layout-dashboard": '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v6A3.5 3.5 0 0 1 17.5 19h-11A3.5 3.5 0 0 1 3 15.5z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.62V21a2 2 0 0 1-4 0v-.09a1.8 1.8 0 0 0-1-1.62 1.8 1.8 0 0 0-2 .36l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.62-1H3a2 2 0 0 1 0-4h.09a1.8 1.8 0 0 0 1.62-1 1.8 1.8 0 0 0-.36-2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 2 .36h.08A1.8 1.8 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.8 1.8 0 0 0 1 1.62 1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2v.08A1.8 1.8 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z"/>',
  "radio-tower": '<path d="M12 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M8.2 4.2a6 6 0 0 0 0 8.6M15.8 4.2a6 6 0 0 1 0 8.6M5.4 1.8a10 10 0 0 0 0 13.4M18.6 1.8a10 10 0 0 1 0 13.4M12 10.5V22"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16.5V6a2 2 0 0 1 2-2h10.5"/>',
  files: '<path d="M7 7.5V5a2 2 0 0 1 2-2h6l4 4v9a2 2 0 0 1-2 2h-2.5"/><path d="M14 3.5V8h4.5"/><rect x="4" y="10" width="10" height="11" rx="2"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
  activity: '<path d="M3 12h4l2.4-6 5.2 12 2.4-6h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  "cloud-upload": '<path d="M17.5 18H18a4 4 0 0 0 0-8 6.2 6.2 0 0 0-11.8 1.9A3.8 3.8 0 0 0 7 19h1"/><path d="M12 19V9.5M8.7 12.8 12 9.5l3.3 3.3"/>',
  "upload-cloud": '<path d="M17.5 18H18a4 4 0 0 0 0-8 6.2 6.2 0 0 0-11.8 1.9A3.8 3.8 0 0 0 7 19h1"/><path d="M12 19V9.5M8.7 12.8 12 9.5l3.3 3.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  archive: '<path d="M4 7h16M5 7l1.2 13h11.6L19 7M7 3h10l2 4H5z"/><path d="M10 11h4"/>',
  "trash-2": '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
  "folder-open": '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H9l2 2h8.5a1.5 1.5 0 0 1 1.4 2.05L18.6 18a3 3 0 0 1-2.8 2H5.3a2 2 0 0 1-1.9-2.6L6 10h15"/>',
  "triangle-alert": '<path d="m12 3 10 18H2z"/><path d="M12 9v5M12 18h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 12 7-12 7z"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4.4 7.7 12 12l7.6-4.3M12 21v-9M8 5.2l8 4.6"/>',
  "file-text": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m7 17 4.2-4.2 2.8 2.8 1.6-1.6L20 18"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  "file-video": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h5v4H8zM13 14l3-1.5v6L13 17"/>',
  "file-audio": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M10 16.5a1.8 1.8 0 1 1-1.8-1.8H10V11l5-1v5.5a1.8 1.8 0 1 1-1.8-1.8H15"/>',
  "file-pdf": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 16h2a2 2 0 0 0 0-4H8v6M13 12v6h1.6a3 3 0 0 0 0-6zM18 12h-2v6"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  "hard-drive": '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h.01M11 14h6"/>',
};

function renderIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach((node) => {
    const name = node.getAttribute("data-icon") || "file";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = iconMap[name] || iconMap.file;
    node.replaceWith(svg);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  return TransferUI.formatBytes(bytes);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryLabel(category) {
  const labels = {
    image: "图片",
    document: "文档",
    archive: "压缩包",
    video: "视频",
    audio: "音频",
    other: "其他",
  };
  return labels[category] || "其他";
}

function fileVisual(file) {
  const category = file.category || TransferUI.classifyFileType(file);
  const name = String(file?.name || "");
  const extMatch = name.match(/\.([a-z0-9]{1,8})$/i);
  const label = extMatch ? extMatch[1].toUpperCase() : "FILE";
  if (category === "image") {
    return { icon: "image", tone: "image", label };
  }
  if (category === "archive") {
    return { icon: "package", tone: "archive", label };
  }
  if (category === "video") {
    return { icon: "file-video", tone: "video", label };
  }
  if (category === "audio") {
    return { icon: "file-audio", tone: "audio", label };
  }
  if (/\.pdf$/i.test(name)) {
    return { icon: "file-pdf", tone: "pdf", label: "PDF" };
  }
  if (category === "document") {
    return { icon: "file-text", tone: "document", label };
  }
  return { icon: "file", tone: "binary", label };
}

function updateStats() {
  const fileCountText = `${state.knownTotal} 项`;
  el.fileCountStat.textContent = fileCountText;
  const totalSize = state.knownFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const storageText = formatBytes(totalSize);
  el.storageUsedStat.textContent = storageText;
  const activeUploads = Array.from(state.uploadTasks.values()).filter((task) => !["已完成", "已取消"].includes(task.status)).length;
  const activeText = String(activeUploads);
  const syncText = shortTime();
  el.activeTaskStat.textContent = activeText;
  el.lastSyncStat.textContent = syncText;
  if (el.mobileFileCountStat) {
    el.mobileFileCountStat.textContent = fileCountText;
  }
  if (el.mobileStorageUsedStat) {
    el.mobileStorageUsedStat.textContent = storageText;
  }
  if (el.mobileActiveTaskStat) {
    el.mobileActiveTaskStat.textContent = activeText;
  }
  if (el.mobileLastSyncStat) {
    el.mobileLastSyncStat.textContent = syncText;
  }
}

function showToast(message, duration = 2600) {
  if (!state.settings.notifications && duration !== 0) {
    return;
  }
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  el.toastContainer.appendChild(node);
  const removeToast = () => {
    if (!node.isConnected || node.classList.contains("is-leaving")) {
      return;
    }
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 180);
  };
  node.addEventListener("click", removeToast);
  if (duration > 0) {
    window.setTimeout(removeToast, duration);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = isJson ? data?.message : String(data || "");
    throw new Error(message || "请求失败，请稍后重试。");
  }
  return data;
}

function openConfirm(message) {
  el.confirmMessage.textContent = message;
  el.confirmModal.classList.remove("hidden");
  el.confirmModal.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => el.confirmOkBtn.focus());
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  el.confirmModal.classList.add("hidden");
  el.confirmModal.setAttribute("aria-hidden", "true");
  if (state.confirmResolver) {
    state.confirmResolver(Boolean(result));
    state.confirmResolver = null;
  }
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function downloadBlob(url, fileName, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "下载失败，请稍后重试。");
  }
  const blob = await response.blob();
  triggerDownload(blob, fileName);
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function normalizeMobileView(view) {
  if (isMobileLayout() && view === "settings") {
    return "transfer";
  }
  return view;
}

function setView(view) {
  view = normalizeMobileView(view);
  state.view = view;
  document.body.dataset.view = view;
  const titles = {
    transfer: "文件共享中心",
    shared: "共享空间",
    peer: "对端互传",
    settings: "设置中心",
  };
  const mobileTitles = {
    transfer: "传输台",
    shared: "共享空间",
    peer: "对端互传",
  };
  el.pageTitle.textContent = titles[view] || "文件共享中心";
  if (el.mobilePageTitle) {
    el.mobilePageTitle.textContent = mobileTitles[view] || "传输台";
  }
  document.querySelectorAll("[data-view-target]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.viewTarget === view);
  });
  document.querySelectorAll("[data-mobile-view-target]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.mobileViewTarget === view);
  });
  document.querySelectorAll(".view-panel").forEach((node) => {
    node.classList.toggle("is-active", node.id === `${view}View`);
  });
  document.querySelectorAll(".mobile-view-panel").forEach((node) => {
    node.classList.toggle("is-active", node.id === `mobile${view[0].toUpperCase()}${view.slice(1)}View`);
  });
  if (location.hash.replace("#", "") !== view) {
    history.replaceState(null, "", `#${view}`);
  }
  if (view === "shared") {
    loadSharedFiles().catch((error) => showToast(error.message));
  }
  if (view === "transfer") {
    loadRecentFiles().catch((error) => showToast(error.message));
  }
}

async function loadSystemInfo() {
  try {
    const data = await requestJson("/api/system/info");
    state.accessAddress = data.accessAddress || "";
    el.accessAddress.textContent = state.accessAddress || "无法获取访问地址";
    if (el.mobileAccessAddress) {
      el.mobileAccessAddress.textContent = state.accessAddress || "无法获取访问地址";
    }
  } catch (error) {
    el.accessAddress.textContent = "无法获取访问地址";
    if (el.mobileAccessAddress) {
      el.mobileAccessAddress.textContent = "无法获取访问地址";
    }
  }
}

function resolveTheme(theme) {
  return "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

async function loadSettings() {
  try {
    const data = await requestJson("/api/settings");
    state.settings = { ...state.settings, ...(data.settings || {}) };
  } catch (error) {
    showToast("设置加载失败，已使用默认配置");
  }
  el.autoSyncSwitch.checked = Boolean(state.settings.autoSync);
  el.themeSelect.value = ["light", "system"].includes(state.settings.theme) ? state.settings.theme : "light";
  el.defaultUploadPathInput.value = state.settings.defaultUploadPath || "";
  el.chunkSizeInput.value = Number(state.settings.chunkSizeMb || 16);
  el.notificationsSwitch.checked = Boolean(state.settings.notifications);
  applyTheme(state.settings.theme);
}

async function saveSettings() {
  const nextSettings = {
    autoSync: el.autoSyncSwitch.checked,
    theme: el.themeSelect.value,
    defaultUploadPath: el.defaultUploadPathInput.value.trim(),
    chunkSizeMb: Number(el.chunkSizeInput.value || 16),
    notifications: el.notificationsSwitch.checked,
  };
  const data = await requestJson("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nextSettings),
  });
  state.settings = { ...state.settings, ...(data.settings || {}) };
  applyTheme(state.settings.theme);
  showToast("设置已保存");
}

async function loadRecentFiles() {
  const data = await requestJson("/api/files?sortBy=uploadedAt&sortOrder=desc&pageSize=200");
  state.knownFiles = data.files || [];
  state.knownTotal = Number(data.total || state.knownFiles.length);
  renderRecentFiles();
  updateStats();
}

function renderRecentFiles() {
  const recent = state.knownFiles.filter((file) => TransferUI.isUploadedWithinHours(file.uploadedAt, FOUR_HOURS));
  el.recentEmptyState.classList.toggle("show", recent.length === 0);
  el.recentFileList.innerHTML = recent.map((file) => renderFileCard(file)).join("");
  renderIcons(el.recentFileList);
  if (el.mobileRecentEmptyState && el.mobileRecentFileList) {
    el.mobileRecentEmptyState.classList.toggle("show", recent.length === 0);
    el.mobileRecentFileList.innerHTML = recent.map((file) => renderFileCard(file)).join("");
    renderIcons(el.mobileRecentFileList);
  }
}

function renderFileCard(file) {
  const visual = fileVisual(file);
  const disabled = file.isDownloading ? "disabled" : "";
  return `
    <article class="file-item" data-file-id="${escapeHtml(file.id)}">
      <div class="file-icon ${visual.tone}">
        <i data-icon="${visual.icon}"></i>
        <span class="file-ext">${escapeHtml(visual.label)}</span>
      </div>
      <div class="file-meta">
        <p class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</p>
        <p class="file-subline">
          <span><i data-icon="hard-drive"></i>${formatBytes(file.size)}</span>
          <span><i data-icon="calendar"></i>${formatDate(file.uploadedAt)}</span>
          ${file.isDownloading ? "<span>正在下载</span>" : ""}
        </p>
      </div>
      <div class="file-actions">
        <button class="action-btn primary" data-action="download-file" data-file-id="${escapeHtml(file.id)}" type="button" ${disabled}>
          <i data-icon="download"></i>
          <span>下载</span>
        </button>
        <button class="action-btn delete" data-action="delete-file" data-file-id="${escapeHtml(file.id)}" type="button" ${disabled}>
          <i data-icon="trash-2"></i>
          <span>删除</span>
        </button>
      </div>
    </article>
  `;
}

function syncSharedFiltersFromInputs() {
  if (isMobileLayout() && el.mobileSearchInput && el.mobileTypeSelect && el.mobileSortSelect) {
    const [sortBy = "uploadedAt", sortOrder = "desc"] = el.mobileSortSelect.value.split(":");
    state.shared.search = el.mobileSearchInput.value.trim();
    state.shared.timeRange = "all";
    state.shared.type = el.mobileTypeSelect.value;
    state.shared.sortBy = sortBy;
    state.shared.sortOrder = sortOrder;
    state.shared.pageSize = 10;
    state.shared.start = "";
    state.shared.end = "";
    el.customRange.classList.add("hidden");
    return;
  }
  state.shared.search = el.searchInput.value.trim();
  state.shared.timeRange = el.timeRangeSelect.value;
  state.shared.type = el.typeSelect.value;
  state.shared.sortBy = el.sortBySelect.value;
  state.shared.sortOrder = el.sortOrderSelect.value;
  state.shared.pageSize = Number(el.pageSizeSelect.value || 10);
  state.shared.start = el.startDateInput.value;
  state.shared.end = el.endDateInput.value;
  el.customRange.classList.toggle("hidden", state.shared.timeRange !== "custom");
}

async function loadSharedFiles() {
  syncSharedFiltersFromInputs();
  const query = new URLSearchParams({
    search: state.shared.search,
    timeRange: state.shared.timeRange,
    type: state.shared.type,
    sortBy: state.shared.sortBy,
    sortOrder: state.shared.sortOrder,
    page: String(state.shared.page),
    pageSize: String(state.shared.pageSize),
  });
  if (state.shared.timeRange === "custom") {
    if (state.shared.start) {
      query.set("start", state.shared.start);
    }
    if (state.shared.end) {
      query.set("end", state.shared.end);
    }
  }
  const data = await requestJson(`/api/files?${query.toString()}`);
  state.shared.files = data.files || [];
  state.shared.total = Number(data.total || 0);
  state.shared.page = Number(data.page || 1);
  state.shared.pageSize = Number(data.pageSize || state.shared.pageSize);
  state.shared.totalPages = Number(data.totalPages || 1);
  cleanSelection();
  renderSharedFiles();
  updateStats();
}

function cleanSelection() {
  const knownIds = new Set([...state.knownFiles.map((file) => file.id), ...state.shared.files.map((file) => file.id)]);
  for (const id of Array.from(state.selectedFiles)) {
    if (!knownIds.has(id)) {
      state.selectedFiles.delete(id);
    }
  }
}

function renderSharedFiles() {
  el.sharedEmptyState.classList.toggle("show", state.shared.files.length === 0);
  el.sharedFileTable.innerHTML = state.shared.files
    .map((file) => {
      const visual = fileVisual(file);
      const checked = state.selectedFiles.has(file.id) ? "checked" : "";
      const disabled = file.isDownloading ? "disabled" : "";
      return `
        <tr data-file-id="${escapeHtml(file.id)}">
          <td class="check-cell">
            <input class="file-select" data-file-id="${escapeHtml(file.id)}" type="checkbox" ${checked} aria-label="选择 ${escapeHtml(file.name)}" />
          </td>
          <td>
            <div class="file-name-cell">
              <div class="file-icon ${visual.tone}">
                <i data-icon="${visual.icon}"></i>
                <span class="file-ext">${escapeHtml(visual.label)}</span>
              </div>
              <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            </div>
          </td>
          <td>${categoryLabel(file.category || TransferUI.classifyFileType(file))}</td>
          <td>${formatBytes(file.size)}</td>
          <td>${formatDate(file.uploadedAt)}</td>
          <td>
            <div class="file-actions">
              <button class="action-btn primary" data-action="download-file" data-file-id="${escapeHtml(file.id)}" type="button" ${disabled}>
                <i data-icon="download"></i>
                <span>下载</span>
              </button>
              <button class="action-btn delete" data-action="delete-file" data-file-id="${escapeHtml(file.id)}" type="button" ${disabled}>
                <i data-icon="trash-2"></i>
                <span>删除</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  updateSelectionControls();
  renderIcons(el.sharedFileTable);
  if (el.mobileSharedEmptyState && el.mobileSharedFileList) {
    el.mobileSharedEmptyState.classList.toggle("show", state.shared.files.length === 0);
    el.mobileSharedFileList.innerHTML = state.shared.files.map((file) => renderFileCard(file)).join("");
    renderIcons(el.mobileSharedFileList);
  }
}

function updateSelectionControls() {
  el.selectedCount.textContent = `已选择 ${state.selectedFiles.size} 项`;
  el.batchDownloadBtn.disabled = state.selectedFiles.size === 0;
  el.batchDeleteBtn.disabled = state.selectedFiles.size === 0;
  const pageIds = state.shared.files.map((file) => file.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => state.selectedFiles.has(id));
  el.selectPageCheckbox.checked = allChecked;
  el.selectPageCheckbox.indeterminate = !allChecked && pageIds.some((id) => state.selectedFiles.has(id));
  el.paginationInfo.textContent = `第 ${state.shared.page} / ${state.shared.totalPages} 页，共 ${state.shared.total} 项`;
  el.prevPageBtn.disabled = state.shared.page <= 1;
  el.nextPageBtn.disabled = state.shared.page >= state.shared.totalPages;
  if (el.mobilePaginationInfo) {
    el.mobilePaginationInfo.textContent = `${state.shared.page} / ${state.shared.totalPages} 页，共 ${state.shared.total} 项`;
  }
  if (el.mobilePrevPageBtn) {
    el.mobilePrevPageBtn.disabled = state.shared.page <= 1;
  }
  if (el.mobileNextPageBtn) {
    el.mobileNextPageBtn.disabled = state.shared.page >= state.shared.totalPages;
  }
}

function renderUploadTasks() {
  const tasks = Array.from(state.uploadTasks.values());
  const taskHtml = tasks
    .map((task) => {
      const total = task.totalSize || 1;
      const current = Math.max(task.uploadedBytes, task.visualBytes);
      const percent = Math.min(100, Math.floor((current / total) * 100));
      const statusClass = task.status === "已完成" ? "success" : task.status === "失败" ? "error" : task.status === "已暂停" ? "warning" : "";
      return `
        <article class="task-item" data-task-id="${escapeHtml(task.id)}">
          <div class="task-line">
            <p class="task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</p>
            <p class="task-status ${statusClass}">${escapeHtml(task.status)} · ${percent}%</p>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
          <div class="task-line">
            <p class="task-status">${formatBytes(current)} / ${formatBytes(task.totalSize)}</p>
            <p class="task-status error">${escapeHtml(task.error || "")}</p>
          </div>
          <div class="task-actions">${renderUploadTaskActions(task)}</div>
        </article>
      `;
    })
    .join("");
  el.uploadQueue.innerHTML = taskHtml;
  renderIcons(el.uploadQueue);
  if (el.mobileUploadQueue) {
    el.mobileUploadQueue.innerHTML = taskHtml;
    renderIcons(el.mobileUploadQueue);
  }
  updateStats();
}

function renderUploadTaskActions(task) {
  if (task.status === "已完成") {
    return '<span class="task-status success"><i data-icon="check"></i> 上传完成</span>';
  }
  const removeButton = `<button class="mini-btn" data-upload-action="remove" data-task-id="${escapeHtml(task.id)}" type="button"><i data-icon="x"></i>移除</button>`;
  if (task.status === "上传中") {
    return `<button class="mini-btn" data-upload-action="pause" data-task-id="${escapeHtml(task.id)}" type="button"><i data-icon="pause"></i>暂停</button>${removeButton}`;
  }
  if (task.status === "已暂停") {
    return `<button class="mini-btn" data-upload-action="resume" data-task-id="${escapeHtml(task.id)}" type="button"><i data-icon="play"></i>继续</button>${removeButton}`;
  }
  if (task.status === "失败") {
    return `<button class="mini-btn" data-upload-action="retry" data-task-id="${escapeHtml(task.id)}" type="button"><i data-icon="rotate-ccw"></i>重试</button>${removeButton}`;
  }
  return removeButton;
}

function handleUploadFiles(files) {
  if (!files.length) {
    return;
  }
  for (const file of files) {
    const task = {
      id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      name: file.name,
      totalSize: file.size,
      uploadId: null,
      uploadedBytes: 0,
      visualBytes: 0,
      status: "等待上传",
      error: "",
      xhr: null,
      working: false,
      closeTimer: null,
    };
    state.uploadTasks.set(task.id, task);
    executeUpload(task);
  }
  renderUploadTasks();
}

async function executeUpload(task) {
  if (task.working || task.status === "已完成") {
    return;
  }
  task.working = true;
  task.status = "上传中";
  task.error = "";
  renderUploadTasks();
  try {
    if (!task.uploadId) {
      const initData = await requestJson("/api/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: task.name,
          size: task.totalSize,
          lastModified: task.file.lastModified || 0,
        }),
      });
      if (initData.complete && initData.file) {
        finishUploadTask(task);
        return;
      }
      task.uploadId = initData.uploadId;
      task.uploadedBytes = Number(initData.uploadedBytes || 0);
      task.visualBytes = task.uploadedBytes;
    }

    while (task.uploadedBytes < task.totalSize) {
      if (task.status !== "上传中") {
        task.working = false;
        renderUploadTasks();
        return;
      }
      const end = Math.min(task.uploadedBytes + DEFAULT_CHUNK_SIZE, task.totalSize);
      const chunk = task.file.slice(task.uploadedBytes, end);
      const data = await sendUploadChunk(task, chunk);
      if (!data) {
        task.working = false;
        renderUploadTasks();
        return;
      }
      if (data.complete && data.file) {
        finishUploadTask(task);
        return;
      }
      task.uploadedBytes = Number(data.uploadedBytes || task.uploadedBytes);
      task.visualBytes = task.uploadedBytes;
      renderUploadTasks();
    }
  } catch (error) {
    task.status = "失败";
    task.error = error.message || "上传失败";
    task.working = false;
    renderUploadTasks();
    showToast(`${task.name} 上传失败`);
  }
}

function sendUploadChunk(task, chunk) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    task.xhr = xhr;
    xhr.open("PUT", `/api/upload/chunk/${encodeURIComponent(task.uploadId)}`);
    xhr.responseType = "json";
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-start-byte", String(task.uploadedBytes));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        task.visualBytes = task.uploadedBytes + event.loaded;
        renderUploadTasks();
      }
    };
    xhr.onerror = () => {
      task.xhr = null;
      if (task.status === "已暂停") {
        resolve(null);
        return;
      }
      reject(new Error("网络中断，请重试上传。"));
    };
    xhr.onabort = () => {
      task.xhr = null;
      resolve(null);
    };
    xhr.onload = () => {
      task.xhr = null;
      const payload = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      if (xhr.status === 409 && Number.isFinite(Number(payload?.uploadedBytes))) {
        resolve({ complete: false, uploadedBytes: Number(payload.uploadedBytes) });
        return;
      }
      reject(new Error(payload?.message || "上传失败，请重试。"));
    };
    xhr.send(chunk);
  });
}

function finishUploadTask(task) {
  task.uploadedBytes = task.totalSize;
  task.visualBytes = task.totalSize;
  task.status = "已完成";
  task.working = false;
  renderUploadTasks();
  showToast(`上传成功：${task.name}`);
  loadRecentFiles().catch(() => undefined);
  if (state.view === "shared") {
    loadSharedFiles().catch(() => undefined);
  }
  task.closeTimer = window.setTimeout(() => {
    state.uploadTasks.delete(task.id);
    renderUploadTasks();
  }, TASK_CLOSE_DELAY);
}

function pauseUpload(task) {
  if (task.status !== "上传中") {
    return;
  }
  task.status = "已暂停";
  task.working = false;
  task.xhr?.abort();
  renderUploadTasks();
}

async function removeUploadTask(task) {
  task.status = "已取消";
  task.xhr?.abort();
  if (task.uploadId) {
    await requestJson(`/api/upload/session/${encodeURIComponent(task.uploadId)}`, { method: "DELETE" }).catch(() => undefined);
  }
  state.uploadTasks.delete(task.id);
  renderUploadTasks();
}

async function downloadFile(fileId) {
  const file = [...state.knownFiles, ...state.shared.files].find((item) => item.id === fileId);
  if (!file) {
    showToast("文件不存在或已删除");
    return;
  }
  try {
    await downloadBlob(`/api/files/${encodeURIComponent(fileId)}/download`, file.name);
    showToast(`${file.name} 下载完成`);
    await Promise.all([loadRecentFiles(), state.view === "shared" ? loadSharedFiles() : Promise.resolve()]);
  } catch (error) {
    showToast(error.message || "下载失败");
  }
}

async function deleteFile(fileId) {
  const file = [...state.knownFiles, ...state.shared.files].find((item) => item.id === fileId);
  if (!file) {
    showToast("文件不存在或已删除");
    return;
  }
  const ok = await openConfirm("确定删除该文件吗？删除后无法恢复");
  if (!ok) {
    return;
  }
  try {
    await requestJson(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    state.selectedFiles.delete(fileId);
    showToast("文件已删除");
    await Promise.all([loadRecentFiles(), state.view === "shared" ? loadSharedFiles() : Promise.resolve()]);
  } catch (error) {
    showToast(error.message || "删除失败");
  }
}

async function batchDownload() {
  const ids = Array.from(state.selectedFiles);
  if (!ids.length) {
    showToast("请先选择需要下载的文件");
    return;
  }
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[\/ :]/g, "-");
  try {
    await downloadBlob("/api/files/batch-download", `域享批量下载-${stamp}.zip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    showToast("批量下载已完成");
  } catch (error) {
    showToast(error.message || "批量下载失败");
  }
}

async function batchDelete() {
  const ids = Array.from(state.selectedFiles);
  if (!ids.length) {
    showToast("请先选择需要删除的文件");
    return;
  }
  const ok = await openConfirm(`确定要删除选中的 ${ids.length} 个文件吗？删除后无法恢复`);
  if (!ok) {
    return;
  }
  try {
    const result = await requestJson("/api/files/batch-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    for (const id of result.deletedIds || []) {
      state.selectedFiles.delete(id);
    }
    showToast(`批量删除完成，成功 ${result.deletedIds?.length || 0} 项`);
    await Promise.all([loadRecentFiles(), loadSharedFiles()]);
  } catch (error) {
    showToast(error.message || "批量删除失败");
  }
}

function randomTransferCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const length = 8 + Math.floor(Math.random() * 3);
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function expiryLabel(upload = state.peerUpload) {
  if (!upload) {
    return "";
  }
  if (upload.expireAfterDownload) {
    return "下载后立即过期";
  }
  const hours = upload.expiresInMs / (60 * 60 * 1000);
  if (hours < 24) {
    return `${hours} 小时`;
  }
  return `${hours / 24} 天`;
}

function openPeerUpload() {
  state.peerUpload = {
    mode: "form",
    codeMode: "auto",
    code: randomTransferCode(),
    expiresInMs: 3 * 60 * 60 * 1000,
    expireAfterDownload: false,
    transfer: null,
    files: [],
    error: "",
  };
  renderPeerUpload();
  showModal(el.peerUploadModal);
  window.requestAnimationFrame(() => document.getElementById("peerCodeInput")?.focus());
}

function showModal(modal) {
  if (!modal) {
    return;
  }
  modal.classList.remove("is-closing");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hideModalWithAnimation(modal) {
  if (!modal || modal.classList.contains("hidden") || modal.classList.contains("is-closing")) {
    return;
  }
  modal.classList.add("is-closing");
  window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
    modal.setAttribute("aria-hidden", "true");
  }, 180);
}

function closePeerUpload() {
  hideModalWithAnimation(el.peerUploadModal);
}

function renderPeerUpload() {
  const upload = state.peerUpload;
  if (!upload) {
    return;
  }
  if (upload.mode === "result") {
    el.peerUploadBody.innerHTML = `
      <div class="peer-dialog-intro success-intro">
        <div class="peer-dialog-icon"><i data-icon="check"></i></div>
        <div>
          <span class="section-tag">Ready To Share</span>
          <h4>传输已准备完成</h4>
          <p>把传输码发给接收方，对方即可在有效期内下载文件。</p>
        </div>
      </div>
      <div class="code-result refined-code">
        <div class="code-result-head">
          <span class="section-tag">传输码</span>
          <span class="code-expiry">有效期：${escapeHtml(expiryLabel(upload))}</span>
        </div>
        <div class="code-pill">
          <span>${escapeHtml(upload.transfer.code)}</span>
          <button class="btn btn-secondary" id="copyPeerCodeBtn" type="button"><i data-icon="copy"></i><span>复制传输码</span></button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="finishPeerUploadBtn" type="button">完成</button>
      </div>
    `;
    renderIcons(el.peerUploadBody);
    return;
  }

  const disabledAfterTransfer = upload.transfer ? "disabled" : "";
  const codeReadOnly = upload.codeMode === "auto" || upload.transfer ? "readonly" : "";
  const allUploaded = upload.files.length > 0 && upload.files.every((file) => file.status === "上传成功");
  el.peerUploadBody.innerHTML = `
    <div class="peer-form">
      <div class="peer-dialog-intro">
        <div class="peer-dialog-icon"><i data-icon="upload-cloud"></i></div>
        <div>
          <span class="section-tag">Send Package</span>
          <h4>创建对端传输</h4>
          <p>先确认有效期和传输码，再把文件拖入投递区。上传完成后可复制传输码给接收方。</p>
        </div>
      </div>
      <div class="peer-config-grid">
        <label class="field">
          <span>过期时间设置</span>
          <div class="segmented premium-segments">
            ${renderExpiryOptions(upload)}
          </div>
        </label>
        <label class="field">
          <span>传输码设置</span>
          <div class="segmented premium-segments">
            <label class="segment"><input name="codeMode" value="auto" type="radio" ${upload.codeMode === "auto" ? "checked" : ""} ${disabledAfterTransfer} /> 自动生成</label>
            <label class="segment"><input name="codeMode" value="custom" type="radio" ${upload.codeMode === "custom" ? "checked" : ""} ${disabledAfterTransfer} /> 自定义</label>
          </div>
        </label>
      </div>
      <div class="field code-field">
        <span>传输码</span>
        <div class="code-field-row">
          <input id="peerCodeInput" type="text" value="${escapeHtml(upload.code)}" maxlength="10" ${codeReadOnly} ${disabledAfterTransfer} />
          <button class="btn btn-secondary" id="copyPeerDraftCodeBtn" type="button"><i data-icon="copy"></i><span>复制传输码</span></button>
        </div>
      </div>
      <div class="peer-drop" id="peerDropZone" tabindex="0" role="button">
        <div class="peer-drop-icon"><i data-icon="cloud-upload"></i></div>
        <div class="peer-drop-copy">
          <strong>拖放上传 / 点击选择文件</strong>
          <p>支持多文件同时上传，上传过程中进度条保持稳定显示。</p>
        </div>
        <button class="btn btn-secondary" id="peerPickFilesBtn" type="button"><i data-icon="plus"></i><span>选择文件</span></button>
        <input id="peerFileInput" type="file" multiple hidden />
      </div>
      ${upload.error ? `<p class="danger-note">${escapeHtml(upload.error)}</p>` : ""}
      <div class="peer-file-list">${upload.files.map(renderPeerUploadFile).join("")}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="resetPeerUploadBtn" type="button">重置</button>
        <button class="btn btn-primary" id="confirmPeerUploadBtn" type="button" ${allUploaded ? "" : "disabled"}>确定</button>
      </div>
    </div>
  `;
  renderIcons(el.peerUploadBody);
}

function renderExpiryOptions(upload) {
  const options = [
    ["hour-1", 1 * 60 * 60 * 1000, "1 小时"],
    ["hour-3", 3 * 60 * 60 * 1000, "3 小时"],
    ["hour-5", 5 * 60 * 60 * 1000, "5 小时"],
    ["hour-12", 12 * 60 * 60 * 1000, "12 小时"],
    ["day-1", 1 * 24 * 60 * 60 * 1000, "1 天"],
    ["day-3", 3 * 24 * 60 * 60 * 1000, "3 天"],
    ["day-7", 7 * 24 * 60 * 60 * 1000, "7 天"],
  ];
  const disabled = upload.transfer ? "disabled" : "";
  const html = options
    .map(([, value, label]) => {
      const checked = !upload.expireAfterDownload && upload.expiresInMs === value ? "checked" : "";
      return `<label class="segment"><input name="expiry" value="${value}" type="radio" ${checked} ${disabled} /> ${label}</label>`;
    })
    .join("");
  return `${html}<label class="segment"><input name="expiry" value="after-download" type="radio" ${upload.expireAfterDownload ? "checked" : ""} ${disabled} /> 下载后立即过期</label>`;
}

function renderPeerUploadFile(file) {
  const percent = file.totalSize > 0 ? Math.min(100, Math.floor((file.uploadedBytes / file.totalSize) * 100)) : 100;
  const statusClass = file.status === "上传成功" ? "success" : file.status === "上传失败" ? "error" : "";
  return `
    <div class="peer-file-row" data-peer-file-id="${escapeHtml(file.id)}">
      <div>
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <div class="row-meta ${statusClass}">${escapeHtml(file.status)} · ${percent}% · ${formatBytes(file.totalSize)}</div>
        <div class="progress-track peer-progress"><div class="progress-fill" style="width: ${percent}%"></div></div>
      </div>
      <button class="mini-btn" data-peer-action="remove-file" data-peer-file-id="${escapeHtml(file.id)}" type="button">
        <i data-icon="x"></i>移除
      </button>
    </div>
  `;
}

async function ensurePeerTransfer() {
  const upload = state.peerUpload;
  if (upload.transfer) {
    return upload.transfer;
  }
  if (!TransferUI.isValidTransferCode(upload.code)) {
    upload.error = "传输码需为 1-10 位英文字母 / 数字";
    renderPeerUpload();
    throw new Error(upload.error);
  }
  const data = await requestJson("/api/peer/transfers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: upload.code,
      expiresInMs: upload.expiresInMs,
      expireAfterDownload: upload.expireAfterDownload,
    }),
  });
  upload.transfer = data.transfer;
  upload.code = data.transfer.code;
  upload.error = "";
  return upload.transfer;
}

async function addPeerFiles(files) {
  if (!files.length) {
    return;
  }
  try {
    await ensurePeerTransfer();
  } catch (error) {
    showToast(error.message);
    return;
  }
  for (const file of files) {
    const task = {
      id: `peer-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      name: file.name,
      totalSize: file.size,
      uploadId: null,
      uploadedBytes: 0,
      status: "等待上传",
      fileId: null,
    };
    state.peerUpload.files.push(task);
    uploadPeerFile(task);
  }
  renderPeerUpload();
}

async function uploadPeerFile(task) {
  const upload = state.peerUpload;
  try {
    task.status = "上传中";
    renderPeerUpload();
    const init = await requestJson(`/api/peer/transfers/${encodeURIComponent(upload.transfer.id)}/upload/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: task.name,
        size: task.totalSize,
        lastModified: task.file.lastModified || 0,
      }),
    });
    if (init.complete && init.file) {
      task.uploadedBytes = task.totalSize;
      task.status = "上传成功";
      task.fileId = init.file.id;
      upload.transfer = init.transfer || upload.transfer;
      renderPeerUpload();
      return;
    }
    task.uploadId = init.uploadId;
    task.uploadedBytes = Number(init.uploadedBytes || 0);
    while (task.uploadedBytes < task.totalSize) {
      const end = Math.min(task.uploadedBytes + DEFAULT_CHUNK_SIZE, task.totalSize);
      const chunk = task.file.slice(task.uploadedBytes, end);
      const data = await sendPeerChunk(task, chunk);
      if (data.complete && data.file) {
        task.uploadedBytes = task.totalSize;
        task.status = "上传成功";
        task.fileId = data.file.id;
        upload.transfer = data.transfer || upload.transfer;
        renderPeerUpload();
        return;
      }
      task.uploadedBytes = Number(data.uploadedBytes || task.uploadedBytes);
      renderPeerUpload();
    }
  } catch (error) {
    task.status = "上传失败";
    renderPeerUpload();
    showToast(error.message || "对端文件上传失败");
  }
}

function sendPeerChunk(task, chunk) {
  return requestJson(`/api/peer/upload/chunk/${encodeURIComponent(task.uploadId)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "x-start-byte": String(task.uploadedBytes),
    },
    body: chunk,
  });
}

async function removePeerFile(fileId) {
  const upload = state.peerUpload;
  const item = upload.files.find((file) => file.id === fileId);
  if (!item) {
    return;
  }
  if (item.uploadId && item.status !== "上传成功") {
    await requestJson(`/api/peer/upload/session/${encodeURIComponent(item.uploadId)}`, { method: "DELETE" }).catch(() => undefined);
  }
  if (item.fileId && upload.transfer) {
    await requestJson(`/api/peer/transfers/${encodeURIComponent(upload.transfer.id)}/files/${encodeURIComponent(item.fileId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }
  upload.files = upload.files.filter((file) => file.id !== fileId);
  renderPeerUpload();
}

function openPeerReceive() {
  state.peerReceive = {
    step: "code",
    code: "",
    transfer: null,
    error: "",
  };
  renderPeerReceive();
  showModal(el.peerReceiveModal);
  window.requestAnimationFrame(() => document.getElementById("receiveCodeInput")?.focus());
}

function closePeerReceive() {
  hideModalWithAnimation(el.peerReceiveModal);
}

function renderPeerReceive() {
  const receive = state.peerReceive;
  if (!receive) {
    return;
  }
  if (receive.step === "list" && receive.transfer) {
    el.peerReceiveBody.innerHTML = `
      <div class="peer-form">
        <div class="peer-dialog-intro receive-intro">
          <div class="peer-dialog-icon"><i data-icon="download"></i></div>
          <div>
            <span class="section-tag">Receive Package</span>
            <h4>已找到传输内容</h4>
            <p>确认文件后按需下载，过期或一次性传输会在下载后自动失效。</p>
          </div>
        </div>
        <div class="code-result refined-code">
          <div class="code-result-head">
            <span class="section-tag">传输码</span>
            <span class="code-expiry">${receive.transfer.files.length} 个文件</span>
          </div>
          <div class="code-pill">
            <span>${escapeHtml(receive.transfer.code)}</span>
            <button class="btn btn-secondary" id="copyReceiveCodeBtn" type="button"><i data-icon="copy"></i><span>复制传输码</span></button>
          </div>
        </div>
        <div class="receive-list">${receive.transfer.files.map(renderReceiveFile).join("")}</div>
        ${receive.transfer.files.length ? "" : '<div class="empty-state show"><i data-icon="folder-open"></i><span>该传输码下暂无文件</span></div>'}
      </div>
    `;
    renderIcons(el.peerReceiveBody);
    return;
  }

  el.peerReceiveBody.innerHTML = `
    <div class="peer-form">
      <div class="peer-dialog-intro receive-intro">
        <div class="peer-dialog-icon"><i data-icon="download"></i></div>
        <div>
          <span class="section-tag">Code Receive</span>
          <h4>输入传输码</h4>
          <p>接收方输入 1-10 位传输码即可查看文件清单。</p>
        </div>
      </div>
      <div class="field code-field">
        <span>传输码</span>
        <div class="code-field-row single-action">
          <input id="receiveCodeInput" type="text" maxlength="10" placeholder="请输入传输码" value="${escapeHtml(receive.code)}" />
          <button class="btn btn-primary" id="resolvePeerCodeBtn" type="button">下一步</button>
        </div>
      </div>
      ${receive.error ? `<p class="danger-note">${escapeHtml(receive.error)}</p>` : ""}
    </div>
  `;
  renderIcons(el.peerReceiveBody);
}

function renderReceiveFile(file) {
  return `
    <div class="receive-row" data-peer-download-id="${escapeHtml(file.id)}">
      <div>
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <div class="row-meta">
          ${formatBytes(file.size)} · 上传 ${formatDate(file.uploadedAt)} · 过期 ${file.expireAfterDownload ? "下载后立即过期" : formatDate(file.expiresAt)}
          ${file.expireAfterDownload ? '<span class="danger-note"> 下载一次后将失效</span>' : ""}
        </div>
      </div>
      <button class="action-btn primary" data-peer-receive-action="download" data-peer-file-id="${escapeHtml(file.id)}" type="button">
        <i data-icon="download"></i><span>下载</span>
      </button>
    </div>
  `;
}

async function resolvePeerCode() {
  const receive = state.peerReceive;
  const code = receive.code.trim();
  if (!TransferUI.isValidTransferCode(code)) {
    receive.error = "传输码不存在，请检查输入";
    renderPeerReceive();
    return;
  }
  try {
    const data = await requestJson(`/api/peer/resolve/${encodeURIComponent(code)}`);
    receive.transfer = data.transfer;
    receive.step = "list";
    receive.error = "";
    renderPeerReceive();
  } catch (error) {
    receive.error = error.message || "传输码已过期或不存在";
    renderPeerReceive();
  }
}

async function downloadPeerFile(fileId) {
  const receive = state.peerReceive;
  const transfer = receive?.transfer;
  const file = transfer?.files?.find((item) => item.id === fileId);
  if (!file) {
    showToast("文件不存在或已删除");
    return;
  }
  try {
    await downloadBlob(`/api/peer/download/${encodeURIComponent(transfer.code)}/${encodeURIComponent(file.id)}`, file.name);
    showToast(`${file.name} 下载完成`);
    if (transfer.expireAfterDownload) {
      receive.step = "code";
      receive.transfer = null;
      receive.error = "该传输码已因下载完成而失效";
      renderPeerReceive();
    }
  } catch (error) {
    showToast(error.message || "下载失败");
  }
}

function bindEvents() {
  document.querySelectorAll("[data-view-target]").forEach((node) => {
    node.addEventListener("click", () => setView(node.dataset.viewTarget));
  });
  document.querySelectorAll("[data-mobile-view-target]").forEach((node) => {
    node.addEventListener("click", () => setView(node.dataset.mobileViewTarget));
  });

  el.copyAddressBtn.addEventListener("click", async () => {
    if (!state.accessAddress) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.accessAddress);
      showToast("访问地址已复制");
    } catch (error) {
      showToast("复制失败，请手动复制地址");
    }
  });
  el.pickFilesBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    el.fileInput.click();
  });
  el.fileInput.addEventListener("change", () => {
    handleUploadFiles(Array.from(el.fileInput.files || []));
    el.fileInput.value = "";
  });
  el.mobilePickFilesBtn?.addEventListener("click", () => {
    el.mobileFileInput?.click();
  });
  el.mobileFileInput?.addEventListener("change", () => {
    handleUploadFiles(Array.from(el.mobileFileInput.files || []));
    el.mobileFileInput.value = "";
  });
  el.dropZone.addEventListener("click", () => el.fileInput.click());
  el.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      el.fileInput.click();
    }
  });
  ["dragenter", "dragover"].forEach((type) => {
    el.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropZone.classList.add("is-over");
      el.dropTip.textContent = `即将接收 ${event.dataTransfer?.items?.length || 0} 个文件`;
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    el.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropZone.classList.remove("is-over");
      el.dropTip.textContent = "等待新任务";
    });
  });
  el.dropZone.addEventListener("drop", (event) => {
    handleUploadFiles(Array.from(event.dataTransfer?.files || []));
  });

  el.uploadQueue.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-upload-action]");
    if (!button) {
      return;
    }
    const task = state.uploadTasks.get(button.dataset.taskId);
    if (!task) {
      return;
    }
    const action = button.dataset.uploadAction;
    if (action === "pause") {
      pauseUpload(task);
    } else if (action === "resume" || action === "retry") {
      executeUpload(task);
    } else if (action === "remove") {
      await removeUploadTask(task);
    }
  });
  el.mobileUploadQueue?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-upload-action]");
    if (!button) {
      return;
    }
    const task = state.uploadTasks.get(button.dataset.taskId);
    if (!task) {
      return;
    }
    const action = button.dataset.uploadAction;
    if (action === "pause") {
      pauseUpload(task);
    } else if (action === "resume" || action === "retry") {
      executeUpload(task);
    } else if (action === "remove") {
      await removeUploadTask(task);
    }
  });

  document.body.addEventListener("click", (event) => {
    const fileAction = event.target.closest("[data-action]");
    if (!fileAction) {
      return;
    }
    const fileId = fileAction.dataset.fileId;
    if (fileAction.dataset.action === "download-file") {
      downloadFile(fileId);
    }
    if (fileAction.dataset.action === "delete-file") {
      deleteFile(fileId);
    }
  });

  const sharedInputs = [
    el.timeRangeSelect,
    el.typeSelect,
    el.sortBySelect,
    el.sortOrderSelect,
    el.pageSizeSelect,
    el.startDateInput,
    el.endDateInput,
  ];
  sharedInputs.forEach((node) => {
    node.addEventListener("change", () => {
      state.shared.page = 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    });
  });
  el.searchInput.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.shared.page = 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }, 220);
  });
  el.mobileSearchInput?.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.shared.page = 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }, 220);
  });
  [el.mobileTypeSelect, el.mobileSortSelect].forEach((node) => {
    node?.addEventListener("change", () => {
      state.shared.page = 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    });
  });
  el.selectPageCheckbox.addEventListener("change", () => {
    state.shared.files.forEach((file) => {
      if (el.selectPageCheckbox.checked) {
        state.selectedFiles.add(file.id);
      } else {
        state.selectedFiles.delete(file.id);
      }
    });
    renderSharedFiles();
  });
  el.sharedFileTable.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".file-select");
    if (!checkbox) {
      return;
    }
    if (checkbox.checked) {
      state.selectedFiles.add(checkbox.dataset.fileId);
    } else {
      state.selectedFiles.delete(checkbox.dataset.fileId);
    }
    updateSelectionControls();
  });
  el.prevPageBtn.addEventListener("click", () => {
    if (state.shared.page > 1) {
      state.shared.page -= 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }
  });
  el.nextPageBtn.addEventListener("click", () => {
    if (state.shared.page < state.shared.totalPages) {
      state.shared.page += 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }
  });
  el.mobilePrevPageBtn?.addEventListener("click", () => {
    if (state.shared.page > 1) {
      state.shared.page -= 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }
  });
  el.mobileNextPageBtn?.addEventListener("click", () => {
    if (state.shared.page < state.shared.totalPages) {
      state.shared.page += 1;
      loadSharedFiles().catch((error) => showToast(error.message));
    }
  });
  el.batchDownloadBtn.addEventListener("click", batchDownload);
  el.batchDeleteBtn.addEventListener("click", batchDelete);

  el.confirmCancelBtn.addEventListener("click", () => closeConfirm(false));
  el.confirmOkBtn.addEventListener("click", () => closeConfirm(true));
  el.confirmModal.addEventListener("click", (event) => {
    if (event.target === el.confirmModal) {
      closeConfirm(false);
    }
  });

  el.openPeerUpload.addEventListener("click", openPeerUpload);
  el.openPeerUpload.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPeerUpload();
    }
  });
  el.openPeerReceive.addEventListener("click", openPeerReceive);
  el.openPeerReceive.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPeerReceive();
    }
  });
  el.mobileOpenPeerUpload?.addEventListener("click", openPeerUpload);
  el.mobileOpenPeerReceive?.addEventListener("click", openPeerReceive);
  el.closePeerUploadBtn.addEventListener("click", closePeerUpload);
  el.closePeerReceiveBtn.addEventListener("click", closePeerReceive);
  el.peerUploadModal.addEventListener("click", (event) => {
    if (event.target === el.peerUploadModal) {
      closePeerUpload();
    }
  });
  el.peerReceiveModal.addEventListener("click", (event) => {
    if (event.target === el.peerReceiveModal) {
      closePeerReceive();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!el.confirmModal.classList.contains("hidden")) {
      closeConfirm(false);
      return;
    }
    if (!el.peerUploadModal.classList.contains("hidden")) {
      closePeerUpload();
      return;
    }
    if (!el.peerReceiveModal.classList.contains("hidden")) {
      closePeerReceive();
    }
  });

  el.peerUploadBody.addEventListener("change", (event) => {
    const upload = state.peerUpload;
    if (!upload) {
      return;
    }
    if (event.target.name === "expiry") {
      if (event.target.value === "after-download") {
        upload.expireAfterDownload = true;
      } else {
        upload.expireAfterDownload = false;
        upload.expiresInMs = Number(event.target.value);
      }
      renderPeerUpload();
    }
    if (event.target.name === "codeMode") {
      upload.codeMode = event.target.value;
      if (upload.codeMode === "auto") {
        upload.code = randomTransferCode();
      }
      renderPeerUpload();
    }
    if (event.target.id === "peerFileInput") {
      addPeerFiles(Array.from(event.target.files || []));
      event.target.value = "";
    }
  });
  el.peerUploadBody.addEventListener("input", (event) => {
    if (event.target.id === "peerCodeInput" && state.peerUpload && !state.peerUpload.transfer) {
      state.peerUpload.code = event.target.value.trim();
    }
  });
  el.peerUploadBody.addEventListener("click", async (event) => {
    const upload = state.peerUpload;
    const target = event.target;
    if (target.closest("#peerPickFilesBtn") || target.closest("#peerDropZone")) {
      const input = document.getElementById("peerFileInput");
      input?.click();
    }
    if (target.closest("#resetPeerUploadBtn")) {
      openPeerUpload();
    }
    if (target.closest("#confirmPeerUploadBtn") && upload?.transfer) {
      upload.mode = "result";
      renderPeerUpload();
    }
    if (target.closest("#copyPeerDraftCodeBtn") && upload?.code) {
      await navigator.clipboard.writeText(upload.code).catch(() => undefined);
      showToast("传输码已复制");
    }
    if (target.closest("#copyPeerCodeBtn") && upload?.transfer) {
      await navigator.clipboard.writeText(upload.transfer.code).catch(() => undefined);
      showToast("传输码已复制");
    }
    if (target.closest("#finishPeerUploadBtn")) {
      closePeerUpload();
    }
    const removeButton = target.closest("[data-peer-action='remove-file']");
    if (removeButton) {
      await removePeerFile(removeButton.dataset.peerFileId);
    }
  });
  el.peerUploadBody.addEventListener("dragover", (event) => {
    const drop = event.target.closest("#peerDropZone");
    if (drop) {
      event.preventDefault();
      drop.classList.add("is-over");
    }
  });
  el.peerUploadBody.addEventListener("dragleave", (event) => {
    event.target.closest("#peerDropZone")?.classList.remove("is-over");
  });
  el.peerUploadBody.addEventListener("drop", (event) => {
    const drop = event.target.closest("#peerDropZone");
    if (!drop) {
      return;
    }
    event.preventDefault();
    drop.classList.remove("is-over");
    addPeerFiles(Array.from(event.dataTransfer?.files || []));
  });

  el.peerReceiveBody.addEventListener("input", (event) => {
    if (event.target.id === "receiveCodeInput" && state.peerReceive) {
      state.peerReceive.code = event.target.value.trim();
    }
  });
  el.peerReceiveBody.addEventListener("click", async (event) => {
    if (event.target.closest("#resolvePeerCodeBtn")) {
      resolvePeerCode();
    }
    if (event.target.closest("#copyReceiveCodeBtn") && state.peerReceive?.transfer?.code) {
      await navigator.clipboard.writeText(state.peerReceive.transfer.code).catch(() => undefined);
      showToast("传输码已复制");
    }
    const downloadButton = event.target.closest("[data-peer-receive-action='download']");
    if (downloadButton) {
      downloadPeerFile(downloadButton.dataset.peerFileId);
    }
  });
  el.peerReceiveBody.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "receiveCodeInput") {
      resolvePeerCode();
    }
  });

  el.themeSelect.addEventListener("change", () => applyTheme(el.themeSelect.value));
  el.saveSettingsBtn.addEventListener("click", () => saveSettings().catch((error) => showToast(error.message)));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "system") {
      applyTheme("system");
    }
  });
  window.matchMedia("(max-width: 680px)").addEventListener("change", () => {
    setView(normalizeMobileView(state.view));
  });
}

function startPolling() {
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (state.view === "transfer") {
      loadRecentFiles().catch(() => undefined);
    }
    if (state.view === "shared") {
      loadSharedFiles().catch(() => undefined);
    }
  }, REFRESH_INTERVAL);
}

async function start() {
  bindEvents();
  renderIcons();
  updateSelectionControls();
  renderUploadTasks();
  await loadSettings();
  await loadSystemInfo();
  await loadRecentFiles();
  const initialView = ["transfer", "shared", "peer", "settings"].includes(location.hash.replace("#", ""))
    ? location.hash.replace("#", "")
    : "transfer";
  setView(initialView);
  startPolling();
}

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#", "");
  if (["transfer", "shared", "peer", "settings"].includes(view)) {
    setView(view);
  }
});

start().catch((error) => {
  showToast(error.message || "系统初始化失败，请刷新页面重试。", 0);
});
