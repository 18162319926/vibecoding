const STORAGE_KEY = "knit-helper-state";
const GLOBAL_TIMER_KEY = "knit-global-timer";

const STATUS_MAP = {
  active: { label: "进行中", icon: "🧶" },
  paused: { label: "搁置", icon: "⏸️" },
  done: { label: "已完成", icon: "✅" },
};

const EXPORT_STYLE_OPTIONS = [
  { value: "classic", label: "经典卡片" },
  { value: "journal", label: "手帐拼贴" },
  { value: "minimal", label: "极简留白" },
];

const state = {
  projects: [],
  dashboardFilter: "all",
};

const syncRuntime = {
  pushTimerId: null,
  remoteUnsubscribe: null,
  lastSeenCloudStamp: 0,
};

const timerState = {
  minutes: 25,
  left: 25 * 60,
  running: false,
};

let timerId = null;
let pendingExportProjectId = "";

function closeExportChoiceDialog() {
  if (!refs.exportChoiceDialog) return;
  refs.exportChoiceDialog.hidden = true;
  pendingExportProjectId = "";
  if (refs.exportPreviewImage) {
    refs.exportPreviewImage.classList.remove("show");
    refs.exportPreviewImage.removeAttribute("src");
  }
  if (refs.exportPreviewDownloadLink) {
    refs.exportPreviewDownloadLink.classList.remove("show");
    refs.exportPreviewDownloadLink.href = "#";
  }
}

const refs = {
  projectCards: document.getElementById("projectCards"),
  statusFilters: document.getElementById("statusFilters"),
  projectCount: document.getElementById("projectCount"),
  activeCount: document.getElementById("activeCount"),
  createProjectBtn: document.getElementById("createProjectBtn"),
  createMenuWrap: document.getElementById("createMenuWrap"),
  createProjectMenu: document.getElementById("createProjectMenu"),
  createBlankOption: document.getElementById("createBlankOption"),
  createFromImageOption: document.getElementById("createFromImageOption"),
  createFromTextOption: document.getElementById("createFromTextOption"),
  diagramImageInput: document.getElementById("diagramImageInput"),
  dashboardExportCanvas: document.getElementById("dashboardExportCanvas"),
  exportChoiceDialog: document.getElementById("exportChoiceDialog"),
  exportPreviewBtn: document.getElementById("exportPreviewBtn"),
  exportDirectDownloadBtn: document.getElementById("exportDirectDownloadBtn"),
  exportCloseBtn: document.getElementById("exportCloseBtn"),
  exportPreviewImage: document.getElementById("exportPreviewImage"),
  exportPreviewDownloadLink: document.getElementById("exportPreviewDownloadLink"),
  globalTimerDisplay: document.getElementById("globalTimerDisplay"),
  globalTimerMinutes: document.getElementById("globalTimerMinutes"),
  globalStartBtn: document.getElementById("globalStartBtn"),
  globalPauseBtn: document.getElementById("globalPauseBtn"),
  globalResetBtn: document.getElementById("globalResetBtn"),
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
    status: "paused",
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
    spentSeconds: 0,
    exportStyle: "classic",
    lastDate: getToday(),
  };
}

function normalizeProject(project) {
  const normalized = {
    ...createProject(project.projectName || "未命名作品"),
    ...project,
    id: project.id || makeId(),
    projectType: project.projectType || "围巾",
    status: project.status || "paused",
    totalRows: Math.max(0, Number(project.totalRows) || 0),
    rows: Math.max(0, Number(project.rows) || 0),
    todayRows: Math.max(0, Number(project.todayRows) || 0),
    spentSeconds: Math.max(0, Number(project.spentSeconds) || 0),
    materials: Array.isArray(project.materials) ? project.materials : [],
    lastDate: project.lastDate || getToday(),
  };
  applyProgressStatus(normalized);
  return normalized;
}

function applyProgressStatus(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  const rows = Math.max(0, Number(project.rows) || 0);
  if (total > 0 && rows >= total) {
    project.status = "done";
  }
}

