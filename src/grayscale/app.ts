// The Grayscale host: a thin renderer over the pure core. It owns exactly three
// things the core refuses to: the wall clock, the DOM, and localStorage. Every
// decision about what the numbers mean lives in ./core.
//
// Every player-visible string goes through `t()`; every number through
// `formatNumber`.

import { t, formatNumber, type TranslationKey } from '../ui/i18n';
import {
  type GrayscaleState,
  type RaidAvailability,
  type RaidRunResult,
  DAILY_GOAL_MINUTES,
  activeSessionMinutes,
  bankedMinutes,
  characterOf,
  currentStreak,
  earnedMinutes,
  endFocus,
  raidAvailability,
  raidById,
  sendOnRaid,
  startFocus,
  todayMinutes,
} from './core';
import { load, save } from './storage';

/** How many runs the log shows, newest first. */
const RUN_LOG_LIMIT = 6;
/** Repaint cadence while a session is running, so the elapsed minute ticks over. */
const TICK_MS = 1_000;

/**
 * Resolves a content key carried by a core record. The core stays language
 * agnostic, so its `nameKey` / `taglineKey` / `itemKey` fields are plain
 * strings; this is the one place that narrows them back to catalog keys.
 * `tests/grayscale_content_i18n.test.ts` asserts every shipped key resolves, so
 * the narrowing cannot silently drift into a missing string.
 */
