const STORAGE_KEYS = {
  yarn: "knit-yarn-storage",
  swatch: "knit-swatch-storage",
};

const pageType = document.body.dataset.storagePage;
if (!pageType || !STORAGE_KEYS[pageType]) {
  throw new Error("Unknown storage page type");
}

const refs = {
  form: document.getElementById("storageForm"),
  list: document.getElementById("storageList"),
  count: document.getElementById("storageCount"),
  syncHint: document.getElementById("storageSyncHint"),
  diagLocalCount: document.getElementById("diagLocalCount"),
  diagRemoteCount: document.getElementById("diagRemoteCount"),
  diagLastPush: document.getElementById("diagLastPush"),
  diagLastPull: document.getElementById("diagLastPull"),
  diagLastError: document.getElementById("diagLastError"),
  diagRefreshBtn: document.getElementById("storageDiagRefreshBtn"),
  submitBtn: document.getElementById("submitBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  photoWrap: document.getElementById("photoWrap"),
  removePhotoBtn: document.getElementById("removePhotoBtn"),
  openPhotoPickerBtn: document.getElementById("openPhotoPickerBtn"),
  photoFileName: document.getElementById("photoFileName"),
  originalWeight: document.getElementById("originalWeight"),
  stockWeight: document.getElementById("stockWeight"),
  progress: document.getElementById("progress"),
};

const state = {
  items: loadItems(),
  editingId: "",
  photoData: "",
  yarnReferences: [],
};

const syncState = {
  pushTimerId: null,
  lastSeenCloudStamp: 0,
  remoteUnsubscribe: null,
  lastPushAt: 0,
  lastPullAt: 0,
  lastError: "",
  remoteCount: 0,
};

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDiagTime(value) {
  const stamp = Number(value) || 0;
  if (!stamp) return "-";
  const date = new Date(stamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function renderDiagnostics() {
  if (refs.diagLocalCount) refs.diagLocalCount.textContent = String(state.items.length);
  if (refs.diagRemoteCount) refs.diagRemoteCount.textContent = String(syncState.remoteCount || 0);
  if (refs.diagLastPush) refs.diagLastPush.textContent = formatDiagTime(syncState.lastPushAt);
  if (refs.diagLastPull) refs.diagLastPull.textContent = formatDiagTime(syncState.lastPullAt);
  if (refs.diagLastError) refs.diagLastError.textContent = syncState.lastError || "无";
}

function setDiagError(error) {
  syncState.lastError = String(error || "").trim();
  renderDiagnostics();
}

function setStorageSyncHint(text) {
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

async function pushStorageNow() {
  if (!window.cloudSync || !window.cloudSync.isReady()) return;
  if (!window.cloudSync.getCurrentUser()) return;
  if (typeof window.cloudSync.pushStorageState !== "function") return;

  setStorageSyncHint("同步中...");

  if (pageType === "yarn") {
    await window.cloudSync.pushStorageState({ yarn: state.items });
  } else {
    await window.cloudSync.pushStorageState({ swatch: state.items });
  }
  const warning = typeof window.cloudSync.getLastSyncWarning === "function"
    ? window.cloudSync.getLastSyncWarning()
    : "";
  syncState.lastPushAt = Date.now();
  syncState.lastError = warning || "";
  renderDiagnostics();
  setStorageSyncHint(warning ? "已同步（图片已降级）" : "已同步到云端");
}

async function flushStorageCloudPush() {
  if (syncState.pushTimerId) {
    clearTimeout(syncState.pushTimerId);
    syncState.pushTimerId = null;
  }
  try {
    await pushStorageNow();
  } catch (error) {
    console.error("storage cloud flush failed", error);
    setDiagError(error?.message || "写入云端失败");
    setStorageSyncHint(`同步失败：${error?.message || "请稍后重试"}`);
  }
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[pageType]);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.map(normalizeItem) : [];
  } catch {
    return [];
  }
}

function getItemPhoto(item) {
  const candidates = [item?.photo, item?.photoData, item?.image, item?.coverImage, item?.diagramImage];
  for (const value of candidates) {
    const src = String(value || "").trim();
    if (src) return src;
  }
  return "";
}

function normalizeItem(item) {
  const normalized = {
    ...(item && typeof item === "object" ? item : {}),
  };
  normalized.photo = getItemPhoto(normalized);
  if (pageType === "yarn") {
    const metrics = deriveYarnMetrics(normalized);
    normalized.originalWeight = metrics.originalWeight;
    normalized.stockWeight = metrics.stockWeight;
    normalized.weight = metrics.originalWeight;
    normalized.progress = metrics.progress;
  }
  return normalized;
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

function formatWeight(value) {
  const num = roundToSingle(toNonNegative(value));
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function computeYarnProgress(originalWeight, stockWeight) {
  const original = toNonNegative(originalWeight);
  if (!original) return 0;
  const stock = clamp(toNonNegative(stockWeight), 0, original);
  const consumed = original - stock;
  return roundToSingle((consumed / original) * 100);
}

function deriveYarnMetrics(item) {
  const originalWeight = roundToSingle(toNonNegative(item?.originalWeight ?? item?.weight));
  const hasStockWeight = item?.stockWeight !== undefined && item?.stockWeight !== null && String(item.stockWeight).trim() !== "";
  let stockWeight = hasStockWeight
    ? roundToSingle(toNonNegative(item.stockWeight))
    : roundToSingle(originalWeight * (1 - clamp(toSafeNumber(item?.progress), 0, 100) / 100));

  if (originalWeight > 0) {
    stockWeight = clamp(stockWeight, 0, originalWeight);
  }

  return {
    originalWeight,
    stockWeight: roundToSingle(stockWeight),
    progress: computeYarnProgress(originalWeight, stockWeight),
  };
}

function toCount(value) {
  return Math.max(0, Math.round(toSafeNumber(value)));
}

function deriveSwatchGauge(item) {
  const stitches = toCount(item?.stitches ?? item?.gauge);
  const rows = toCount(item?.rows);
  return { stitches, rows };
}

function parseStorageItemsByKey(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildYarnReferenceLabel(item) {
  const info = parseYarnInfo(item);
  const type = String(item?.yarnType || "").trim();
  const head = [info.brand !== "-" ? info.brand : "", info.colorNo !== "-" ? info.colorNo : ""]
    .filter(Boolean)
    .join(" / ");
  if (head && type) return `${head} · ${type}`;
  return head || type || "未命名线材";
}

function renderSwatchYarnOptions() {
  if (pageType !== "swatch") return;
  const list = document.getElementById("yarnReferenceList");
  if (!list) return;

  const yarnItems = parseStorageItemsByKey(STORAGE_KEYS.yarn).map(normalizeItem);
  const seen = new Set();
  const options = [];
  const references = [];
  for (const item of yarnItems) {
    const label = buildYarnReferenceLabel(item);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push(`<option value="${escapeHtml(label)}"></option>`);
    references.push({
      label,
      needleSize: String(item?.needleSize || "").trim(),
      spec: "10cm x 10cm",
    });
  }
  list.innerHTML = options.join("");
  state.yarnReferences = references;
}

function applySwatchYarnRecommendation() {
  if (pageType !== "swatch") return;

  const yarnInput = document.getElementById("swatchYarn");
  const needleInput = document.getElementById("swatchNeedle");
  const specInput = document.getElementById("swatchSpec");
  if (!yarnInput || !needleInput || !specInput) return;

  const selected = String(yarnInput.value || "").trim();
  if (!selected) return;

  const matched = state.yarnReferences.find((ref) => ref.label === selected);
  if (!matched) return;

  if (!needleInput.value.trim() && matched.needleSize) {
    needleInput.value = matched.needleSize;
  }
  if (!specInput.value.trim() && matched.spec) {
    specInput.value = matched.spec;
  }
}

function updateYarnProgressPreview() {
  if (pageType !== "yarn") return;
  if (!refs.originalWeight || !refs.stockWeight || !refs.progress) return;

  const originalWeight = toNonNegative(refs.originalWeight.value);
  const stockInput = toNonNegative(refs.stockWeight.value);
  const stockWeight = originalWeight > 0 ? clamp(stockInput, 0, originalWeight) : stockInput;
  const progress = computeYarnProgress(originalWeight, stockWeight);

  if (originalWeight > 0) {
    refs.stockWeight.max = String(roundToSingle(originalWeight));
  } else {
    refs.stockWeight.removeAttribute("max");
  }

  refs.progress.value = String(progress);
}

function parseYarnRef(value) {
  const source = String(value || "").trim();
  if (!source) {
    return { brand: "-", colorNo: "-" };
  }

  const slashParts = source.split(/[\/|｜]/).map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return {
      brand: slashParts[0] || "-",
      colorNo: slashParts[1] || "-",
    };
  }

  const dashParts = source.split(/[\-—]/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      brand: dashParts[0] || "-",
      colorNo: dashParts[dashParts.length - 1] || "-",
    };
  }

  const spaceParts = source.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 2) {
    return {
      brand: spaceParts[0] || "-",
      colorNo: spaceParts[spaceParts.length - 1] || "-",
    };
  }

  return {
    brand: source,
    colorNo: "-",
  };
}

function parseYarnInfo(item) {
  const brand = String(item?.yarnBrand || "").trim();
  const colorNo = String(item?.yarnColorNo || "").trim();
  if (brand || colorNo) {
    return {
      brand: brand || "-",
      colorNo: colorNo || "-",
    };
  }
  return parseYarnRef(item?.yarnRef);
}

function saveItems(options = {}) {
  localStorage.setItem(STORAGE_KEYS[pageType], JSON.stringify(state.items));
  if (options.scheduleCloud !== false) {
    scheduleStorageCloudPush();
  }
}

function setStorageItems(items, options = {}) {
  state.items = Array.isArray(items) ? items.map(normalizeItem) : [];
  saveItems({ scheduleCloud: options.scheduleCloud !== false });
  renderList();
  renderDiagnostics();
}

function scheduleStorageCloudPush() {
  if (!window.cloudSync || !window.cloudSync.isReady()) return;
  if (!window.cloudSync.getCurrentUser()) return;
  if (typeof window.cloudSync.pushStorageState !== "function") return;

  if (syncState.pushTimerId) {
    clearTimeout(syncState.pushTimerId);
  }

  syncState.pushTimerId = setTimeout(async () => {
    try {
      await pushStorageNow();
    } catch (error) {
      console.error("storage cloud push failed", error);
      setDiagError(error?.message || "写入云端失败");
      setStorageSyncHint(`同步失败：${error?.message || "请稍后重试"}`);
    } finally {
      syncState.pushTimerId = null;
    }
  }, 700);
}

async function pullStorageNow() {
  if (!window.cloudSync || !window.cloudSync.isReady()) return;
  if (!window.cloudSync.getCurrentUser()) return;
  if (typeof window.cloudSync.pullStorageState !== "function") return;

  setStorageSyncHint("同步中...");

  try {
    const remote = await window.cloudSync.pullStorageState();
    syncState.lastPullAt = Date.now();
    syncState.lastError = "";
    applyCloudStoragePayload(remote);
    renderDiagnostics();
  } catch (error) {
    console.error("storage cloud pull failed", error);
    setDiagError(error?.message || "拉取云端失败");
    setStorageSyncHint(`拉取失败：${error?.message || "请稍后重试"}`);
  }
}

function applyCloudStoragePayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const stamp = Number(payload.clientUpdatedAt) || 0;
  if (stamp && stamp <= syncState.lastSeenCloudStamp) return;

  const incoming = pageType === "yarn" ? payload.yarn : payload.swatch;
  if (!Array.isArray(incoming)) return;
  syncState.remoteCount = incoming.length;

  // 修正 lastDate 及 dailyStats，避免所有数据被归入 today
  function fixItemStats(item) {
    if (!item || typeof item !== "object") return item;
    const stats = item.dailyStats && typeof item.dailyStats === "object" ? item.dailyStats : {};
    // 找到最后有 rows/seconds>0 的日期
    let lastActiveDate = null;
    let lastRows = 0, lastSeconds = 0;
    for (const [date, entry] of Object.entries(stats)) {
      const rows = Number(entry?.rows) || 0;
      const seconds = Number(entry?.seconds) || 0;
      if ((rows > 0 || seconds > 0) && (!lastActiveDate || date > lastActiveDate)) {
        lastActiveDate = date;
        lastRows = rows;
        lastSeconds = seconds;
      }
    }
    // 如果 today 没有数据，且 lastDate 被错误推进为 today，则回退
    const today = getLocalDateKey();
    if (item.lastDate === today && (!stats[today] || ((Number(stats[today]?.rows)||0)===0 && (Number(stats[today]?.seconds)||0)===0))) {
      item.lastDate = lastActiveDate || item.lastDate;
    }
    // 不自动补 today 的 dailyStats，只有 todayRows/todaySeconds>0 时才补
    if (stats[today] && (Number(stats[today]?.rows) > 0 || Number(stats[today]?.seconds) > 0)) {
      // 保持原样
    } else {
      delete stats[today];
    }
    // todayRows/todaySeconds 只允许来源于 dailyStats[today]，否则强制为 0
    if (stats[today] && (Number(stats[today]?.rows) > 0 || Number(stats[today]?.seconds) > 0)) {
      item.todayRows = Number(stats[today]?.rows) || 0;
      item.todaySeconds = Number(stats[today]?.seconds) || 0;
    } else {
      item.todayRows = 0;
      item.todaySeconds = 0;
    }
    item.dailyStats = stats;
    return item;
  }

  const remoteList = incoming.map((item) => fixItemStats(normalizeItem(item)));
  const localList = state.items.map(normalizeItem);

  // Keep local data only when cloud payload has no valid timestamp yet (uninitialized state).
  if (!remoteList.length && localList.length && !stamp) {
    if (stamp) {
      syncState.lastSeenCloudStamp = stamp;
    }
    scheduleStorageCloudPush();
    return;
  }

  const localById = new Map(
    localList
      .filter((item) => item && item.id)
      .map((item) => [String(item.id), item])
  );

  const mergedRemote = remoteList.map((item) => {
    const local = localById.get(String(item.id || ""));
    if (!local) return item;

    const localPhoto = getItemPhoto(local);
    const remotePhoto = getItemPhoto(item);
    if (!remotePhoto && localPhoto) {
      item.photo = localPhoto;
    }

    const localUpdatedAt = Number(local.updatedAt) || 0;
    const remoteUpdatedAt = Number(item.updatedAt) || 0;
    return localUpdatedAt >= remoteUpdatedAt ? local : item;
  });

  const remoteIds = new Set(mergedRemote.map((item) => String(item.id || "")));
  // Keep local-only items only when they are newer than this cloud snapshot.
  // This prevents deleted remote items from being reintroduced locally.
  const localOnly = localList.filter((item) => {
    if (!item || !item.id) return false;
    if (remoteIds.has(String(item.id))) return false;
    const localUpdatedAt = Number(item.updatedAt) || 0;
    return !stamp || localUpdatedAt > stamp;
  });
  const merged = [...mergedRemote, ...localOnly];

  setStorageItems(merged, { scheduleCloud: false });
  if (stamp) {
    syncState.lastSeenCloudStamp = stamp;
  }
  renderDiagnostics();
  setStorageSyncHint("已从云端同步");
}

function setupStorageCloudSync() {
  if (!window.cloudSync || typeof window.cloudSync.onAuthStateChanged !== "function") return;

  setStorageSyncHint("正在恢复登录...");

  window.cloudSync.onAuthStateChanged(async (user) => {
    if (typeof syncState.remoteUnsubscribe === "function") {
      syncState.remoteUnsubscribe();
      syncState.remoteUnsubscribe = null;
    }

    if (!user) {
      setStorageSyncHint("离线模式");
      return;
    }

    setStorageSyncHint("正在同步云端...");

    await pullStorageNow();

    if (typeof window.cloudSync.watchRemoteState === "function") {
      syncState.remoteUnsubscribe = window.cloudSync.watchRemoteState(
        (payload) => {
          applyCloudStoragePayload(payload?.storage ? {
            ...payload.storage,
            clientUpdatedAt: payload.clientUpdatedAt,
          } : null);
        },
        (error) => {
          console.error("storage cloud watch failed", error);
          setDiagError(error?.message || "监听同步失败");
          setStorageSyncHint(`监听失败：${error?.message || "请稍后重试"}`);
        }
      );
    }
  });
}

window.addEventListener("pagehide", () => {
  void flushStorageCloudPush();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void flushStorageCloudPush();
    return;
  }
  if (document.visibilityState === "visible") {
    void pullStorageNow();
  }
});

