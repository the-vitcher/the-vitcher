import { describe, expect, it } from 'vitest';
import { createMoment } from '../core/moment';
import {
  buildExportBundle,
  isProfileCacheValid,
  mergeMoments,
  normalizeSettings,
  parseImportBundle,
} from '../core/schema';
import { emptyProfile } from '../core/profile';
import { DEFAULT_SETTINGS } from '../core/types';
import type { LaughMoment, VideoMeta } from '../core/types';

const NOW = 1_700_000_000_000;

const VIDEO: VideoMeta = {
  videoId: 'dQw4w9WgXcQ',
  title: 'A funny bit',
  channelName: 'Some Channel',
  capturedAt: NOW,
};

function moment(pressedAtSec: number, markedAt: number): LaughMoment {
  return createMoment({ video: VIDEO, pressedAtSec, lookbackSec: 2.5, markedAt });
}

describe('normalizeSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps the lookback into a sane range', () => {
    expect(normalizeSettings({ lookbackSec: -5 }).lookbackSec).toBe(0);
    expect(normalizeSettings({ lookbackSec: 999 }).lookbackSec).toBe(15);
    expect(normalizeSettings({ lookbackSec: 3 }).lookbackSec).toBe(3);
  });

  it('clamps the cluster window', () => {
    expect(normalizeSettings({ clusterWindowSec: -1 }).clusterWindowSec).toBe(0);
    expect(normalizeSettings({ clusterWindowSec: 500 }).clusterWindowSec).toBe(60);
  });

  it('keeps booleans and trims the api key', () => {
    const settings = normalizeSettings({ showPlayerButton: false, apiKey: '  abc123  ' });
    expect(settings.showPlayerButton).toBe(false);
    expect(settings.apiKey).toBe('abc123');
  });

  it('ignores a non-string api key', () => {
    expect(normalizeSettings({ apiKey: 42 }).apiKey).toBe('');
  });
});

describe('buildExportBundle', () => {
  it('never exports the api key', () => {
    const bundle = buildExportBundle([moment(100, NOW)], { ...DEFAULT_SETTINGS, apiKey: 'secret-key' }, NOW);
    expect(bundle.settings.apiKey).toBe('');
    expect(JSON.stringify(bundle)).not.toContain('secret-key');
  });

  it('tags the bundle so an import can recognise it', () => {
    const bundle = buildExportBundle([moment(100, NOW)], DEFAULT_SETTINGS, NOW);
    expect(bundle.app).toBe('laugh');
    expect(bundle.moments).toHaveLength(1);
  });
});

describe('parseImportBundle', () => {
  it('rejects anything that is not a Laugh export', () => {
    expect(parseImportBundle(null, NOW).ok).toBe(false);
    expect(parseImportBundle({ app: 'other', moments: [] }, NOW).ok).toBe(false);
    expect(parseImportBundle({ app: 'laugh', moments: [] }, NOW).ok).toBe(false);
  });

  it('round-trips an export', () => {
    const bundle = buildExportBundle([moment(100, NOW), moment(400, NOW)], DEFAULT_SETTINGS, NOW);
    const parsed = parseImportBundle(JSON.parse(JSON.stringify(bundle)), NOW);
    expect(parsed.ok).toBe(true);
    expect(parsed.moments).toHaveLength(2);
    expect(parsed.settings?.lookbackSec).toBe(DEFAULT_SETTINGS.lookbackSec);
  });

  it('keeps the good rows from a partly corrupt file', () => {
    const good = moment(100, NOW);
    const parsed = parseImportBundle({ app: 'laugh', moments: [good, { junk: true }, null] }, NOW);
    expect(parsed.ok).toBe(true);
    expect(parsed.moments).toHaveLength(1);
  });
});

describe('mergeMoments', () => {
  it('keeps both when ids differ', () => {
    expect(mergeMoments([moment(100, NOW)], [moment(400, NOW)])).toHaveLength(2);
  });

  it('prefers the newer mark on a clash', () => {
    const older = moment(100, NOW);
    const newer = moment(100, NOW + 5_000);
    const merged = mergeMoments([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0].markedAt).toBe(NOW + 5_000);
  });

  it('does not let an older import overwrite a newer mark', () => {
    const merged = mergeMoments([moment(100, NOW + 5_000)], [moment(100, NOW)]);
    expect(merged[0].markedAt).toBe(NOW + 5_000);
  });

  it('is a no-op against an empty import', () => {
    expect(mergeMoments([moment(100, NOW)], [])).toHaveLength(1);
  });
});

describe('isProfileCacheValid', () => {
  const cache = {
    profile: emptyProfile(NOW),
    momentCountAtCompute: 5,
    clusterWindowAtCompute: 8,
    lookbackAtCompute: 2.5,
  };

  it('is valid when nothing that feeds the profile changed', () => {
    expect(isProfileCacheValid(cache, 5, 8, 2.5)).toBe(true);
  });

  it('invalidates when a moment is added or removed', () => {
    expect(isProfileCacheValid(cache, 6, 8, 2.5)).toBe(false);
  });

  it('invalidates when the cluster window is retuned', () => {
    expect(isProfileCacheValid(cache, 5, 12, 2.5)).toBe(false);
  });

  it('invalidates when the lookback is retuned, which re-times every moment without changing the count', () => {
    expect(isProfileCacheValid(cache, 5, 8, 0)).toBe(false);
  });

  it('invalidates a missing cache', () => {
    expect(isProfileCacheValid(null, 5, 8, 2.5)).toBe(false);
  });
});
