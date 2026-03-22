const STORAGE_KEY = "knit-helper-state";
const GLOBAL_TIMER_KEY = "knit-global-timer";

const STATUS_MAP = {
  active: { label: "进行中", icon: "🧶" },
  paused: { label: "搁置", icon: "⏸️" },
  done: { label: "已完成", icon: "✅" },
};

const refs = {
  projectTitle: document.getElementById("projectTitle"),
  projectForm: document.getElementById("projectForm"),
  projectName: document.getElementById("projectName"),
  projectType: document.getElementById("projectType"),
  projectStatus: document.getElementById("projectStatus"),
  totalRows: document.getElementById("totalRows"),
  yarnType: document.getElementById("yarnType"),
  yarnRef: document.getElementById("yarnRef"),
  tools: document.getElementById("tools"),
  needleSize: document.getElementById("needleSize"),
  patternName: document.getElementById("patternName"),
  textDiagram: document.getElementById("textDiagram"),
  projectCoverInput: document.getElementById("projectCoverInput"),
  projectCoverPreview: document.getElementById("projectCoverPreview"),
  rowCounter: document.getElementById("rowCounter"),
  progressText: document.getElementById("progressText"),
  stepInput: document.getElementById("stepInput"),
  materialForm: document.getElementById("materialForm"),
  materialInput: document.getElementById("materialInput"),
  materialList: document.getElementById("materialList"),
  notes: document.getElementById("notes"),
  exportCurrentImageBtn: document.getElementById("exportCurrentImageBtn"),
  downloadCurrentImageLink: document.getElementById("downloadCurrentImageLink"),
  exportCanvas: document.getElementById("exportCanvas"),
  exportImagePreview: document.getElementById("exportImagePreview"),
  globalTimerDisplay: document.getElementById("globalTimerDisplay"),
  globalTimerMinutes: document.getElementById("globalTimerMinutes"),
  globalStartBtn: document.getElementById("globalStartBtn"),
  globalPauseBtn: document.getElementById("globalPauseBtn"),
  globalResetBtn: document.getElementById("globalResetBtn"),
  feedbackToast: document.getElementById("feedbackToast"),
};

const timerState = {
  minutes: 25,
  left: 25 * 60,
  running: false,
};

let globalTimerId = null;

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function createProject(name = "我的新作品") {
  return {
    id: makeId(),
    projectName: name,
    projectType: "围巾",
    status: "active",
    yarnType: "",
    yarnRef: "",
    tools: "",
    needleSize: "",
    patternName: "",
    totalRows: 0,
    coverImage: "",
    textDiagram: "",
    rows: 0,
    todayRows: 0,
    materials: [],
    notes: "",
    lastDate: getToday(),
  };
}

function normalizeProject(project) {
  return {
    ...createProject(project.projectName || "未命名作品"),
    ...project,
    id: project.id || makeId(),
    totalRows: Math.max(0, Number(project.totalRows) || 0),
    rows: Math.max(0, Number(project.rows) || 0),
    todayRows: Math.max(0, Number(project.todayRows) || 0),
    materials: Array.isArray(project.materials) ? project.materials : [],
    lastDate: project.lastDate || getToday(),
  };
}

function getProjectProgress(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((project.rows / total) * 100));
}

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [createProject("我的第一件作品")];
  try {
    const parsed = JSON.parse(saved);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    return list.length ? list.map(normalizeProject) : [createProject("我的第一件作品")];
  } catch {
    return [createProject("我的第一件作品")];
  }
}

function saveProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects }));
    return true;
  } catch (error) {
    if (error && error.name === "QuotaExceededError") {
      return false;
    }
    throw error;
  }
}