function collectFormData() {
  if (pageType === "yarn") {
    const yarnBrand = document.getElementById("yarnBrand").value.trim();
    const yarnType = document.getElementById("yarnType").value.trim();
    const yarnColorNo = document.getElementById("yarnColorNo").value.trim();
    const yarnRef = [yarnBrand, yarnColorNo].filter(Boolean).join(" / ");
    const originalWeight = roundToSingle(toNonNegative(refs.originalWeight?.value));
    const stockInput = roundToSingle(toNonNegative(refs.stockWeight?.value));
    const stockWeight = originalWeight > 0 ? roundToSingle(clamp(stockInput, 0, originalWeight)) : stockInput;
    const progress = computeYarnProgress(originalWeight, stockWeight);
    return {
      id: state.editingId || makeId(),
      yarnBrand,
      yarnType,
      yarnColorNo,
      yarnRef,
      needleSize: document.getElementById("needleSize").value.trim(),
      originalWeight,
      stockWeight,
      weight: originalWeight,
      season: document.getElementById("season").value,
      progress,
      photo: state.photoData,
      updatedAt: Date.now(),
    };
  }

  return {
    id: state.editingId || makeId(),
    yarn: document.getElementById("swatchYarn").value.trim(),
    pattern: document.getElementById("swatchPattern").value.trim(),
    needle: document.getElementById("swatchNeedle").value.trim(),
    spec: document.getElementById("swatchSpec").value.trim(),
    stitches: toCount(document.getElementById("swatchStitches").value),
    rows: toCount(document.getElementById("swatchRows").value),
    gauge: toCount(document.getElementById("swatchStitches").value),
    notes: document.getElementById("swatchNotes").value.trim(),
    photo: state.photoData,
    updatedAt: Date.now(),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetForm() {
  refs.form.reset();
  state.editingId = "";
  state.photoData = "";
  renderPhotoPreview("");
  if (pageType === "yarn") {
    updateYarnProgressPreview();
  }
  refs.cancelEditBtn.hidden = true;
  refs.submitBtn.textContent = pageType === "yarn" ? "新增毛线条目" : "新增小样条目";
}

function fillForm(item) {
  if (pageType === "yarn") {
    const metrics = deriveYarnMetrics(item);
    const yarnInfo = parseYarnInfo(item);
    document.getElementById("yarnBrand").value = yarnInfo.brand === "-" ? "" : yarnInfo.brand;
    document.getElementById("yarnType").value = item.yarnType || "";
    document.getElementById("yarnColorNo").value = yarnInfo.colorNo === "-" ? "" : yarnInfo.colorNo;
    document.getElementById("needleSize").value = item.needleSize || "";
    if (refs.originalWeight) refs.originalWeight.value = metrics.originalWeight ? String(metrics.originalWeight) : "";
    if (refs.stockWeight) refs.stockWeight.value = metrics.stockWeight ? String(metrics.stockWeight) : "";
    document.getElementById("season").value = item.season || "春秋";
    if (refs.progress) refs.progress.value = String(metrics.progress);
  } else {
    const gauge = deriveSwatchGauge(item);
    document.getElementById("swatchYarn").value = item.yarn || "";
    document.getElementById("swatchPattern").value = item.pattern || "";
    document.getElementById("swatchNeedle").value = item.needle || "";
    document.getElementById("swatchSpec").value = item.spec || "";
    document.getElementById("swatchStitches").value = gauge.stitches || "";
    document.getElementById("swatchRows").value = gauge.rows || "";
    document.getElementById("swatchNotes").value = item.notes || "";
  }

  state.photoData = getItemPhoto(item);
  renderPhotoPreview(state.photoData);
  state.editingId = item.id;
  refs.cancelEditBtn.hidden = false;
  refs.submitBtn.textContent = "保存修改";
}

function renderPhotoPreview(dataUrl) {
  if (!refs.photoPreview) return;
  const src = String(dataUrl || "").trim();
  if (refs.photoWrap) {
    refs.photoWrap.hidden = !src;
  }
  refs.photoPreview.hidden = !src;
  refs.photoPreview.classList.toggle("show", Boolean(src));
  if (refs.removePhotoBtn) {
    refs.removePhotoBtn.hidden = !src;
  }
  if (src) {
    refs.photoPreview.src = src;
    if (refs.photoFileName) {
      refs.photoFileName.textContent = "已选择图片";
    }
  } else {
    refs.photoPreview.removeAttribute("src");
    if (refs.photoFileName) {
      refs.photoFileName.textContent = "未选择文件";
    }
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function upsertItem(next) {
  const index = state.items.findIndex((item) => item.id === next.id);
  let prev = index >= 0 ? state.items[index] : null;
  // 仅在 stockWeight 变化且减少时记录消耗
  if (prev && typeof prev.stockWeight === 'number' && typeof next.stockWeight === 'number') {
    const prevStock = prev.stockWeight;
    const nextStock = next.stockWeight;
    if (nextStock < prevStock) {
      const used = roundToSingle(prevStock - nextStock);
      const today = (new Date()).toISOString().slice(0,10);
      if (!Array.isArray(next.usedLog)) next.usedLog = [];
      next.usedLog = [...(prev.usedLog||[]), { date: today, used }];
    } else {
      next.usedLog = prev.usedLog || [];
    }
  } else if (!prev && typeof next.stockWeight === 'number' && typeof next.originalWeight === 'number') {
    // 新增条目，初始化 usedLog
    next.usedLog = [];
  }
  if (index >= 0) {
    state.items[index] = next;
  } else {
    state.items.unshift(next);
  }
  saveItems();
  void flushStorageCloudPush();
  renderList();
  resetForm();
}

function deleteItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  saveItems();
  void flushStorageCloudPush();
  renderList();
  if (state.editingId === id) {
    resetForm();
  }
}

function buildYarnCard(item) {
  const photo = getItemPhoto(item);
  const ref = parseYarnInfo(item);
  const metrics = deriveYarnMetrics(item);
  const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h4.5L19 9.5 14.5 5 3 16.5V21z"></path><path d="M13.5 6l4.5 4.5"></path></svg>`;
  const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 13h6l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`;
  const cardClass = photo ? "storage-item storage-item-yarn has-photo" : "storage-item storage-item-yarn";
  return `
    <article class="${cardClass}" data-id="${item.id}">
      ${photo ? `<img class="storage-item-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.yarnType || "毛线实拍图")}" />` : ""}
      <div class="storage-item-head">
        <h3> ${escapeHtml(ref.brand)}</h3>
        <div class="storage-item-side">
          <span class="storage-item-meta">${escapeHtml(item.season || "")}</span>
          <div class="storage-item-actions storage-item-actions-vertical">
            <button class="btn ghost storage-icon-btn" type="button" data-action="edit" aria-label="编辑" title="编辑">${editIcon}</button>
            <button class="btn danger storage-icon-btn" type="button" data-action="delete" aria-label="删除" title="删除">${deleteIcon}</button>
          </div>
        </div>
      </div>
      <p class="storage-item-line">线材类型：${escapeHtml(item.yarnType || "-")}</p>
      <p class="storage-item-line">色号：${escapeHtml(ref.colorNo)}</p>
      <p class="storage-item-line">针号：${escapeHtml(item.needleSize || "-")}</p>
      <p class="storage-item-line">原始重量：${formatWeight(metrics.originalWeight)}g</p>
      <p class="storage-item-line">库存重量：${formatWeight(metrics.stockWeight)}g</p>
      <p class="storage-item-line">消耗进度：${metrics.progress}%</p>
      <div class="storage-progress-track">
        <div class="storage-progress-fill" style="width:${clamp(metrics.progress, 0, 100)}%"></div>
      </div>
    </article>
  `;
}

function buildSwatchCard(item) {
  const photo = getItemPhoto(item);
  const gauge = deriveSwatchGauge(item);
  const gaugeText = `${gauge.stitches || "-"}针 × ${gauge.rows || "-"}行`;
  const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h4.5L19 9.5 14.5 5 3 16.5V21z"></path><path d="M13.5 6l4.5 4.5"></path></svg>`;
  const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 13h6l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`;
  return `
    <article class="storage-item storage-item-swatch" data-id="${item.id}">
      ${photo ? `<img class="storage-item-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.yarn || "小样实拍图")}" />` : ""}
      <div class="storage-item-head">
        <h3>${escapeHtml(item.yarn || "未命名小样")}</h3>
        <div class="storage-item-side">
          <span class="storage-item-meta">密度 ${gaugeText}</span>
          <div class="storage-item-actions storage-item-actions-vertical">
            <button class="btn ghost storage-icon-btn" type="button" data-action="edit" aria-label="编辑" title="编辑">${editIcon}</button>
            <button class="btn danger storage-icon-btn" type="button" data-action="delete" aria-label="删除" title="删除">${deleteIcon}</button>
          </div>
        </div>
      </div>
      <p class="storage-item-line">花型：${escapeHtml(item.pattern || "-")}</p>
      <p class="storage-item-line">针号：${escapeHtml(item.needle || "-")}</p>
      <p class="storage-item-line">规格：${escapeHtml(item.spec || "-")}</p>
      <p class="storage-item-line">密度：${gaugeText}</p>
      <p class="storage-item-line">备注：${escapeHtml(item.notes || "-")}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderList() {
  refs.count.textContent = String(state.items.length);
  if (!state.items.length) {
    refs.list.innerHTML = '<p class="helper-text">还没有条目，先新增一条吧。</p>';
    return;
  }

  refs.list.innerHTML = state.items
    .map((item) => (pageType === "yarn" ? buildYarnCard(item) : buildSwatchCard(item)))
    .join("");
}

refs.form.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertItem(collectFormData());
});

refs.cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

if (refs.photoInput) {
  refs.photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (refs.photoFileName) {
      refs.photoFileName.textContent = file.name || "已选择图片";
    }
    try {
      state.photoData = await readImageAsDataUrl(file);
      renderPhotoPreview(state.photoData);
    } catch {
      state.photoData = "";
      renderPhotoPreview("");
    }
  });
}

