// Background service worker: the single writer.
//
// Nothing is kept in module scope between wakes, because MV3 terminates this worker
// whenever it goes idle. Each message is a self-contained read-modify-write.

import { createMoment } from '../core/moment';
import { remaining } from '../core/quota';
import { buildExportBundle, parseImportBundle } from '../core/schema';
import { rankCandidates } from '../core/scoring';
import { fail, ok, type LaughMessage, type Reply, type SuggestionsView } from './messages';
import { createCandidateSource } from './youtube_api';
import {
  addMoment,
  clearAllMoments,
  deleteMoment,
  deleteVideo,
  dismissSuggestion,
  getProfile,
  importMoments,
  readDismissed,
  readLedger,
  readMoments,
  readSettings,
  readSuggestions,
  retimeMoments,
  saveSettings,
  writeLedger,
  writeSuggestions,
} from './storage';

const MARK_COMMAND = 'mark-laugh';

async function snapshot() {
  const [moments, settings, profile] = await Promise.all([readMoments(), readSettings(), getProfile()]);
  return { moments, settings, profile };
}

async function suggestionsView(now: number): Promise<SuggestionsView> {
  const [cache, settings, ledger] = await Promise.all([readSuggestions(), readSettings(), readLedger(now)]);
  const dismissed = new Set(await readDismissed());

  return {
    ranked: (cache?.ranked ?? []).filter((entry) => !dismissed.has(entry.candidate.videoId)),
    notes: cache?.notes ?? [],
    fetchedAt: cache?.fetchedAt ?? null,
    configured: settings.apiKey.trim().length > 0,
    quotaRemaining: remaining(ledger, now),
    quotaSpentToday: ledger.spent,
  };
}

/**
 * Spends quota to look for new candidates, then ranks them against the profile.
 * Videos already marked, or previously dismissed, are excluded before ranking.
 */
async function refreshSuggestions(now: number): Promise<SuggestionsView> {
  const [settings, profile, moments, ledger, dismissed] = await Promise.all([
    readSettings(),
    getProfile(),
    readMoments(),
    readLedger(now),
    readDismissed(),
  ]);

  const source = createCandidateSource({
    apiKey: settings.apiKey,
    allowSearch: settings.allowSearchQuota,
  });

  const result = await source.fetchCandidates(profile, ledger, now);
  await writeLedger(result.ledger);

  const seen = new Set<string>([...moments.map((m) => m.videoId), ...dismissed]);
  const ranked = rankCandidates(profile, result.candidates, { now, seenVideoIds: seen });

  await writeSuggestions({
    fetchedAt: now,
    ranked,
    notes: result.notes,
    unitsSpent: result.unitsSpent,
  });

  return suggestionsView(now);
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

    case 'laugh:getSuggestions':
      return ok(await suggestionsView(Date.now()));

    case 'laugh:refreshSuggestions':
      return ok(await refreshSuggestions(Date.now()));

    case 'laugh:dismissSuggestion':
      await dismissSuggestion(message.videoId);
      return ok(await suggestionsView(Date.now()));

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
