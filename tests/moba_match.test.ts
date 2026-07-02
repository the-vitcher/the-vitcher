import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { createMob } from '../src/sim/entity';
import { MOBS } from '../src/sim/data';
import { MOBA_HEROES } from '../src/sim/content/moba';
import { MOBA_HERO_LEVEL, MOBA_MATCH_WARMUP_SEC, MOBA_FIRST_WAVE_SEC, mobaWaveComposition } from '../src/sim/moba';

const makeMobaSim = (seed = 7) => new Sim({ seed, playerClass: 'warrior', noPlayer: true, mobaMode: true, mobaTeamSize: 5 });
const kill = (sim: Sim, target: Entity, by: Entity | null) => { target.hp = 0; (sim as any).handleDeath(target, by); };
const entOf = (sim: Sim, id: number) => sim.entities.get(id)!;
const laneTowers = (sim: Sim, ids: number[][]): Entity[][] => ids.map((lane) => lane.map((id) => entOf(sim, id)));

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
    const heroAbilities = MOBA_HEROES[meta.mobaHeroId].abilities;
    expect(meta.known.map((k: any) => k.def.id).sort()).toEqual([...heroAbilities].sort());
  });

  it('spawns 2 towers per lane per team plus one core each, tagged by side', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('mage', 'Solo');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match.towersA.map((l) => l.length)).toEqual([2, 2, 2]);
    expect(match.towersB.map((l) => l.length)).toEqual([2, 2, 2]);
    expect(entOf(sim, match.coreA).mobaTeam).toBe('A');
    expect(entOf(sim, match.coreB).mobaTeam).toBe('B');
    for (const lane of laneTowers(sim, match.towersA)) for (const t of lane) expect(t.mobaTeam).toBe('A');
    for (const lane of laneTowers(sim, match.towersB)) for (const t of lane) expect(t.mobaTeam).toBe('B');
  });

  it('pickMobaHero swaps the ability kit and base class for every hero', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Picker');
    sim.startMobaMatch([pid]);
    const meta = (sim as any).players.get(pid);
    for (const hero of Object.values(MOBA_HEROES)) {
      sim.pickMobaHero(hero.id, pid);
      expect(meta.mobaHeroId).toBe(hero.id);
      expect(meta.cls).toBe(hero.baseClass);
      expect(meta.known.map((k: any) => k.def.id).sort()).toEqual([...hero.abilities].sort());
    }
  });
});

describe('The Clash: every hero kit casts', () => {
  it('all 40 abilities cast (or fail gracefully) without throwing, and each hero can hurt a dummy', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      const sim = makeMobaSim(11);
      const pid = sim.addPlayer(hero.baseClass, 'Tester');
      sim.startMobaMatch([pid]);
      sim.pickMobaHero(hero.id, pid);
      const p = entOf(sim, pid);
      // stand a hostile minion dummy in front of the hero
      const mob = createMob((sim as any).nextId++, MOBS.moba_minion_melee, 12, { x: p.pos.x, y: p.pos.y, z: p.pos.z + 4 });
      mob.prevPos = { ...mob.pos };
      mob.mobaTeam = 'B';
      (sim as any).addEntity(mob);
      p.facing = 0; // face +z toward the dummy
      sim.targetEntity(mob.id);
      p.resource = p.maxResource || 100;
      // Track damage per ability: a later polymorph (Naptime) fully heals its
      // victim, so a final-HP comparison would erase earlier hits.
      let damaged = false;
      let lastHp = mob.hp;
      for (const abilityId of hero.abilities) {
        expect(() => sim.castAbility(abilityId, pid), `${hero.id}/${abilityId} threw`).not.toThrow();
        for (let i = 0; i < 40; i++) sim.tick(); // let casts/channels/dots resolve
        p.resource = p.maxResource || 100; // refill so cost never gates the next cast
        if (mob.dead || mob.hp < lastHp) damaged = true;
        lastHp = mob.hp;
        if (mob.dead) break;
      }
      expect(damaged, `${hero.id} kit failed to damage the dummy`).toBe(true);
    }
  });
});

describe('The Clash: hostility and objectives', () => {
  it('makes opposite teams hostile and same team friendly', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid); // team A
    expect((sim as any).isHostileTo(hero, entOf(sim, match.coreB))).toBe(true);
    expect((sim as any).isHostileTo(hero, entOf(sim, match.towersB[0][0]))).toBe(true);
    expect((sim as any).isHostileTo(hero, entOf(sim, match.coreA))).toBe(false);
    expect((sim as any).isHostileTo(hero, entOf(sim, match.towersA[1][0]))).toBe(false);
  });

  it('keeps a core invulnerable until ONE full lane of its towers falls', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid);
    const coreB = entOf(sim, match.coreB);
    const hp0 = coreB.hp;
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBe(hp0); // all 6 towers stand
    // kill one tower in each lane: still invulnerable (no lane fully cleared)
    for (const lane of [0, 1, 2]) kill(sim, entOf(sim, match.towersB[lane][0]), hero);
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBe(hp0);
    // finish the mid lane: core opens up
    kill(sim, entOf(sim, match.towersB[1][1]), hero);
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBeLessThan(hp0);
  });

  it('declares the winner when the enemy core is destroyed', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid);
    for (const lane of match.towersB) for (const id of lane) kill(sim, entOf(sim, id), hero);
    kill(sim, entOf(sim, match.coreB), hero);
    sim.tick(); // updateMobaMatch runs the win check
    expect(match.phase).toBe('ended');
    expect(match.winner).toBe('A');
  });
});

describe('The Clash: waves and respawn', () => {
  it('spawns a team-tagged, lane-tagged wave down all three lanes per side', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match.minionIds.size).toBe(0);
    const ticks = Math.ceil((MOBA_MATCH_WARMUP_SEC + MOBA_FIRST_WAVE_SEC + 1) * 20);
    for (let i = 0; i < ticks; i++) sim.tick();
    // one wave per lane per team
    const perWave = mobaWaveComposition(1).length;
    expect(match.minionIds.size).toBe(perWave * 3 * 2);
    const lanes = { A: new Set<number>(), B: new Set<number>() };
    for (const id of match.minionIds) {
      const m = sim.entities.get(id)!;
      expect(m.mobaTeam === 'A' || m.mobaTeam === 'B').toBe(true);
      expect([0, 1, 2]).toContain(m.mobaLane);
      lanes[m.mobaTeam as 'A' | 'B'].add(m.mobaLane!);
    }
    expect(lanes.A.size).toBe(3);
    expect(lanes.B.size).toBe(3);
  });

  it('minions march down the lane toward the enemy half', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Hero');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const ticks = Math.ceil((MOBA_MATCH_WARMUP_SEC + MOBA_FIRST_WAVE_SEC + 1) * 20);
    for (let i = 0; i < ticks; i++) sim.tick();
    const before = new Map<number, number>();
    for (const id of match.minionIds) before.set(id, sim.entities.get(id)!.pos.z);
    for (let i = 0; i < 20 * 5; i++) sim.tick(); // 5 seconds of marching
    let aAdvanced = 0, bAdvanced = 0;
    for (const [id, z0] of before) {
      const m = sim.entities.get(id);
      if (!m || m.dead) continue;
      if (m.mobaTeam === 'A' && m.pos.z > z0 + 3) aAdvanced++;
      if (m.mobaTeam === 'B' && m.pos.z < z0 - 3) bAdvanced++;
    }
    expect(aAdvanced).toBeGreaterThan(0);
    expect(bAdvanced).toBeGreaterThan(0);
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
