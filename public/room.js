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
const RING_SPACING = 28;
const PLANET_SIZE = 26;

function renderRings(s) {
  orbitSvg.innerHTML = "";
  const n = s.mobbers.length;

  if (n === 0) {
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200,
        cy: 200,
        r: BASE_R,
        fill: "none",
        stroke: "rgba(255,255,255,0.15)",
        "stroke-width": 2,
        "stroke-dasharray": "7 5",
      }),
    );
    return;
  }

  const rawAngle = travelingAngle(s);
  const progress = rawAngle / (2 * Math.PI); // 0..1

  s.mobbers.forEach((mobber, i) => {
    const r = BASE_R + i * RING_SPACING;
    const circ = 2 * Math.PI * r;
    const active = i === s.currentMobberIndex;

    // Dashed background ring
    orbitSvg.appendChild(
      makeSVGEl("circle", {
        cx: 200,
        cy: 200,
        r,
        fill: "none",
        stroke: mobber.color,
        "stroke-width": active ? 2.5 : 1.5,
        "stroke-opacity": active ? 0.5 : 0.22,
        "stroke-dasharray": "6 5",
      }),
    );

    // Progress arc on active ring — rotate(-90) so 0% starts at 12 o'clock
    if (active && progress > 0) {
      orbitSvg.appendChild(
        makeSVGEl("circle", {
          cx: 200,
          cy: 200,
          r,
          fill: "none",
          stroke: mobber.color,
          "stroke-width": 4,
          "stroke-linecap": "round",
          "stroke-dasharray": `${progress * circ} ${circ}`,
          "stroke-dashoffset": 0,
          transform: "rotate(-90, 200, 200)",
        }),
      );
    }
  });
}

// ── Planet divs — active travels, inactive park at 12 o'clock ────────────────
function renderPlanets(s) {
  orbitArea
    .querySelectorAll(".planet, .add-planet")
    .forEach((el) => el.remove());
  const n = s.mobbers.length;
  // travelingAngle gives 0 at start; subtract π/2 so 0 = 12 o'clock
  const activeAngle = travelingAngle(s) - Math.PI / 2;
  const parkedAngle = -Math.PI / 2; // 12 o'clock
  const S = PLANET_SIZE;

  s.mobbers.forEach((mobber, i) => {
    const r = BASE_R + i * RING_SPACING;
    const active = i === s.currentMobberIndex;
    const angle = active ? activeAngle : parkedAngle;
    const cx = 200 + r * Math.cos(angle);
    const cy = 200 + r * Math.sin(angle);

    const el = document.createElement("div");
    el.className = "planet" + (active ? " active" : "");
    el.style.cssText = `--mobber-color:${mobber.color}; left:${cx - S / 2}px; top:${cy - S / 2}px;`;
    el.textContent = initials(mobber.name);
    el.title = mobber.name;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openContextMenu(el, mobber.name);
    });
    orbitArea.appendChild(el);
  });

  // Faded '+' on the next ring out, at 12 o'clock
  const lastR = BASE_R + Math.max(n - 1, 0) * RING_SPACING;
  const addR = lastR + RING_SPACING;
  const addX = 200 + addR * Math.cos(parkedAngle);
  const addY = 200 + addR * Math.sin(parkedAngle);
  const addBtn = document.createElement("div");
  addBtn.className = "add-planet";
  addBtn.style.cssText = `left:${addX - S / 2}px; top:${addY - S / 2}px;`;
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
