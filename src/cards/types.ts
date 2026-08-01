// Core types for the Pantheon card game. Host-agnostic: no DOM, no Three.js, no
// imports from render/ui/game/net. Same rules run in the browser, in Node, and in
// a headless bot harness (guarded by tests/cards_architecture.test.ts).
//
// The game is 3 lanes, 6 turns, simultaneous reveal, with two layers of asymmetry:
//   1. Card asymmetry  - each pantheon's 15 cards express one archetype.
//   2. Faction asymmetry - each pantheon plays by a slightly DIFFERENT RULE
//      (`FactionPassive` in factions.ts). That layer is what makes two decks of
//      identical stat lines still play differently.
// Stakes escalate through Ascend (engine.ts): a lane's `stake` is how many points
// winning it is worth, so one contested lane can outweigh the other two.

export type FactionId =
  | 'greek'
  | 'norse'
  | 'egyptian'
  | 'hindu'
  | 'yamato'
  | 'middle_kingdom'
  | 'house_of_wisdom'
  | 'western'
  | 'mesoamerica'
  | 'outback'
  | 'celestial'
  | 'house_of_david';

export const FACTION_IDS: readonly FactionId[] = [
  'greek', 'norse', 'egyptian', 'hindu', 'yamato', 'middle_kingdom',
  'house_of_wisdom', 'western', 'mesoamerica', 'outback', 'celestial', 'house_of_david',
] as const;

/** Seat index. Two-player game; `1 - side` is always the opponent. */
export type Side = 0 | 1;
/** Lanes are fixed at three. Lane 0 and lane 2 are adjacent to lane 1 only. */
export type LaneIndex = 0 | 1 | 2;

export const LANE_COUNT = 3;
export const TURN_COUNT = 6;
/** Base slots per side per lane. Sinar-style effects raise this via a `slots` rule. */
export const BASE_SLOTS = 4;
export const BASE_HAND_LIMIT = 7;
export const DECK_SIZE = 12;
export const OPENING_HAND = 3;
/** Ascend tokens per player per game, and the ceiling a lane's stake can reach. */
export const ASCEND_TOKENS = 2;
export const MAX_STAKE = 3;
export const ASCEND_COST = 1;

/**
 * Where a card currently lives. A card is only on the board while `zone === 'board'`;
 * `destroyed` is the discard pile that Hades, Osiris and Izanagi read and refill from.
 */
export type Zone = 'deck' | 'hand' | 'board' | 'destroyed';

/** Tag used by the few cards that read card types rather than stats. */
export type Keyword = 'beast' | 'token' | 'structure' | 'hero' | 'god';

/**
 * A card in a specific game. `defId` points at the immutable `CardDef`; everything
 * that can change during a match lives here so a game state is fully serializable
 * (and therefore snapshot-comparable in tests).
 */
export interface CardInstance {
  /** Unique within one game. Assigned in deal order, so it is deterministic. */
  uid: number;
  defId: string;
  owner: Side;
  zone: Zone;
  lane: LaneIndex | null;
  /**
   * Permanent power modification from On Reveal / End of Turn effects. Kept separate
   * from Ongoing modifiers, which are recomputed from scratch on every evaluation.
   */
  counters: number;
  /** Permanent cost modification for this instance (Elijah, Charon, Osiris). */
  costMod: number;
  /** Turn this card was revealed on; -1 while it is still in hand or deck. */
  playedTurn: number;
  /** Play order within its lane+side. Medusa and Miyamoto read this. */
  slot: number;
  /** Set when the card leaves the board destroyed, for "destroyed this game" counts. */
  destroyedTurn: number;
  /** Per-instance markers (`revived`, `hidden`, `disguised`, ...). */
  marks: string[];
}

/** A modifier an Ongoing ability contributes to some card's power this evaluation. */
export interface PowerMod {
  uid: number;
  /** Additive delta. Applied after every `set`. */
  add: number;
  /** Absolute override. The last `set` in evaluation order wins. */
  set: number | null;
  /** uid of the card that emitted this, for attribution in the log. */
  source: number;
}

