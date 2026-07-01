import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

const makeCrawl = () => new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, crawlMode: true });

describe('The Crawl: free-for-all PvP and the player-killer skull', () => {
  it('lets any non-party player attack any other in crawl mode', () => {
    const sim = makeCrawl();
    const ea = sim.entities.get(sim.addPlayer('warrior', 'Alpha'))!;
    const eb = sim.entities.get(sim.addPlayer('warrior', 'Bravo'))!;
    expect(sim.isHostileTo(ea, eb)).toBe(true);
    expect(sim.isHostileTo(eb, ea)).toBe(true);
  });

  it('spares party members so grouping still works', () => {
    const sim = makeCrawl();
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    sim.partyInvite(b, a); // Alpha invites Bravo
    sim.partyAccept(b);    // Bravo accepts
    expect(sim.isHostileTo(sim.entities.get(a)!, sim.entities.get(b)!)).toBe(false);
  });

  it('brands the killer with the red player-killer flag on a kill', () => {
    const sim = makeCrawl();
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    (sim as any).handleDeath(sim.entities.get(b)!, sim.entities.get(a)!); // Alpha kills Bravo
    expect(sim.entities.get(a)!.playerKiller).toBe(true);
    expect((sim as any).players.get(a).playerKills).toBe(1);
  });

  it('does not enable PvP outside crawl mode', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const ea = sim.entities.get(sim.addPlayer('warrior', 'Alpha'))!;
    const eb = sim.entities.get(sim.addPlayer('warrior', 'Bravo'))!;
    expect(sim.isHostileTo(ea, eb)).toBe(false);
  });

  it('clears the player-killer brand when a new run starts', () => {
    const sim = makeCrawl();
    const a = sim.addPlayer('warrior', 'Alpha');
    const b = sim.addPlayer('warrior', 'Bravo');
    (sim as any).handleDeath(sim.entities.get(b)!, sim.entities.get(a)!);
    expect(sim.entities.get(a)!.playerKiller).toBe(true);
    sim.startCrawlRun();
    expect(!!sim.entities.get(a)!.playerKiller).toBe(false);
    expect((sim as any).players.get(a).playerKills).toBe(0);
  });
});
