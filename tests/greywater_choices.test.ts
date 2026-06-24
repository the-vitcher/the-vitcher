// End-to-end test for the per-player moral-choice / consequence quest engine
// (QuestDef.choices/callbacks, questFlags + reputation, two-step turn-in), driven
// against the REAL Greywater content (src/sim/content/greywater.ts).
//
// The Greywater questline is authored but intentionally NOT merged into the live
// world tables yet (it needs a 13-locale translation pass and rebaselining of the
// RNG-pinned determinism tests). So this test injects the content into the shared
// registries itself, exercising the engine + the authored quests without polluting
// the global world. Vitest isolates modules per file, so the injection is local.
import { describe, expect, it, beforeAll } from 'vitest';
import { Sim, computeQuestState } from '../src/sim/sim';
import { QUESTS, NPCS, MOBS, ITEMS } from '../src/sim/data';
import { groundHeight } from '../src/sim/world';
import {
  GREYWATER_QUESTS, GREYWATER_NPCS, GREYWATER_MOBS, GREYWATER_ITEMS,
} from '../src/sim/content/greywater';
import { questHasChoices, questChoiceButtons, questCallbackLines } from '../src/ui/quest_choices';
import type { Entity } from '../src/sim/types';

beforeAll(() => {
  Object.assign(QUESTS, GREYWATER_QUESTS);
  Object.assign(NPCS, GREYWATER_NPCS);
  Object.assign(MOBS, GREYWATER_MOBS);
  Object.assign(ITEMS, GREYWATER_ITEMS);
});

