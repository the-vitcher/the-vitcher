// The Clash minimap: pure, DOM-free core for the battleground's whole-map
// minimap. The pixel painter consumes the SAME classifier (sim/moba.ts
// mobaSurfaceAt) the renderer's ground canvas is painted from, so the minimap
// and the world can never disagree; the structure-dot model turns the
// MobaStateView tower/core liveness (never the entity list: online interest
// scope is ~120 yd, the map must show all 20 structures) into drawable dots.
// hud.ts is the thin canvas consumer.
import {
  MOBA_MAP, MOBA_JUNGLE_CAMPS, MOBA_JUNGLE_TREES, mobaSurfaceAt, mobaTeamForPos,
  mobaTowerPoints, type MobaTeam, type MobaLaneIndex,
} from '../sim/moba';
import type { MobaStateView } from '../world_api';

// Yards from map center to the painted canvas edge (a small apron past the
// walls so the border reads as a frame, not a hard crop).
export const CLASH_MAP_EXTENT = MOBA_MAP.half + 2;

// Minimal ImageData shape so the painter runs in plain Node (Vitest) too.
export interface ClashMapImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// Palette (r,g,b). Team tints match the world's base pads / HUD accents.
export const CLASH_MAP_COLORS = {
  field: [64, 104, 56],
  lane: [158, 132, 92],
  river: [56, 104, 124],
  baseA: [72, 92, 164],
  baseB: [164, 82, 72],
  tree: [38, 66, 36],
  camp: [222, 184, 88],
  border: [24, 28, 22],
} as const;

// Map-local yards -> canvas px, in the HUD minimap's mirrored convention
// (+X is map-left, +Z is map-up, exactly like the overworld minimap blit).
export function clashMapPx(sizePx: number, lx: number, lz: number): { x: number; y: number } {
  const e = CLASH_MAP_EXTENT;
  return {
    x: ((e - lx) / (2 * e)) * (sizePx - 1),
    y: ((e - lz) / (2 * e)) * (sizePx - 1),
  };
}

function put(img: ClashMapImage, px: number, py: number, c: readonly number[]): void {
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
  const i = (py * img.width + px) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = 255;
}

function stamp(img: ClashMapImage, lx: number, lz: number, c: readonly number[], radiusPx: number): void {
  const p = clashMapPx(img.width, lx, lz);
  const cx = Math.round(p.x), cy = Math.round(p.y);
  const r = Math.max(1, Math.round(radiusPx));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      put(img, cx + dx, cy + dy, c);
    }
  }
}

// Paint the whole battleground into an RGBA buffer: surface classes per pixel,
// then the jungle trees and static camp markers. Painted ONCE per session; the
// per-frame minimap pass only blits this and draws live dots on top.
export function paintClashMapPixels(img: ClashMapImage): void {
  const e = CLASH_MAP_EXTENT;
  const half = MOBA_MAP.half;
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      const lx = e - (px / (img.width - 1)) * 2 * e;
      const lz = e - (py / (img.height - 1)) * 2 * e;
      let c: readonly number[];
      if (Math.abs(lx) > half || Math.abs(lz) > half) {
        c = CLASH_MAP_COLORS.border;
      } else {
        const s = mobaSurfaceAt(lx, lz);
        if (s === 'base') c = mobaTeamForPos(lx, lz) === 'A' ? CLASH_MAP_COLORS.baseA : CLASH_MAP_COLORS.baseB;
        else if (s === 'lane') c = CLASH_MAP_COLORS.lane;
        else if (s === 'river') c = CLASH_MAP_COLORS.river;
        else c = CLASH_MAP_COLORS.field;
      }
      put(img, px, py, c);
    }
  }
  const treePx = Math.max(1, Math.round(img.width / 140));
  for (const t of MOBA_JUNGLE_TREES) stamp(img, t.x, t.z, CLASH_MAP_COLORS.tree, treePx);
  for (const camp of MOBA_JUNGLE_CAMPS) stamp(img, camp.x, camp.z, CLASH_MAP_COLORS.camp, treePx + 1);
}

// One drawable objective marker: fixed geometry position + live match state.
export interface ClashStructureDot {
  x: number; // map-local yards
  z: number;
  team: MobaTeam;
  kind: 'tower' | 'core';
  alive: boolean;
}

type ClashLiveness = Pick<MobaStateView, 'towersAliveA' | 'towersAliveB' | 'coreAliveA' | 'coreAliveB'>;

// Positions come from the shared lane geometry (tier order = MOBA_TOWER_FRACS,
// outermost first, matching the sim's tower registration); liveness comes from
// the match view so all 20 structures render regardless of interest scope.
export function clashStructureDots(view: ClashLiveness): ClashStructureDot[] {
  const out: ClashStructureDot[] = [];
  for (const team of ['A', 'B'] as MobaTeam[]) {
    const lanes = team === 'A' ? view.towersAliveA : view.towersAliveB;
    for (const lane of [0, 1, 2] as MobaLaneIndex[]) {
      const points = mobaTowerPoints(team, lane);
      for (let i = 0; i < points.length; i++) {
        out.push({ x: points[i].x, z: points[i].z, team, kind: 'tower', alive: lanes?.[lane]?.[i] ?? true });
      }
    }
    const core = team === 'A' ? MOBA_MAP.coreA : MOBA_MAP.coreB;
    out.push({ x: core.x, z: core.z, team, kind: 'core', alive: (team === 'A' ? view.coreAliveA : view.coreAliveB) ?? true });
  }
  return out;
}
