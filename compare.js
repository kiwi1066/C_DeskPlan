/**
 * compare.js
 * Handles compare mode: loading two SVG instances and rendering them side-by-side.
 * Editing is disabled in compare mode.
 */

import { AppState, DAYS } from "./state.js";
import { loadSVG }  from "./io.js";
import { renderContainer } from "./render.js";

let compareLoaded = false;

/**
 * Activates compare mode: shows the compare layout, hides single layout,
 * loads both SVG instances if not already loaded.
 */
export function activateCompare() {
  const mapSingle  = document.getElementById("mapSingle");
  const compareWrap = document.getElementById("compareWrap");
  const editControls = document.getElementById("editControls");
  const compareControls = document.getElementById("compareControls");

  if (mapSingle)     mapSingle.style.display     = "none";
  if (compareWrap)   compareWrap.style.display    = "flex";
  if (editControls)  editControls.style.display   = "none";
  if (compareControls) compareControls.style.display = "inline-flex";

  if (!compareLoaded) {
    loadSVG("svgContainer1", () => {
      renderContainer("svgContainer1", AppState.currentDay);
    });
    loadSVG("svgContainer2", () => {
      renderContainer("svgContainer2", AppState.currentDay2);
      compareLoaded = true;
      updateCompareLabels();
    });
  } else {
    refreshCompare();
  }
}

/**
 * Deactivates compare mode: returns to single view.
 */
export function deactivateCompare() {
  const mapSingle   = document.getElementById("mapSingle");
  const compareWrap = document.getElementById("compareWrap");
  const editControls = document.getElementById("editControls");
  const compareControls = document.getElementById("compareControls");

  if (mapSingle)     mapSingle.style.display      = "block";
  if (compareWrap)   compareWrap.style.display     = "none";
  if (editControls)  editControls.style.display    = "block";
  if (compareControls) compareControls.style.display = "none";
}

/**
 * Re-renders both compare containers with their current day selections,
 * and updates the panel day labels.
 */
export function refreshCompare() {
  renderContainer("svgContainer1", AppState.currentDay);
  renderContainer("svgContainer2", AppState.currentDay2);
  updateCompareLabels();
}

function updateCompareLabels() {
  const label1 = document.getElementById("compareLabel1");
  const label2 = document.getElementById("compareLabel2");
  if (label1) label1.textContent = DAYS.find(d => d.key === AppState.currentDay)?.label || AppState.currentDay;
  if (label2) label2.textContent = DAYS.find(d => d.key === AppState.currentDay2)?.label || AppState.currentDay2;
}
