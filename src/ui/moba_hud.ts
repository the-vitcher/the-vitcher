// The Clash (MOBA) HUD: hero select, match status, the skill strip (DotA-style
// learn/upgrade), the recall button, the respawn countdown, and the end banner.
//
// Own module composed by hud.ts (the "new windows are modules" rule): it holds no
// Hud internals, reads the world only through IWorld (mobaState + actions), and
// renders hero/ability CONTENT from the static data tables the way the entity-i18n
// modules do. Hero names/titles are proper nouns (verbatim across locales, like
// player names); blurbs and ability descriptions render as a documented English
// backstop (the GROUND_PICKUP_LINES precedent). All chrome goes through t().
import type { IWorld, MobaStateView } from '../world_api';
import { CLASSES, MOBA_ABILITIES, MOBA_HEROES } from '../sim/data';
import { MOBA_MAX_ABILITY_RANK, MOBA_ULT_HERO_LEVEL, mobaScaleEffectForRank } from '../sim/moba';
import type { ResourceType } from '../sim/types';
import {
  abilityCastLine, abilityEffectText, abilityRangeLine, abilityRequirementLines,
  formatAbilityNumber, resourceDisplayName,
} from './ability_text';
import { esc } from './esc';
import { iconDataUrl } from './icons';
import { t } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

// Rank-resolved tooltip for one Clash ability: name, rank standing (or the
// not-learned hint), cost/range, cast/cooldown, the description with its $d
// number slot resolved at the shown rank, a next-rank preview, and the usual
// requirement lines. Pure HTML builder (Vitest-covered); descriptions are
// data-English by design (the documented backstop, like hero blurbs).
export function mobaSkillTooltipHtml(abilityId: string, rank: number, ult: boolean, resourceType: ResourceType | null): string {
  const def = MOBA_ABILITIES[abilityId];
  if (!def) return '';
  const maxRank = ult ? 1 : MOBA_MAX_ABILITY_RANK;
  const shownRank = Math.min(maxRank, Math.max(1, rank)); // unlearned previews rank 1
  const damageText = abilityEffectText(def.effects.map((e) => mobaScaleEffectForRank(e, shownRank)));
  let html = `<div class="tt-title">${esc(def.name)}</div>`;
  if (ult) {
    html += `<div class="tt-sub">${esc(t('hudChrome.moba.tooltip.ultimate', { level: String(MOBA_ULT_HERO_LEVEL) }))}</div>`;
  }
  html += `<div class="tt-sub">${esc(rank > 0
    ? t('hudChrome.moba.tooltip.rank', { rank: formatAbilityNumber(rank), max: formatAbilityNumber(maxRank) })
    : t('hudChrome.moba.tooltip.notLearned'))}</div>`;
  const costLine: string[] = [];
  if (def.cost > 0) {
    costLine.push(t('abilityUi.tooltip.cost', { cost: formatAbilityNumber(def.cost), resource: resourceDisplayName(resourceType) }));
  }
  const rangeLine = abilityRangeLine(def);
  if (rangeLine) costLine.push(rangeLine);
  if (costLine.length) html += `<div class="tt-stat">${costLine.map(esc).join(' &nbsp; ')}</div>`;
  const castLine = [abilityCastLine({ def, castTime: def.castTime })];
  if (def.cooldown > 0) castLine.push(t('abilityUi.tooltip.cooldownSeconds', { seconds: formatAbilityNumber(def.cooldown) }));
  html += `<div class="tt-stat">${castLine.map(esc).join(' &nbsp; ')}</div>`;
  html += `<div class="tt-desc">${esc(def.description.replace(/\$d/g, damageText))}</div>`;
  if (rank >= 1 && rank < maxRank) {
    const nextText = abilityEffectText(def.effects.map((e) => mobaScaleEffectForRank(e, rank + 1)));
    if (nextText && nextText !== damageText) {
      html += `<div class="tt-sub">${esc(t('hudChrome.moba.tooltip.nextRank', { value: nextText }))}</div>`;
    }
  }
  const requirements = abilityRequirementLines(def);
  if (requirements.length) html += requirements.map((line) => `<div class="tt-sub">${esc(line)}</div>`).join('');
  return html;
}

export class MobaHud {
  private root = $('#moba-hud');
  private statusEl = $('#moba-status');
  private statusTextEl = $('#moba-status-text');
  private skillsEl = $('#moba-skills');
  private recallBtn = $<HTMLButtonElement>('#moba-recall');
  private respawnEl = $('#moba-respawn');
  private bannerEl = $('#moba-banner');
  private selectEl = $('#moba-hero-select');
  private gridEl = $('#moba-hero-grid');
  private changeHeroBtn = $<HTMLButtonElement>('#moba-change-hero');

