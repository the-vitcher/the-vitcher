import { describe, expect, it } from 'vitest';
import {
  buildVideoMeta,
  channelKey,
  cleanTitle,
  pickChannelId,
  pickChannelName,
  pickTitle,
} from '../core/metadata';

describe('cleanTitle', () => {
  it('strips the YouTube suffix document.title carries', () => {
    expect(cleanTitle('A funny bit - YouTube')).toBe('A funny bit');
  });

  it('strips the unread notification count prefix', () => {
    expect(cleanTitle('(12) A funny bit - YouTube')).toBe('A funny bit');
  });

  it('leaves a clean title alone', () => {
    expect(cleanTitle('A funny bit')).toBe('A funny bit');
  });

  it('does not eat a hyphen that is part of the title', () => {
    expect(cleanTitle('Sketch - the sequel - YouTube')).toBe('Sketch - the sequel');
  });
});

describe('pickTitle', () => {
  it('takes the first usable candidate, so callers order by stability', () => {
    expect(pickTitle(['From meta tag', 'From document.title'])).toBe('From meta tag');
  });

  it('falls through empty and placeholder candidates', () => {
    expect(pickTitle([null, undefined, '', 'YouTube', 'Real title - YouTube'])).toBe('Real title');
  });

  it('falls back to a placeholder when everything failed', () => {
    expect(pickTitle([null, '', 'YouTube'])).toBe('Untitled video');
  });
});

describe('pickChannelName', () => {
  it('drops a leading @ from a handle', () => {
    expect(pickChannelName(['@somechannel'])).toBe('somechannel');
  });

  it('skips placeholders', () => {
    expect(pickChannelName(['', 'YouTube', 'Real Channel'])).toBe('Real Channel');
  });

  it('falls back when nothing is usable', () => {
    expect(pickChannelName([null, ''])).toBe('Unknown channel');
  });
});

describe('pickChannelId', () => {
  const ID = 'UCuAXFkgsw1L7xaCfnd5JJOw';

  it('accepts a well formed channel id', () => {
    expect(pickChannelId([ID])).toBe(ID);
  });

  it('extracts an id out of a channel url', () => {
    expect(pickChannelId([`https://www.youtube.com/channel/${ID}`])).toBe(ID);
  });

  it('rejects a handle or anything malformed', () => {
    expect(pickChannelId(['@somechannel', 'UCtooshort', null])).toBeUndefined();
  });
});

describe('buildVideoMeta', () => {
  it('assembles a snapshot from scraped candidates', () => {
    const meta = buildVideoMeta({
      videoId: 'dQw4w9WgXcQ',
      titleCandidates: [null, '(3) Real title - YouTube'],
      channelNameCandidates: ['', '@funnyperson'],
      channelIdCandidates: ['UCuAXFkgsw1L7xaCfnd5JJOw'],
      durationSec: 212,
      capturedAt: 500,
    });
    expect(meta).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'Real title',
      channelName: 'funnyperson',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      durationSec: 212,
      capturedAt: 500,
    });
  });

  it('omits an absent or invalid duration rather than storing zero', () => {
    const meta = buildVideoMeta({
      videoId: 'dQw4w9WgXcQ',
      titleCandidates: ['T'],
      channelNameCandidates: ['C'],
      channelIdCandidates: [],
      durationSec: Number.NaN,
      capturedAt: 1,
    });
    expect(meta.durationSec).toBeUndefined();
    expect(meta.channelId).toBeUndefined();
  });
});

describe('channelKey', () => {
  it('prefers the stable id over the display name', () => {
    expect(channelKey({ channelId: 'UC123', channelName: 'Name' })).toBe('id:UC123');
  });

  it('falls back to a case-insensitive name', () => {
    expect(channelKey({ channelName: 'Some Channel' })).toBe(channelKey({ channelName: 'some channel' }));
  });

  it('does not collide a name key with an id key', () => {
    expect(channelKey({ channelName: 'UC123' })).not.toBe(channelKey({ channelId: 'UC123', channelName: 'x' }));
  });
});