/**
 * A non-power rule an Ongoing ability projects onto the board. Rules are collected in
 * a first pass so that rules which disable other Ongoing abilities (Tsukuyomi) apply
 * before power is computed in the second pass. See evaluate.ts.
 */
export type Rule =
  /** Cannot be destroyed (Baldur, Wombat, Ganesha's lane, Cherub's neighbours). */
  | { kind: 'protect'; uid: number }
  /** Cannot be moved (Baldur, Wombat, Pyramid of Giza). */
  | { kind: 'immobile'; uid: number }
  /** Unaffected by any enemy ability at all (Uluru). */
  | { kind: 'warded'; uid: number }
  /** Enemy On Reveal abilities do not trigger in this lane (Sphinx). */
  | { kind: 'silenceReveal'; lane: LaneIndex; against: Side }
  /** Enemy Ongoing abilities are disabled in this lane (Tsukuyomi). */
  | { kind: 'silenceOngoing'; lane: LaneIndex; against: Side }
  /** `against` cannot play cards into this lane (Qin Shi Huang, St. Peter). */
  | { kind: 'laneClosed'; lane: LaneIndex; against: Side }
  /** Neither side may play into this lane (Pyramid of Giza). */
  | { kind: 'laneLocked'; lane: LaneIndex }
  /** Slot count change for one side of one lane (Sinan the Architect). */
  | { kind: 'slots'; lane: LaneIndex; side: Side; delta: number }
  /** Cost change for `against` playing into this lane (Kappa). */
  | { kind: 'costHere'; lane: LaneIndex; against: Side; delta: number }
  /** Power penalty applied to `against` cards revealed here (Redback Spider). */
  | { kind: 'enterPenalty'; lane: LaneIndex; against: Side; delta: number }
  /** Absorbs damage aimed at friendly cards in this lane (St. Sebastian). */
  | { kind: 'absorb'; uid: number; lane: LaneIndex; side: Side };

/** The read-only view of a resolved board, produced by `evaluate()`. */
export interface Evaluation {
  /** Final power per card uid, after counters, Ongoing modifiers, and clamping. */
  power: Map<number, number>;
  rules: Rule[];
  /** Per lane, per side: summed power of that side's revealed cards. */
  laneTotals: number[][];
}

/** Mutation surface handed to On Reveal / End of Turn abilities. */
export interface EffectCtx {
  state: GameState;
  /** The card whose ability is running. */
  self: CardInstance;
  side: Side;
  /** The lane the ability is resolving in. Equals `self.lane` for board abilities. */
  lane: LaneIndex;
  rng: Rng;

  // ---- queries (all read the CURRENT evaluation, refreshed after each mutation) ----
  power(card: CardInstance): number;
  cardsIn(lane: LaneIndex, side: Side): CardInstance[];
  laneTotal(lane: LaneIndex, side: Side): number;
  isWinning(lane: LaneIndex, side: Side): boolean;
  destroyedOf(side: Side): CardInstance[];
  hand(side: Side): CardInstance[];
  canTarget(card: CardInstance): boolean;

  // ---- mutations ----
  buff(card: CardInstance, amount: number): void;
  damage(card: CardInstance, amount: number): void;
  destroy(card: CardInstance): void;
  moveCard(card: CardInstance, to: LaneIndex): boolean;
  draw(side: Side, count?: number): CardInstance[];
  discardFromHand(side: Side, card: CardInstance): void;
  addEnergy(side: Side, amount: number): void;
  addMaxEnergy(side: Side, amount: number): void;
  /** Mint a fresh copy of `defId` straight into `side`'s hand (tokens). */
  mint(side: Side, defId: string, costMod?: number): CardInstance | null;
  returnToHand(card: CardInstance, costDelta?: number): void;
  /** Put a destroyed card back on the board. Returns false when the lane is full. */
  revive(card: CardInstance, lane: LaneIndex, power?: number): boolean;
  log(message: string, data?: Record<string, number | string>): void;
}

