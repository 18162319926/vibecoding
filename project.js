const STORAGE_KEY = "knit-helper-state";
const GLOBAL_TIMER_KEY = "knit-global-timer";
const FLOATING_TIMER_POS_KEY = "knit-floating-timer-pos";

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
  yarnInfo: document.getElementById("yarnInfo"),
  toolsInfo: document.getElementById("toolsInfo"),
  textDiagram: document.getElementById("textDiagram"),
  diagramImageInput: document.getElementById("diagramImageInput"),
  diagramImageGallery: document.getElementById("diagramImageGallery"),
  diagramImagePlaceholder: document.getElementById("diagramImagePlaceholder"),
  exportStyle: document.getElementById("exportStyle"),
  projectCoverInput: document.getElementById("projectCoverInput"),
  projectCoverRemoveBtn: document.getElementById("projectCoverRemoveBtn"),
  projectCoverPreview: document.getElementById("projectCoverPreview"),
  rowCounter: document.getElementById("rowCounter"),
  progressText: document.getElementById("progressText"),
  projectTimeSpent: document.getElementById("projectTimeSpent"),
  stepInput: document.getElementById("stepInput"),
  materialForm: document.getElementById("materialForm"),
  materialInput: document.getElementById("materialInput"),
  materialList: document.getElementById("materialList"),
  exportCurrentImageBtn: document.getElementById("exportCurrentImageBtn"),
  downloadCurrentImageLink: document.getElementById("downloadCurrentImageLink"),
  exportCanvas: document.getElementById("exportCanvas"),
  exportImagePreview: document.getElementById("exportImagePreview"),
  floatingTimer: document.getElementById("floatingTimer"),
  floatingTimerHandle: document.getElementById("floatingTimerHandle"),
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

const timerState = {
  minutes: 25,
  left: 25 * 60,
  running: false,
};

const syncRuntime = {
  pushTimerId: null,
  remoteUnsubscribe: null,
  lastSeenCloudStamp: 0,
};

let globalTimerId = null;
let projectTimeTick = 0;

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
    diagramImage: "",
    diagramImages: [],
    rows: 0,
    todayRows: 0,
    materials: [],
    notes: "",
    spentSeconds: 0,
    exportStyle: "classic",
    lastDate: getToday(),
    updatedAt: Date.now(),
  };
}

function isLegacyStarterProject(project) {
  if (!project || project.projectName !== "我的第一件作品") return false;
  const hasProgress = Number(project.rows) > 0 || Number(project.totalRows) > 0 || Number(project.spentSeconds) > 0;
  const hasContent = Boolean(
    String(project.textDiagram || "").trim() ||
    String(project.diagramImage || "").trim() ||
    (Array.isArray(project.diagramImages) && project.diagramImages.length > 0) ||
    String(project.notes || "").trim() ||
    String(project.coverImage || "").trim() ||
    String(project.yarnType || "").trim() ||
    String(project.tools || "").trim()
  );
  const materialsCount = Array.isArray(project.materials) ? project.materials.length : 0;
  return !hasProgress && !hasContent && materialsCount === 0;
}

function normalizeProject(project) {
  const parsedUpdatedAt = Number(project.updatedAt);
  const normalized = {
    ...createProject(project.projectName || "未命名作品"),
    ...project,
    id: project.id || makeId(),
    totalRows: Math.max(0, Number(project.totalRows) || 0),
    rows: Math.max(0, Number(project.rows) || 0),
    todayRows: Math.max(0, Number(project.todayRows) || 0),
    spentSeconds: Math.max(0, Number(project.spentSeconds) || 0),
    materials: Array.isArray(project.materials) ? project.materials : [],
    lastDate: project.lastDate || getToday(),
    updatedAt: Number.isFinite(parsedUpdatedAt) && parsedUpdatedAt > 0 ? parsedUpdatedAt : 0,
  };
  const fallbackDiagramImage = String(normalized.diagramImage || "").trim();
  const normalizedImages = Array.isArray(project.diagramImages)
    ? project.diagramImages.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  normalized.diagramImages = normalizedImages.length
    ? normalizedImages
    : fallbackDiagramImage
      ? [fallbackDiagramImage]
      : [];
  applyProgressStatus(normalized);
  return normalized;
}

function touchProject(project) {
  if (!project || typeof project !== "object") return;
  project.updatedAt = Date.now();
}

function combinePair(primary, secondary) {
  const first = String(primary || "").trim();
  const second = String(secondary || "").trim();
  if (first && second) return `${first} / ${second}`;
  return first || second;
}

