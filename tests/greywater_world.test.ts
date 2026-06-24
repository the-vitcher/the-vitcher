// Geography guard for the recreated Greywater Valley: the authored terrain bands, the
// hydrology ponds, the spine road, the ecology camps, and the quest-giver placements must
// all agree with the shared heightfield. The valley content is dormant in the live world
// tables (see greywater_choices.test.ts), so this test reads the exported content records
// directly and samples world.ts, exactly as the renderer and sim would.
import { describe, expect, it } from 'vitest';
import { groundHeight, WATER_LEVEL, GREYWATER_PONDS, greywaterPondOffset } from '../src/sim/world';
import {
  GREYWATER_NPCS, GREYWATER_CAMPS, GREYWATER_ROADS, GREYWATER_MOBS,
} from '../src/sim/content/greywater';
import { ZONE1_ZONE } from '../src/sim/content/zone1';

const SEED = 42;

describe('Greywater Valley geography', () => {
  it('every quest giver in the valley stands on dry land', () => {
    for (const npc of Object.values(GREYWATER_NPCS)) {
      const h = groundHeight(npc.pos.x, npc.pos.z, SEED);
      expect(h, `${npc.id} at ${npc.pos.x},${npc.pos.z} is underwater (${h.toFixed(2)})`)
        .toBeGreaterThan(WATER_LEVEL + 0.4);
    }
  });

  it('the spine road stays a dry causeway end to end', () => {
    // Sample each authored road point and the midpoints between them.
    for (const road of GREYWATER_ROADS) {
      for (let i = 0; i < road.length; i++) {
        const a = road[i];
        const pts = [a];
        if (i + 1 < road.length) {
          const b = road[i + 1];
          pts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        }
        for (const p of pts) {
          // Only the Greywater-side road (x>40) is reshaped by the valley terrain.
          if (p.x < 40) continue;
          const h = groundHeight(p.x, p.z, SEED);
          expect(h, `road at ${p.x.toFixed(0)},${p.z.toFixed(0)} dips underwater (${h.toFixed(2)})`)
            .toBeGreaterThan(WATER_LEVEL + 0.2);
        }
      }
    }
  });

  it('land monster camps sit on traversable ground (not deep water)', () => {
    const SWIMMERS = new Set(
      Object.values(GREYWATER_MOBS).filter((m) => m.canSwim).map((m) => m.id),
    );
    for (const camp of GREYWATER_CAMPS) {
      if (SWIMMERS.has(camp.mobId)) continue; // drowners / the hag own the water by design
      const h = groundHeight(camp.center.x, camp.center.z, SEED);
      // Fen dwellers can stand at the water's edge, but never in deep water.
      expect(h, `${camp.mobId} camp at ${camp.center.x},${camp.center.z} is too deep (${h.toFixed(2)})`)
        .toBeGreaterThan(WATER_LEVEL - 1.0);
    }
  });

  it('the carved ponds actually hold water below the waterline', () => {
    for (const p of GREYWATER_PONDS) {
      const h = groundHeight(p.x, p.z, SEED);
      expect(h, `pond at ${p.x},${p.z} is not submerged (${h.toFixed(2)})`).toBeLessThan(WATER_LEVEL);
    }
  });

  it('the pond offset is a localized, smooth depression (no cliffs, zero far away)', () => {
    // Far from any pond the offset is exactly zero (does not leak into the wider valley).
    expect(greywaterPondOffset(0, 0)).toBe(0);
    expect(greywaterPondOffset(140, 40)).toBe(0);
    // Across a pond the per-step change stays gentle enough for the terrain mesh.
    const p = GREYWATER_PONDS[0];
    for (let x = p.x - p.radius * 2; x <= p.x + p.radius * 2; x += 3) {
      const a = greywaterPondOffset(x, p.z);
      const b = greywaterPondOffset(x + 3, p.z);
      expect(Math.abs(a - b)).toBeLessThan(2.2);
    }
  });

  it('names every Greywater district on the world map', () => {
    const labels = ZONE1_ZONE.pois.map((poi) => poi.label);
    for (const want of [
      'Greywater Pass', 'Greywater Ford', 'The Drowned Fen', 'Greywater Village',
      'The Leshen Grove', "Margrave's Manor", 'The Tournament Ground', 'Greywater Mill', "The Hag's Pool",
    ]) {
      expect(labels, `missing POI label ${want}`).toContain(want);
    }
  });
});
