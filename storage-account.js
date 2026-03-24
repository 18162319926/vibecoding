(function () {
  const accountChip = document.getElementById("accountChip");
  if (!accountChip) return;

  function renderUser(user) {
    const email = String(user?.email || "").trim();
    accountChip.textContent = email ? `当前账户：${email}` : "当前账户：未登录";
  }

  const syncApi = window.cloudSync;
  if (!syncApi || typeof syncApi.onAuthStateChanged !== "function") {
    renderUser(null);
    return;
  }

  syncApi.onAuthStateChanged((user) => {
    renderUser(user);
  });
})();
