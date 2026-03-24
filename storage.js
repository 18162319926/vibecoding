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
  submitBtn: document.getElementById("submitBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
};

const state = {
  items: loadItems(),
  editingId: "",
};

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[pageType]);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEYS[pageType], JSON.stringify(state.items));
}

function collectFormData() {
  if (pageType === "yarn") {
    return {
      id: state.editingId || makeId(),
      yarnType: document.getElementById("yarnType").value.trim(),
      yarnRef: document.getElementById("yarnRef").value.trim(),
      needleSize: document.getElementById("needleSize").value.trim(),
      weight: Math.max(0, Number(document.getElementById("weight").value) || 0),
      season: document.getElementById("season").value,
      progress: clamp(Number(document.getElementById("progress").value) || 0, 0, 100),
      updatedAt: Date.now(),
    };
  }

  return {
    id: state.editingId || makeId(),
    yarn: document.getElementById("swatchYarn").value.trim(),
    needle: document.getElementById("swatchNeedle").value.trim(),
    spec: document.getElementById("swatchSpec").value.trim(),
    gauge: Math.max(0, Number(document.getElementById("swatchGauge").value) || 0),
    notes: document.getElementById("swatchNotes").value.trim(),
    updatedAt: Date.now(),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetForm() {
  refs.form.reset();
  state.editingId = "";
  refs.cancelEditBtn.hidden = true;
  refs.submitBtn.textContent = pageType === "yarn" ? "新增毛线条目" : "新增小样条目";
}

function fillForm(item) {
  if (pageType === "yarn") {
    document.getElementById("yarnType").value = item.yarnType || "";
    document.getElementById("yarnRef").value = item.yarnRef || "";
    document.getElementById("needleSize").value = item.needleSize || "";
    document.getElementById("weight").value = item.weight || "";
    document.getElementById("season").value = item.season || "春秋";
    document.getElementById("progress").value = Number(item.progress) || 0;
  } else {
    document.getElementById("swatchYarn").value = item.yarn || "";
    document.getElementById("swatchNeedle").value = item.needle || "";
    document.getElementById("swatchSpec").value = item.spec || "";
    document.getElementById("swatchGauge").value = item.gauge || "";
    document.getElementById("swatchNotes").value = item.notes || "";
  }

  state.editingId = item.id;
  refs.cancelEditBtn.hidden = false;
  refs.submitBtn.textContent = "保存修改";
}

function upsertItem(next) {
  const index = state.items.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    state.items[index] = next;
  } else {
    state.items.unshift(next);
  }
  saveItems();
  renderList();
  resetForm();
}

function deleteItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  saveItems();
  renderList();
  if (state.editingId === id) {
    resetForm();
  }
}

function buildYarnCard(item) {
  return `
    <article class="storage-item" data-id="${item.id}">
      <div class="storage-item-head">
        <h3>${escapeHtml(item.yarnType || "未命名线材")}</h3>
        <span class="storage-item-meta">${escapeHtml(item.season || "")}</span>
      </div>
      <p class="storage-item-line">品牌/色号：${escapeHtml(item.yarnRef || "-")}</p>
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
  return `
    <article class="storage-item" data-id="${item.id}">
      <div class="storage-item-head">
        <h3>${escapeHtml(item.yarn || "未命名小样")}</h3>
        <span class="storage-item-meta">密度 ${Number(item.gauge) || 0}</span>
      </div>
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
