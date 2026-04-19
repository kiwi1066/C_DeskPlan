/**
 * state.js
 * Single source of truth for all app data.
 * Nothing outside this module should mutate AppState directly —
 * use the exported helpers so saves and history are never missed.
 */

export const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
];

const STORAGE_KEY = "deskPlannerData";

export const AppState = {
  deskData:      {},   // { "desk-001": { mon:"T1", tue:"", ... }, ... }
  teamNames:     {},   // { "T1": "Finance", "T2": "HR", ... }
  selectedDesks: [],   // ["desk-001", "desk-003"]
  history:       [],   // snapshots of deskData for undo
  multiMode:     false,
  currentDay:    "mon",
  currentDay2:   "tue",
  mode:          "single", // "single" | "compare"
};

// ── Desk registration ────────────────────────────────────────────────────────

export function registerDesk(id) {
  if (!AppState.deskData[id]) {
    AppState.deskData[id] = { mon: "", tue: "", wed: "", thu: "", fri: "" };
  }
}

// ── Team helpers ─────────────────────────────────────────────────────────────

export function addTeam(id, name) {
  AppState.teamNames[id] = name;
}

export function removeAllTeams() {
  AppState.teamNames = {};
}

export function getSortedTeamIds() {
  return Object.keys(AppState.teamNames).sort(
    (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))
  );
}

export function nextTeamId() {
  const existing = Object.keys(AppState.teamNames)
    .map(t => parseInt(t.replace("T", "")))
    .filter(n => !isNaN(n));
  let n = 1;
  while (existing.includes(n)) n++;
  return "T" + n;
}

// ── Team colour ──────────────────────────────────────────────────────────────
// Single unified colour function — no hardcoded map needed.

export function teamColor(teamId) {
  if (!teamId) return "transparent";
  const num = parseInt(teamId.replace("T", "")) || 0;
  const hue = (num * 47) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

// ── Desk assignment ───────────────────────────────────────────────────────────

export function assignDesks(deskIds, teamId, day) {
  pushHistory();
  deskIds.forEach(id => {
    if (AppState.deskData[id]) AppState.deskData[id][day] = teamId;
  });
  saveState();
}

export function clearDeskDay(deskIds, day) {
  pushHistory();
  deskIds.forEach(id => {
    if (AppState.deskData[id]) AppState.deskData[id][day] = "";
  });
  saveState();
}

export function clearAllDesksForDay(day) {
  pushHistory();
  Object.keys(AppState.deskData).forEach(id => {
    AppState.deskData[id][day] = "";
  });
  saveState();
}

export function copyDayToOtherDays(fromDay, toDays) {
  pushHistory();
  Object.keys(AppState.deskData).forEach(id => {
    toDays.forEach(d => {
      AppState.deskData[id][d] = AppState.deskData[id][fromDay];
    });
  });
  saveState();
}

// ── Selection ────────────────────────────────────────────────────────────────

export function toggleDeskSelection(id, additive) {
  const idx = AppState.selectedDesks.indexOf(id);
  if (additive) {
    idx === -1
      ? AppState.selectedDesks.push(id)
      : AppState.selectedDesks.splice(idx, 1);
  } else {
    AppState.selectedDesks = [id];
  }
}

export function clearSelection() {
  AppState.selectedDesks = [];
}

// ── History / Undo ────────────────────────────────────────────────────────────

function pushHistory() {
  AppState.history.push(JSON.parse(JSON.stringify(AppState.deskData)));
  if (AppState.history.length > 50) AppState.history.shift();
}

export function undo() {
  if (!AppState.history.length) return false;
  AppState.deskData = AppState.history.pop();
  saveState();
  return true;
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      deskData:  AppState.deskData,
      teamNames: AppState.teamNames,
    }));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    // Support old saves that stored deskData at the top level
    if (saved.deskData) {
      AppState.deskData  = saved.deskData;
      AppState.teamNames = saved.teamNames || {};
    } else {
      AppState.deskData = saved;
    }
  } catch (e) {
    console.warn("Could not load state:", e);
  }
}

export function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

export function clearAllData() {
  Object.keys(AppState.deskData).forEach(id => {
    DAYS.forEach(({ key }) => { AppState.deskData[id][key] = ""; });
  });
  AppState.teamNames     = {};
  AppState.selectedDesks = [];
  AppState.history       = [];
  saveState();
}

// ── Summary helpers ───────────────────────────────────────────────────────────

export function getDaySummary(day) {
  const all    = Object.values(AppState.deskData);
  const total  = all.length;
  let assigned = 0;
  const teamCounts = {};

  all.forEach(v => {
    if (v[day]) {
      assigned++;
      teamCounts[v[day]] = (teamCounts[v[day]] || 0) + 1;
    }
  });

  return { total, assigned, free: total - assigned, teamCounts };
}
