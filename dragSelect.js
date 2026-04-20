/**
 * dragSelect.js
 * Shift+drag rubber-band desk selection.
 *
 * How it works:
 *  1. User holds Shift and presses mouse button on the SVG.
 *  2. A semi-transparent rectangle is drawn in SVG coordinate space as they drag.
 *  3. On mouse-up, every desk whose bounding box intersects the rectangle is
 *     added to the selection (additive — existing selection is kept).
 *  4. If Shift is not held the drag is ignored, falling through to normal click.
 *
 * All coordinate work is done in SVG user-space via getScreenCTM() so it is
 * immune to CSS scaling, zoom, and the PNG-underlay offset.
 */

import { AppState, toggleDeskSelection } from "./state.js";
import { applyHighlight } from "./render.js";

// ── Module state ──────────────────────────────────────────────────────────────

let dragging      = false;
let startPt       = null;
let selRect       = null;
let svgEl         = null;
let _deskSelector = "g[id^='desk']";  // updated per floor

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach Shift+drag selection to an SVG element.
 * @param {SVGSVGElement} svg
 * @param {string} [deskSelector]  CSS selector for desk groups
 */
export function initDragSelect(svg, deskSelector) {
  svgEl         = svg;
  _deskSelector = deskSelector || "g[id^='desk']";

  svg.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup",   onMouseUp);
  window.addEventListener("keydown",   onKeyDown);
  window.addEventListener("keyup",     onKeyUp);
}

/**
 * Remove the drag-select listeners (e.g. when switching to compare mode).
 */
export function destroyDragSelect() {
  if (!svgEl) return;
  svgEl.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup",   onMouseUp);
  window.removeEventListener("keydown",   onKeyDown);
  window.removeEventListener("keyup",     onKeyUp);
  document.body.classList.remove("shift-held", "drag-selecting");
  cleanupRect();
  svgEl = null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onMouseDown(e) {
  // Only activate on Shift + primary mouse button
  if (!e.shiftKey || e.button !== 0) return;
  if (AppState.mode === "compare")   return;

  e.preventDefault();   // prevent text selection during drag

  dragging = true;
  document.body.classList.add("drag-selecting");
  startPt  = clientToSVG(e.clientX, e.clientY);

  // Create the selection rectangle in the SVG
  selRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  selRect.setAttribute("x",               startPt.x);
  selRect.setAttribute("y",               startPt.y);
  selRect.setAttribute("width",           0);
  selRect.setAttribute("height",          0);
  selRect.setAttribute("fill",            "rgba(20, 90, 156, 0.15)");
  selRect.setAttribute("stroke",          "#145a9c");
  selRect.setAttribute("stroke-width",    "1");
  selRect.setAttribute("stroke-dasharray","4 3");
  selRect.setAttribute("pointer-events",  "none");   // don't interfere with desk clicks
  svgEl.appendChild(selRect);
}

function onMouseMove(e) {
  if (!dragging || !selRect || !startPt) return;

  const cur = clientToSVG(e.clientX, e.clientY);

  // Build a normalised rect (handles dragging in any direction)
  const x = Math.min(startPt.x, cur.x);
  const y = Math.min(startPt.y, cur.y);
  const w = Math.abs(cur.x - startPt.x);
  const h = Math.abs(cur.y - startPt.y);

  selRect.setAttribute("x",      x);
  selRect.setAttribute("y",      y);
  selRect.setAttribute("width",  w);
  selRect.setAttribute("height", h);
}

function onMouseUp(e) {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove("drag-selecting");

  if (!selRect || !startPt) { cleanupRect(); return; }

  const cur = clientToSVG(e.clientX, e.clientY);

  // Ignore tiny accidental drags (< 6px in SVG space)
  const w = Math.abs(cur.x - startPt.x);
  const h = Math.abs(cur.y - startPt.y);
  if (w < 6 && h < 6) { cleanupRect(); return; }

  const selBox = {
    x1: Math.min(startPt.x, cur.x),
    y1: Math.min(startPt.y, cur.y),
    x2: Math.max(startPt.x, cur.x),
    y2: Math.max(startPt.y, cur.y),
  };

  // Hit-test every desk
  svgEl.querySelectorAll(_deskSelector).forEach(deskEl => {
    const shape = deskEl.querySelector("rect,polygon,path");
    if (!shape) return;

    const bb = shape.getBBox();
    const deskBox = {
      x1: bb.x,
      y1: bb.y,
      x2: bb.x + bb.width,
      y2: bb.y + bb.height,
    };

    if (intersects(selBox, deskBox)) {
      // Always additive when drag-selecting
      toggleDeskSelection(deskEl.id, true);
    }
  });

  cleanupRect();
  applyHighlight();
}

function onKeyDown(e) {
  if (e.key === "Shift") document.body.classList.add("shift-held");
}

function onKeyUp(e) {
  if (e.key === "Shift") document.body.classList.remove("shift-held");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a client (screen) coordinate to SVG user-space.
 */
function clientToSVG(clientX, clientY) {
  const pt    = svgEl.createSVGPoint();
  pt.x        = clientX;
  pt.y        = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

/**
 * Returns true if two axis-aligned bounding boxes overlap.
 */
function intersects(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 &&
         a.y1 < b.y2 && a.y2 > b.y1;
}

/**
 * Remove the drag rectangle from the SVG.
 */
function cleanupRect() {
  if (selRect && selRect.parentNode) {
    selRect.parentNode.removeChild(selRect);
  }
  selRect = null;
  startPt = null;
}
