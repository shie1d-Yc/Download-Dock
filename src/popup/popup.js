const downloadsList = document.querySelector("#downloads");
const loaderText = document.querySelector("#loader");
const refreshButton = document.querySelector("#refresh");
const openDownloadsButton = document.querySelector("#open-downloads");
const showFolderButton = document.querySelector("#show-folder");
const toggleSearchButton = document.querySelector("#toggle-search");
const closePopupButton = document.querySelector("#close-popup");
const searchPanel = document.querySelector("#search-panel");
const searchInput = document.querySelector("#search-input");

const DOWNLOAD_BATCH_SIZE = 20;
const SCROLL_LOAD_THRESHOLD = 160;
const SAFE_DANGER_TYPES = new Set(["safe", "accepted", "allowlisted", "deepScannedSafe"]);

let isLoadingDownloads = false;
let hasLoadedAllDownloads = false;
let oldestStartTime = null;
let visibleDownloadCount = 0;
let currentSearchTerm = "";
let loadGeneration = 0;
let searchTimer = null;
const loadedDownloadIds = new Set();

function getDisplayName(filename) {
  return filename?.split(/[\\/]/).pop() || filename || "未知文件";
}

function getFileExtension(filename) {
  const extension = getDisplayName(filename).split(".").pop();
  return extension && extension !== getDisplayName(filename) ? extension.slice(0, 4).toUpperCase() : "FILE";
}

function getFileKind(filename) {
  const extension = getFileExtension(filename).toLowerCase();

  if (["exe", "msi", "bat", "cmd"].includes(extension)) {
    return "app";
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return "archive";
  }

  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension)) {
    return "document";
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) {
    return "image";
  }

  return "generic";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getMeta(download) {
  const parts = [];

  if (isDangerousDownload(download)) {
    return getDangerText(download.danger);
  }

  const unavailableText = getUnavailableText(download);

  if (unavailableText) {
    parts.push(unavailableText);
  }

  if (download.state === "in_progress") {
    const progress = getProgressText(download);
    parts.push(progress ? `下载中 ${progress}` : "下载中");
  }

  if (download.fileSize > 0) {
    parts.push(formatBytes(download.fileSize));
  } else if (download.totalBytes > 0) {
    parts.push(formatBytes(download.totalBytes));
  }

  if (download.startTime) {
    parts.push(new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(download.startTime)));
  }

  return parts.join(" · ");
}

function getProgressText(download) {
  if (download.totalBytes > 0 && download.bytesReceived >= 0) {
    return `${Math.min(100, Math.round((download.bytesReceived / download.totalBytes) * 100))}%`;
  }

  return "";
}

function isDangerousDownload(download) {
  return Boolean(download.danger && !SAFE_DANGER_TYPES.has(download.danger));
}

function isDisplayableDownload(download) {
  return Boolean(download.filename || download.url || download.finalUrl);
}

function isUnavailableDownload(download) {
  return download.exists === false || download.state === "interrupted";
}

function getUnavailableText(download) {
  if (download.state === "interrupted") {
    return download.error === "USER_CANCELED" ? "已拒绝" : "已中断";
  }

  if (download.exists === false) {
    return "已删除";
  }

  return "";
}

function getDangerText(danger) {
  const messages = {
    file: "已拦截危险文件",
    url: "已拦截危险下载地址",
    content: "已拦截危险内容",
    uncommon: "已拦截未经验证的下载内容",
    host: "已拦截危险来源",
    unwanted: "已拦截可能有害的下载内容",
    asyncScanning: "正在进行安全检查",
    asyncLocalPasswordScanning: "正在检查受保护内容",
    passwordProtected: "已拦截受密码保护的内容",
    blockedTooLarge: "已拦截过大的下载内容",
    sensitiveContentWarning: "检测到敏感内容",
    sensitiveContentBlock: "已拦截敏感内容",
    deepScannedFailed: "安全检查失败",
    accountCompromise: "已拦截账号风险内容"
  };

  return messages[danger] || "已拦截可疑下载内容";
}

function chromeCall(invoker) {
  return new Promise((resolve, reject) => {
    invoker((result) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result);
    });
  });
}

