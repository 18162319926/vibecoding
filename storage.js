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
};

const state = {
  items: loadItems(),
  editingId: "",
  photoData: "",
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
  refs.syncHint.textContent = text;
}

async function pushStorageNow() {
  if (!window.cloudSync || !window.cloudSync.isReady()) return;
  if (!window.cloudSync.getCurrentUser()) return;
  if (typeof window.cloudSync.pushStorageState !== "function") return;

  if (pageType === "yarn") {
    await window.cloudSync.pushStorageState({ yarn: state.items });
  } else {
    await window.cloudSync.pushStorageState({ swatch: state.items });
  }
  syncState.lastPushAt = Date.now();
  syncState.lastError = "";
  renderDiagnostics();
  setStorageSyncHint("已同步到云端");
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
  return normalized;
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

  const remoteList = incoming.map(normalizeItem);
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

    setStorageSyncHint("正在同步云端数据...");

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
    return {
      id: state.editingId || makeId(),
      yarnBrand,
      yarnType,
      yarnColorNo,
      yarnRef,
      needleSize: document.getElementById("needleSize").value.trim(),
      weight: Math.max(0, Number(document.getElementById("weight").value) || 0),
      season: document.getElementById("season").value,
      progress: clamp(Number(document.getElementById("progress").value) || 0, 0, 100),
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
    gauge: Math.max(0, Number(document.getElementById("swatchGauge").value) || 0),
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
  refs.cancelEditBtn.hidden = true;
  refs.submitBtn.textContent = pageType === "yarn" ? "新增毛线条目" : "新增小样条目";
}

function fillForm(item) {
  if (pageType === "yarn") {
    const yarnInfo = parseYarnInfo(item);
    document.getElementById("yarnBrand").value = yarnInfo.brand === "-" ? "" : yarnInfo.brand;
    document.getElementById("yarnType").value = item.yarnType || "";
    document.getElementById("yarnColorNo").value = yarnInfo.colorNo === "-" ? "" : yarnInfo.colorNo;
    document.getElementById("needleSize").value = item.needleSize || "";
    document.getElementById("weight").value = item.weight || "";
    document.getElementById("season").value = item.season || "春秋";
    document.getElementById("progress").value = Number(item.progress) || 0;
  } else {
    document.getElementById("swatchYarn").value = item.yarn || "";
    document.getElementById("swatchPattern").value = item.pattern || "";
    document.getElementById("swatchNeedle").value = item.needle || "";
    document.getElementById("swatchSpec").value = item.spec || "";
    document.getElementById("swatchGauge").value = item.gauge || "";
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
  } else {
    refs.photoPreview.removeAttribute("src");
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
  return `
    <article class="storage-item" data-id="${item.id}">
      ${photo ? `<img class="storage-item-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.yarnType || "毛线实拍图")}" />` : ""}
      <div class="storage-item-head">
        <h3> ${escapeHtml(ref.brand)}</h3>
        <span class="storage-item-meta">${escapeHtml(item.season || "")}</span>
      </div>
      <p class="storage-item-line">线材类型：${escapeHtml(item.yarnType || "-")}</p>
      <p class="storage-item-line">色号：${escapeHtml(ref.colorNo)}</p>
      <p class="storage-item-line">针号：${escapeHtml(item.needleSize || "-")}</p>
      <p class="storage-item-line">重量：${Number(item.weight) || 0}g</p>
      <p class="storage-item-line">消耗进度：${Number(item.progress) || 0}%</p>
      <div class="storage-progress-track">
        <div class="storage-progress-fill" style="width:${clamp(Number(item.progress) || 0, 0, 100)}%"></div>
      </div>
      <div class="storage-item-actions">
        <button class="btn ghost" type="button" data-action="edit">编辑</button>
        <button class="btn danger" type="button" data-action="delete">删除</button>
      </div>
    </article>
  `;
}

function buildSwatchCard(item) {
  const photo = getItemPhoto(item);
  return `
    <article class="storage-item" data-id="${item.id}">
      ${photo ? `<img class="storage-item-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.yarn || "小样实拍图")}" />` : ""}
      <div class="storage-item-head">
        <h3>${escapeHtml(item.yarn || "未命名小样")}</h3>
        <span class="storage-item-meta">密度 ${Number(item.gauge) || 0}</span>
      </div>
      <p class="storage-item-line">花型：${escapeHtml(item.pattern || "-")}</p>
      <p class="storage-item-line">针号：${escapeHtml(item.needle || "-")}</p>
      <p class="storage-item-line">规格：${escapeHtml(item.spec || "-")}</p>
      <p class="storage-item-line">备注：${escapeHtml(item.notes || "-")}</p>
      <div class="storage-item-actions">
        <button class="btn ghost" type="button" data-action="edit">编辑</button>
        <button class="btn danger" type="button" data-action="delete">删除</button>
      </div>
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
    try {
      state.photoData = await readImageAsDataUrl(file);
      renderPhotoPreview(state.photoData);
    } catch {
      state.photoData = "";
      renderPhotoPreview("");
    }
  });
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
