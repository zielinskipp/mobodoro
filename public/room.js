// ── Constants ────────────────────────────────────────────────────────────────
const ORBIT_R = 160;
const CX = 200;
const CY = 200;
const AVATAR_SIZE = 48;

const PHASE_COLORS = {
  work: { bgStart: null, bgEnd: null, ring: null }, // filled dynamically from active-color
  shortBreak: { bgStart: "#065f46", bgEnd: "#0d9488", ring: "#ffffff" },
  longBreak: { bgStart: "#1e3a8a", bgEnd: "#1e40af", ring: "#ffffff" },
};

// ── State ────────────────────────────────────────────────────────────────────
let ws = null;
let session = null;
let activeMenu = null;
let pomodoroHistory = []; // [{color}] – completed work orbits, this browser session
let prevDriverKey = null; // `${rotationCount}:${currentMobberIndex}`
const MAX_HISTORY = 8;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const orbitArea = document.getElementById("orbitArea");
const orbitSvg = document.getElementById("orbitSvg");
const timerCircle = document.getElementById("timerCircle");
const timerDisplay = document.getElementById("timerDisplay");
const phaseDisplay = document.getElementById("phaseDisplay");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const skipBtn = document.getElementById("skipBtn");
const configureBtn = document.getElementById("configureBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const workMinutesInput = document.getElementById("workMinutes");
const breakMinutesInput = document.getElementById("breakMinutes");
const rotationsBeforeBreakInput = document.getElementById(
  "rotationsBeforeBreak",
);
const workMinutesVal = document.getElementById("workMinutesVal");
const breakMinutesVal = document.getElementById("breakMinutesVal");
const rotationsBeforeBreakVal = document.getElementById(
  "rotationsBeforeBreakVal",
);

// ── Geometry ────────────────────────────────────────────────────────────────────────────
// progress 0 = 3 o'clock (right), travels clockwise
function travelingAngle(s) {
  const durSrc = s.phase === "work" ? s.duration : s.breakDuration;
  const totalSecs = durSrc.minutes * 60 + durSrc.seconds;
  const remainingSecs = s.timer.minutes * 60 + s.timer.seconds;
  const elapsed = totalSecs - remainingSecs;
  const progress = totalSecs > 0 ? Math.min(elapsed / totalSecs, 1) : 0;
  return progress * 2 * Math.PI;
}

function angleToPos(angle) {
  return {
    left: CX + ORBIT_R * Math.cos(angle) - AVATAR_SIZE / 2,
    top: CY + ORBIT_R * Math.sin(angle) - AVATAR_SIZE / 2,
  };
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

function openRenameInline(el, name) {
  closeMenu();
  const rect = el.getBoundingClientRect();
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = name;
  input.style.cssText = `
    position:fixed; z-index:100;
    top:${rect.top}px; left:${rect.left}px;
    width:${AVATAR_SIZE * 2}px; height:${AVATAR_SIZE}px;
    padding:4px 6px; border-radius:6px; border:2px solid white;
    background:rgba(0,0,0,0.85); color:white; font-size:13px;
  `;
  document.body.appendChild(input);
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

function openContextMenu(el, name) {
  if (activeMenu && activeMenu.name === name) {
    closeMenu();
    return;
  }
  closeMenu();

  const rect = el.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `position:fixed; z-index:100; top:${rect.bottom + 4}px; left:${rect.left}px;`;

  menu.innerHTML = `
    <div class="menu-item" data-action="rename">✏ Rename</div>
    <div class="menu-item" data-action="remove">🗑 Remove</div>
  `;

  menu.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "rename") {
      closeMenu();
      openRenameInline(el, name);
    } else if (action === "remove") {
      closeMenu();
      sendCommand({ command: "removeMobber", name });
    }
  });

  document.body.appendChild(menu);
  activeMenu = { name, el: menu };
}