function getExportTheme(style) {
  const themes = {
    classic: {
      bgA: "#fff8ef",
      bgB: "#fff3e4",
      panelFill: "rgba(255, 255, 255, 0.82)",
      panelStroke: "#e7cfb2",
      titleColor: "#25303b",
      sectionColor: "#a04825",
      labelColor: "#7e523b",
      textColor: "#25303b",
      subtitleColor: "#6d7481",
    },
    journal: {
      bgA: "#f4faf6",
      bgB: "#eef7ff",
      panelFill: "rgba(255, 255, 255, 0.9)",
      panelStroke: "#bed7cf",
      titleColor: "#1f3f4c",
      sectionColor: "#2f7d6b",
      labelColor: "#4a616b",
      textColor: "#1f2f37",
      subtitleColor: "#56717d",
    },
    minimal: {
      bgA: "#f8f8f8",
      bgB: "#f1f2f4",
      panelFill: "rgba(255, 255, 255, 0.96)",
      panelStroke: "#d8dce2",
      titleColor: "#1f2329",
      sectionColor: "#30363d",
      labelColor: "#5a6472",
      textColor: "#1f2329",
      subtitleColor: "#6b7280",
    },
  };
  return themes[style] || themes.classic;
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

function wrapTextLines(text, maxChars = 24) {
  const source = String(text || "").trim();
  if (!source) return [];
  const rows = [];
  source.split(/\r?\n/).forEach((line) => {
    const part = line.trim();
    if (!part) {
      rows.push(" ");
      return;
    }
    for (let i = 0; i < part.length; i += maxChars) {
      rows.push(part.slice(i, i + maxChars));
    }
  });
  return rows;
}

function buildExportSections(project) {
  const status = STATUS_MAP[project.status] || STATUS_MAP.active;
  const rows = Math.max(0, Number(project.rows) || 0);
  const totalRows = Math.max(0, Number(project.totalRows) || 0);
  const progressValue = totalRows > 0 ? `${getProjectProgress(project)}%（${rows}/${totalRows} 行）` : rows > 0 ? `已织 ${rows} 行` : "";

  const projectInfo = [
    ["项目名称", project.projectName],
    ["类型", project.projectType],
    ["状态", status.label],
    ["进度", progressValue],
  ].filter((item) => String(item[1] || "").trim());

  const craftInfo = [
    ["线材", project.yarnType],
    ["品牌/色号", project.yarnRef],
    ["工具", project.tools],
    ["针号", project.needleSize],
    ["花样", project.patternName],
  ].filter((item) => String(item[1] || "").trim());

  const diagramLines = wrapTextLines(project.textDiagram, 24);
  const sections = [];
  if (projectInfo.length) sections.push({ title: "项目信息", entries: projectInfo });
  if (craftInfo.length) sections.push({ title: "编织信息", entries: craftInfo });
  if (diagramLines.length) sections.push({ title: "文字图解", lines: diagramLines });
  return sections;
}

function drawExportBackground(ctx, width, height, theme, style) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, theme.bgA);
  bg.addColorStop(1, theme.bgB);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (style === "journal") {
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#8fb6a8";
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(0, i * 170 + 40, width, 72);
    }
  } else if (style === "minimal") {
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#cfd6df";
    ctx.lineWidth = 1;
    for (let x = 80; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  } else {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#ffd3b0";
    ctx.beginPath();
    ctx.arc(140, 120, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cfeadb";
    ctx.beginPath();
    ctx.arc(width - 120, 110, 180, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawClassicLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.fillStyle = theme.panelFill;
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(40, 40, width - 80, height - 80, 28);
  } else {
    ctx.rect(40, 40, width - 80, height - 80);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = theme.titleColor;
  ctx.font = "600 46px serif";
  ctx.fillText(project.projectName || "我的编织项目", 76, 112);

  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 22px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 76, 144);

  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(76, 174);
  ctx.lineTo(width - 76, 174);
  ctx.stroke();

  let y = 214;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 25px sans-serif";
    ctx.fillText(section.title, 76, y);
    y += 36;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 21px sans-serif";
        ctx.fillText(`${label}：`, 76, y);

        ctx.fillStyle = theme.textColor;
        ctx.font = "500 21px sans-serif";
        ctx.fillText(String(value), 214, y);
        y += 33;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 20px sans-serif";
        ctx.fillText(line, 76, y);
        y += 31;
      });
    }

    y += 8;
  });
}

function drawJournalLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.save();
  ctx.translate(width / 2, 112);
  ctx.rotate(-0.03);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.fillRect(-506, -60, 1012, 154);
  ctx.strokeRect(-506, -60, 1012, 154);
  ctx.restore();

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 44px serif";
  ctx.fillText(project.projectName || "我的编织项目", 86, 120);
  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 21px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 86, 152);

  const noteColors = ["#fff4d7", "#e9f8f0", "#f6ebff", "#ffe8e2"];
  let x = 78;
  let y = 206;
  const noteW = 470;

  sections.forEach((section, index) => {
    const rows = (section.entries ? section.entries.length : 0) + (section.lines ? section.lines.length : 0);
    const noteH = Math.max(160, 82 + rows * 30);

    ctx.save();
    ctx.translate(x + noteW / 2, y + noteH / 2);
    ctx.rotate(index % 2 === 0 ? -0.018 : 0.018);
    ctx.fillStyle = noteColors[index % noteColors.length];
    ctx.strokeStyle = "rgba(138, 123, 100, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-noteW / 2, -noteH / 2, noteW, noteH);
    ctx.strokeRect(-noteW / 2, -noteH / 2, noteW, noteH);
    ctx.fillStyle = "rgba(240, 221, 179, 0.85)";
    ctx.fillRect(-36, -noteH / 2 - 9, 72, 16);
    ctx.restore();

    let ly = y + 38;
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(section.title, x + 16, ly);
    ly += 28;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 19px sans-serif";
        ctx.fillText(`${label}：`, x + 16, ly);
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 19px sans-serif";
        ctx.fillText(String(value), x + 136, ly);
        ly += 26;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 18px sans-serif";
        ctx.fillText(line, x + 16, ly);
        ly += 24;
      });
    }

    if (x > 100) {
      x = width - noteW - 78;
    } else {
      x = 78;
      y += noteH + 22;
    }
  });
}

function drawMinimalLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillRect(60, 60, width - 120, height - 120);

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 42px sans-serif";
  ctx.fillText(project.projectName || "我的编织项目", 92, 128);

  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 20px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})`, 92, 156);

  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(92, 186);
  ctx.lineTo(92, height - 92);
  ctx.stroke();

  let y = 222;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(section.title, 120, y);
    y += 32;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 18px sans-serif";
        ctx.fillText(label.toUpperCase(), 120, y);
        y += 22;
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 20px sans-serif";
        ctx.fillText(String(value), 120, y);
        y += 30;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 19px sans-serif";
        ctx.fillText(line, 120, y);
        y += 28;
      });
    }

    y += 8;
  });
}

function computeExportHeight(style, contentRows, sectionCount) {
  if (style === "journal") {
    return Math.max(900, 250 + contentRows * 42 + sectionCount * 24);
  }
  if (style === "minimal") {
    return Math.max(860, 230 + contentRows * 38 + sectionCount * 22);
  }
  return Math.max(920, 240 + contentRows * 40 + sectionCount * 24);
}

function buildExportImageData(project, options = {}) {
  const preview = Boolean(options.preview);
  const sections = buildExportSections(project);
  const style = project.exportStyle || "classic";
  const theme = getExportTheme(style);
  const canvas = refs.dashboardExportCanvas;
  const ctx = canvas.getContext("2d");
  const width = preview ? 920 : 1200;

  let contentRows = 0;
  sections.forEach((section) => {
    if (section.entries) contentRows += section.entries.length;
    if (section.lines) contentRows += section.lines.length;
  });

  const height = computeExportHeight(style, contentRows, sections.length);

  canvas.width = width;
  canvas.height = height;

  const styleLabel = style === "journal" ? "手帐" : style === "minimal" ? "极简" : "经典";

  drawExportBackground(ctx, width, height, theme, style);

  if (style === "journal") {
    drawJournalLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else if (style === "minimal") {
    drawMinimalLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else {
    drawClassicLayout(ctx, width, height, theme, sections, project, styleLabel);
  }

  return canvas.toDataURL("image/png");
}

function triggerImageDownload(dataUrl, projectName) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${projectName || "knit-project"}-${getToday()}.png`;
  a.click();
}

