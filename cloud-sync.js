(function () {
  const state = {
    ready: false,
    currentUser: null,
    client: null,
    authListeners: [],
    initError: "",
    realtimeChannel: null,
    timerShadow: null,
    storageShadow: { yarn: [], swatch: [] },
  };

  function getConfig() {
    const raw = window.__KNIT_SUPABASE_CONFIG__ || {};
    return {
      supabaseUrl: String(raw.supabaseUrl || "").trim(),
      supabaseAnonKey: String(raw.supabaseAnonKey || "").trim(),
      stateTable: String(raw.stateTable || "knit_user_state").trim(),
      coversBucket: String(raw.coversBucket || "knit-covers").trim(),
      // Realtime can be unstable in some local/dev networks; keep it opt-in.
      realtimeEnabled: Boolean(raw.realtimeEnabled),
      pollIntervalMs: Math.max(3000, Number(raw.pollIntervalMs) || 10000),
    };
  }

  function hasValidConfig(config) {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey);
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
    if (!error) return "请稍后重试";
    if (typeof error === "string") return error;
    const message = String(error.message || "").trim();
    if (message) return message;
    const details = String(error.details || "").trim();
    if (details) return details;
    const hint = String(error.hint || "").trim();
    if (hint) return hint;
    return "请稍后重试";
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

  function sanitizeStorageItemForCloud(item) {
    const source = item && typeof item === "object" ? item : {};
    const next = { ...source };

    // Avoid oversized row payload: do not persist local base64 photos in table JSON.
    // Keep only remote URLs, clear data URLs.
    ["photo", "photoData", "image", "coverImage", "diagramImage"].forEach((key) => {
      const value = String(next[key] || "").trim();
      if (!value) {
        next[key] = "";
        return;
      }
      if (/^data:image\//i.test(value)) {
        next[key] = "";
        return;
      }
      if (/^https?:\/\//i.test(value)) {
        next[key] = value;
        return;
      }
      next[key] = "";
    });

    if (next.notes) next.notes = trimText(next.notes, 1200);
    if (next.yarnType) next.yarnType = trimText(next.yarnType, 200);
    if (next.yarnBrand) next.yarnBrand = trimText(next.yarnBrand, 120);
    if (next.yarnColorNo) next.yarnColorNo = trimText(next.yarnColorNo, 120);
    if (next.pattern) next.pattern = trimText(next.pattern, 200);

    return next;
  }

  function normalizeStorageCollection(value) {
    return Array.isArray(value)
      ? value
          .filter((item) => item && typeof item === "object")
          .map((item) => sanitizeStorageItemForCloud(item))
      : [];
  }

  function normalizeStoragePayload(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      yarn: normalizeStorageCollection(source.yarn),
      swatch: normalizeStorageCollection(source.swatch),
    };
  }

  function splitTimerAndStorage(timer) {
    if (!timer || typeof timer !== "object") {
      return {
        timer: null,
        storage: normalizeStoragePayload(null),
      };
    }

    const clone = { ...timer };
    const storage = normalizeStoragePayload(clone.__storage);
    delete clone.__storage;

    return {
      timer: clone,
      storage,
    };
  }

  function combineTimerAndStorage(timer, storage) {
    const normalizedStorage = normalizeStoragePayload(storage);
    const hasStorage = normalizedStorage.yarn.length > 0 || normalizedStorage.swatch.length > 0;
    const baseTimer = timer && typeof timer === "object" ? { ...timer } : null;

    if (!baseTimer && !hasStorage) return null;

    const timerPayload = baseTimer || {
      minutes: 25,
      left: 25 * 60,
      running: false,
    };

    if (hasStorage) {
      timerPayload.__storage = normalizedStorage;
    }

    return timerPayload;
  }

  function slimProjectForCloud(project, options) {
    const maxText = Number(options?.maxText) || 2500;
    return {
      ...project,
      textDiagram: trimText(project?.textDiagram, maxText),
      notes: trimText(project?.notes, maxText),
      coverImage: String(project?.coverImage || ""),
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
      textDiagram: trimText(project?.textDiagram, 600),
      notes: trimText(project?.notes, 600),
      materials: Array.isArray(project?.materials) ? project.materials.slice(0, 20) : [],
      coverImage: String(project?.coverImage || ""),
    };
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

    candidate = source.map((item) => slimProjectForCloud(item, { maxText: 2200 }));
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

    return [
      {
        id: source[0]?.id || "fallback-project",
        projectName: trimText(source[0]?.projectName || "未命名项目", 120),
        status: source[0]?.status || "paused",
        rows: Number(source[0]?.rows) || 0,
        totalRows: Number(source[0]?.totalRows) || 0,
        textDiagram: "",
        notes: "",
        materials: [],
        coverImage: String(source[0]?.coverImage || ""),
      },
    ];
  }

  function isDataUrlImage(value) {
    return /^data:image\//.test(String(value || ""));
  }

  function looksLikeRemoteUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function dataUrlToBlobWithMeta(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) return null;
    const header = parts[0];
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { blob: new Blob([bytes], { type: mime }), mime, ext };
  }

  async function uploadCoverAndGetUrl(project, config) {
    const projectId = String(project?.id || "");
    if (!projectId) return "";

    const data = dataUrlToBlobWithMeta(project.coverImage);
    if (!data) return "";

    const userId = String(state.currentUser?.id || "");
    if (!userId) return "";

    const objectPath = `${userId}/${projectId}.${data.ext}`;

    const { error: uploadError } = await state.client.storage
      .from(config.coversBucket)
      .upload(objectPath, data.blob, {
        upsert: true,
        contentType: data.mime,
      });

    if (uploadError) {
      throw new Error(`封面上传失败：${extractErrorMessage(uploadError)}`);
    }

    const { data: publicData } = state.client.storage
      .from(config.coversBucket)
      .getPublicUrl(objectPath);

    return String(publicData?.publicUrl || "");
  }

  async function prepareProjectsForCloud(projects, config) {
    const source = Array.isArray(projects) ? projects : [];
    const output = [];

    for (const item of source) {
      const project = { ...item };
      const cover = String(project.coverImage || "");

      if (isDataUrlImage(cover)) {
        project.coverImage = await uploadCoverAndGetUrl(project, config);
      } else if (looksLikeRemoteUrl(cover)) {
        project.coverImage = cover;
      }

      output.push(project);
    }

    return output;
  }

  async function init() {
    const config = getConfig();

    if (!hasValidConfig(config)) {
      state.initError = "缺少 Supabase 配置，请检查 supabase-config.js";
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      state.initError = "Supabase SDK 未加载，请检查网络或 CDN";
      return;
    }

    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    state.ready = true;
    state.initError = "";

    const { data } = await state.client.auth.getSession();
    state.currentUser = normalizeUser(data?.session?.user || null);
    notifyAuthListeners(state.currentUser);

    state.client.auth.onAuthStateChange((_event, session) => {
      state.currentUser = normalizeUser(session?.user || null);
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
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(extractErrorMessage(error));
    state.currentUser = normalizeUser(data?.user || data?.session?.user || state.currentUser);
    notifyAuthListeners(state.currentUser);
    return state.currentUser;
  }

  async function signUp(email, password) {
    if (!state.ready) throw new Error("云同步未配置");
    const { data, error } = await state.client.auth.signUp({ email, password });
    if (error) throw new Error(extractErrorMessage(error));

    if (data?.user && data?.session) {
      state.currentUser = normalizeUser(data.session.user || data.user);
      notifyAuthListeners(state.currentUser);
      return state.currentUser;
    }

    // Many projects disable email confirm for simple apps; attempt direct sign-in for consistency.
    const { data: signInData, error: signInError } = await state.client.auth.signInWithPassword({ email, password });
    if (signInError) {
      const reason = extractErrorMessage(signInError);
      throw new Error(`注册成功，请先确认邮箱后登录。${reason}`);
    }

    state.currentUser = normalizeUser(signInData?.user || signInData?.session?.user || state.currentUser);
    notifyAuthListeners(state.currentUser);

    return state.currentUser;
  }

  async function signOut() {
    if (!state.ready) throw new Error("云同步未配置");
    const { error } = await state.client.auth.signOut();
    if (error) throw new Error(extractErrorMessage(error));
    return true;
  }

  async function pullState() {
    if (!state.ready || !state.currentUser) return null;
    const config = getConfig();

    const { data, error } = await state.client
      .from(config.stateTable)
      .select("projects, timer, client_updated_at")
      .eq("user_id", state.currentUser.id)
      .order("client_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(extractErrorMessage(error));
    if (!data) return null;

    const parsed = splitTimerAndStorage(data.timer);
    state.timerShadow = parsed.timer;
    state.storageShadow = parsed.storage;

    return {
      projects: Array.isArray(data.projects) ? data.projects : [],
      timer: parsed.timer,
      storage: parsed.storage,
      clientUpdatedAt: Number(data.client_updated_at) || 0,
    };
  }

  async function pushState(payload) {
    if (!state.ready || !state.currentUser) return false;
    const config = getConfig();

    const parsedTimer = splitTimerAndStorage(payload?.timer);
    const payloadHasStorage = Boolean(
      (payload && payload.storage && typeof payload.storage === "object") ||
      (payload && payload.timer && typeof payload.timer === "object" && payload.timer.__storage)
    );

    // When caller only updates projects/timer, pull latest storage snapshot first
    // to avoid overwriting newer yarn/swatch data from another device.
    if (!payloadHasStorage) {
      try {
        const remote = await pullState();
        const latestStorage = normalizeStoragePayload(remote?.storage);
        if (latestStorage.yarn.length > 0 || latestStorage.swatch.length > 0) {
          state.storageShadow = latestStorage;
        }
      } catch {
        // Keep current shadow as a fallback; push should still proceed.
      }
    }

    const nextTimer = parsedTimer.timer || state.timerShadow;
    const incomingStorage = normalizeStoragePayload(payload?.storage);
    const hasParsedTimerStorage = parsedTimer.storage.yarn.length > 0 || parsedTimer.storage.swatch.length > 0;
    if (payloadHasStorage) {
      state.storageShadow = incomingStorage;
    } else if (hasParsedTimerStorage) {
      state.storageShadow = parsedTimer.storage;
    }
    const timer = combineTimerAndStorage(nextTimer, state.storageShadow);

    state.timerShadow = nextTimer || null;
    const preparedProjects = await prepareProjectsForCloud(payload?.projects, config);
    const cloudProjects = fitProjectsToSize(preparedProjects, timer, 5_000_000);
    const clientUpdatedAt = Number(payload?.clientUpdatedAt) || Date.now();

    const row = {
      user_id: state.currentUser.id,
      projects: cloudProjects,
      timer,
      client_updated_at: clientUpdatedAt,
    };

    const { error } = await state.client.from(config.stateTable).upsert(row, { onConflict: "user_id" });
    if (error) {
      const message = extractErrorMessage(error);

      // Fallback for tables missing unique index on user_id.
      if (/on conflict|unique|constraint|conflict/i.test(message)) {
        const { data: updatedRows, error: updateError } = await state.client
          .from(config.stateTable)
          .update({
            projects: row.projects,
            timer: row.timer,
            client_updated_at: row.client_updated_at,
          })
          .eq("user_id", state.currentUser.id)
          .select("user_id")
          .limit(1);

        if (updateError) {
          throw new Error(`同步写入失败：${extractErrorMessage(updateError)}`);
        }

        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
          const { error: insertError } = await state.client.from(config.stateTable).insert(row);
          if (insertError) {
            throw new Error(`同步写入失败：${extractErrorMessage(insertError)}`);
          }
        }
      } else {
        throw new Error(`同步写入失败：${message}`);
      }
    }

    return true;
  }

  async function pullStorageState() {
    const payload = await pullState();
    if (!payload) {
      return {
        yarn: [],
        swatch: [],
        clientUpdatedAt: 0,
      };
    }

    return {
      yarn: normalizeStorageCollection(payload.storage?.yarn),
      swatch: normalizeStorageCollection(payload.storage?.swatch),
      clientUpdatedAt: Number(payload.clientUpdatedAt) || 0,
    };
  }

  async function pushStorageState(payload) {
    if (!state.ready || !state.currentUser) return false;
    let remote = null;
    try {
      remote = await pullState();
    } catch {
      // Fallback to local shadows so storage sync still has a chance to proceed.
      remote = {
        projects: [],
        timer: state.timerShadow,
        storage: state.storageShadow,
      };
    }
    const currentStorage = normalizeStoragePayload(remote?.storage);
    const nextStorage = {
      yarn: payload && Array.isArray(payload.yarn) ? normalizeStorageCollection(payload.yarn) : currentStorage.yarn,
      swatch: payload && Array.isArray(payload.swatch) ? normalizeStorageCollection(payload.swatch) : currentStorage.swatch,
    };

    return pushState({
      projects: Array.isArray(remote?.projects) ? remote.projects : [],
      timer: remote?.timer && typeof remote.timer === "object" ? remote.timer : state.timerShadow,
      storage: nextStorage,
      clientUpdatedAt: Date.now(),
    });
  }

  function watchRemoteState(onData, onError) {
    if (!state.ready || !state.currentUser) return function noop() {};
    const config = getConfig();

    let pollTimerId = null;
    let pollingStopped = false;
    let lastSeenStamp = 0;

    const startPolling = () => {
      if (pollTimerId || pollingStopped) return;
      const run = async () => {
        try {
          const remote = await pullState();
          if (!remote) return;
          const stamp = Number(remote.clientUpdatedAt) || 0;
          if (stamp && stamp <= lastSeenStamp) return;
          if (stamp) {
            lastSeenStamp = stamp;
          }
          onData(remote);
        } catch (error) {
          if (typeof onError === "function") {
            onError(error instanceof Error ? error : new Error("轮询同步失败"));
          }
        }
      };

      void run();
      pollTimerId = setInterval(() => {
        void run();
      }, config.pollIntervalMs);
    };

    const stopPolling = () => {
      pollingStopped = true;
      if (pollTimerId) {
        clearInterval(pollTimerId);
        pollTimerId = null;
      }
    };

    if (!config.realtimeEnabled) {
      startPolling();
      return function unsubscribePolling() {
        stopPolling();
      };
    }

    if (state.realtimeChannel) {
      state.client.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }

    const channel = state.client
      .channel(`knit-sync-${state.currentUser.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: config.stateTable,
          filter: `user_id=eq.${state.currentUser.id}`,
        },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          const parsed = splitTimerAndStorage(row.timer);
          state.timerShadow = parsed.timer;
          state.storageShadow = parsed.storage;
          onData({
            projects: Array.isArray(row.projects) ? row.projects : [],
            timer: parsed.timer,
            storage: parsed.storage,
            clientUpdatedAt: Number(row.client_updated_at) || 0,
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopPolling();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (typeof onError === "function") {
            onError(new Error("实时同步不可用，已切换到轮询"));
          }
          if (state.realtimeChannel === channel) {
            state.client.removeChannel(channel);
            state.realtimeChannel = null;
          }
          startPolling();
        }
      });

    state.realtimeChannel = channel;

    return function unsubscribe() {
      stopPolling();
      if (!state.client || !channel) return;
      state.client.removeChannel(channel);
      if (state.realtimeChannel === channel) {
        state.realtimeChannel = null;
      }
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
    pullStorageState,
    pushStorageState,
    watchRemoteState,
    bindAuthUI,
  };
})();
