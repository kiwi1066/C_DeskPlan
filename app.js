/**
 * app.js
 * Application entry point — ES module, already deferred by the browser.
 *
 * Boot sequence:
 *  1. Fetch buildings.json
 *  2. Populate building/floor dropdowns
 *  3. Load the first floor's SVG
 *  4. Restore saved state for that floor
 *  5. Render
 *
 * Floor switching re-runs steps 3-5 for the new floor.
 */

import {
  AppState,
  DAYS,
  loadState,
  saveState,
  setStorageKey,
  resetAll,
  clearAllData,
  resetFloorData,
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
  resetCompare,
} from "./compare.js";

import { initDragSelect, destroyDragSelect } from "./dragSelect.js";

import {
  loadBuildings,
  getBuildings,
  getFloors,
  getCurrentFloor,
  setCurrentFloor,
  storageKey,
  floorTitle,
} from "./buildings.js";

// ── Safe event binder ─────────────────────────────────────────────────────────

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) { console.warn(`bind(): no element with id="${id}"`); return; }
  el.addEventListener(event, handler);
}

// ── DOM references ────────────────────────────────────────────────────────────

const elBuilding      = document.getElementById("building");
const elFloor         = document.getElementById("floor");
const elMode          = document.getElementById("mode");
const elDay           = document.getElementById("day");
const elDay2          = document.getElementById("day2");
const elCopyModal     = document.getElementById("copyModal");
const elCopyDays      = document.getElementById("copyDays");
const elFileInput     = document.getElementById("fileInput");
const elTeamFileInput = document.getElementById("teamFileInput");
const elFloorLoading  = document.getElementById("floorLoading");
const elFloorLoadingLabel = document.getElementById("floorLoadingLabel");
const elAppTitle      = document.getElementById("appTitle");
const elFloorPlanImg  = document.getElementById("floorPlanImg");
const elFloorPlanImg1 = document.getElementById("floorPlanImg1");
const elFloorPlanImg2 = document.getElementById("floorPlanImg2");

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

// ── Team chip handlers ────────────────────────────────────────────────────────

setTeamClickHandler(teamId => {
  if (!AppState.selectedDesks.length) return;
  assignDesks(AppState.selectedDesks, teamId, AppState.currentDay);
  render();
});

setTeamEditHandler(teamId => openTeamEditModal(teamId));

// ── Team edit modal ───────────────────────────────────────────────────────────

let _editingTeamId = null;

const _mel = {
  modal:       document.getElementById("teamEditModal"),
  editPanel:   document.getElementById("teamEditPanel"),
  deletePanel: document.getElementById("teamDeletePanel"),
  dot:         document.getElementById("teamEditDot"),
  title:       document.getElementById("teamEditTitle"),
  input:       document.getElementById("teamEditInput"),
  deleteDot:   document.getElementById("teamDeleteDot"),
  deleteTitle: document.getElementById("teamDeleteTitle"),
  deleteMsg:   document.getElementById("teamDeleteMsg"),
};

function openTeamEditModal(teamId) {
  _editingTeamId                 = teamId;
  _mel.title.textContent         = `Edit ${teamId}`;
  _mel.dot.style.background      = teamColor(teamId);
  _mel.input.value               = AppState.teamNames[teamId] || "";
  _mel.editPanel.style.display   = "block";
  _mel.deletePanel.style.display = "none";
  _mel.modal.style.display       = "block";
  _mel.input.focus();
  _mel.input.select();
}

function closeTeamEditModal() {
  _mel.modal.style.display = "none";
  _editingTeamId = null;
}

function showDeletePanel(teamId) {
  const count   = teamDeskCount(teamId);
  const dayWord = count === 1 ? "desk-day" : "desk-days";
  const name    = AppState.teamNames[teamId] || teamId;
  _mel.deleteDot.style.background = teamColor(teamId);
  _mel.deleteTitle.textContent    = `Delete ${teamId} ${name}?`;
  _mel.deleteMsg.innerHTML = count > 0
    ? `This team has <strong>${count}</strong> ${dayWord} assigned across the week.`
    : `This team has no desk assignments.`;
  _mel.editPanel.style.display   = "none";
  _mel.deletePanel.style.display = "block";
}

