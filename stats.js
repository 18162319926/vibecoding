// 自动补全所有毛线条目的历史 usedLog（根据 stockWeight 变化推断）
window.rebuildYarnUsedLogFromHistory = function rebuildYarnUsedLogFromHistory() {
  let patched = 0;
  try {
    const raw = localStorage.getItem('knit-yarn-storage');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return alert('未找到毛线仓库数据');
    parsed.forEach(item => {
      // 只处理有历史修改记录的条目
      if (!Array.isArray(item.history) || item.history.length === 0) return;
      let usedLog = [];
      let prevStock = typeof item.originalWeight === 'number' ? item.originalWeight : (typeof item.weight === 'number' ? item.weight : 0);
      item.history.forEach(h => {
        // h: { stockWeight, updatedAt }
        if (typeof h.stockWeight !== 'number' || !h.updatedAt) return;
        const used = prevStock - h.stockWeight;
        if (used > 0) {
          // 日期精度到天
          const date = String(h.updatedAt).slice(0,10);
          usedLog.push({ date, used: Math.round(used * 1000) / 1000 });
        }
        prevStock = h.stockWeight;
      });
      // 最后一次保存的 stockWeight 也要补一次
      if (typeof item.stockWeight === 'number' && prevStock > item.stockWeight) {
        const date = (item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0,10) : new Date().toISOString().slice(0,10));
        usedLog.push({ date, used: Math.round((prevStock - item.stockWeight) * 1000) / 1000 });
      }
      if (usedLog.length > 0) {
        item.usedLog = usedLog;
        patched++;
      }
    });
    localStorage.setItem('knit-yarn-storage', JSON.stringify(parsed));
    alert(`已补全 ${patched} 条毛线的历史消耗记录。`);
  } catch (e) {
    alert('补全历史 usedLog 失败：' + e.message);
  }
};
// 自动清理今天未来小时 hourBuckets 的脚本（可在 stats 页面调用）
window.clearFutureHourBucketsToday = function clearFutureHourBucketsToday() {
  const today = getLocalDateKey();
  let cleaned = 0;
  state.projects.forEach((project) => {
    const entry = project.dailyStats && project.dailyStats[today];
    if (!entry || !entry.hourBuckets) return;
    const nowHour = (new Date()).getHours();
    for (let h = nowHour + 1; h < 24; h++) {
      const key = `h${String(h).padStart(2, "0")}`;
      if (entry.hourBuckets[key] && entry.hourBuckets[key] !== 0) {
        entry.hourBuckets[key] = 0;
        cleaned++;
      }
    }
  });
  if (cleaned > 0) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.projects = state.projects;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      alert(`已清理今天未来小时 hourBuckets：${cleaned} 项。`);
    } catch (e) {
      alert(`清理未来小时 hourBuckets 时保存失败：${e.message}`);
    }
  } else {
    alert('没有需要清理的未来小时 hourBuckets。');
  }
};
// 脚本：自动修复异常 hourBuckets（总和远大于 seconds 的天直接均分填充）
window.fixAbnormalHourBuckets = function fixAbnormalHourBuckets() {
  let fixed = 0;
  state.projects.forEach((project) => {
    if (!project.dailyStats) return;
    Object.entries(project.dailyStats).forEach(([date, stat]) => {
      if (!stat.hourBuckets || typeof stat.hourBuckets !== 'object') return;
      const totalSeconds = toNonNegative(stat.seconds);
      const hourSum = Object.values(stat.hourBuckets).reduce((a, b) => a + toNonNegative(b), 0);
      if (hourSum > totalSeconds * 1.2 && totalSeconds > 0) {
        // 直接均分填充
        const avg = Math.floor(totalSeconds / 24);
        const remain = totalSeconds - avg * 24;
        for (let h = 0; h < 24; h++) {
          const key = `h${String(h).padStart(2, "0")}`;
          stat.hourBuckets[key] = avg + (h < remain ? 1 : 0);
        }
        fixed++;
      }
    });
  });
  if (fixed > 0) {
    // 保存到本地存储
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.projects = state.projects;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      alert(`已修复 ${fixed} 条异常 hourBuckets 数据。`);
    } catch (e) {
      alert(`修复异常 hourBuckets 时保存失败：${e.message}`);
    }
  } else {
    alert('没有检测到异常 hourBuckets 数据。');
  }
}
// 方便控制台调用
// 一次性迁移脚本：修复 UTC 错位的 dailyStats 日期，将 0~8 点 hourBuckets 合并到本地日期，并清理原错位项
function migrateUtcDateKeyToLocal() {
  let moved = 0, merged = 0, deleted = 0;
  state.projects.forEach((project) => {
    if (!project.dailyStats) return;
    const stats = project.dailyStats;
    const today = getLocalDateKey();
    // 收集所有疑似 UTC 错位的日期（即 hourBuckets 仅有 h00~h08，且本地日期不存在或数据为 0）
    const keys = Object.keys(stats);
    keys.forEach((dateKey) => {
      // 只处理历史日期，避免把今天的数据迁到明天
      if (dateKey >= today) return;
      const stat = stats[dateKey];
      if (!stat || typeof stat !== 'object' || !stat.hourBuckets) return;
      // 检查 hourBuckets 是否仅有 0~8 点有值
      const hours = Object.keys(stat.hourBuckets).filter(h => stat.hourBuckets[h] > 0);
      if (hours.length === 0) return;
      const allInEarly = hours.every(h => /^h0[0-8]$/.test(h));
      if (!allInEarly) return;
      // 计算本地日期
      const dt = new Date(dateKey + 'T00:00:00');
      dt.setHours(dt.getHours() + 8); // UTC+8
      const localKey = getLocalDateKey(dt);
      if (localKey === dateKey) return; // 已是本地
      if (localKey > today) return; // 禁止生成未来日期
      // 合并到本地日期
      if (!stats[localKey]) {
        stats[localKey] = { seconds: 0, rows: 0, hourBuckets: {} };
      }
      // 合并 hourBuckets
      for (const h of hours) {
        stats[localKey].hourBuckets[h] = (stats[localKey].hourBuckets[h] || 0) + stat.hourBuckets[h];
        stats[localKey].seconds = (stats[localKey].seconds || 0) + (stat.seconds || 0);
        stats[localKey].rows = (stats[localKey].rows || 0) + (stat.rows || 0);
        merged++;
      }
      // 删除原错位项
      delete stats[dateKey];
      deleted++;
      moved++;
    });
  });
  // 保存
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.projects = state.projects;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    alert(`已修复 UTC 错位日期：合并 ${moved} 项，合并 hourBuckets ${merged}，删除错位项 ${deleted}。`);
  } catch (e) {
    alert(`修复 UTC 错位日期时保存失败：${e.message}`);
  }
}
window.migrateUtcDateKeyToLocal = migrateUtcDateKeyToLocal;
window.rollbackFutureDailyStats = function rollbackFutureDailyStats() {
  let rollbackDays = 0;
  let rollbackSeconds = 0;
  let rollbackRows = 0;
  const today = getLocalDateKey();

  state.projects.forEach((project) => {
    if (!project || typeof project !== 'object') return;
    if (!project.dailyStats || typeof project.dailyStats !== 'object') return;

    const stats = project.dailyStats;
    const futureKeys = Object.keys(stats).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key > today);
    if (!futureKeys.length) return;

    if (!stats[today] || typeof stats[today] !== 'object') {
      stats[today] = { rows: 0, seconds: 0, hourBuckets: makeHourlyBuckets() };
    }
    if (!stats[today].hourBuckets || typeof stats[today].hourBuckets !== 'object') {
      stats[today].hourBuckets = makeHourlyBuckets();
    }

    futureKeys.forEach((futureKey) => {
      const src = stats[futureKey];
      if (!src || typeof src !== 'object') {
        delete stats[futureKey];
        return;
      }

      const sec = Math.max(0, Number(src.seconds) || 0);
      const row = Math.max(0, Number(src.rows) || 0);
      stats[today].seconds = Math.max(0, Number(stats[today].seconds) || 0) + sec;
      stats[today].rows = Math.max(0, Number(stats[today].rows) || 0) + row;
      rollbackSeconds += sec;
      rollbackRows += row;

      const hb = src.hourBuckets && typeof src.hourBuckets === 'object' ? src.hourBuckets : {};
      for (let h = 0; h < 24; h += 1) {
        const key = `h${String(h).padStart(2, "0")}`;
        stats[today].hourBuckets[key] = Math.max(0, Number(stats[today].hourBuckets[key]) || 0) + Math.max(0, Number(hb[key]) || 0);
      }

      delete stats[futureKey];
      rollbackDays += 1;
    });

    project.todayRows = Math.max(0, Number(stats[today].rows) || 0);
    project.todaySeconds = Math.max(0, Number(stats[today].seconds) || 0);
    project.lastDate = today;

    const nextTimeBuckets = makeHourlyBuckets();
    for (let h = 0; h < 24; h += 1) {
      const key = `h${String(h).padStart(2, "0")}`;
      nextTimeBuckets[key] = Math.max(0, Number(stats[today].hourBuckets[key]) || 0);
    }
    project.timeBuckets = nextTimeBuckets;
    project.updatedAt = Date.now();
  });

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.projects = state.projects;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    alert(`已回滚未来日期数据：回滚 ${rollbackDays} 天，seconds ${rollbackSeconds}，rows ${rollbackRows}。`);
    renderAll();
  } catch (e) {
    alert(`回滚未来日期数据时保存失败：${e.message}`);
  }
};
window.restoreProjectsFromCloud = async function restoreProjectsFromCloud() {
  if (!window.cloudSync || typeof window.cloudSync.pullState !== "function") {
    alert("云同步不可用，无法从云端恢复。");
    return;
  }
  if (typeof window.cloudSync.getCurrentUser === "function" && !window.cloudSync.getCurrentUser()) {
    alert("请先登录云端账号，再执行恢复。");
    return;
  }

  let remote;
  try {
    remote = await window.cloudSync.pullState();
  } catch (error) {
    alert(`拉取云端快照失败：${error?.message || "请稍后重试"}`);
    return;
  }

  if (!remote || !Array.isArray(remote.projects) || !remote.projects.length) {
    alert("云端没有可恢复的项目快照。");
    return;
  }

  const nextProjects = remote.projects
    .map((project) => normalizeProject(project))
    .filter((project) => !isLegacyStarterProject(project));

  if (!nextProjects.length) {
    alert("云端快照为空，无法恢复。");
    return;
  }

  const ok = window.confirm(`将从云端恢复 ${nextProjects.length} 个项目，覆盖当前本地统计。继续吗？`);
  if (!ok) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.projects = nextProjects;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    state.projects = nextProjects;
    renderAll();
    alert(`已从云端恢复 ${nextProjects.length} 个项目。`);
  } catch (error) {
    alert(`恢复本地统计失败：${error?.message || "请稍后重试"}`);
  }
};

