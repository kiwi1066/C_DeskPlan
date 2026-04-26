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

// ── Bulk Add Teams modal ──────────────────────────────────────────────────────

const MAX_BULK_TEAMS = 10;

function openAddTeamsModal() {
  const labelPlural   = AppState.categoryLabel || "Teams";
  const labelSingular = labelPlural.replace(/s$/i, "");
  document.getElementById("addTeamsTitle").textContent = `Add ${labelPlural}`;

  const rowsEl = document.getElementById("addTeamsRows");
  rowsEl.innerHTML = "";
  addTeamsRow(labelSingular); // start with one row

  document.getElementById("addTeamsModal").style.display = "block";
  getModalBackdrop().classList.add("active");
  updateAddTeamsCount();
  rowsEl.querySelector("input")?.focus();
}

function closeAddTeamsModal() {
  document.getElementById("addTeamsModal").style.display = "none";
  getModalBackdrop().classList.remove("active");
}

function getModalBackdrop() {
  let el = document.getElementById("modalBackdrop");
  if (!el) {
    el = document.createElement("div");
    el.id = "modalBackdrop";
    el.className = "modal-backdrop";
    document.body.appendChild(el);
  }
  return el;
}

function addTeamsRow(labelSingular) {
  const rowsEl = document.getElementById("addTeamsRows");
  if (rowsEl.children.length >= MAX_BULK_TEAMS) return;

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;";
  row.innerHTML = `
    <input type="text" class="ui-modal-input add-team-input" placeholder="${labelSingular} name" autocomplete="off" spellcheck="false" style="flex:1;">
    <button class="btn-secondary remove-row-btn" title="Remove" style="padding:6px 10px;">✕</button>
  `;
  rowsEl.appendChild(row);

  const input = row.querySelector("input");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputs = [...rowsEl.querySelectorAll("input")];
      const idx    = inputs.indexOf(input);
      if (idx === inputs.length - 1 && rowsEl.children.length < MAX_BULK_TEAMS && input.value.trim()) {
        addTeamsRow(labelSingular);
        rowsEl.lastElementChild.querySelector("input").focus();
      } else if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      } else {
        document.getElementById("btn-add-teams-create").click();
      }
    }
    if (e.key === "Escape") closeAddTeamsModal();
  });

  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    if (rowsEl.children.length > 1) {
      row.remove();
      updateAddTeamsCount();
    }
  });

  updateAddTeamsCount();
}

function updateAddTeamsCount() {
  const rowsEl   = document.getElementById("addTeamsRows");
  const countEl  = document.getElementById("addTeamsCount");
  const addBtn   = document.getElementById("btn-add-team-row");
  const n = rowsEl.children.length;
  countEl.textContent = `${n} / ${MAX_BULK_TEAMS}`;
  addBtn.disabled = n >= MAX_BULK_TEAMS;
  addBtn.style.opacity = n >= MAX_BULK_TEAMS ? "0.4" : "1";
}

function createTeamsFromModal() {
  const inputs = [...document.querySelectorAll("#addTeamsRows .add-team-input")];
  const names  = inputs.map(i => i.value.trim()).filter(n => n);
  if (!names.length) { closeAddTeamsModal(); return; }

  names.forEach(name => {
    const id = nextTeamId();
    addTeam(id, name);
  });
  saveState();
  closeAddTeamsModal();
  render();
}

function handleAddTeam() {
  openAddTeamsModal();
}

// Bind multi-add modal buttons
document.getElementById("btn-add-team-row").addEventListener("click", () => {
  const labelSingular = (AppState.categoryLabel || "Teams").replace(/s$/i, "");
  addTeamsRow(labelSingular);
  document.getElementById("addTeamsRows").lastElementChild.querySelector("input").focus();
});
document.getElementById("btn-add-teams-create").addEventListener("click", createTeamsFromModal);
document.getElementById("btn-add-teams-cancel").addEventListener("click", closeAddTeamsModal);

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