document.getElementById("btn-team-edit-save").addEventListener("click", () => {
  const newName = _mel.input.value.trim();
  if (!newName || !_editingTeamId) return;
  renameTeam(_editingTeamId, newName);
  saveState();
  closeTeamEditModal();
  render();
});

document.getElementById("btn-team-edit-delete").addEventListener("click", () => {
  if (!_editingTeamId) return;
  showDeletePanel(_editingTeamId);
});

document.getElementById("btn-team-edit-cancel").addEventListener("click", closeTeamEditModal);

_mel.input.addEventListener("keydown", e => {
  if (e.key === "Enter")  document.getElementById("btn-team-edit-save").click();
  if (e.key === "Escape") closeTeamEditModal();
});

document.getElementById("btn-dc-unassign").addEventListener("click", () => {
  if (!_editingTeamId) return;
  deleteTeam(_editingTeamId, true);
  saveState(); closeTeamEditModal(); render();
});

document.getElementById("btn-dc-keep").addEventListener("click", () => {
  if (!_editingTeamId) return;
  deleteTeam(_editingTeamId, false);
  saveState(); closeTeamEditModal(); render();
});

document.getElementById("btn-dc-cancel").addEventListener("click", () => {
  _mel.deletePanel.style.display = "none";
  _mel.editPanel.style.display   = "block";
});

// ── Building / Floor selectors ────────────────────────────────────────────────

function populateBuildingDropdown() {
  elBuilding.innerHTML = "";
  const buildings = getBuildings();
  Object.entries(buildings).forEach(([id, bldg]) => {
    const opt = document.createElement("option");
    opt.value       = id;
    opt.textContent = bldg.label || id;
    elBuilding.appendChild(opt);
  });
}

function populateFloorDropdown(buildingId) {
  elFloor.innerHTML = "";
  const floors = getFloors(buildingId);

  if (!floors.length) {
    const opt = document.createElement("option");
    opt.value       = "";
    opt.textContent = "No floors configured";
    opt.disabled    = true;
    elFloor.appendChild(opt);
    elFloor.disabled = true;
    return;
  }

  elFloor.disabled = false;
  floors.forEach(f => {
    const opt = document.createElement("option");
    opt.value       = f.id;
    opt.textContent = f.label;
    elFloor.appendChild(opt);
  });
}

elBuilding.addEventListener("change", () => {
  const buildingId = elBuilding.value;
  populateFloorDropdown(buildingId);
  const firstFloor = getFloors(buildingId)[0];
  if (firstFloor) switchFloor(buildingId, firstFloor.id);
});

elFloor.addEventListener("change", () => {
  switchFloor(elBuilding.value, elFloor.value);
});

// ── Floor switching ───────────────────────────────────────────────────────────

function showLoading(label) {
  elFloorLoadingLabel.textContent = label;
  elFloorLoading.style.display = "flex";
}

function hideLoading() {
  elFloorLoading.style.display = "none";
}

/**
 * Full floor switch:
 *  - Saves current floor state
 *  - Resets runtime data
 *  - Updates storage key
 *  - Swaps floor plan image
 *  - Loads new SVG
 *  - Restores saved state for new floor
 *  - Re-renders
 */
