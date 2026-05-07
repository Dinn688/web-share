const ADMIN_PAGE_SIZE = 50;

const state = {
  files: [],
  selectedKeys: new Set(),
  page: 1,
  pageSize: ADMIN_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  settings: null,
  storage: null,
  searchTimer: null,
};

const el = {
  loginSection: document.getElementById("adminLoginSection"),
  loginForm: document.getElementById("adminLoginForm"),
  loginMessage: document.getElementById("adminLoginMessage"),
  username: document.getElementById("adminUsername"),
  password: document.getElementById("adminPassword"),
  app: document.getElementById("adminApp"),
  accountLabel: document.getElementById("adminAccountLabel"),
  logoutBtn: document.getElementById("adminLogoutBtn"),
  totalFilesStat: document.getElementById("adminTotalFilesStat"),
  sharedFilesStat: document.getElementById("adminSharedFilesStat"),
  peerFilesStat: document.getElementById("adminPeerFilesStat"),
  storageUsedStat: document.getElementById("adminStorageUsedStat"),
  searchInput: document.getElementById("adminSearchInput"),
  uploadTypeFilter: document.getElementById("adminUploadTypeFilter"),
  categoryFilter: document.getElementById("adminCategoryFilter"),
  refreshBtn: document.getElementById("adminRefreshBtn"),
  fileTable: document.getElementById("adminFileTable"),
  emptyState: document.getElementById("adminEmptyState"),
  selectedCount: document.getElementById("adminSelectedCount"),
  batchDeleteBtn: document.getElementById("adminBatchDeleteBtn"),
  selectPageCheckbox: document.getElementById("adminSelectPageCheckbox"),
  paginationInfo: document.getElementById("adminPaginationInfo"),
  prevPageBtn: document.getElementById("adminPrevPageBtn"),
  nextPageBtn: document.getElementById("adminNextPageBtn"),
  storageForm: document.getElementById("adminStorageForm"),
  storageLimitInput: document.getElementById("adminStorageLimitInput"),
  storageMeterFill: document.getElementById("adminStorageMeterFill"),
  storageMeterText: document.getElementById("adminStorageMeterText"),
  passwordForm: document.getElementById("adminPasswordForm"),
  currentPassword: document.getElementById("currentAdminPassword"),
  newPassword: document.getElementById("newAdminPassword"),
  confirmPassword: document.getElementById("confirmAdminPassword"),
  toastContainer: document.getElementById("toastContainer"),
};

const iconMap = {
  "shield-check": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
  files: '<path d="M7 7.5V5a2 2 0 0 1 2-2h6l4 4v9a2 2 0 0 1-2 2h-2.5"/><path d="M14 3.5V8h4.5"/><rect x="4" y="10" width="10" height="11" rx="2"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.62V21a2 2 0 0 1-4 0v-.09a1.8 1.8 0 0 0-1-1.62 1.8 1.8 0 0 0-2 .36l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.62-1H3a2 2 0 0 1 0-4h.09a1.8 1.8 0 0 0 1.62-1 1.8 1.8 0 0 0-.36-2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 2 .36h.08A1.8 1.8 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.8 1.8 0 0 0 1 1.62 1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2v.08A1.8 1.8 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z"/>',
  "layout-dashboard": '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
  "user-cog": '<circle cx="10" cy="7" r="4"/><path d="M2 21a8 8 0 0 1 12.7-6.5"/><circle cx="18" cy="18" r="3"/><path d="M18 13.8v1.1M18 21.1v1.1M13.8 18h1.1M21.1 18h1.1"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v6A3.5 3.5 0 0 1 17.5 19h-11A3.5 3.5 0 0 1 3 15.5z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  "trash-2": '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  "folder-open": '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H9l2 2h8.5a1.5 1.5 0 0 1 1.4 2.05L18.6 18a3 3 0 0 1-2.8 2H5.3a2 2 0 0 1-1.9-2.6L6 10h15"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  "key-round": '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12 21 2M17 6l2 2M15 8l2 2"/>',
};

function renderIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach((node) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = iconMap[node.getAttribute("data-icon")] || iconMap.files;
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
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = value / 1024;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${Number(current.toFixed(current >= 10 ? 1 : 2))} ${units[index]}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function categoryLabel(category) {
  return (
    {
      image: "图片",
      document: "文档",
      archive: "压缩包",
      video: "视频",
      audio: "音频",
      other: "其他",
    }[category] || "其他"
  );
}

function showToast(message, duration = 2600) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  el.toastContainer.appendChild(node);
  window.setTimeout(() => {
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 180);
  }, duration);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data?.message || String(data || "请求失败"));
  }
  return data;
}

