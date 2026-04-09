const STORAGE_KEY = "knit-helper-state";
const GLOBAL_TIMER_KEY = "knit-global-timer";

const refs = {
  projectTitle: document.getElementById("projectTitle"),
  projectForm: document.getElementById("projectForm"),
  projectName: document.getElementById("projectName"),
  projectType: document.getElementById("projectType"),
  projectStatus: document.getElementById("projectStatus"),
  totalRows: document.getElementById("totalRows"),
  yarnInfo: document.getElementById("yarnInfo"),
  toolsInfo: document.getElementById("toolsInfo"),
  textDiagram: document.getElementById("textDiagram"),
  diagramImageInput: document.getElementById("diagramImageInput"),
  diagramImageGallery: document.getElementById("diagramImageGallery"),
  diagramImagePlaceholder: document.getElementById("diagramImagePlaceholder"),
  projectCoverInput: document.getElementById("projectCoverInput"),
  projectCoverRemoveBtn: document.getElementById("projectCoverRemoveBtn"),
  projectCoverPreview: document.getElementById("projectCoverPreview"),
  rowCounter: document.getElementById("rowCounter"),
  progressText: document.getElementById("progressText"),
  projectTimeSpent: document.getElementById("projectTimeSpent"),
  stepInput: document.getElementById("stepInput"),
  globalTimerDisplay: document.getElementById("globalTimerDisplay"),
  globalTimerMinutes: document.getElementById("globalTimerMinutes"),
  globalStartBtn: document.getElementById("globalStartBtn"),
  globalPauseBtn: document.getElementById("globalPauseBtn"),
  globalResetBtn: document.getElementById("globalResetBtn"),
  feedbackToast: document.getElementById("feedbackToast"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authStatus: document.getElementById("authStatus"),
  authDialog: document.getElementById("authDialog"),
  closeAuthDialogBtn: document.getElementById("closeAuthDialogBtn"),
  openLoginBtn: document.getElementById("openLoginBtn"),
  openRegisterBtn: document.getElementById("openRegisterBtn"),
  accountChip: document.getElementById("accountChip"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  syncHint: document.getElementById("syncHint"),
};

const timerState = { minutes: 25, left: 25 * 60, running: false };
const syncRuntime = { pushTimerId: null, remoteUnsubscribe: null, lastSeenCloudStamp: 0 };
const runtimeWarnings = { timerStorageWarned: false };

let globalTimerId = null;
let projectTimeTick = 0;

function setupMobileAuthMenu() {
  const trigger = document.getElementById("navAuthTrigger");
  const menu = document.getElementById("navAuthMenu");
  if (!trigger || !menu) return;

  function closeMenu() {
    menu.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function syncTriggerVisibility() {
    if (window.innerWidth <= 900) {
      trigger.style.display = "";
    } else {
      trigger.style.display = "none";
      closeMenu();
    }
  }

  syncTriggerVisibility();
  window.addEventListener("resize", syncTriggerVisibility);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const nextOpen = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", nextOpen);
    trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (window.innerWidth > 900) return;
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    closeMenu();
  });
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeHourlyBuckets() {
  const buckets = {};
  for (let i = 0; i < 24; i += 1) buckets[`h${String(i).padStart(2, "0")}`] = 0;
  return buckets;
}

function combinePair(a, b) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left && !right) return "";
  if (!left) return right;
  if (!right) return left;
  return `${left} / ${right}`;
}

