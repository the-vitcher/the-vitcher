import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { createMob } from '../src/sim/entity';
import { MOBS } from '../src/sim/data';
import { MOBA_HEROES } from '../src/sim/content/moba';
import { MOBA_HERO_LEVEL, MOBA_MATCH_WARMUP_SEC, MOBA_FIRST_WAVE_SEC, MOBA_MINION_XP_PCT, mobaWaveComposition } from '../src/sim/moba';
import { xpForLevel } from '../src/sim/types';

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
    // DotA-style: nothing is learned at seat; one skill point waits to be spent.
    expect(meta.known.length).toBe(0);
    expect(meta.mobaSkillPoints).toBe(1);
  });

  it('spawns 3 towers per lane per team plus one core each, tagged by side', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('mage', 'Solo');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    expect(match.towersA.map((l) => l.length)).toEqual([3, 3, 3]);
    expect(match.towersB.map((l) => l.length)).toEqual([3, 3, 3]);
    expect(entOf(sim, match.coreA).mobaTeam).toBe('A');
    expect(entOf(sim, match.coreB).mobaTeam).toBe('B');
    for (const lane of laneTowers(sim, match.towersA)) for (const t of lane) expect(t.mobaTeam).toBe('A');
    for (const lane of laneTowers(sim, match.towersB)) for (const t of lane) expect(t.mobaTeam).toBe('B');
  });

  it('pickMobaHero swaps the base class and resets skill choices for every hero', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Picker');
    sim.startMobaMatch([pid]);
    const meta = (sim as any).players.get(pid);
    for (const hero of Object.values(MOBA_HEROES)) {
      sim.pickMobaHero(hero.id, pid);
      expect(meta.mobaHeroId).toBe(hero.id);
      expect(meta.cls).toBe(hero.baseClass);
      expect(meta.known.length).toBe(0); // fresh hero, nothing learned yet
      expect(meta.mobaSkillPoints).toBe(1);
    }
  });
});

