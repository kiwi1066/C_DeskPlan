/**
 * buildings.js
 * Fetches buildings.json and manages the active building/floor selection.
 *
 * Exposes:
 *   loadBuildings()          → fetches config, returns { buildings, defaultBuilding, defaultFloor }
 *   getCurrentFloor()        → { buildingId, buildingLabel, floorId, floorLabel, plan }
 *   setCurrentFloor(b, f)    → updates active selection
 *   getFloors(buildingId)    → array of floor objects for a building
 *   storageKey()             → "deskPlanner_{buildingId}_{floorId}" — unique per floor
 */

let _buildings = {};       // raw config from JSON
let _buildingId = null;
let _floorId    = null;

// ── Load config ───────────────────────────────────────────────────────────────

export async function loadBuildings() {
  const res = await fetch("buildings.json");
  if (!res.ok) throw new Error(`buildings.json returned HTTP ${res.status}`);
  _buildings = await res.json();

  // Pick first building and first floor as defaults
  const firstBldg  = Object.keys(_buildings)[0];
  const firstFloor = _buildings[firstBldg]?.floors?.[0]?.id ?? null;

  _buildingId = firstBldg;
  _floorId    = firstFloor;

  return {
    buildings:       _buildings,
    defaultBuilding: firstBldg,
    defaultFloor:    firstFloor,
  };
}

// ── Getters / setters ─────────────────────────────────────────────────────────

export function setCurrentFloor(buildingId, floorId) {
  _buildingId = buildingId;
  _floorId    = floorId;
}

export function getCurrentFloor() {
  const bldg  = _buildings[_buildingId] ?? {};
  const floor = (bldg.floors ?? []).find(f => f.id === _floorId) ?? null;
  return {
    buildingId:    _buildingId,
    buildingLabel: bldg.label ?? _buildingId,
    floorId:       _floorId,
    floorLabel:    floor?.label ?? _floorId ?? "",
    plan:          floor?.plan  ?? null,   // e.g. "1WS_L11_deskPlan.svg"
  };
}

export function getBuildings() {
  return _buildings;
}

export function getFloors(buildingId) {
  return _buildings[buildingId]?.floors ?? [];
}

/** Unique localStorage key for the current floor */
export function storageKey() {
  return `deskPlanner_${_buildingId}_${_floorId}`;
}

/** Human-readable title for the current floor, used in page title and export */
export function floorTitle() {
  const { buildingLabel, floorLabel } = getCurrentFloor();
  return `${buildingLabel} — ${floorLabel}`;
}
