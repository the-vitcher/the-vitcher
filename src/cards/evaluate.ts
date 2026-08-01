// Board evaluation: turns a GameState into final power numbers plus the active rule
// set. Pure - it never mutates state - so the engine, the AI, and the UI can all call
// it freely and a test can assert on it directly.
//
// THE ONE-PASS ONGOING RULE (load-bearing, do not "improve" it):
// Ongoing abilities read RAW power only (`def.power + counters`), never each other's
// modified power. Two Ongoings that buff each other would otherwise recurse forever,
// and any evaluation order would silently become part of the balance. Reading raw
// power makes evaluation terminating, order-independent for `add`, and reproducible.
//
// Evaluation runs in two passes because some Ongoings disable other Ongoings:
//   pass 1  run every Ongoing, keep only the RULES it emits -> find the silenced set
//   pass 2  re-run every non-silenced Ongoing, keep its rules AND its power modifiers
// Pass 2's rules are the final rule set, so a silenced card's rules do not apply.

import type {
  CardDef, CardInstance, Evaluation, GameState, LaneIndex, OngoingCtx, PowerMod, Rule, Side,
} from './types';
import { BASE_SLOTS, LANE_COUNT } from './types';
import { cardDef } from './content';
import { factionPassive } from './factions';
import {
  allBoardCards, boardCards, destroyedCards, handCards, rawLaneTotal, rawPower,
} from './board';

interface Sink {
  mods: PowerMod[];
  rules: Rule[];
  collectPower: boolean;
}

function makeOngoingCtx(
  state: GameState, self: CardInstance, sink: Sink, sourceUid: number,
): OngoingCtx {
  return {
    state,
    self,
    side: self.owner,
    lane: (self.lane ?? 0) as LaneIndex,
    raw: (card) => rawPower(card),
    cardsIn: (lane, side) => boardCards(state, lane, side),
    rawLaneTotal: (lane, side) => rawLaneTotal(state, lane, side),
    isWinningRaw: (lane, side) =>
      rawLaneTotal(state, lane, side) > rawLaneTotal(state, lane, (1 - side) as Side),
    destroyedOf: (side) => destroyedCards(state, side),
    handSize: (side) => handCards(state, side).length,
    add: (card, amount) => {
      if (sink.collectPower && amount !== 0) {
        sink.mods.push({ uid: card.uid, add: amount, set: null, source: sourceUid });
      }
    },
    set: (card, value) => {
      if (sink.collectPower) {
        sink.mods.push({ uid: card.uid, add: 0, set: value, source: sourceUid });
      }
    },
    rule: (rule) => { sink.rules.push(rule); },
  };
}

/**
 * A synthetic instance standing in for a faction passive, so passives can use the same
 * OngoingCtx as cards. uid -1/-2 never collides with a real card (uids start at 0).
 */
function passiveAnchor(side: Side): CardInstance {
  return {
    uid: -1 - side, defId: '', owner: side, zone: 'board', lane: 0, counters: 0,
    costMod: 0, playedTurn: -1, slot: -1, destroyedTurn: -1, marks: [],
  };
}

function runOngoingPass(state: GameState, silenced: Set<number>, collectPower: boolean): Sink {
  const sink: Sink = { mods: [], rules: [], collectPower };
  for (const card of allBoardCards(state)) {
    if (silenced.has(card.uid)) continue;
    const def: CardDef | undefined = cardDef(card.defId);
    if (!def?.ongoing) continue;
    def.ongoing(makeOngoingCtx(state, card, sink, card.uid));
  }
  // Faction passives resolve after cards so a passive buff sits on top of card auras.
  for (const side of [0, 1] as Side[]) {
    const passive = factionPassive(state.players[side].faction);
    if (!passive.ongoing) continue;
    passive.ongoing(makeOngoingCtx(state, passiveAnchor(side), sink, -1 - side));
  }
  return sink;
}

/** uids whose Ongoing is switched off by an opposing `silenceOngoing` rule. */
function silencedBy(state: GameState, rules: Rule[]): Set<number> {
  const out = new Set<number>();
  for (const rule of rules) {
    if (rule.kind !== 'silenceOngoing') continue;
    for (const card of boardCards(state, rule.lane, rule.against)) out.add(card.uid);
  }
  return out;
}