/** Read-only surface handed to Ongoing abilities. Ongoing must never mutate state. */
export interface OngoingCtx {
  state: GameState;
  self: CardInstance;
  side: Side;
  lane: LaneIndex;

  /**
   * Power BEFORE any Ongoing modifier (def.power + counters, clamped at 0). Ongoing
   * abilities read raw power only; that keeps evaluation single-pass and therefore
   * free of order dependence and mutual recursion.
   */
  raw(card: CardInstance): number;
  cardsIn(lane: LaneIndex, side: Side): CardInstance[];
  rawLaneTotal(lane: LaneIndex, side: Side): number;
  /** Lane comparison on raw power. Ties count as not winning for either side. */
  isWinningRaw(lane: LaneIndex, side: Side): boolean;
  destroyedOf(side: Side): CardInstance[];
  handSize(side: Side): number;

  /** Emit an additive power modifier. */
  add(card: CardInstance, amount: number): void;
  /** Emit an absolute power override. */
  set(card: CardInstance, value: number): void;
  /** Emit a board rule. */
  rule(rule: Rule): void;
}

/** The immutable definition of a card. One record per card in `content/`. */
export interface CardDef {
  /** `<faction>.<slug>`, e.g. `greek.zeus`. Stable; used as the i18n key suffix. */
  id: string;
  faction: FactionId;
  cost: number;
  power: number;
  keywords?: Keyword[];
  /** Token cards are minted by other cards and never appear in a starting deck. */
  token?: boolean;
  onReveal?: (ctx: EffectCtx) => void;
  ongoing?: (ctx: OngoingCtx) => void;
  endOfTurn?: (ctx: EffectCtx) => void;
  /** Fires when this card is destroyed while on the board (Thylacine, Lazarus). */
  onDestroy?: (ctx: EffectCtx) => void;
}

/** Per-seat mutable state. */
export interface PlayerState {
  side: Side;
  faction: FactionId;
  energy: number;
  maxEnergy: number;
  /** Permanent max-energy bonus from Khepri and faction passives. */
  bonusEnergy: number;
  handLimit: number;
  ascendTokens: number;
  /** Cards destroyed this game, both by the owner and the opponent. */
  destroyedCount: number;
  /** Enemy cards this player has destroyed this game (Durga). */
  enemyDestroyedCount: number;
  discardedThisTurn: number;
  destroyedThisTurn: number;
  playedThisTurn: number;
  /** Lanes won at the end of the previous turn (Julius Caesar, Western passive). */
  lanesWonLastTurn: number;
  /** Cost reduction that applies to the next N cards played (Athena, Al-Khwarizmi). */
  costDiscounts: { amount: number; uses: number }[];
  /** Energy granted at the start of the next turn (Prometheus). */
  pendingEnergy: number;
}

export interface LaneState {
  index: LaneIndex;
  /** Points this lane is worth. Raised by Ascend, capped at MAX_STAKE. */
  stake: number;
  /** Which sides have spent an Ascend token here, for UI attribution. */
  ascendedBy: Side[];
}

export interface GameLogEntry {
  turn: number;
  side: Side | null;
  message: string;
  data?: Record<string, number | string>;
}

export interface GameState {
  seed: number;
  turn: number;
  phase: 'staging' | 'reveal' | 'end' | 'over';
  cards: Map<number, CardInstance>;
  /** Deck order per side; index 0 is the top of the deck. */
  decks: number[][];
  players: [PlayerState, PlayerState];
  lanes: [LaneState, LaneState, LaneState];
  log: GameLogEntry[];
  /** Set once `phase === 'over'`. `null` is a draw. */
  winner: Side | null | undefined;
  nextUid: number;
}

// Re-exported so content modules and the engine share one Rng type without each
// importing the sim. The sim's mulberry32 is the project's canonical seeded RNG.
export type { Rng } from '../sim/rng';