function openDownloadFile(download) {
  try {
    chrome.downloads.open(download.id);
  } catch {
    chrome.downloads.show(download.id);
  }
}

async function searchDownloadsBatch() {
  const query = {
    limit: DOWNLOAD_BATCH_SIZE,
    orderBy: ["-startTime"]
  };

  if (currentSearchTerm) {
    query.query = currentSearchTerm.split(/\s+/);
  }

  if (oldestStartTime) {
    query.startedBefore = oldestStartTime;
  }

  return chromeCall((callback) => chrome.downloads.search(query, callback));
}

function renderEmpty(message) {
  downloadsList.replaceChildren();

  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = message;
  downloadsList.append(empty);
}

function appendDownloads(downloads) {
  const fragment = document.createDocumentFragment();

  for (const download of downloads) {
    if (!shouldAppendDownload(download)) {
      continue;
    }

    loadedDownloadIds.add(download.id);
    visibleDownloadCount += 1;
    fragment.append(createDownloadItem(download));
  }

  downloadsList.append(fragment);
}

function shouldAppendDownload(download) {
  return !loadedDownloadIds.has(download.id) && isDisplayableDownload(download);
}

function createDownloadItem(download) {
  const item = document.createElement("article");
  const { row, actions } = createDownloadRow(download);

  item.className = getDownloadItemClassName(download);
  item.dataset.downloadId = String(download.id);
  item.append(row);
  configureDownloadActions(download, item, row, actions);

  return item;
}

function getDownloadItemClassName(download) {
  const classes = ["download-item"];

  if (isDangerousDownload(download)) {
    classes.push("warning");
  }

  if (download.state === "in_progress") {
    classes.push("in-progress");
  }

  if (isUnavailableDownload(download)) {
    classes.push("unavailable");
  }

  return classes.join(" ");
}

function createDownloadRow(download) {
  const row = document.createElement("div");
  row.className = "download-row";

  const actions = document.createElement("div");
  actions.className = "download-actions";
  row.append(createFileIcon(download), createDownloadDetails(download), actions);

  return { row, actions };
}

function createFileIcon(download) {
  const isDangerous = isDangerousDownload(download);
  const icon = document.createElement("div");

  icon.className = isDangerous ? "file-icon warning-icon" : `file-icon ${getFileKind(download.filename)}`;
  icon.append(createIcon(isDangerous ? "warning" : getFileIconName(download.filename)));

  return icon;
}

function createDownloadDetails(download) {
  const details = document.createElement("div");
  details.className = "download-details";

  const name = document.createElement("div");
  name.className = "download-name";
  name.title = download.filename;
  name.textContent = getDisplayName(download.filename);

  const meta = document.createElement("div");
  meta.className = "download-meta";
  meta.textContent = getMeta(download) || "已完成";

  details.append(name, meta);
  return details;
}

function configureDownloadActions(download, item, row, actions) {
  if (isDangerousDownload(download)) {
    configureDangerousDownload(download, item, row, actions);
    return;
  }

  if (isUnavailableDownload(download)) {
    actions.append(createEraseRecordButton(download, item));
    return;
  }

  if (download.state === "in_progress") {
    actions.append(createCancelDownloadButton(download, item));
    return;
  }

  configureOpenableDownload(download, item, row, actions);
}

function configureDangerousDownload(download, item, row, actions) {
  const expandButton = createActionButton({
    className: "icon-button chevron-button",
    title: "显示操作",
    ariaLabel: `显示 ${getDisplayName(download.filename)} 的操作`,
    icon: "chevron-right"
  });
  const dangerPanel = createDangerPanel(download, item);
  const togglePanel = () => {
    const isOpen = item.classList.toggle("expanded");
    dangerPanel.hidden = !isOpen;
    expandButton.setAttribute("aria-expanded", String(isOpen));
  };

  expandButton.setAttribute("aria-expanded", "false");
  expandButton.addEventListener("click", togglePanel);
  row.addEventListener("click", (event) => {
    if (!event.target.closest("button")) {
      togglePanel();
    }
  });

  actions.append(expandButton);
  item.append(dangerPanel);
}

