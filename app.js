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
  setTeamColor,
  nextAutoColor,
  TEAM_PALETTE,
} from "./state.js";

import { createColorPicker } from "./colorPicker.js";

import { render as _render, applyHighlight, setTeamClickHandler, setTeamEditHandler } from "./render.js";

import {
  loadSVG,
  triggerImport,
  handleDeskImport,
  exportCSVAllTeams,
  exportCSVAssignedTeams,
  exportImage,
  setRenderCallback,
  setPromptCallback,
  setSwitchFloorCallback,
} from "./io.js";

import {
  activateCompare,
  deactivateCompare,
  refreshCompare,
  resetCompare,
} from "./compare.js";

import { initDragSelect, destroyDragSelect } from "./dragSelect.js";

import {
  initZoom,
  resetZoom,
  destroyZoom,
  zoomIn,
  zoomOut,
} from "./zoom.js";

import {
  loadBuildings,
  getBuildings,
  getFloors,
  getCurrentFloor,
  setCurrentFloor,
  storageKey,
  floorTitle,
} from "./buildings.js";

import { uiPrompt, uiConfirm } from "./modal.js";

// ── Render wrapper ────────────────────────────────────────────────────────────
// Keeps category label UI and summary visibility in sync after every render

function render() {
  _render();
  updateCategoryUI();
  applySummaryVisibility();
}

// Give io.js access to the full wrapped render so imports trigger UI updates
setRenderCallback(render);

// Give io.js access to the styled prompt modal
setPromptCallback((title, label, defaultVal) => uiPrompt(title, label, defaultVal));

// Give io.js access to switchFloor so the import floor-mismatch dialog can
// switch the app to the file's building/floor before importing
setSwitchFloorCallback((buildingId, floorId, onComplete) => {
  switchFloor(buildingId, floorId, onComplete);
});

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

  // Set picker state from current team colour
  const hasManual = !!AppState.teamColors[teamId];
  _editPicker.set({
    auto: !hasManual,
    color: AppState.teamColors[teamId] || teamColor(teamId),
  });

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

// Init edit-modal colour picker
const _editPicker = createColorPicker({
  gridEl: document.getElementById("teamEditSwatchGrid"),
  autoEl: document.getElementById("teamEditAutoColor"),
});

