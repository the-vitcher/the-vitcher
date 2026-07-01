import { describe, it, expect } from 'vitest';
import { ABILITIES, MOBS, DUNGEONS, CLASSES, dungeonAt, instanceOrigin } from '../src/sim/data';
// Bespoke MOBA abilities are intentionally NOT merged into the global class ABILITIES
// table (the Sim builds hero kits from MOBA_ABILITIES directly), so they must NOT leak
// into the class ability surface that drives icons/tooltips/talents.
import { MOBA_ABILITIES, MOBA_HEROES, MOBA_HERO_IDS, MOBA_MOBS, MOBA_DUNGEON_DEFS } from '../src/sim/content/moba';
import { mobaWaveComposition } from '../src/sim/moba';

describe('MOBA content: heroes', () => {
  it('every hero references only defined abilities', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      expect(hero.abilities.length).toBeGreaterThan(0);
      for (const id of hero.abilities) {
        expect(MOBA_ABILITIES[id], `hero ${hero.id} references missing ability ${id}`).toBeDefined();
      }
    }
  });

  it('keeps bespoke abilities OUT of the global class ability table', () => {
    for (const id of Object.keys(MOBA_ABILITIES)) {
      expect(ABILITIES[id], `MOBA ability ${id} leaked into the class ABILITIES surface`).toBeUndefined();
    }
  });

  it('every hero maps to a real base class', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      expect(CLASSES[hero.baseClass], `hero ${hero.id} bad baseClass ${hero.baseClass}`).toBeDefined();
    }
  });

  it('bespoke abilities declare the base class they belong to and are self-consistent', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      for (const id of hero.abilities) {
        const ab = MOBA_ABILITIES[id];
        expect(ab.class).toBe(hero.baseClass);
        expect(ab.effects.length).toBeGreaterThan(0);
        expect(ab.name.length).toBeGreaterThan(0);
        expect(ab.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes a non-empty hero id list', () => {
    expect(MOBA_HERO_IDS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(MOBA_HERO_IDS).size).toBe(MOBA_HERO_IDS.length); // no dup ids
  });
});

describe('MOBA content: structures and minions', () => {
  it('tags every MOBA mob with a mobaRole and merges it into MOBS', () => {
    for (const [id, tpl] of Object.entries(MOBA_MOBS)) {
      expect(tpl.mobaRole, `mob ${id} missing mobaRole`).toBeDefined();
      expect(MOBS[id], `mob ${id} not merged into MOBS`).toBeDefined();
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

describe('MOBA content: the lane instance', () => {
  it('registers moba_lane in DUNGEONS at a unique x-band', () => {
    expect(DUNGEONS.moba_lane).toBeDefined();
    expect(MOBA_DUNGEON_DEFS.moba_lane.index).toBe(14);
    // No other dungeon shares this index.
    const shared = Object.values(DUNGEONS).filter((d) => d.index === 14);
    expect(shared.length).toBe(1);
  });

  it('resolves the lane by its instance x-band (not as an arena)', () => {
    const o = instanceOrigin(14, 0);
    expect(dungeonAt(o.x)?.id).toBe('moba_lane');
  });

  it('spawns two towers and one core per team, all referencing real mobs', () => {
    const spawns = DUNGEONS.moba_lane.spawns;
    expect(spawns.length).toBe(6);
    for (const s of spawns) expect(MOBS[s.mobId], `spawn ${s.mobId} not in MOBS`).toBeDefined();
    expect(spawns.filter((s) => s.mobId === 'moba_core').length).toBe(2);
    expect(spawns.filter((s) => s.mobId === 'moba_tower').length).toBe(4);
  });

  it('reuses the crypt interior for the lane', () => {
    expect(DUNGEONS.moba_lane.interior).toBe('crypt');
  });
});
