// Zone and raw-power queries over a GameState. Pure, allocation-light, and free of
// any dependency on evaluate.ts, so both evaluate.ts and factions.ts can import it
// without an import cycle. Nothing here knows about Ongoing modifiers - "raw" means
// `def.power + counters`, which is exactly the input the one-pass Ongoing rule needs.

import type { CardInstance, GameState, LaneIndex, Side } from './types';
import { LANE_COUNT } from './types';
import { cardDef } from './content';

/** Power before any Ongoing modifier. Counters can never push a card below 0. */
export function rawPower(card: CardInstance): number {
  return Math.max(0, cardDef(card.defId).power + card.counters);
}

/** Printed cost plus this instance's permanent cost modification, floored at 0. */
export function baseCost(card: CardInstance): number {
  return Math.max(0, cardDef(card.defId).cost + card.costMod);
}

/** Revealed cards for one side of one lane, in play order (slot, then uid). */
export function boardCards(state: GameState, lane: LaneIndex, side: Side): CardInstance[] {
  const out: CardInstance[] = [];
  for (const card of state.cards.values()) {
    if (card.zone === 'board' && card.lane === lane && card.owner === side) out.push(card);
  }
  out.sort((a, b) => (a.slot - b.slot) || (a.uid - b.uid));
  return out;
}

/** Every revealed card, in a fixed lane -> side -> slot order. */
export function allBoardCards(state: GameState): CardInstance[] {
  const out: CardInstance[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    for (const side of [0, 1] as Side[]) out.push(...boardCards(state, lane as LaneIndex, side));
  }
  return out;
}

export function handCards(state: GameState, side: Side): CardInstance[] {
  const out: CardInstance[] = [];
  for (const card of state.cards.values()) {
    if (card.zone === 'hand' && card.owner === side) out.push(card);
  }
  out.sort((a, b) => a.uid - b.uid);
  return out;
}

export function destroyedCards(state: GameState, side: Side): CardInstance[] {
  const out: CardInstance[] = [];
  for (const card of state.cards.values()) {
    if (card.zone === 'destroyed' && card.owner === side) out.push(card);
  }
  out.sort((a, b) => (a.destroyedTurn - b.destroyedTurn) || (a.uid - b.uid));
  return out;
}

export function rawLaneTotal(state: GameState, lane: LaneIndex, side: Side): number {
  let total = 0;
  for (const card of boardCards(state, lane, side)) total += rawPower(card);
  return total;
}

/** Lanes `side` is behind in on raw power. Ties count as losing for neither side. */
export function rawLanesLosing(state: GameState, side: Side): number {
  let count = 0;
  const foe = (1 - side) as Side;
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const index = lane as LaneIndex;
    if (rawLaneTotal(state, index, foe) > rawLaneTotal(state, index, side)) count++;
  }
  return count;
}
