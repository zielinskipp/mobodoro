// ── Constants ────────────────────────────────────────────────────────────────
const ORBIT_SIZE = 400; // px — orbit-area width/height
const ORBIT_R = 160; // px — radius from centre to avatar centre
const CX = 200; // orbit-area centre x
const CY = 200; // orbit-area centre y
const AVATAR_SIZE = 48; // px

// Phase → [bgStart, bgEnd, ringColor]
const PHASE_COLORS = {
  work: { bgStart: null, bgEnd: null, ring: null }, // filled dynamically from active-color
  shortBreak: { bgStart: "#065f46", bgEnd: "#0d9488", ring: "#ffffff" },
  longBreak: { bgStart: "#1e3a8a", bgEnd: "#1e40af", ring: "#ffffff" },
};

// ── State ────────────────────────────────────────────────────────────────────
let ws = null;
let session = null;
let activeMenu = null; // { name, el } of currently open context menu

// ── DOM refs ─────────────────────────────────────────────────────────────────
const orbitArea = document.getElementById("orbitArea");
const timerCircle = document.getElementById("timerCircle");
const timerDisplay = document.getElementById("timerDisplay");
const phaseDisplay = document.getElementById("phaseDisplay");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const skipBtn = document.getElementById("skipBtn");
const configureBtn = document.getElementById("configureBtn");
const workMinutesInput = document.getElementById("workMinutes");
const breakMinutesInput = document.getElementById("breakMinutes");
const rotationsBeforeBreakInput = document.getElementById(
  "rotationsBeforeBreak",
);

// ── Geometry helpers ─────────────────────────────────────────────────────────
function avatarPosition(i, n) {
  const angle = ((2 * Math.PI) / n) * i - Math.PI / 2;
  return {
    left: CX + ORBIT_R * Math.cos(angle) - AVATAR_SIZE / 2,
    top: CY + ORBIT_R * Math.sin(angle) - AVATAR_SIZE / 2,
  };
}

function addButtonPosition(n) {
  if (n === 0) {
    // 12 o'clock
    return { left: CX - AVATAR_SIZE / 2, top: CY - ORBIT_R - AVATAR_SIZE / 2 };
  }
  return avatarPosition(n, n + 1);
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

// ── Colour helpers ───────────────────────────────────────────────────────────
function darken(hex, factor = 0.5) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (v) =>
    Math.round(v * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyPhaseColors(phase, activeColor, isRunning) {
  let bgStart, bgEnd, ring;

  if (phase === "work") {
    ring = isRunning ? activeColor : `${activeColor}80`;
    bgStart = darken(activeColor, 0.25);
    bgEnd = darken(activeColor, 0.15);
  } else {
    const c = PHASE_COLORS[phase];
    bgStart = c.bgStart;
    bgEnd = c.bgEnd;
    ring = c.ring;
  }

  document.body.style.setProperty("--phase-bg-start", bgStart);
  document.body.style.setProperty("--phase-bg-end", bgEnd);
  document.documentElement.style.setProperty(
    "--active-color",
    activeColor ?? "#888",
  );
  timerCircle.style.borderColor = ring;

  if (phase === "work" && !isRunning) {
    document.body.style.filter = "saturate(40%)";
  } else {
    document.body.style.filter = "";
  }
}

// ── Context menu ─────────────────────────────────────────────────────────────
function closeMenu() {
  if (activeMenu) {
    activeMenu.el.remove();
    activeMenu = null;
  }
}

function openRenameInline(avatarEl, name) {
  closeMenu();
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = name;
  input.style.cssText = `
    position:absolute; z-index:20;
    top:${avatarEl.style.top}; left:${avatarEl.style.left};
    width:${AVATAR_SIZE * 2}px; padding:4px 6px;
    border-radius:6px; border:2px solid white;
    background:rgba(0,0,0,0.7); color:white; font-size:13px;
    transform:translateX(-25%);
  `;
  orbitArea.appendChild(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    input.remove();
    if (newName && newName !== name) {
      sendCommand({ command: "renameMobber", oldName: name, newName });
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") input.remove();
  });
  input.addEventListener("blur", () => input.remove());
}

function openContextMenu(avatarEl, name) {
  if (activeMenu && activeMenu.name === name) {
    closeMenu();
    return;
  }
  closeMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  const pos = {
    top: parseInt(avatarEl.style.top) + AVATAR_SIZE + 4,
    left: parseInt(avatarEl.style.left),
  };
  menu.style.cssText = `top:${pos.top}px; left:${pos.left}px;`;

  menu.innerHTML = `
    <div class="menu-item" data-action="rename">✏ Rename</div>
    <div class="menu-item" data-action="remove">🗑 Remove</div>
  `;

  menu.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "rename") {
      closeMenu();
      openRenameInline(avatarEl, name);
    } else if (action === "remove") {
      closeMenu();
      sendCommand({ command: "removeMobber", name });
    }
  });

  orbitArea.appendChild(menu);
  activeMenu = { name, el: menu };
}

