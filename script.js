const STORAGE_KEY = "knit-helper-state";
const GLOBAL_TIMER_KEY = "knit-global-timer";

const STATUS_MAP = {
  active: { label: "进行中", icon: "🧶" },
  paused: { label: "搁置", icon: "⏸️" },
  done: { label: "已完成", icon: "✅" },
};

const state = {
  projects: [],
  dashboardFilter: "all",
};

const timerState = {
  minutes: 25,
  left: 25 * 60,
  running: false,
};

let timerId = null;

const refs = {
  projectCards: document.getElementById("projectCards"),
  statusFilters: document.getElementById("statusFilters"),
  projectCount: document.getElementById("projectCount"),
  activeCount: document.getElementById("activeCount"),
  createProjectBtn: document.getElementById("createProjectBtn"),
  exportProjectsBtn: document.getElementById("exportProjectsBtn"),
  importProjectsBtn: document.getElementById("importProjectsBtn"),
  importProjectsInput: document.getElementById("importProjectsInput"),
  parseDiagramBtn: document.getElementById("parseDiagramBtn"),
  diagramImportText: document.getElementById("diagramImportText"),
  pickDiagramImageBtn: document.getElementById("pickDiagramImageBtn"),
  ocrDiagramImageBtn: document.getElementById("ocrDiagramImageBtn"),
  diagramImageInput: document.getElementById("diagramImageInput"),
  diagramImageStatus: document.getElementById("diagramImageStatus"),
  dashboardExportCanvas: document.getElementById("dashboardExportCanvas"),
  globalTimerDisplay: document.getElementById("globalTimerDisplay"),
  globalTimerMinutes: document.getElementById("globalTimerMinutes"),
  globalStartBtn: document.getElementById("globalStartBtn"),
  globalPauseBtn: document.getElementById("globalPauseBtn"),
  globalResetBtn: document.getElementById("globalResetBtn"),
};

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
    projectType: project.projectType || "围巾",
    status: project.status || "active",
    totalRows: Math.max(0, Number(project.totalRows) || 0),
    rows: Math.max(0, Number(project.rows) || 0),
    todayRows: Math.max(0, Number(project.todayRows) || 0),
    materials: Array.isArray(project.materials) ? project.materials : [],
    lastDate: project.lastDate || getToday(),
  };
}

