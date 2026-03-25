const STORAGE_KEY = "knit-helper-state";

const refs = {
  periodFilters: document.getElementById("periodFilters"),
  statProjectCount: document.getElementById("statProjectCount"),
  statActiveCount: document.getElementById("statActiveCount"),
  statTotalDuration: document.getElementById("statTotalDuration"),
  statTotalRows: document.getElementById("statTotalRows"),
  projectRanking: document.getElementById("projectRanking"),
  todayTrendCanvas: document.getElementById("todayTrendCanvas"),
};

const state = {
  projects: [],
  period: "today",
};

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hh = Math.floor(safe / 3600).toString().padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    state.projects = list.filter((item) => item && typeof item === "object");
  } catch {
    state.projects = [];
  }
}

function getPeriodMultiplier(period) {
  if (period === "today") return 1 / 30;
  if (period === "week") return 0.4;
  if (period === "month") return 0.8;
  return 1;
}

function getScopedMetrics() {
  const ratio = getPeriodMultiplier(state.period);
  let totalSeconds = 0;
  let totalRows = 0;

  state.projects.forEach((project) => {
    const spentSeconds = Math.max(0, Number(project.spentSeconds) || 0);
    const rows = Math.max(0, Number(project.rows) || 0);

    if (state.period === "today") {
      totalSeconds += Math.max(0, Number(project.todaySeconds) || 0);
      totalRows += Math.max(0, Number(project.todayRows) || 0);
      return;
    }

    totalSeconds += Math.round(spentSeconds * ratio);
    totalRows += Math.round(rows * ratio);
  });

  return {
    projectCount: state.projects.length,
    activeCount: state.projects.filter((project) => project.status === "active").length,
    totalSeconds,
    totalRows,
  };
}

function renderOverview() {
  const metrics = getScopedMetrics();
  refs.statProjectCount.textContent = String(metrics.projectCount);
  refs.statActiveCount.textContent = String(metrics.activeCount);
  refs.statTotalDuration.textContent = formatDuration(metrics.totalSeconds);
  refs.statTotalRows.textContent = String(metrics.totalRows);
}

function renderRanking() {
  const ranking = [...state.projects]
    .sort((a, b) => (Number(b.spentSeconds) || 0) - (Number(a.spentSeconds) || 0))
    .slice(0, 6);

  if (!ranking.length) {
    refs.projectRanking.innerHTML = '<p class="helper-text">还没有可统计的项目。</p>';
    return;
  }

  refs.projectRanking.innerHTML = ranking
    .map((project, index) => {
      const duration = formatDuration(Number(project.spentSeconds) || 0);
      return `
        <article class="storage-item">
          <div class="storage-item-head">
            <h3>${index + 1}. ${String(project.projectName || "未命名作品")}</h3>
            <span class="storage-item-meta">${String(project.status || "paused")}</span>
          </div>
          <p class="storage-item-line">累计时长：${duration}</p>
          <p class="storage-item-line">累计行数：${Math.max(0, Number(project.rows) || 0)}</p>
        </article>
      `;
    })
    .join("");
}

function renderTodayTrend() {
  const canvas = refs.todayTrendCanvas;
  const ctx = canvas.getContext("2d");
  const projects = state.projects.slice(0, 8);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f9f0e3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!projects.length) {
    ctx.fillStyle = "#8a7661";
    ctx.font = "18px sans-serif";
    ctx.fillText("暂无可绘制数据", 40, 60);
    return;
  }

  const maxRows = Math.max(1, ...projects.map((item) => Math.max(0, Number(item.todayRows) || 0)));
  const barAreaW = canvas.width - 80;
  const barW = Math.max(36, Math.floor(barAreaW / projects.length) - 16);

  projects.forEach((project, index) => {
    const rows = Math.max(0, Number(project.todayRows) || 0);
    const h = Math.round((rows / maxRows) * 180);
    const x = 40 + index * (barW + 16);
    const y = 250 - h;

    ctx.fillStyle = "#efdfcc";
    ctx.fillRect(x, 70, barW, 180);

    ctx.fillStyle = "#d35c2f";
    ctx.fillRect(x, y, barW, h);

    ctx.fillStyle = "#5d4a36";
    ctx.font = "13px sans-serif";
    ctx.fillText(String(rows), x + 8, y - 8);

    const label = String(project.projectName || "项目").slice(0, 6);
    ctx.fillText(label, x, 276);
  });
}

function renderAll() {
  renderOverview();
  renderRanking();
  renderTodayTrend();
}

refs.periodFilters.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-period]");
  if (!target) return;
  state.period = target.dataset.period;
  refs.periodFilters.querySelectorAll("button[data-period]").forEach((btn) => {
    btn.classList.toggle("is-active", btn === target);
  });
  renderAll();
});

loadProjects();
renderAll();