describe('The Clash: DotA-style ability leveling', () => {
  const seat = (heroId = 'snacko') => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Learner');
    sim.startMobaMatch([pid]);
    sim.pickMobaHero(heroId, pid);
    const meta = (sim as any).players.get(pid);
    const hero = entOf(sim, pid);
    return { sim, pid, meta, hero };
  };

  it('spends the level-1 point to learn one basic ability', () => {
    const { sim, pid, meta } = seat();
    const basic = MOBA_HEROES.snacko.abilities[0];
    sim.mobaLearnAbility(basic, pid);
    expect(meta.mobaSkillPoints).toBe(0);
    expect(meta.known.map((k: any) => k.def.id)).toEqual([basic]);
    expect(meta.known[0].rank).toBe(1);
    sim.mobaLearnAbility(MOBA_HEROES.snacko.abilities[1], pid); // no points left
    expect(meta.known.length).toBe(1);
  });

  it('upgrading a rank makes the ability measurably stronger, capped at rank 3', () => {
    const { sim, pid, meta } = seat('zapp');
    const quiz = 'moba_pop_quiz';
    meta.mobaSkillPoints = 5;
    sim.mobaLearnAbility(quiz, pid);
    const r1 = meta.known.find((k: any) => k.def.id === quiz)!.effects[0];
    sim.mobaLearnAbility(quiz, pid);
    const r2 = meta.known.find((k: any) => k.def.id === quiz)!.effects[0];
    sim.mobaLearnAbility(quiz, pid);
    const r3 = meta.known.find((k: any) => k.def.id === quiz)!.effects[0];
    expect(r2.min).toBeGreaterThan(r1.min);
    expect(r3.min).toBeGreaterThan(r2.min);
    expect(meta.known.find((k: any) => k.def.id === quiz)!.rank).toBe(3);
    sim.mobaLearnAbility(quiz, pid); // rank 3 is the cap
    expect(meta.known.find((k: any) => k.def.id === quiz)!.rank).toBe(3);
    expect(meta.mobaSkillPoints).toBe(2); // capped attempt spent nothing
  });

  it('locks the ultimate until hero level 6', () => {
    const { sim, pid, meta, hero } = seat('moth_larry');
    const ult = MOBA_HEROES.moth_larry.abilities[3]; // L A M P
    meta.mobaSkillPoints = 3;
    sim.mobaLearnAbility(ult, pid);
    expect(meta.known.length).toBe(0); // too low level
    hero.level = 6;
    sim.mobaLearnAbility(ult, pid);
    expect(meta.known.map((k: any) => k.def.id)).toEqual([ult]);
    sim.mobaLearnAbility(ult, pid); // single-rank ultimate
    expect(meta.known.find((k: any) => k.def.id === ult)!.rank).toBe(1);
  });

  it('leveling up grants a skill point and keeps learned ranks', () => {
    const { sim, pid, meta, hero } = seat();
    const basic = MOBA_HEROES.snacko.abilities[0];
    sim.mobaLearnAbility(basic, pid);
    expect(meta.mobaSkillPoints).toBe(0);
    const lvl0 = hero.level;
    (sim as any).grantXp(xpForLevel(hero.level), meta, { fromKill: true });
    expect(hero.level).toBe(lvl0 + 1);
    expect(meta.mobaSkillPoints).toBe(1);
    expect(meta.known.map((k: any) => k.def.id)).toEqual([basic]); // kit survives the level-up
  });

  it('minion kills pay turbo XP (a fixed fraction of the level requirement)', () => {
    const { sim, pid, meta, hero } = seat();
    const minion = createMob((sim as any).nextId++, MOBS.moba_minion_melee, 3, { x: hero.pos.x, y: hero.pos.y, z: hero.pos.z + 3 });
    minion.prevPos = { ...minion.pos };
    minion.mobaTeam = 'B';
    (sim as any).addEntity(minion);
    const xpBefore = meta.xp;
    kill(sim, minion, hero);
    const expected = Math.round(xpForLevel(hero.level) * MOBA_MINION_XP_PCT);
    expect(meta.xp - xpBefore).toBe(expected);
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
      const meta = (sim as any).players.get(pid);
      // learn the full kit (level to 6 for the ultimate, grant enough points)
      p.level = 6;
      meta.mobaSkillPoints = hero.abilities.length;
      for (const abilityId of hero.abilities) sim.mobaLearnAbility(abilityId, pid);
      expect(meta.known.length, `${hero.id} full kit learned`).toBe(hero.abilities.length);
      // stand a hostile minion dummy in front of the hero
      const mob = createMob((sim as any).nextId++, MOBS.moba_minion_melee, 3, { x: p.pos.x, y: p.pos.y, z: p.pos.z + 4 });
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
    expect(coreB.hp).toBe(hp0); // all 9 towers stand
    // kill two towers in each lane: still invulnerable (no lane fully cleared)
    for (const lane of [0, 1, 2]) {
      kill(sim, entOf(sim, match.towersB[lane][0]), hero);
      kill(sim, entOf(sim, match.towersB[lane][1]), hero);
    }
    (sim as any).dealDamage(hero, coreB, 500, false, 'physical', null, 'hit');
    expect(coreB.hp).toBe(hp0);
    // finish the mid lane: core opens up
    kill(sim, entOf(sim, match.towersB[1][2]), hero);
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

describe('The Clash: gold economy', () => {
  it('pays minion bounty gold instantly on the kill, no looting required', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Farmer');
    sim.startMobaMatch([pid]);
    const hero = entOf(sim, pid);
    const meta = (sim as any).players.get(pid);
    const minion = createMob((sim as any).nextId++, MOBS.moba_minion_melee, 12, { x: hero.pos.x, y: hero.pos.y, z: hero.pos.z + 3 });
    minion.prevPos = { ...minion.pos };
    minion.mobaTeam = 'B';
    (sim as any).addEntity(minion);
    const before = meta.copper;
    kill(sim, minion, hero);
    expect(meta.copper).toBeGreaterThan(before); // paid on the spot
    expect(minion.lootable).toBe(false); // nothing left to click
  });

  it('pays a tower bounty to the last-hitter', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Sieger');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const hero = entOf(sim, pid);
    const meta = (sim as any).players.get(pid);
    const before = meta.copper;
    const tower = entOf(sim, match.towersB[1][0]);
    tower.tappedById = pid;
    kill(sim, tower, hero);
    expect(meta.copper - before).toBeGreaterThanOrEqual(200);
  });

  it('pays hero-kill gold to the killing enemy hero', () => {
    const sim = makeMobaSim();
    const a = sim.addPlayer('warrior', 'Hunter');
    const b = sim.addPlayer('mage', 'Prey');
    sim.startMobaMatch([a, b]);
    const killer = entOf(sim, a);
    const victim = entOf(sim, b);
    expect(killer.mobaTeam).not.toBe(victim.mobaTeam);
    const km = (sim as any).players.get(a);
    const before = km.copper;
    kill(sim, victim, killer);
    expect(km.copper).toBeGreaterThan(before);
    expect(km.playerKills).toBe(1);
  });

  it('lane XP levels a hero up WITHOUT clobbering the hero ability kit', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Leveler');
    sim.startMobaMatch([pid]);
    sim.pickMobaHero('snacko', pid);
    const hero = entOf(sim, pid);
    const meta = (sim as any).players.get(pid);
    sim.mobaLearnAbility(MOBA_HEROES.snacko.abilities[0], pid);
    const lvl0 = hero.level;
    (sim as any).grantXp(50000, meta, { fromKill: true }); // enough to level several times
    expect(hero.level).toBeGreaterThan(lvl0);
    // still the hero's kit (learned slice), not the warrior class kit
    expect(meta.known.map((k: any) => k.def.id)).toEqual([MOBA_HEROES.snacko.abilities[0]]);
  });
});