document.getElementById("btn-team-edit-save").addEventListener("click", () => {
  const newName = _mel.input.value.trim();
  if (!newName || !_editingTeamId) return;
  renameTeam(_editingTeamId, newName);

  // Apply colour choice
  const { auto, color } = _editPicker.get();
  setTeamColor(_editingTeamId, auto ? null : color);

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
function switchFloor(buildingId, floorId, onComplete) {
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

  loadSVG("svgContainer", floor.plan, () => {
    AppState.deskSelector = floor.deskSelector;
    document.querySelectorAll(`#svgContainer ${floor.deskSelector}`).forEach(el => {
      registerDesk(el.id);
    });
    loadState();

    // Apply category label — loaded state takes priority, then buildings.json default
    applyFloorConfig();

    const freshSvg = setupDeskClicks(floor.deskSelector);
    if (freshSvg) initDragSelect(freshSvg, floor.deskSelector);

    // Reset zoom for new floor then reinit
    initZoomForFloor();

    render();
    hideLoading();

    // Sync the dropdowns with the new floor (in case switch was triggered
    // programmatically e.g. by the import floor-mismatch dialog)
    if (elBuilding.value !== buildingId) {
      elBuilding.value = buildingId;
      populateFloorDropdown(buildingId);
    }
    if (elFloor.value !== floorId) elFloor.value = floorId;

    if (typeof onComplete === "function") onComplete();
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

    const floor   = getCurrentFloor();
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
      AppState.deskSelector = floor.deskSelector;
      document.querySelectorAll(`#svgContainer ${floor.deskSelector}`).forEach(el => {
        registerDesk(el.id);
      });
      loadState();

      // Apply category label — loaded state takes priority, then buildings.json default
      applyFloorConfig();

      const freshSvg = setupDeskClicks(floor.deskSelector);
      if (freshSvg) initDragSelect(freshSvg, floor.deskSelector);

      // Initialise zoom — viewport clips, mapBox scales
      initZoomForFloor();

      render();
      hideLoading();
    });

  } catch (err) {
    console.error("Boot failed:", err);
    hideLoading();
    // Show a visible error in the controls panel so it's not silent
    elBuilding.innerHTML = `<option disabled selected>⚠ Could not load buildings.json</option>`;
    elFloor.innerHTML    = `<option disabled selected>—</option>`;
    document.getElementById("legend").innerHTML =
      `<span style="color:#c00;font-size:12px;">
        ⚠ Failed to load buildings.json (${err.message}).
        Check the file is uploaded to your GitHub repo root.
      </span>`;
  }
}

boot();

/** Sets the map viewport height to match the natural mapBox height, then inits zoom */
function initZoomForFloor() {
  const viewport = document.getElementById("mapViewport");
  const mapBox   = document.getElementById("mapSingle");
  const img      = document.getElementById("floorPlanImg");
  if (!viewport || !mapBox) return;

  const setup = () => {
    viewport.style.height = mapBox.offsetHeight + "px";
    destroyZoom();
    initZoom(viewport, mapBox);
  };

  // If image already loaded (cached) use current size, else wait for load
  if (img && img.complete && img.naturalHeight > 0) {
    setup();
  } else if (img) {
    img.addEventListener("load", setup, { once: true });
  }
}

// ── Category label ────────────────────────────────────────────────────────────

/**
 * Called after loadState() so saved label takes priority over buildings.json default.
 * If loadState didn't restore a label, fall back to the floor config.
 */
function applyFloorConfig() {
  updateCategoryUI();
  applySummaryVisibility();
}

function updateCategoryUI() {
  const label = AppState.categoryLabel || "Teams";

  // Update section header text
  document.getElementById("categoryLabel").textContent = label;

  // Keep the hidden input in sync
  document.getElementById("categoryInput").value = label;

  // Update the Add button label — strip trailing 's' for singular
  // e.g. "Teams" → "Add Team", "Port Types" → "Add Port Type"
  const singular = label.replace(/s$/i, "");
  document.getElementById("btn-add-team").textContent = `➕ Add ${singular}`;
}

function openCategoryEdit() {
  document.getElementById("categoryEditWrap").style.display     = "flex";
  document.getElementById("categoryHeaderWrap").style.display   = "none";
  const input = document.getElementById("categoryInput");
  input.value = AppState.categoryLabel || "Teams";
  input.focus();
  input.select();
}

function saveCategoryLabel() {
  const val = document.getElementById("categoryInput").value.trim();
  if (val) {
    AppState.categoryLabel = val;
    saveState();
    updateCategoryUI();
    render();
  }
  closeCategoryEdit();
}

function closeCategoryEdit() {
  document.getElementById("categoryEditWrap").style.display   = "none";
  document.getElementById("categoryHeaderWrap").style.display = "flex";
}

// Bind category label interactions
document.getElementById("categoryLabel").addEventListener("click",      openCategoryEdit);
document.getElementById("btn-edit-category").addEventListener("click",  openCategoryEdit);
document.getElementById("btn-category-save").addEventListener("click",  saveCategoryLabel);
document.getElementById("btn-category-cancel").addEventListener("click", closeCategoryEdit);
document.getElementById("categoryInput").addEventListener("keydown", e => {
  if (e.key === "Enter")  saveCategoryLabel();
  if (e.key === "Escape") closeCategoryEdit();
});

function setupDeskClicks(deskSelector) {
  const svgEl = document.querySelector("#svgContainer svg");
  if (!svgEl) return null;

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

    const desk = e.target.closest(deskSelector);
    if (!desk) { clearSelection(); applyHighlight(); return; }

    const additive = AppState.multiMode || e.ctrlKey || e.metaKey;
    toggleDeskSelection(desk.id, additive);
    applyHighlight();
  });

  return fresh;  // return so initDragSelect gets the live node
}

// ── Mode switch ───────────────────────────────────────────────────────────────

