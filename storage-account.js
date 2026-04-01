(function () {
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

  setupMobileAuthMenu();

  const accountChip = document.getElementById("accountChip");
  if (!accountChip) return;

  accountChip.textContent = "当前账户：恢复中...";

  function renderUser(user) {
    const email = String(user?.email || "").trim();
    accountChip.textContent = email ? `当前账户：${email}` : "当前账户：未登录";
  }

  const syncApi = window.cloudSync;
  if (!syncApi || typeof syncApi.onAuthStateChanged !== "function") {
    renderUser(null);
    return;
  }

  if (typeof syncApi.isAuthResolved === "function" && !syncApi.isAuthResolved()) {
    accountChip.textContent = "当前账户：恢复中...";
  }

  syncApi.onAuthStateChanged((user) => {
    renderUser(user);
  });
})();
