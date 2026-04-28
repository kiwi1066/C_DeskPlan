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

// Override this with a per-floor key once buildings are loaded
let _storageKey = STORAGE_KEY;
export function setStorageKey(key) { _storageKey = key; }

export const AppState = {
  deskData:      {},   // { "desk-001": { mon:"T1", tue:"", ... }, ... }
  teamNames:     {},   // { "T1": "Finance", "T2": "HR", ... }
  selectedDesks: [],
  history:       [],
  multiMode:     false,
  currentDay:    "mon",
  currentDay2:   "tue",
  mode:          "single",
  deskSelector:  "g[id^='desk']",
  categoryLabel: "Teams",
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

export function renameTeam(id, newName) {
  if (AppState.teamNames[id] !== undefined) AppState.teamNames[id] = newName;
}

export function deleteTeam(id, unassignDesks = false) {
  delete AppState.teamNames[id];
  if (unassignDesks) {
    DAYS.forEach(({ key }) => {
      Object.keys(AppState.deskData).forEach(deskId => {
        if (AppState.deskData[deskId][key] === id) {
          AppState.deskData[deskId][key] = "";
        }
      });
    });
  }
}

/** Total desk-day assignments across all days for a team */
export function teamDeskCount(teamId) {
  let count = 0;
  DAYS.forEach(({ key }) => {
    Object.values(AppState.deskData).forEach(v => {
      if (v[key] === teamId) count++;
    });
  });
  return count;
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
// Curated palette of 20 distinguishable colours, cycling hue + lightness +
// saturation so adjacent IDs never end up looking the same. Beyond 20 teams
// we fall back to a hash-based HSL so colours stay stable but may repeat.

const TEAM_PALETTE = [
  "#e41a1c", // red
  "#377eb8", // blue
  "#4daf4a", // green
  "#984ea3", // purple
  "#ff7f00", // orange
  "#ffd92f", // yellow
  "#a65628", // brown
  "#f781bf", // pink
  "#17becf", // cyan
  "#999999", // grey
  "#8c1d40", // dark red
  "#1f78b4", // navy
  "#33a02c", // dark green
  "#6a3d9a", // dark purple
  "#b15928", // dark orange
  "#bcbd22", // olive
  "#7f7f7f", // dark grey
  "#fb9a99", // light pink
  "#a6cee3", // light blue
  "#b2df8a", // light green
];

export const PALETTE_SIZE = TEAM_PALETTE.length;

export function teamColor(teamId) {
  if (!teamId) return "transparent";
  const num = parseInt(teamId.replace("T", "")) || 0;
  if (num >= 1 && num <= TEAM_PALETTE.length) {
    return TEAM_PALETTE[num - 1];
  }
  // Fallback for teams beyond the palette
  const hue = (num * 47) % 360;
  const lt  = 45 + (num % 3) * 8;
  return `hsl(${hue}, 60%, ${lt}%)`;
}

// ── Desk assignment ───────────────────────────────────────────────────────────

export function assignDesks(deskIds, teamId, day) {
  pushHistory();
  deskIds.forEach(id => {
    if (AppState.deskData[id]) {
      AppState.deskData[id][day] = teamId;
    } else {
      console.warn(`assignDesks: desk "${id}" not found in deskData`);
    }
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
    localStorage.setItem(_storageKey, JSON.stringify({
      deskData:      AppState.deskData,
      teamNames:     AppState.teamNames,
      categoryLabel: AppState.categoryLabel,
    }));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(_storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);

    const savedDesks = saved.deskData || saved;
    const savedTeams = saved.teamNames || {};

    Object.keys(savedDesks).forEach(id => {
      if (AppState.deskData[id]) {
        AppState.deskData[id] = savedDesks[id];
      }
    });

    AppState.teamNames = savedTeams;

    // Restore user-edited category label if present
    if (saved.categoryLabel) AppState.categoryLabel = saved.categoryLabel;
  } catch (e) {
    console.warn("Could not load state:", e);
  }
}

export function resetAll() {
  localStorage.removeItem(_storageKey);
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

/** Called when switching floors — wipes all runtime state ready for new SVG */
export function resetFloorData() {
  AppState.deskData      = {};
  AppState.teamNames     = {};
  AppState.selectedDesks = [];
  AppState.history       = [];
  AppState.mode          = "single";
  AppState.currentDay    = "mon";
  AppState.deskSelector  = "g[id^='desk']";
  AppState.categoryLabel = "Teams";
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