window.repairProjectStatsFromDailyStats = function repairProjectStatsFromDailyStats() {
  const today = getLocalDateKey();
  let processedProjects = 0;
  let updatedProjects = 0;
  let repairedTodayRows = 0;
  let repairedTodaySeconds = 0;

  state.projects.forEach((project) => {
    if (!project || typeof project !== "object") return;
    const stats = project.dailyStats && typeof project.dailyStats === "object" ? project.dailyStats : {};
    const dates = Object.keys(stats).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    if (!dates.length && !stats[today]) return;
    processedProjects += 1;

    const nextTimeBuckets = makeHourlyBuckets();

    const todayEntry = stats[today] && typeof stats[today] === "object" ? stats[today] : null;
    const nextTodayRows = Math.max(0, Number(todayEntry?.rows) || 0);
    const nextTodaySeconds = Math.max(0, Number(todayEntry?.seconds) || 0);
    const todayHourBuckets = todayEntry && todayEntry.hourBuckets && typeof todayEntry.hourBuckets === "object"
      ? todayEntry.hourBuckets
      : null;

    if (todayHourBuckets) {
      for (let h = 0; h < 24; h += 1) {
        const key = `h${String(h).padStart(2, "0")}`;
        nextTimeBuckets[key] = Math.max(0, Number(todayHourBuckets[key]) || 0);
      }
    }

    project.todayRows = nextTodayRows;
    project.todaySeconds = nextTodaySeconds;
    project.timeBuckets = nextTimeBuckets;
    project.lastDate = todayEntry ? today : (dates[dates.length - 1] || today);
    project.updatedAt = Date.now();

    updatedProjects += 1;
    repairedTodayRows += nextTodayRows;
    repairedTodaySeconds += nextTodaySeconds;
  });

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.projects = state.projects;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));

    if (window.cloudSync && typeof window.cloudSync.getCurrentUser === "function" && window.cloudSync.getCurrentUser() && typeof window.cloudSync.pushState === "function") {
      void window.cloudSync.pushState({ projects: state.projects });
    }

    renderAll();
    alert(`已处理 ${processedProjects} 个项目，已更新 ${updatedProjects} 个项目：回填 todayRows ${repairedTodayRows}，todaySeconds ${repairedTodaySeconds}。`);
  } catch (error) {
    alert(`修复项目统计失败：${error?.message || "请稍后重试"}`);
  }
};