elMode.addEventListener("change", () => {
  AppState.mode = elMode.value;
  const zoomControls = document.getElementById("zoomControls");
  const mapViewport  = document.getElementById("mapViewport");

  if (AppState.mode === "compare") {
    destroyDragSelect();
    destroyZoom();
    if (zoomControls) zoomControls.style.display = "none";
    if (mapViewport)  mapViewport.style.display  = "none";
    activateCompare(getCurrentFloor().plan);
  } else {
    deactivateCompare();
    if (zoomControls) zoomControls.style.display = "flex";
    if (mapViewport)  mapViewport.style.display  = "block";
    const freshSvg = setupDeskClicks(AppState.deskSelector);
    if (freshSvg) initDragSelect(freshSvg, AppState.deskSelector);
    // Reinit zoom on the restored single view
    initZoomForFloor();
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

bind("btn-zoom-in",    "click", zoomIn);
bind("btn-zoom-out",   "click", zoomOut);
bind("btn-zoom-reset", "click", resetZoom);
bind("btn-import",        "click", triggerImport);
bind("btn-export-all",      "click", exportCSVAllTeams);
bind("btn-export-assigned", "click", exportCSVAssignedTeams);
bind("btn-export-image",  "click", () => {
  const floor = getCurrentFloor();
  exportImage(floor.plan, floorTitle());
});

bind("btn-toggle-summary", "click", toggleSummary);

bind("btn-copy",          "click", openCopyModal);
bind("btn-undo",          "click", () => { if (undo()) render(); });
bind("btn-clear-desks",   "click", handleClearDesks);
bind("btn-clear-all",     "click", async () => {
  const ok = await uiConfirm("Clear All", "This will clear all desk assignments and remove all teams for this floor.", "Clear All", true);
  if (!ok) return;
  clearAllData(); render();
});
bind("btn-reset",         "click", async () => {
  const ok = await uiConfirm("Reset Floor", "All data for this floor will be permanently lost.", "Reset", true);
  if (!ok) return;
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

// ── Handlers ─────────────────────────────────────────────────────────────────

function toggleMultiMode() {
  AppState.multiMode = !AppState.multiMode;
  const btn = document.getElementById("btn-multi");
  btn.textContent = "🧩 Multi" + (AppState.multiMode ? " ON" : "");
  btn.classList.toggle("btn-active", AppState.multiMode);
}

// ── Multi-row Add Team builder ───────────────────────────────────────────────
//
// Up to 10 rows. Each row has [swatch][name input][× remove].
// Hovering a swatch opens a shared popover showing all palette colours +
// a custom swatch. Colours used in this batch (or already in existing teams)
// are dimmed and disabled.

const _addTeamEls = {
  modal:    document.getElementById("addTeamModal"),
  title:    document.getElementById("addTeamTitle"),
  rows:     document.getElementById("addTeamRows"),
  addRow:   document.getElementById("addTeamAddRow"),
  confirm:  document.getElementById("addTeamConfirm"),
  cancel:   document.getElementById("addTeamCancel"),
  popover:  document.getElementById("swatchPopover"),
  popGrid:  document.getElementById("swatchPopoverGrid"),
};

const MAX_ROWS = 10;

// Row state: { id, color }  — id is internal, name comes from input value
let _rows = [];
let _rowIdCounter = 0;
let _activeRowId = null;          // which row's popover is open
let _customInputHandler = null;   // for cleaning up native picker listener

function unusedPaletteColors() {
  // Colours used: existing teams + any colour already chosen in this batch
  const used = new Set();
  Object.keys(AppState.teamNames).forEach(id => {
    used.add(teamColor(id).toLowerCase());
  });
  _rows.forEach(r => used.add(r.color.toLowerCase()));
  return TEAM_PALETTE.filter(c => !used.has(c.toLowerCase()));
}

function nextUnusedColor(excludeRowId = null) {
  const used = new Set();
  Object.keys(AppState.teamNames).forEach(id => {
    used.add(teamColor(id).toLowerCase());
  });
  _rows.forEach(r => {
    if (r.id !== excludeRowId) used.add(r.color.toLowerCase());
  });
  for (const c of TEAM_PALETTE) {
    if (!used.has(c.toLowerCase())) return c;
  }
  return TEAM_PALETTE[0]; // all used — duplicate first colour
}

function renderAddTeamRows() {
  _addTeamEls.rows.innerHTML = "";
  _rows.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "add-team-row";
    rowEl.dataset.rowId = row.id;

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "row-swatch";
    swatch.style.background = row.color;
    swatch.title = "Click to choose colour";
    swatch.addEventListener("click", e => {
      e.stopPropagation();
      openSwatchPopover(row.id, swatch);
    });

    const input = document.createElement("input");
    input.type = "text";
    input.className = "row-input";
    input.placeholder = `Team ${index + 1} name`;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = row.name || "";
    input.dataset.rowId = row.id;
    input.addEventListener("input", e => { row.name = e.target.value; });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (_rows.length < MAX_ROWS && index === _rows.length - 1) {
          addNewRow();
          // Focus new input
          setTimeout(() => {
            const inputs = _addTeamEls.rows.querySelectorAll(".row-input");
            if (inputs.length) inputs[inputs.length - 1].focus();
          }, 30);
        } else {
          confirmAddTeams();
        }
      }
      if (e.key === "Escape") closeAddTeamModal();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-remove";
    remove.title = "Remove row";
    remove.textContent = "✕";
    remove.addEventListener("click", e => {
      e.stopPropagation();
      _rows = _rows.filter(r => r.id !== row.id);
      if (_rows.length === 0) addNewRow(); // always keep at least one
      renderAddTeamRows();
      updateConfirmLabel();
      updateAddRowButton();
    });

    rowEl.append(swatch, input, remove);
    _addTeamEls.rows.appendChild(rowEl);
  });
}

function addNewRow() {
  if (_rows.length >= MAX_ROWS) return;
  _rows.push({
    id: ++_rowIdCounter,
    name: "",
    color: nextUnusedColor(),
  });
  renderAddTeamRows();
  updateConfirmLabel();
  updateAddRowButton();
}

function updateAddRowButton() {
  _addTeamEls.addRow.disabled = _rows.length >= MAX_ROWS;
  _addTeamEls.addRow.textContent = _rows.length >= MAX_ROWS
    ? "Maximum 10 reached"
    : "+ Add another";
}

function updateConfirmLabel() {
  const named = _rows.filter(r => r.name.trim()).length;
  if (named === 0) {
    _addTeamEls.confirm.textContent = "Add";
    _addTeamEls.confirm.disabled = true;
  } else {
    const word = named === 1 ? "team" : "teams";
    const singular = (AppState.categoryLabel || "Teams").replace(/s$/i, "").toLowerCase();
    const plural = singular + (named === 1 ? "" : "s");
    _addTeamEls.confirm.textContent = `Add ${named} ${plural}`;
    _addTeamEls.confirm.disabled = false;
  }
}

// Re-check confirm label whenever any row input changes
_addTeamEls.rows.addEventListener("input", updateConfirmLabel);

// ── Swatch popover ────────────────────────────────────────────────────────────

function openSwatchPopover(rowId, anchorEl) {
  _activeRowId = rowId;
  buildPopoverGrid(rowId);

  // Position popover below the anchor
  const rect = anchorEl.getBoundingClientRect();
  _addTeamEls.popover.style.display = "block";
  _addTeamEls.popover.style.left = (rect.left + window.scrollX) + "px";
  _addTeamEls.popover.style.top  = (rect.bottom + window.scrollY + 4) + "px";

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("mousedown", onPopoverOutsideClick);
  }, 0);
}

