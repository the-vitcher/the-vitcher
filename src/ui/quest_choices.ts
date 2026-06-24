// Pure view helpers for Greywater moral-choice quests. The HUD is the thin DOM
// consumer; the localized text + filtering lives here so it can be unit-tested
// without a DOM (tests/quest_choices.test.ts). All player-visible strings resolve
// through tEntity, so they localize like every other world-entity string.
import { QUESTS } from '../sim/data';
import { questChoiceEligible } from '../sim/types';
import { tEntity } from './entity_i18n';

export interface QuestChoiceButton {
  id: string;
  label: string;
}

// Whether a quest presents moral choices at turn-in.
export function questHasChoices(questId: string): boolean {
  return (QUESTS[questId]?.choices?.length ?? 0) > 0;
}

// The localized choice buttons (id + label) for a choice-quest, in declared order.
// Past-deed-gated options are hidden until the player has earned them (flag + reputation);
// the server re-validates the same gate on turn-in, so the HUD only mirrors what is offered.
export function questChoiceButtons(
  questId: string,
  flags: ReadonlySet<string> = new Set(),
  reputation: ReadonlyMap<string, number> = new Map(),
): QuestChoiceButton[] {
  const quest = QUESTS[questId];
  if (!quest?.choices) return [];
  return quest.choices
    .filter((choice) => questChoiceEligible(choice, flags, reputation))
    .map((choice) => ({
      id: choice.id,
      label: tEntity({ kind: 'questChoice', questId, choiceId: choice.id, field: 'label' }),
    }));
}

// The localized result narration for a chosen option.
export function questChoiceResult(questId: string, choiceId: string): string {
  return tEntity({ kind: 'questChoice', questId, choiceId, field: 'result' });
}

// The localized looming-consequence line for a chosen option (empty if none).
export function questChoiceLooming(questId: string, choiceId: string): string {
  const choice = QUESTS[questId]?.choices?.find((c) => c.id === choiceId);
  if (!choice?.looming) return '';
  return tEntity({ kind: 'questChoice', questId, choiceId, field: 'looming' });
}

// The earlier-flag-gated callback lines that apply for this player, localized and in
// declared order. `questFlags` is the player's flag set ("<questId>__<choiceId>").
export function questCallbackLines(questId: string, questFlags: ReadonlySet<string>): string[] {
  const quest = QUESTS[questId];
  if (!quest?.callbacks) return [];
  const lines: string[] = [];
  quest.callbacks.forEach((callback, callbackIndex) => {
    if (questFlags.has(callback.requiresFlag)) {
      lines.push(tEntity({ kind: 'questCallback', questId, callbackIndex, field: 'text' }));
    }
  });
  return lines;
}
