import { describe, it, expect } from 'vitest';
import { ABILITIES, MOBS, DUNGEONS, CLASSES, dungeonAt, instanceOrigin } from '../src/sim/data';
// Bespoke MOBA abilities are intentionally NOT merged into the global class ABILITIES
// table (the Sim builds hero kits from MOBA_ABILITIES directly), so they must NOT leak
// into the class ability surface that drives icons/tooltips/talents.
import { MOBA_ABILITIES, MOBA_HEROES, MOBA_HERO_IDS, MOBA_MOBS, MOBA_DUNGEON_DEFS } from '../src/sim/content/moba';
import { mobaWaveComposition, mobaTeamForPos, mobaLaneForPos, MOBA_MAP, MOBA_JUNGLE_CAMPS } from '../src/sim/moba';
import type { MobaHeroDef } from '../src/sim/types';

describe('MOBA content: the ten heroes', () => {
  it('ships exactly ten heroes with unique ids and names', () => {
    expect(MOBA_HERO_IDS.length).toBe(10);
    expect(new Set(MOBA_HERO_IDS).size).toBe(10);
    const names = Object.values(MOBA_HEROES).map((h) => h.name);
    expect(new Set(names).size).toBe(10);
  });

  it('every hero has a unique 4-ability kit referencing only defined abilities', () => {
    const seen = new Set<string>();
    for (const hero of Object.values(MOBA_HEROES)) {
      expect(hero.abilities.length, `hero ${hero.id} kit size`).toBe(4);
      for (const id of hero.abilities) {
        expect(MOBA_ABILITIES[id], `hero ${hero.id} references missing ability ${id}`).toBeDefined();
        expect(seen.has(id), `ability ${id} shared between heroes (kits must be unique)`).toBe(false);
        seen.add(id);
      }
    }
    // every authored ability belongs to some hero (no orphans)
    expect(seen.size).toBe(Object.keys(MOBA_ABILITIES).length);
  });

  it('covers the roles and spreads across base classes', () => {
    const roles = new Set(Object.values(MOBA_HEROES).map((h) => h.role));
    for (const role of ['bruiser', 'assassin', 'marksman', 'mage', 'support'] as MobaHeroDef['role'][]) {
      expect(roles.has(role), `no hero fills the ${role} role`).toBe(true);
    }
    const classes = new Set(Object.values(MOBA_HEROES).map((h) => h.baseClass));
    expect(classes.size).toBeGreaterThanOrEqual(8); // near-full class spread => every resource type
    for (const hero of Object.values(MOBA_HEROES)) {
      expect(CLASSES[hero.baseClass], `hero ${hero.id} bad baseClass ${hero.baseClass}`).toBeDefined();
    }
  });

  it('bespoke abilities declare the base class they belong to and carry player-facing copy', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      expect(hero.blurb.length, `hero ${hero.id} blurb`).toBeGreaterThan(20);
      for (const id of hero.abilities) {
        const ab = MOBA_ABILITIES[id];
        expect(ab.class).toBe(hero.baseClass);
        expect(ab.effects.length).toBeGreaterThan(0);
        expect(ab.name.length).toBeGreaterThan(0);
        expect(ab.description.length).toBeGreaterThan(10);
      }
    }
  });

  it('keeps bespoke abilities OUT of the global class ability table', () => {
    for (const id of Object.keys(MOBA_ABILITIES)) {
      expect(ABILITIES[id], `MOBA ability ${id} leaked into the class ABILITIES surface`).toBeUndefined();
    }
  });
});