window.repairTodayDailyStatsFromHourBuckets = function repairTodayDailyStatsFromHourBuckets() {
  const today = getLocalDateKey();
  let repairedProjects = 0;
  let rebuiltSeconds = 0;
  let rebuiltRows = 0;

  state.projects.forEach((project) => {
    if (!project || typeof project !== "object") return;
    if (!project.dailyStats || typeof project.dailyStats !== "object") return;

    const entry = project.dailyStats[today];
    if (!entry || typeof entry !== "object") return;

    const sourceBuckets = entry.hourBuckets && typeof entry.hourBuckets === "object"
      ? entry.hourBuckets
      : null;
    if (!sourceBuckets) return;

    const normalizedBuckets = makeHourlyBuckets();
    let nextSeconds = 0;
    for (let h = 0; h < 24; h += 1) {
      const key = `h${String(h).padStart(2, "0")}`;
      const value = Math.max(0, Number(sourceBuckets[key]) || 0);
      normalizedBuckets[key] = value;
      nextSeconds += value;
    }

    const nextRows = Math.max(0, Number(project.todayRows) || 0);

    entry.hourBuckets = normalizedBuckets;
    entry.seconds = nextSeconds;
    entry.rows = nextRows;

    project.todaySeconds = nextSeconds;
    project.todayRows = nextRows;
    project.timeBuckets = normalizedBuckets;
    project.lastDate = today;
    project.updatedAt = Date.now();

    repairedProjects += 1;
    rebuiltSeconds += nextSeconds;
    rebuiltRows += nextRows;
  });

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.projects = state.projects;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));

    if (window.cloudSync && typeof window.cloudSync.getCurrentUser === "function" && window.cloudSync.getCurrentUser() && typeof window.cloudSync.pushState === "function") {
      void window.cloudSync.pushState({ projects: state.projects });
    }

    renderAll();
    alert(`已按今天 hourBuckets 修复 ${repairedProjects} 个项目：todaySeconds=${rebuiltSeconds}，todayRows=${rebuiltRows}。`);
  } catch (error) {
    alert(`修复今天 dailyStats 失败：${error?.message || "请稍后重试"}`);
  }
};

window.applyManualStatsPatch_20260402 = function applyManualStatsPatch_20260402() {
  const key = STORAGE_KEY;
  const raw = localStorage.getItem(key);
  if (!raw) {
    alert("未找到本地项目数据。");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    alert("本地项目数据损坏，无法修改。");
    return;
  }

  const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
  let patched = 0;

  const sumSecondsByHourBuckets = (entry) => {
    const buckets = entry && entry.hourBuckets && typeof entry.hourBuckets === "object" ? entry.hourBuckets : {};
    let total = 0;
    for (let h = 0; h < 24; h += 1) {
      const key = `h${String(h).padStart(2, "0")}`;
      total += Math.max(0, Number(buckets[key]) || 0);
    }
    return total;
  };

  projects.forEach((project) => {
    if (!project || typeof project !== "object") return;
    if (!project.dailyStats || typeof project.dailyStats !== "object") return;

    const d0402 = project.dailyStats["2026-04-02"];
    if (d0402 && typeof d0402 === "object") {
      d0402.rows = 3;
      if (!d0402.hourBuckets || typeof d0402.hourBuckets !== "object") d0402.hourBuckets = {};
      d0402.hourBuckets.h00 = 694;
      d0402.seconds = sumSecondsByHourBuckets(d0402);
      patched += 1;
    }

    const d0401 = project.dailyStats["2026-04-01"];
    if (d0401 && typeof d0401 === "object") {
      if (!d0401.hourBuckets || typeof d0401.hourBuckets !== "object") d0401.hourBuckets = {};
      d0401.hourBuckets.h00 = 0;
      d0401.seconds = sumSecondsByHourBuckets(d0401);
      patched += 1;
    }

    if (project.lastDate === "2026-04-02") {
      project.todayRows = Math.max(0, Number(project.dailyStats?.["2026-04-02"]?.rows) || 0);
      project.todaySeconds = Math.max(0, Number(project.dailyStats?.["2026-04-02"]?.seconds) || 0);
      project.updatedAt = Date.now();
    }
  });

  parsed.projects = projects;
  localStorage.setItem(key, JSON.stringify(parsed));
  try {
    state.projects = projects;
    renderAll();
  } catch {
    // Ignore rendering errors for non-stats pages.
  }
  alert(`已应用手动修复，更新记录数：${patched}`);
};
// 脚本：归一化所有 dailyStats 的 hourBuckets，使其总和不超过 seconds
window.normalizeHourBuckets = function normalizeAllHourBuckets() {
  let patched = 0;
  state.projects.forEach((project) => {
    if (!project.dailyStats) return;
    Object.entries(project.dailyStats).forEach(([date, stat]) => {
      if (!stat.hourBuckets || typeof stat.hourBuckets !== 'object') return;
      const totalSeconds = toNonNegative(stat.seconds);
      const hourSum = Object.values(stat.hourBuckets).reduce((a, b) => a + toNonNegative(b), 0);
      if (hourSum > 0 && hourSum !== totalSeconds) {
        // 按比例缩放
        const scale = totalSeconds / hourSum;
        let remain = totalSeconds;
        for (let h = 0; h < 24; h++) {
          const key = `h${String(h).padStart(2, "0")}`;
          const raw = toNonNegative(stat.hourBuckets[key]);
          const val = h === 23 ? remain : Math.round(raw * scale);
          stat.hourBuckets[key] = val;
          remain -= val;
        }
        patched++;
      }
    });
  });
  if (patched > 0) {
    // 保存到本地存储
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.projects = state.projects;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      alert(`已归一化 ${patched} 条 hourBuckets 数据。`);
    } catch (e) {
      alert(`归一化 hourBuckets 时保存失败：${e.message}`);
    }
  } else {
    alert('没有需要归一化的 hourBuckets 数据。');
  }
}
// 方便控制台调用