function closeSwatchPopover() {
  _addTeamEls.popover.style.display = "none";
  _activeRowId = null;
  document.removeEventListener("mousedown", onPopoverOutsideClick);
}

function onPopoverOutsideClick(e) {
  if (!_addTeamEls.popover.contains(e.target)) closeSwatchPopover();
}

function buildPopoverGrid(rowId) {
  const row = _rows.find(r => r.id === rowId);
  if (!row) return;

  // Build set of used colours (existing teams + other rows in this batch)
  const used = new Set();
  Object.keys(AppState.teamNames).forEach(id => {
    used.add(teamColor(id).toLowerCase());
  });
  _rows.forEach(r => {
    if (r.id !== rowId) used.add(r.color.toLowerCase());
  });

  _addTeamEls.popGrid.innerHTML = "";

  TEAM_PALETTE.forEach(c => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "swatch-popover-cell";
    cell.style.background = c;
    cell.title = c;

    const isUsed    = used.has(c.toLowerCase());
    const isCurrent = c.toLowerCase() === row.color.toLowerCase();

    if (isUsed && !isCurrent) cell.classList.add("used");
    if (isCurrent) cell.classList.add("current");

    cell.addEventListener("click", e => {
      e.stopPropagation();
      row.color = c;
      renderAddTeamRows();
      closeSwatchPopover();
    });

    _addTeamEls.popGrid.appendChild(cell);
  });

  // Custom (rainbow) cell — always available
  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "swatch-popover-cell custom";
  custom.title = "Custom colour";
  custom.addEventListener("click", e => {
    e.stopPropagation();
    const input = document.getElementById("customColorInput");
    input.value = row.color.startsWith("#") ? row.color : "#000000";

    // Clean up any previous handler
    if (_customInputHandler) {
      input.removeEventListener("change", _customInputHandler);
    }
    _customInputHandler = () => {
      row.color = input.value;
      renderAddTeamRows();
      closeSwatchPopover();
      input.removeEventListener("change", _customInputHandler);
      _customInputHandler = null;
    };
    input.addEventListener("change", _customInputHandler);
    input.click();
  });
  _addTeamEls.popGrid.appendChild(custom);
}

