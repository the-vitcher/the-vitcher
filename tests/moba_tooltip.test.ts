import { describe, expect, it } from 'vitest';
import { mobaSkillTooltipHtml } from '../src/ui/moba_hud';
import { MOBA_ABILITIES, MOBA_HEROES } from '../src/sim/data';
import { MOBA_MAX_ABILITY_RANK, MOBA_RANK_POWER, MOBA_ULT_HERO_LEVEL, mobaScaleEffectForRank } from '../src/sim/moba';
import { abilityEffectText } from '../src/ui/ability_text';

// moba_pan_smash: weaponStrike bonus 22, authored at rank 2 (power 1.0).
const PAN = 'moba_pan_smash';

describe('The Clash skill tooltips (rank-resolved)', () => {
  it('previews rank 1 numbers when the ability is not learned yet', () => {
    const html = mobaSkillTooltipHtml(PAN, 0, false, 'rage');
    expect(html).toContain('Pan Smash');
    expect(html).toContain('Not learned');
    const rank1 = Math.round((MOBA_ABILITIES[PAN].effects[0] as { bonus: number }).bonus * MOBA_RANK_POWER[0]);
    expect(html).toContain(`plus ${rank1}.`);
    expect(html).not.toContain('$d');
  });

  it('shows the current rank standing and a next-rank preview', () => {
    const html = mobaSkillTooltipHtml(PAN, 1, false, 'rage');
    expect(html).toContain(`Rank 1/${MOBA_MAX_ABILITY_RANK}`);
    const rank2 = abilityEffectText(MOBA_ABILITIES[PAN].effects.map((e) => mobaScaleEffectForRank(e, 2)));
    expect(html).toContain(`Next rank: ${rank2}`);
  });

  it('drops the next-rank line at max rank', () => {
    const html = mobaSkillTooltipHtml(PAN, MOBA_MAX_ABILITY_RANK, false, 'rage');
    expect(html).toContain(`Rank ${MOBA_MAX_ABILITY_RANK}/${MOBA_MAX_ABILITY_RANK}`);
    expect(html).not.toContain('Next rank');
  });

  it('marks ultimates with the unlock level and a single rank', () => {
    const ultId = MOBA_HEROES.snacko.abilities[MOBA_HEROES.snacko.abilities.length - 1];
    const html = mobaSkillTooltipHtml(ultId, 1, true, 'rage');
    expect(html).toContain(`hero level ${MOBA_ULT_HERO_LEVEL}`);
    expect(html).toContain('Rank 1/1');
    expect(html).not.toContain('Next rank');
  });

  it('carries the cost, cooldown, and range lines with resolved numbers', () => {
    // moba_yoink: cost 10, cooldown 14, range 25 with minRange 8
    const html = mobaSkillTooltipHtml('moba_yoink', 1, false, 'rage');
    expect(html).toContain('10');
    expect(html).toContain('14');
    expect(html).toContain('25');
    expect(html).toContain('8');
  });

  it('renders every hero kit without leaving an unresolved $d anywhere', () => {
    for (const hero of Object.values(MOBA_HEROES)) {
      hero.abilities.forEach((id, i) => {
        const ult = i === hero.abilities.length - 1;
        for (const rank of [0, 1, ult ? 1 : MOBA_MAX_ABILITY_RANK]) {
          const html = mobaSkillTooltipHtml(id, rank, ult, 'mana');
          expect(html).toContain('tt-title');
          expect(html).not.toContain('$d');
        }
      });
    }
  });

  it('is a safe no-op for unknown ability ids', () => {
    expect(mobaSkillTooltipHtml('nope', 1, false, 'mana')).toBe('');
  });
});