function switchFloor(buildingId, floorId) {
  // Save current floor before leaving
  saveState();

  // Update active floor in buildings module
  setCurrentFloor(buildingId, floorId);
  const floor = getCurrentFloor();

  if (!floor.plan) {
    console.warn(`No plan file configured for ${buildingId} ${floorId}`);
    return;
  }

  // Derive PNG filename from SVG filename
  const pngFile = floor.plan.replace(/\.svg$/i, ".png");

  showLoading(`Loading ${floor.buildingLabel} — ${floor.floorLabel}…`);

  // Update page title and header
  const title = floorTitle();
  document.title          = title + " — Desk Planner";
  elAppTitle.textContent  = title + " — Desk Planner";

  // Swap floor plan images (single + compare panels)
  elFloorPlanImg.src  = pngFile;
  elFloorPlanImg1.src = pngFile;
  elFloorPlanImg2.src = pngFile;

  // Reset all runtime state
  resetFloorData();

  // Update storage key for the new floor
  setStorageKey(storageKey());

  // Reset compare state so it reloads with the new SVG
  resetCompare();

  // Exit compare mode if active
  if (AppState.mode === "compare") {
    elMode.value    = "single";
    AppState.mode   = "single";
    deactivateCompare();
  }

  // Destroy drag select on old SVG
  destroyDragSelect();

  // Load the new SVG
  loadSVG("svgContainer", floor.plan, () => {
    // Register all desks from the new SVG
    document.querySelectorAll("#svgContainer g[id^='desk']").forEach(el => {
      registerDesk(el.id);
    });

    // Restore saved state for this floor
    loadState();

    // Re-attach interactions
    setupDeskClicks();
    const svgEl = document.querySelector("#svgContainer svg");
    if (svgEl) initDragSelect(svgEl);

    render();
    hideLoading();
  });
}

// ── Initial boot ──────────────────────────────────────────────────────────────

async function boot() {
  try {
    const { defaultBuilding, defaultFloor } = await loadBuildings();

    // Populate selectors
    populateBuildingDropdown();
    elBuilding.value = defaultBuilding;
    populateFloorDropdown(defaultBuilding);
    if (defaultFloor) elFloor.value = defaultFloor;

    // Set storage key for the default floor
    setStorageKey(storageKey());

    // Update title
    const title = floorTitle();
    document.title         = title + " — Desk Planner";
    elAppTitle.textContent = title + " — Desk Planner";

    const floor  = getCurrentFloor();
    const pngFile = floor.plan ? floor.plan.replace(/\.svg$/i, ".png") : "";
    elFloorPlanImg.src  = pngFile;
    elFloorPlanImg1.src = pngFile;
    elFloorPlanImg2.src = pngFile;

    if (!floor.plan) {
      console.warn("No plan file for default floor — check buildings.json");
      return;
    }

    showLoading(`Loading ${title}…`);

    loadSVG("svgContainer", floor.plan, () => {
      document.querySelectorAll("#svgContainer g[id^='desk']").forEach(el => {
        registerDesk(el.id);
      });
      loadState();
      setupDeskClicks();
      const svgEl = document.querySelector("#svgContainer svg");
      if (svgEl) initDragSelect(svgEl);
      render();
      hideLoading();
    });

  } catch (err) {
    console.error("Boot failed:", err);
    hideLoading();
  }
}

boot();

// ── Desk click handling ───────────────────────────────────────────────────────

function setupDeskClicks() {
  const svgEl = document.querySelector("#svgContainer svg");
  if (!svgEl) return;

  // Clone to remove any old listeners from a previous floor's SVG
  const fresh = svgEl.cloneNode(true);
  svgEl.parentNode.replaceChild(fresh, svgEl);

  let suppressNextClick = false;

  fresh.addEventListener("mousedown", e => {
    suppressNextClick = e.shiftKey;
  });

  fresh.addEventListener("click", e => {
    if (AppState.mode === "compare") return;
    if (suppressNextClick) { suppressNextClick = false; return; }

    const desk = e.target.closest("g[id^='desk']");
    if (!desk) { clearSelection(); applyHighlight(); return; }

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
    activateCompare(getCurrentFloor().plan);
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
bind("btn-export-image",  "click", () => {
  const floor = getCurrentFloor();
  exportImage(floor.plan, floorTitle());
});

bind("btn-copy",          "click", openCopyModal);
bind("btn-undo",          "click", () => { if (undo()) render(); });
bind("btn-clear-desks",   "click", handleClearDesks);
bind("btn-clear-all",     "click", () => {
  if (!confirm("Clear all allocations and teams?")) return;
  clearAllData(); render();
});
bind("btn-reset",         "click", () => {
  if (!confirm("Reset everything? All data for this floor will be lost.")) return;
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
  btn.textContent = "🧩 Multi" + (AppState.multiMode ? " ON" : "");
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
