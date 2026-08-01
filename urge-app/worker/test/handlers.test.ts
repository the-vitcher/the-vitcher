import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn(async (_params: { model: string }) => ({
  content: [{ type: "text", text: "Ride it out, ten slow breaths." }],
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create: createMock };
    constructor(_options: unknown) {}
  }
  return { default: FakeAnthropic };
});

// Imported after the mock so the worker picks up the fake client.
const { default: worker } = await import("../src/index");
type Env = import("../src/index").Env;

function fakeKV(): KVNamespace {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
  } as unknown as KVNamespace;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { ANTHROPIC_API_KEY: "test-key", RATE_KV: fakeKV(), ...overrides };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const coachBody = {
  device_id: "device-1",
  urge: "snacking",
  local_time: "23:10",
  tag: "bored",
  week: { events: 4, rode: 3, common_hour: "20-24" },
  last: { outcome: "rode", minutes: 12 },
};

const weekStats = {
  events: 6,
  rode: 4,
  gave_in: 2,
  by_band: [0, 0, 1, 1, 1, 3],
  top_tags: ["bored"],
};

const reportBody = {
  device_id: "device-1",
  this_week: weekStats,
  last_week: weekStats,
};

beforeEach(() => {
  createMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routing", () => {
  it("rejects non-POST", async () => {
    const res = await worker.fetch(
      new Request("https://worker.test/coach", { method: "GET" }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
  });

  it("404s unknown paths", async () => {
    const res = await worker.fetch(post("/nope", {}), makeEnv());
    expect(res.status).toBe(404);
  });
});

describe("POST /coach", () => {
  it("returns a coach line", async () => {
    const res = await worker.fetch(post("/coach", coachBody), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Ride it out, ten slow breaths." });
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("uses the cheap model by default and honors the override", async () => {
    await worker.fetch(post("/coach", coachBody), makeEnv());
    expect(createMock.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-4-5" });

    createMock.mockClear();
    await worker.fetch(post("/coach", coachBody), makeEnv({ COACH_MODEL: "claude-opus-4-8" }));
    expect(createMock.mock.calls[0][0]).toMatchObject({ model: "claude-opus-4-8" });
  });

  it("rejects a malformed body without calling Claude", async () => {
    const res = await worker.fetch(post("/coach", { urge: "snacking" }), makeEnv());
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("survives a non-JSON body", async () => {
    const res = await worker.fetch(
      new Request("https://worker.test/coach", { method: "POST", body: "not json" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("rate limits a device after 40 calls the same day", async () => {
    const env = makeEnv();
    for (let i = 0; i < 40; i++) {
      const ok = await worker.fetch(post("/coach", coachBody), env);
      expect(ok.status).toBe(200);
    }
    const limited = await worker.fetch(post("/coach", coachBody), env);
    expect(limited.status).toBe(429);
    expect(createMock).toHaveBeenCalledTimes(40);
  });

  it("rate limits per device, not globally", async () => {
    const env = makeEnv();
    for (let i = 0; i < 40; i++) {
      await worker.fetch(post("/coach", coachBody), env);
    }
    const other = await worker.fetch(
      post("/coach", { ...coachBody, device_id: "device-2" }),
      env,
    );
    expect(other.status).toBe(200);
  });

  it("returns 500 when the Claude call throws", async () => {
    createMock.mockRejectedValueOnce(new Error("upstream down"));
    const res = await worker.fetch(post("/coach", coachBody), makeEnv());
    expect(res.status).toBe(500);
  });
});

describe("POST /report", () => {
  it("returns a report when no subscription gate is configured", async () => {
    const res = await worker.fetch(post("/report", reportBody), makeEnv());
    expect(res.status).toBe(200);
    expect(createMock.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5" });
  });

  it("rejects a malformed body", async () => {
    const res = await worker.fetch(post("/report", { device_id: "x" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("rate limits after 3 calls the same day", async () => {
    const env = makeEnv();
    for (let i = 0; i < 3; i++) {
      expect((await worker.fetch(post("/report", reportBody), env)).status).toBe(200);
    }
    expect((await worker.fetch(post("/report", reportBody), env)).status).toBe(429);
  });

  it("402s a non-subscriber when RevenueCat is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ subscriber: { entitlements: {} } }))),
    );
    const res = await worker.fetch(
      post("/report", reportBody),
      makeEnv({ REVENUECAT_API_KEY: "rc-key" }),
    );
    expect(res.status).toBe(402);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("allows a subscriber with a non-expiring pro entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ subscriber: { entitlements: { pro: { expires_date: null } } } }),
          ),
      ),
    );
    const res = await worker.fetch(
      post("/report", reportBody),
      makeEnv({ REVENUECAT_API_KEY: "rc-key" }),
    );
    expect(res.status).toBe(200);
  });

  it("402s when the pro entitlement has expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              subscriber: { entitlements: { pro: { expires_date: "2020-01-01T00:00:00Z" } } },
            }),
          ),
      ),
    );
    const res = await worker.fetch(
      post("/report", reportBody),
      makeEnv({ REVENUECAT_API_KEY: "rc-key" }),
    );
    expect(res.status).toBe(402);
  });

  it("402s when RevenueCat itself errors, rather than granting access", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const res = await worker.fetch(
      post("/report", reportBody),
      makeEnv({ REVENUECAT_API_KEY: "rc-key" }),
    );
    expect(res.status).toBe(402);
  });
});

describe("secret handling", () => {
  it("never echoes the API key in a response", async () => {
    const res = await worker.fetch(post("/coach", coachBody), makeEnv());
    expect(await res.text()).not.toContain("test-key");
  });
});