function showLogin(message = "") {
  el.app.classList.add("hidden");
  el.loginSection.classList.remove("hidden");
  el.loginMessage.textContent = message;
  window.requestAnimationFrame(() => el.password.focus());
}

function showAdmin(admin) {
  el.loginSection.classList.add("hidden");
  el.app.classList.remove("hidden");
  el.accountLabel.textContent = admin?.username || "admin";
}

async function loginAdmin(event) {
  event.preventDefault();
  el.loginMessage.textContent = "";
  try {
    const data = await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: el.username.value.trim(),
        password: el.password.value,
      }),
    });
    el.password.value = "";
    showAdmin(data.admin);
    await loadAdminDashboard();
  } catch (error) {
    el.loginMessage.textContent = error.message || "登录失败";
  }
}

async function logoutAdmin() {
  await requestJson("/api/admin/logout", { method: "POST" }).catch(() => undefined);
  state.selectedKeys.clear();
  showLogin("");
}

function buildFileQuery() {
  return new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    search: el.searchInput.value.trim(),
    uploadType: el.uploadTypeFilter.value,
    category: el.categoryFilter.value,
    sortBy: "uploadedAt",
    sortOrder: "desc",
  });
}

async function loadAdminFiles() {
  const data = await requestJson(`/api/admin/files?${buildFileQuery().toString()}`);
  state.files = data.files || [];
  state.total = Number(data.total || 0);
  state.page = Number(data.page || 1);
  state.pageSize = Number(data.pageSize || state.pageSize);
  state.totalPages = Number(data.totalPages || 1);
  cleanSelection();
  renderAdminFiles();
}

async function loadAdminSettings() {
  const data = await requestJson("/api/admin/settings");
  state.settings = data.settings || {};
  state.storage = data.storage || {};
  el.storageLimitInput.value = Number(state.settings.maxSharedStorageMb || 10240);
  renderAdminStats();
}

async function loadAdminDashboard() {
  await Promise.all([loadAdminFiles(), loadAdminSettings()]);
}

function cleanSelection() {
  const visibleKeys = new Set(state.files.map((file) => file.key));
  for (const key of Array.from(state.selectedKeys)) {
    if (!visibleKeys.has(key)) {
      state.selectedKeys.delete(key);
    }
  }
}

function renderAdminStats() {
  const sharedCount = Number(state.storage?.sharedFileCount || 0);
  const peerCount = Number(state.storage?.peerFileCount || 0);
  const used = Number(state.storage?.sharedUsedBytes || 0);
  const limit = Number(state.storage?.sharedLimitBytes || 0);
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  el.totalFilesStat.textContent = String(sharedCount + peerCount);
  el.sharedFilesStat.textContent = String(sharedCount);
  el.peerFilesStat.textContent = String(peerCount);
  el.storageUsedStat.textContent = formatBytes(used);
  el.storageMeterFill.style.width = `${percent}%`;
  el.storageMeterText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}，已使用 ${percent}%`;
}

function renderAdminFiles() {
  el.emptyState.classList.toggle("show", state.files.length === 0);
  el.fileTable.innerHTML = state.files
    .map((file) => {
      const checked = state.selectedKeys.has(file.key) ? "checked" : "";
      const typeClass = file.uploadType === "peer" ? "peer" : "shared";
      return `
        <tr data-file-key="${escapeHtml(file.key)}">
          <td class="check-cell">
            <input class="admin-file-select" data-file-key="${escapeHtml(file.key)}" type="checkbox" ${checked} aria-label="选择 ${escapeHtml(file.name)}" />
          </td>
          <td>
            <div class="admin-file-cell">
              <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
              <small>${escapeHtml(file.mimeType || "application/octet-stream")}</small>
            </div>
          </td>
          <td><span class="type-pill ${typeClass}">${escapeHtml(file.uploadTypeLabel)}</span></td>
          <td>${categoryLabel(file.category)}</td>
          <td>${formatBytes(file.size)}</td>
          <td><span class="admin-ip">${escapeHtml(file.uploaderIp || "未知")}</span></td>
          <td>${formatDate(file.uploadedAt)}</td>
          <td>
            <button class="action-btn delete" data-admin-action="delete-file" data-file-key="${escapeHtml(file.key)}" type="button">
              <i data-icon="trash-2"></i>
              <span>删除</span>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
  updateSelectionControls();
  renderIcons(el.fileTable);
}

