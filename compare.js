/**
 * compare.js
 * Handles compare mode: loading two SVG instances and rendering them side-by-side.
 * Editing is disabled in compare mode.
 */

import { AppState, DAYS } from "./state.js";
import { loadSVG }        from "./io.js";
import { renderContainer } from "./render.js";

let compareLoaded = false;
let _currentPlan  = null;   // SVG filename in use when compare loaded

/**
 * Activates compare mode. svgFile is the current floor's plan filename.
 * @param {string} svgFile  e.g. "1WS_L11_deskPlan.svg"
 */
export function activateCompare(svgFile) {
  document.getElementById("mapSingle").style.display       = "none";
  document.getElementById("compareWrap").style.display     = "flex";
  document.getElementById("editControls").style.display    = "none";
  document.getElementById("compareControls").style.display = "inline-flex";

  // Reload compare SVGs if floor has changed since last time
  if (!compareLoaded || _currentPlan !== svgFile) {
    _currentPlan = svgFile;
    loadSVG("svgContainer1", svgFile, () => {
      renderContainer("svgContainer1", AppState.currentDay);
    });
    loadSVG("svgContainer2", svgFile, () => {
      renderContainer("svgContainer2", AppState.currentDay2);
      compareLoaded = true;
      updateCompareLabels();
    });
  } else {
    refreshCompare();
  }
}

/** Reset compare state — call when switching floors */
export function resetCompare() {
  compareLoaded = false;
  _currentPlan  = null;
}

export function deactivateCompare() {
  document.getElementById("mapSingle").style.display       = "block";
  document.getElementById("compareWrap").style.display     = "none";
  document.getElementById("editControls").style.display    = "block";
  document.getElementById("compareControls").style.display = "none";
}

export function refreshCompare() {
  renderContainer("svgContainer1", AppState.currentDay);
  renderContainer("svgContainer2", AppState.currentDay2);
  updateCompareLabels();
}

function updateCompareLabels() {
  const label1 = document.getElementById("compareLabel1");
  const label2 = document.getElementById("compareLabel2");
  if (label1) label1.textContent = DAYS.find(d => d.key === AppState.currentDay)?.label  || AppState.currentDay;
  if (label2) label2.textContent = DAYS.find(d => d.key === AppState.currentDay2)?.label || AppState.currentDay2;
}