describe('The Clash: recall', () => {
  const setupAway = () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Homesick');
    sim.startMobaMatch([pid]);
    const hero = entOf(sim, pid);
    const meta = (sim as any).players.get(pid);
    const homeZ = hero.pos.z;
    // walk the hero out into the lane
    hero.pos = { ...hero.pos, z: hero.pos.z + 40 };
    hero.prevPos = { ...hero.pos };
    (sim as any).rebucket(hero);
    return { sim, pid, hero, meta, homeZ };
  };

  it('channels for the full duration then ports home, healed', () => {
    const { sim, pid, hero, meta, homeZ } = setupAway();
    hero.hp = Math.round(hero.maxHp / 2);
    sim.mobaRecall(pid);
    expect(meta.mobaRecallLeft).toBeGreaterThan(0);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    expect(Math.abs(hero.pos.z - homeZ)).toBeLessThan(3); // back at the base pad
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('is interrupted by taking a hit, and the cooldown still applies', () => {
    const { sim, pid, hero, meta } = setupAway();
    const startZ = hero.pos.z;
    sim.mobaRecall(pid);
    for (let i = 0; i < 20; i++) sim.tick(); // 1s into the channel
    (sim as any).dealDamage(null, hero, 5, false, 'physical', null, 'hit');
    expect(meta.mobaRecallLeft).toBe(0);
    for (let i = 0; i < 20 * 8; i++) sim.tick();
    expect(hero.pos.z).toBeCloseTo(startZ, 0); // never ported
    sim.mobaRecall(pid); // still on cooldown (stamped at start)
    expect(meta.mobaRecallLeft).toBe(0);
  });

  it('is cancelled by moving off the anchor', () => {
    const { sim, pid, hero, meta } = setupAway();
    sim.mobaRecall(pid);
    for (let i = 0; i < 20; i++) sim.tick();
    hero.pos = { ...hero.pos, x: hero.pos.x + 2 }; // step away
    sim.tick();
    expect(meta.mobaRecallLeft).toBe(0);
  });
});

describe('The Clash: the shop', () => {
  it('spawns a shopkeeper at each base with the full stock', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Shopper');
    sim.startMobaMatch([pid]);
    const keepers = [...sim.entities.values()].filter((e) => e.kind === 'npc' && e.templateId === 'moba_shopkeeper');
    expect(keepers.length).toBe(2);
    for (const k of keepers) {
      expect(k.vendorItems.length).toBeGreaterThanOrEqual(20); // 15 gear + 6 potions
      for (const itemId of k.vendorItems) {
        expect((sim as any).constructor === Sim).toBe(true);
        expect(MOBS[itemId], 'vendor stock must be items, not mobs').toBeUndefined();
      }
    }
  });

  it('a hero can buy gear with bounty gold and equip it', () => {
    const sim = makeMobaSim();
    const pid = sim.addPlayer('warrior', 'Buyer');
    sim.startMobaMatch([pid]);
    const meta = (sim as any).players.get(pid);
    meta.copper = 5000;
    const keeper = [...sim.entities.values()].find((e) => e.kind === 'npc' && e.templateId === 'moba_shopkeeper')!;
    const hero = entOf(sim, pid);
    hero.pos = { ...keeper.pos, z: keeper.pos.z - 2 };
    hero.prevPos = { ...hero.pos };
    (sim as any).rebucket(hero);
    sim.targetEntity(keeper.id);
    sim.buyItem(keeper.id, 'moba_traffic_cone', pid);
    expect(meta.copper).toBe(5000 - 600);
    expect(meta.inventory.some((s: any) => s.itemId === 'moba_traffic_cone')).toBe(true);
    sim.equipItem('moba_traffic_cone', pid);
    expect(meta.equipment.helmet).toBe('moba_traffic_cone');
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

// Combat pacing locks (the balance brief): minions left unattended kill each
// other in 30-45s; heroes clear caster minions fast; frontliners run ~2.2x a
// carry's health. Every number under test lives in content/moba_balance.ts.
describe('The Clash: combat pacing', () => {
  // Stand two enemy-team footmen next to each other on the battleground and let
  // the lane AI fight it out. Returns seconds until one dies.
  const minionMirrorSeconds = (): number => {
    const sim = makeMobaSim(21);
    const pid = sim.addPlayer('warrior', 'Ref');
    sim.startMobaMatch([pid]);
    const inst = (sim as any).instances.find((i: any) => i.dungeonId === 'moba_lane' && i.partyKey === 'moba');
    const origin = (sim as any).instanceOriginOf(inst);
    const mk = (team: 'A' | 'B', dz: number) => {
      const m = createMob((sim as any).nextId++, MOBS.moba_minion_melee, MOBS.moba_minion_melee.minLevel, { x: origin.x + 30, y: 0, z: origin.z + 30 + dz });
      m.prevPos = { ...m.pos };
      m.mobaTeam = team;
      (sim as any).addEntity(m);
      return m;
    };
    const a = mk('A', 0);
    const b = mk('B', 3);
    let ticks = 0;
    while (!a.dead && !b.dead && ticks < 20 * 90) { sim.tick(); ticks++; }
    expect(a.dead || b.dead, 'duel never resolved').toBe(true);
    return ticks / 20;
  };

  it('two lane footmen left unattended kill each other in 30-45 seconds', () => {
    const s = minionMirrorSeconds();
    expect(s).toBeGreaterThanOrEqual(30);
    expect(s).toBeLessThanOrEqual(45);
  });

  it('a hero clears a caster minion quickly with autos (league-style farming)', () => {
    const sim = makeMobaSim(22);
    const pid = sim.addPlayer('hunter', 'Farmer');
    sim.startMobaMatch([pid]);
    sim.pickMobaHero('gerald', pid); // marksman: highest sustained auto DPS
    const hero = entOf(sim, pid);
    const caster = createMob((sim as any).nextId++, MOBS.moba_minion_ranged, MOBS.moba_minion_ranged.minLevel, { x: hero.pos.x, y: hero.pos.y, z: hero.pos.z + 3 });
    caster.prevPos = { ...caster.pos };
    caster.mobaTeam = 'B';
    (sim as any).addEntity(caster);
    sim.targetEntity(caster.id);
    hero.autoAttack = true;
    let ticks = 0;
    while (!caster.dead && ticks < 20 * 20) {
      hero.facing = Math.atan2(caster.pos.x - hero.pos.x, caster.pos.z - hero.pos.z);
      sim.tick();
      ticks++;
    }
    expect(caster.dead, 'caster survived 20s of autos').toBe(true);
    expect(ticks / 20).toBeLessThanOrEqual(10);
  });

  it('a bruiser runs roughly 2-2.5x a marksman durability (role stat blocks)', () => {
    const sim = makeMobaSim(23);
    const pid = sim.addPlayer('warrior', 'Roles');
    sim.startMobaMatch([pid]);
    sim.pickMobaHero('gerald', pid); // marksman
    const squishyHp = entOf(sim, pid).maxHp;
    sim.pickMobaHero('snacko', pid); // bruiser
    const bruiserHp = entOf(sim, pid).maxHp;
    const ratio = bruiserHp / squishyHp;
    expect(ratio).toBeGreaterThanOrEqual(1.8);
    expect(ratio).toBeLessThanOrEqual(2.6);
  });

  it('a tower kills a lane minion fast enough to chew unattended waves', () => {
    const sim = makeMobaSim(24);
    const pid = sim.addPlayer('warrior', 'Watcher');
    sim.startMobaMatch([pid]);
    const match = sim.mobaMatch!;
    const tower = entOf(sim, match.towersA[1][0]);
    const minion = createMob((sim as any).nextId++, MOBS.moba_minion_melee, MOBS.moba_minion_melee.minLevel, { x: tower.pos.x + 3, y: tower.pos.y, z: tower.pos.z });
    minion.prevPos = { ...minion.pos };
    minion.mobaTeam = 'B';
    (sim as any).addEntity(minion);
    let ticks = 0;
    while (!minion.dead && ticks < 20 * 30) { sim.tick(); ticks++; }
    expect(minion.dead).toBe(true);
    expect(ticks / 20).toBeLessThanOrEqual(15);
  });
});
