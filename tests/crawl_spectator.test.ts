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

  it('glues a spectator to the live crawler they watch (camera follows)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, crawlMode: true });
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    const eb = sim.entities.get(b)!;
    eb.pos = { x: 50, y: eb.pos.y, z: 50 };
    eb.prevPos = { ...eb.pos };
    (sim as any).handleDeath(sim.entities.get(a)!, null); // Alpha dies -> spectator
    const ea = sim.entities.get(a)!;
    expect(ea.spectator).toBe(true);
    expect(ea.spectateTargetId).toBe(b); // auto-watches the live crawler
    sim.tick();
    expect(Math.round(ea.pos.x)).toBe(Math.round(eb.pos.x));
    expect(Math.round(ea.pos.z)).toBe(Math.round(eb.pos.z));
  });

  it('can view any live crawler by cycling, and auto-advances when one dies', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, crawlMode: true });
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    const c = sim.addPlayer('warrior', 'Charlie');
    (sim as any).handleDeath(sim.entities.get(a)!, null);
    const ea = sim.entities.get(a)!;
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) { seen.add(ea.spectateTargetId!); sim.spectateNext(a); }
    expect(seen.has(b) && seen.has(c)).toBe(true); // reaches every live crawler
    sim.spectate(b, a);
    expect(ea.spectateTargetId).toBe(b); // direct select by id
    (sim as any).handleDeath(sim.entities.get(b)!, null); // watched crawler dies
    sim.tick();
    expect(ea.spectateTargetId).toBe(c); // auto-advanced to the remaining live crawler
  });

  it('leaves normal (non-crawl) mode untouched: death is real death', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' });
    const p = sim.player;
    (sim as any).handleDeath(p, null);
    expect(!!p.spectator).toBe(false);
    expect(p.dead).toBe(true);
  });
});