// ── Modal open/close ──────────────────────────────────────────────────────────

function openAddTeamModal() {
  const singular = (AppState.categoryLabel || "Teams").replace(/s$/i, "");
  _addTeamEls.title.textContent = `Add ${singular}s`;
  _rows = [];
  addNewRow();
  _addTeamEls.modal.style.display = "block";
  document.getElementById("modalBackdrop").classList.add("active");
  setTimeout(() => {
    const firstInput = _addTeamEls.rows.querySelector(".row-input");
    if (firstInput) firstInput.focus();
  }, 30);
}

function closeAddTeamModal() {
  closeSwatchPopover();
  _addTeamEls.modal.style.display = "none";
  document.getElementById("modalBackdrop").classList.remove("active");
}

function confirmAddTeams() {
  const valid = _rows.filter(r => r.name.trim());
  if (!valid.length) return;

  valid.forEach(row => {
    const id = nextTeamId();
    // Pass the colour through — never auto since user has the swatch in front of them
    addTeam(id, row.name.trim(), row.color);
  });

  saveState();
  closeAddTeamModal();
  render();
}

_addTeamEls.confirm.addEventListener("click", confirmAddTeams);
_addTeamEls.cancel.addEventListener("click", closeAddTeamModal);
_addTeamEls.addRow.addEventListener("click", () => {
  addNewRow();
  setTimeout(() => {
    const inputs = _addTeamEls.rows.querySelectorAll(".row-input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 30);
});

function handleAddTeam() {
  openAddTeamModal();
}

async function handleClearDesks() {
  const ok = await uiConfirm(
    "Clear Desks",
    AppState.selectedDesks.length
      ? `Clear ${AppState.selectedDesks.length} selected desk${AppState.selectedDesks.length > 1 ? "s" : ""} for ${(DAYS.find(d => d.key === AppState.currentDay) || {}).label || "this day"}?`
      : `Clear all desk assignments for ${(DAYS.find(d => d.key === AppState.currentDay) || {}).label || "this day"}?`,
    "Clear",
    true
  );
  if (!ok) return;
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

// ── Summary show/hide ─────────────────────────────────────────────────────────

function summaryStorageKey() {
  // Per-floor preference stored separately from desk data
  return `deskPlannerSummary_${storageKey()}`;
}

function isSummaryVisible() {
  // Default is visible (null = never set)
  return localStorage.getItem(summaryStorageKey()) !== "hidden";
}

function applySummaryVisibility() {
  const visible = isSummaryVisible();
  const el      = document.getElementById("summary");
  const btn     = document.getElementById("btn-toggle-summary");
  if (!el || !btn) return;
  el.classList.toggle("summary-hidden", !visible);
  btn.textContent = visible ? "▲ Hide" : "▼ Show";
  btn.title       = visible ? "Hide summary" : "Show summary";
}

function toggleSummary() {
  const nowVisible = !isSummaryVisible();
  localStorage.setItem(summaryStorageKey(), nowVisible ? "visible" : "hidden");
  applySummaryVisibility();
}


