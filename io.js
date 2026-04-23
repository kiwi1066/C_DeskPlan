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
  getSortedTeamIds,
  teamColor,
} from "./state.js";

import { render } from "./render.js";

// ── SVG loader ────────────────────────────────────────────────────────────────

/**
 * Fetches an SVG file and injects it into a container element.
 * @param {string}   containerId  - target div id
 * @param {string}   svgFile      - filename e.g. "1WS_L11_deskPlan.svg"
 * @param {Function} [callback]   - called after inject
 */
export function loadSVG(containerId, svgFile, callback) {
  fetch(svgFile)
    .then(r => r.text())
    .then(svg => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = svg;
      const svgEl = el.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("preserveAspectRatio", "xMinYMin meet");
        // Ensure all shapes receive pointer events regardless of fill/opacity
        svgEl.querySelectorAll("rect,polygon,path").forEach(shape => {
          shape.setAttribute("pointer-events", "all");
        });
      }
      if (callback) callback();
    })
    .catch(err => console.error(`Failed to load SVG (${svgFile}):`, err));
}

// ── CSV — Desk data export ────────────────────────────────────────────────────

/**
 * Shared CSV builder.
 * @param {string[]} teamIds  — which teams to include in the #teams section
 */
function buildCSV(teamIds) {
  const dayKeys = DAYS.map(d => d.key);

  // Section 1: teams manifest — label reflects current category name
  const catLabel = AppState.categoryLabel || "Teams";
  let csv = `#teams\nid,name\n`;
  csv += `#category,${catLabel}\n`;
  teamIds.forEach(id => {
    csv += `${id},${AppState.teamNames[id]}\n`;
  });

  // Section 2: desk assignments
  const nameHeaders = dayKeys.map(d => `${d}_name`).join(",");
  csv += `#data\ndesk,${dayKeys.join(",")},${nameHeaders}\n`;

  Object.keys(AppState.deskData).forEach(deskId => {
    const row   = AppState.deskData[deskId];
    const ids   = dayKeys.map(d => row[d] || "").join(",");
    const names = dayKeys.map(d => AppState.teamNames[row[d]] || "").join(",");
    csv += `${deskId},${ids},${names}\n`;
  });

  return csv;
}

function promptAndDownload(csv) {
  const fileName = prompt("Enter file name:", "desk-data");
  if (!fileName) return;
  downloadText(csv, fileName.replace(/\.csv$/i, "") + ".csv");
}

/** Export all teams — including those with no desks assigned */
export function exportCSVAllTeams() {
  const teamIds = getSortedTeamIds();
  promptAndDownload(buildCSV(teamIds));
}

/** Export only teams that have at least one desk assigned on any day */
export function exportCSVAssignedTeams() {
  const assignedIds = new Set();
  DAYS.forEach(({ key }) => {
    Object.values(AppState.deskData).forEach(v => {
      if (v[key]) assignedIds.add(v[key]);
    });
  });
  const teamIds = getSortedTeamIds().filter(id => assignedIds.has(id));
  promptAndDownload(buildCSV(teamIds));
}

// ── CSV — Desk data import ────────────────────────────────────────────────────

export function triggerImport() {
  triggerFileInput("fileInput");
}

export function handleDeskImport(file) {
  readText(file, text => {
    const lines = text.split("\n");

    // Detect new format (has #teams section) vs old format
    const hasTeamsSection = lines.some(l => l.trim() === "#teams");

    if (hasTeamsSection) {
      // ── New format: parse #teams and #data sections separately

      let section = null;
      let skipNext = false; // skip the header row after each section marker

      lines.forEach(raw => {
        const line = raw.trim().replace(/\r/g, "");
        if (!line) return;

        // Section markers
        if (line === "#teams") { section = "teams"; skipNext = true; return; }
        if (line === "#data")  { section = "data";  skipNext = true; return; }

        // Skip the header row that immediately follows each section marker
        if (skipNext) { skipNext = false; return; }

        if (section === "teams") {
          // Special metadata row — restore category label
          if (line.startsWith("#category,")) {
            const restoredLabel = line.slice("#category,".length).trim();
            if (restoredLabel) AppState.categoryLabel = restoredLabel;
            return;
          }
          const parts = line.split(",");
          if (parts.length < 2) return;
          const id   = parts[0].trim();
          const name = parts[1].trim();
          if (id && name) addTeam(id, name);
        }

        if (section === "data") {
          const cols   = line.split(",");
          const deskId = cols[0]?.trim();
          if (!deskId || !AppState.deskData[deskId]) return;
          DAYS.forEach(({ key }, i) => {
            AppState.deskData[deskId][key] = (cols[i + 1] || "").trim();
          });
        }
      });

    } else {
      // ── Old format: single section, team names in columns 6-10
      lines.slice(1).forEach(raw => {
        const cols   = raw.split(",");
        const deskId = cols[0]?.trim();
        if (!deskId || !AppState.deskData[deskId]) return;

        DAYS.forEach(({ key }, i) => {
          AppState.deskData[deskId][key] = (cols[i + 1] || "").trim();
        });

        if (cols.length >= 11) {
          DAYS.forEach(({ key }, i) => {
            const teamId   = (cols[i + 1] || "").trim();
            const teamName = (cols[i + 6] || "").trim();
            if (teamId && teamName) addTeam(teamId, teamName);
          });
        }
      });
    }

    saveState();
    render();
  });
}

// ── CSV — Teams import ────────────────────────────────────────────────────────

export function triggerTeamImport() {
  triggerFileInput("teamFileInput");
}

/**
 * @param {File}   file
 * @param {string} mode  "replace" (default) | "merge"
 */
export function handleTeamImport(file, mode = "replace") {
  readText(file, text => {
    if (mode === "replace") removeAllTeams();

    const rows = text.split("\n").slice(1); // skip header

    rows.forEach(row => {
      const parts = row.split(",");
      if (parts.length < 2) return;

      const id   = parts[0].trim().replace(/\r/g, "");
      const name = parts[1].trim().replace(/\r/g, "");

      // In merge mode, skip teams that already exist so existing IDs/colours are kept
      if (id && name) {
        if (mode === "merge" && AppState.teamNames[id]) return;
        addTeam(id, name);
      }
    });

    saveState();
    render();
  });
}

// ── Image export ──────────────────────────────────────────────────────────────

/**
 * @param {string} planFile   - PNG filename e.g. from getCurrentFloor().plan (svg, we derive png)
 * @param {string} titleText  - e.g. "1 Williams St — Level 11"
 */
export function exportImage(planFile, titleText) {
  // Derive PNG name: strip svg extension, add .png
  // Convention: the PNG shares the same base name as the SVG
  const pngFile = planFile ? planFile.replace(/\.svg$/i, ".png") : "floorPlan.png";

  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");
  const img    = new Image();
  img.src = pngFile;

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

    const floorLabel = titleText || document.title || "Desk Planner";
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