// 依赖补全：makeId 和 createProject
function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    todaySeconds: 0,
    materials: [],
    notes: "",
    spentSeconds: 0,
    exportStyle: "classic",
    lastDate: getLocalDateKey(),
    createdAt: Date.now(),
    completedAt: null,
    dailyStats: {},
    timeBuckets: makeHourlyBuckets(),
    updatedAt: Date.now(),
  };
}
// ...existing code...
// ...existing code...
function normalizeProject(project) {
  const normalized = { ...project };
  const parsedUpdatedAt = Number(project.updatedAt);
  const normalizedImages = Array.isArray(project.diagramImages)
    ? project.diagramImages.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  normalized.diagramImages = normalizedImages.length
    ? normalizedImages
    : [];
  // 保证 dailyStats 每天有数据，兼容历史数据
  // 保证 dailyStats[today].hourBuckets 是完整 24 小时结构
  // 不再从 timeBuckets fallback，hourBuckets 只记录当天增量
  const today = getLocalDateKey();
  const srcHourBuckets = project && project.dailyStats && project.dailyStats[today] && typeof project.dailyStats[today].hourBuckets === 'object'
    ? project.dailyStats[today].hourBuckets : undefined;
  if (!normalized.dailyStats[today] && (normalized.todayRows > 0 || normalized.todaySeconds > 0)) {
    normalized.dailyStats[today] = {
      seconds: Math.max(0, normalized.todaySeconds || 0),
      rows: Math.max(0, normalized.todayRows || 0),
      // 不补 hourBuckets
    };
  } else if (normalized.dailyStats[today]) {
    // 已有 dailyStats[today]，不补 hourBuckets
  }

  // 修复：如 dailyStats 仅有今天，且 spentSeconds/rows > 0，则自动补齐最近 7 天和 30 天
  const dailyKeys = Object.keys(normalized.dailyStats);
  const hasOnlyToday = dailyKeys.length === 1 && dailyKeys[0] === today;
  const totalSeconds = Math.max(0, Number(normalized.spentSeconds) || 0);
  const totalRows = Math.max(0, Number(normalized.rows) || 0);
  if (hasOnlyToday && (totalSeconds > 0 || totalRows > 0)) {
    // 均匀分配到最近 7 天和 30 天
    const weekDates = getLastNDates(7);
    const monthDates = getLastNDates(30);
    // 先分配到 30 天，7 天自动覆盖
    const secondsPerDay = Math.floor(totalSeconds / 30);
    const rowsPerDay = Math.floor(totalRows / 30);
    monthDates.forEach(date => {
      normalized.dailyStats[date] = {
        seconds: secondsPerDay,
        rows: rowsPerDay,
      };
    });
    // 剩余补到 today
    const remainSeconds = totalSeconds - secondsPerDay * 30;
    const remainRows = totalRows - rowsPerDay * 30;
    normalized.dailyStats[today] = {
      seconds: (normalized.dailyStats[today]?.seconds || 0) + remainSeconds,
      rows: (normalized.dailyStats[today]?.rows || 0) + remainRows,
    };
  }
  return normalized;
}
const STORAGE_KEY = "knit-helper-state";
const YARN_STORAGE_KEY = "knit-yarn-storage";
const STATS_BOOTSTRAP_DATE_KEY = "knit-stats-bootstrap-date";
const SUPPORTED_PERIODS = ["week", "month", "all"];

function normalizePeriod(period) {
  return SUPPORTED_PERIODS.includes(period) ? period : "week";
}

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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
  });
}


const state = {
  period: "week",
  projects: [],
  yarnItems: [],
  trendPlot: null,
  bootstrapDate: "",
};

let refs = {};

function updateRefs() {
  refs = {
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
    statPeriodTotalDuration: document.getElementById("statPeriodTotalDuration"),
    statPreferredSlot: document.getElementById("statPreferredSlot"),
    statAvgDailyDuration: document.getElementById("statAvgDailyDuration"),
    statMaxDailyDuration: document.getElementById("statMaxDailyDuration"),
    statPeriodTotalRows: document.getElementById("statPeriodTotalRows"),
    statPeriodYarnUsed: document.getElementById("statPeriodYarnUsed"),
    statAvgDailyRows: document.getElementById("statAvgDailyRows"),
    statMaxDailyRows: document.getElementById("statMaxDailyRows"),
    preferredSlotCanvas: document.getElementById("preferredSlotCanvas"),
    trendCanvas: document.getElementById("trendCanvas"),
    preferredSlotHint: document.getElementById("preferredSlotHint"),
    trendHint: document.getElementById("trendHint"),
    trendTitle: document.getElementById("trendTitle"),
    longestProjects: document.getElementById("longestProjects"),
    shortestProjects: document.getElementById("shortestProjects"),
    yarnBrandBarCanvas: document.getElementById("yarnBrandBarCanvas"),
    yarnTypePieCanvas: document.getElementById("yarnTypePieCanvas"),
    yarnUsageHint: document.getElementById("yarnUsageHint"),
  };
}

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

// 获取本月（自然月）所有日期
function getCurrentMonthDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const result = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    result.push(getLocalDateKey(d));
  }
  return result;
}

