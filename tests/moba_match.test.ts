import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { MOBA_HEROES } from '../src/sim/content/moba';
import { MOBA_HERO_LEVEL, MOBA_WAVE_INTERVAL_SEC, MOBA_MATCH_WARMUP_SEC, MOBA_FIRST_WAVE_SEC } from '../src/sim/moba';

const makeMobaSim = (seed = 7) => new Sim({ seed, playerClass: 'warrior', noPlayer: true, mobaMode: true, mobaTeamSize: 5 });
const kill = (sim: Sim, target: Entity, by: Entity | null) => { target.hp = 0; (sim as any).handleDeath(target, by); };
const entOf = (sim: Sim, id: number) => sim.entities.get(id)!;

describe('The Clash: match setup', () => {
  it('assigns a team, hero, and level on startMobaMatch', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Alpha');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match).toBeTruthy();
    expect(match.teams.get(pid)).toBe('A');
    const e = entOf(sim, pid);
    expect(e.mobaTeam).toBe('A');
    expect(e.level).toBe(MOBA_HERO_LEVEL);
    const meta = (sim as any).players.get(pid);
    expect(meta.mobaHeroId).toBe(Object.keys(MOBA_HEROES)[0]);
    // known abilities come from the hero kit, not the class kit
    const heroAbilities = MOBA_HEROES[meta.mobaHeroId].abilities;
    expect(meta.known.map((k: any) => k.def.id).sort()).toEqual([...heroAbilities].sort());
  });

  it('spawns 2 towers + 1 core per team, tagged by side', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('mage', 'Solo');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match.towersA.length).toBe(2);
    expect(match.towersB.length).toBe(2);
    expect(entOf(sim, match.coreA).mobaTeam).toBe('A');
    expect(entOf(sim, match.coreB).mobaTeam).toBe('B');
    for (const id of match.towersA) expect(entOf(sim, id).mobaTeam).toBe('A');
    for (const id of match.towersB) expect(entOf(sim, id).mobaTeam).toBe('B');
  });

  it('pickMobaHero swaps the ability kit and base class', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Picker');
    sim.startMobaMatch([pid]);
    sim.pickMobaHero('emberling', pid);
    const meta = (sim as any).players.get(pid);
    expect(meta.mobaHeroId).toBe('emberling');
    expect(meta.cls).toBe('mage'); // Emberling's base class
    expect(entOf(sim, pid).resourceType).toBe('mana');
  });
});

describe('The Clash: hostility and objectives', () => {
  it('makes opposite teams hostile and same team friendly', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid); // team A
    expect((sim as any).isHostileTo(hero, entOf(sim, match.coreB))).toBe(true);  // enemy core
    expect((sim as any).isHostileTo(hero, entOf(sim, match.towersB[0]))).toBe(true); // enemy tower
    expect((sim as any).isHostileTo(hero, entOf(sim, match.coreA))).toBe(false); // own core
    expect((sim as any).isHostileTo(hero, entOf(sim, match.towersA[0]))).toBe(false); // own tower
  });

  it('keeps a core invulnerable until its towers fall', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid);
    const coreB = entOf(sim, match.coreB);
    const hp0 = coreB.hp;
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBe(hp0); // invulnerable while towers stand
    for (const id of match.towersB) kill(sim, entOf(sim, id), hero);
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBeLessThan(hp0); // now vulnerable
  });

  it('declares the winner when the enemy core is destroyed', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid);
    for (const id of match.towersB) kill(sim, entOf(sim, id), hero);
    kill(sim, entOf(sim, match.coreB), hero);
    sim.tick(); // updateMobaMatch runs the win check
    expect(match.phase).toBe('ended');
    expect(match.winner).toBe('A');
  });
});

describe('The Clash: waves and respawn', () => {
  it('spawns team-tagged minion waves after warmup', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match.minionIds.size).toBe(0);
    // advance past warmup + first wave timer
    const ticks = Math.ceil((MOBA_MATCH_WARMUP_SEC + MOBA_FIRST_WAVE_SEC + 1) * 20);
    for (let i = 0; i < ticks; i++) sim.tick();
    expect(match.minionIds.size).toBeGreaterThan(0);
    // every live minion carries a team tag
    for (const id of match.minionIds) {
      const m = sim.entities.get(id);
      if (m && !m.dead) expect(m.mobaTeam === 'A' || m.mobaTeam === 'B').toBe(true);
    }
  });

  it('respawns a slain hero at its base after a timer', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const hero = entOf(sim, pid);
    kill(sim, hero, null);
    expect(hero.dead).toBe(true);
    const meta = (sim as any).players.get(pid);
    expect(meta.mobaRespawnLeft).toBeGreaterThan(0);
    // run out the respawn timer
    for (let i = 0; i < 20 * 60 && hero.dead; i++) sim.tick();
    expect(hero.dead).toBe(false);
    expect(hero.hp).toBe(hero.maxHp);
  });
});

describe('The Clash: determinism', () => {
  it('produces identical match state from the same seed', () => {
    const run = () => {
      const sim = makeMobaSim(99);
      const pid = sim.addPlayer('warrior', 'D');
      sim.startMobaMatch([pid]);
      for (let i = 0; i < 20 * 40; i++) sim.tick();
      const m = sim.mobaMatch!;
      return { minions: m.minionIds.size, wave: m.waveIndex, phase: m.phase };
    };
    expect(run()).toEqual(run());
  });
});
