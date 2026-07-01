import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; only the server-side Crawl run-rotation
// wiring (server/game.ts rotateCrawlRun) is under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { GameServer } from '../server/game';

// rotateCrawlRun() is deterministic in its control flow regardless of the wall clock:
// the first call adopts the current hour silently (no banner, no run reset), a call in
// the same hour is a no-op, and a call whose stored index differs from "now" rotates:
// it calls sim.startCrawlRun() and broadcasts exactly one localizable banner.
describe('The Crawl: server-side hourly run rotation', () => {
  it('first tick adopts the current run silently, then no-ops within the same hour', () => {
    const server = new GameServer();
    const broadcast = vi.spyOn(server as any, 'broadcastSystem');
    const startRun = vi.spyOn((server as any).sim, 'startCrawlRun');

    expect((server as any).crawlRunIndex).toBeNull();
    (server as any).rotateCrawlRun();
    // Adopted the live hour, but nobody was mid-run, so no reset and no announcement.
    expect((server as any).crawlRunIndex).not.toBeNull();
    expect(startRun).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();

    // A second call in the same hour changes nothing.
    (server as any).rotateCrawlRun();
    expect(startRun).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('rotates the run and announces it once when the hour rolls over', () => {
    const server = new GameServer();
    const broadcast = vi.spyOn(server as any, 'broadcastSystem').mockImplementation(() => {});
    const startRun = vi.spyOn((server as any).sim, 'startCrawlRun');

    // Pretend the sim is still playing the previous hour; the next rotate detects the
    // rollover (current wall-clock hour differs) and starts a fresh run.
    (server as any).crawlRunIndex = 0;
    (server as any).rotateCrawlRun();

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
    const banner = broadcast.mock.calls[0][0] as string;
    expect(banner).toMatch(/^The Crawl resets\. Run \d+ of 24 begins\.$/);
  });
});