function createEraseRecordButton(download, item) {
  return createActionButton({
    className: "icon-button danger",
    title: "从记录中移除",
    ariaLabel: `从记录中移除 ${getDisplayName(download.filename)}`,
    icon: "trash",
    onClick: (button) => eraseDownloadRecord(download, item, button)
  });
}

function createCancelDownloadButton(download, item) {
  return createActionButton({
    className: "icon-button danger",
    title: "取消下载",
    ariaLabel: `取消下载 ${getDisplayName(download.filename)}`,
    icon: "cancel",
    onClick: (button) => cancelDownload(download, item, button)
  });
}

function configureOpenableDownload(download, item, row, actions) {
  item.classList.add("openable");
  row.title = `${getDisplayName(download.filename)}\n双击打开文件`;
  row.addEventListener("dblclick", (event) => {
    if (!event.target.closest("button")) {
      openDownloadFile(download);
    }
  });

  actions.append(createShowFileButton(download), createDeleteFileButton(download, item));
}

function createShowFileButton(download) {
  return createActionButton({
    title: "在文件夹中显示",
    ariaLabel: `在文件夹中显示 ${getDisplayName(download.filename)}`,
    icon: "folder",
    onClick: () => chrome.downloads.show(download.id)
  });
}

function createDeleteFileButton(download, item) {
  return createActionButton({
    className: "icon-button danger",
    title: "删除文件",
    ariaLabel: `删除 ${getDisplayName(download.filename)}`,
    icon: "trash",
    onClick: (button) => deleteDownload(download, item, button)
  });
}

function createActionButton({ className = "icon-button", title, ariaLabel, icon, onClick }) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", ariaLabel);
  button.append(createIcon(icon));

  if (onClick) {
    button.addEventListener("click", () => onClick(button));
  }

  return button;
}

function getFileIconName(filename) {
  const kind = getFileKind(filename);

  if (kind === "document") {
    return "file-document";
  }

  if (kind === "image") {
    return "file-image";
  }

  if (kind === "archive") {
    return "archive";
  }

  if (kind === "app") {
    return "app";
  }

  return "file-generic";
}

