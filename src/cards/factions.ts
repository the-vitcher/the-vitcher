// THE ASYMMETRY LAYER.
//
// The roster spec gives each pantheon a distinct set of 15 cards. That alone is
// variety, not asymmetry: swap the art and every deck still plays the same game of
// "spend energy, add power, win two lanes". What makes a faction genuinely asymmetric
// is that it plays by a DIFFERENT RULE - a passive that changes the shape of your
// turn, not the size of your numbers.
//
// So every pantheon gets exactly one passive, always on, free, and public. Each one is
// the mechanical sentence of that faction's archetype:
//
//   Greek           reward the opening play          (fair, legible, tutorial)
//   Norse           discarding is card draw          (sacrifice is not a cost)
//   Egyptian        ramp arrives on turn 4           (weak early, oppressive late)
//   Hindu           death discounts the next play    (destruction feeds creation)
//   Yamato          spend everything, draw a card    (perfect curves are rewarded)
//   Middle Kingdom  massed lanes buff themselves     (formation over individuals)
//   House of Wisdom  a bigger hand and an extra card (the engine faction)
//   Western Civ     winning last turn pays energy    (momentum compounds)
//   Mesoamerica     every third sacrifice pays out   (a real blood economy)
//   Outback         your cheapest cards hit harder   (the swarm is the threat)
//   Celestial Host  your first loss each turn is undone (protection, not power)
//   House of David  losing two lanes makes you cheap (the underdog spike)
//
// Balance intent: a passive is worth roughly one card of tempo across a six-turn game.
// Passives are deliberately NOT symmetrical in kind - some give energy, some give
// power, some give cards - because that is the point.

import type {
  CardInstance, EffectCtx, FactionId, GameState, LaneIndex, OngoingCtx, Side,
} from './types';
import { BASE_HAND_LIMIT, LANE_COUNT } from './types';
import { baseCost, rawLanesLosing } from './board';

/** How a faction plays. Every hook is optional; most factions use one. */
export interface FactionHooks {
  id: FactionId;
  /** Stable id for the passive, used as the i18n key suffix. */
  passive: string;
  /** Difficulty rating carried over from the roster spec, for deck-select UI. */
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  /** Continuous board effect, evaluated alongside card Ongoings. Must not mutate. */
  ongoing?(ctx: OngoingCtx): void;
  /** One-time deck/hand setup, run after the opening hand is dealt. */
  setup?(state: GameState, side: Side): void;
  /** Start of turn, before energy is granted to `side`. */
  onTurnStart?(state: GameState, side: Side): void;
  /** End of turn, after scoring. */
  onTurnEnd?(ctx: EffectCtx, side: Side): void;
  /** A friendly card finished revealing. `nth` is 1 for the first card of the turn. */
  onPlay?(ctx: EffectCtx, card: CardInstance, nth: number): void;
  /** A friendly card was discarded from hand. `nth` counts within the turn. */
  onDiscard?(ctx: EffectCtx, card: CardInstance, nth: number): void;
  /** A friendly card was destroyed. `nth` counts within the turn. */
  onFriendlyDestroyed?(ctx: EffectCtx, card: CardInstance, nth: number): void;
  /** Cost change applied to every card this player plays. */
  costDelta?(state: GameState, side: Side): number;
}

