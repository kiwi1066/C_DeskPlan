/**
 * render.js
 * All DOM rendering: floor plan colours, legend chips, summary panel.
 * Call render() whenever AppState changes.
 */

import {
  AppState,
  getSortedTeamIds,
  teamColor,
  getDaySummary,
  PALETTE_SIZE,
} from "./state.js";

// ── Floor plan colouring ──────────────────────────────────────────────────────

/**
 * Colours every desk in a given SVG container for the given day.
 * @param {string} containerId  - DOM id of the svgLayer div
 * @param {string} day          - day key e.g. "mon"
 */
export function renderContainer(containerId, day) {
  const container = document.getElementById(containerId);
  if (!container) return;

  Object.keys(AppState.deskData).forEach(deskId => {
    const desk = container.querySelector(`#${deskId}`);
    if (!desk) return;

    const shape = desk.querySelector("rect,polygon,path");
    if (!shape) return;

    const teamId = AppState.deskData[deskId][day];
    const color  = teamColor(teamId);

    // Use fill-opacity instead of transparent fill so the shape still
    // receives pointer events even when unassigned
    if (teamId) {
      shape.setAttribute("fill", color);
      shape.setAttribute("fill-opacity", "1");
    } else {
      shape.setAttribute("fill", "#000000");
      shape.setAttribute("fill-opacity", "0");
    }
    shape.setAttribute("pointer-events", "all");

    // Tooltip
    let title = shape.querySelector("title");
    if (teamId) {
      if (!title) {
        title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        shape.appendChild(title);
      }
      const name = AppState.teamNames[teamId];
      title.textContent = name ? `${teamId} — ${name}` : teamId;
    } else if (title) {
      title.remove();
    }
  });
}

// Callbacks set by app.js so render.js never imports state-mutation functions
let _onTeamClick = null;
let _onTeamEdit  = null;

export function setTeamClickHandler(fn) { _onTeamClick = fn; }
export function setTeamEditHandler(fn)  { _onTeamEdit  = fn; }

/** Renders the main (single) view */
export function render() {
  if (AppState.mode === "compare") {
    renderContainer("svgContainer1", AppState.currentDay);
    renderContainer("svgContainer2", AppState.currentDay2);
  } else {
    renderContainer("svgContainer", AppState.currentDay);
  }

  buildLegend(_onTeamClick, _onTeamEdit);
  updateSummary();
  applyHighlight();
}

// ── Selection highlight ───────────────────────────────────────────────────────

export function applyHighlight() {
  const container = document.getElementById("svgContainer");
  if (!container) return;

  container.querySelectorAll(AppState.deskSelector).forEach(deskEl => {
    const shape = deskEl.querySelector("rect,polygon,path");
    if (!shape) return;

    const selected = AppState.selectedDesks.includes(deskEl.id);
    shape.setAttribute("stroke",       selected ? "#000" : "none");
    shape.setAttribute("stroke-width", selected ? "2.5"  : "0");
    shape.style.filter  = selected ? "drop-shadow(0 0 3px rgba(0,0,0,0.5))" : "none";
    shape.style.opacity = selected ? "1" : "0.85";
  });
}

// ── Legend ────────────────────────────────────────────────────────────────────

/**
 * @param {Function} [onTeamClick]  called with (teamId) when chip label is clicked
 * @param {Function} [onTeamEdit]   called with (teamId) when edit ✏ button is clicked
 */
export function buildLegend(onTeamClick, onTeamEdit) {
  const legend = document.getElementById("legend");
  if (!legend) return;

  legend.innerHTML = "";
  const teamIds = getSortedTeamIds();

  if (!teamIds.length) {
    legend.innerHTML = `<span style="color:#999;font-size:12px;">No teams added yet.</span>`;
    return;
  }

  teamIds.forEach(teamId => {
    const color = teamColor(teamId);
    const name  = AppState.teamNames[teamId];

    const chip = document.createElement("div");
    chip.className    = "chip";
    chip.dataset.team = teamId;

    chip.innerHTML = `
      <span class="chip-dot" style="background:${color}"></span>
      <span class="chip-label" title="Assign to ${teamId} ${name}">${teamId} ${name}</span>
      <button class="chip-edit-btn" title="Rename or delete ${teamId}" aria-label="Edit team ${teamId}">✏️</button>
    `;

    // Left-click on the label area → assign
    const label = chip.querySelector(".chip-label");
    if (onTeamClick) {
      label.addEventListener("click", e => {
        e.stopPropagation();
        onTeamClick(teamId);
      });
    }

    // Click on edit button → open edit modal
    const editBtn = chip.querySelector(".chip-edit-btn");
    if (onTeamEdit) {
      editBtn.addEventListener("click", e => {
        e.stopPropagation();
        onTeamEdit(teamId);
      });
    }

    legend.appendChild(chip);
  });

  // Soft warning when palette is exceeded
  if (teamIds.length > PALETTE_SIZE) {
    const warn = document.createElement("div");
    warn.style.cssText = "width:100%;margin-top:6px;padding:6px 10px;background:#fff8ec;border-left:3px solid #f0a500;border-radius:4px;font-size:11px;color:#7a5a00;line-height:1.4;";
    warn.innerHTML = `⚠ You have ${teamIds.length} ${(AppState.categoryLabel || "teams").toLowerCase()} — colours beyond ${PALETTE_SIZE} may start to look similar.`;
    legend.appendChild(warn);
  }
}

// ── Summary panel ─────────────────────────────────────────────────────────────

export function updateSummary() {
  const el = document.getElementById("summary");
  if (!el) return;

  const { total, assigned, free, teamCounts } = getDaySummary(AppState.currentDay);
  const teamIds = getSortedTeamIds();

  let html = `
    <div class="summary-totals">
      <span><strong>${total}</strong> Total</span>
      <span><strong>${assigned}</strong> Assigned</span>
      <span><strong>${free}</strong> Free</span>
    </div>
    <div class="summary-teams">
  `;

  teamIds.forEach(t => {
    const color = teamColor(t);
    const count = teamCounts[t] || 0;
    html += `
      <span class="summary-badge" style="background:${color}">
        ${t}: ${count}
      </span>
    `;
  });

  html += `</div>`;
  el.innerHTML = html;
}