function createIcon(name) {
  const icon = document.createElement("span");
  icon.className = `png-icon icon-${name}`;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createDangerPanel(download, item) {
  const panel = document.createElement("div");
  panel.className = "danger-panel";
  panel.hidden = true;

  const message = document.createElement("p");
  message.textContent = "此文件被 Chrome 标记为可能不安全。保留前请确认来源可信。";

  const controls = document.createElement("div");
  controls.className = "danger-controls";

  const keepButton = document.createElement("button");
  keepButton.className = "text-button";
  keepButton.type = "button";
  keepButton.textContent = "保留";
  keepButton.addEventListener("click", () => acceptDangerousDownload(download, keepButton));

  const rejectButton = document.createElement("button");
  rejectButton.className = "text-button muted";
  rejectButton.type = "button";
  rejectButton.textContent = "拒绝";
  rejectButton.addEventListener("click", () => rejectDangerousDownload(download, item, rejectButton));

  controls.append(keepButton, rejectButton);
  panel.append(message, controls);
  return panel;
}

function updateLoader() {
  if (isLoadingDownloads) {
    loaderText.textContent = "正在加载更多...";
    return;
  }

  loaderText.textContent = hasLoadedAllDownloads && visibleDownloadCount > 0 ? "已加载全部下载记录" : "";
}

function resetDownloads() {
  loadGeneration += 1;
  isLoadingDownloads = false;
  hasLoadedAllDownloads = false;
  oldestStartTime = null;
  visibleDownloadCount = 0;
  loadedDownloadIds.clear();
  downloadsList.replaceChildren();
  loaderText.textContent = "";
}

async function loadNextDownloads() {
  if (isLoadingDownloads || hasLoadedAllDownloads) {
    return;
  }

  const generation = loadGeneration;
  isLoadingDownloads = true;
  refreshButton.disabled = true;
  updateLoader();

  try {
    const downloads = await searchDownloadsBatch();

    if (generation !== loadGeneration) {
      return;
    }

    if (downloads.length > 0) {
      oldestStartTime = downloads[downloads.length - 1].startTime;
      appendDownloads(downloads);
    }

    if (downloads.length < DOWNLOAD_BATCH_SIZE) {
      hasLoadedAllDownloads = true;
    }

    if (visibleDownloadCount === 0 && hasLoadedAllDownloads) {
      renderEmpty("没有可删除的最近下载文件");
    }

  } catch {
    if (generation !== loadGeneration) {
      return;
    }

    if (visibleDownloadCount === 0) {
      renderEmpty("读取下载记录失败");
    }
  } finally {
    if (generation !== loadGeneration) {
      return;
    }

    isLoadingDownloads = false;
    refreshButton.disabled = false;
    updateLoader();
    loadMoreIfNearBottom();
  }
}

async function loadDownloads() {
  resetDownloads();
  await loadNextDownloads();
}

async function deleteDownload(download, item, button) {
  const filename = getDisplayName(download.filename);

  if (!confirm(`确定要从磁盘删除“${filename}”吗？`)) {
    return;
  }

  button.disabled = true;

  try {
    await chromeCall((callback) => chrome.downloads.removeFile(download.id, callback));
    await chromeCall((callback) => chrome.downloads.erase({ id: download.id }, callback));
    item.remove();
    visibleDownloadCount = Math.max(0, visibleDownloadCount - 1);

    if (visibleDownloadCount === 0 && hasLoadedAllDownloads) {
      renderEmpty("没有可删除的最近下载文件");
    } else {
      loadMoreIfNearBottom();
    }
  } catch {
    button.disabled = false;
  }
}

async function eraseDownloadRecord(download, item, button) {
  button.disabled = true;

  try {
    await chromeCall((callback) => chrome.downloads.erase({ id: download.id }, callback));
    item.remove();
    visibleDownloadCount = Math.max(0, visibleDownloadCount - 1);
    loadMoreIfNearBottom();
  } catch {
    button.disabled = false;
  }
}

async function cancelDownload(download, item, button) {
  button.disabled = true;

  try {
    await chromeCall((callback) => chrome.downloads.cancel(download.id, callback));
    await loadDownloads();
  } catch {
    button.disabled = false;
  }
}

async function acceptDangerousDownload(download, button) {
  button.disabled = true;

  try {
    await chromeCall((callback) => chrome.downloads.acceptDanger(download.id, callback));
    await loadDownloads();
  } catch {
    button.disabled = false;
  }
}

async function rejectDangerousDownload(download, item, button) {
  button.disabled = true;

  try {
    if (download.state === "in_progress") {
      await chromeCall((callback) => chrome.downloads.cancel(download.id, callback));
    }

    await chromeCall((callback) => chrome.downloads.erase({ id: download.id }, callback));
    item.remove();
    visibleDownloadCount = Math.max(0, visibleDownloadCount - 1);
    loadMoreIfNearBottom();
  } catch {
    button.disabled = false;
  }
}

function loadMoreIfNearBottom() {
  const distanceToBottom = downloadsList.scrollHeight - downloadsList.scrollTop - downloadsList.clientHeight;

  if (distanceToBottom <= SCROLL_LOAD_THRESHOLD) {
    loadNextDownloads();
  }
}

refreshButton.addEventListener("click", loadDownloads);
downloadsList.addEventListener("scroll", loadMoreIfNearBottom, { passive: true });

openDownloadsButton.addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://downloads/" });
});

showFolderButton.addEventListener("click", () => {
  chrome.downloads.showDefaultFolder();
});

toggleSearchButton.addEventListener("click", () => {
  searchPanel.hidden = !searchPanel.hidden;

  if (!searchPanel.hidden) {
    searchInput.focus();
    searchInput.select();
  } else if (currentSearchTerm) {
    searchInput.value = "";
    currentSearchTerm = "";
    loadDownloads();
  }
});

searchInput.addEventListener("input", () => {
  currentSearchTerm = searchInput.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadDownloads, 160);
});

closePopupButton.addEventListener("click", () => {
  window.close();
});

loadDownloads();