function splitPair(value) {
  const source = String(value || "").trim();
  if (!source) return ["", ""];
  const parts = source.split(/\s*\/\s*|\s*\|\s*|\s*，\s*|\s*,\s*/);
  const first = String(parts[0] || "").trim();
  const second = String(parts.slice(1).join(" ") || "").trim();
  return [first, second];
}

function applyProgressStatus(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  const rows = Math.max(0, Number(project.rows) || 0);
  if (total > 0 && rows >= total) {
    project.status = "done";
  }
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hh = Math.floor(safe / 3600).toString().padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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
    blueprint: {
      bgA: "#0b2c4f",
      bgB: "#123e6c",
      panelFill: "rgba(8, 24, 43, 0.76)",
      panelStroke: "rgba(158, 211, 255, 0.75)",
      titleColor: "#e6f4ff",
      sectionColor: "#8ed2ff",
      labelColor: "#b9e5ff",
      textColor: "#ecf8ff",
      subtitleColor: "#b6d8f3",
    },
    sunset: {
      bgA: "#ffd6b2",
      bgB: "#ff9d8b",
      panelFill: "rgba(255, 248, 240, 0.8)",
      panelStroke: "#f6b593",
      titleColor: "#5a2f2f",
      sectionColor: "#b34f42",
      labelColor: "#7a4942",
      textColor: "#4d3030",
      subtitleColor: "#8e5d58",
    },
    retro: {
      bgA: "#f5e5c8",
      bgB: "#ebd4ab",
      panelFill: "rgba(255, 252, 245, 0.82)",
      panelStroke: "#c8aa73",
      titleColor: "#3e2c1d",
      sectionColor: "#7b4d2b",
      labelColor: "#6e5038",
      textColor: "#3a2a1c",
      subtitleColor: "#7c6652",
    },
  };
  return themes[style] || themes.classic;
}

function getProjectProgress(project) {
  const total = Math.max(0, Number(project.totalRows) || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((project.rows / total) * 100));
}

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    return list.length ? list.map(normalizeProject).filter((project) => !isLegacyStarterProject(project)) : [];
  } catch {
    return [];
  }
}

function saveProjects(projects, options = {}) {
  const cleanedProjects = (Array.isArray(projects) ? projects : []).filter(
    (project) => !isLegacyStarterProject(project)
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: cleanedProjects }));
    if (options.scheduleCloud !== false) {
      scheduleCloudPush(cleanedProjects);
    }
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
  refs.yarnInfo.value = combinePair(project.yarnType, project.yarnRef);
  refs.toolsInfo.value = combinePair(project.tools, project.needleSize);
  refs.textDiagram.value = project.textDiagram || "";
  refs.exportStyle.value = project.exportStyle || "classic";
  refs.rowCounter.textContent = String(project.rows || 0);
  refs.progressText.textContent = `进度 ${getProjectProgress(project)}%（${project.rows || 0}/${project.totalRows || 0} 行）`;
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

function renderDiagramImages(project) {
  if (!refs.diagramImageGallery) return;
  refs.diagramImageGallery.innerHTML = "";

  const images = Array.isArray(project.diagramImages)
    ? project.diagramImages.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

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

  if (refs.diagramImagePlaceholder) {
    refs.diagramImagePlaceholder.style.display = images.length ? "none" : "inline";
  }
}

function syncDraftFields(project) {
  project.projectName = refs.projectName.value.trim() || project.projectName || "未命名作品";
  project.projectType = refs.projectType.value;
  project.status = refs.projectStatus.value;
  project.totalRows = Math.max(0, Number(refs.totalRows.value) || 0);
  const [yarnType, yarnRef] = splitPair(refs.yarnInfo.value);
  project.yarnType = yarnType;
  project.yarnRef = yarnRef;
  const [tools, needleSize] = splitPair(refs.toolsInfo.value);
  project.tools = tools;
  project.needleSize = needleSize;
  project.textDiagram = refs.textDiagram.value.trim();
  project.exportStyle = refs.exportStyle.value || "classic";
  applyProgressStatus(project);
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

  const sections = [];
  if (projectInfo.length) sections.push({ title: "项目信息", entries: projectInfo });
  if (craftInfo.length) sections.push({ title: "编织信息", entries: craftInfo });
  return sections;
}

const exportImageCache = new Map();

function loadExportImage(src) {
  const key = String(src || "").trim();
  if (!key) return Promise.reject(new Error("empty-image-src"));
  if (exportImageCache.has(key)) return exportImageCache.get(key);

  const task = new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(key)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("封面加载失败"));
    img.src = key;
  });
  exportImageCache.set(key, task);
  return task;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, width, height);
}