function celebrateProjectCompletion(projectName) {
  const layer = document.createElement("div");
  layer.className = "celebration-layer";

  const badge = document.createElement("div");
  badge.className = "celebration-badge";
  badge.textContent = `🎉 恭喜完成：${projectName || "编织项目"}`;
  layer.appendChild(badge);

  const colors = ["#f39c6b", "#ffd97d", "#86d2bf", "#9fc3ff", "#f7a8b8"];
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement("span");
    piece.className = "celebration-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--fall-duration", `${1.4 + Math.random() * 1.1}s`);
    piece.style.setProperty("--fall-delay", `${Math.random() * 0.4}s`);
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    layer.appendChild(piece);
  }

  document.body.appendChild(layer);
  setTimeout(() => {
    layer.remove();
  }, 2600);
}

function exportProjectImage(project) {
  const dataUrl = buildExportImageData(project, { preview: false });
  triggerImageDownload(dataUrl, project.projectName);
}

function getProjectProgress(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((project.rows / total) * 100));
}

function saveProjects(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: state.projects }));
  if (options.scheduleCloud !== false) {
    scheduleCloudPush();
  }
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
  let changed = false;
  state.projects.forEach((project) => {
    if (project.lastDate !== getToday()) {
      project.todayRows = 0;
      project.lastDate = getToday();
      changed = true;
    }
    const before = project.status;
    applyProgressStatus(project);
    if (before !== project.status) changed = true;
  });
  if (changed) saveProjects();
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

    const exportStyleSelect = document.createElement("select");
    exportStyleSelect.className = "export-style-select";
    EXPORT_STYLE_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = `导出风格：${option.label}`;
      exportStyleSelect.appendChild(opt);
    });
    exportStyleSelect.value = project.exportStyle || "classic";
    exportStyleSelect.addEventListener("change", () => {
      project.exportStyle = exportStyleSelect.value;
      saveProjects();
    });

    const openBtn = document.createElement("a");
    openBtn.className = "btn ghost";
    openBtn.href = `project.html?id=${encodeURIComponent(project.id)}`;
    openBtn.textContent = "进入项目";

    const statusBtn = document.createElement("button");
    statusBtn.className = "btn primary";
    statusBtn.textContent = "切换状态";
    statusBtn.addEventListener("click", () => {
      const before = project.status;
      project.status = project.status === "active" ? "paused" : project.status === "paused" ? "done" : "active";
      applyProgressStatus(project);
      saveProjects();
      renderDashboard();
      if (before !== "done" && project.status === "done") {
        celebrateProjectCompletion(project.projectName);
      }
    });

    const exportBtn = document.createElement("button");
    exportBtn.className = "btn ghost";
    exportBtn.textContent = "导出图片";
    exportBtn.addEventListener("click", () => {
      pendingExportProjectId = project.id;
      refs.exportPreviewImage.classList.remove("show");
      refs.exportPreviewImage.removeAttribute("src");
      refs.exportPreviewDownloadLink.classList.remove("show");
      refs.exportPreviewDownloadLink.href = "#";
      refs.exportChoiceDialog.hidden = false;
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

    actions.append(exportStyleSelect, openBtn, statusBtn, exportBtn, deleteBtn);
    card.append(cover, title, meta, track, progressText, actions);
    refs.projectCards.appendChild(card);
  });
}

