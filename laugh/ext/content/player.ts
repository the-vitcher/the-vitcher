// The YouTube DOM adapter. This is the brittle file, on purpose: everything that
// depends on YouTube's markup lives here, and the logic that consumes it is pure and
// tested elsewhere.
//
// Candidates are listed most stable first. Meta tags survive redesigns; ytd-* custom
// elements do not.

import { buildVideoMeta, type ScrapedMetadata } from '../../core/metadata';
import { parseVideoId } from '../../core/video_id';
import type { VideoMeta } from '../../core/types';

function metaContent(selector: string): string | null {
  return document.querySelector(selector)?.getAttribute('content') ?? null;
}

function text(selector: string): string | null {
  const value = document.querySelector(selector)?.textContent;
  return value ? value.trim() : null;
}

function attr(selector: string, attribute: string): string | null {
  return document.querySelector(selector)?.getAttribute(attribute) ?? null;
}

/** The main player element. YouTube also mounts preview videos, so prefer the class. */
export function findVideoElement(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('#movie_player video') ??
    document.querySelector<HTMLVideoElement>('video')
  );
}

export function currentVideoId(): string | null {
  return parseVideoId(location.href);
}

/** Live streams report Infinity, which is not a duration we can bucket. */
function usableDuration(video: HTMLVideoElement | null): number | undefined {
  if (!video) return undefined;
  const { duration } = video;
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

export function scrapeMetadata(videoId: string, video: HTMLVideoElement | null, now: number): VideoMeta {
  const scraped: ScrapedMetadata = {
    videoId,
    titleCandidates: [
      metaContent('meta[name="title"]'),
      text('#above-the-fold #title h1'),
      text('h1.ytd-watch-metadata'),
      text('#container > h1.title'),
      document.title,
    ],
    channelNameCandidates: [
      text('#owner #channel-name a'),
      text('ytd-channel-name#channel-name a'),
      text('ytd-video-owner-renderer ytd-channel-name a'),
      metaContent('meta[itemprop="author"]'),
      attr('link[itemprop="name"]', 'content'),
    ],
    channelIdCandidates: [
      metaContent('meta[itemprop="channelId"]'),
      attr('#owner a[href*="/channel/"]', 'href'),
      attr('span[itemprop="author"] link[itemprop="url"]', 'href'),
      attr('ytd-video-owner-renderer a[href*="/channel/"]', 'href'),
    ],
    durationSec: usableDuration(video),
    capturedAt: now,
  };

  return buildVideoMeta(scraped);
}

/** Right-hand control cluster, where the settings gear and fullscreen buttons live. */
export function findControlsBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ytp-right-controls');
}

/** True when the keystroke belongs to a text field rather than to us. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.getAttribute('role') === 'textbox';
}