export function evaluate(state: GameState): Evaluation {
  // Pass 1: rules only, from every Ongoing, to discover who gets silenced.
  const discovery = runOngoingPass(state, new Set(), false);
  const silenced = silencedBy(state, discovery.rules);
  // Pass 2: the real one. Silenced cards contribute neither power nor rules.
  const final = runOngoingPass(state, silenced, true);

  const warded = new Set<number>();
  for (const rule of final.rules) if (rule.kind === 'warded') warded.add(rule.uid);

  const power = new Map<number, number>();
  for (const card of allBoardCards(state)) power.set(card.uid, rawPower(card));

  // `set` overrides land first (last one wins), then every `add` accumulates on top.
  for (const mod of final.mods) {
    if (mod.set === null) continue;
    if (!power.has(mod.uid)) continue;
    if (isHostileMod(state, mod, warded)) continue;
    power.set(mod.uid, Math.max(0, mod.set));
  }
  for (const mod of final.mods) {
    if (mod.set !== null || mod.add === 0) continue;
    const current = power.get(mod.uid);
    if (current === undefined) continue;
    if (isHostileMod(state, mod, warded)) continue;
    power.set(mod.uid, current + mod.add);
  }
  for (const [uid, value] of power) power.set(uid, Math.max(0, value));

  const laneTotals: number[][] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const perSide = [0, 0];
    for (const side of [0, 1] as Side[]) {
      for (const card of boardCards(state, lane as LaneIndex, side)) {
        perSide[side] += power.get(card.uid) ?? 0;
      }
    }
    laneTotals.push(perSide);
  }

  return { power, rules: final.rules, laneTotals };
}

/** A warded card (Uluru) ignores modifiers emitted by the opposing side. */
function isHostileMod(state: GameState, mod: PowerMod, warded: Set<number>): boolean {
  if (!warded.has(mod.uid)) return false;
  const target = state.cards.get(mod.uid);
  if (!target) return false;
  // Faction-passive anchors use uid -1 (side 0) and -2 (side 1).
  const sourceSide: Side | undefined = mod.source < 0
    ? ((-mod.source - 1) as Side)
    : state.cards.get(mod.source)?.owner;
  return sourceSide !== undefined && sourceSide !== target.owner;
}

// ---------------------------------------------------------------------------
// Rule queries. The engine asks these instead of scanning `Evaluation.rules`.
// ---------------------------------------------------------------------------

export function isProtected(evaluation: Evaluation, uid: number): boolean {
  return evaluation.rules.some((r) => r.kind === 'protect' && r.uid === uid);
}

export function isImmobile(evaluation: Evaluation, uid: number): boolean {
  return evaluation.rules.some((r) => r.kind === 'immobile' && r.uid === uid);
}

export function isWarded(evaluation: Evaluation, uid: number): boolean {
  return evaluation.rules.some((r) => r.kind === 'warded' && r.uid === uid);
}

export function revealSilenced(evaluation: Evaluation, lane: LaneIndex, side: Side): boolean {
  return evaluation.rules.some(
    (r) => r.kind === 'silenceReveal' && r.lane === lane && r.against === side,
  );
}

export function laneOpenFor(evaluation: Evaluation, lane: LaneIndex, side: Side): boolean {
  for (const rule of evaluation.rules) {
    if (rule.kind === 'laneLocked' && rule.lane === lane) return false;
    if (rule.kind === 'laneClosed' && rule.lane === lane && rule.against === side) return false;
  }
  return true;
}

export function slotsFor(evaluation: Evaluation, lane: LaneIndex, side: Side): number {
  let slots = BASE_SLOTS;
  for (const rule of evaluation.rules) {
    if (rule.kind === 'slots' && rule.lane === lane && rule.side === side) slots += rule.delta;
  }
  return Math.max(1, slots);
}

export function extraCostIn(evaluation: Evaluation, lane: LaneIndex, side: Side): number {
  let delta = 0;
  for (const rule of evaluation.rules) {
    if (rule.kind === 'costHere' && rule.lane === lane && rule.against === side) delta += rule.delta;
  }
  return delta;
}

export function enterPenalty(evaluation: Evaluation, lane: LaneIndex, side: Side): number {
  let delta = 0;
  for (const rule of evaluation.rules) {
    if (rule.kind === 'enterPenalty' && rule.lane === lane && rule.against === side) {
      delta += rule.delta;
    }
  }
  return delta;
}

/** The card soaking damage for `side` in `lane`, if any (St. Sebastian). */
export function absorberFor(
  evaluation: Evaluation, lane: LaneIndex, side: Side,
): number | null {
  for (const rule of evaluation.rules) {
    if (rule.kind === 'absorb' && rule.lane === lane && rule.side === side) return rule.uid;
  }
  return null;
}