function splitPair(value) {
  const source = String(value || "").trim();
  if (!source) return ["", ""];
  const parts = source.split(/\s*\/\s*|\s*\|\s*|\s*，\s*|\s*,\s*/);
  return [String(parts[0] || "").trim(), String(parts.slice(1).join(" ") || "").trim()];
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hh = Math.floor(safe / 3600).toString().padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getHourKey(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return "h20";
  return `h${String(Math.max(0, Math.min(23, Math.floor(value)))).padStart(2, "0")}`;
}

function ensureProjectDailyEntry(project, dateKey) {
  if (!project.dailyStats || typeof project.dailyStats !== "object") project.dailyStats = {};
  const key = String(dateKey || getToday());
  const entry = project.dailyStats[key];
  if (!entry || typeof entry !== "object") project.dailyStats[key] = { seconds: 0, rows: 0, hourBuckets: {} };
  project.dailyStats[key].seconds = Math.max(0, Number(project.dailyStats[key].seconds) || 0);
  project.dailyStats[key].rows = Math.max(0, Number(project.dailyStats[key].rows) || 0);
  return project.dailyStats[key];
}

function createProject(name = "我的新作品") {
  const now = Date.now();
  return {
    id: makeId(),
    projectName: name,
    projectType: "围巾",
    status: "paused",
    yarnType: "",
    yarnRef: "",
    tools: "",
    needleSize: "",
    totalRows: 0,
    coverImage: "",
    textDiagram: "",
    diagramImage: "",
    diagramImages: [],
    rows: 0,
    todayRows: 0,
    todaySeconds: 0,
    spentSeconds: 0,
    lastDate: getToday(),
    createdAt: now,
    completedAt: null,
    dailyStats: {},
    timeBuckets: makeHourlyBuckets(),
    updatedAt: now,
  };
}

function normalizeProject(project) {
  const normalized = { ...createProject(project?.projectName || "未命名作品"), ...(project || {}) };
  normalized.id = normalized.id || makeId();
  normalized.totalRows = Math.max(0, Number(normalized.totalRows) || 0);
  normalized.rows = Math.max(0, Number(normalized.rows) || 0);
  normalized.spentSeconds = Math.max(0, Number(normalized.spentSeconds) || 0);
  normalized.updatedAt = Math.max(0, Number(normalized.updatedAt) || 0);
  normalized.diagramImages = Array.isArray(normalized.diagramImages)
    ? normalized.diagramImages.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!normalized.diagramImages.length && normalized.diagramImage) {
    normalized.diagramImages = [String(normalized.diagramImage).trim()].filter(Boolean);
  }
  const todayEntry = ensureProjectDailyEntry(normalized, getToday());
  normalized.todayRows = Math.max(0, Number(todayEntry.rows) || 0);
  normalized.todaySeconds = Math.max(0, Number(todayEntry.seconds) || 0);
  return normalized;
}

function getProjectRowsFromDailyStats(project) {
  if (!project?.dailyStats || typeof project.dailyStats !== "object") return Math.max(0, Number(project?.rows) || 0);
  const values = Object.values(project.dailyStats);
  if (!values.length) return Math.max(0, Number(project?.rows) || 0);
  return values.reduce((sum, stat) => sum + Math.max(0, Number(stat?.rows) || 0), 0);
}

function getProjectProgress(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((getProjectRowsFromDailyStats(project) / total) * 100));
}

function classifyStorageError(error) {
  const message = String(error?.message || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  return message.includes("quota") || message.includes("exceeded") || name.includes("quota");
}

function safeSetLocalStorage(key, value, options = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (typeof options.onError === "function") options.onError(error, { isQuota: classifyStorageError(error) });
    return false;
  }
}

function loadProjects() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    return list.map(normalizeProject);
  } catch {
    return [];
  }
}

function saveProjects(projects, options = {}) {
  const saved = safeSetLocalStorage(STORAGE_KEY, JSON.stringify({ projects }));
  if (!saved) return false;
  if (options.scheduleCloud !== false) scheduleCloudPush(projects);
  return true;
}

function recordProjectRows(project, rows) {
  const amount = Math.max(0, Number(rows) || 0);
  if (!amount) return;
  const today = getToday();
  const entry = ensureProjectDailyEntry(project, today);
  entry.rows += amount;
  const bucket = getHourKey(new Date().getHours());
  if (!entry.hourBuckets || typeof entry.hourBuckets !== "object") entry.hourBuckets = {};
  entry.hourBuckets[bucket] = Math.max(0, Number(entry.hourBuckets[bucket]) || 0) + amount;
  project.todayRows = entry.rows;
  project.rows = Math.max(0, Number(project.rows) || 0) + amount;
  project.lastDate = today;
}