async function drawExportCoverBlock(ctx, project, x, y, width, height, theme) {
  drawRoundedRectPath(ctx, x, y, width, height, 16);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fill();
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const coverImage = String(project.coverImage || "").trim();
  if (!coverImage) {
    ctx.fillStyle = theme.subtitleColor;
    ctx.font = "500 18px sans-serif";
    ctx.fillText("未上传封面", x + 18, y + height / 2 + 6);
    return;
  }

  try {
    const image = await loadExportImage(coverImage);
    const iw = Math.max(1, Number(image.width) || 1);
    const ih = Math.max(1, Number(image.height) || 1);
    const scale = Math.max(width / iw, height / ih);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;

    ctx.save();
    drawRoundedRectPath(ctx, x, y, width, height, 16);
    ctx.clip();
    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
    ctx.restore();
  } catch {
    ctx.fillStyle = theme.subtitleColor;
    ctx.font = "500 18px sans-serif";
    ctx.fillText("封面加载失败", x + 18, y + height / 2 + 6);
  }
}

function getExportCoverRect(canvasWidth, topY) {
  const frameWidth = Math.round(Math.min(canvasWidth * 0.42, canvasWidth - 220));
  const frameHeight = Math.round(frameWidth * 0.75);
  const x = Math.round((canvasWidth - frameWidth) / 2);
  return {
    x,
    y: topY,
    width: frameWidth,
    height: frameHeight,
  };
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
  } else if (style === "blueprint") {
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#9cd3ff";
    ctx.lineWidth = 1;
    for (let y = 30; y < height; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 30; x < width; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  } else if (style === "sunset") {
    ctx.globalAlpha = 0.4;
    const sun = ctx.createRadialGradient(width * 0.74, height * 0.2, 20, width * 0.74, height * 0.2, 220);
    sun.addColorStop(0, "#fff2c6");
    sun.addColorStop(1, "rgba(255, 242, 198, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 130, 120, 0.22)";
    ctx.fillRect(0, height * 0.64, width, height * 0.36);
  } else if (style === "retro") {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#8f6a3f";
    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = Math.random() * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
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

async function drawBlueprintLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.fillStyle = theme.panelFill;
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.fillRect(56, 56, width - 112, height - 112);
  ctx.strokeRect(56, 56, width - 112, height - 112);

  ctx.strokeStyle = "rgba(170, 220, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.strokeRect(74, 74, width - 148, height - 148);

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 40px sans-serif";
  ctx.fillText(project.projectName || "我的编织项目", 98, 128);
  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 20px monospace";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 98, 160);

  const coverRect = getExportCoverRect(width, 186);
  await drawExportCoverBlock(ctx, project, coverRect.x, coverRect.y, coverRect.width, coverRect.height, theme);

  let y = coverRect.y + coverRect.height + 34;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 22px monospace";
    ctx.fillText(`[ ${section.title} ]`, 98, y);
    y += 34;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 18px monospace";
        ctx.fillText(`${label}:`, 98, y);
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 18px monospace";
        ctx.fillText(String(value), 232, y);
        y += 28;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 17px monospace";
        ctx.fillText(line, 98, y);
        y += 24;
      });
    }

    y += 10;
  });
}

async function drawRetroLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.fillStyle = theme.panelFill;
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 4;
  ctx.fillRect(48, 48, width - 96, height - 96);
  ctx.strokeRect(48, 48, width - 96, height - 96);

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 44px serif";
  ctx.fillText(project.projectName || "我的编织项目", 86, 126);

  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "600 18px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 86, 156);

  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(86, 178, width - 172, 2);

  const coverRect = getExportCoverRect(width, 182);
  await drawExportCoverBlock(ctx, project, coverRect.x, coverRect.y, coverRect.width, coverRect.height, theme);

  let y = coverRect.y + coverRect.height + 34;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 24px serif";
    ctx.fillText(section.title, 86, y);
    y += 34;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "700 19px serif";
        ctx.fillText(`${label}：`, 86, y);
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 19px serif";
        ctx.fillText(String(value), 208, y);
        y += 30;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 18px serif";
        ctx.fillText(line, 86, y);
        y += 26;
      });
    }

    y += 8;
  });
}

async function drawClassicLayout(ctx, width, height, theme, sections, project, styleLabel) {
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
  ctx.font = "600 44px serif";
  ctx.fillText(project.projectName || "我的编织项目", 72, 108);

  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 22px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 72, 142);

  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, 174);
  ctx.lineTo(width - 72, 174);
  ctx.stroke();

  const coverRect = getExportCoverRect(width, 188);
  await drawExportCoverBlock(ctx, project, coverRect.x, coverRect.y, coverRect.width, coverRect.height, theme);

  let y = coverRect.y + coverRect.height + 34;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 24px sans-serif";
    ctx.fillText(section.title, 72, y);
    y += 34;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 21px sans-serif";
        ctx.fillText(`${label}：`, 72, y);

        ctx.fillStyle = theme.textColor;
        ctx.font = "500 21px sans-serif";
        ctx.fillText(String(value), 202, y);
        y += 32;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 20px sans-serif";
        ctx.fillText(line, 72, y);
        y += 30;
      });
    }

    y += 8;
  });
}

