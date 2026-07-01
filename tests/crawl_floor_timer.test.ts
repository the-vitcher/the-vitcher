import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { DUNGEONS } from '../src/sim/data';

const makeCrawl = () => new Sim({ seed: 42, playerClass: 'warrior', crawlMode: true });

describe('The Crawl: floor-collapse timer', () => {
  it('times the combat floors but not the safe guide room', () => {
    expect(DUNGEONS.crawl_floor_1.floorTimeSec).toBeGreaterThan(0);
    expect(DUNGEONS.crawl_guide_room.floorTimeSec).toBeUndefined();
  });

  it('counts down the seconds left after entering a floor', () => {
    const sim = makeCrawl();
    sim.setPlayerLevel(20);
    sim.enterDungeon('crawl_floor_1');
    const t0 = sim.floorTimeLeft();
    expect(t0).not.toBeNull();
    expect(t0!).toBeGreaterThan(0);
    expect(t0!).toBeLessThanOrEqual(DUNGEONS.crawl_floor_1.floorTimeSec!);
    for (let i = 0; i < 20 * 3; i++) sim.tick(); // 3 seconds
    expect(sim.floorTimeLeft()!).toBeLessThan(t0!);
  });

  it('has no timer in the guide room (safe room)', () => {
    const sim = makeCrawl();
    sim.enterDungeon('crawl_guide_room');
    expect(sim.floorTimeLeft()).toBeNull();
  });

  it('collapses the floor when the timer runs out, catching the player', () => {
    const sim = makeCrawl();
    sim.setPlayerLevel(20);
    sim.enterDungeon('crawl_floor_1');
    const p = sim.player;
    for (let i = 0; i < 5; i++) sim.tick(); // advance sim.time past 0
    const inst = (sim as any).instances.find(
      (i: any) => i.dungeonId === 'crawl_floor_1' && i.partyKey !== null,
    );
    expect(inst).toBeTruthy();
    inst.floorDeadline = sim.time; // expire it on the next tick
    sim.tick();
    expect(p.spectator).toBe(true); // caught by the collapse -> spectator (crawl mode)
    expect(sim.floorTimeLeft()).toBeNull(); // floor is no longer counting down
  });
});
