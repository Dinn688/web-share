(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TransferUI = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const PROGRESS_SKINS = ["aurora", "comet", "segments", "liquid", "pulse"];

  function formatBytes(bytes) {
    const num = Number(bytes);
    if (!Number.isFinite(num) || num <= 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = num;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    if (index === 0) {
      return `${Math.round(value)} ${units[index]}`;
    }
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${Number(value.toFixed(digits))} ${units[index]}`;
  }

  function pickProgressSkin(seed) {
    const text = String(seed || "");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return PROGRESS_SKINS[hash % PROGRESS_SKINS.length];
  }

  function randomProgressSkin() {
    return PROGRESS_SKINS[Math.floor(Math.random() * PROGRESS_SKINS.length)];
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

  function isUploadedWithinHours(uploadedAt, hours, now = new Date()) {
    const uploadedTime = new Date(uploadedAt).getTime();
    const currentTime = new Date(now).getTime();
    const windowMs = Number(hours) * 60 * 60 * 1000;
    if (!Number.isFinite(uploadedTime) || !Number.isFinite(currentTime) || !Number.isFinite(windowMs) || windowMs <= 0) {
      return false;
    }
    return currentTime - uploadedTime <= windowMs && currentTime >= uploadedTime;
  }

  function isValidTransferCode(code) {
    return /^[A-Za-z0-9]{1,10}$/.test(String(code || ""));
  }

  function buildPageWindow(total, page, pageSize) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safePageSize = [10, 20].includes(Number(pageSize)) ? Number(pageSize) : 10;
    const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
    const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const start = (safePage - 1) * safePageSize;
    return {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      totalPages,
      start,
      end: Math.min(start + safePageSize, safeTotal),
    };
  }

  return {
    PROGRESS_SKINS,
    buildPageWindow,
    classifyFileType,
    formatBytes,
    isUploadedWithinHours,
    isValidTransferCode,
    pickProgressSkin,
    randomProgressSkin,
  };
});
