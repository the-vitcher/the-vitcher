// The typed contract between the content script, the extension pages, and the
// service worker. Every storage write goes through the worker, so these messages are
// the only way anything else changes state.

import type { ExportBundle } from '../core/schema';
import type { LaughMoment, Settings, TasteProfile, VideoMeta } from '../core/types';

/** Content script to worker: record a press. */
export type MarkMessage = {
  type: 'laugh:mark';
  video: VideoMeta;
  pressedAtSec: number;
};

export type MarkResult = {
  moment: LaughMoment;
  /** Presses in the episode this one landed in, so the toast can show a streak. */
  intensity: number;
  totalMoments: number;
};

/** Worker to content script: the browser hotkey fired, read the player and mark. */
export type RequestMarkMessage = { type: 'laugh:requestMark' };

/** Page to worker: everything the feed and popup need in one round trip. */
export type GetSnapshotMessage = { type: 'laugh:getSnapshot' };

export type Snapshot = {
  moments: LaughMoment[];
  settings: Settings;
  profile: TasteProfile;
};

export type DeleteMomentMessage = { type: 'laugh:deleteMoment'; id: string };
export type DeleteVideoMessage = { type: 'laugh:deleteVideo'; videoId: string };
export type ClearAllMessage = { type: 'laugh:clearAll' };
export type SaveSettingsMessage = { type: 'laugh:saveSettings'; settings: Settings };
export type ExportMessage = { type: 'laugh:export' };
export type ImportMessage = { type: 'laugh:import'; bundle: unknown };

export type LaughMessage =
  | MarkMessage
  | RequestMarkMessage
  | GetSnapshotMessage
  | DeleteMomentMessage
  | DeleteVideoMessage
  | ClearAllMessage
  | SaveSettingsMessage
  | ExportMessage
  | ImportMessage;

/** Every handler answers in this shape, so callers have one error path. */
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Reply<T> {
  return { ok: true, data };
}

export function fail(error: string): Reply<never> {
  return { ok: false, error };
}

export type ReplyFor<M extends LaughMessage> = M extends MarkMessage
  ? Reply<MarkResult>
  : M extends GetSnapshotMessage
    ? Reply<Snapshot>
    : M extends ExportMessage
      ? Reply<ExportBundle>
      : M extends ImportMessage
        ? Reply<{ imported: number; total: number }>
        : M extends RequestMarkMessage
          ? Reply<MarkResult>
          : Reply<Snapshot>;

/**
 * Send to the worker and surface a disconnected worker as a normal failed reply
 * rather than an unhandled rejection.
 */
export async function send<M extends LaughMessage>(message: M): Promise<ReplyFor<M>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as ReplyFor<M>;
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Laugh background worker is unavailable.') as ReplyFor<M>;
  }
}