function recordProjectSeconds(project, seconds) {
  const amount = Math.max(0, Number(seconds) || 0);
  if (!amount) return;
  const today = getToday();
  const entry = ensureProjectDailyEntry(project, today);
  entry.seconds += amount;
  const bucket = getHourKey(new Date().getHours());
  if (!entry.hourBuckets || typeof entry.hourBuckets !== "object") entry.hourBuckets = {};
  entry.hourBuckets[bucket] = Math.max(0, Number(entry.hourBuckets[bucket]) || 0) + amount;
  project.todaySeconds = entry.seconds;
  project.spentSeconds = Math.max(0, Number(project.spentSeconds) || 0) + amount;
  project.lastDate = today;
}

function renderDiagramImages(project) {
  if (!refs.diagramImageGallery) return;
  refs.diagramImageGallery.innerHTML = "";
  const images = Array.isArray(project.diagramImages) ? project.diagramImages.map((item) => String(item || "").trim()).filter(Boolean) : [];
  images.forEach((src, index) => {
    const item = document.createElement("div");
    item.className = "diagram-image-item";
    const image = document.createElement("img");
    image.src = src;
    image.alt = `图解图片 ${index + 1}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "diagram-image-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "删除该图片";
    removeBtn.dataset.index = String(index);
    item.append(image, removeBtn);
    refs.diagramImageGallery.appendChild(item);
  });
  if (refs.diagramImagePlaceholder) refs.diagramImagePlaceholder.style.display = images.length ? "none" : "inline";
}

function renderProject(project) {
  refs.projectTitle.textContent = project.projectName || "项目详情";
  refs.projectName.value = project.projectName || "";
  refs.projectType.value = project.projectType || "围巾";
  refs.projectStatus.value = project.status || "active";
  refs.totalRows.value = project.totalRows ? String(project.totalRows) : "";
  refs.yarnInfo.value = combinePair(project.yarnType, project.yarnRef);
  refs.toolsInfo.value = combinePair(project.tools, project.needleSize);
  refs.textDiagram.value = project.textDiagram || "";
  const rows = getProjectRowsFromDailyStats(project);
  refs.rowCounter.textContent = String(rows);
  refs.progressText.textContent = `进度 ${getProjectProgress(project)}%（${rows}/${project.totalRows || 0} 行）`;
  refs.projectTimeSpent.textContent = `累计用时 ${formatDuration(project.spentSeconds)}`;

  if (project.coverImage) {
    refs.projectCoverPreview.src = project.coverImage;
    refs.projectCoverPreview.classList.add("show");
    if (refs.projectCoverRemoveBtn) refs.projectCoverRemoveBtn.hidden = false;
  } else {
    refs.projectCoverPreview.classList.remove("show");
    refs.projectCoverPreview.removeAttribute("src");
    if (refs.projectCoverRemoveBtn) refs.projectCoverRemoveBtn.hidden = true;
  }

  renderDiagramImages(project);
}

function syncDraftFields(project) {
  project.projectName = refs.projectName.value.trim() || project.projectName || "未命名作品";
  project.projectType = refs.projectType.value || "围巾";
  project.status = refs.projectStatus.value || "active";
  project.totalRows = Math.max(0, Number(refs.totalRows.value) || 0);
  const [yarnType, yarnRef] = splitPair(refs.yarnInfo.value);
  project.yarnType = yarnType;
  project.yarnRef = yarnRef;
  const [tools, needleSize] = splitPair(refs.toolsInfo.value);
  project.tools = tools;
  project.needleSize = needleSize;
  project.textDiagram = refs.textDiagram.value.trim();
}

async function compressCoverImage(file) {
  const maxSide = 1080;
  const maxLength = 380000;
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片读取失败"));
      img.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
  const sourceWidth = Number(image.width) || 1;
  const sourceHeight = Number(image.height) || 1;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxLength && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function showFeedback(message) {
  refs.feedbackToast.textContent = message;
  refs.feedbackToast.classList.add("show");
  setTimeout(() => refs.feedbackToast.classList.remove("show"), 1600);
}

function setSyncHint(text) {
  if (!refs.syncHint) return;
  const raw = String(text || "").trim();
  let icon = "☁️";
  let cls = "sync-state-idle";
  if (/失败|错误|不可用/.test(raw)) {
    icon = "❌";
    cls = "sync-state-error";
  } else if (/正在|监听|同步中/.test(raw)) {
    icon = "🔄";
    cls = "sync-state-syncing";
  } else if (/已同步|已初始化/.test(raw)) {
    icon = "✅";
    cls = "sync-state-ok";
  }
  refs.syncHint.className = `sync-state ${cls}`;
  refs.syncHint.textContent = `${icon} ${raw || "离线模式"}`;
}

function formatSyncErrorMessage(error, fallback = "请稍后重试") {
  const raw = String(error?.message || "").trim();
  const text = raw.toLowerCase();
  if (!raw) return fallback;
  if (text.includes("network") || text.includes("fetch") || text.includes("timeout")) return "网络波动，稍后自动重试";
  if (text.includes("auth") || text.includes("token") || text.includes("permission") || text.includes("unauthorized")) return "登录状态异常，请重新登录";
  return fallback;
}

function setAuthNav(user) {
  const loggedIn = Boolean(user && user.email);
  if (refs.accountChip) refs.accountChip.textContent = loggedIn ? `当前账号：${user.email}` : "未登录";
  if (refs.openLoginBtn) refs.openLoginBtn.hidden = loggedIn;
  if (refs.openRegisterBtn) refs.openRegisterBtn.hidden = loggedIn;
  if (refs.logoutBtn) refs.logoutBtn.hidden = !loggedIn;
}

function openAuthDialog(mode) {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = false;
  if (mode === "register" && refs.authStatus) refs.authStatus.textContent = "注册后将自动登录并开启云同步";
}

function closeAuthDialog() {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = true;
}

function replaceProjectsInPlace(target, next) {
  target.splice(0, target.length, ...next);
}

function scheduleCloudPush(projects) {
  if (!window.cloudSync || !window.cloudSync.isReady() || !window.cloudSync.getCurrentUser()) return;
  if (syncRuntime.pushTimerId) clearTimeout(syncRuntime.pushTimerId);
  syncRuntime.pushTimerId = setTimeout(async () => {
    const stamp = Date.now();
    syncRuntime.lastSeenCloudStamp = Math.max(syncRuntime.lastSeenCloudStamp, stamp);
    try {
      await window.cloudSync.pushState({ projects, timer: timerState, clientUpdatedAt: stamp });
      setSyncHint("已同步到云端");
    } catch (error) {
      setSyncHint(`云同步失败：${formatSyncErrorMessage(error)}`);
    }
  }, 700);
}

function applyCloudPayload(payload, projects, onRemoteApplied) {
  if (!payload || typeof payload !== "object") return;
  const stamp = Number(payload.clientUpdatedAt) || 0;
  if (stamp && stamp <= syncRuntime.lastSeenCloudStamp) return;
  let changed = false;
  if (Array.isArray(payload.projects)) {
    replaceProjectsInPlace(projects, payload.projects.map(normalizeProject));
    changed = true;
  }
  if (payload.timer && typeof payload.timer === "object") {
    timerState.minutes = Math.max(1, Number(payload.timer.minutes) || timerState.minutes);
    timerState.left = Math.max(0, Number(payload.timer.left) || timerState.left);
    timerState.running = false;
    saveTimerState({ scheduleCloud: false });
    renderTimerState();
    changed = true;
  }
  if (!changed) return;
  syncRuntime.lastSeenCloudStamp = Math.max(syncRuntime.lastSeenCloudStamp, stamp);
  saveProjects(projects, { scheduleCloud: false });
  if (typeof onRemoteApplied === "function") onRemoteApplied();
  setSyncHint("已从云端同步");
}

function setupCloudSync(projects, onRemoteApplied) {
  if (!window.cloudSync) return;
  if (typeof window.cloudSync.ensureSyncStarted === "function") void window.cloudSync.ensureSyncStarted();
  setAuthNav(window.cloudSync.getCurrentUser());

  document.querySelectorAll("#openLoginBtn").forEach((btn) => {
    btn.onclick = null;
    btn.addEventListener("click", () => openAuthDialog("login"));
  });
  document.querySelectorAll("#openRegisterBtn").forEach((btn) => {
    btn.onclick = null;
    btn.addEventListener("click", () => openAuthDialog("register"));
  });
  if (refs.closeAuthDialogBtn) refs.closeAuthDialogBtn.addEventListener("click", closeAuthDialog);
  if (refs.authDialog) refs.authDialog.addEventListener("click", (event) => {
    if (event.target === refs.authDialog) closeAuthDialog();
  });

  if (refs.logoutBtn) {
    refs.logoutBtn.onclick = async () => {
      try {
        await window.cloudSync.signOut();
        setSyncHint("已退出登录");
      } catch (error) {
        setSyncHint(`退出失败：${formatSyncErrorMessage(error)}`);
      }
    };
  }

  window.cloudSync.bindAuthUI({
    emailInput: refs.authEmail,
    passwordInput: refs.authPassword,
    statusEl: refs.authStatus,
    loginBtn: refs.loginBtn,
    registerBtn: refs.registerBtn,
    logoutBtn: refs.logoutBtn,
    onUserChanged: async (user) => {
      setAuthNav(user);
      if (typeof syncRuntime.remoteUnsubscribe === "function") {
        syncRuntime.remoteUnsubscribe();
        syncRuntime.remoteUnsubscribe = null;
      }
      if (!user) {
        setSyncHint("离线模式");
        return;
      }
      closeAuthDialog();
      setSyncHint("正在同步云端...");
      try {
        const remote = await window.cloudSync.pullState();
        if (remote) {
          applyCloudPayload(remote, projects, onRemoteApplied);
        } else {
          scheduleCloudPush(projects);
          setSyncHint("云端已初始化");
        }
      } catch (error) {
        setSyncHint(`拉取云端失败：${formatSyncErrorMessage(error)}`);
      }
      syncRuntime.remoteUnsubscribe = window.cloudSync.watchRemoteState(
        (payload) => applyCloudPayload(payload, projects, onRemoteApplied),
        (error) => setSyncHint(`监听同步失败：${formatSyncErrorMessage(error)}`)
      );
    },
  });

  if (refs.syncHint) {
    refs.syncHint.addEventListener("click", async () => {
      if (!window.cloudSync || !window.cloudSync.getCurrentUser()) {
        setSyncHint("离线模式");
        return;
      }
      try {
        const remote = await window.cloudSync.pullState();
        if (remote) applyCloudPayload(remote, projects, onRemoteApplied);
        scheduleCloudPush(projects);
      } catch (error) {
        setSyncHint(`拉取云端失败：${formatSyncErrorMessage(error)}`);
      }
    });
  }
}

function saveTimerState(options = {}) {
  safeSetLocalStorage(GLOBAL_TIMER_KEY, JSON.stringify(timerState), {
    onError(error, meta) {
      if (runtimeWarnings.timerStorageWarned) return;
      runtimeWarnings.timerStorageWarned = true;
      const notice = meta.isQuota ? "本地临时保存受限，计时将继续运行" : "本地保存暂不可用，计时将继续运行";
      setSyncHint(notice);
      console.warn("timer state persistence skipped", error);
    },
  });
  if (options.scheduleCloud) scheduleCloudPush(options.projects || []);
}

function loadTimerState() {
  const saved = localStorage.getItem(GLOBAL_TIMER_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    timerState.minutes = Math.max(1, Number(parsed.minutes) || 25);
    timerState.left = Math.max(0, Number(parsed.left) || timerState.minutes * 60);
    timerState.running = false;
  } catch {
    timerState.minutes = 25;
    timerState.left = 25 * 60;
    timerState.running = false;
  }
}

function renderTimerState() {
  if (!refs.globalTimerMinutes || !refs.globalTimerDisplay) return;
  refs.globalTimerMinutes.value = String(timerState.minutes);
  const min = Math.floor(timerState.left / 60).toString().padStart(2, "0");
  const sec = Math.floor(timerState.left % 60).toString().padStart(2, "0");
  refs.globalTimerDisplay.textContent = `${min}:${sec}`;
}

function bindGlobalTimer(getProject, persist, projects) {
  if (!refs.globalTimerMinutes || !refs.globalStartBtn || !refs.globalPauseBtn || !refs.globalResetBtn) return;
  refs.globalTimerMinutes.addEventListener("change", () => {
    timerState.minutes = Math.max(1, Number(refs.globalTimerMinutes.value) || 25);
    if (!timerState.running) timerState.left = timerState.minutes * 60;
    saveTimerState({ scheduleCloud: true, projects });
    renderTimerState();
  });

  refs.globalStartBtn.addEventListener("click", () => {
    if (timerState.running) return;
    timerState.running = true;
    globalTimerId = setInterval(() => {
      const currentProject = getProject();
      if (timerState.left <= 0) {
        timerState.running = false;
        clearInterval(globalTimerId);
        globalTimerId = null;
        saveTimerState({ scheduleCloud: true, projects });
        renderTimerState();
        return;
      }
      timerState.left -= 1;
      if (currentProject) {
        if (currentProject.lastDate !== getToday()) {
          currentProject.todayRows = 0;
          currentProject.todaySeconds = 0;
          currentProject.lastDate = getToday();
        }
        recordProjectSeconds(currentProject, 1);
        projectTimeTick += 1;
        if (projectTimeTick >= 5) {
          projectTimeTick = 0;
          persist({ quiet: true });
        }
      }
      saveTimerState();
      renderTimerState();
    }, 1000);
    saveTimerState({ scheduleCloud: true, projects });
  });

  refs.globalPauseBtn.addEventListener("click", () => {
    timerState.running = false;
    if (globalTimerId) {
      clearInterval(globalTimerId);
      globalTimerId = null;
    }
    saveTimerState({ scheduleCloud: true, projects });
    renderTimerState();
  });

  refs.globalResetBtn.addEventListener("click", () => {
    timerState.running = false;
    if (globalTimerId) {
      clearInterval(globalTimerId);
      globalTimerId = null;
    }
    timerState.left = timerState.minutes * 60;
    saveTimerState({ scheduleCloud: true, projects });
    renderTimerState();
  });
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function init() {
  setupMobileAuthMenu();
  const projectId = getProjectIdFromUrl();
  const projects = loadProjects();
  let project = projects.find((item) => item.id === projectId);
  if (!project) {
    window.location.href = "index.html";
    return;
  }

  if (project.lastDate !== getToday()) {
    project.todayRows = 0;
    project.todaySeconds = 0;
    project.lastDate = getToday();
  }

  const persist = (options = {}) => {
    project.updatedAt = Date.now();
    const index = projects.findIndex((item) => item.id === project.id);
    if (index < 0) return false;
    projects[index] = project;
    const saved = saveProjects(projects, { scheduleCloud: options.scheduleCloud !== false });
    if (!saved) {
      if (!options.quiet) showFeedback("保存失败：本地存储空间不足");
      return false;
    }
    if (!options.quiet) renderProject(project);
    return true;
  };

  const persistWithCelebration = (beforeStatus) => {
    const ok = persist();
    if (ok && beforeStatus !== "done" && project.status === "done") {
      const layer = document.createElement("div");
      layer.className = "celebration-layer";
      const badge = document.createElement("div");
      badge.className = "celebration-badge";
      badge.textContent = `🎉 恭喜完成：${project.projectName || "编织项目"}`;
      layer.appendChild(badge);
      document.body.appendChild(layer);
      setTimeout(() => layer.remove(), 2200);
    }
    return ok;
  };

  renderProject(project);

  refs.projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const before = project.status;
    syncDraftFields(project);
    if (persistWithCelebration(before)) showFeedback("项目已保存");
  });

  document.querySelector("[data-action='incRow']")?.addEventListener("click", () => {
    const before = project.status;
    recordProjectRows(project, 1);
    persistWithCelebration(before);
  });

  document.querySelector("[data-action='decRow']")?.addEventListener("click", () => {
    project.rows = Math.max(0, Number(project.rows) - 1);
    const entry = ensureProjectDailyEntry(project, getToday());
    entry.rows = Math.max(0, Number(entry.rows) - 1);
    project.todayRows = entry.rows;
    persist();
  });

  document.querySelector("[data-action='addStep']")?.addEventListener("click", () => {
    const before = project.status;
    const step = Math.max(1, Number(refs.stepInput?.value) || 1);
    recordProjectRows(project, step);
    persistWithCelebration(before);
  });

  refs.projectCoverInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const previous = project.coverImage;
    try {
      syncDraftFields(project);
      project.coverImage = await compressCoverImage(file);
      if (!persist()) {
        project.coverImage = previous;
        persist();
        alert("图片体积较大导致无法保存，请换更小的封面图。");
      }
    } catch (error) {
      project.coverImage = previous;
      alert(`封面处理失败：${error.message || "请换一张图片重试"}`);
    }
    refs.projectCoverInput.value = "";
  });

  refs.projectCoverRemoveBtn?.addEventListener("click", () => {
    const previous = project.coverImage;
    syncDraftFields(project);
    project.coverImage = "";
    if (!persist()) {
      project.coverImage = previous;
      persist();
      alert("删除封面失败，请稍后重试。");
    }
    refs.projectCoverInput.value = "";
  });

  refs.diagramImageInput?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const previous = Array.isArray(project.diagramImages) ? [...project.diagramImages] : [];
    try {
      syncDraftFields(project);
      const validFiles = files.filter((file) => String(file.type || "").startsWith("image/"));
      if (!validFiles.length) {
        alert("请选择图片文件。\n支持一次选择多张。");
        return;
      }
      const compressed = await Promise.all(validFiles.map((file) => compressCoverImage(file)));
      project.diagramImages = [...previous, ...compressed];
      project.diagramImage = project.diagramImages[0] || "";
      if (!persist()) {
        project.diagramImages = previous;
        project.diagramImage = previous[0] || "";
        persist();
        alert("图片体积较大导致无法保存，请换更小的图解图。");
      }
    } catch (error) {
      project.diagramImages = previous;
      project.diagramImage = previous[0] || "";
      alert(`图解图片处理失败：${error.message || "请换一张图片重试"}`);
    }
    refs.diagramImageInput.value = "";
  });

  refs.diagramImageGallery?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".diagram-image-remove");
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    const previous = Array.isArray(project.diagramImages) ? [...project.diagramImages] : [];
    const next = previous.filter((_, itemIndex) => itemIndex !== index);
    project.diagramImages = next;
    project.diagramImage = next[0] || "";
    if (!persist()) {
      project.diagramImages = previous;
      project.diagramImage = previous[0] || "";
      persist();
      alert("删除图片失败，请稍后重试。");
    }
  });

  loadTimerState();
  renderTimerState();
  bindGlobalTimer(() => project, persist, projects);

  setupCloudSync(projects, () => {
    const updated = projects.find((item) => item.id === projectId);
    if (!updated) {
      alert("该项目已在其他设备被删除，正在返回首页。");
      window.location.href = "index.html";
      return;
    }
    project = updated;
    renderProject(project);
  });
}

init();