function parseDiagramText(rawText) {
  const lines = String(rawText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = { projectName: "", tools: "", materials: "", textDiagram: "" };
  const aliasMap = {
    项目名称: "projectName", 名称: "projectName", 作品名: "projectName",
    工具: "tools", 工具针具: "tools", 针具: "tools",
    材料: "materials", 用料: "materials", 线材: "materials",
    文字图解: "textDiagram", 图解: "textDiagram", 步骤: "textDiagram", 说明: "textDiagram",
  };
  let section = "textDiagram";
  lines.forEach((line) => {
    const hit = line.match(/^([^：:]{1,12})\s*[：:]\s*(.*)$/);
    if (hit) {
      const mapped = aliasMap[hit[1].trim()];
      const value = (hit[2] || "").trim();
      if (mapped) {
        section = mapped;
        if (value) result[mapped] = result[mapped] ? `${result[mapped]}\n${value}` : value;
        return;
      }
    }
    result[section] = result[section] ? `${result[section]}\n${line}` : line;
  });
  if (!result.projectName) result.projectName = `导入作品 ${getToday()}`;
  return result;
}

function parseMaterialsToList(rawMaterials) {
  return String(rawMaterials || "")
    .split(/[\n,，;；、]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text) => ({ id: makeId(), text, done: false }));
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

function exportProjectImage(project) {
  const lines = buildExportImageLines(project);
  const canvas = refs.dashboardExportCanvas;
  const ctx = canvas.getContext("2d");
  const width = 1200;
  const lineHeight = 42;
  const height = Math.max(1500, 200 + lines.length * lineHeight);

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
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${project.projectName || "knit-project"}-${getToday()}.png`;
  a.click();
}

function getProjectProgress(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((project.rows / total) * 100));
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: state.projects }));
}

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    state.projects = [createProject("我的第一件作品")];
    saveProjects();
    return;
  }
  try {
    const parsed = JSON.parse(saved);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    state.projects = list.map(normalizeProject);
  } catch {
    state.projects = [createProject("我的第一件作品")];
  }
  if (!state.projects.length) state.projects = [createProject("我的第一件作品")];
  state.projects.forEach((project) => {
    if (project.lastDate !== getToday()) {
      project.todayRows = 0;
      project.lastDate = getToday();
    }
  });
}

function renderDashboard() {
  const filtered = state.projects.filter((project) => {
    if (state.dashboardFilter === "all") return true;
    return project.status === state.dashboardFilter;
  });

  refs.projectCards.innerHTML = "";
  refs.projectCount.textContent = String(state.projects.length);
  refs.activeCount.textContent = String(state.projects.filter((project) => project.status === "active").length);

  if (!filtered.length) {
    const tip = document.createElement("p");
    tip.className = "helper-text";
    tip.textContent = "当前筛选条件下没有项目。";
    refs.projectCards.appendChild(tip);
    return;
  }

  filtered.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";

    const cover = document.createElement("img");
    cover.className = "project-cover";
    cover.alt = `${project.projectName || "项目"}封面`;
    cover.src = project.coverImage || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='320'><rect width='100%' height='100%' fill='%23f2e7db'/><text x='50%' y='50%' fill='%23997f66' dominant-baseline='middle' text-anchor='middle' font-size='22'>未上传封面</text></svg>";

    const title = document.createElement("h3");
    title.textContent = project.projectName || "未命名作品";

    const statusMeta = STATUS_MAP[project.status] || STATUS_MAP.active;
    const meta = document.createElement("p");
    meta.className = "project-meta";
    meta.textContent = `${statusMeta.icon} ${statusMeta.label} · ${project.projectType || "其他"}`;

    const progress = getProjectProgress(project);
    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${progress}%`;
    track.appendChild(fill);

    const progressText = document.createElement("p");
    progressText.className = "project-meta";
    progressText.textContent = `进度 ${progress}%（${project.rows || 0}/${project.totalRows || 0} 行）`;

    const actions = document.createElement("div");
    actions.className = "project-card-actions";
    const openBtn = document.createElement("a");
    openBtn.className = "btn ghost";
    openBtn.href = `project.html?id=${encodeURIComponent(project.id)}`;
    openBtn.textContent = "进入项目";

    const statusBtn = document.createElement("button");
    statusBtn.className = "btn primary";
    statusBtn.textContent = "切换状态";
    statusBtn.addEventListener("click", () => {
      project.status = project.status === "active" ? "paused" : project.status === "paused" ? "done" : "active";
      saveProjects();
      renderDashboard();
    });

    const exportBtn = document.createElement("button");
    exportBtn.className = "btn ghost";
    exportBtn.textContent = "导出图片";
    exportBtn.addEventListener("click", () => {
      exportProjectImage(project);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`确认删除项目“${project.projectName || "未命名作品"}”？`)) return;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      if (!state.projects.length) {
        state.projects = [createProject("我的第一件作品")];
      }
      saveProjects();
      renderDashboard();
    });

    actions.append(openBtn, statusBtn, exportBtn, deleteBtn);
    card.append(cover, title, meta, track, progressText, actions);
    refs.projectCards.appendChild(card);
  });
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
    timerId = setInterval(() => {
      if (timerState.left > 0) {
        timerState.left -= 1;
        saveTimerState();
        renderTimerState();
        return;
      }
      clearInterval(timerId);
      timerState.running = false;
      saveTimerState();
      alert("计时结束，记得活动一下肩颈。");
    }, 1000);
  });

  refs.globalPauseBtn.addEventListener("click", () => {
    clearInterval(timerId);
    timerState.running = false;
    saveTimerState();
  });

  refs.globalResetBtn.addEventListener("click", () => {
    clearInterval(timerId);
    timerState.running = false;
    timerState.left = timerState.minutes * 60;
    saveTimerState();
    renderTimerState();
  });
}

