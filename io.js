/**
 * io.js
 * All file I/O: CSV import/export for desks and teams, image export.
 * Also handles the SVG loader used to initialise floor plan containers.
 */

import {
  AppState,
  DAYS,
  addTeam,
  removeAllTeams,
  saveState,
  registerDesk,
  getSortedTeamIds,
  teamColor,
} from "./state.js";

import { render, buildLegend } from "./render.js";

// ── SVG loader ────────────────────────────────────────────────────────────────

/**
 * Fetches deskPlan.svg and injects it into a container element.
 * @param {string}   containerId  - target div id
 * @param {Function} [callback]   - called after inject
 */
export function loadSVG(containerId, callback) {
  fetch("deskPlan.svg")
    .then(r => r.text())
    .then(svg => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = svg;
      const svgEl = el.querySelector("svg");
      if (svgEl) svgEl.setAttribute("preserveAspectRatio", "xMinYMin meet");
      if (callback) callback();
    })
    .catch(err => console.error("Failed to load SVG:", err));
}

// ── CSV — Desk data export ────────────────────────────────────────────────────

export function exportCSV() {
  const fileName = prompt("Enter file name:", "desk-data");
  if (!fileName) return;

  const dayKeys   = DAYS.map(d => d.key);
  const dayLabels = DAYS.map(d => d.key);

  // header: desk, mon, tue, wed, thu, fri, mon_name, tue_name …
  const nameHeaders = dayLabels.map(d => `${d}_name`).join(",");
  let csv = `desk,${dayLabels.join(",")},${nameHeaders}\n`;

  Object.keys(AppState.deskData).forEach(deskId => {
    const row      = AppState.deskData[deskId];
    const ids      = dayKeys.map(d => row[d] || "").join(",");
    const names    = dayKeys.map(d => AppState.teamNames[row[d]] || "").join(",");
    csv += `${deskId},${ids},${names}\n`;
  });

  downloadText(csv, fileName.replace(/\.csv$/i, "") + ".csv");
}

// ── CSV — Desk data import ────────────────────────────────────────────────────

export function triggerImport() {
  triggerFileInput("fileInput");
}

export function handleDeskImport(file) {
  readText(file, text => {
    const rows = text.split("\n").slice(1); // skip header

    rows.forEach(row => {
      const cols = row.split(",");
      const deskId = cols[0]?.trim();
      if (!deskId || !AppState.deskData[deskId]) return;

      // Columns 1-5: team IDs per day
      DAYS.forEach(({ key }, i) => {
        AppState.deskData[deskId][key] = (cols[i + 1] || "").trim();
      });

      // Columns 6-10: team names per day (optional, from older exports)
      if (cols.length >= 11) {
        DAYS.forEach(({ key }, i) => {
          const teamId   = (cols[i + 1] || "").trim();
          const teamName = (cols[i + 6] || "").trim();
          if (teamId && teamName) addTeam(teamId, teamName);
        });
      }
    });

    saveState();
    render();
  });
}

// ── CSV — Teams import ────────────────────────────────────────────────────────

export function triggerTeamImport() {
  triggerFileInput("teamFileInput");
}

export function handleTeamImport(file) {
  readText(file, text => {
    removeAllTeams();
    const rows = text.split("\n").slice(1); // skip header

    rows.forEach(row => {
      const parts = row.split(",");
      if (parts.length < 2) return;

      const id   = parts[0].trim().replace(/\r/g, "");
      const name = parts[1].trim().replace(/\r/g, "");
      if (id && name) addTeam(id, name);
    });

    saveState();
    buildLegend();
    render();
  });
}

// ── Image export ──────────────────────────────────────────────────────────────

export function exportImage() {
  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");
  const img    = new Image();
  img.src = "floorPlan.png";

  img.onload = () => {
    const { width, height } = img;
    const bannerH  = 70;
    const summaryH = 200;

    canvas.width  = width;
    canvas.height = height + bannerH + summaryH;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header banner
    ctx.fillStyle = "#0b3c66";
    ctx.fillRect(0, 0, width, bannerH);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";

    const floorLabel = document.title || "Desk Planner";
    const dayLabel   = DAYS.find(d => d.key === AppState.currentDay)?.label || "";

    ctx.font = "bold 26px Segoe UI";
    ctx.fillText(floorLabel, width / 2, 30);
    ctx.font = "16px Segoe UI";
    ctx.fillText(dayLabel, width / 2, 55);

    // Floor plan image
    ctx.drawImage(img, 0, bannerH);

    // SVG overlay
    const svg     = document.querySelector("#svgContainer svg");
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml" });
    const url     = URL.createObjectURL(svgBlob);
    const svgImg  = new Image();

    svgImg.onload = () => {
      ctx.drawImage(svgImg, 0, bannerH);
      URL.revokeObjectURL(url);

      // Summary section
      const { teamCounts } = getDaySummaryForExport();
      const teamIds   = getSortedTeamIds();
      let y           = bannerH + height + 40;

      ctx.fillStyle = "#000";
      ctx.textAlign = "center";
      ctx.font = "bold 18px Segoe UI";
      ctx.fillText("Desk Allocation Summary", width / 2, y);
      y += 30;

      ctx.font = "14px Segoe UI";
      const perRow   = Math.max(1, Math.floor(width / 260));
      const colWidth = width / perRow;

      teamIds.forEach((t, i) => {
        const col   = i % perRow;
        const row   = Math.floor(i / perRow);
        const x     = col * colWidth + 20;
        const lineY = y + row * 26;
        const color = teamColor(t);

        ctx.beginPath();
        ctx.arc(x + 8, lineY - 6, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.textAlign = "left";
        ctx.fillText(
          `${t} ${AppState.teamNames[t] || ""}: ${teamCounts[t] || 0}`,
          x + 20,
          lineY
        );
      });

      downloadBlob(canvas.toDataURL(), "desk-plan.png");
    };

    svgImg.src = url;
  };
}

// Internal helper — avoids importing getDaySummary twice
function getDaySummaryForExport() {
  const d          = AppState.currentDay;
  const teamCounts = {};
  Object.values(AppState.deskData).forEach(v => {
    if (v[d]) teamCounts[v[d]] = (teamCounts[v[d]] || 0) + 1;
  });
  return { teamCounts };
}

// ── File input helpers ────────────────────────────────────────────────────────

function triggerFileInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = "";
  el.click();
}

function readText(file, callback) {
  const reader = new FileReader();
  reader.onload = e => callback(e.target.result);
  reader.readAsText(file);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/csv" });
  downloadBlob(URL.createObjectURL(blob), filename);
}

function downloadBlob(href, filename) {
  const a    = document.createElement("a");
  a.href     = href;
  a.download = filename;
  a.click();
}
