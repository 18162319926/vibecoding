const STORAGE_KEY = "knit-helper-state";
const YARN_STORAGE_KEY = "knit-yarn-storage";
const STATS_BOOTSTRAP_DATE_KEY = "knit-stats-bootstrap-date";

const refs = {
  syncHint: document.getElementById("syncHint"),
  accountChip: document.getElementById("accountChip"),
  openLoginBtn: document.getElementById("openLoginBtn"),
  openRegisterBtn: document.getElementById("openRegisterBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  authDialog: document.getElementById("authDialog"),
  closeAuthDialogBtn: document.getElementById("closeAuthDialogBtn"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authStatus: document.getElementById("authStatus"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  periodFilters: document.getElementById("periodFilters"),
  statProjectCount: document.getElementById("statProjectCount"),
  statTotalDuration: document.getElementById("statTotalDuration"),
  statTotalRows: document.getElementById("statTotalRows"),
  statTotalYarnUsed: document.getElementById("statTotalYarnUsed"),
  statTodayDuration: document.getElementById("statTodayDuration"),
  statWeekDuration: document.getElementById("statWeekDuration"),
  statMonthDuration: document.getElementById("statMonthDuration"),
  statAllDuration: document.getElementById("statAllDuration"),
  statAvgSessionDuration: document.getElementById("statAvgSessionDuration"),
  statPreferredSlot: document.getElementById("statPreferredSlot"),
  statAvgDailyDuration: document.getElementById("statAvgDailyDuration"),
  statAvgDailyRows: document.getElementById("statAvgDailyRows"),
  preferredSlotCanvas: document.getElementById("preferredSlotCanvas"),
  preferredSlotHint: document.getElementById("preferredSlotHint"),
  statActiveCount: document.getElementById("statActiveCount"),
  statDoneCount: document.getElementById("statDoneCount"),
  statPausedCount: document.getElementById("statPausedCount"),
  statCompletionRate: document.getElementById("statCompletionRate"),
  statAvgCompletionDays: document.getElementById("statAvgCompletionDays"),
  longestProjects: document.getElementById("longestProjects"),
  shortestProjects: document.getElementById("shortestProjects"),
  trendCanvas: document.getElementById("trendCanvas"),
  trendTitle: document.getElementById("trendTitle"),
  trendHint: document.getElementById("trendHint"),
  yarnBrandBarCanvas: document.getElementById("yarnBrandBarCanvas"),
  yarnTypePieCanvas: document.getElementById("yarnTypePieCanvas"),
  yarnUsageHint: document.getElementById("yarnUsageHint"),
  statBehaviorTotalRows: document.getElementById("statBehaviorTotalRows"),
  statBehaviorAvgRows: document.getElementById("statBehaviorAvgRows"),
  statFavoriteType: document.getElementById("statFavoriteType"),
  statActiveDays: document.getElementById("statActiveDays"),
  achievementText: document.getElementById("achievementText"),
};

const state = {
  period: "today",
  projects: [],
  yarnItems: [],
  trendPlot: null,
  bootstrapDate: "",
};

function ensureStatsBootstrapDate() {
  const today = getLocalDateKey();
  let saved = "";
  try {
    saved = String(localStorage.getItem(STATS_BOOTSTRAP_DATE_KEY) || "").trim();
  } catch {
    saved = "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(saved)) {
    saved = today;
    try {
      localStorage.setItem(STATS_BOOTSTRAP_DATE_KEY, saved);
    } catch {
      // Ignore write failure; fallback still works in memory.
    }
  }

  state.bootstrapDate = saved;
}

function isTodayBootstrapDay() {
  return state.bootstrapDate && state.bootstrapDate === getLocalDateKey();
}

function setStatsSyncHint(text) {
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
  } else if (/已同步|已刷新|已更新|已完成/.test(raw)) {
    icon = "✅";
    cls = "sync-state-ok";
  }
  refs.syncHint.className = `sync-state ${cls}`;
  refs.syncHint.textContent = `${icon} ${raw || "离线模式"}`;
}

function makeHourlyBuckets() {
  const buckets = {};
  for (let hour = 0; hour < 24; hour += 1) {
    buckets[`h${String(hour).padStart(2, "0")}`] = 0;
  }
  return buckets;
}

function toHourLabel(hourKey) {
  const hour = Number(String(hourKey || "").replace(/^h/, ""));
  if (!Number.isFinite(hour)) return "--:00";
  return `${String(hour).padStart(2, "0")}:00`;
}

function normalizeProjectHourlyBuckets(project) {
  const source = project && typeof project.timeBuckets === "object" ? project.timeBuckets : {};
  const buckets = makeHourlyBuckets();

  let hasHourly = false;
  for (let hour = 0; hour < 24; hour += 1) {
    const key = `h${String(hour).padStart(2, "0")}`;
    const value = toNonNegative(source[key]);
    if (value > 0) hasHourly = true;
    buckets[key] = value;
  }

  if (!hasHourly) {
    const morning = toNonNegative(source.morning);
    const afternoon = toNonNegative(source.afternoon);
    const evening = toNonNegative(source.evening);

    const morningUnit = morning / 12;
    const afternoonUnit = afternoon / 6;
    const eveningUnit = evening / 6;

    for (let hour = 0; hour <= 11; hour += 1) buckets[`h${String(hour).padStart(2, "0")}`] += morningUnit;
    for (let hour = 12; hour <= 17; hour += 1) buckets[`h${String(hour).padStart(2, "0")}`] += afternoonUnit;
    for (let hour = 18; hour <= 23; hour += 1) buckets[`h${String(hour).padStart(2, "0")}`] += eveningUnit;
  }

  return buckets;
}

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toNonNegative(value) {
  return Math.max(0, toSafeNumber(value));
}

function roundToSingle(value) {
  return Math.round(toSafeNumber(value) * 10) / 10;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hh = Math.floor(safe / 3600).toString().padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatWeight(value) {
  const num = roundToSingle(toNonNegative(value));
  return `${Number.isInteger(num) ? String(num) : num.toFixed(1)}g`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLastNDates(count) {
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    result.push(getLocalDateKey(day));
  }
  return result;
}

function getTrendDayCount(period) {
  if (period === "month") return 30;
  if (period === "all") return 90;
  return 7;
}

function loadProjectState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    state.projects = list.filter((item) => item && typeof item === "object");
  } catch {
    state.projects = [];
  }
}

function loadYarnState() {
  try {
    const raw = localStorage.getItem(YARN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.yarnItems = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    state.yarnItems = [];
  }
}

function getProjectDailyStats(project) {
  const map = {};
  const source = project && typeof project.dailyStats === "object" ? project.dailyStats : {};
  Object.entries(source).forEach(([date, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!value || typeof value !== "object") return;
    map[date] = {
      seconds: toNonNegative(value.seconds),
      rows: toNonNegative(value.rows),
    };
  });

  const today = getLocalDateKey();
  if (!map[today]) {
    const todaySeconds = toNonNegative(project?.todaySeconds);
    const todayRows = toNonNegative(project?.todayRows);
    if (todaySeconds > 0 || todayRows > 0) {
      map[today] = { seconds: todaySeconds, rows: todayRows };
    }
  }

  return map;
}

function deriveYarnMetrics(item) {
  const originalWeight = roundToSingle(toNonNegative(item?.originalWeight ?? item?.weight));
  const hasStock = item?.stockWeight !== undefined && item?.stockWeight !== null && String(item.stockWeight).trim() !== "";
  let stockWeight = hasStock
    ? roundToSingle(toNonNegative(item.stockWeight))
    : roundToSingle(originalWeight * (1 - Math.min(100, toNonNegative(item?.progress)) / 100));

  if (originalWeight > 0) {
    stockWeight = Math.min(originalWeight, Math.max(0, stockWeight));
  }

  const progress = originalWeight > 0 ? roundToSingle(((originalWeight - stockWeight) / originalWeight) * 100) : 0;
  return { originalWeight, stockWeight, progress };
}

function parseYarnRef(value) {
  const source = String(value || "").trim();
  if (!source) return { brand: "未命名", colorNo: "-" };

  const slashParts = source.split(/[\/|｜]/).map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return { brand: slashParts[0] || "未命名", colorNo: slashParts[1] || "-" };
  }

  return { brand: source, colorNo: "-" };
}

function parseYarnInfo(item) {
  const brand = String(item?.yarnBrand || "").trim();
  const colorNo = String(item?.yarnColorNo || "").trim();
  if (brand || colorNo) {
    return { brand: brand || "未命名", colorNo: colorNo || "-" };
  }
  return parseYarnRef(item?.yarnRef);
}

function getProjectSecondsForPeriod(project, period) {
  if (period === "all") return toNonNegative(project?.spentSeconds);
  if (isTodayBootstrapDay() && (period === "week" || period === "month")) {
    // On the bootstrap day, week/month should also include all historical time.
    return toNonNegative(project?.spentSeconds);
  }
  if (period === "today") {
    // First statistics day is special: fold all historical time into today.
    if (isTodayBootstrapDay()) return toNonNegative(project?.spentSeconds);
    return toNonNegative(project?.todaySeconds);
  }

  const daily = getProjectDailyStats(project);
  const dateKeys = period === "week" ? getLastNDates(7) : getLastNDates(30);
  return dateKeys.reduce((sum, key) => sum + toNonNegative(daily[key]?.seconds), 0);
}

function getProjectRowsForPeriod(project, period) {
  if (period === "all") return toNonNegative(project?.rows);
  if (isTodayBootstrapDay() && (period === "week" || period === "month")) {
    // On the bootstrap day, week/month should also include all historical rows.
    return toNonNegative(project?.rows);
  }
  if (period === "today") {
    // Keep row stats aligned with the same first-day aggregation rule.
    if (isTodayBootstrapDay()) return toNonNegative(project?.rows);
    return toNonNegative(project?.todayRows);
  }

  const daily = getProjectDailyStats(project);
  const dateKeys = period === "week" ? getLastNDates(7) : getLastNDates(30);
  return dateKeys.reduce((sum, key) => sum + toNonNegative(daily[key]?.rows), 0);
}

function computeTimeMetrics() {
  const todaySeconds = state.projects.reduce((sum, p) => sum + getProjectSecondsForPeriod(p, "today"), 0);
  const weekSeconds = state.projects.reduce((sum, p) => sum + getProjectSecondsForPeriod(p, "week"), 0);
  const monthSeconds = state.projects.reduce((sum, p) => sum + getProjectSecondsForPeriod(p, "month"), 0);
  const allSeconds = state.projects.reduce((sum, p) => sum + getProjectSecondsForPeriod(p, "all"), 0);

  const todayRows = state.projects.reduce((sum, p) => sum + getProjectRowsForPeriod(p, "today"), 0);
  const allRows = state.projects.reduce((sum, p) => sum + getProjectRowsForPeriod(p, "all"), 0);

  const activeDaysSet = new Set();
  const timeBuckets = makeHourlyBuckets();

  state.projects.forEach((project) => {
    const daily = getProjectDailyStats(project);
    Object.entries(daily).forEach(([date, item]) => {
      if (toNonNegative(item?.seconds) > 0 || toNonNegative(item?.rows) > 0) {
        activeDaysSet.add(date);
      }
    });

    const buckets = normalizeProjectHourlyBuckets(project);
    Object.keys(timeBuckets).forEach((key) => {
      timeBuckets[key] += toNonNegative(buckets[key]);
    });
  });

  const activeDays = activeDaysSet.size;
  const avgSessionSeconds = activeDays ? Math.round(allSeconds / activeDays) : 0;

  const bucketEntries = Object.entries(timeBuckets);
  const preferredEntry = bucketEntries.sort((a, b) => b[1] - a[1])[0];
  const preferredSlot = preferredEntry && preferredEntry[1] > 0 ? toHourLabel(preferredEntry[0]) : "暂无数据";
  const totalBucketSeconds = bucketEntries.reduce((sum, item) => sum + toNonNegative(item[1]), 0);

  return {
    todaySeconds,
    weekSeconds,
    monthSeconds,
    allSeconds,
    todayRows,
    allRows,
    activeDays,
    avgSessionSeconds,
    preferredSlot,
    timeBuckets,
    totalBucketSeconds,
  };
}

function renderPreferredSlotChart() {
  const canvas = refs.preferredSlotCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const metrics = computeTimeMetrics();
  const buckets = metrics.timeBuckets || makeHourlyBuckets();
  const entries = Object.keys(buckets).map((key, index) => ({
    label: toHourLabel(key),
    value: toNonNegative(buckets[key]),
    color: index <= 11 ? "#f39c12" : index <= 17 ? "#2f7d6b" : "#d35c2f",
  }));

  const total = entries.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(1, ...entries.map((item) => item.value));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff9f2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = { top: 36, right: 36, bottom: 44, left: 80 };
  const plotW = canvas.width - padding.left - padding.right;
  const plotH = canvas.height - padding.top - padding.bottom;

  ctx.strokeStyle = "#eadfce";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  const colWidth = Math.max(10, Math.min(24, plotW / entries.length - 4));
  const gap = (plotW - colWidth * entries.length) / (entries.length + 1);

  entries.forEach((item, index) => {
    const x = padding.left + gap + index * (colWidth + gap);
    const h = Math.round((item.value / maxValue) * plotH);
    const y = padding.top + plotH - h;

    const grad = ctx.createLinearGradient(0, y, 0, padding.top + plotH);
    grad.addColorStop(0, `${item.color}dd`);
    grad.addColorStop(1, `${item.color}66`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, colWidth, h);

    const ratio = total > 0 ? Math.round((item.value / total) * 100) : 0;
    ctx.fillStyle = "#5f4938";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${ratio}%`, x + Math.max(2, colWidth / 2 - 12), y - 8);

    if (index % 2 === 0) {
      ctx.fillStyle = "#6f5a47";
      ctx.font = "11px sans-serif";
      ctx.fillText(item.label.slice(0, 2), x + Math.max(1, colWidth / 2 - 6), canvas.height - 18);
    }
  });

  ctx.fillStyle = "#7c6855";
  ctx.font = "11px sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const tick = Math.round((maxValue * (4 - i)) / 4);
    const y = padding.top + (plotH / 4) * i + 4;
    ctx.fillText(formatDuration(tick), 10, y);
  }

  if (refs.preferredSlotHint) {
    if (total <= 0) {
      refs.preferredSlotHint.textContent = "暂未产生计时数据，开始计时后将展示时段分布。";
    } else {
      refs.preferredSlotHint.textContent = `偏好小时：${metrics.preferredSlot}，累计 ${formatDuration(total)}。`;
    }
  }
}

function setAuthNav(user) {
  const loggedIn = Boolean(user && user.email);
  if (refs.accountChip) {
    refs.accountChip.hidden = !loggedIn;
    refs.accountChip.textContent = loggedIn ? `当前账号：${user.email}` : "当前账号：未登录";
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

function setupCloudSync() {
  if (!window.cloudSync) {
    setAuthNav(null);
    setStatsSyncHint("离线模式");
    return;
  }

  setAuthNav(window.cloudSync.getCurrentUser());

  if (refs.openLoginBtn) refs.openLoginBtn.addEventListener("click", () => openAuthDialog("login"));
  if (refs.openRegisterBtn) refs.openRegisterBtn.addEventListener("click", () => openAuthDialog("register"));
  if (refs.closeAuthDialogBtn) refs.closeAuthDialogBtn.addEventListener("click", closeAuthDialog);
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
    onUserChanged: (user) => {
      setAuthNav(user);
      if (!user) {
        setStatsSyncHint("离线模式");
        return;
      }
      closeAuthDialog();
      setStatsSyncHint("已登录云端");
    },
  });
}

function computeYarnUsage() {
  let totalUsed = 0;
  state.yarnItems.forEach((item) => {
    const metrics = deriveYarnMetrics(item);
    totalUsed += Math.max(0, metrics.originalWeight - metrics.stockWeight);
  });
  return roundToSingle(totalUsed);
}

function computeProjectProgressMetrics() {
  const total = state.projects.length;
  const active = state.projects.filter((p) => p.status === "active").length;
  const done = state.projects.filter((p) => p.status === "done").length;
  const paused = state.projects.filter((p) => p.status === "paused").length;
  const completionRate = total ? Math.round((done / total) * 100) : 0;

  const doneDurations = state.projects
    .filter((p) => p.status === "done")
    .map((project) => {
      const createdAt = toNonNegative(project.createdAt || project.updatedAt);
      const completedAt = toNonNegative(project.completedAt || project.updatedAt);
      if (!createdAt || !completedAt || completedAt < createdAt) return 0;
      const days = Math.max(1, Math.round((completedAt - createdAt) / 86400000));
      return days;
    })
    .filter((days) => days > 0);

  const avgCompletionDays = doneDurations.length
    ? Math.round(doneDurations.reduce((sum, days) => sum + days, 0) / doneDurations.length)
    : 0;

  return { active, done, paused, completionRate, avgCompletionDays };
}

function computeBehaviorMetrics(timeMetrics) {
  const rows = timeMetrics.allRows;
  const activeDays = timeMetrics.activeDays;
  const avgRows = activeDays ? Math.round(rows / activeDays) : 0;

  const typeCount = new Map();
  state.projects.forEach((project) => {
    const type = String(project.projectType || "").trim() || "其他";
    const weight = Math.max(1, toNonNegative(project.rows) + Math.round(toNonNegative(project.spentSeconds) / 600));
    typeCount.set(type, (typeCount.get(type) || 0) + weight);
  });

  let favoriteType = "暂无";
  let favoriteScore = 0;
  typeCount.forEach((score, type) => {
    if (score > favoriteScore) {
      favoriteScore = score;
      favoriteType = type;
    }
  });

  return { rows, avgRows, favoriteType, activeDays };
}

function getTrendSeries(period = state.period) {
  const days = getLastNDates(getTrendDayCount(period));
  const seconds = days.map(() => 0);
  const rows = days.map(() => 0);

  state.projects.forEach((project) => {
    const daily = getProjectDailyStats(project);
    days.forEach((day, index) => {
      seconds[index] += toNonNegative(daily[day]?.seconds);
      rows[index] += toNonNegative(daily[day]?.rows);
    });

    if (isTodayBootstrapDay() && (period === "today" || period === "week" || period === "month")) {
      const countedSeconds = days.reduce((sum, day, idx) => sum + toNonNegative(daily[day]?.seconds), 0);
      const countedRows = days.reduce((sum, day, idx) => sum + toNonNegative(daily[day]?.rows), 0);
      const missingSeconds = Math.max(0, toNonNegative(project?.spentSeconds) - countedSeconds);
      const missingRows = Math.max(0, toNonNegative(project?.rows) - countedRows);
      const lastIndex = days.length - 1;
      if (lastIndex >= 0) {
        seconds[lastIndex] += missingSeconds;
        rows[lastIndex] += missingRows;
      }
    }
  });

  return { days, seconds, rows };
}

function renderOverview() {
  const timeMetrics = computeTimeMetrics();

  if (refs.statProjectCount) refs.statProjectCount.textContent = String(state.projects.length);
  if (refs.statTotalDuration) refs.statTotalDuration.textContent = formatDuration(timeMetrics.allSeconds);
  if (refs.statTotalRows) refs.statTotalRows.textContent = String(timeMetrics.allRows);
  if (refs.statTotalYarnUsed) refs.statTotalYarnUsed.textContent = formatWeight(computeYarnUsage());

  if (refs.statTodayDuration) refs.statTodayDuration.textContent = formatDuration(timeMetrics.todaySeconds);
  if (refs.statWeekDuration) refs.statWeekDuration.textContent = formatDuration(timeMetrics.weekSeconds);
  if (refs.statMonthDuration) refs.statMonthDuration.textContent = formatDuration(timeMetrics.monthSeconds);
  if (refs.statAllDuration) refs.statAllDuration.textContent = formatDuration(timeMetrics.allSeconds);
  if (refs.statAvgSessionDuration) refs.statAvgSessionDuration.textContent = formatDuration(timeMetrics.avgSessionSeconds);
  if (refs.statPreferredSlot) refs.statPreferredSlot.textContent = timeMetrics.preferredSlot;
  if (refs.statAvgDailyDuration) {
    const avgDaySeconds = Math.round(timeMetrics.weekSeconds / 7);
    refs.statAvgDailyDuration.textContent = formatDuration(avgDaySeconds);
  }
  if (refs.statAvgDailyRows) {
    const trend = getTrendSeries("week");
    const avgRows = Math.round(trend.rows.reduce((sum, value) => sum + value, 0) / 7);
    refs.statAvgDailyRows.textContent = String(avgRows);
  }

  const progress = computeProjectProgressMetrics();
  if (refs.statActiveCount) refs.statActiveCount.textContent = String(progress.active);
  if (refs.statDoneCount) refs.statDoneCount.textContent = String(progress.done);
  if (refs.statPausedCount) refs.statPausedCount.textContent = String(progress.paused);
  if (refs.statCompletionRate) refs.statCompletionRate.textContent = `${progress.completionRate}%`;
  if (refs.statAvgCompletionDays) refs.statAvgCompletionDays.textContent = `${progress.avgCompletionDays}天`;

  const behavior = computeBehaviorMetrics(timeMetrics);
  if (refs.statBehaviorTotalRows) refs.statBehaviorTotalRows.textContent = String(behavior.rows);
  if (refs.statBehaviorAvgRows) refs.statBehaviorAvgRows.textContent = String(behavior.avgRows);
  if (refs.statFavoriteType) refs.statFavoriteType.textContent = behavior.favoriteType;
  if (refs.statActiveDays) refs.statActiveDays.textContent = `${behavior.activeDays}天`;

  if (refs.achievementText) {
    const hours = Math.floor(timeMetrics.allSeconds / 3600);
    const scarfEq = Math.max(1, Math.round(timeMetrics.allRows / 120));
    refs.achievementText.textContent = `你已经累计编织了 ${hours} 小时，相当于织完了约 ${scarfEq} 条围巾。`;
  }
}

function renderProjectRanking() {
  const period = state.period;
  const withDuration = state.projects
    .map((project) => ({
      project,
      seconds: getProjectSecondsForPeriod(project, period),
      rows: getProjectRowsForPeriod(project, period),
    }))
    .filter((item) => item.seconds > 0 || item.rows > 0);

  const longest = [...withDuration]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);
  const shortest = [...withDuration]
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, 5);

  const renderList = (target, list, emptyText) => {
    if (!target) return;
    if (!list.length) {
      target.innerHTML = `<p class="helper-text">${emptyText}</p>`;
      return;
    }
    target.innerHTML = list
      .map((item, index) => `
        <article class="storage-item">
          <div class="storage-item-head">
            <h3>${index + 1}. ${escapeHtml(String(item.project.projectName || "未命名作品"))}</h3>
            <span class="storage-item-meta">${escapeHtml(String(item.project.status || "paused"))}</span>
          </div>
          <p class="storage-item-line">时长：${formatDuration(item.seconds)}</p>
          <p class="storage-item-line">行数：${item.rows}</p>
        </article>
      `)
      .join("");
  };

  renderList(refs.longestProjects, longest, "当前周期还没有有效耗时数据。");
  renderList(refs.shortestProjects, shortest, "当前周期还没有可比较项目。");
}

function renderTrendChart() {
  const canvas = refs.trendCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const trend = getTrendSeries(state.period);
  const hoursSeries = trend.seconds.map((value) => roundToSingle(value / 3600));
  const rowsSeries = trend.rows.map((value) => toNonNegative(value));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#fffaf4");
  bg.addColorStop(1, "#fff3e7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = { top: 40, right: 46, bottom: 48, left: 46 };
  const plotW = canvas.width - padding.left - padding.right;
  const plotH = canvas.height - padding.top - padding.bottom;

  ctx.strokeStyle = "#eadfce";
  ctx.lineWidth = 1.1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  const maxHours = Math.max(1, ...hoursSeries);
  const maxRows = Math.max(1, ...rowsSeries);
  const stepX = trend.days.length > 1 ? plotW / (trend.days.length - 1) : plotW;

  const toPoints = (series, maxValue) => series.map((value, index) => ({
    x: padding.left + stepX * index,
    y: padding.top + plotH - (value / maxValue) * plotH,
    value,
  }));

  const buildSmoothPath = (points) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      ctx.quadraticCurveTo(midX, prev.y, curr.x, curr.y);
    }
  };

  const drawSeries = (points, color, areaTop, areaBottom) => {
    if (!points.length) return;

    buildSmoothPath(points);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    const areaGradient = ctx.createLinearGradient(0, areaTop, 0, areaBottom);
    areaGradient.addColorStop(0, `${color}33`);
    areaGradient.addColorStop(1, `${color}05`);

    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + plotH);
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (i === 0) {
        ctx.lineTo(p.x, p.y);
      } else {
        const prev = points[i - 1];
        const midX = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(midX, prev.y, p.x, p.y);
      }
    }
    ctx.lineTo(points[points.length - 1].x, padding.top + plotH);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();

    points.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const hourPoints = toPoints(hoursSeries, maxHours);
  const rowPoints = toPoints(rowsSeries, maxRows);
  drawSeries(hourPoints, "#d35c2f", padding.top, padding.top + plotH);
  drawSeries(rowPoints, "#2f7d6b", padding.top, padding.top + plotH);

  state.trendPlot = {
    canvas,
    days: trend.days,
    hourPoints,
    rowPoints,
    hoursSeries,
    rowsSeries,
  };

  ctx.fillStyle = "#6b5a48";
  ctx.font = "12px sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH / 4) * i;
    const hourTick = roundToSingle(maxHours - (maxHours * i) / 4);
    const rowTick = Math.round(maxRows - (maxRows * i) / 4);
    ctx.fillText(String(hourTick), 8, y + 4);
    ctx.fillText(String(rowTick), canvas.width - 30, y + 4);
  }

  ctx.fillStyle = "#7c6855";
  ctx.font = "11px sans-serif";
  const labelStep = Math.max(1, Math.ceil(trend.days.length / 10));
  trend.days.forEach((day, index) => {
    if (index % labelStep !== 0 && index !== trend.days.length - 1) return;
    const x = padding.left + stepX * index;
    ctx.fillText(day.slice(5), x - 14, canvas.height - 16);
  });

  ctx.fillStyle = "#d35c2f";
  ctx.fillRect(padding.left, 16, 14, 3);
  ctx.fillStyle = "#6b5a48";
  ctx.font = "12px sans-serif";
  ctx.fillText("时长趋势（小时）", padding.left + 20, 20);

  ctx.fillStyle = "#2f7d6b";
  ctx.fillRect(padding.left + 136, 16, 14, 3);
  ctx.fillStyle = "#6b5a48";
  ctx.fillText("行数趋势（行）", padding.left + 156, 20);

  if (refs.trendHint) {
    const totalHours = roundToSingle(trend.seconds.reduce((sum, v) => sum + v, 0) / 3600);
    const totalRows = trend.rows.reduce((sum, v) => sum + v, 0);
    const peakHour = Math.max(...hoursSeries);
    const peakRow = Math.max(...rowsSeries);
    refs.trendHint.textContent = `最近${trend.days.length}天累计 ${totalHours} 小时，累计 ${totalRows} 行；单日峰值 ${peakHour} 小时 / ${peakRow} 行。`;
  }

  if (refs.trendTitle) {
    const titleMap = {
      today: "最近 7 天趋势（今日口径）",
      week: "最近 7 天趋势（本周口径）",
      month: "最近 30 天趋势（本月口径）",
      all: "最近 90 天趋势（全部口径）",
    };
    refs.trendTitle.textContent = titleMap[state.period] || "趋势";
  }
}

function getTrendTooltipEl() {
  let el = document.getElementById("trendTooltip");
  if (el) return el;
  el = document.createElement("div");
  el.id = "trendTooltip";
  el.className = "trend-tooltip";
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function bindTrendTooltip() {
  const canvas = refs.trendCanvas;
  if (!canvas || canvas.dataset.tooltipBound === "1") return;
  const tooltip = getTrendTooltipEl();

  const hide = () => {
    tooltip.hidden = true;
  };

  canvas.addEventListener("mouseleave", hide);

  canvas.addEventListener("mousemove", (event) => {
    const plot = state.trendPlot;
    if (!plot || !plot.hourPoints || !plot.hourPoints.length) {
      hide();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const offsetX = (event.clientX - rect.left) * scaleX;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    plot.hourPoints.forEach((point, index) => {
      const dist = Math.abs(point.x - offsetX);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });

    const day = plot.days[nearestIndex] || "-";
    const hours = plot.hoursSeries[nearestIndex] || 0;
    const rows = plot.rowsSeries[nearestIndex] || 0;
    tooltip.innerHTML = `${day}<br>时长：${hours} 小时<br>行数：${rows} 行`;

    tooltip.style.left = `${event.pageX + 12}px`;
    tooltip.style.top = `${event.pageY - 14}px`;
    tooltip.hidden = false;
  });

  canvas.dataset.tooltipBound = "1";
}

function renderYarnUsageCharts() {
  const barCanvas = refs.yarnBrandBarCanvas;
  const pieCanvas = refs.yarnTypePieCanvas;
  if (!barCanvas || !pieCanvas) return;

  const barCtx = barCanvas.getContext("2d");
  const pieCtx = pieCanvas.getContext("2d");
  if (!barCtx || !pieCtx) return;

  const brandMap = new Map();
  const typeMap = new Map();
  let totalUsed = 0;

  state.yarnItems.forEach((item) => {
    const info = parseYarnInfo(item);
    const metrics = deriveYarnMetrics(item);
    const used = Math.max(0, metrics.originalWeight - metrics.stockWeight);
    const weight = used > 0 ? used : metrics.originalWeight > 0 ? metrics.originalWeight * 0.2 : 1;

    const brandKey = `${info.brand}${info.colorNo && info.colorNo !== "-" ? ` / ${info.colorNo}` : ""}`;
    brandMap.set(brandKey, (brandMap.get(brandKey) || 0) + weight);

    const type = String(item?.yarnType || "未标注类型").trim() || "未标注类型";
    typeMap.set(type, (typeMap.get(type) || 0) + weight);
    totalUsed += used;
  });

  barCtx.clearRect(0, 0, barCanvas.width, barCanvas.height);
  barCtx.fillStyle = "#fff9f2";
  barCtx.fillRect(0, 0, barCanvas.width, barCanvas.height);

  const rankedBrands = [...brandMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!rankedBrands.length) {
    barCtx.fillStyle = "#8a7661";
    barCtx.font = "16px sans-serif";
    barCtx.fillText("暂无可用线材数据", 30, 48);
  } else {
    const maxValue = Math.max(1, ...rankedBrands.map((item) => item[1]));
    const left = 180;
    const right = 32;
    const top = 28;
    const rowH = 44;
    rankedBrands.forEach(([label, value], index) => {
      const y = top + index * rowH;
      const barW = Math.round(((barCanvas.width - left - right) * value) / maxValue);

      barCtx.fillStyle = "#f2dfca";
      barCtx.fillRect(left, y, barCanvas.width - left - right, 18);
      barCtx.fillStyle = "#d35c2f";
      barCtx.fillRect(left, y, barW, 18);

      barCtx.fillStyle = "#5d4a36";
      barCtx.font = "13px sans-serif";
      barCtx.fillText(label.slice(0, 20), 16, y + 13);
      barCtx.fillText(`${roundToSingle(value)}g`, left + barW + 8, y + 13);
    });
  }

  pieCtx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
  pieCtx.fillStyle = "#fff9f2";
  pieCtx.fillRect(0, 0, pieCanvas.width, pieCanvas.height);

  const rankedTypes = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);
  if (!rankedTypes.length) {
    pieCtx.fillStyle = "#8a7661";
    pieCtx.font = "16px sans-serif";
    pieCtx.fillText("暂无可用线材类型数据", 30, 48);
  } else {
    const palette = ["#d35c2f", "#2f7d6b", "#6c5ce7", "#f39c12", "#16a085", "#c0392b", "#7f8c8d"];
    const centerX = 170;
    const centerY = 165;
    const radius = 98;
    const sum = rankedTypes.reduce((acc, item) => acc + item[1], 0) || 1;

    let start = -Math.PI / 2;
    rankedTypes.forEach(([type, value], index) => {
      const angle = (value / sum) * Math.PI * 2;
      const end = start + angle;
      pieCtx.beginPath();
      pieCtx.moveTo(centerX, centerY);
      pieCtx.arc(centerX, centerY, radius, start, end);
      pieCtx.closePath();
      pieCtx.fillStyle = palette[index % palette.length];
      pieCtx.fill();
      start = end;

      const legendY = 44 + index * 30;
      const ratio = `${Math.round((value / sum) * 100)}%`;
      pieCtx.fillStyle = palette[index % palette.length];
      pieCtx.fillRect(330, legendY - 10, 14, 14);
      pieCtx.fillStyle = "#5d4a36";
      pieCtx.font = "13px sans-serif";
      pieCtx.fillText(`${type} ${ratio}`, 352, legendY + 1);
    });
  }

  if (refs.yarnUsageHint) {
    refs.yarnUsageHint.textContent = `基于当前毛线仓库条目统计，累计已用 ${formatWeight(totalUsed)}。`;
  }
}

function renderAll() {
  renderOverview();
  renderPreferredSlotChart();
  renderProjectRanking();
  renderTrendChart();
  renderYarnUsageCharts();
}

function refreshStatsData(reasonText = "已刷新统计") {
  try {
    setStatsSyncHint("同步中...");
    loadProjectState();
    loadYarnState();
    renderAll();
    setStatsSyncHint(reasonText);
  } catch (error) {
    setStatsSyncHint(`刷新失败：${error?.message || "请稍后重试"}`);
  }
}

if (refs.periodFilters) {
  refs.periodFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-period]");
    if (!target) return;
    state.period = target.dataset.period;
    refs.periodFilters.querySelectorAll("button[data-period]").forEach((btn) => {
      btn.classList.toggle("is-active", btn === target);
    });
    renderAll();
  });
}

if (refs.syncHint) {
  refs.syncHint.addEventListener("click", () => {
    refreshStatsData("已手动刷新统计");
  });
}

window.addEventListener("storage", (event) => {
  if (!event) return;
  if (event.key !== STORAGE_KEY && event.key !== YARN_STORAGE_KEY) return;
  refreshStatsData("已更新最新数据");
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshStatsData("已刷新统计");
  }
});

loadProjectState();
loadYarnState();
ensureStatsBootstrapDate();
renderAll();
bindTrendTooltip();
setupCloudSync();