// ── Add-mobber inline form ────────────────────────────────────────────────────
function openAddForm(btnEl) {
  if (document.querySelector(".add-form")) return;

  const rect = btnEl.getBoundingClientRect();
  const form = document.createElement("div");
  form.className = "add-form";
  form.style.cssText = `position:fixed; z-index:100; top:${rect.bottom + 4}px; left:${rect.left}px;`;
  form.innerHTML = `
    <input class="queue-input" placeholder="Name…" autocomplete="off" style="width:100px;" />
    <button class="add-confirm" style="padding:0.3rem 0.6rem; font-size:1rem;">✓</button>
  `;
  document.body.appendChild(form);

  const input = form.querySelector(".queue-input");
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
  input.addEventListener("blur", () => {
    setTimeout(() => form.remove(), 150);
  });
}

// ── SVG helper ────────────────────────────────────────────────────────────────
function makeSVGEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Per-user orbit rings + progress arc + dot ────────────────────────────────
const BASE_R = 100;
const PLANET_SIZE = 26;
const HIST_SP = 4;   // history rings are just coloured bands — no gap needed
const QUEUE_SP = 30; // queue rings need clearance for 26 px planet divs

// Records a completed work orbit when the active driver changes
function recordCompletedOrbit(s) {
  if (!s.mobbers.length) return;
  const key = `${s.rotationCount}:${s.currentMobberIndex}`;
  if (prevDriverKey !== null && prevDriverKey !== key && s.phase === "work") {
    const prevIdx = parseInt(prevDriverKey.split(":")[1]);
    const m = s.mobbers[prevIdx];
    if (m) pomodoroHistory.push({ color: m.color });
  }
  prevDriverKey = key;
}

function renderRings(s) {
  orbitSvg.innerHTML = "";
  const n = s.mobbers.length;
  const H = Math.min(pomodoroHistory.length, MAX_HISTORY);

  if (n === 0) {
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200, cy: 200, r: BASE_R,
        fill: "none", stroke: "rgba(255,255,255,0.15)",
        "stroke-width": 2, "stroke-dasharray": "7 5",
      }),
    );
    return;
  }

  const rawAngle = travelingAngle(s);
  const progress = rawAngle / (2 * Math.PI);
  const breakEvery = (s.rotationsBeforeBreak || 1) * n;

  // History bands — solid rings, tightly stacked, no break markers here
  pomodoroHistory.slice(-H).forEach((h, i) => {
    const r = BASE_R + i * HIST_SP;
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200, cy: 200, r, fill: "none",
        stroke: h.color, "stroke-width": 4, "stroke-opacity": 0.6,
      }),
    );
  });

  // Active ring
  const activeR = BASE_R + H * HIST_SP;
  const activeColor = s.mobbers[s.currentMobberIndex]?.color ?? "#888";
  const circ = 2 * Math.PI * activeR;
  orbitSvg.appendChild(
    makeSVGEl("circle", {
      cx: 200, cy: 200, r: activeR, fill: "none",
      stroke: activeColor, "stroke-width": 2.5,
      "stroke-opacity": 0.45, "stroke-dasharray": "6 5",
    }),
  );

  // Progress arc — rotate(-90) makes 0% start at 12 o'clock
  if (progress > 0) {
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200, cy: 200, r: activeR, fill: "none",
        stroke: activeColor, "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-dasharray": `${progress * circ} ${circ}`,
        transform: "rotate(-90, 200, 200)",
      }),
    );
  }

  // Queue ghost rings + white dot where a break will occur
  // totalPos = absolute session count so we know where the next break falls
  const totalPos = s.rotationCount * n + s.currentMobberIndex;
  for (let qi = 1; qi < n; qi++) {
    const mobberIdx = (s.currentMobberIndex + qi) % n;
    const r = activeR + qi * QUEUE_SP;
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200, cy: 200, r, fill: "none",
        stroke: s.mobbers[mobberIdx].color,
        "stroke-width": 1.5, "stroke-opacity": 0.2, "stroke-dasharray": "6 5",
      }),
    );
    // Small white dot at 12 o'clock when a break follows this person's turn
    if (breakEvery > 0 && (totalPos + qi) % breakEvery === 0) {
      orbitSvg.appendChild(
        makeSVGEl("circle", { cx: 200, cy: 200 - r, r: 4, fill: "rgba(255,255,255,0.7)" }),
      );
    }
  }
}

