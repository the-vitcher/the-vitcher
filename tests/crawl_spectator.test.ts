import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

const makeCrawl = () => new Sim({ seed: 42, playerClass: 'warrior', crawlMode: true });

describe('The Crawl: die once, become a spectator', () => {
  it('turns a player into a spectator on death instead of killing them', () => {
    const sim = makeCrawl();
    const p = sim.player;
    expect(!!p.spectator).toBe(false);
    (sim as any).handleDeath(p, null);
    expect(p.spectator).toBe(true);
    expect(p.dead).toBe(false); // benched, not in the graveyard/release flow
    expect(sim.isSpectator()).toBe(true);
  });

  it('makes spectators take no damage and untargetable', () => {
    const sim = makeCrawl();
    const p = sim.player;
    (sim as any).handleDeath(p, null);
    const hp = p.hp;
    (sim as any).dealDamage(null, p, 99999, false, 'physical', null, 'hit');
    expect(p.hp).toBe(hp); // immune
    expect(sim.isHostileTo({} as any, p)).toBe(false); // untargetable by anyone
  });

  it('restores spectators to play when a new run starts', () => {
    const sim = makeCrawl();
    const p = sim.player;
    (sim as any).handleDeath(p, null);
    expect(p.spectator).toBe(true);
    sim.startCrawlRun();
    expect(!!p.spectator).toBe(false);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(p.maxHp);
    expect(sim.isSpectator()).toBe(false);
  });

  it('leaves normal (non-crawl) mode untouched: death is real death', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' });
    const p = sim.player;
    (sim as any).handleDeath(p, null);
    expect(!!p.spectator).toBe(false);
    expect(p.dead).toBe(true);
  });
});