function makeWorld(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

describe('flag-gated follow-up quest (magistrate branch)', () => {
  it('gw_jail_chest is unavailable without the magistrate flag, available with it', () => {
    expect(computeQuestState('gw_jail_chest', new Map(), new Set(), 20, new Set())).toBe('unavailable');
    expect(computeQuestState('gw_jail_chest', new Map(), new Set(), 20, new Set(['gw_caravan__callaHanged']))).toBe('available');
  });
});

function teleport(sim: Sim, pid: number, x: number, z: number): void {
  const e = sim.entities.get(pid)!;
  e.pos.x = x; e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

function npcEntity(sim: Sim, templateId: string): Entity {
  const e = [...sim.entities.values()].find((x) => x.templateId === templateId);
  if (!e) throw new Error(`npc ${templateId} not spawned`);
  return e;
}

// Drive an `interact` quest objective by faking the ground-object interaction the
// way readyCaravan fakes mob kills.
function examine(sim: Sim, meta: unknown, objectItemId: string): void {
  const obj = { objectItemId, pos: { x: 0, y: 0, z: 0 } } as unknown as Entity;
  (sim as unknown as { interactObjectForQuests(o: Entity, m: unknown): boolean }).interactObjectForQuests(obj, meta);
}

// Place the player on the quest giver and bring the gw_caravan quest to `ready`
// through its full multi-stage flow (examine the wreck, slay drowners, recover the
// box, read the manifest).
function readyCaravan(sim: Sim, pid: number): void {
  const calla = npcEntity(sim, 'calla');
  teleport(sim, pid, calla.pos.x, calla.pos.z);
  sim.acceptQuest('gw_caravan', pid);
  const meta = sim.meta(pid)!;
  examine(sim, meta, 'caravan_wreck'); // interact: Witcher Senses
  const fakeDrowner = { templateId: 'greywater_drowner' } as Entity;
  for (let i = 0; i < 6; i++) (sim as unknown as { onMobKilledForQuests(m: Entity, meta: unknown): void }).onMobKilledForQuests(fakeDrowner, meta);
  sim.addItem('slaver_strongbox', 1, pid); // collect objective
  examine(sim, meta, 'slaver_manifest'); // interact: the reveal
}

describe('Greywater moral-choice quest engine', () => {
  it('completes a non-choice turn-in only after a valid option is picked', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);

    expect(sim.questState('gw_caravan', pid)).toBe('ready');

    // First turn-in with NO choice: prompts, does not complete.
    sim.tick(); // drain
    const events = collectTurnIn(sim, pid, undefined);
    expect(events.some((e) => e.type === 'questChoices' && (e as unknown as { questId: string }).questId === 'gw_caravan')).toBe(true);
    expect(sim.questsDone.has('gw_caravan')).toBe(false);
    expect(sim.questState('gw_caravan', pid)).toBe('ready');
  });

  it('records the chosen flags and reputation deltas on completion', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);

    sim.turnInQuest('gw_caravan', 'magistrate', pid);

    expect(sim.questsDone.has('gw_caravan')).toBe(true);
    expect(sim.questFlags.has('gw_caravan__callaHanged')).toBe(true);
    expect(sim.questFlags.has('gw_caravan__assassinHunt')).toBe(true);
    expect(sim.reputationOf('justice', pid)).toBe(4);
    expect(sim.reputationOf('nobility', pid)).toBe(2);
    expect(sim.reputationOf('underworld', pid)).toBe(-2);
    // A different choice's flags must NOT be set.
    expect(sim.questFlags.has('gw_caravan__callaFreed')).toBe(false);
  });

  it('grants the choice bonus copper on top of the base reward', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);
    const meta = sim.meta(pid)!;
    const before = meta.copper;

    sim.turnInQuest('gw_caravan', 'burn', pid); // base 60 + choice 140

    expect(meta.copper).toBe(before + 60 + 140);
    expect(sim.questFlags.has('gw_caravan__tradeExpands')).toBe(true);
  });

  it('ignores an invalid choice id (no completion, re-prompts)', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);

    const events = collectTurnIn(sim, pid, 'not_a_real_choice');
    expect(events.some((e) => e.type === 'questChoices')).toBe(true);
    expect(sim.questsDone.has('gw_caravan')).toBe(false);
  });

  it('surfaces a later quest callback only when the gating flag is set', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);

    // Before any choice: gw_velvet has no applicable callbacks.
    expect(sim.questCallbacksFor('gw_velvet', pid)).toHaveLength(0);

    sim.turnInQuest('gw_caravan', 'magistrate', pid); // sets gw_caravan__callaHanged

    const callbacks = sim.questCallbacksFor('gw_velvet', pid);
    expect(callbacks.length).toBeGreaterThan(0);
    expect(callbacks.some((c) => c.requiresFlag === 'gw_caravan__callaHanged')).toBe(true);
    // The HUD view helper reflects the same gated lines.
    expect(questCallbackLines('gw_velvet', sim.questFlags).length).toBe(callbacks.length);
  });

  it('round-trips questFlags and reputation through save/load (back-compat for empty)', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    readyCaravan(sim, pid);
    sim.turnInQuest('gw_caravan', 'looters', pid);

    const state = sim.serializeCharacter(pid)!;
    expect(state.questFlags).toContain('gw_caravan__soldOutCalla');
    expect(state.reputation).toMatchObject({ smallfolk: -2, underworld: 1, justice: -2 });

    // Reload into a fresh sim.
    const sim2 = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid2 = sim2.addPlayer('warrior', 'Geralt', { state });
    expect(sim2.questFlags.has('gw_caravan__soldOutCalla')).toBe(true);
    expect(sim2.reputationOf('underworld', pid2)).toBe(1);

    // A legacy state WITHOUT the new keys loads to empty (no throw).
    const legacy = { ...state };
    delete (legacy as { questFlags?: unknown }).questFlags;
    delete (legacy as { reputation?: unknown }).reputation;
    const sim3 = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid3 = sim3.addPlayer('warrior', 'Geralt', { state: legacy });
    expect(sim3.questFlags.size).toBe(0);
    expect(sim3.reputationOf('justice', pid3)).toBe(0);
  });

  it("one player's choice never touches another player's flags (MMO-safe)", () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Geralt');
    const b = sim.addPlayer('mage', 'Yennefer');
    sim.setPlayerLevel(10);
    readyCaravan(sim, a);
    sim.turnInQuest('gw_caravan', 'magistrate', a);

    expect(sim.meta(a)!.questFlags.has('gw_caravan__callaHanged')).toBe(true);
    expect(sim.meta(b)!.questFlags.has('gw_caravan__callaHanged')).toBe(false);
    expect(sim.meta(b)!.reputation.size).toBe(0);
  });

  it('the witcher mutters his deductions when a clue is examined (voiced monologue)', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Geralt');
    sim.setPlayerLevel(10);
    const calla = npcEntity(sim, 'calla');
    teleport(sim, pid, calla.pos.x, calla.pos.z);
    sim.acceptQuest('gw_caravan', pid);
    examine(sim, sim.meta(pid)!, 'caravan_wreck');

    const events = sim.tick();
    const monologue = events.filter(
      (e) => e.type === 'log' && (e as { voiceKey?: string }).voiceKey?.startsWith('monologue__caravan_wreck'),
    );
    expect(monologue.length).toBeGreaterThan(0);
    // First line carries the stable, gender-free voice key the client plays.
    expect((monologue[0] as { voiceKey?: string }).voiceKey).toBe('monologue__caravan_wreck__0');
    expect((monologue[0] as { pid?: number }).pid).toBe(pid); // personal to the examining player
  });

  it('exposes the choice list to the HUD view helpers', () => {
    expect(questHasChoices('gw_caravan')).toBe(true);
    const buttons = questChoiceButtons('gw_caravan');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.id)).toEqual(['looters', 'giveCalla', 'magistrate', 'burn']);
    // Labels resolve to non-empty English (the dormant content falls back to source).
    for (const b of buttons) expect(b.label.length).toBeGreaterThan(0);
  });

  it('every Greywater choice flag referenced by a callback is actually settable', () => {
    // Guard the cross-quest wiring: each callback.requiresFlag must be produced by
    // some earlier quest's choice (questId__flag), or the consequence can never fire.
    const settable = new Set<string>();
    for (const quest of Object.values(GREYWATER_QUESTS)) {
      for (const choice of quest.choices ?? []) {
        for (const flag of choice.effect.setFlags ?? []) settable.add(`${quest.id}__${flag}`);
      }
    }
    for (const quest of Object.values(GREYWATER_QUESTS)) {
      for (const cb of quest.callbacks ?? []) {
        expect(settable.has(cb.requiresFlag), `${quest.id} callback needs ${cb.requiresFlag}`).toBe(true);
      }
    }
  });
});

// Drive turn-in and return the events the sim emitted that tick (turnInQuest emits
// synchronously into the event queue; tick() drains them).
function collectTurnIn(sim: Sim, pid: number, choiceId: string | undefined): { type: string }[] {
  sim.turnInQuest('gw_caravan', choiceId, pid);
  return sim.tick();
}
