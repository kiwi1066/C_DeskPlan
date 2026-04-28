/**
 * colorPicker.js
 * Reusable swatch-grid colour picker with "Auto" checkbox + Custom swatch.
 *
 *   const picker = createColorPicker({
 *     gridEl:     document.getElementById("addTeamSwatchGrid"),
 *     autoEl:     document.getElementById("addTeamAutoColor"),
 *     onChange:   ({ auto, color }) => { ... }
 *   });
 *   picker.set({ auto: true });            // initial state
 *   picker.set({ auto: false, color: "#fc2003" });
 *   picker.get();  // → { auto, color }
 */

import { TEAM_PALETTE } from "./state.js";

export function createColorPicker({ gridEl, autoEl, onChange }) {
  let _auto  = true;
  let _color = TEAM_PALETTE[0];

  // Build swatch grid once
  gridEl.innerHTML = "";
  TEAM_PALETTE.forEach(c => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.background = c;
    btn.dataset.color = c;
    btn.title = c;
    btn.addEventListener("click", e => {
      e.preventDefault();
      _auto  = false;
      _color = c;
      autoEl.checked = false;
      refresh();
      onChange?.({ auto: _auto, color: _color });
    });
    gridEl.appendChild(btn);
  });

  // Custom colour swatch — opens hidden native picker
  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "color-swatch custom";
  custom.title = "Custom colour";
  custom.addEventListener("click", e => {
    e.preventDefault();
    const input = document.getElementById("customColorInput");
    if (!input) return;
    input.value = _color.startsWith("#") ? _color : "#000000";
    input.click();
    const handler = () => {
      _auto  = false;
      _color = input.value;
      autoEl.checked = false;
      refresh();
      onChange?.({ auto: _auto, color: _color });
      input.removeEventListener("change", handler);
    };
    input.addEventListener("change", handler);
  });
  gridEl.appendChild(custom);

  // Auto checkbox
  autoEl.addEventListener("change", () => {
    _auto = autoEl.checked;
    refresh();
    onChange?.({ auto: _auto, color: _color });
  });

  function refresh() {
    gridEl.classList.toggle("disabled", _auto);
    gridEl.querySelectorAll(".color-swatch").forEach(sw => {
      sw.classList.toggle(
        "selected",
        !_auto && sw.dataset.color &&
        sw.dataset.color.toLowerCase() === _color.toLowerCase()
      );
    });
  }

  return {
    set({ auto, color }) {
      if (color) _color = color;
      _auto = auto !== undefined ? auto : _auto;
      autoEl.checked = _auto;
      refresh();
    },
    get() {
      return { auto: _auto, color: _color };
    },
  };
}
