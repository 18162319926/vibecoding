(function () {
  const state = {
    ready: false,
    currentUser: null,
    pb: null,
    authListeners: [],
    stateRecordId: "",
    coverRecordCache: {},
    fileToken: "",
    fileTokenFetchedAt: 0,
    initError: "",
  };

  function getConfig() {
    const raw = window.__KNIT_POCKETBASE_CONFIG__ || {};
    return {
      baseUrl: String(raw.baseUrl || "").trim(),
      stateCollection: String(raw.stateCollection || "knit_user_state").trim(),
      userCollection: String(raw.userCollection || "users").trim(),
      ownerField: String(raw.ownerField || "owner").trim(),
      coverCollection: String(raw.coverCollection || "knit_project_covers").trim(),
      coverOwnerField: String(raw.coverOwnerField || "owner").trim(),
      coverProjectIdField: String(raw.coverProjectIdField || "projectId").trim(),
      coverFileField: String(raw.coverFileField || "image").trim(),
    };
  }

  function hasValidConfig(config) {
    return Boolean(config.baseUrl);
  }

  function notifyAuthListeners(user) {
    state.authListeners.forEach((listener) => {
      try {
        listener(user);
      } catch (error) {
        console.error("auth listener error", error);
      }
    });
  }

  function normalizeUser(user) {
    if (!user) return null;
    return {
      id: String(user.id || ""),
      email: String(user.email || ""),
      raw: user,
    };
  }

  function extractErrorMessage(error) {
    const defaultMessage = String(error?.message || "请稍后重试");
    const response = error?.response;
    if (!response || typeof response !== "object") {
      return defaultMessage;
    }

    const data = response.data;
    if (!data || typeof data !== "object") {
      return defaultMessage;
    }

    const firstEntry = Object.entries(data)[0];
    if (!firstEntry) return defaultMessage;

    const field = firstEntry[0];
    const detail = firstEntry[1];
    const detailMessage =
      String(detail?.message || detail?.code || "").trim() ||
      String(response.message || "").trim();

    if (!detailMessage) return defaultMessage;
    return `${field}: ${detailMessage}`;
  }

  function getOwnerValue(recordOwner) {
    if (Array.isArray(recordOwner)) {
      return String(recordOwner[0] || "");
    }
    return String(recordOwner || "");
  }

  function toJsonBytes(value) {
    const text = JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
  }

  function trimText(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength);
  }

  function slimProjectForCloud(project, options) {
    const maxText = Number(options?.maxText) || 2000;
    return {
      ...project,
      coverImage: String(project?.coverImage || ""),
      textDiagram: trimText(project?.textDiagram, maxText),
      notes: trimText(project?.notes, maxText),
    };
  }

  function toCoreProject(project) {
    return {
      id: project?.id,
      projectName: project?.projectName,
      projectType: project?.projectType,
      status: project?.status,
      totalRows: project?.totalRows,
      rows: project?.rows,
      todayRows: project?.todayRows,
      spentSeconds: project?.spentSeconds,
      exportStyle: project?.exportStyle,
      lastDate: project?.lastDate,
      yarnType: project?.yarnType,
      yarnRef: project?.yarnRef,
      tools: project?.tools,
      needleSize: project?.needleSize,
      patternName: project?.patternName,
      textDiagram: trimText(project?.textDiagram, 500),
      notes: trimText(project?.notes, 500),
      materials: Array.isArray(project?.materials) ? project.materials.slice(0, 20) : [],
      coverImage: String(project?.coverImage || ""),
    };
  }

    function isDataUrlImage(value) {
      return /^data:image\//.test(String(value || ""));
    }

    function looksLikeRemoteUrl(value) {
      return /^(https?:)?\/\//.test(String(value || ""));
    }

    function dataUrlToBlob(dataUrl) {
      const parts = String(dataUrl || "").split(",");
      if (parts.length < 2) return null;
      const header = parts[0];
      const mimeMatch = header.match(/data:(.*?);base64/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const binary = atob(parts[1]);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }

    function getCoverFileName(record, config) {
      const value = record?.[config.coverFileField];
      if (Array.isArray(value)) {
        return String(value[0] || "");
      }
      return String(value || "");
    }

    async function getCoverRecord(projectId, config) {
      const key = String(projectId || "");
      if (!key) return null;
      if (state.coverRecordCache[key]) return state.coverRecordCache[key];

      const list = await state.pb
        .collection(config.coverCollection)
        .getList(1, 50, { sort: "-updated", requestKey: null });

      const ownerId = String(state.currentUser?.id || "");
      const found = (list.items || []).find((item) => {
        const itemProjectId = String(item?.[config.coverProjectIdField] || "");
        const ownerValue = getOwnerValue(item?.[config.coverOwnerField]);
        return itemProjectId === key && (!ownerValue || ownerValue === ownerId);
      });

      if (found) {
        state.coverRecordCache[key] = found;
        return found;
      }

      return null;
    }

    async function uploadCoverForProject(project, config) {
      const projectId = String(project?.id || "");
      if (!projectId) return "";
      if (!isDataUrlImage(project?.coverImage)) {
        return String(project?.coverImage || "");
      }

      const blob = dataUrlToBlob(project.coverImage);
      if (!blob) return "";

      const formData = new FormData();
      formData.append(config.coverProjectIdField, projectId);

      const ownerId = String(state.currentUser?.id || "");
      if (ownerId) {
        formData.append(config.coverOwnerField, ownerId);
      }

      formData.append(config.coverFileField, blob, `${projectId}.jpg`);

      let record;
      try {
        const existing = await getCoverRecord(projectId, config);
        if (existing && existing.id) {
          record = await state.pb.collection(config.coverCollection).update(existing.id, formData);
        } else {
          record = await state.pb.collection(config.coverCollection).create(formData);
        }
      } catch (error) {
        const reason = extractErrorMessage(error);
        throw new Error(`封面上传失败：${reason}`);
      }

      state.coverRecordCache[projectId] = record;
      const fileName = getCoverFileName(record, config);
      if (!fileName) return "";
      return state.pb.files.getURL(record, fileName);
    }

    async function prepareProjectsForCloud(projects, config) {
      const source = Array.isArray(projects) ? projects : [];
      const output = [];

      for (const item of source) {
        const project = { ...item };
        const cover = String(project.coverImage || "");

        if (isDataUrlImage(cover)) {
          project.coverImage = await uploadCoverForProject(project, config);
        } else if (looksLikeRemoteUrl(cover)) {
          project.coverImage = cover;
        }

        output.push(project);
      }

      return output;
    }

  function fitProjectsToSize(projects, timer, limitBytes) {
    const source = Array.isArray(projects) ? projects : [];

    const tryBuild = (buildProjects) => {
      const payload = { projects: buildProjects, timer: timer || null };
      return { projects: buildProjects, bytes: toJsonBytes(payload) };
    };

    let candidate = source.map((item) => slimProjectForCloud(item, { maxText: 4000 }));
    let result = tryBuild(candidate);
    if (result.bytes <= limitBytes) return candidate;

    candidate = source.map((item) => slimProjectForCloud(item, { maxText: 3000 }));
    result = tryBuild(candidate);
    if (result.bytes <= limitBytes) return candidate;

    candidate = source.map((item) => slimProjectForCloud(item, { maxText: 1200 }));
    result = tryBuild(candidate);
    if (result.bytes <= limitBytes) return candidate;

    candidate = source.map(toCoreProject);
    result = tryBuild(candidate);
    if (result.bytes <= limitBytes) return candidate;

    while (candidate.length > 1 && result.bytes > limitBytes) {
      candidate = candidate.slice(1);
      result = tryBuild(candidate);
    }

    if (result.bytes <= limitBytes) return candidate;

    const hardMin = {
      id: source[0]?.id || "fallback-project",
      projectName: trimText(source[0]?.projectName || "未命名项目", 120),
      status: source[0]?.status || "paused",
      rows: Number(source[0]?.rows) || 0,
      totalRows: Number(source[0]?.totalRows) || 0,
      textDiagram: "",
      notes: "",
      materials: [],
      coverImage: String(source[0]?.coverImage || ""),
    };
    return [hardMin];
  }

  function withFileToken(url, token) {
    const source = String(url || "");
    if (!source || !token) return source;
    if (!source.includes("/api/files/")) return source;
    if (!source.includes(state.pb.baseUrl)) return source;

    const [base, hash] = source.split("#");
    const [path, query = ""] = base.split("?");
    const params = new URLSearchParams(query);
    params.set("token", token);
    const result = `${path}?${params.toString()}`;
    return hash ? `${result}#${hash}` : result;
  }

  async function getFileAccessToken() {
    if (!state.ready || !state.currentUser) return "";
    if (!state.pb.files || typeof state.pb.files.getToken !== "function") return "";

    const now = Date.now();
    if (state.fileToken && now - state.fileTokenFetchedAt < 4 * 60 * 1000) {
      return state.fileToken;
    }

    try {
      const token = await state.pb.files.getToken();
      state.fileToken = String(token || "");
      state.fileTokenFetchedAt = Date.now();
      return state.fileToken;
    } catch {
      return "";
    }
  }

  async function hydrateProjectsForDisplay(projects) {
    const list = Array.isArray(projects) ? projects : [];
    if (!list.length) return list;

    const token = await getFileAccessToken();
    if (!token) return list;

    return list.map((project) => {
      const cover = String(project?.coverImage || "");
      if (!cover) return project;
      return {
        ...project,
        coverImage: withFileToken(cover, token),
      };
    });
  }

  function init() {
    const config = getConfig();
    if (!hasValidConfig(config)) {
      state.initError = "缺少 PocketBase 地址，请检查 pocketbase-config.js 的 baseUrl";
      return;
    }

    if (!window.PocketBase) {
      state.initError = "PocketBase SDK 未加载，请检查网络或 CDN 访问";
      return;
    }

    const pb = new PocketBase(config.baseUrl);
    state.pb = pb;
    state.ready = true;
    state.initError = "";

    state.currentUser = normalizeUser(pb.authStore.model);

    pb.authStore.onChange(function () {
      state.currentUser = normalizeUser(pb.authStore.model);
      if (!state.currentUser) {
        state.stateRecordId = "";
        state.coverRecordCache = {};
      }
      notifyAuthListeners(state.currentUser);
    });
  }

  function isReady() {
    return state.ready;
  }

  function onAuthStateChanged(callback) {
    state.authListeners.push(callback);
    callback(state.currentUser);
    return function unsubscribe() {
      state.authListeners = state.authListeners.filter((listener) => listener !== callback);
    };
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  async function signIn(email, password) {
    if (!state.ready) throw new Error("云同步未配置");
    const config = getConfig();
    await state.pb.collection(config.userCollection).authWithPassword(email, password);
    return state.currentUser;
  }

  async function signUp(email, password) {
    if (!state.ready) throw new Error("云同步未配置");
    const config = getConfig();
    await state.pb.collection(config.userCollection).create({
      email,
      password,
      passwordConfirm: password,
    });
    await state.pb.collection(config.userCollection).authWithPassword(email, password);
    return state.currentUser;
  }

  async function signOut() {
    if (!state.ready) throw new Error("云同步未配置");
    state.pb.authStore.clear();
    return true;
  }

  async function ensureStateRecord() {
    if (!state.ready || !state.currentUser) return null;
    const config = getConfig();

    if (state.stateRecordId) {
      try {
        const existing = await state.pb.collection(config.stateCollection).getOne(state.stateRecordId);
        return existing;
      } catch {
        state.stateRecordId = "";
      }
    }

    try {
      const list = await state.pb
        .collection(config.stateCollection)
        .getList(1, 20, { sort: "-updated", requestKey: null });

      const ownerId = String(state.currentUser.id || "");
      const ownerField = config.ownerField || "owner";
      const record = (list.items || []).find((item) => {
        const ownerValue = getOwnerValue(item?.[ownerField]);
        return !ownerValue || ownerValue === ownerId;
      });

      if (!record) return null;
      state.stateRecordId = String(record.id || "");
      return record;
    } catch {
      return null;
    }
  }

  async function pullState() {
    const record = await ensureStateRecord();
    if (!record) return null;
    const projects = await hydrateProjectsForDisplay(Array.isArray(record.projects) ? record.projects : []);
    return {
      projects,
      timer: record.timer && typeof record.timer === "object" ? record.timer : null,
      clientUpdatedAt: Number(record.clientUpdatedAt) || 0,
    };
  }

  async function pushState(payload) {
    if (!state.ready || !state.currentUser) return false;
    const config = getConfig();
    const clientUpdatedAt = Number(payload?.clientUpdatedAt) || Date.now();
    const ownerField = config.ownerField || "owner";
    const timer = payload?.timer && typeof payload.timer === "object" ? payload.timer : null;
    const preparedProjects = await prepareProjectsForCloud(payload?.projects, config);
    const maxJsonBytes = 980000;
    const cloudProjects = fitProjectsToSize(preparedProjects, timer, maxJsonBytes);

    const body = {
      projects: cloudProjects,
      timer,
      clientUpdatedAt,
    };

    const ownerId = String(state.currentUser.id || "");
    if (ownerField && ownerId) {
      body[ownerField] = ownerId;
    }

    const existing = await ensureStateRecord();
    if (existing && existing.id) {
      await state.pb.collection(config.stateCollection).update(existing.id, body);
      state.stateRecordId = String(existing.id);
      return true;
    }

    const createAttempts = [
      body,
      ownerField && ownerId ? { ...body, [ownerField]: [ownerId] } : null,
      (() => {
        if (!ownerField) return null;
        const withoutOwner = { ...body };
        delete withoutOwner[ownerField];
        return withoutOwner;
      })(),
    ].filter(Boolean);

    let lastError = null;
    for (const attempt of createAttempts) {
      try {
        const created = await state.pb.collection(config.stateCollection).create(attempt);
        state.stateRecordId = String(created.id || "");
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    const reason = extractErrorMessage(lastError);
    throw new Error(`同步写入失败：${reason}`);
  }

  function watchRemoteState(onData, onError) {
    if (!state.ready || !state.currentUser) return function noop() {};
    const config = getConfig();
    let disposed = false;

    const bootstrap = (async function () {
      try {
        const record = await ensureStateRecord();
        if (!record || disposed) return;
        state.stateRecordId = String(record.id || "");

        await state.pb.collection(config.stateCollection).subscribe(record.id, async function (event) {
          if (!event || !event.record) return;
          const projects = await hydrateProjectsForDisplay(
            Array.isArray(event.record.projects) ? event.record.projects : []
          );
          onData({
            projects,
            timer: event.record.timer && typeof event.record.timer === "object" ? event.record.timer : null,
            clientUpdatedAt: Number(event.record.clientUpdatedAt) || 0,
          });
        });
      } catch (error) {
        if (typeof onError === "function") {
          onError(error);
        }
      }
    })();

    return function unsubscribe() {
      disposed = true;
      bootstrap
        .then(function () {
          if (state.stateRecordId) {
            state.pb.collection(config.stateCollection).unsubscribe(state.stateRecordId);
          }
        })
        .catch(function () {
          // no-op
        });
    };
  }

  function bindAuthUI(options) {
    const emailInput = options?.emailInput;
    const passwordInput = options?.passwordInput;
    const statusEl = options?.statusEl;
    const loginBtn = options?.loginBtn;
    const registerBtn = options?.registerBtn;
    const logoutBtn = options?.logoutBtn;
    const onUserChanged = options?.onUserChanged;

    if (!emailInput || !passwordInput || !statusEl || !loginBtn || !registerBtn || !logoutBtn) {
      return function noop() {};
    }

    if (!isReady()) {
      statusEl.textContent = `云同步不可用：${state.initError || "请检查配置"}`;
      loginBtn.disabled = true;
      registerBtn.disabled = true;
      logoutBtn.disabled = true;
      return function noop() {};
    }

    function setBusy(busy) {
      loginBtn.disabled = busy;
      registerBtn.disabled = busy;
      logoutBtn.disabled = busy;
    }

    function setStatus(text) {
      statusEl.textContent = text;
    }

    const stopWatchingAuth = onAuthStateChanged((user) => {
      if (user) {
        setStatus(`已登录：${user.email || "用户"}`);
        logoutBtn.disabled = false;
      } else {
        setStatus("未登录（当前仅本地保存）");
        logoutBtn.disabled = true;
      }
      if (typeof onUserChanged === "function") {
        onUserChanged(user);
      }
    });

    loginBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        setStatus("请输入邮箱和密码");
        return;
      }
      try {
        setBusy(true);
        await signIn(email, password);
      } catch (error) {
        setStatus(`登录失败：${extractErrorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    });

    registerBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        setStatus("请输入邮箱和密码");
        return;
      }
      if (password.length < 6) {
        setStatus("密码至少 6 位");
        return;
      }
      try {
        setBusy(true);
        await signUp(email, password);
      } catch (error) {
        setStatus(`注册失败：${extractErrorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    });

    logoutBtn.addEventListener("click", async () => {
      try {
        setBusy(true);
        await signOut();
      } catch (error) {
        setStatus(`退出失败：${extractErrorMessage(error)}`);
      } finally {
        setBusy(false);
      }
    });

    return function dispose() {
      stopWatchingAuth();
    };
  }

  init();

  window.cloudSync = {
    isReady,
    onAuthStateChanged,
    signIn,
    signUp,
    signOut,
    getCurrentUser,
    pullState,
    pushState,
    watchRemoteState,
    bindAuthUI,
  };
})();