const HOOKS: Record<FactionId, FactionHooks> = {
  // Olympian Decree - your first card each turn gets +1 Power. The simplest possible
  // passive: no tracking, no setup, and it teaches "play something every turn".
  greek: {
    id: 'greek',
    passive: 'olympianDecree',
    difficulty: 'beginner',
    onPlay(ctx, card, nth) {
      if (nth === 1) ctx.buff(card, 1);
    },
  },

  // Wyrd - the first discard each turn draws a card. Turns Norse's own cost (Draugr,
  // Oni, Thor's condition) into fuel, so discard reads as a resource, not a downside.
  norse: {
    id: 'norse',
    passive: 'wyrd',
    difficulty: 'intermediate',
    onDiscard(ctx, _card, nth) {
      if (nth === 1) ctx.draw(ctx.side, 1);
    },
  },

  // Eternal Rite - +1 max Energy from turn 4. The whole faction is priced around
  // being a turn behind early and a turn ahead late; this is that curve as a rule.
  egyptian: {
    id: 'egyptian',
    passive: 'eternalRite',
    difficulty: 'intermediate',
    onTurnStart(state, side) {
      if (state.turn === 4) state.players[side].bonusEnergy += 1;
    },
  },

  // Samsara - each friendly card destroyed makes your next card cost 1 less. Hindu
  // cards destroy their own board constantly (Set, Agni, Kali, Shiva); this pays for it.
  hindu: {
    id: 'hindu',
    passive: 'samsara',
    difficulty: 'advanced',
    onFriendlyDestroyed(ctx) {
      ctx.state.players[ctx.side].costDiscounts.push({ amount: 1, uses: 1 });
    },
  },

  // Kata - spend every point of Energy in a turn and draw a card. Rewards the exact
  // curve-perfect sequencing the Yamato roster is built out of.
  yamato: {
    id: 'yamato',
    passive: 'kata',
    difficulty: 'intermediate',
    onTurnEnd(ctx, side) {
      if (ctx.state.players[side].energy === 0 && ctx.state.players[side].playedThisTurn > 0) {
        ctx.draw(side, 1);
      }
    },
  },

  // Mandate of Heaven - a lane holding 3 or more of your cards buffs all of them by 1.
  // Formation play: the reward is for committing to a lane, not for any one card.
  middle_kingdom: {
    id: 'middle_kingdom',
    passive: 'mandateOfHeaven',
    difficulty: 'beginner',
    ongoing(ctx) {
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const friendly = ctx.cardsIn(lane as LaneIndex, ctx.side);
        if (friendly.length < 3) continue;
        for (const card of friendly) ctx.add(card, 1);
      }
    },
  },

  // Bayt al-Hikma - a 9-card hand limit and one extra opening card. House of Wisdom
  // draws more than it can play; raising the ceiling is what makes that a strategy.
  house_of_wisdom: {
    id: 'house_of_wisdom',
    passive: 'baytAlHikma',
    difficulty: 'advanced',
    setup(state, side) {
      state.players[side].handLimit = BASE_HAND_LIMIT + 2;
    },
  },

  // Momentum - win more lanes than your opponent on a turn and start the next one with
  // +1 Energy. Streaks compound, which is the entire Western Civ fantasy.
  western: {
    id: 'western',
    passive: 'momentum',
    difficulty: 'beginner',
    onTurnStart(state, side) {
      const me = state.players[side];
      const foe = state.players[(1 - side) as Side];
      if (state.turn > 1 && me.lanesWonLastTurn > foe.lanesWonLastTurn) me.pendingEnergy += 1;
    },
  },

  // Blood Debt - every third friendly card destroyed refunds 2 Energy. Mesoamerica
  // sacrifices constantly; this makes a sacrifice chain pay for the payoff card.
  mesoamerica: {
    id: 'mesoamerica',
    passive: 'bloodDebt',
    difficulty: 'advanced',
    onFriendlyDestroyed(ctx) {
      if (ctx.state.players[ctx.side].destroyedCount % 3 === 0) ctx.addEnergy(ctx.side, 2);
    },
  },

  // Adaptation - your 1-cost cards get +1 Power. The Outback wins by flooding cheap
  // bodies, so the passive scales with the number of them, not their quality.
  outback: {
    id: 'outback',
    passive: 'adaptation',
    difficulty: 'intermediate',
    ongoing(ctx) {
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        for (const card of ctx.cardsIn(lane as LaneIndex, ctx.side)) {
          if (baseCost(card) === 1) ctx.add(card, 1);
        }
      }
    },
  },

  // Grace - the first friendly card destroyed each turn returns to your hand instead of
  // the discard pile. Protection as replay value: it blanks one removal spell a turn.
  celestial: {
    id: 'celestial',
    passive: 'grace',
    difficulty: 'beginner',
    onFriendlyDestroyed(ctx, card, nth) {
      if (nth === 1) ctx.returnToHand(card);
    },
  },

  // Covenant - while you are losing two or more lanes, your cards cost 1 less. The
  // underdog spike: being behind is what turns on the comeback, exactly as the roster
  // (Judah Maccabee, Saladin-style scaling, Golem of Prague) already assumes.
  house_of_david: {
    id: 'house_of_david',
    passive: 'covenant',
    difficulty: 'advanced',
    // Raw power is the honest measure here: cost is resolved before reveal, so the
    // standings a player is reacting to are the ones already on the board.
    costDelta(state, side) {
      return rawLanesLosing(state, side) >= 2 ? -1 : 0;
    },
  },
};

export function factionPassive(id: FactionId): FactionHooks {
  return HOOKS[id];
}

export function allFactions(): FactionHooks[] {
  return Object.values(HOOKS);
}