// ── Planet divs — all start at 12 o'clock, active travels clockwise ──────────
function renderPlanets(s) {
  orbitArea.querySelectorAll(".planet, .add-planet").forEach((el) => el.remove());
  const n = s.mobbers.length;
  const H = Math.min(pomodoroHistory.length, MAX_HISTORY);
  const S = PLANET_SIZE;
  // subtract π/2 so angle=0 ≡ 12 o'clock (top), grows clockwise
  const angle = travelingAngle(s) - Math.PI / 2;

  if (n > 0) {
    // Active planet travels on its ring
    const activeR = BASE_R + H * HIST_SP;
    const activeMobber = s.mobbers[s.currentMobberIndex];
    const ax = 200 + activeR * Math.cos(angle);
    const ay = 200 + activeR * Math.sin(angle);
    const activePlanet = document.createElement("div");
    activePlanet.className = "planet active";
    activePlanet.style.cssText = `--mobber-color:${activeMobber.color}; left:${ax - S / 2}px; top:${ay - S / 2}px;`;
    activePlanet.textContent = initials(activeMobber.name);
    activePlanet.title = activeMobber.name;
    activePlanet.addEventListener("click", (e) => {
      e.stopPropagation();
      openContextMenu(activePlanet, activeMobber.name);
    });
    orbitArea.appendChild(activePlanet);

    // Inactive queue planets park at 12 o'clock (top) on their upcoming rings
    for (let qi = 1; qi < n; qi++) {
      const mobberIdx = (s.currentMobberIndex + qi) % n;
      const mobber = s.mobbers[mobberIdx];
      const r = activeR + qi * QUEUE_SP;
      const el = document.createElement("div");
      el.className = "planet";
      el.style.cssText = `--mobber-color:${mobber.color}; left:${200 - S / 2}px; top:${200 - r - S / 2}px;`;
      el.textContent = initials(mobber.name);
      el.title = mobber.name;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openContextMenu(el, mobber.name);
      });
      orbitArea.appendChild(el);
    }
  }

  // Faded '+' at 12 o'clock on the ring just beyond the last queue member
  const addR = (BASE_R + H * HIST_SP) + n * QUEUE_SP;
  const addBtn = document.createElement("div");
  addBtn.className = "add-planet";
  addBtn.style.cssText = `left:${200 - S / 2}px; top:${200 - addR - S / 2}px;`;
  addBtn.textContent = "+";
  addBtn.title = "Add mobber";
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
  workMinutesVal.textContent = s.duration.minutes;
  breakMinutesVal.textContent = s.breakDuration.minutes;
  rotationsBeforeBreakVal.textContent = s.rotationsBeforeBreak;

  // Colours
  const activeColor = s.mobbers[s.currentMobberIndex]?.color ?? "#667eea";
  applyPhaseColors(s.phase, activeColor, s.timer.isRunning);

  recordCompletedOrbit(s);
  renderRings(s);
  renderPlanets(s);
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

// Settings panel toggle
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle("open");
});

settingsPanel.addEventListener("click", (e) => e.stopPropagation());

// Live slider previews
workMinutesInput.addEventListener("input", () => {
  workMinutesVal.textContent = workMinutesInput.value;
});
breakMinutesInput.addEventListener("input", () => {
  breakMinutesVal.textContent = breakMinutesInput.value;
});
rotationsBeforeBreakInput.addEventListener("input", () => {
  rotationsBeforeBreakVal.textContent = rotationsBeforeBreakInput.value;
});

// Close menus and settings panel on backdrop click
document.addEventListener("click", () => {
  closeMenu();
  settingsPanel.classList.remove("open");
});

init();
