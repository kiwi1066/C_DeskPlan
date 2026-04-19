/**
 * app.js
 * Application entry point — ES module, already deferred by the browser.
 * No DOMContentLoaded wrapper needed: modules execute after DOM is parsed.
 */

import {
  AppState,
  DAYS,
  loadState,
  saveState,
  resetAll,
  clearAllData,
  clearDeskDay,
  clearAllDesksForDay,
  copyDayToOtherDays,
  toggleDeskSelection,
  clearSelection,
  undo,
  nextTeamId,
  addTeam,
  assignDesks,
  registerDesk,
} from "./state.js";

import { render, applyHighlight, setTeamClickHandler } from "./render.js";

import {
  loadSVG,
  triggerImport,
  handleDeskImport,
  triggerTeamImport,
  handleTeamImport,
  exportCSV,
  exportImage,
} from "./io.js";

import {
  activateCompare,
  deactivateCompare,
  refreshCompare,
} from "./compare.js";

// ── Safe event binder ─────────────────────────────────────────────────────────

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) { console.warn(`bind(): no element with id="${id}"`); return; }
  el.addEventListener(event, handler);
}

// ── DOM references ────────────────────────────────────────────────────────────

const elMode          = document.getElementById("mode");
const elDay           = document.getElementById("day");
const elDay2          = document.getElementById("day2");
const elCopyModal     = document.getElementById("copyModal");
const elCopyDays      = document.getElementById("copyDays");
const elFileInput     = document.getElementById("fileInput");
const elTeamFileInput = document.getElementById("teamFileInput");

// ── Populate day dropdowns ────────────────────────────────────────────────────

DAYS.forEach(({ key, label }) => {
  [elDay, elDay2].forEach(sel => {
    const opt = document.createElement("option");
    opt.value       = key;
    opt.textContent = label;
    sel.appendChild(opt);
  });
});

elDay2.value         = "tue";
AppState.currentDay2 = "tue";

// ── Team chip click handler ───────────────────────────────────────────────────

setTeamClickHandler(teamId => {
  if (!AppState.selectedDesks.length) return;
  assignDesks(AppState.selectedDesks, teamId, AppState.currentDay);
  render();
});

// ── Load SVG then initialise ──────────────────────────────────────────────────

loadSVG("svgContainer", () => {
  document.querySelectorAll("#svgContainer g[id^='desk']").forEach(el => {
    registerDesk(el.id);
  });
  loadState();
  setupDeskClicks();
  render();
});

// ── Desk click handling ───────────────────────────────────────────────────────

function setupDeskClicks() {
  const svgEl = document.querySelector("#svgContainer svg");
  if (!svgEl) return;

  svgEl.addEventListener("click", e => {
    if (AppState.mode === "compare") return;
    const desk = e.target.closest("g[id^='desk']");
    if (!desk) {
      clearSelection();
      applyHighlight();
      return;
    }
    const additive = AppState.multiMode || e.ctrlKey || e.metaKey;
    toggleDeskSelection(desk.id, additive);
    applyHighlight();
  });
}

// ── Mode switch ───────────────────────────────────────────────────────────────

elMode.addEventListener("change", () => {
  AppState.mode = elMode.value;
  if (AppState.mode === "compare") { activateCompare(); }
  else { deactivateCompare(); render(); }
});

// ── Day selectors ─────────────────────────────────────────────────────────────

elDay.addEventListener("change", () => {
  AppState.currentDay = elDay.value;
  clearSelection();
  AppState.mode === "compare" ? refreshCompare() : render();
});

elDay2.addEventListener("change", () => {
  AppState.currentDay2 = elDay2.value;
  refreshCompare();
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────

bind("btn-import-teams",  "click", triggerTeamImport);
bind("btn-import",        "click", triggerImport);
bind("btn-export",        "click", exportCSV);
bind("btn-export-image",  "click", exportImage);

bind("btn-copy",          "click", openCopyModal);
bind("btn-undo",          "click", () => { if (undo()) render(); });
bind("btn-clear-desks",   "click", handleClearDesks);
bind("btn-clear-all",     "click", () => {
  if (!confirm("Clear all allocations and teams?")) return;
  clearAllData(); render();
});
bind("btn-reset",         "click", () => {
  if (!confirm("Reset everything? All data will be lost.")) return;
  resetAll();
});
bind("btn-multi",         "click", toggleMultiMode);
bind("btn-add-team",      "click", handleAddTeam);
bind("btn-help",          "click", () => window.open("help.html", "_blank"));
bind("btn-apply-copy",    "click", applyCopy);
bind("btn-cancel-copy",   "click", closeCopyModal);

// ── File inputs ───────────────────────────────────────────────────────────────

elFileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) { handleDeskImport(file); elFileInput.value = ""; }
});

elTeamFileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) { handleTeamImport(file); elTeamFileInput.value = ""; }
});

// ── Handlers ─────────────────────────────────────────────────────────────────

function toggleMultiMode() {
  AppState.multiMode = !AppState.multiMode;
  const btn = document.getElementById("btn-multi");
  btn.textContent    = "🧩 Multi" + (AppState.multiMode ? " ON" : "");
  btn.classList.toggle("btn-active", AppState.multiMode);
}

function handleAddTeam() {
  const id   = nextTeamId();
  const name = prompt("Enter name for " + id + ":");
  if (!name?.trim()) return;
  addTeam(id, name.trim());
  saveState();
  render();
}

function handleClearDesks() {
  if (!confirm("Clear desk allocations?")) return;
  if (AppState.selectedDesks.length) {
    clearDeskDay(AppState.selectedDesks, AppState.currentDay);
  } else {
    clearAllDesksForDay(AppState.currentDay);
  }
  render();
}

function openCopyModal() {
  elCopyDays.innerHTML = "";
  DAYS.forEach(({ key, label }) => {
    if (key === AppState.currentDay) return;
    const lbl = document.createElement("label");
    lbl.innerHTML = `<input type="checkbox" value="${key}"> ${label}`;
    elCopyDays.appendChild(lbl);
  });
  elCopyModal.style.display = "block";
}

function applyCopy() {
  const selected = [...elCopyDays.querySelectorAll("input:checked")].map(el => el.value);
  if (!selected.length) return;
  copyDayToOtherDays(AppState.currentDay, selected);
  closeCopyModal();
  render();
}

function closeCopyModal() {
  elCopyModal.style.display = "none";
}
