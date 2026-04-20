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
  renameTeam,
  deleteTeam,
  teamDeskCount,
  teamColor,
  assignDesks,
  registerDesk,
} from "./state.js";

import { render, applyHighlight, setTeamClickHandler, setTeamEditHandler } from "./render.js";

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

import { initDragSelect, destroyDragSelect } from "./dragSelect.js";

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

// ── Team edit modal ───────────────────────────────────────────────────────────

setTeamEditHandler(teamId => openTeamEditModal(teamId));

let _editingTeamId = null;

function openTeamEditModal(teamId) {
  _editingTeamId = teamId;
  document.getElementById("teamEditTitle").textContent    = `Edit ${teamId}`;
  document.getElementById("teamEditDot").style.background = teamColor(teamId);
  document.getElementById("teamEditInput").value          = AppState.teamNames[teamId] || "";
  document.getElementById("teamEditModal").style.display  = "block";
  document.getElementById("teamEditInput").focus();
  document.getElementById("teamEditInput").select();
}

function closeTeamEditModal() {
  document.getElementById("teamEditModal").style.display = "none";
  _editingTeamId = null;
}

function applyTeamSave() {
  const input = document.getElementById("teamEditInput");
  const newName = input.value.trim();
  if (!newName || !_editingTeamId) return;
  renameTeam(_editingTeamId, newName);
  saveState();
  closeTeamEditModal();
  render();
}

function applyTeamDelete() {
  if (!_editingTeamId) return;
  const count     = teamDeskCount(_editingTeamId);
  const teamLabel = `${_editingTeamId} ${AppState.teamNames[_editingTeamId]}`;

  if (count === 0) {
    deleteTeam(_editingTeamId, false);
    saveState();
    closeTeamEditModal();
    render();
    return;
  }

  // Team has assignments — show inline confirmation
  const modal = document.getElementById("teamEditModal");
  const color = teamColor(_editingTeamId);
  const dayWord = count === 1 ? "desk-day" : "desk-days";

  modal.innerHTML = `
    <div class="team-edit-header">
      <span class="team-edit-dot" style="background:${color}"></span>
      <h3 style="margin:0;font-size:15px;color:var(--brand-dark);">Delete ${teamLabel}?</h3>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:var(--text-muted);line-height:1.5;">
      This team has <strong>${count}</strong> ${dayWord} assigned across the week.
    </p>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button id="btn-dc-unassign" class="btn-danger">Delete &amp; Unassign</button>
      <button id="btn-dc-keep">Delete, Keep Colours</button>
      <button id="btn-dc-cancel" class="btn-secondary">Cancel</button>
    </div>
  `;

  const tid = _editingTeamId; // capture before closeTeamEditModal clears it

  document.getElementById("btn-dc-unassign").addEventListener("click", () => {
    deleteTeam(tid, true); saveState(); rebuildTeamEditModal(); closeTeamEditModal(); render();
  });
  document.getElementById("btn-dc-keep").addEventListener("click", () => {
    deleteTeam(tid, false); saveState(); rebuildTeamEditModal(); closeTeamEditModal(); render();
  });
  document.getElementById("btn-dc-cancel").addEventListener("click", () => {
    rebuildTeamEditModal(); closeTeamEditModal();
  });
}

// Restore the modal's original DOM structure after showDeleteConfirm replaced it
function rebuildTeamEditModal() {
  document.getElementById("teamEditModal").innerHTML = `
    <div class="team-edit-header">
      <span class="team-edit-dot" id="teamEditDot"></span>
      <h3 id="teamEditTitle">Edit Team</h3>
    </div>
    <div class="team-edit-body">
      <label for="teamEditInput">Name</label>
      <input id="teamEditInput" type="text" autocomplete="off" spellcheck="false">
    </div>
    <div class="modal-actions">
      <button id="btn-team-edit-save">Save</button>
      <button id="btn-team-edit-delete" class="btn-danger">Delete</button>
      <button id="btn-team-edit-cancel" class="btn-secondary">Cancel</button>
    </div>
  `;
  bindTeamEditModalButtons();
}

function bindTeamEditModalButtons() {
  document.getElementById("btn-team-edit-save").addEventListener("click", applyTeamSave);
  document.getElementById("btn-team-edit-delete").addEventListener("click", applyTeamDelete);
  document.getElementById("btn-team-edit-cancel").addEventListener("click", closeTeamEditModal);
  document.getElementById("teamEditInput").addEventListener("keydown", e => {
    if (e.key === "Enter")  applyTeamSave();
    if (e.key === "Escape") closeTeamEditModal();
  });
}

// Bind initial modal buttons on load
bindTeamEditModalButtons();

// ── Load SVG then initialise ──────────────────────────────────────────────────

loadSVG("svgContainer", () => {
  document.querySelectorAll("#svgContainer g[id^='desk']").forEach(el => {
    registerDesk(el.id);
  });
  loadState();
  setupDeskClicks();

  // Attach Shift+drag rubber-band selection
  const svgEl = document.querySelector("#svgContainer svg");
  if (svgEl) initDragSelect(svgEl);

  render();
});

// ── Desk click handling ───────────────────────────────────────────────────────

function setupDeskClicks() {
  const svgEl = document.querySelector("#svgContainer svg");
  if (!svgEl) return;

  // Track whether the previous mousedown was a Shift drag start,
  // so the click event that fires after mouseup doesn't clear the selection.
  let suppressNextClick = false;

  svgEl.addEventListener("mousedown", e => {
    suppressNextClick = e.shiftKey;
  });

  svgEl.addEventListener("click", e => {
    if (AppState.mode === "compare") return;

    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

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
  if (AppState.mode === "compare") {
    destroyDragSelect();
    activateCompare();
  } else {
    deactivateCompare();
    const svgEl = document.querySelector("#svgContainer svg");
    if (svgEl) initDragSelect(svgEl);
    render();
  }
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
