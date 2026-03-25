(function () {
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
