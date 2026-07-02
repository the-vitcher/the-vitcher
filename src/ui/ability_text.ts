// Pure ability-text helpers: the cost/range/cast/requirement lines and the
// resolved effect numbers every ability tooltip splices into its copy. Shared
// by the action bar and spellbook tooltips (hud.ts) and the Clash skill
// tooltips (moba_hud.ts), the rule-of-three extraction. i18n goes through
// t()/formatNumber; no DOM.
import { t, formatNumber, type TranslationKey } from './i18n';
import type { AbilityDef, AbilityEffect, ResourceType } from '../sim/types';

const FORM_LABEL_KEYS: Record<'bear' | 'cat', TranslationKey> = {
  bear: 'abilityUi.forms.bear',
  cat: 'abilityUi.forms.cat',
};

const RESOURCE_LABEL_KEYS: Record<ResourceType, TranslationKey> = {
  mana: 'abilityUi.resources.mana',
  rage: 'abilityUi.resources.rage',
  energy: 'abilityUi.resources.energy',
};

export function resourceDisplayName(resourceType: ResourceType | null): string {
  return t(RESOURCE_LABEL_KEYS[resourceType ?? 'mana']);
}

export function formatAbilityNumber(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 1 });
}

export function abilityRangeLine(def: AbilityDef): string | null {
  if (def.range <= 0) return null;
  if (def.minRange !== undefined) {
    return t('abilityUi.tooltip.rangeWithMin', {
      min: formatAbilityNumber(def.minRange),
      max: formatAbilityNumber(def.range),
    });
  }
  return t('abilityUi.tooltip.range', { range: formatAbilityNumber(def.range) });
}

export function abilityCastLine(known: { def: AbilityDef; castTime: number }): string {
  if (known.def.channel) {
    return t('abilityUi.tooltip.channeledSeconds', { seconds: formatAbilityNumber(known.def.channel.duration) });
  }
  if (known.castTime > 0) {
    return t('abilityUi.tooltip.castSeconds', { seconds: formatAbilityNumber(known.castTime) });
  }
  return t('abilityUi.tooltip.instant');
}

export function abilityRequirementLines(def: AbilityDef): string[] {
  const lines: string[] = [];
  if (def.requiresForm) lines.push(t('abilityUi.tooltip.requiresForm', { form: t(FORM_LABEL_KEYS[def.requiresForm]) }));
  if (def.requiresStealth) lines.push(t('abilityUi.tooltip.requiresStealth'));
  if (def.spendsCombo) lines.push(t('abilityUi.tooltip.requiresCombo'));
  if (def.requiresDodgeProc) lines.push(t('abilityUi.tooltip.requiresDodge'));
  if (def.requiresOutOfCombat) lines.push(t('abilityUi.tooltip.requiresOutOfCombat'));
  if (def.requiresTargetHpBelow !== undefined) {
    lines.push(t('abilityUi.tooltip.requiresTargetHealthBelow', { percent: formatAbilityNumber(def.requiresTargetHpBelow * 100) }));
  }
  if (def.onNextSwing) lines.push(t('abilityUi.tooltip.onNextSwing'));
  if (def.offGcd) lines.push(t('abilityUi.tooltip.offGlobalCooldown'));
  if (def.targetType === 'friendly') lines.push(t('abilityUi.tooltip.friendlyTarget'));
  else if (def.requiresTarget) lines.push(t('abilityUi.tooltip.enemyTarget'));
  return lines;
}

export function abilityEffectText(effects: AbilityEffect[]): string {
  const primary = effects.find((eff) =>
    eff.type === 'directDamage' ||
    eff.type === 'heal' ||
    eff.type === 'weaponDamage' ||
    eff.type === 'weaponStrike' ||
    eff.type === 'aoeDamage' ||
    eff.type === 'aoeRoot' ||
    eff.type === 'finisherDamage' ||
    eff.type === 'drainTick'
  );
  if (primary) {
    switch (primary.type) {
      case 'directDamage':
      case 'heal':
      case 'aoeDamage':
      case 'aoeRoot':
      case 'drainTick':
        return abilityAmountRange(primary.min, primary.max);
      case 'weaponDamage':
      case 'weaponStrike':
        return formatAbilityNumber(primary.bonus);
      case 'finisherDamage':
        return t('abilityUi.tooltip.finisherDamage', {
          base: formatAbilityNumber(primary.base),
          perCombo: formatAbilityNumber(primary.perCombo),
        });
    }
  }

  const secondary = effects.find((eff) =>
    eff.type === 'dot' ||
    eff.type === 'hot' ||
    eff.type === 'absorb' ||
    eff.type === 'imbue'
  );
  if (!secondary) return '';
  switch (secondary.type) {
    case 'dot':
    case 'hot':
      return formatAbilityNumber(secondary.total);
    case 'absorb':
      return formatAbilityNumber(secondary.amount);
    case 'imbue':
      return formatAbilityNumber(secondary.bonus);
    default:
      return '';
  }
}

export function abilityAmountRange(min: number, max: number): string {
  if (min === max) return formatAbilityNumber(min);
  return t('abilityUi.tooltip.damageRange', {
    min: formatAbilityNumber(min),
    max: formatAbilityNumber(max),
  });
}