function updateSelectionControls() {
  el.selectedCount.textContent = `已选择 ${state.selectedKeys.size} 项`;
  el.batchDeleteBtn.disabled = state.selectedKeys.size === 0;
  const pageKeys = state.files.map((file) => file.key);
  const allChecked = pageKeys.length > 0 && pageKeys.every((key) => state.selectedKeys.has(key));
  el.selectPageCheckbox.checked = allChecked;
  el.selectPageCheckbox.indeterminate = !allChecked && pageKeys.some((key) => state.selectedKeys.has(key));
  el.paginationInfo.textContent = `第 ${state.page} / ${state.totalPages} 页，共 ${state.total} 项`;
  el.prevPageBtn.disabled = state.page <= 1;
  el.nextPageBtn.disabled = state.page >= state.totalPages;
}

async function deleteAdminFile(key) {
  if (!window.confirm("确定删除该文件吗？删除后无法恢复。")) {
    return;
  }
  await requestJson(`/api/admin/files/${encodeURIComponent(key)}`, { method: "DELETE" });
  state.selectedKeys.delete(key);
  showToast("文件已删除");
  await loadAdminDashboard();
}

async function deleteSelectedAdminFiles() {
  const keys = Array.from(state.selectedKeys);
  if (!keys.length || !window.confirm(`确定删除选中的 ${keys.length} 个文件吗？删除后无法恢复。`)) {
    return;
  }
  const result = await requestJson("/api/admin/files/batch-delete", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
  for (const key of result.deletedKeys || []) {
    state.selectedKeys.delete(key);
  }
  showToast(`已删除 ${result.deletedKeys?.length || 0} 个文件`);
  await loadAdminDashboard();
}

async function saveAdminSettings(event) {
  event.preventDefault();
  const maxSharedStorageMb = Number(el.storageLimitInput.value || 1);
  const data = await requestJson("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ maxSharedStorageMb }),
  });
  state.settings = data.settings || state.settings;
  state.storage = data.storage || state.storage;
  renderAdminStats();
  showToast("共享空间容量已保存");
}

async function saveAdminPassword(event) {
  event.preventDefault();
  const currentPassword = el.currentPassword.value;
  const newPassword = el.newPassword.value;
  const confirmPassword = el.confirmPassword.value;
  if (newPassword.length < 8) {
    showToast("新密码至少 8 位");
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast("两次输入的新密码不一致");
    return;
  }
  await requestJson("/api/admin/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  el.currentPassword.value = "";
  el.newPassword.value = "";
  el.confirmPassword.value = "";
  showToast("管理员密码已修改");
}

function bindEvents() {
  el.loginForm.addEventListener("submit", loginAdmin);
  el.logoutBtn.addEventListener("click", logoutAdmin);
  el.refreshBtn.addEventListener("click", () => loadAdminDashboard().catch((error) => showToast(error.message)));
  el.searchInput.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.page = 1;
      loadAdminFiles().catch((error) => showToast(error.message));
    }, 180);
  });
  [el.uploadTypeFilter, el.categoryFilter].forEach((node) => {
    node.addEventListener("change", () => {
      state.page = 1;
      loadAdminFiles().catch((error) => showToast(error.message));
    });
  });
  el.fileTable.addEventListener("change", (event) => {
    const target = event.target.closest(".admin-file-select");
    if (!target) return;
    if (target.checked) {
      state.selectedKeys.add(target.dataset.fileKey);
    } else {
      state.selectedKeys.delete(target.dataset.fileKey);
    }
    updateSelectionControls();
  });
  el.fileTable.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-action='delete-file']");
    if (!button) return;
    deleteAdminFile(button.dataset.fileKey).catch((error) => showToast(error.message));
  });
  el.selectPageCheckbox.addEventListener("change", () => {
    for (const file of state.files) {
      if (el.selectPageCheckbox.checked) {
        state.selectedKeys.add(file.key);
      } else {
        state.selectedKeys.delete(file.key);
      }
    }
    renderAdminFiles();
  });
  el.batchDeleteBtn.addEventListener("click", () => deleteSelectedAdminFiles().catch((error) => showToast(error.message)));
  el.prevPageBtn.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadAdminFiles().catch((error) => showToast(error.message));
  });
  el.nextPageBtn.addEventListener("click", () => {
    state.page = Math.min(state.totalPages, state.page + 1);
    loadAdminFiles().catch((error) => showToast(error.message));
  });
  el.storageForm.addEventListener("submit", saveAdminSettings);
  el.passwordForm.addEventListener("submit", saveAdminPassword);
}

async function boot() {
  renderIcons();
  bindEvents();
  try {
    const data = await requestJson("/api/admin/me");
    showAdmin(data.admin);
    await loadAdminDashboard();
  } catch (error) {
    showLogin("");
  }
}

boot();