async function compressCoverImage(file) {
  const maxSide = 1080;
  const maxLength = 380_000;

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

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function renderMaterials(project, onChanged) {
  if (!refs.materialList) return;
  refs.materialList.innerHTML = "";
  project.materials.forEach((item) => {
    const li = document.createElement("li");
    if (item.done) li.classList.add("done");

    const text = document.createElement("span");
    text.textContent = item.text;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn ghost";
    toggleBtn.textContent = item.done ? "取消" : "完成";
    toggleBtn.addEventListener("click", () => {
      item.done = !item.done;
      onChanged();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      project.materials = project.materials.filter((m) => m.id !== item.id);
      onChanged();
    });

    actions.append(toggleBtn, removeBtn);
    li.append(text, actions);
    refs.materialList.appendChild(li);
  });
}

function renderProject(project) {
  refs.projectTitle.textContent = project.projectName || "项目详情";
  refs.projectName.value = project.projectName || "";
  refs.projectType.value = project.projectType || "围巾";
  refs.projectStatus.value = project.status || "active";
  refs.totalRows.value = project.totalRows ? String(project.totalRows) : "";
  refs.yarnType.value = project.yarnType || "";
  refs.yarnRef.value = project.yarnRef || "";
  refs.tools.value = project.tools || "";
  refs.needleSize.value = project.needleSize || "";
  refs.patternName.value = project.patternName || "";
  refs.textDiagram.value = project.textDiagram || "";
  refs.notes.value = project.notes || "";
  refs.rowCounter.textContent = String(project.rows || 0);
  refs.progressText.textContent = `进度 ${getProjectProgress(project)}%（${project.rows || 0}/${project.totalRows || 0} 行）`;

  if (project.coverImage) {
    refs.projectCoverPreview.src = project.coverImage;
    refs.projectCoverPreview.classList.add("show");
  } else {
    refs.projectCoverPreview.classList.remove("show");
    refs.projectCoverPreview.removeAttribute("src");
  }
}

function syncDraftFields(project) {
  project.projectName = refs.projectName.value.trim() || project.projectName || "未命名作品";
  project.projectType = refs.projectType.value;
  project.status = refs.projectStatus.value;
  project.totalRows = Math.max(0, Number(refs.totalRows.value) || 0);
  project.yarnType = refs.yarnType.value.trim();
  project.yarnRef = refs.yarnRef.value.trim();
  project.tools = refs.tools.value.trim();
  project.needleSize = refs.needleSize.value.trim();
  project.patternName = refs.patternName.value.trim();
  project.textDiagram = refs.textDiagram.value.trim();
  project.notes = refs.notes.value;
}

function buildExportImageLines(project) {
  const status = STATUS_MAP[project.status] || STATUS_MAP.active;
  const lines = [
    "织伴 | 项目导出",
    `项目名称：${project.projectName || "未命名作品"}`,
    `类型：${project.projectType || "未填写"}`,
    `状态：${status.label}`,
    `线材：${project.yarnType || "未填写"}`,
    `品牌/色号：${project.yarnRef || "未填写"}`,
    `工具：${project.tools || "未填写"}`,
    `针号：${project.needleSize || "未填写"}`,
    `花样：${project.patternName || "未填写"}`,
    `进度：${getProjectProgress(project)}%（${project.rows || 0}/${project.totalRows || 0} 行）`,
    "------------------------------",
    "文字图解：",
  ];

  String(project.textDiagram || "未填写").split(/\r?\n/).forEach((row) => {
    const text = row.trim();
    if (!text) {
      lines.push(" ");
      return;
    }
    for (let i = 0; i < text.length; i += 28) {
      lines.push(text.slice(i, i + 28));
    }
  });
  return lines;
}

function drawExportBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#fff8ef");
  bg.addColorStop(1, "#fff3e4");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#ffd3b0";
  ctx.beginPath();
  ctx.arc(140, 120, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#cfeadb";
  ctx.beginPath();
  ctx.arc(width - 120, 110, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function showFeedback(message) {
  refs.feedbackToast.textContent = message;
  refs.feedbackToast.classList.add("show");
  setTimeout(() => {
    refs.feedbackToast.classList.remove("show");
  }, 1600);
}

function exportProjectImage(project) {
  const lines = buildExportImageLines(project);
  const canvas = refs.exportCanvas;
  const ctx = canvas.getContext("2d");
  const width = 1100;
  const lineHeight = 42;
  const height = Math.max(1400, 140 + lines.length * lineHeight);

  canvas.width = width;
  canvas.height = height;

  drawExportBackground(ctx, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.strokeStyle = "#ead6bf";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(40, 40, width - 80, height - 80, 28);
  } else {
    ctx.rect(40, 40, width - 80, height - 80);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#25303b";
  ctx.font = "30px sans-serif";

  lines.forEach((line, index) => {
    ctx.fillText(line, 80, 100 + index * lineHeight);
  });

  const dataUrl = canvas.toDataURL("image/png");
  refs.exportImagePreview.src = dataUrl;
  refs.exportImagePreview.classList.add("show");
  refs.downloadCurrentImageLink.href = dataUrl;
  refs.downloadCurrentImageLink.download = `${project.projectName || "knit-project"}-${getToday()}.png`;
}

function saveTimerState() {
  localStorage.setItem(GLOBAL_TIMER_KEY, JSON.stringify(timerState));
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
  refs.globalTimerMinutes.value = String(timerState.minutes);
  refs.globalTimerDisplay.textContent = formatTime(timerState.left);
}

function bindGlobalTimer() {
  refs.globalTimerMinutes.addEventListener("change", () => {
    timerState.minutes = Math.max(1, Number(refs.globalTimerMinutes.value) || 25);
    if (!timerState.running) timerState.left = timerState.minutes * 60;
    saveTimerState();
    renderTimerState();
  });

  refs.globalStartBtn.addEventListener("click", () => {
    if (timerState.running) return;
    timerState.running = true;
    globalTimerId = setInterval(() => {
      if (timerState.left > 0) {
        timerState.left -= 1;
        saveTimerState();
        renderTimerState();
        return;
      }
      clearInterval(globalTimerId);
      timerState.running = false;
      saveTimerState();
      alert("计时结束，记得活动一下肩颈。");
    }, 1000);
  });

  refs.globalPauseBtn.addEventListener("click", () => {
    clearInterval(globalTimerId);
    timerState.running = false;
    saveTimerState();
  });

  refs.globalResetBtn.addEventListener("click", () => {
    clearInterval(globalTimerId);
    timerState.running = false;
    timerState.left = timerState.minutes * 60;
    saveTimerState();
    renderTimerState();
  });
}

function init() {
  const projectId = getProjectIdFromUrl();
  const projects = loadProjects();
  let project = projects.find((item) => item.id === projectId);

  if (!project) {
    alert("未找到该项目，已返回首页。");
    window.location.href = "index.html";
    return;
  }

  const persist = () => {
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) {
      projects[index] = project;
      const saved = saveProjects(projects);
      if (!saved) {
        showFeedback("保存失败：本地存储空间不足");
        return false;
      }
      renderProject(project);
      renderMaterials(project, persist);
      return true;
    }
    return false;
  };

  renderProject(project);
  renderMaterials(project, persist);

  refs.projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    syncDraftFields(project);
    if (persist()) {
      showFeedback("项目已保存");
    }
  });

  refs.projectCoverInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previousCover = project.coverImage;
    try {
      // 先把当前页面草稿同步进对象，再更新封面，避免未点击“保存”时字段被重置。
      syncDraftFields(project);
      project.coverImage = await compressCoverImage(file);
      if (!persist()) {
        project.coverImage = previousCover;
        persist();
        alert("图片体积较大导致无法保存，请换更小的封面图。");
      }
    } catch (error) {
      project.coverImage = previousCover;
      alert(`封面处理失败：${error.message || "请换一张图片重试"}`);
    }

    refs.projectCoverInput.value = "";
  });

  refs.notes.addEventListener("input", () => {
    project.notes = refs.notes.value;
    persist();
  });

  document.querySelector("[data-action='incRow']").addEventListener("click", () => {
    project.rows += 1;
    project.todayRows += 1;
    project.lastDate = getToday();
    persist();
  });

  document.querySelector("[data-action='decRow']").addEventListener("click", () => {
    project.rows = Math.max(0, project.rows - 1);
    persist();
  });

  document.querySelector("[data-action='addStep']").addEventListener("click", () => {
    const step = Math.max(1, Number(refs.stepInput.value) || 1);
    project.rows += step;
    project.todayRows += step;
    project.lastDate = getToday();
    persist();
  });

  document.querySelector("[data-action='resetRows']").addEventListener("click", () => {
    project.rows = 0;
    project.todayRows = 0;
    persist();
  });

  if (refs.materialForm && refs.materialInput) {
    refs.materialForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = refs.materialInput.value.trim();
      if (!text) return;
      project.materials.push({ id: makeId(), text, done: false });
      refs.materialInput.value = "";
      persist();
    });
  }

  refs.exportCurrentImageBtn.addEventListener("click", () => {
    exportProjectImage(project);
  });

  loadTimerState();
  renderTimerState();
  bindGlobalTimer();
}

init();
