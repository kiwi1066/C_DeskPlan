/**
 * app.js
 * Application entry point.
 * All DOM access is inside DOMContentLoaded so elements are guaranteed to exist.
 * A safe bind() helper prevents one missing element killing the whole script.
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
// Logs a clear warning instead of throwing if an element is missing,
// so one bad ID can never silence the rest of the wiring.

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`bind(): no element found with id="${id}"`);
    return;
  }
  el.addEventListener(event, handler);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {

  // ── DOM references ───────────────────────────────────────────────────────────

  const elMode          = document.getElementById("mode");
  const elDay           = document.getElementById("day");
  const elDay2          = document.getElementById("day2");
  const elCopyModal     = document.getElementById("copyModal");
  const elCopyDays      = document.getElementById("copyDays");
  const elFileInput     = document.getElementById("fileInput");
  const elTeamFileInput = document.getElementById("teamFileInput");

  // ── Populate day dropdowns ───────────────────────────────────────────────────

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

  // Register the team-chip click handler (keeps state mutation out of render.js)
  setTeamClickHandler(teamId => {
    if (!AppState.selectedDesks.length) return;
    assignDesks(AppState.selectedDesks, teamId, AppState.currentDay);
    render();
  });

  // ── Load SVG then initialise ─────────────────────────────────────────────────

  loadSVG("svgContainer", () => {
    document.querySelectorAll("#svgContainer g[id^='desk']").forEach(el => {
      registerDesk(el.id);
    });

    loadState();
    setupDeskClicks();
    render();
  });

  // ── Desk click handling ──────────────────────────────────────────────────────

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

  // ── Mode switch ──────────────────────────────────────────────────────────────

  elMode.addEventListener("change", () => {
    AppState.mode = elMode.value;
    if (AppState.mode === "compare") {
      activateCompare();
    } else {
      deactivateCompare();
      render();
    }
  });

  // ── Day selectors ────────────────────────────────────────────────────────────

  elDay.addEventListener("change", () => {
    AppState.currentDay = elDay.value;
    clearSelection();
    AppState.mode === "compare" ? refreshCompare() : render();
  });

  elDay2.addEventListener("change", () => {
    AppState.currentDay2 = elDay2.value;
    refreshCompare();
  });

  // ── Toolbar buttons ──────────────────────────────────────────────────────────

  // File
  bind("btn-import-teams",  "click", triggerTeamImport);
  bind("btn-import",        "click", triggerImport);
  bind("btn-export",        "click", exportCSV);
  bind("btn-export-image",  "click", exportImage);

  // Edit
  bind("btn-copy",          "click", openCopyModal);
  bind("btn-undo",          "click", () => { if (undo()) render(); });
  bind("btn-clear-desks",   "click", handleClearDesks);
  bind("btn-clear-all",     "click", () => {
    if (!confirm("Clear all desk allocations and teams?")) return;
    clearAllData();
    render();
  });
  bind("btn-reset",         "click", () => {
    if (!confirm("Reset everything? All data will be cleared.")) return;
    resetAll();
  });

  // Select & Teams
  bind("btn-multi",         "click", toggleMultiMode);
  bind("btn-add-team",      "click", handleAddTeam);
  bind("btn-help",          "click", () => window.open("help.html", "_blank"));

  // Copy modal actions
  bind("btn-apply-copy",    "click", applyCopy);
  bind("btn-cancel-copy",   "click", closeCopyModal);

  // ── File input change handlers ───────────────────────────────────────────────

  elFileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleDeskImport(file);
  });

  elTeamFileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleTeamImport(file);
  });

  // ── Multi-select ─────────────────────────────────────────────────────────────

  function toggleMultiMode() {
    AppState.multiMode = !AppState.multiMode;
    const btn = document.getElementById("btn-multi");
    btn.textContent    = "🧩 Multi" + (AppState.multiMode ? " ON" : "");
    btn.dataset.active = AppState.multiMode;
  }

  // ── Add team ─────────────────────────────────────────────────────────────────

  function handleAddTeam() {
    const id   = nextTeamId();
    const name = prompt("Enter name for " + id + ":");
    if (!name || !name.trim()) return;
    addTeam(id, name.trim());
    saveState();
    render();
  }

  // ── Clear desks ──────────────────────────────────────────────────────────────

  function handleClearDesks() {
    if (!confirm("Clear desk allocations?")) return;
    if (AppState.selectedDesks.length) {
      clearDeskDay(AppState.selectedDesks, AppState.currentDay);
    } else {
      clearAllDesksForDay(AppState.currentDay);
    }
    render();
  }

  // ── Copy modal ───────────────────────────────────────────────────────────────

  function openCopyModal() {
    elCopyDays.innerHTML = "";
    DAYS.forEach(function(d) {
      if (d.key === AppState.currentDay) return;
      const lbl = document.createElement("label");
      lbl.innerHTML = "<input type='checkbox' value='" + d.key + "'> " + d.label;
      elCopyDays.appendChild(lbl);
    });
    elCopyModal.style.display = "block";
  }

  function applyCopy() {
    const selected = Array.from(elCopyDays.querySelectorAll("input:checked")).map(function(el) { return el.value; });
    if (!selected.length) return;
    copyDayToOtherDays(AppState.currentDay, selected);
    closeCopyModal();
    render();
  }

  function closeCopyModal() {
    elCopyModal.style.display = "none";
  }

}); // end DOMContentLoaded