function tContent(key: string): string {
  return t(key as TranslationKey);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class GrayscaleApp {
  private state: GrayscaleState;
  private storageOk = true;
  private timer: number | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.state = load();
  }

  start(): void {
    document.title = t('grayscale.documentTitle');
    this.render();
    this.timer = window.setInterval(() => {
      if (this.state.activeSince !== null) this.render();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Minutes to ADD to UTC for local time, the sign the core expects. */
  private tzOffsetMinutes(): number {
    return -new Date().getTimezoneOffset();
  }

  private commit(next: GrayscaleState): void {
    this.state = next;
    this.storageOk = save(next);
    this.render();
  }

  private render(): void {
    const now = Date.now();
    const tz = this.tzOffsetMinutes();

    this.mount.replaceChildren(
      this.renderHeader(),
      this.renderFocus(now),
      this.renderCharacter(now, tz),
      this.renderRaids(now, tz),
      this.renderRunLog(),
      ...(this.storageOk ? [] : [el('p', 'gs-warning', t('grayscale.storage.unavailable'))]),
    );
  }

  private renderHeader(): HTMLElement {
    const header = el('header', 'gs-header');
    header.append(
      el('h1', 'gs-title', t('grayscale.title')),
      el('p', 'gs-tagline', t('grayscale.tagline')),
    );
    return header;
  }

  private renderFocus(now: number): HTMLElement {
    const section = el('section', 'gs-card gs-focus');
    const active = this.state.activeSince !== null;

    section.append(
      el('p', 'gs-focus-state', t(active ? 'grayscale.focus.active' : 'grayscale.focus.idle')),
      el('p', 'gs-focus-elapsed', t('grayscale.focus.elapsed', {
        minutes: formatNumber(activeSessionMinutes(this.state, now)),
      })),
    );

    const button = el('button', 'gs-button gs-focus-button');
    button.type = 'button';
    button.textContent = t(active ? 'grayscale.focus.stop' : 'grayscale.focus.start');
    button.addEventListener('click', () => {
      const at = Date.now();
      this.commit(active ? endFocus(this.state, at) : startFocus(this.state, at));
    });

    section.append(button, el('p', 'gs-hint', t('grayscale.focus.hint')));
    return section;
  }

  private renderCharacter(now: number, tz: number): HTMLElement {
    const character = characterOf(this.state, now, tz);
    const section = el('section', 'gs-card gs-character');

    section.append(el('h2', 'gs-level', t('grayscale.stats.level', {
      level: formatNumber(character.level),
    })));

    const xpText = character.xpForNext > 0
      ? t('grayscale.stats.xp', {
        xp: formatNumber(character.xp),
        next: formatNumber(character.xpForNext),
      })
      : t('grayscale.stats.xpCapped', { xp: formatNumber(character.xp) });

    const bar = el('div', 'gs-xp-bar');
    const fill = el('div', 'gs-xp-fill');
    const pct = character.xpForNext > 0
      ? Math.min(100, (character.xp / character.xpForNext) * 100)
      : 100;
    fill.style.width = `${pct}%`;
    bar.append(fill);
    section.append(bar, el('p', 'gs-xp-text', xpText));

    section.append(this.renderStatGrid([
      [t('grayscale.stats.banked'), t('grayscale.stats.bankedUnit', {
        minutes: formatNumber(bankedMinutes(this.state, now)),
      })],
      [t('grayscale.stats.today'), t('grayscale.stats.todayOfGoal', {
        minutes: formatNumber(todayMinutes(this.state, now, tz)),
        goal: formatNumber(DAILY_GOAL_MINUTES),
      })],
      [t('grayscale.stats.streak'), t('grayscale.stats.streakUnit', {
        days: formatNumber(currentStreak(this.state, now, tz)),
      })],
      [t('grayscale.stats.lifetime'), t('grayscale.stats.bankedUnit', {
        minutes: formatNumber(earnedMinutes(this.state, now)),
      })],
      [t('grayscale.stats.might'), formatNumber(character.might)],
      [t('grayscale.stats.ward'), formatNumber(character.ward)],
    ]));

    return section;
  }

  private renderStatGrid(rows: [string, string][]): HTMLElement {
    const grid = el('dl', 'gs-stats');
    for (const [label, value] of rows) {
      // Each pair gets its own wrapper (valid inside a <dl> since HTML 5.2) so
      // the grid lays out one cell per stat. Without it every dt and dd is an
      // independent grid item and labels interleave with the wrong values.
      const cell = el('div', 'gs-stat');
      cell.append(el('dt', 'gs-stat-label', label), el('dd', 'gs-stat-value', value));
      grid.append(cell);
    }
    return grid;
  }

  private renderRaids(now: number, tz: number): HTMLElement {
    const section = el('section', 'gs-card gs-raids');
    section.append(el('h2', 'gs-heading', t('grayscale.raids.heading')));

    for (const entry of raidAvailability(this.state, now, tz)) {
      section.append(this.renderRaidRow(entry, tz));
    }
    return section;
  }

  private renderRaidRow(entry: RaidAvailability, tz: number): HTMLElement {
    const { raid } = entry;
    const row = el('article', entry.runnable ? 'gs-raid' : 'gs-raid gs-raid-locked');

    const heading = el('h3', 'gs-raid-name', tContent(raid.nameKey));
    if (entry.cleared) heading.append(el('span', 'gs-badge', t('grayscale.raids.cleared')));
    row.append(heading, el('p', 'gs-raid-tagline', tContent(raid.taglineKey)));

    const meta = el('p', 'gs-raid-meta');
    meta.append(
      el('span', 'gs-chip', t('grayscale.raids.cost', { minutes: formatNumber(raid.costMinutes) })),
      el('span', 'gs-chip', t('grayscale.raids.attempts', { attempts: formatNumber(raid.attempts) })),
      el('span', 'gs-chip', t('grayscale.raids.requiresLevel', { level: formatNumber(raid.minLevel) })),
    );
    row.append(meta);

    const button = el('button', 'gs-button gs-raid-send');
    button.type = 'button';
    button.disabled = !entry.runnable;
    button.textContent = t('grayscale.raids.send');
    button.addEventListener('click', () => {
      const sent = sendOnRaid(this.state, raid.id, Date.now(), tz);
      if (sent.result) this.commit(sent.state);
    });
    row.append(button);

    if (!entry.runnable) row.append(el('p', 'gs-raid-blocked', this.blockerText(entry)));
    return row;
  }

  private blockerText(entry: RaidAvailability): string {
    switch (entry.blocker) {
      case 'level':
        return t('grayscale.raids.blocked.level', { levels: formatNumber(entry.levelsShort) });
      case 'minutes':
        return t('grayscale.raids.blocked.minutes', { minutes: formatNumber(entry.minutesShort) });
      case 'focusing':
        return t('grayscale.raids.blocked.focusing');
      default:
        return '';
    }
  }

  private renderRunLog(): HTMLElement {
    const section = el('section', 'gs-card gs-runs');
    section.append(el('h2', 'gs-heading', t('grayscale.run.heading')));

    if (this.state.runs.length === 0) {
      section.append(el('p', 'gs-hint', t('grayscale.run.empty')));
      return section;
    }

    for (const run of this.state.runs.slice(-RUN_LOG_LIMIT).reverse()) {
      section.append(this.renderRun(run));
    }
    return section;
  }

  private renderRun(run: RaidRunResult): HTMLElement {
    const raid = raidById(run.raidId);
    const article = el('article', run.cleared ? 'gs-run gs-run-cleared' : 'gs-run');

    const wipedBoss = run.wipedOnBossId
      ? raid?.bosses.find((boss) => boss.id === run.wipedOnBossId)
      : undefined;
    const headline = run.cleared
      ? t('grayscale.run.cleared', { raid: raid ? tContent(raid.nameKey) : run.raidId })
      : t('grayscale.run.wiped', { boss: wipedBoss ? tContent(wipedBoss.nameKey) : run.raidId });
    article.append(el('h3', 'gs-run-headline', headline));

    const bossList = el('ul', 'gs-run-bosses');
    for (const outcome of run.bosses) {
      const boss = raid?.bosses.find((candidate) => candidate.id === outcome.bossId);
      const name = boss ? tContent(boss.nameKey) : outcome.bossId;
      const text = !outcome.defeated
        ? t('grayscale.run.bossNotReached', { boss: name })
        : outcome.wipes > 0
          ? t('grayscale.run.bossWipes', { boss: name, wipes: formatNumber(outcome.wipes) })
          : t('grayscale.run.bossDefeated', { boss: name });
      bossList.append(el('li', outcome.defeated ? 'gs-boss' : 'gs-boss gs-boss-failed', text));
    }
    article.append(bossList);

    const meta = el('p', 'gs-run-meta');
    meta.append(
      el('span', 'gs-chip', t('grayscale.run.attemptsUsed', {
        used: formatNumber(run.attemptsUsed),
        total: formatNumber(raid?.attempts ?? run.attemptsUsed),
      })),
      el('span', 'gs-chip', t('grayscale.run.spent', { minutes: formatNumber(run.minutesSpent) })),
    );
    article.append(meta);

    const loot = el('p', 'gs-run-loot');
    loot.append(el('span', 'gs-loot-label', t('grayscale.run.lootHeading')));
    if (run.loot.length === 0) {
      loot.append(el('span', 'gs-loot-empty', t('grayscale.run.lootEmpty')));
    } else {
      for (const itemKey of run.loot) loot.append(el('span', 'gs-loot', tContent(itemKey)));
    }
    article.append(loot);

    return article;
  }
}