// 获取所有有数据的日期（全历史）
function getAllStatsDates() {
  const dateSet = new Set();
  state.projects.forEach((project) => {
    const daily = getProjectDailyStats(project);
    Object.keys(daily).forEach((date) => dateSet.add(date));
  });
  return Array.from(dateSet).sort();
}

// 获取本周（周一到周日）所有日期
function getCurrentWeekDates() {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 周日为0，转为7
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(getLocalDateKey(d));
  }
  return result;
}

function getTrendDayCount(period) {
  if (period === "month") return 30;
  if (period === "all") return 90;
  return 7;
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

window.isLegacyStarterProject = isLegacyStarterProject;

function loadProjectState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    // 强制 normalizeProject，保证 dailyStats、todayRows/seconds 一致
    const normalized = list
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeProject(item));
    state.projects = normalized;
    // 写回 localStorage，彻底同步 dailyStats
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, projects: normalized }));
    } catch {}
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
    let hourBuckets = undefined;
    if (value.hourBuckets && typeof value.hourBuckets === 'object') {
      hourBuckets = {};
      for (let h = 0; h < 24; h++) {
        const key = `h${String(h).padStart(2, "0")}`;
        hourBuckets[key] = toNonNegative(value.hourBuckets[key]);
      }
    }
    map[date] = {
      seconds: toNonNegative(value.seconds),
      rows: toNonNegative(value.rows),
      ...(hourBuckets ? { hourBuckets } : {}),
    };
  });
// 脚本：补全所有 dailyStats 缺失 hourBuckets 的日期，并将 seconds 均分到 24 小时
function fillMissingHourBuckets() {
  let patched = 0;
  state.projects.forEach((project) => {
    if (!project.dailyStats) return;
    Object.entries(project.dailyStats).forEach(([date, stat]) => {
      if (!stat.hourBuckets && typeof stat.seconds === 'number' && stat.seconds > 0) {
        const avg = Math.floor(stat.seconds / 24);
        const remain = stat.seconds - avg * 24;
        stat.hourBuckets = {};
        for (let h = 0; h < 24; h++) {
          const key = `h${String(h).padStart(2, "0")}`;
          stat.hourBuckets[key] = avg + (h < remain ? 1 : 0);
        }
        patched++;
      }
    });
  });
  if (patched > 0) {
    // 保存到本地存储
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.projects = state.projects;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      alert(`已补全 ${patched} 条缺失 hourBuckets 的数据。`);
    } catch (e) {
      alert(`补全 hourBuckets 时保存失败：${e.message}`);
    }
  } else {
    alert('没有需要补全 hourBuckets 的数据。');
  }
}
// 方便控制台调用
window.fillMissingHourBuckets = fillMissingHourBuckets;

  const today = getLocalDateKey();
  // 只补 todayRows，不再在 bootstrap 日用 rows 字段补齐
  if (!map[today]) {
    const todaySeconds = toNonNegative(project?.todaySeconds);
    const todayRows = toNonNegative(project?.todayRows);
    // hourBuckets fallback 到 project.timeBuckets
    let hourBuckets = {};
    if (project && typeof project.timeBuckets === 'object') {
      for (let h = 0; h < 24; h++) {
        const key = `h${String(h).padStart(2, "0")}`;
        hourBuckets[key] = toNonNegative(project.timeBuckets[key]);
      }
    }
    if (todaySeconds > 0 || todayRows > 0) {
      map[today] = { seconds: todaySeconds, rows: todayRows, hourBuckets };
    }
  }
  // 仅当 dailyStats 完全为空时，才 fallback 到 rows 字段（历史兼容）
  const hasAnyDaily = Object.keys(map).length > 0;
  if (!hasAnyDaily) {
    const spentSeconds = toNonNegative(project?.spentSeconds);
    const totalRows = toNonNegative(project?.rows);
    if (spentSeconds > 0 || totalRows > 0) {
      map[today] = {
        seconds: spentSeconds,
        rows: totalRows,
      };
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
  if (period === "all") {
    // 全历史：累加所有 dailyStats
    const daily = getProjectDailyStats(project);
    return Object.values(daily).reduce((sum, item) => sum + toNonNegative(item.seconds), 0);
  }
  if (isTodayBootstrapDay() && (period === "week" || period === "month")) {
    return toNonNegative(project?.spentSeconds);
  }
  if (period === "today") {
    if (isTodayBootstrapDay()) return toNonNegative(project?.spentSeconds);
    return toNonNegative(project?.todaySeconds);
  }

  const daily = getProjectDailyStats(project);
  let dateKeys = [];
  if (period === "week") dateKeys = getCurrentWeekDates();
  else if (period === "month") dateKeys = getCurrentMonthDates();
  return dateKeys.reduce((sum, key) => sum + toNonNegative(daily[key]?.seconds), 0);
}


function getProjectRowsForPeriod(project, period) {
  if (period === "all") {
    // 全历史：累加所有 dailyStats
    const daily = getProjectDailyStats(project);
    return Object.values(daily).reduce((sum, item) => sum + toNonNegative(item.rows), 0);
  }
  if (isTodayBootstrapDay() && (period === "week" || period === "month")) {
    return toNonNegative(project?.rows);
  }
  if (period === "today") {
    if (isTodayBootstrapDay()) return toNonNegative(project?.rows);
    return toNonNegative(project?.todayRows);
  }

  const daily = getProjectDailyStats(project);
  let dateKeys = [];
  if (period === "week") dateKeys = getCurrentWeekDates();
  else if (period === "month") dateKeys = getCurrentMonthDates();
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

  const period = normalizePeriod(state.period);
  const buckets = makeHourlyBuckets();
  let dateKeys = null;
  if (period === "week") {
    dateKeys = getCurrentWeekDates();
  } else if (period === "month") {
    // 只统计本月1号到今天
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result = [];
    for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
      result.push(getLocalDateKey(d));
    }
    dateKeys = result;
  } else if (period === "all") {
    dateKeys = getAllStatsDates();
  }

  const now = new Date();
  const currentHour = now.getHours();
  // 先清空所有小时
  Object.keys(buckets).forEach((key) => { buckets[key] = 0; });
  // 统计每小时实际发生的秒数，今天只统计到当前小时
  Object.keys(buckets).forEach((key) => { buckets[key] = 0; });
  // 统计缺失 hourBuckets 的天数
  let missingHourBucketsDays = 0;
  if (dateKeys) {
    dateKeys.forEach((date) => {
      // 合并所有项目这一天的 hourBuckets
      let dayHourBuckets = makeHourlyBuckets();
      let hasAnyHourBuckets = false;
      let debugHourBucketsProjects = [];
      state.projects.forEach((project) => {
        const daily = getProjectDailyStats(project);
        const entry = daily[date];
        if (entry && entry.hourBuckets && typeof entry.hourBuckets === "object") {
          debugHourBucketsProjects.push(project.name || project.id || project);
          hasAnyHourBuckets = true;
          const isToday = date === getLocalDateKey(now);
          for (let h = 0; h < 24; h++) {
            const key = `h${String(h).padStart(2, "0")}`;
            dayHourBuckets[key] += toNonNegative(entry.hourBuckets[key]);
          }
        }
      });
      if (!hasAnyHourBuckets) {
        // 统计哪些天 hourBuckets 有数据但未被采纳
        // 这里其实只有所有项目都没有 hourBuckets 才会进入
        // 但为保险起见，输出所有项目 hourBuckets 状态
        if (debugHourBucketsProjects.length > 0) {
          console.warn("[hourBuckets未采纳] 日期:", date, "有 hourBuckets 的项目:", debugHourBucketsProjects);
        }
        missingHourBucketsDays++;
        return;
      }
      // 合并到总分布
      for (let h = 0; h < 24; h++) {
        const key = `h${String(h).padStart(2, "0")}`;
        buckets[key] += dayHourBuckets[key];
      }
    });
  }
  // 已移除“今天之后小时强制为0”逻辑，确保所有小时都能显示
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
      // 计算当前分布下的 preferredSlot
      const preferredEntry = entries.sort((a, b) => b.value - a.value)[0];
      const preferredSlot = preferredEntry && preferredEntry.value > 0 ? preferredEntry.label : "暂无数据";
      let hint = `偏好小时：${preferredSlot}，累计 ${formatDuration(total)}。`;
      if (missingHourBucketsDays > 0) {
        hint += `（部分天无分时数据，分布可能不完整）`;
      }
      refs.preferredSlotHint.textContent = hint;
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

  if (typeof window.cloudSync.ensureSyncStarted === "function") {
    void window.cloudSync.ensureSyncStarted();
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

  if (window.cloudSync && typeof window.cloudSync.bindAuthUI === "function") {
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
        if (typeof window.cloudSync.ensureSyncStarted === "function") {
          void window.cloudSync.ensureSyncStarted();
        }
        closeAuthDialog();
        setStatsSyncHint("已登录云端");
      },
    });
  } else {
    if (refs.authStatus) refs.authStatus.textContent = "云同步不可用：cloudSync 未加载";
    if (refs.loginBtn) refs.loginBtn.disabled = false;
    if (refs.registerBtn) refs.registerBtn.disabled = false;
    if (refs.logoutBtn) refs.logoutBtn.disabled = true;
    if (refs.loginBtn) refs.loginBtn.addEventListener("click", () => {
      if (refs.authStatus) refs.authStatus.textContent = "云同步不可用：cloudSync 未加载";
    });
    if (refs.registerBtn) refs.registerBtn.addEventListener("click", () => {
      if (refs.authStatus) refs.authStatus.textContent = "云同步不可用：cloudSync 未加载";
    });
  }

  const syncEventKey = typeof window.cloudSync.getSyncEventKey === "function"
    ? window.cloudSync.getSyncEventKey()
    : "knit-cloud-sync-event";

  window.addEventListener("storage", (event) => {
    if (!event || event.key !== syncEventKey) return;
    refreshStatsData("已同步云端数据");
  });
}