async function ocrImageFile(file) {
  if (!window.Tesseract) throw new Error("OCR库未加载，请检查网络后重试。");
  const result = await window.Tesseract.recognize(file, "chi_sim+eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        refs.diagramImageStatus.textContent = `识别中 ${(message.progress * 100).toFixed(0)}%`;
      }
    },
  });
  return String(result?.data?.text || "").trim();
}

function bindActions() {
  refs.statusFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-filter]");
    if (!target) return;
    state.dashboardFilter = target.dataset.filter;
    refs.statusFilters.querySelectorAll("button[data-filter]").forEach((btn) => btn.classList.toggle("is-active", btn === target));
    renderDashboard();
  });

  refs.createProjectBtn.addEventListener("click", () => {
    const created = createProject(`新作品 ${state.projects.length + 1}`);
    state.projects.push(created);
    saveProjects();
    window.location.href = `project.html?id=${encodeURIComponent(created.id)}`;
  });

  refs.exportProjectsBtn.addEventListener("click", () => {
    if (!state.projects.length) {
      alert("没有可导出的项目。");
      return;
    }
    const target = state.projects.find((project) => project.status === "active") || state.projects[0];
    exportProjectImage(target);
  });

  refs.importProjectsBtn.addEventListener("click", () => refs.importProjectsInput.click());
  refs.importProjectsInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.projects;
      if (!Array.isArray(list) || !list.length) return alert("导入失败：JSON 中没有可用作品。");
      state.projects = state.projects.concat(list.map((item) => normalizeProject(item)));
      saveProjects();
      renderDashboard();
      alert(`导入成功：新增 ${list.length} 个作品。`);
    } catch {
      alert("导入失败：请确认文件是合法 JSON。");
    } finally {
      refs.importProjectsInput.value = "";
    }
  });

  refs.parseDiagramBtn.addEventListener("click", () => {
    const raw = refs.diagramImportText.value.trim();
    if (!raw) return alert("请先粘贴图解文本。");
    const parsed = parseDiagramText(raw);
    const created = createProject(parsed.projectName);
    created.tools = parsed.tools;
    created.materials = parseMaterialsToList(parsed.materials);
    created.textDiagram = parsed.textDiagram;
    state.projects.push(created);
    refs.diagramImportText.value = "";
    saveProjects();
    renderDashboard();
    alert("图解解析成功，已新建项目。点击卡片进入项目页。");
  });

  refs.pickDiagramImageBtn.addEventListener("click", () => refs.diagramImageInput.click());
  refs.diagramImageInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    refs.diagramImageStatus.textContent = file ? `已选择：${file.name}` : "未选择图片";
  });

  refs.ocrDiagramImageBtn.addEventListener("click", async () => {
    const file = refs.diagramImageInput.files?.[0];
    if (!file) return alert("请先选择图解图片。");
    try {
      refs.diagramImageStatus.textContent = "开始识别...";
      const text = await ocrImageFile(file);
      if (!text) {
        refs.diagramImageStatus.textContent = "识别完成，未提取到文字";
        return alert("识别完成，但未提取到文字。请换更清晰图片。");
      }
      refs.diagramImportText.value = text;
      const parsed = parseDiagramText(text);
      const created = createProject(parsed.projectName);
      created.tools = parsed.tools;
      created.materials = parseMaterialsToList(parsed.materials);
      created.textDiagram = parsed.textDiagram || text;
      state.projects.push(created);
      saveProjects();
      renderDashboard();
      refs.diagramImageStatus.textContent = "识别完成，已自动新建项目";
      alert("图片识别成功，已自动新建项目。");
    } catch (error) {
      refs.diagramImageStatus.textContent = "识别失败";
      alert(`图片识别失败：${error.message || "请稍后重试"}`);
    }
  });
}

function init() {
  loadProjects();
  loadTimerState();
  renderDashboard();
  renderTimerState();
  bindActions();
  bindGlobalTimer();
}

init();
