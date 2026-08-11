// Guards the seam between the language-agnostic Grayscale core and the catalog.
//
// Core records carry i18n keys as plain strings so `src/grayscale/core/` stays
// free of any `t()` dependency, which means the compiler cannot check them. The
// host narrows them back to catalog keys in `tContent`; these tests are what
// make that narrowing safe, so a raid, boss, or item added to the core without
// its English string fails here rather than rendering a raw key at a player.

import { describe, it, expect } from 'vitest';
import { RAIDS } from '../src/grayscale/core/raids';
import { grayscaleStrings } from '../src/ui/i18n.catalog/grayscale';
import { en } from '../src/ui/i18n.catalog';

/** Resolves a dotted key against the English catalog, or undefined if missing. */
function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en,
  );
}

function expectResolves(key: string): void {
  const value = lookup(key);
  expect(typeof value, `${key} should resolve to a string in the English catalog`).toBe('string');
  expect((value as string).length, `${key} should not be empty`).toBeGreaterThan(0);
}

describe('grayscale content keys resolve', () => {
  it('registers the domain under the `grayscale` namespace', () => {
    expect(en.grayscale).toBe(grayscaleStrings);
  });

  it('resolves every raid name and tagline', () => {
    for (const raid of RAIDS) {
      expectResolves(raid.nameKey);
      expectResolves(raid.taglineKey);
    }
  });

  it('resolves every boss name', () => {
    for (const raid of RAIDS) {
      for (const boss of raid.bosses) expectResolves(boss.nameKey);
    }
  });

  it('resolves every loot item name', () => {
    for (const raid of RAIDS) {
      for (const entry of raid.loot) expectResolves(entry.itemKey);
    }
  });

  it('has no unreachable strings in the bosses and items tables', () => {
    const referenced = new Set<string>();
    for (const raid of RAIDS) {
      for (const boss of raid.bosses) referenced.add(boss.nameKey);
      for (const entry of raid.loot) referenced.add(entry.itemKey);
    }
    for (const name of Object.keys(grayscaleStrings.bosses)) {
      expect(referenced.has(`grayscale.bosses.${name}`), `grayscale.bosses.${name} is unused`).toBe(true);
    }
    for (const name of Object.keys(grayscaleStrings.items)) {
      expect(referenced.has(`grayscale.items.${name}`), `grayscale.items.${name} is unused`).toBe(true);
    }
  });
});

describe('grayscale catalog hygiene', () => {
  /** Every leaf string in the domain, as [dotted key, value]. */
  function leaves(node: unknown, prefix: string): [string, string][] {
    if (typeof node === 'string') return [[prefix, node]];
    if (!node || typeof node !== 'object') return [];
    return Object.entries(node as Record<string, unknown>)
      .flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
  }

  const all = leaves(grayscaleStrings, 'grayscale');

  it('ships English for every key', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const [key, value] of all) {
      expect(value.trim().length, `${key} is empty`).toBeGreaterThan(0);
    }
  });

  it('uses no em dashes, en dashes, or emojis', () => {
    for (const [key, value] of all) {
      expect(value.includes('—'), `${key} contains an em dash`).toBe(false);
      expect(value.includes('–'), `${key} contains an en dash`).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(value), `${key} contains an emoji`).toBe(false);
    }
  });

  it('leaves no placeholder unclosed', () => {
    for (const [key, value] of all) {
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      expect(opens, `${key} has unbalanced placeholder braces`).toBe(closes);
    }
  });
});
