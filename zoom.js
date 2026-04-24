/**
 * zoom.js
 * Scroll-to-zoom and click-drag pan for the floor plan.
 *
 * Strategy: the mapBox is wrapped in a clip viewport. We apply
 * CSS transform: scale + translate to the mapBox so both the PNG
 * and SVG overlay scale together. All existing SVG coordinate logic
 * (click, drag-select) is unaffected because getScreenCTM() already
 * accounts for CSS transforms.
 *
 * Public API:
 *   initZoom(viewportEl, mapBoxEl)  — attach zoom/pan to elements
 *   resetZoom()                     — return to fit view
 *   destroyZoom()                   — remove listeners
 */

// ── State ─────────────────────────────────────────────────────────────────────

let _viewport = null;
let _mapBox   = null;

let _scale    = 1;
let _tx       = 0;      // translate X (px)
let _ty       = 0;      // translate Y (px)

const MIN_SCALE = 1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.12; // per wheel tick

// Pan state
let _panning   = false;
let _panStartX = 0;
let _panStartY = 0;
let _panTxStart = 0;
let _panTyStart = 0;

// ── Public ────────────────────────────────────────────────────────────────────

export function initZoom(viewportEl, mapBoxEl) {
  _viewport = viewportEl;
  _mapBox   = mapBoxEl;

  _viewport.addEventListener("wheel",     onWheel,     { passive: false });
  _viewport.addEventListener("mousedown", onPanStart);
  window.addEventListener("mousemove",    onPanMove);
  window.addEventListener("mouseup",      onPanEnd);

  applyTransform();
}

export function resetZoom() {
  _scale = 1;
  _tx    = 0;
  _ty    = 0;
  applyTransform();
  updateZoomLabel();
}

export function destroyZoom() {
  if (!_viewport) return;
  _viewport.removeEventListener("wheel",     onWheel);
  _viewport.removeEventListener("mousedown", onPanStart);
  window.removeEventListener("mousemove",    onPanMove);
  window.removeEventListener("mouseup",      onPanEnd);
  _viewport = null;
  _mapBox   = null;
}

export function getScale() { return _scale; }

// ── Wheel zoom ────────────────────────────────────────────────────────────────

function onWheel(e) {
  e.preventDefault();

  const rect     = _viewport.getBoundingClientRect();
  const mouseX   = e.clientX - rect.left;   // cursor position within viewport
  const mouseY   = e.clientY - rect.top;

  const delta    = e.deltaY < 0 ? 1 : -1;
  const newScale = clamp(_scale + delta * ZOOM_STEP * _scale, MIN_SCALE, MAX_SCALE);

  // Zoom towards cursor: adjust translation so the point under the
  // cursor stays fixed after scaling
  const scaleRatio = newScale / _scale;
  _tx = mouseX - scaleRatio * (mouseX - _tx);
  _ty = mouseY - scaleRatio * (mouseY - _ty);
  _scale = newScale;

  clampTranslation();
  applyTransform();
  updateZoomLabel();
}

// ── Pan ───────────────────────────────────────────────────────────────────────

function onPanStart(e) {
  // Only pan on middle-mouse or when scale > 1 and not shift (shift = drag-select)
  const isMiddle = e.button === 1;
  const isPrimary = e.button === 0 && _scale > 1 && !e.shiftKey;
  if (!isMiddle && !isPrimary) return;

  // Don't start pan if the click is on a desk (let desk click handler run)
  if (e.button === 0) {
    const desk = e.target.closest("[id^='desk']");
    if (desk) return;
  }

  e.preventDefault();
  _panning    = true;
  _panStartX  = e.clientX;
  _panStartY  = e.clientY;
  _panTxStart = _tx;
  _panTyStart = _ty;
  _viewport.style.cursor = "grabbing";
}

function onPanMove(e) {
  if (!_panning) return;
  _tx = _panTxStart + (e.clientX - _panStartX);
  _ty = _panTyStart + (e.clientY - _panStartY);
  clampTranslation();
  applyTransform();
}

function onPanEnd() {
  if (!_panning) return;
  _panning = false;
  _viewport.style.cursor = _scale > 1 ? "grab" : "default";
}

// ── Zoom buttons (called from app.js) ────────────────────────────────────────

export function zoomIn() {
  const cx = _viewport.clientWidth  / 2;
  const cy = _viewport.clientHeight / 2;
  zoomAround(cx, cy, 1);
}

export function zoomOut() {
  const cx = _viewport.clientWidth  / 2;
  const cy = _viewport.clientHeight / 2;
  zoomAround(cx, cy, -1);
}

function zoomAround(cx, cy, direction) {
  const newScale   = clamp(_scale + direction * ZOOM_STEP * 3 * _scale, MIN_SCALE, MAX_SCALE);
  const scaleRatio = newScale / _scale;
  _tx    = cx - scaleRatio * (cx - _tx);
  _ty    = cy - scaleRatio * (cy - _ty);
  _scale = newScale;
  clampTranslation();
  applyTransform();
  updateZoomLabel();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyTransform() {
  if (!_mapBox) return;
  _mapBox.style.transformOrigin = "0 0";
  _mapBox.style.transform = `translate(${_tx}px, ${_ty}px) scale(${_scale})`;

  // Show grab cursor when zoomed in
  if (_viewport) {
    _viewport.style.cursor = _scale > 1 ? (_panning ? "grabbing" : "grab") : "default";
  }
}

function clampTranslation() {
  if (!_viewport || !_mapBox) return;

  const vw = _viewport.clientWidth;
  const vh = _viewport.clientHeight;
  const mw = _mapBox.clientWidth  * _scale;
  const mh = _mapBox.clientHeight * _scale;

  // Don't allow panning so far the map disappears off screen
  // At scale=1 tx/ty are always 0; at higher scales clamp to keep map visible
  const maxTx = 0;
  const minTx = Math.min(0, vw - mw);
  const maxTy = 0;
  const minTy = Math.min(0, vh - mh);

  _tx = clamp(_tx, minTx, maxTx);
  _ty = clamp(_ty, minTy, maxTy);
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function updateZoomLabel() {
  const el = document.getElementById("zoomLabel");
  if (el) el.textContent = Math.round(_scale * 100) + "%";
  // Show/hide reset button
  const btn = document.getElementById("btn-zoom-reset");
  if (btn) btn.style.display = _scale > 1.05 ? "inline-flex" : "none";
}
