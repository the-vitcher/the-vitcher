import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; the CLASH_MODE realm wiring
// (auto-enter, wire fields, command dispatch) is what is under test.
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

import { GameServer, ClientSession } from '../server/game';
import { ClientWorld } from '../src/net/online';
import { MOBA_HEROES } from '../src/sim/content/moba';

interface FakeClient { sent: any[]; ws: any }
function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) } };
}
function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].t === 'snap') return sent[i];
  return null;
}
function join(server: GameServer, fc: FakeClient, id: number, name: string): ClientSession {
  const session = server.join(fc.ws, id, id, name, 'warrior', null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}
// A bare ClientWorld (no socket) that can still decode snapshots — the
// snapshots.test.ts pattern for asserting wire lockstep.
function bareClient(pid: number): ClientWorld {
  const c: any = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 20061, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = pid;
  c.moveInput = {};
  c.inventory = [];
  c.vendorBuyback = [];
  c.equipment = {};
  c.accountCosmetics = { completedQuestIds: [], mechChromaIds: [] };
  c.copper = 0;
  c.xp = 0;
  c.known = [];
  c.questLog = new Map();
  c.questsDone = new Set();
  c.pendingQuestCommands = new Map();
  c.partyInfo = null;
  c.tradeInfo = null;
  c.duelInfo = null;
  c.lastSnapAt = 0;
  c.snapInterval = 50;
  c.missingSince = new Map();
  c.pendingFacingDelta = 0;
  c.connected = true;
  c.eventQueue = [];
  c.mouselookFacing = null;
  c.lastInputSentAt = 0;
  c.lastInputSig = '';
  c.inputSeq = 0;
  c.pendingInputSeqSentAt = new Map();
  c.ackedInputSeq = 0;
  c.inputEchoSamples = [];
  return c;
}

const clashServer = (): GameServer => {
  process.env.CLASH_MODE = '1';
  const server = new GameServer();
  return server;
};
afterEach(() => { delete process.env.CLASH_MODE; });

describe('The Clash online: CLASH_MODE realm', () => {
  it('joiners land in the lobby (no auto-seat); host/join/start builds the match', () => {
    const server = clashServer();
    const a = join(server, fakeWs(), 1, 'Alpha');
    const b = join(server, fakeWs(), 2, 'Beta');
    const sim: any = (server as any).sim;
    expect(sim.mobaMatch).toBeFalsy();
    // Alpha hosts a 3v3, Beta joins it from the list, Alpha starts early.
    server.handleMessage(a, JSON.stringify({ t: 'cmd', cmd: 'moba_create', size: 3 }));
    const gameId = sim.mobaLobby(a.pid).games[0].id;
    expect(sim.mobaLobby(b.pid).games).toHaveLength(1);
    server.handleMessage(b, JSON.stringify({ t: 'cmd', cmd: 'moba_join', game: gameId }));
    expect(sim.mobaLobby(a.pid).games[0].joined).toBe(2);
    server.handleMessage(a, JSON.stringify({ t: 'cmd', cmd: 'moba_start' }));
    expect(sim.mobaMatch).toBeTruthy();
    expect(sim.entities.get(a.pid)?.mobaTeam).toBe('A');
    expect(sim.entities.get(b.pid)?.mobaTeam).toBe('B');
    // the lobby cleared and both players read as seated (lobby view null)
    expect(sim.mobaLobby(a.pid)).toBeNull();
  });

  it('sends the lobby view (mlb) on the wire, decoded by ClientWorld', () => {
    const server = clashServer();
    const fc = fakeWs();
    const session = join(server, fc, 1, 'Alpha');
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_create', size: 5 }));
    (server as any).sim.tick();
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fc.sent);
    expect(snap.self.mlb).toBeTruthy();
    expect(snap.self.mlb.games).toHaveLength(1);
    expect(snap.self.mlb.games[0]).toMatchObject({ teamSize: 5, joined: 1, capacity: 10, mine: true, isHost: true, host: 'Alpha' });
    const client = bareClient(session.pid);
    (client as any).applySnapshot(snap);
    expect(client.mobaLobby()?.games[0].capacity).toBe(10);
    expect(client.mobaLobby()?.inGameId).toBe(snap.self.mlb.games[0].id);
  });

  it('sends the match view (mst) and team tags (mt) on the wire, decoded by ClientWorld', () => {
    const server = clashServer();
    const fc = fakeWs();
    const session = join(server, fc, 1, 'Alpha');
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_create', size: 3 }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_start' }));
    (server as any).sim.tick();
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fc.sent);
    expect(snap).toBeTruthy();
    expect(snap.self.mst).toBeTruthy();
    expect(snap.self.mst.phase).toBe('warmup');
    expect(snap.self.mst.towersA).toBe(9);
    // the minimap's per-structure liveness rides the same view
    const allUp = [[true, true, true], [true, true, true], [true, true, true]];
    expect(snap.self.mst.towersAliveA).toEqual(allUp);
    expect(snap.self.mst.towersAliveB).toEqual(allUp);
    expect(snap.self.mst.coreAliveA).toBe(true);
    expect(snap.self.mst.bossAlive).toBe(true);
    expect(snap.self.mt).toBe('A');
    // decode through the real client
    const client = bareClient(session.pid);
    (client as any).applySnapshot(snap);
    expect(client.mobaState()?.myTeam).toBe('A');
    expect(client.mobaState()?.towersB).toBe(9);
    expect(client.mobaState()?.towersAliveB).toEqual(allUp);
    expect(client.mobaState()?.coreAliveB).toBe(true);
    expect(client.entities.get(session.pid)?.mobaTeam).toBe('A');
  });

  it('dispatches moba_pick and moba_learn commands into the sim', () => {
    const server = clashServer();
    const fc = fakeWs();
    const session = join(server, fc, 1, 'Alpha');
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_pick', hero: 'gerald' }));
    const sim: any = (server as any).sim;
    const meta = sim.players.get(session.pid);
    expect(meta.mobaHeroId).toBe('gerald');
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_learn', ability: MOBA_HEROES.gerald.abilities[0] }));
    expect(meta.known.map((k: any) => k.def.id)).toEqual([MOBA_HEROES.gerald.abilities[0]]);
    // bad ids are safe no-ops
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'moba_pick', hero: 42 }));
    expect(meta.mobaHeroId).toBe('gerald');
  });

  it('normal realms (no CLASH_MODE) send neither mst nor mt', () => {
    delete process.env.CLASH_MODE;
    const server = new GameServer();
    const fc = fakeWs();
    join(server, fc, 1, 'Alpha');
    (server as any).sim.tick();
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fc.sent);
    expect(snap.self.mst).toBeUndefined();
    expect(snap.self.mt).toBeUndefined();
  });
});

describe('The Clash online: standalone world flag', () => {
  it('the hello payload tells the client this is a Clash realm before any snapshot', () => {
    const server = clashServer();
    const fc = fakeWs();
    join(server, fc, 9, 'Flag');
    const hello = fc.sent.find((m: any) => m.t === 'hello');
    expect(hello).toBeTruthy();
    expect(hello.clash).toBe(1);
  });
});