// ── Add-mobber inline form ────────────────────────────────────────────────────
function openAddForm(btnEl) {
  if (document.querySelector(".add-form")) return;

  const form = document.createElement("div");
  form.className = "add-form";
  form.style.cssText = `
    position:absolute; z-index:20;
    top:${parseInt(btnEl.style.top) + AVATAR_SIZE + 4}px;
    left:${parseInt(btnEl.style.left)}px;
  `;
  form.innerHTML = `
    <input class="add-input" placeholder="Name…" autocomplete="off" />
    <button class="add-confirm">✓</button>
  `;
  orbitArea.appendChild(form);

  const input = form.querySelector(".add-input");
  input.focus();

  const commit = () => {
    const name = input.value.trim();
    form.remove();
    if (name) sendCommand({ command: "addMobber", name });
  };

  form.querySelector(".add-confirm").addEventListener("click", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") form.remove();
  });
  input.addEventListener("blur", (e) => {
    // blur fires before confirm click, so let the click handle it
    setTimeout(() => form.remove(), 150);
  });
}

// ── Orbit rendering ───────────────────────────────────────────────────────────
function renderOrbit(s) {
  // Remove all avatars, menus, add-forms (keep timer-circle)
  orbitArea
    .querySelectorAll(".avatar, .add-btn, .context-menu, .add-form")
    .forEach((el) => el.remove());

  const n = s.mobbers.length;

  // Render mobbers
  s.mobbers.forEach((mobber, i) => {
    const pos = avatarPosition(i, n);
    const isActive = i === s.currentMobberIndex;

    const el = document.createElement("div");
    el.className = "avatar" + (isActive ? " active" : "");
    el.dataset.name = mobber.name;
    el.style.cssText = `
      --mobber-color:${mobber.color};
      top:${pos.top}px; left:${pos.left}px;
    `;
    el.textContent = initials(mobber.name);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openContextMenu(el, mobber.name);
    });

    orbitArea.appendChild(el);
  });

  // Render add button
  const addPos = addButtonPosition(n);
  const addBtn = document.createElement("div");
  addBtn.className = "avatar add-btn";
  addBtn.style.cssText = `top:${addPos.top}px; left:${addPos.left}px;`;
  addBtn.textContent = "+";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddForm(addBtn);
  });
  orbitArea.appendChild(addBtn);
}

// ── Main UI update ────────────────────────────────────────────────────────────
function updateUI(s) {
  session = s;
  sessionStorage.setItem("currentSession", JSON.stringify(s));

  // Timer + phase text
  const mm = String(s.timer.minutes).padStart(2, "0");
  const ss = String(s.timer.seconds).padStart(2, "0");
  timerDisplay.textContent = `${mm}:${ss}`;
  phaseDisplay.textContent =
    s.phase === "work"
      ? "Work"
      : s.phase === "shortBreak"
        ? "Short Break"
        : "Long Break";

  // Buttons
  startBtn.disabled = s.timer.isRunning;
  pauseBtn.disabled = !s.timer.isRunning;

  // Config inputs
  workMinutesInput.value = s.duration.minutes;
  breakMinutesInput.value = s.breakDuration.minutes;
  rotationsBeforeBreakInput.value = s.rotationsBeforeBreak;

  // Colours
  const activeColor = s.mobbers[s.currentMobberIndex]?.color ?? "#667eea";
  applyPhaseColors(s.phase, activeColor, s.timer.isRunning);

  // Orbit
  renderOrbit(s);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function sendCommand(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function init() {
  const pathParts = window.location.pathname.split("/");
  const sessionId = pathParts[pathParts.length - 1];

  if (!sessionId) {
    statusEl.textContent = "No room ID in URL";
    statusEl.className = "status disconnected";
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`);

  ws.onopen = () => {
    statusEl.textContent = "Connected";
    statusEl.className = "status connected";
  };
  ws.onclose = () => {
    statusEl.textContent = "Disconnected";
    statusEl.className = "status disconnected";
  };
  ws.onerror = () => {
    statusEl.textContent = "Connection error";
    statusEl.className = "status disconnected";
  };
  ws.onmessage = (event) => updateUI(JSON.parse(event.data));
}

// ── Button handlers ───────────────────────────────────────────────────────────
startBtn.addEventListener("click", () => sendCommand({ command: "start" }));
pauseBtn.addEventListener("click", () => sendCommand({ command: "pause" }));
resetBtn.addEventListener("click", () => sendCommand({ command: "reset" }));
skipBtn.addEventListener("click", () => sendCommand({ command: "skip" }));

configureBtn.addEventListener("click", () => {
  sendCommand({
    command: "configure",
    workMinutes: parseInt(workMinutesInput.value) || 25,
    breakMinutes: parseInt(breakMinutesInput.value) || 5,
    rotationsBeforeBreak: parseInt(rotationsBeforeBreakInput.value) || 1,
  });
});

// Close menus on backdrop click
document.addEventListener("click", () => closeMenu());

init();