function saveTimerState(options = {}) {
  localStorage.setItem(GLOBAL_TIMER_KEY, JSON.stringify(timerState));
  if (options.scheduleCloud) {
    scheduleCloudPush();
  }
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
  refs.globalTimerDisplay.textContent = formatTime(timerState.left);
}

function bindGlobalTimer() {
  if (!refs.globalTimerMinutes || !refs.globalStartBtn || !refs.globalPauseBtn || !refs.globalResetBtn) return;
  refs.globalTimerMinutes.addEventListener("change", () => {
    timerState.minutes = Math.max(1, Number(refs.globalTimerMinutes.value) || 25);
    if (!timerState.running) timerState.left = timerState.minutes * 60;
    saveTimerState({ scheduleCloud: true });
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
      saveTimerState({ scheduleCloud: true });
      alert("计时结束，记得活动一下肩颈。");
    }, 1000);
  });

  refs.globalPauseBtn.addEventListener("click", () => {
    clearInterval(timerId);
    timerState.running = false;
    saveTimerState({ scheduleCloud: true });
  });

  refs.globalResetBtn.addEventListener("click", () => {
    clearInterval(timerId);
    timerState.running = false;
    timerState.left = timerState.minutes * 60;
    saveTimerState({ scheduleCloud: true });
    renderTimerState();
  });
}

function setSyncHint(text) {
  if (!refs.syncHint) return;
  refs.syncHint.textContent = text;
}

function setAuthNav(user) {
  const loggedIn = Boolean(user && user.email);
  if (refs.accountChip) {
    refs.accountChip.hidden = !loggedIn;
    refs.accountChip.textContent = loggedIn ? `当前账号：${user.email}` : "未登录";
  }
  if (refs.openLoginBtn) refs.openLoginBtn.hidden = loggedIn;
  if (refs.openRegisterBtn) refs.openRegisterBtn.hidden = loggedIn;
  if (refs.logoutBtn) refs.logoutBtn.hidden = !loggedIn;
}

function openAuthDialog(mode) {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = false;
  if (mode === "register") {
    if (refs.authStatus) refs.authStatus.textContent = "注册后将自动登录并开启云同步";
  }
}

function closeAuthDialog() {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = true;
}

function scheduleCloudPush() {
  if (!window.cloudSync || !window.cloudSync.isReady()) return;
  if (!window.cloudSync.getCurrentUser()) return;

  if (syncRuntime.pushTimerId) {
    clearTimeout(syncRuntime.pushTimerId);
  }

  syncRuntime.pushTimerId = setTimeout(async () => {
    const stamp = Date.now();
    syncRuntime.lastSeenCloudStamp = Math.max(syncRuntime.lastSeenCloudStamp, stamp);
    try {
      await window.cloudSync.pushState({
        projects: state.projects,
        timer: timerState,
        clientUpdatedAt: stamp,
      });
      setSyncHint("已同步到云端");
    } catch (error) {
      setSyncHint(`云同步失败：${error.message || "请稍后重试"}`);
    }
  }, 700);
}

function applyCloudPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const stamp = Number(payload.clientUpdatedAt) || 0;
  if (stamp && stamp <= syncRuntime.lastSeenCloudStamp) return;

  let changed = false;

  if (Array.isArray(payload.projects)) {
    const localCoverById = new Map(
      state.projects
        .filter((project) => project && project.id)
        .map((project) => [String(project.id), String(project.coverImage || "")])
    );

    const normalizedRemote = payload.projects.map((project) => {
      const next = normalizeProject(project);
      const localCover = localCoverById.get(String(next.id || ""));
      if (!next.coverImage && localCover) {
        next.coverImage = localCover;
      }
      return next;
    });

    const remoteIdSet = new Set(normalizedRemote.map((project) => String(project.id || "")));
    const localOnly = state.projects
      .filter((project) => project && project.id)
      .filter((project) => !remoteIdSet.has(String(project.id || "")))
      .map((project) => normalizeProject(project));

    const merged = [...normalizedRemote, ...localOnly];

    if (merged.length) {
      state.projects = merged;
      changed = true;
    }
  }

  if (payload.timer && typeof payload.timer === "object") {
    timerState.minutes = Math.max(1, Number(payload.timer.minutes) || timerState.minutes);
    timerState.left = Math.max(0, Number(payload.timer.left) || timerState.left);
    timerState.running = false;
    saveTimerState();
    renderTimerState();
    changed = true;
  }

  if (!changed) return;

  if (stamp) {
    syncRuntime.lastSeenCloudStamp = stamp;
  }
  saveProjects({ scheduleCloud: false });
  renderDashboard();
  setSyncHint("已从云端同步");
}

function setupCloudSync() {
  if (!window.cloudSync) return;

  setAuthNav(window.cloudSync.getCurrentUser());

  if (refs.openLoginBtn) {
    refs.openLoginBtn.addEventListener("click", () => openAuthDialog("login"));
  }
  if (refs.openRegisterBtn) {
    refs.openRegisterBtn.addEventListener("click", () => openAuthDialog("register"));
  }
  if (refs.closeAuthDialogBtn) {
    refs.closeAuthDialogBtn.addEventListener("click", closeAuthDialog);
  }
  if (refs.authDialog) {
    refs.authDialog.addEventListener("click", (event) => {
      if (event.target === refs.authDialog) closeAuthDialog();
    });
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

      setSyncHint("正在同步云端数据...");
      try {
        const remote = await window.cloudSync.pullState();
        if (remote) {
          applyCloudPayload(remote);
        } else {
          scheduleCloudPush();
          setSyncHint("云端已初始化");
        }
      } catch (error) {
        setSyncHint(`拉取云端失败：${error.message || "请稍后重试"}`);
      }

      syncRuntime.remoteUnsubscribe = window.cloudSync.watchRemoteState(
        (payload) => {
          applyCloudPayload(payload);
        },
        (error) => {
          setSyncHint(`监听同步失败：${error.message || "请稍后重试"}`);
        }
      );
    },
  });
}

