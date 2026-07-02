import { describe, expect, it } from 'vitest';
import {
  CLASH_MAP_COLORS, CLASH_MAP_EXTENT, clashMapPx, clashStructureDots, paintClashMapPixels,
  type ClashMapImage,
} from '../src/ui/clash_map';
import { MOBA_MAP, mobaSurfaceAt, mobaTowerPoints } from '../src/sim/moba';

function makeImage(size: number): ClashMapImage {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
}

function pixelAt(img: ClashMapImage, lx: number, lz: number): number[] {
  const p = clashMapPx(img.width, lx, lz);
  const i = (Math.round(p.y) * img.width + Math.round(p.x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

const rgb = (c: readonly number[]): number[] => [c[0], c[1], c[2]];

describe('The Clash minimap painter (pure, shared classifier)', () => {
  const img = makeImage(139);
  paintClashMapPixels(img);

  it('paints every pixel opaque', () => {
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(255);
    }
  });

  it('paints the team plazas in their team tints', () => {
    expect(mobaSurfaceAt(MOBA_MAP.heroSpawnA.x, MOBA_MAP.heroSpawnA.z)).toBe('base');
    expect(pixelAt(img, MOBA_MAP.heroSpawnA.x, MOBA_MAP.heroSpawnA.z).slice(0, 3)).toEqual(rgb(CLASH_MAP_COLORS.baseA));
    expect(pixelAt(img, MOBA_MAP.heroSpawnB.x, MOBA_MAP.heroSpawnB.z).slice(0, 3)).toEqual(rgb(CLASH_MAP_COLORS.baseB));
  });

  it('paints the mid-lane crossing at map center as lane dirt', () => {
    expect(mobaSurfaceAt(0, 0)).toBe('lane');
    expect(pixelAt(img, 0, 0).slice(0, 3)).toEqual(rgb(CLASH_MAP_COLORS.lane));
  });

  it('paints the river off the mid crossing', () => {
    expect(mobaSurfaceAt(20, -20)).toBe('river');
    expect(pixelAt(img, 20, -20).slice(0, 3)).toEqual(rgb(CLASH_MAP_COLORS.river));
  });

  it('paints open field as grass (or a stamped jungle tree)', () => {
    expect(mobaSurfaceAt(-20, 40)).toBe('field');
    const px = pixelAt(img, -20, 40).slice(0, 3);
    const ok = [CLASH_MAP_COLORS.field, CLASH_MAP_COLORS.tree, CLASH_MAP_COLORS.camp]
      .some((c) => px[0] === c[0] && px[1] === c[1] && px[2] === c[2]);
    expect(ok).toBe(true);
  });

  it('paints the apron past the walls as border', () => {
    expect(pixelAt(img, CLASH_MAP_EXTENT - 0.2, 0).slice(0, 3)).toEqual(rgb(CLASH_MAP_COLORS.border));
  });

  it('mirrors like the overworld minimap: +X (team B corner) lands map-left and map-top', () => {
    const p = clashMapPx(139, MOBA_MAP.heroSpawnB.x, MOBA_MAP.heroSpawnB.z);
    expect(p.x).toBeLessThan(15);
    expect(p.y).toBeLessThan(15);
    const q = clashMapPx(139, MOBA_MAP.heroSpawnA.x, MOBA_MAP.heroSpawnA.z);
    expect(q.x).toBeGreaterThan(124);
    expect(q.y).toBeGreaterThan(124);
  });
});

describe('The Clash minimap structure dots (liveness from the match view)', () => {
  const allAlive = {
    towersAliveA: [[true, true, true], [true, true, true], [true, true, true]],
    towersAliveB: [[true, true, true], [true, true, true], [true, true, true]],
    coreAliveA: true,
    coreAliveB: true,
  };

  it('yields all 18 towers plus both cores, inside the map', () => {
    const dots = clashStructureDots(allAlive);
    expect(dots).toHaveLength(20);
    expect(dots.filter((d) => d.kind === 'tower')).toHaveLength(18);
    expect(dots.filter((d) => d.kind === 'core')).toHaveLength(2);
    for (const d of dots) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(MOBA_MAP.half);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(MOBA_MAP.half);
      expect(d.alive).toBe(true);
    }
  });

  it('maps a dead flag to the tower at the matching geometry point', () => {
    const view = {
      ...allAlive,
      towersAliveA: [[true, true, true], [true, true, false], [true, true, true]],
    };
    const dead = clashStructureDots(view).filter((d) => !d.alive);
    expect(dead).toHaveLength(1);
    const expected = mobaTowerPoints('A', 1)[2];
    expect(dead[0].team).toBe('A');
    expect(dead[0].x).toBeCloseTo(expected.x, 6);
    expect(dead[0].z).toBeCloseTo(expected.z, 6);
  });

  it('marks a fallen core dead', () => {
    const dots = clashStructureDots({ ...allAlive, coreAliveB: false });
    const core = dots.find((d) => d.kind === 'core' && d.team === 'B');
    expect(core?.alive).toBe(false);
    expect(core?.x).toBe(MOBA_MAP.coreB.x);
  });

  it('defaults to alive when the view carries no per-tower data yet', () => {
    const dots = clashStructureDots({ towersAliveA: [], towersAliveB: [], coreAliveA: true, coreAliveB: true });
    expect(dots.filter((d) => d.kind === 'tower').every((d) => d.alive)).toBe(true);
  });
});
