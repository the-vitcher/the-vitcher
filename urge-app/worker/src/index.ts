import Anthropic from "@anthropic-ai/sdk";
import {
  COACH_SYSTEM,
  REPORT_SYSTEM,
  buildCoachUserMessage,
  buildReportUserMessage,
  isValidCoachContext,
  isValidReportRequest,
} from "./prompts";

export interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_KV: KVNamespace;
  // Model choices are env-configurable. Defaults keep the per-user cost tiny;
  // bump COACH_MODEL / REPORT_MODEL to claude-opus-4-8 if quality demands it.
  COACH_MODEL?: string;
  REPORT_MODEL?: string;
  // Optional RevenueCat secret key. When set, /report requires an active
  // "pro" entitlement for the device id. When unset (dev), everything is open.
  REVENUECAT_API_KEY?: string;
}

const COACH_DAILY_LIMIT = 40;
const REPORT_DAILY_LIMIT = 3;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === "/coach") return await handleCoach(request, env);
      if (url.pathname === "/report") return await handleReport(request, env);
      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error("worker error", err);
      return json({ error: "internal error" }, 500);
    }
  },
};

async function handleCoach(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!isValidCoachContext(body)) return json({ error: "bad request" }, 400);

  const allowed = await checkRateLimit(env, `coach:${body.device_id}`, COACH_DAILY_LIMIT);
  if (!allowed) return json({ error: "rate limited" }, 429);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: env.COACH_MODEL ?? "claude-haiku-4-5",
    max_tokens: 200,
    system: COACH_SYSTEM,
    messages: [{ role: "user", content: buildCoachUserMessage(body) }],
  });
  return json({ text: firstText(response) });
}

async function handleReport(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!isValidReportRequest(body)) return json({ error: "bad request" }, 400);

  const allowed = await checkRateLimit(env, `report:${body.device_id}`, REPORT_DAILY_LIMIT);
  if (!allowed) return json({ error: "rate limited" }, 429);

  if (env.REVENUECAT_API_KEY) {
    const pro = await hasProEntitlement(env, body.device_id);
    if (!pro) return json({ error: "subscription required" }, 402);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: env.REPORT_MODEL ?? "claude-sonnet-5",
    max_tokens: 1000,
    system: REPORT_SYSTEM,
    messages: [{ role: "user", content: buildReportUserMessage(body) }],
  });
  return json({ text: firstText(response) });
}

function firstText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

// Simple per-device daily counter in KV. Good enough at MVP scale.
async function checkRateLimit(env: Env, key: string, limit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const kvKey = `${key}:${day}`;
  const current = parseInt((await env.RATE_KV.get(kvKey)) ?? "0", 10);
  if (current >= limit) return false;
  await env.RATE_KV.put(kvKey, String(current + 1), { expirationTtl: 172800 });
  return true;
}

async function hasProEntitlement(env: Env, deviceID: string): Promise<boolean> {
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceID)}`,
    { headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` } },
  );
  if (!response.ok) return false;
  const data = (await response.json()) as {
    subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
  };
  const pro = data.subscriber?.entitlements?.pro;
  if (!pro) return false;
  return pro.expires_date === null || new Date(pro.expires_date) > new Date();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