async function drawJournalLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.save();
  ctx.translate(width / 2, 108);
  ctx.rotate(-0.03);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.fillRect(-462, -58, 924, 146);
  ctx.strokeRect(-462, -58, 924, 146);
  ctx.restore();

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 42px serif";
  ctx.fillText(project.projectName || "我的编织项目", 86, 118);
  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 20px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})  ·  ${getToday()}`, 86, 150);

  const coverRect = getExportCoverRect(width, 176);
  await drawExportCoverBlock(ctx, project, coverRect.x, coverRect.y, coverRect.width, coverRect.height, theme);

  const noteColors = ["#fff4d7", "#e9f8f0", "#f6ebff", "#ffe8e2"];
  let x = 72;
  let y = coverRect.y + coverRect.height + 20;
  const noteW = 430;

  sections.forEach((section, index) => {
    const rows = (section.entries ? section.entries.length : 0) + (section.lines ? section.lines.length : 0);
    const noteH = Math.max(152, 78 + rows * 28);

    ctx.save();
    ctx.translate(x + noteW / 2, y + noteH / 2);
    ctx.rotate(index % 2 === 0 ? -0.02 : 0.02);
    ctx.fillStyle = noteColors[index % noteColors.length];
    ctx.strokeStyle = "rgba(138, 123, 100, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-noteW / 2, -noteH / 2, noteW, noteH);
    ctx.strokeRect(-noteW / 2, -noteH / 2, noteW, noteH);
    ctx.fillStyle = "rgba(240, 221, 179, 0.85)";
    ctx.fillRect(-34, -noteH / 2 - 9, 68, 16);
    ctx.restore();

    let ly = y + 36;
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(section.title, x + 14, ly);
    ly += 26;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 18px sans-serif";
        ctx.fillText(`${label}：`, x + 14, ly);
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 18px sans-serif";
        ctx.fillText(String(value), x + 126, ly);
        ly += 24;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 17px sans-serif";
        ctx.fillText(line, x + 14, ly);
        ly += 22;
      });
    }

    if (x > 100) {
      x = width - noteW - 72;
    } else {
      x = 72;
      y += noteH + 20;
    }
  });
}

async function drawMinimalLayout(ctx, width, height, theme, sections, project, styleLabel) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillRect(54, 54, width - 108, height - 108);

  ctx.fillStyle = theme.titleColor;
  ctx.font = "700 40px sans-serif";
  ctx.fillText(project.projectName || "我的编织项目", 84, 126);

  ctx.fillStyle = theme.subtitleColor;
  ctx.font = "500 19px sans-serif";
  ctx.fillText(`织伴项目卡(${styleLabel})`, 84, 156);

  ctx.strokeStyle = theme.panelStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(84, 184);
  ctx.lineTo(84, height - 84);
  ctx.stroke();

  const coverRect = getExportCoverRect(width, 186);
  await drawExportCoverBlock(ctx, project, coverRect.x, coverRect.y, coverRect.width, coverRect.height, theme);

  let y = coverRect.y + coverRect.height + 34;
  sections.forEach((section) => {
    ctx.fillStyle = theme.sectionColor;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(section.title, 108, y);
    y += 30;

    if (section.entries) {
      section.entries.forEach(([label, value]) => {
        ctx.fillStyle = theme.labelColor;
        ctx.font = "600 17px sans-serif";
        ctx.fillText(label.toUpperCase(), 108, y);
        y += 20;
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 19px sans-serif";
        ctx.fillText(String(value), 108, y);
        y += 28;
      });
    }

    if (section.lines) {
      section.lines.forEach((line) => {
        ctx.fillStyle = theme.textColor;
        ctx.font = "500 18px sans-serif";
        ctx.fillText(line, 108, y);
        y += 26;
      });
    }

    y += 8;
  });
}

function computeExportHeight(style, contentRows, sectionCount) {
  if (style === "journal") {
    return Math.max(980, 360 + contentRows * 40 + sectionCount * 24);
  }
  if (style === "minimal") {
    return Math.max(940, 340 + contentRows * 36 + sectionCount * 20);
  }
  if (style === "blueprint") {
    return Math.max(980, 360 + contentRows * 36 + sectionCount * 22);
  }
  if (style === "sunset") {
    return Math.max(1020, 370 + contentRows * 38 + sectionCount * 24);
  }
  if (style === "retro") {
    return Math.max(1020, 370 + contentRows * 39 + sectionCount * 24);
  }
  return Math.max(1000, 350 + contentRows * 38 + sectionCount * 24);
}

async function buildExportImageData(project, options = {}) {
  const preview = Boolean(options.preview);
  const sections = buildExportSections(project);
  const style = project.exportStyle || "classic";
  const theme = getExportTheme(style);
  const canvas = refs.exportCanvas;
  const ctx = canvas.getContext("2d");
  const width = preview ? 860 : 1100;

  let contentRows = 0;
  sections.forEach((section) => {
    if (section.entries) contentRows += section.entries.length;
    if (section.lines) contentRows += section.lines.length;
  });

  const height = computeExportHeight(style, contentRows, sections.length);

  canvas.width = width;
  canvas.height = height;

  const styleLabelMap = {
    classic: "经典",
    journal: "手帐",
    minimal: "极简",
    blueprint: "蓝图",
    sunset: "落日",
    retro: "复古",
  };
  const styleLabel = styleLabelMap[style] || "经典";

  drawExportBackground(ctx, width, height, theme, style);

  if (style === "journal") {
    await drawJournalLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else if (style === "minimal") {
    await drawMinimalLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else if (style === "blueprint") {
    await drawBlueprintLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else if (style === "retro") {
    await drawRetroLayout(ctx, width, height, theme, sections, project, styleLabel);
  } else {
    await drawClassicLayout(ctx, width, height, theme, sections, project, styleLabel);
  }

  return canvas.toDataURL("image/png");
}

async function refreshExportPreview(project) {
  try {
    const dataUrl = await buildExportImageData(project, { preview: true });
    refs.exportImagePreview.src = dataUrl;
    refs.exportImagePreview.classList.add("show");
    refs.downloadCurrentImageLink.href = dataUrl;
    refs.downloadCurrentImageLink.download = `${project.projectName || "knit-project"}-${getToday()}.png`;
  } catch (error) {
    showFeedback(`导出预览失败：${error.message || "请稍后重试"}`);
  }
}

function showFeedback(message) {
  refs.feedbackToast.textContent = message;
  refs.feedbackToast.classList.add("show");
  setTimeout(() => {
    refs.feedbackToast.classList.remove("show");
  }, 1600);
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

async function exportProjectImage(project) {
  try {
    const dataUrl = await buildExportImageData(project, { preview: false });
    refs.exportImagePreview.src = dataUrl;
    refs.exportImagePreview.classList.add("show");
    refs.downloadCurrentImageLink.href = dataUrl;
    refs.downloadCurrentImageLink.download = `${project.projectName || "knit-project"}-${getToday()}.png`;
  } catch (error) {
    showFeedback(`导出失败：${error.message || "请稍后重试"}`);
  }
}

function setSyncHint(text) {
  if (!refs.syncHint) return;
  refs.syncHint.textContent = text;
}

function setAuthNav(user) {
  const loggedIn = Boolean(user && user.email);
  if (refs.accountChip) {
    refs.accountChip.hidden = false;
    refs.accountChip.textContent = loggedIn ? `当前账号：${user.email}` : "未登录";
  }
  if (refs.openLoginBtn) refs.openLoginBtn.hidden = loggedIn;
  if (refs.openRegisterBtn) refs.openRegisterBtn.hidden = loggedIn;
  if (refs.logoutBtn) refs.logoutBtn.hidden = !loggedIn;
}

function openAuthDialog(mode) {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = false;
  if (mode === "register" && refs.authStatus) {
    refs.authStatus.textContent = "注册后将自动登录并开启云同步";
  }
}

function closeAuthDialog() {
  if (!refs.authDialog) return;
  refs.authDialog.hidden = true;
}

function replaceProjectsInPlace(target, next) {
  target.splice(0, target.length, ...next);
}

function scheduleCloudPush(projects) {
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
        projects: (Array.isArray(projects) ? projects : []).filter((project) => !isLegacyStarterProject(project)),
        timer: timerState,
        clientUpdatedAt: stamp,
      });
      setSyncHint("已同步到云端");
    } catch (error) {
      setSyncHint(`云同步失败：${error.message || "请稍后重试"}`);
    }
  }, 700);
}

function applyCloudPayload(payload, projects) {
  if (!payload || typeof payload !== "object") return false;
  const stamp = Number(payload.clientUpdatedAt) || 0;
  if (stamp && stamp <= syncRuntime.lastSeenCloudStamp) return false;

  let changed = false;

  if (Array.isArray(payload.projects)) {
    const localProjectById = new Map(
      projects
        .filter((project) => project && project.id)
        .map((project) => [String(project.id), project])
    );

    const normalizedRemote = payload.projects
      .map((project) => {
        const next = normalizeProject(project);
        const localProject = localProjectById.get(String(next.id || ""));
        if (localProject) {
          const localUpdatedAt = Number(localProject.updatedAt) || 0;
          const remoteUpdatedAt = Number(next.updatedAt) || 0;
          if (localUpdatedAt >= remoteUpdatedAt) {
            return normalizeProject(localProject);
          }

          if (!next.coverImage && localProject.coverImage) {
            next.coverImage = String(localProject.coverImage || "");
          }
          if (!next.diagramImage && localProject.diagramImage) {
            next.diagramImage = String(localProject.diagramImage || "");
          }
          if ((!Array.isArray(next.diagramImages) || !next.diagramImages.length) && Array.isArray(localProject.diagramImages) && localProject.diagramImages.length) {
            next.diagramImages = [...localProject.diagramImages];
          }
          next.spentSeconds = Math.max(
            Number(next.spentSeconds) || 0,
            Number(localProject.spentSeconds) || 0
          );
          next.rows = Math.max(Number(next.rows) || 0, Number(localProject.rows) || 0);
          next.todayRows = Math.max(
            Number(next.todayRows) || 0,
            Number(localProject.todayRows) || 0
          );
        }
        return next;
      })
      .filter((project) => !isLegacyStarterProject(project));

    const remoteIdSet = new Set(normalizedRemote.map((project) => String(project.id || "")));
    const localOnly = projects
      .filter((project) => project && project.id)
      .filter((project) => !remoteIdSet.has(String(project.id || "")))
      .map((project) => normalizeProject(project))
      .filter((project) => !isLegacyStarterProject(project));

    const merged = [...normalizedRemote, ...localOnly];

    if (merged.length) {
      replaceProjectsInPlace(projects, merged);
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

  if (!changed) return false;

  if (stamp) {
    syncRuntime.lastSeenCloudStamp = stamp;
  }
  saveProjects(projects, { scheduleCloud: false });
  setSyncHint("已从云端同步");
  return true;
}

function saveTimerState(options = {}) {
  localStorage.setItem(GLOBAL_TIMER_KEY, JSON.stringify(timerState));
  if (options.scheduleCloud && Array.isArray(options.projects)) {
    scheduleCloudPush(options.projects);
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
  refs.globalTimerMinutes.value = String(timerState.minutes);
  refs.globalTimerDisplay.textContent = formatTime(timerState.left);
}

function bindGlobalTimer(getProject, persist) {
  const flushPendingProjectTime = () => {
  if (projectTimeTick <= 0) return;
  projectTimeTick = 0;
  persist();
  };

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
  const currentProject = typeof getProject === "function" ? getProject() : null;
  if (!currentProject) return;

  timerState.left -= 1;
  currentProject.spentSeconds += 1;
  projectTimeTick += 1;
  refs.projectTimeSpent.textContent = "累计用时 " + formatDuration(currentProject.spentSeconds);

  if (projectTimeTick >= 5) {
  flushPendingProjectTime();
  }

  saveTimerState();
  renderTimerState();
  return;
  }

  clearInterval(globalTimerId);
  timerState.running = false;
  flushPendingProjectTime();
  saveTimerState();
  alert("计时结束，记得活动一下肩颈。");
  }, 1000);
  });

  refs.globalPauseBtn.addEventListener("click", () => {
  clearInterval(globalTimerId);
  timerState.running = false;
  flushPendingProjectTime();
  saveTimerState();
  });

  refs.globalResetBtn.addEventListener("click", () => {
  clearInterval(globalTimerId);
  timerState.running = false;
  timerState.left = timerState.minutes * 60;
  flushPendingProjectTime();
  saveTimerState();
  renderTimerState();
  });

  document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
  flushPendingProjectTime();
  }
  });

  window.addEventListener("pagehide", flushPendingProjectTime);
  window.addEventListener("beforeunload", flushPendingProjectTime);
}

function bindDraggableFloatingTimer() {
  const timer = refs.floatingTimer;
  const handle = refs.floatingTimerHandle;
  if (!timer) return;

  const desktopQuery = window.matchMedia("(min-width: 901px)");

  const applySavedPosition = () => {
    if (!desktopQuery.matches) {
      timer.style.left = "";
      timer.style.top = "";
      timer.style.right = "";
      timer.style.transform = "";
      return;
    }

    const saved = localStorage.getItem(FLOATING_TIMER_POS_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const left = Number(parsed.left);
      const top = Number(parsed.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      timer.style.left = `${left}px`;
      timer.style.top = `${top}px`;
      timer.style.right = "auto";
      timer.style.transform = "none";
    } catch {
      // Ignore invalid stored position.
    }
  };

  applySavedPosition();
  desktopQuery.addEventListener("change", () => {
    applySavedPosition();
  });

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const clampPosition = (left, top) => {
    const maxLeft = Math.max(0, window.innerWidth - timer.offsetWidth - 8);
    const maxTop = Math.max(0, window.innerHeight - timer.offsetHeight - 8);
    return {
      left: Math.min(maxLeft, Math.max(8, left)),
      top: Math.min(maxTop, Math.max(8, top)),
    };
  };

  const onMove = (clientX, clientY) => {
    const nextLeft = clientX - offsetX;
    const nextTop = clientY - offsetY;
    const clamped = clampPosition(nextLeft, nextTop);
    timer.style.left = `${clamped.left}px`;
    timer.style.top = `${clamped.top}px`;
    timer.style.right = "auto";
    timer.style.transform = "none";
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    timer.classList.remove("dragging");
    const left = parseFloat(timer.style.left);
    const top = parseFloat(timer.style.top);
    if (Number.isFinite(left) && Number.isFinite(top) && desktopQuery.matches) {
      localStorage.setItem(FLOATING_TIMER_POS_KEY, JSON.stringify({ left, top }));
    }
  };

  const startDrag = (clientX, clientY) => {
    if (!desktopQuery.matches) return;
    const rect = timer.getBoundingClientRect();
    dragging = true;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    timer.classList.add("dragging");
    onMove(clientX, clientY);
  };

  const isInteractiveTarget = (target) => target?.closest("button, input, select, textarea, label, a");

  const dragTarget = handle || timer;

  dragTarget.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    startDrag(event.clientX, event.clientY);
  });

  dragTarget.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    if (isInteractiveTarget(event.target)) return;
    startDrag(touch.clientX, touch.clientY);
  }, { passive: true });

  document.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    onMove(event.clientX, event.clientY);
  });

  document.addEventListener("touchmove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    const touch = event.touches?.[0];
    if (!touch) return;
    onMove(touch.clientX, touch.clientY);
  }, { passive: false });

  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);
}

function bindMobileFloatingTimerToggle() {
  const timer = refs.floatingTimer;
  const handle = refs.floatingTimerHandle;
  if (!timer || !handle) return;

  const mobileQuery = window.matchMedia("(max-width: 900px)");

  const renderHandleState = () => {
    if (mobileQuery.matches) {
      const collapsed = timer.classList.contains("is-collapsed");
      handle.textContent = collapsed ? "点击展开计时器" : "点击收起计时器";
      handle.setAttribute("aria-expanded", String(!collapsed));
      handle.setAttribute("role", "button");
      handle.tabIndex = 0;
      return;
    }

    timer.classList.remove("is-collapsed");
    handle.textContent = "拖动浮窗";
    handle.removeAttribute("aria-expanded");
    handle.removeAttribute("role");
    handle.removeAttribute("tabindex");
  };

  const toggleCollapsed = () => {
    if (!mobileQuery.matches) return;
    timer.classList.toggle("is-collapsed");
    renderHandleState();
  };

  handle.addEventListener("click", toggleCollapsed);
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleCollapsed();
  });

  mobileQuery.addEventListener("change", () => {
    if (mobileQuery.matches) {
      timer.classList.add("is-collapsed");
    }
    renderHandleState();
  });

  if (mobileQuery.matches) {
    timer.classList.add("is-collapsed");
  }
  renderHandleState();
}

function setupCloudSync(projects, onRemoteApplied) {
  if (!window.cloudSync) return;

  setAuthNav(window.cloudSync.getCurrentUser());

  const handleUserChanged = async (user) => {
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
        const changed = applyCloudPayload(remote, projects);
        if (changed) onRemoteApplied();
      } else {
        scheduleCloudPush(projects);
        setSyncHint("云端已初始化");
      }
    } catch (error) {
      setSyncHint(`拉取云端失败：${error.message || "请稍后重试"}`);
    }

    syncRuntime.remoteUnsubscribe = window.cloudSync.watchRemoteState(
      (payload) => {
        const changed = applyCloudPayload(payload, projects);
        if (changed) onRemoteApplied();
      },
      (error) => {
        setSyncHint(`监听同步失败：${error.message || "请稍后重试"}`);
      }
    );
  };

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

  const hasFullAuthUI = Boolean(
    refs.authEmail && refs.authPassword && refs.authStatus && refs.loginBtn && refs.registerBtn && refs.logoutBtn
  );

  if (hasFullAuthUI) {
    window.cloudSync.bindAuthUI({
      emailInput: refs.authEmail,
      passwordInput: refs.authPassword,
      statusEl: refs.authStatus,
      loginBtn: refs.loginBtn,
      registerBtn: refs.registerBtn,
      logoutBtn: refs.logoutBtn,
      onUserChanged: handleUserChanged,
    });
    return;
  }

  window.cloudSync.onAuthStateChanged(handleUserChanged);
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
      applyProgressStatus(project);
      touchProject(project);
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

  const persistWithCelebration = (beforeStatus) => {
    const ok = persist();
    if (ok && beforeStatus !== "done" && project.status === "done") {
      celebrateProjectCompletion(project.projectName);
    }
    return ok;
  };

  renderProject(project);
  renderMaterials(project, persist);

  refs.projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const before = project.status;
    syncDraftFields(project);
    if (persistWithCelebration(before)) {
      showFeedback("项目已保存");
      refreshExportPreview(project);
    }
  });

  refs.exportStyle.addEventListener("change", () => {
    project.exportStyle = refs.exportStyle.value || "classic";
    persist();
    refreshExportPreview(project);
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

  if (refs.projectCoverRemoveBtn) {
    refs.projectCoverRemoveBtn.addEventListener("click", () => {
      const previousCover = project.coverImage;
      syncDraftFields(project);
      project.coverImage = "";
      if (!persist()) {
        project.coverImage = previousCover;
        persist();
        alert("删除封面失败，请稍后重试。");
      }
      refs.projectCoverInput.value = "";
    });
  }

  if (refs.diagramImageInput) {
    refs.diagramImageInput.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      const previousDiagramImages = Array.isArray(project.diagramImages) ? [...project.diagramImages] : [];
      try {
        // 先把当前页面草稿同步进对象，再更新图解图片，避免未点击“保存”时字段被重置。
        syncDraftFields(project);
        const validFiles = files.filter((file) => String(file.type || "").startsWith("image/"));
        if (!validFiles.length) {
          alert("请选择图片文件。\n支持一次选择多张。");
          return;
        }

        const compressedImages = await Promise.all(validFiles.map((file) => compressCoverImage(file)));
        project.diagramImages = [...previousDiagramImages, ...compressedImages];
        project.diagramImage = project.diagramImages[0] || "";
        if (!persist()) {
          project.diagramImages = previousDiagramImages;
          project.diagramImage = previousDiagramImages[0] || "";
          persist();
          alert("图片体积较大导致无法保存，请换更小的图解图。");
        }
      } catch (error) {
        project.diagramImages = previousDiagramImages;
        project.diagramImage = previousDiagramImages[0] || "";
        alert(`图解图片处理失败：${error.message || "请换一张图片重试"}`);
      }

      refs.diagramImageInput.value = "";
    });
  }

  if (refs.diagramImageGallery) {
    refs.diagramImageGallery.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".diagram-image-remove");
      if (!removeBtn) return;
      const index = Number(removeBtn.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;

      const previousDiagramImages = Array.isArray(project.diagramImages) ? [...project.diagramImages] : [];
      const nextImages = previousDiagramImages.filter((_, itemIndex) => itemIndex !== index);
      project.diagramImages = nextImages;
      project.diagramImage = nextImages[0] || "";

      if (!persist()) {
        project.diagramImages = previousDiagramImages;
        project.diagramImage = previousDiagramImages[0] || "";
        persist();
        alert("删除图片失败，请稍后重试。");
      }
    });
  }

  document.querySelector("[data-action='incRow']").addEventListener("click", () => {
    const before = project.status;
    project.rows += 1;
    project.todayRows += 1;
    project.lastDate = getToday();
    persistWithCelebration(before);
  });

  document.querySelector("[data-action='decRow']").addEventListener("click", () => {
    project.rows = Math.max(0, project.rows - 1);
    persist();
  });

  document.querySelector("[data-action='addStep']").addEventListener("click", () => {
    const before = project.status;
    const step = Math.max(1, Number(refs.stepInput.value) || 1);
    project.rows += step;
    project.todayRows += step;
    project.lastDate = getToday();
    persistWithCelebration(before);
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

  loadTimerState();
  renderTimerState();
  bindGlobalTimer(() => project, persist);
  bindDraggableFloatingTimer();
  bindMobileFloatingTimerToggle();
  refreshExportPreview(project);

  setupCloudSync(projects, () => {
    const updated = projects.find((item) => item.id === projectId);
    if (!updated) {
      alert("该项目已在其他设备被删除，正在返回首页。");
      window.location.href = "index.html";
      return;
    }
    project = updated;
    renderProject(project);
    renderMaterials(project, persist);
    refreshExportPreview(project);
  });
}

init();
