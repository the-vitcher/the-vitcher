import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { DUNGEONS, DUNGEON_LIST, DUNGEON_X_THRESHOLD, MOBS, dungeonAt } from '../src/sim/data';
import { THE_CRAWL_FLOOR_IDS } from '../src/sim/content/the_crawl';

const SEED = 20061;
const FLOOR_COUNT = 7;

function makeSim() {
  return new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true });
}

describe('The Crawl: a descending dungeon-crawl scenario', () => {
  it('registers a 7-floor chain on contiguous instance x-bands clear of the arena', () => {
    expect(THE_CRAWL_FLOOR_IDS).toHaveLength(FLOOR_COUNT);
    for (let i = 0; i < FLOOR_COUNT; i++) {
      const d = DUNGEONS[`crawl_floor_${i + 1}`];
      expect(d, `floor ${i + 1} is registered`).toBeTruthy();
      expect(d.index).toBe(6 + i); // 6..12 -> instanceOrigin x 4500..8100
      expect(d.interior).toBe('crypt');
    }
    // Indices stay unique across every dungeon (the engine maps x-band -> index).
    const indices = DUNGEON_LIST.map((d) => d.index);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('only opens one surface portal; deeper floors are reached by stairs', () => {
    expect(DUNGEONS.crawl_floor_1.overworldDoor).toBe(true);
    for (let i = 2; i <= FLOOR_COUNT; i++) {
      expect(DUNGEONS[`crawl_floor_${i}`].overworldDoor).toBe(false);
    }
  });

  it('links each floor to the next with a Stairway Down, and the last has none', () => {
    for (let i = 1; i < FLOOR_COUNT; i++) {
      const stairs = (DUNGEONS[`crawl_floor_${i}`].objects ?? []).find(
        (o) => o.templateId === 'dungeon_door',
      );
      expect(stairs, `floor ${i} has a stairway down`).toBeTruthy();
      expect(stairs!.dungeonId).toBe(`crawl_floor_${i + 1}`);
    }
    const last = DUNGEONS[`crawl_floor_${FLOOR_COUNT}`].objects ?? [];
    expect(last.some((o) => o.templateId === 'dungeon_door')).toBe(false);
  });

  it('every floor spawns valid, escalating-level encounters', () => {
    let prevBossLevel = 0;
    for (let i = 1; i <= FLOOR_COUNT; i++) {
      const d = DUNGEONS[`crawl_floor_${i}`];
      expect(d.spawns.length).toBeGreaterThan(0);
      for (const s of d.spawns) {
        expect(MOBS[s.mobId], `${d.id}: spawn ${s.mobId} exists`).toBeTruthy();
      }
      // The boss occupies the dais slot (z 98); its level band rises each floor.
      const boss = d.spawns.find((s) => s.z === 98)!;
      const bossLevel = MOBS[boss.mobId].minLevel;
      expect(bossLevel, `${d.id} boss is no easier than the floor above`).toBeGreaterThanOrEqual(prevBossLevel);
      prevBossLevel = bossLevel;
    }
    // The descent really spans the level curve: Floor 1 boss is low, Floor 7 is the cap.
    expect(MOBS[DUNGEONS.crawl_floor_1.spawns.find((s) => s.z === 98)!.mobId].minLevel).toBeLessThan(10);
    expect(MOBS[DUNGEONS.crawl_floor_7.spawns.find((s) => s.z === 98)!.mobId].minLevel).toBe(20);
  });

  it('lets a crawler enter Floor 1 and descend the chain to the next instance', () => {
    const sim = makeSim();
    sim.tick();

    sim.enterDungeon('crawl_floor_1');
    let p = sim.player;
    expect(p.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(dungeonAt(p.pos.x)?.id).toBe('crawl_floor_1');

    // Floor 1 populated its instance with hostile encounters.
    const floor1Mobs = [...sim.entities.values()].filter(
      (e) => e.kind === 'mob' && e.spawnPos.x > DUNGEON_X_THRESHOLD,
    );
    expect(floor1Mobs.length).toBeGreaterThan(0);
    expect(floor1Mobs.every((m) => m.hostile)).toBe(true);

    // Take the stairs down: entering Floor 2 moves the crawler into Floor 2's band.
    sim.enterDungeon('crawl_floor_2');
    p = sim.player;
    expect(dungeonAt(p.pos.x)?.id).toBe('crawl_floor_2');
  });
});
