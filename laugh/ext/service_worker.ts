// Background service worker: the single writer.
//
// Nothing is kept in module scope between wakes, because MV3 terminates this worker
// whenever it goes idle. Each message is a self-contained read-modify-write.

import { createMoment } from '../core/moment';
import { buildExportBundle, parseImportBundle } from '../core/schema';
import { fail, ok, type LaughMessage, type Reply } from './messages';
import {
  addMoment,
  clearAllMoments,
  deleteMoment,
  deleteVideo,
  getProfile,
  importMoments,
  readMoments,
  readSettings,
  retimeMoments,
  saveSettings,
} from './storage';

const MARK_COMMAND = 'mark-laugh';

async function snapshot() {
  const [moments, settings, profile] = await Promise.all([readMoments(), readSettings(), getProfile()]);
  return { moments, settings, profile };
}

async function handle(message: LaughMessage): Promise<Reply<unknown>> {
  switch (message.type) {
    case 'laugh:mark': {
      const settings = await readSettings();
      const moment = createMoment({
        video: message.video,
        pressedAtSec: message.pressedAtSec,
        lookbackSec: settings.lookbackSec,
        markedAt: Date.now(),
      });
      return ok(await addMoment(moment));
    }

    case 'laugh:getSnapshot':
      return ok(await snapshot());

    case 'laugh:deleteMoment':
      await deleteMoment(message.id);
      return ok(await snapshot());

    case 'laugh:deleteVideo':
      await deleteVideo(message.videoId);
      return ok(await snapshot());

    case 'laugh:clearAll':
      await clearAllMoments();
      return ok(await snapshot());

    case 'laugh:saveSettings': {
      const previous = await readSettings();
      const saved = await saveSettings(message.settings);
      // Retuning the lookback fixes history too, since the raw press times are kept.
      if (saved.lookbackSec !== previous.lookbackSec) await retimeMoments(saved.lookbackSec);
      return ok(await snapshot());
    }

    case 'laugh:export': {
      const [moments, settings] = await Promise.all([readMoments(), readSettings()]);
      return ok(buildExportBundle(moments, settings, Date.now()));
    }

    case 'laugh:import': {
      const parsed = parseImportBundle(message.bundle, Date.now());
      if (!parsed.ok) return fail(parsed.error ?? 'Could not read that file.');
      return ok(await importMoments(parsed.moments));
    }

    default:
      return fail('Unknown message.');
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message as LaughMessage).then(sendResponse, (error: unknown) => {
    sendResponse(fail(error instanceof Error ? error.message : 'Laugh hit an unexpected error.'));
  });
  // Keeps the message channel open for the async reply above.
  return true;
});

// The browser-level hotkey fires here, not in the page, so bounce it to the content
// script which is the only context that can read the player clock.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== MARK_COMMAND) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number') return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'laugh:requestMark' });
  } catch {
    // No content script on this tab, for example a non-YouTube page. Nothing to do.
  }
});
