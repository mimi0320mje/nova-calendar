/* Nova Calendar — app logic
 *
 * Works fully offline in "guest mode" (events kept in localStorage). When the
 * Firebase wrapper (window.NovaCloud) is configured AND you're logged in, events
 * live in the cloud instead and sync across devices in real time.
 *
 * app.js never touches Firebase directly — it only calls window.NovaCloud, the
 * same isolation pattern used by the water tracker's cloud.js.
 */
(function () {
  "use strict";

  const LS_KEY = "nova-events-v1";
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  let viewYear, viewMonth; // month currently shown in the grid
  let selectedDate; // "YYYY-MM-DD" the day panel is showing
  let events = []; // [{id, title, date, time, note}]
  let cloudUnsub = null; // active Firestore listener, if logged in

  // ---------- Date helpers ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function todayStr() {
    return ymd(new Date());
  }
  function prettyDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${DOW[dt.getDay()]}, ${MONTHS[m - 1]} ${d}`;
  }

  // ---------- Storage: guest (localStorage) vs cloud ----------
  const loggedIn = () =>
    window.NovaCloud && window.NovaCloud.isConfigured() && window.NovaCloud.getUser();

  function loadGuest() {
    try {
      events = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      events = [];
    }
  }
  function saveGuest() {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  }

  function uid() {
    return "e-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function addEvent(evt) {
    if (loggedIn()) {
      await window.NovaCloud.addEvent(evt); // listener will re-render
    } else {
      events.push({ id: uid(), ...evt });
      saveGuest();
      render();
    }
  }
  async function updateEvent(id, evt) {
    if (loggedIn()) {
      await window.NovaCloud.updateEvent(id, evt);
    } else {
      const i = events.findIndex((e) => e.id === id);
      if (i >= 0) events[i] = { ...events[i], ...evt };
      saveGuest();
      render();
    }
  }
  async function removeEvent(id) {
    if (loggedIn()) {
      await window.NovaCloud.deleteEvent(id);
    } else {
      events = events.filter((e) => e.id !== id);
      saveGuest();
      render();
    }
  }

  // Switch data source when auth state changes.
  function bindDataSource() {
    if (cloudUnsub) {
      cloudUnsub();
      cloudUnsub = null;
    }
    if (loggedIn()) {
      // Live cloud feed — every change re-renders the calendar.
      cloudUnsub = window.NovaCloud.subscribeEvents((list) => {
        events = list;
        render();
      });
    } else {
      loadGuest();
      render();
    }
  }

  // ---------- Rendering ----------
  function eventsOn(dateStr) {
    return events
      .filter((e) => e.date === dateStr)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }

  function renderDow() {
    $("dow").innerHTML = DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  }

  function renderGrid() {
    $("calTitle").textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];
    // Leading days from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, other: true, date: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, other: false, date: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}` });
    }
    // Trailing days from next month to fill the last week row
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ day: nextDay++, other: true, date: null });
    }

    const today = todayStr();
    $("days").innerHTML = cells
      .map((c) => {
        if (c.other) return `<button class="day other" tabindex="-1">${c.day}</button>`;
        const classes = ["day"];
        if (c.date === today) classes.push("today");
        if (c.date === selectedDate) classes.push("selected");
        const has = eventsOn(c.date).length > 0;
        const mark = has ? '<span class="dot-mark"></span>' : "";
        return `<button class="${classes.join(" ")}" data-date="${c.date}">${c.day}${mark}</button>`;
      })
      .join("");

    $("days").querySelectorAll("button[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDate = btn.dataset.date;
        render();
      });
    });
  }

  function renderDayPanel() {
    $("dayTitle").textContent =
      selectedDate === todayStr() ? "Today" : prettyDate(selectedDate);
    const list = eventsOn(selectedDate);
    if (list.length === 0) {
      $("eventList").innerHTML = `<li class="empty">No events. Tap + to add one.</li>`;
      return;
    }
    $("eventList").innerHTML = list
      .map(
        (e) => `
      <li class="event" data-id="${e.id}">
        <span class="time">${e.time || "—"}</span>
        <div class="meta">
          <div class="t"></div>
          ${e.note ? '<div class="n"></div>' : ""}
        </div>
        <button class="del" title="Delete" aria-label="Delete">✕</button>
      </li>`
      )
      .join("");

    // Fill text via textContent to avoid HTML injection from titles/notes.
    list.forEach((e) => {
      const li = $("eventList").querySelector(`li[data-id="${e.id}"]`);
      li.querySelector(".t").textContent = e.title || "(untitled)";
      if (e.note) li.querySelector(".n").textContent = e.note;
      li.querySelector(".del").addEventListener("click", () => removeEvent(e.id));
      li.querySelector(".meta").addEventListener("click", () => openModal(e));
    });
  }

  function render() {
    renderGrid();
    renderDayPanel();
    renderStatus();
  }

  // ---------- Modal ----------
  function openModal(evt) {
    $("modalTitle").textContent = evt ? "Edit event" : "New event";
    $("eventId").value = evt ? evt.id : "";
    $("fTitle").value = evt ? evt.title || "" : "";
    $("fDate").value = evt ? evt.date : selectedDate;
    $("fTime").value = evt ? evt.time || "" : "";
    $("fNote").value = evt ? evt.note || "" : "";
    $("modal").classList.add("open");
    $("fTitle").focus();
  }
  function closeModal() {
    $("modal").classList.remove("open");
  }
  async function saveModal() {
    const title = $("fTitle").value.trim();
    const date = $("fDate").value;
    const time = $("fTime").value;
    if (!title || !date) {
      toast("Title and date are required");
      return;
    }
    const payload = { title, date, time, note: $("fNote").value.trim() };
    const id = $("eventId").value;
    if (id) await updateEvent(id, payload);
    else await addEvent(payload);
    selectedDate = date;
    closeModal();
    render();
    toast("Saved");
  }

  // ---------- Auth UI ----------
  function openAuth() {
    $("authMsg").textContent = "";
    $("authModal").classList.add("open");
  }
  function closeAuth() {
    $("authModal").classList.remove("open");
  }
  function renderStatus() {
    const el = $("status");
    if (!window.NovaCloud || !window.NovaCloud.isConfigured()) {
      el.innerHTML = `Guest mode — events saved on this device only.`;
      return;
    }
    const user = window.NovaCloud.getUser();
    if (user) {
      el.innerHTML = `Synced as ${user.email} · <button class="link" id="logoutLink">Log out</button>`;
      $("logoutLink").addEventListener("click", () => window.NovaCloud.logOut());
    } else {
      el.innerHTML = `Guest mode · <button class="link" id="loginLink">Log in to sync</button>`;
      $("loginLink").addEventListener("click", openAuth);
    }
  }

  // ---------- Notifications ----------
  async function enableReminders() {
    if (!("Notification" in window)) {
      toast("This browser can't show notifications");
      return;
    }
    if (!loggedIn()) {
      toast("Log in first so reminders can reach you");
      openAuth();
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Notifications blocked — enable them in settings");
      return;
    }
    try {
      await window.NovaCloud.enableMessaging();
      toast("Reminders on 🔔");
    } catch (e) {
      toast("Couldn't turn on reminders");
      console.error(e);
    }
  }

  // Show the iOS "Add to Home Screen" hint on iPhone Safari when not installed.
  function maybeShowInstallHint() {
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
    if (isiOS && !standalone) $("installHint").classList.remove("hidden");
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Wire up ----------
  function init() {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selectedDate = todayStr();

    renderDow();
    bindDataSource();

    $("addBtn").addEventListener("click", () => openModal(null));
    $("bellBtn").addEventListener("click", enableReminders);
    $("prevBtn").addEventListener("click", () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });
    $("nextBtn").addEventListener("click", () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });
    $("todayBtn").addEventListener("click", () => {
      const n = new Date();
      viewYear = n.getFullYear();
      viewMonth = n.getMonth();
      selectedDate = todayStr();
      render();
    });

    $("saveBtn").addEventListener("click", saveModal);
    $("cancelBtn").addEventListener("click", closeModal);
    $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

    $("loginBtn").addEventListener("click", () => doAuth("login"));
    $("signupBtn").addEventListener("click", () => doAuth("signup"));
    $("authCancel").addEventListener("click", closeAuth);
    $("authModal").addEventListener("click", (e) => { if (e.target.id === "authModal") closeAuth(); });

    // React to login/logout from cloud.js.
    window.addEventListener("nova-auth-changed", () => {
      bindDataSource();
      closeAuth();
    });

    maybeShowInstallHint();

    // Register the offline service worker (auto-updating, network-first).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  async function doAuth(mode) {
    const email = $("aEmail").value.trim();
    const pass = $("aPass").value;
    if (!email || !pass) {
      $("authMsg").textContent = "Enter email and password.";
      return;
    }
    $("authMsg").textContent = "Working…";
    try {
      if (mode === "signup") await window.NovaCloud.signUp(email, pass);
      else await window.NovaCloud.logIn(email, pass);
      toast("Logged in");
    } catch (e) {
      $("authMsg").textContent = e && e.message ? e.message : "Login failed.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