  private heroChosen = false;
  private selectBuilt = false;
  private bannerShown = false;
  private skillsSig = '';

  // attachTooltip is Hud's shared hover/focus/touch tooltip wiring, injected so
  // this module stays free of Hud internals (and testable without them).
  constructor(private sim: IWorld, private attachTooltip?: (el: HTMLElement, html: () => string) => void) {
    this.recallBtn?.addEventListener('click', () => this.sim.mobaRecall());
    this.changeHeroBtn?.addEventListener('click', () => this.openHeroSelect());
    this.skillsEl?.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('[data-learn]') as HTMLElement | null;
      if (btn?.dataset.learn) this.sim.mobaLearnAbility(btn.dataset.learn);
    });
    this.gridEl?.addEventListener('click', (ev) => {
      const card = (ev.target as HTMLElement).closest('[data-hero]') as HTMLElement | null;
      if (!card?.dataset.hero) return;
      this.sim.pickMobaHero(card.dataset.hero);
      this.heroChosen = true;
      this.selectEl.hidden = true;
    });
  }

  // Per-frame refresh, called from Hud.update(). Hidden entirely outside a match.
  update(): void {
    const st = this.sim.mobaState();
    if (!this.root) return;
    if (!st) {
      if (!this.root.hidden) this.root.hidden = true;
      document.body.classList.remove('moba-active');
      return;
    }
    if (this.root.hidden) this.root.hidden = false;
    document.body.classList.add('moba-active'); // hides MMO onboarding chrome (CSS)

    // First entry: open the hero select once so the match starts with a choice.
    if (!this.heroChosen && this.selectEl.hidden && st.phase !== 'ended') this.openHeroSelect();

    this.updateStatus(st);
    this.updateSkills(st);
    this.updateRecall(st);
    this.updateRespawn(st);
    this.updateBanner(st);
  }

  private openHeroSelect(): void {
    if (!this.selectBuilt) {
      this.buildHeroGrid();
      this.selectBuilt = true;
    }
    this.selectEl.hidden = false;
  }

  private buildHeroGrid(): void {
    const cards = Object.values(MOBA_HEROES).map((hero) => {
      const role = t(`hudChrome.moba.roles.${hero.role}` as Parameters<typeof t>[0]);
      const abilities = hero.abilities.map((id, i) => {
        const def = MOBA_ABILITIES[id];
        if (!def) return '';
        const ult = i === hero.abilities.length - 1;
        return `<img class="mhs-ab${ult ? ' ult' : ''}" src="${iconDataUrl('ability', id, 28)}" alt="${esc(def.name)}" tabindex="0" data-ability="${esc(id)}" data-ult="${ult ? 1 : 0}" data-res="${esc(CLASSES[hero.baseClass]?.resourceType ?? 'mana')}">`;
      }).join('');
      return `<button type="button" class="mhs-card" data-hero="${esc(hero.id)}" style="--hero-color:#${hero.color.toString(16).padStart(6, '0')}">
        <span class="mhs-name">${esc(hero.name)}</span>
        <span class="mhs-title">${esc(hero.title)}</span>
        <span class="mhs-role">${esc(role)}</span>
        <span class="mhs-blurb">${esc(hero.blurb)}</span>
        <span class="mhs-abilities">${abilities}</span>
      </button>`;
    }).join('');
    this.gridEl.innerHTML = cards;
    this.attachSkillTooltips(this.gridEl);
  }

  // Wire the shared tooltip onto every [data-ability] icon under a rebuilt
  // container (innerHTML re-renders drop listeners, so re-attach after each
  // rebuild). Rank/ult ride data attributes; the strip re-renders on any rank
  // change, so the closure always reads current values.
  private attachSkillTooltips(rootEl: HTMLElement): void {
    if (!this.attachTooltip) return;
    for (const el of Array.from(rootEl.querySelectorAll<HTMLElement>('[data-ability]'))) {
      this.attachTooltip(el, () => mobaSkillTooltipHtml(
        el.dataset.ability ?? '',
        Number(el.dataset.rank ?? '0'),
        el.dataset.ult === '1',
        (el.dataset.res as ResourceType | undefined) ?? this.sim.player?.resourceType ?? null,
      ));
    }
  }

  private updateStatus(st: MobaStateView): void {
    const mm = Math.floor(st.elapsed / 60);
    const ss = String(st.elapsed % 60).padStart(2, '0');
    const text = st.phase === 'warmup'
      ? t('hudChrome.moba.warmup')
      : t('hudChrome.moba.status', { a: String(st.towersA), b: String(st.towersB), time: `${mm}:${ss}` });
    if (this.statusTextEl.textContent !== text) this.statusTextEl.textContent = text;
    this.statusEl.classList.toggle('ended', st.phase === 'ended');
  }

  private updateSkills(st: MobaStateView): void {
    const hero = st.heroId ? MOBA_HEROES[st.heroId] : null;
    if (!hero) {
      if (this.skillsEl.innerHTML !== '') this.skillsEl.innerHTML = '';
      this.skillsSig = '';
      return;
    }
    const level = this.sim.player?.level ?? 1;
    const sig = `${st.heroId}|${st.skillPoints}|${level}|${JSON.stringify(st.skillRanks)}`;
    if (sig === this.skillsSig) return;
    this.skillsSig = sig;
    const rows = hero.abilities.map((id, i) => {
      const def = MOBA_ABILITIES[id];
      if (!def) return '';
      const ult = i === hero.abilities.length - 1;
      const rank = st.skillRanks[id] ?? 0;
      const maxRank = ult ? 1 : MOBA_MAX_ABILITY_RANK;
      const locked = ult && level < MOBA_ULT_HERO_LEVEL;
      const canLearn = st.skillPoints > 0 && rank < maxRank && !locked;
      const pips = Array.from({ length: maxRank }, (_, p) => `<i class="pip${p < rank ? ' on' : ''}"></i>`).join('');
      const learnLabel = rank === 0 ? t('hudChrome.moba.learn') : t('hudChrome.moba.upgrade');
      return `<div class="mskill${rank === 0 ? ' unlearned' : ''}${ult ? ' ult' : ''}">
        <span class="mskill-core">
          <img src="${iconDataUrl('ability', id, 34)}" alt="${esc(def.name)}" tabindex="0" data-ability="${esc(id)}" data-rank="${rank}" data-ult="${ult ? 1 : 0}">
          <span class="pips" aria-hidden="true">${pips}</span>
          ${locked ? `<span class="mskill-lock">${esc(t('hudChrome.moba.ultLocked', { level: String(MOBA_ULT_HERO_LEVEL) }))}</span>` : ''}
        </span>
        ${canLearn ? `<button type="button" class="mskill-learn" data-learn="${esc(id)}" data-ability="${esc(id)}" data-rank="${rank}" data-ult="${ult ? 1 : 0}" aria-label="${esc(learnLabel)} ${esc(def.name)}">+</button>` : ''}
      </div>`;
    }).join('');
    const points = st.skillPoints > 0
      ? `<div class="mskill-points" role="status">${esc(t('hudChrome.moba.skillPoints', { count: String(st.skillPoints) }))}</div>`
      : '';
    this.skillsEl.innerHTML = rows + points;
    this.attachSkillTooltips(this.skillsEl);
  }

  private updateRecall(st: MobaStateView): void {
    if (!this.recallBtn) return;
    let label: string;
    let disabled = false;
    if (st.recallLeft > 0) {
      label = t('hudChrome.moba.recallChanneling', { seconds: st.recallLeft.toFixed(1) });
      disabled = true;
    } else if (st.recallReadyIn > 0) {
      label = t('hudChrome.moba.recallCooldown', { seconds: String(st.recallReadyIn) });
      disabled = true;
    } else {
      label = t('hudChrome.moba.recall');
    }
    if (this.recallBtn.textContent !== label) this.recallBtn.textContent = label;
    if (this.recallBtn.disabled !== disabled) this.recallBtn.disabled = disabled;
  }

  private updateRespawn(st: MobaStateView): void {
    if (st.respawnLeft > 0) {
      const text = t('hudChrome.moba.respawnIn', { seconds: String(st.respawnLeft) });
      if (this.respawnEl.textContent !== text) this.respawnEl.textContent = text;
      if (this.respawnEl.hidden) this.respawnEl.hidden = false;
    } else if (!this.respawnEl.hidden) {
      this.respawnEl.hidden = true;
    }
  }

  private updateBanner(st: MobaStateView): void {
    if (st.phase !== 'ended' || !st.winner) {
      this.bannerShown = false;
      if (!this.bannerEl.hidden) this.bannerEl.hidden = true;
      return;
    }
    if (this.bannerShown) return;
    this.bannerShown = true;
    const won = st.myTeam !== null && st.myTeam === st.winner;
    this.bannerEl.textContent = won ? t('hudChrome.moba.victory') : t('hudChrome.moba.defeat');
    this.bannerEl.classList.toggle('victory', won);
    this.bannerEl.classList.toggle('defeat', !won);
    this.bannerEl.hidden = false;
  }
}