describe('MOBA content: structures and minions', () => {
  it('tags lane units with a mobaRole (neutral creeps deliberately have none) and merges all into MOBS', () => {
    for (const [id, tpl] of Object.entries(MOBA_MOBS)) {
      expect(MOBS[id], `mob ${id} not merged into MOBS`).toBeDefined();
      if (id.startsWith('moba_creep_')) {
        expect(tpl.mobaRole, `neutral creep ${id} must NOT carry a mobaRole`).toBeUndefined();
      } else {
        expect(tpl.mobaRole, `lane unit ${id} missing mobaRole`).toBeDefined();
      }
    }
  });

  it('has stationary towers/cores (moveSpeed 0) and mobile minions', () => {
    expect(MOBA_MOBS.moba_tower.mobaRole).toBe('tower');
    expect(MOBA_MOBS.moba_tower.moveSpeed).toBe(0);
    expect(MOBA_MOBS.moba_core.mobaRole).toBe('core');
    expect(MOBA_MOBS.moba_core.moveSpeed).toBe(0);
    expect(MOBA_MOBS.moba_minion_melee.mobaRole).toBe('minion');
    expect(MOBA_MOBS.moba_minion_melee.moveSpeed).toBeGreaterThan(0);
  });

  it('every wave-composition minion id exists in MOBS', () => {
    const ids = new Set([...mobaWaveComposition(1), ...mobaWaveComposition(9)]);
    for (const id of ids) expect(MOBS[id], `wave minion ${id} not in MOBS`).toBeDefined();
  });
});

describe('MOBA content: the three-lane battleground', () => {
  it('registers moba_lane in DUNGEONS at a unique x-band with the clash interior', () => {
    expect(DUNGEONS.moba_lane).toBeDefined();
    expect(DUNGEONS.moba_lane.interior).toBe('clash');
    expect(MOBA_DUNGEON_DEFS.moba_lane.index).toBe(14);
    const shared = Object.values(DUNGEONS).filter((d) => d.index === 14);
    expect(shared.length).toBe(1);
  });

  it('resolves the battleground by its instance x-band (not as an arena)', () => {
    const o = instanceOrigin(14, 0);
    expect(dungeonAt(o.x)?.id).toBe('moba_lane');
  });

  it('spawns 2 cores and 18 towers (3 per lane per team), split evenly by side', () => {
    const spawns = DUNGEONS.moba_lane.spawns;
    expect(spawns.filter((s) => s.mobId === 'moba_core').length).toBe(2);
    const towers = spawns.filter((s) => s.mobId === 'moba_tower');
    expect(towers.length).toBe(18);
    for (const team of ['A', 'B'] as const) {
      const side = towers.filter((s) => mobaTeamForPos(s.x, s.z) === team);
      expect(side.length, `team ${team} towers`).toBe(9);
      for (const lane of [0, 1, 2] as const) {
        expect(side.filter((s) => mobaLaneForPos(s.x, s.z) === lane).length, `team ${team} lane ${lane}`).toBe(3);
      }
    }
    for (const s of spawns) expect(MOBS[s.mobId], `spawn ${s.mobId} not in MOBS`).toBeDefined();
  });

  it('keeps every structure and spawn point inside the map square', () => {
    const inMap = (x: number, z: number) => Math.abs(x) <= MOBA_MAP.half && Math.abs(z) <= MOBA_MAP.half;
    for (const s of DUNGEONS.moba_lane.spawns) {
      expect(inMap(s.x, s.z), `spawn ${s.mobId} at (${s.x},${s.z}) outside the map`).toBe(true);
    }
    for (const p of [MOBA_MAP.coreA, MOBA_MAP.coreB, MOBA_MAP.heroSpawnA, MOBA_MAP.heroSpawnB, MOBA_MAP.shopA, MOBA_MAP.shopB]) {
      expect(inMap(p.x, p.z)).toBe(true);
    }
  });

  it('every jungle camp references only defined neutral creep templates', () => {
    for (const camp of MOBA_JUNGLE_CAMPS) {
      for (const mobId of camp.mobs) {
        expect(MOBA_MOBS[mobId], `camp creep ${mobId} missing from MOBA_MOBS`).toBeDefined();
        expect(MOBS[mobId], `camp creep ${mobId} not merged into MOBS`).toBeDefined();
        expect(MOBA_MOBS[mobId].mobaRole, `camp creep ${mobId} must be NEUTRAL (no mobaRole)`).toBeUndefined();
        expect(MOBA_MOBS[mobId].loot.some((l) => (l.copper ?? 0) > 0), `camp creep ${mobId} needs a gold bounty`).toBe(true);
      }
    }
  });
});