function computeYarnUsage() {
  // 历史消耗=原始重量-库存重量
  let totalUsed = 0;
  state.yarnItems.forEach((item) => {
    const originalWeight = toNonNegative(item?.originalWeight ?? item?.weight);
    const stockWeight = toNonNegative(item?.stockWeight);
    if (originalWeight > 0 && stockWeight >= 0) {
      totalUsed += Math.max(0, originalWeight - stockWeight);
    }
  });
  return roundToSingle(totalUsed);
}

// 按周期统计消耗毛线量
function computeYarnUsageForPeriod(period) {
  // 只统计 usedLog 中日期属于本周期的消耗
  let totalUsed = 0;
  let dateSet = new Set();
  if (period === "week") dateSet = new Set(getCurrentWeekDates());
  else if (period === "month") dateSet = new Set(getCurrentMonthDates());
  else if (period === "all") dateSet = null;
  else if (period === "today") dateSet = new Set([getLocalDateKey()]);
  state.yarnItems.forEach((item) => {
    if (Array.isArray(item.usedLog)) {
      item.usedLog.forEach(log => {
        if (!dateSet || dateSet.has(log.date)) {
          totalUsed += toNonNegative(log.used);
        }
      });
    }
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
  let days;
  if (period === "week") {
    days = getCurrentWeekDates();
  } else if (period === "month") {
    days = getCurrentMonthDates();
  } else if (period === "all") {
    days = getAllStatsDates();
  } else {
    days = getLastNDates(getTrendDayCount(period));
  }
  const seconds = days.map(() => 0);
  const rows = days.map(() => 0);

  state.projects.forEach((project) => {
    const daily = getProjectDailyStats(project);
    days.forEach((day, index) => {
      seconds[index] += toNonNegative(daily[day]?.seconds);
      rows[index] += toNonNegative(daily[day]?.rows);
    });
  });

  return { days, seconds, rows };
}

function getTrendComparison(period = state.period) {
  const dayCount = getTrendDayCount(period);
  const now = new Date();
  const prevDays = [];
  for (let i = dayCount * 2 - 1; i >= dayCount; i -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    prevDays.push(getLocalDateKey(day));
  }

  let prevSeconds = 0;
  state.projects.forEach((project) => {
    const daily = getProjectDailyStats(project);
    prevDays.forEach((key) => {
      prevSeconds += toNonNegative(daily[key]?.seconds);
    });
  });

  const current = getTrendSeries(period);
  const currentSeconds = current.seconds.reduce((sum, value) => sum + toNonNegative(value), 0);
  if (prevSeconds <= 0) {
    if (currentSeconds <= 0) return { label: "持平 0%" };
    return { label: "较上周期 新增" };
  }

  const ratio = ((currentSeconds - prevSeconds) / prevSeconds) * 100;
  const sign = ratio > 0 ? "+" : "";
  return { label: `较上周期 ${sign}${roundToSingle(ratio)}%` };
}

function renderOverview() {
  updateRefs();
  // 数据总览（随当前周期切换，统计口径与周期统计一致）
  const period = normalizePeriod(state.period || "week");
  let periodSeconds = 0;
  let periodRows = 0;
  let projects = state.projects;
  if (period === "all") {
    // 历史周期直接用全量累计
    periodSeconds = projects.reduce((sum, p) => sum + toNonNegative(p.spentSeconds), 0);
    periodRows = projects.reduce((sum, p) => sum + toNonNegative(p.rows), 0);
  } else {
    let dateKeysStatOvr = null;
    if (period === "week") dateKeysStatOvr = getCurrentWeekDates();
    else if (period === "month") dateKeysStatOvr = getCurrentMonthDates();
    projects.forEach((p) => {
      const daily = getProjectDailyStats(p);
      if (dateKeysStatOvr) {
        dateKeysStatOvr.forEach((date) => {
          periodSeconds += toNonNegative(daily[date]?.seconds);
          periodRows += toNonNegative(daily[date]?.rows);
        });
      }
    });
  }
  if (refs.statProjectCount) refs.statProjectCount.textContent = String(projects.length);
  else console.warn('[stats] statProjectCount 元素不存在');
  if (refs.statTotalDuration) refs.statTotalDuration.textContent = formatDuration(periodSeconds);
  else console.warn('[stats] statTotalDuration 元素不存在');
  if (refs.statTotalRows) refs.statTotalRows.textContent = String(periodRows);
  else console.warn('[stats] statTotalRows 元素不存在');
  if (!refs.statTotalYarnUsed) {
    updateRefs();
  }
  // 调试输出
  let yarnUsage = 0;
  if (period === "all") {
    yarnUsage = computeYarnUsage();
  } else {
    yarnUsage = computeYarnUsageForPeriod(period);
  }
  console.log('[debug] 当前周期消耗毛线:', yarnUsage, state.yarnItems);
  if (refs.statTotalYarnUsed) {
    refs.statTotalYarnUsed.textContent = formatWeight(yarnUsage);
  } else {
    console.warn('[stats] statTotalYarnUsed 元素不存在');
  }

  // 当前周期统计（已与数据总览合并，直接复用 periodSeconds/periodRows/projects/dateKeysStatOvr）
  // 只需保证 state.period = period
  state.period = period;
  // 时间投入统计
  if (refs.statPeriodTotalDuration) refs.statPeriodTotalDuration.textContent = formatDuration(periodSeconds);
  else console.warn('[stats] statPeriodTotalDuration 元素不存在');
  // 偏好时段（与分布图严格一致）
  if (refs.statPreferredSlot) {
    let timeBuckets = makeHourlyBuckets();
    let dateKeys = null;
    if (period === "week") {
      dateKeys = getCurrentWeekDates();
    } else if (period === "month") {
      // 只统计本月1号到今天
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const result = [];
      for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
        result.push(getLocalDateKey(d));
      }
      dateKeys = result;
    } else if (period === "all") {
      dateKeys = getAllStatsDates();
    }
    if (dateKeys) {
      state.projects.forEach((project) => {
        const daily = getProjectDailyStats(project);
        dateKeys.forEach((date) => {
          const entry = daily[date];
          if (!entry || !entry.hourBuckets || typeof entry.hourBuckets !== "object") return;
          for (let h = 0; h < 24; h++) {
            const key = `h${String(h).padStart(2, "0")}`;
            timeBuckets[key] += toNonNegative(entry.hourBuckets[key]);
          }
        });
      });
    }
    const bucketEntries = Object.entries(timeBuckets);
    const preferredEntry = bucketEntries.sort((a, b) => b[1] - a[1])[0];
    refs.statPreferredSlot.textContent = preferredEntry && preferredEntry[1] > 0 ? toHourLabel(preferredEntry[0]) : "暂无数据";
  }
  // 平均每日编织时长、单日最长编织时长
  let avgDailySeconds = 0, maxDailySeconds = 0;
  let avgDailyRows = 0, maxDailyRows = 0;
  if (period === "all") {
    // 历史周期：平均=总量/活跃天数，最大=单日最大
    let dailySecondsArr = [];
    let dailyRowsArr = [];
    // 汇总所有有数据的日期
    let allDatesSet = new Set();
    projects.forEach((p) => {
      const daily = getProjectDailyStats(p);
      Object.keys(daily).forEach(date => {
        if (toNonNegative(daily[date]?.seconds) > 0 || toNonNegative(daily[date]?.rows) > 0) {
          allDatesSet.add(date);
        }
      });
    });
    const allDates = Array.from(allDatesSet).sort();
    allDates.forEach((date) => {
      let totalSeconds = 0;
      let totalRows = 0;
      projects.forEach((p) => {
        const daily = getProjectDailyStats(p);
        if (daily[date]) {
          totalSeconds += toNonNegative(daily[date].seconds);
          totalRows += toNonNegative(daily[date].rows);
        }
      });
      if (totalSeconds > 0) dailySecondsArr.push(totalSeconds);
      if (totalRows > 0) dailyRowsArr.push(totalRows);
    });
    const days = dailySecondsArr.length;
    avgDailySeconds = days ? Math.round(periodSeconds / days) : 0;
    maxDailySeconds = dailySecondsArr.length ? Math.max(...dailySecondsArr) : 0;
    avgDailyRows = days ? Math.round(periodRows / days) : 0;
    maxDailyRows = dailyRowsArr.length ? Math.max(...dailyRowsArr) : 0;
  } else {
    let dateKeysStatOvr = null;
    if (period === "week") dateKeysStatOvr = getCurrentWeekDates();
    else if (period === "month") dateKeysStatOvr = getCurrentMonthDates();
    let dailySecondsArr = [];
    let dailyRowsArr = [];
    if (dateKeysStatOvr) {
      dateKeysStatOvr.forEach((date) => {
        let totalSeconds = 0;
        let totalRows = 0;
        projects.forEach((p) => {
          const daily = getProjectDailyStats(p);
          if (daily[date]) {
            totalSeconds += toNonNegative(daily[date].seconds);
            totalRows += toNonNegative(daily[date].rows);
          }
        });
        if (totalSeconds > 0) dailySecondsArr[date] = totalSeconds;
        if (totalRows > 0) dailyRowsArr[date] = totalRows;
      });
    }
    const dailySecondsList = Object.values(dailySecondsArr);
    avgDailySeconds = dailySecondsList.length ? Math.round(dailySecondsList.reduce((a, b) => a + b, 0) / dailySecondsList.length) : 0;
    maxDailySeconds = dailySecondsList.length ? Math.max(...dailySecondsList) : 0;
    const dailyRowsList = Object.values(dailyRowsArr);
    avgDailyRows = dailyRowsList.length ? Math.round(dailyRowsList.reduce((a, b) => a + b, 0) / dailyRowsList.length) : 0;
    maxDailyRows = dailyRowsList.length ? Math.max(...dailyRowsList) : 0;
  }
  if (refs.statAvgDailyDuration) refs.statAvgDailyDuration.textContent = formatDuration(avgDailySeconds);
  else console.warn('[stats] statAvgDailyDuration 元素不存在');
  if (refs.statMaxDailyDuration) refs.statMaxDailyDuration.textContent = formatDuration(maxDailySeconds);
  else console.warn('[stats] statMaxDailyDuration 元素不存在');
  if (refs.statPeriodTotalRows) refs.statPeriodTotalRows.textContent = String(periodRows);
  else console.warn('[stats] statPeriodTotalRows 元素不存在');
  if (refs.statPeriodYarnUsed) refs.statPeriodYarnUsed.textContent = formatWeight(yarnUsage);
  else console.warn('[stats] statPeriodYarnUsed 元素不存在');
  if (refs.statAvgDailyRows) refs.statAvgDailyRows.textContent = String(avgDailyRows);
  else console.warn('[stats] statAvgDailyRows 元素不存在');
  if (refs.statMaxDailyRows) refs.statMaxDailyRows.textContent = String(maxDailyRows);
  else console.warn('[stats] statMaxDailyRows 元素不存在');
// 多余的 } 已移除，函数结构闭合正常
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
  drawSeries(hourPoints, "#cd6c49", padding.top, padding.top + plotH);
  drawSeries(rowPoints, "#538277", padding.top, padding.top + plotH);

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

  ctx.fillStyle = "#cd6c49";
  ctx.fillRect(padding.left, 16, 14, 3);
  ctx.fillStyle = "#6b5a48";
  ctx.font = "12px sans-serif";
  ctx.fillText("时长趋势（小时）", padding.left + 20, 20);

  ctx.fillStyle = "#538277";
  ctx.fillRect(padding.left + 136, 16, 14, 3);
  ctx.fillStyle = "#6b5a48";
  ctx.fillText("行数趋势（行）", padding.left + 156, 20);

  if (refs.trendHint) {
    const totalHours = roundToSingle(trend.seconds.reduce((sum, v) => sum + v, 0) / 3600);
    const totalRows = trend.rows.reduce((sum, v) => sum + v, 0);
    const peakHour = Math.max(...hoursSeries);
    const peakRow = Math.max(...rowsSeries);
    let comparison = { label: "" };
    if (state.period !== "all") {
      comparison = getTrendComparison(state.period);
    }
    refs.trendHint.textContent = `最近${trend.days.length}天累计 ${totalHours} 小时，累计 ${totalRows} 行；单日峰值 ${peakHour} 小时 / ${peakRow} 行；${comparison.label}`;
  }

  if (refs.trendTitle) {
    const titleMap = {
      week: "本周趋势",
      month: "本月趋势",
      all: "历史趋势",
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

  // 只统计所有 active 项目关联的毛线消耗
  const brandMap = new Map();
  const typeMap = new Map();
  let totalUsed = 0;
  // 获取所有 active 项目关联的 yarnRef/brand/colorNo
  const activeProjects = state.projects.filter(p => p.status === "active");
  const relatedYarnKeys = new Set();
  activeProjects.forEach(p => {
    const info = parseYarnInfo(p);
    relatedYarnKeys.add(`${info.brand}|||${info.colorNo}`);
  });
  state.yarnItems.forEach((item) => {
    const info = parseYarnInfo(item);
    const key = `${info.brand}|||${info.colorNo}`;
    if (!relatedYarnKeys.has(key)) return; // 只统计被 active 项目引用的毛线
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
    updateRefs();
  state.period = normalizePeriod(state.period);
  if (refs.periodFilters) {
    refs.periodFilters.querySelectorAll("button[data-period]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.period === state.period);
    });
  }
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

function bindGlobalListeners() {
  if (refs.periodFilters) {
    refs.periodFilters.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-period]");
      if (!target) return;
      state.period = normalizePeriod(target.dataset.period);
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


function resetTodayStatsIfNeeded() {
  const today = getLocalDateKey();
  let changed = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    let updated = false;
    list.forEach((project) => {
      if (!project || typeof project !== "object") return;
      // lastDate 字段兼容 project.js 逻辑
      const lastDate = project.lastDate || project.lastStatDate;
      if (lastDate && lastDate !== today) {
        if (project.todayRows || project.todaySeconds) {
          project.todayRows = 0;
          project.todaySeconds = 0;
          changed = true;
        }
        // 可选：同步 lastDate 字段到今天，避免重复重置
        project.lastDate = today;
      }
    });
    if (changed) {
      parsed.projects = list;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {}
}

updateRefs();
setupMobileAuthMenu();
bindGlobalListeners();
loadProjectState();
loadYarnState();
ensureStatsBootstrapDate();
resetTodayStatsIfNeeded();
renderAll();
bindTrendTooltip();
setupCloudSync();