if (refs.openPhotoPickerBtn && refs.photoInput) {
  refs.openPhotoPickerBtn.addEventListener("click", () => {
    refs.photoInput.click();
  });
}

if (pageType === "swatch") {
  renderSwatchYarnOptions();
  const swatchYarnInput = document.getElementById("swatchYarn");
  swatchYarnInput?.addEventListener("focus", renderSwatchYarnOptions);
  swatchYarnInput?.addEventListener("change", applySwatchYarnRecommendation);
  swatchYarnInput?.addEventListener("blur", applySwatchYarnRecommendation);
}

if (refs.removePhotoBtn) {
  refs.removePhotoBtn.addEventListener("click", () => {
    state.photoData = "";
    if (refs.photoInput) {
      refs.photoInput.value = "";
    }
    renderPhotoPreview("");
  });
}

if (pageType === "yarn") {
  refs.originalWeight?.addEventListener("input", updateYarnProgressPreview);
  refs.stockWeight?.addEventListener("input", updateYarnProgressPreview);
}

if (refs.diagRefreshBtn) {
  refs.diagRefreshBtn.addEventListener("click", () => {
    void pullStorageNow();
  });
}

refs.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest(".storage-item");
  if (!card) return;

  const id = card.dataset.id;
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  if (button.dataset.action === "edit") {
    fillForm(item);
    refs.form.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (button.dataset.action === "delete") {
    deleteItem(id);
  }
});

renderList();
setStorageSyncHint("离线模式");
renderDiagnostics();
setupStorageCloudSync();
if (pageType === "yarn") {
  updateYarnProgressPreview();
}