async function ocrImageFile(file) {
  if (!window.Tesseract) throw new Error("OCR库未加载，请检查网络后重试。");
  const result = await window.Tesseract.recognize(file, "chi_sim+eng");
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

  const closeCreateMenu = () => {
    refs.createProjectMenu.hidden = true;
    refs.createProjectBtn.setAttribute("aria-expanded", "false");
  };

  const openCreateMenu = () => {
    refs.createProjectMenu.hidden = false;
    refs.createProjectBtn.setAttribute("aria-expanded", "true");
  };

  const originalCreateMenuParent = refs.createMenuWrap.parentElement;
  const mobileFilterQuery = window.matchMedia("(max-width: 620px)");

  const placeCreateButtonForCurrentViewport = () => {
    if (mobileFilterQuery.matches) {
      if (refs.createMenuWrap.parentElement !== refs.statusFilters) {
        refs.statusFilters.appendChild(refs.createMenuWrap);
      }
      refs.createMenuWrap.classList.add("in-filter-row");
      return;
    }

    if (originalCreateMenuParent && refs.createMenuWrap.parentElement !== originalCreateMenuParent) {
      originalCreateMenuParent.appendChild(refs.createMenuWrap);
    }
    refs.createMenuWrap.classList.remove("in-filter-row");
  };

  placeCreateButtonForCurrentViewport();
  mobileFilterQuery.addEventListener("change", () => {
    closeCreateMenu();
    placeCreateButtonForCurrentViewport();
  });

  const createAndOpenProject = (project) => {
    state.projects.push(project);
    saveProjects();
    window.location.href = `project.html?id=${encodeURIComponent(project.id)}`;
  };

  const createFromParsedText = (rawText) => {
    const raw = String(rawText || "").trim();
    if (!raw) {
      alert("请先输入或粘贴文字图解。\n格式示例：项目名称：奶油围巾");
      return;
    }
    const parsed = parseDiagramText(raw);
    const created = createProject(parsed.projectName);
    created.tools = parsed.tools;
    created.materials = parseMaterialsToList(parsed.materials);
    created.textDiagram = parsed.textDiagram;
    createAndOpenProject(created);
  };

  refs.createProjectBtn.addEventListener("click", () => {
    if (refs.createProjectMenu.hidden) {
      openCreateMenu();
    } else {
      closeCreateMenu();
    }
  });

  // Ensure the options menu is hidden when the homepage first loads.
  closeCreateMenu();

  refs.createBlankOption.addEventListener("click", () => {
    closeCreateMenu();
    const created = createProject(`新作品 ${state.projects.length + 1}`);
    createAndOpenProject(created);
  });

  refs.createFromTextOption.addEventListener("click", () => {
    closeCreateMenu();
    const raw = window.prompt("请粘贴文字图解（可包含 项目名称/工具/材料/文字图解 字段）：", "");
    if (raw === null) return;
    createFromParsedText(raw);
  });

  refs.createFromImageOption.addEventListener("click", () => {
    closeCreateMenu();
    refs.diagramImageInput.click();
  });

  document.addEventListener("click", (event) => {
    if (!refs.createMenuWrap.contains(event.target)) {
      closeCreateMenu();
    }
  });

  refs.diagramImageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await ocrImageFile(file);
      if (!text) {
        alert("识别完成，但未提取到文字。请换更清晰图片。");
        return;
      }

      const parsed = parseDiagramText(text);
      const created = createProject(parsed.projectName);
      created.tools = parsed.tools;
      created.materials = parseMaterialsToList(parsed.materials);
      created.textDiagram = parsed.textDiagram || text;
      createAndOpenProject(created);
    } catch (error) {
      alert(`图片识别失败：${error.message || "请稍后重试"}`);
    } finally {
      refs.diagramImageInput.value = "";
    }
  });

  refs.projectCards.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    refs.projectCards.scrollBy({ left: event.deltaY, behavior: "auto" });
  }, { passive: false });

  if (refs.exportChoiceDialog) {
    const dialogCard = refs.exportChoiceDialog.querySelector(".dialog-card");
    const handleDialogAction = (event) => {
      const actionButton = event.target.closest("#exportPreviewBtn, #exportDirectDownloadBtn, #exportCloseBtn");
      if (!actionButton) return;

      if (actionButton.id === "exportCloseBtn") {
        closeExportChoiceDialog();
        return;
      }

      const project = state.projects.find((item) => item.id === pendingExportProjectId);
      if (!project) {
        alert("未找到项目，请重试。");
        closeExportChoiceDialog();
        return;
      }

      if (actionButton.id === "exportPreviewBtn") {
        const dataUrl = buildExportImageData(project, { preview: true });
        refs.exportPreviewImage.src = dataUrl;
        refs.exportPreviewImage.classList.add("show");
        refs.exportPreviewDownloadLink.href = dataUrl;
        refs.exportPreviewDownloadLink.download = `${project.projectName || "knit-project"}-${getToday()}.png`;
        refs.exportPreviewDownloadLink.classList.add("show");
        return;
      }

      exportProjectImage(project);
      closeExportChoiceDialog();
    };

    if (dialogCard) {
      dialogCard.addEventListener("click", handleDialogAction);
    }

    refs.exportChoiceDialog.addEventListener("click", (event) => {
      if (event.target === refs.exportChoiceDialog) {
        closeExportChoiceDialog();
      }
    });
  }
}

function init() {
  loadProjects();
  loadTimerState();
  renderDashboard();
  renderTimerState();
  bindActions();
  bindGlobalTimer();
  setupCloudSync();
}

init();
