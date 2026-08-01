// Prompt builders for the coach line and weekly report.
// Pure functions so they are unit-testable without network access.

export interface CoachContext {
  device_id: string;
  urge: string;
  local_time: string;
  tag?: string | null;
  week: { events: number; rode: number; common_hour: string };
  last?: { outcome: string; minutes: number } | null;
}

export interface WeekStats {
  events: number;
  rode: number;
  gave_in: number;
  by_band: number[];
  top_tags: string[];
}

export interface ReportRequest {
  device_id: string;
  this_week: WeekStats;
  last_week: WeekStats;
}

export const COACH_SYSTEM = `You coach people through momentary urges using urge surfing: the urge peaks and passes within about 15 minutes. You are direct, warm, never preachy, never clinical. Two sentences maximum. Reference the user's actual pattern when one is given. Suggest one tiny physical action (move rooms, drink water, ten slow breaths, step outside). Never mention that you are an AI. Never use emoji.`;

export function buildCoachUserMessage(ctx: CoachContext): string {
  const parts = [
    `urge=${ctx.urge}`,
    `local_time=${ctx.local_time}`,
  ];
  if (ctx.tag) parts.push(`tag=${ctx.tag}`);
  // No history means no pattern. Say so explicitly so the model does not
  // invent one for a brand new user.
  parts.push(
    ctx.week.events === 0
      ? "this_week={no history yet}"
      : `this_week={events: ${ctx.week.events}, rode: ${ctx.week.rode}, common_hour: ${ctx.week.common_hour}}`,
  );
  if (ctx.last) {
    parts.push(`last_event={outcome: ${ctx.last.outcome}, minutes_to_pass: ${ctx.last.minutes}}`);
  }
  return parts.join(", ");
}

export const REPORT_SYSTEM = `You write a short weekly review for someone tracking urges they are trying to resist. Voice: direct, warm, zero therapy-speak, zero shame. Structure: one sentence on the headline trend, two or three bullet observations grounded in the numbers (times of day, triggers, survival rate change vs last week), then exactly one small concrete experiment for next week. Under 150 words. Plain text, simple dashes for bullets. Never use emoji. Never give medical advice.`;

export function buildReportUserMessage(req: ReportRequest): string {
  const bands = ["0-4", "4-8", "8-12", "12-16", "16-20", "20-24"];
  const describe = (w: WeekStats) => {
    const peak = Math.max(...w.by_band, 0);
    const peakBand = peak > 0 ? bands[w.by_band.indexOf(peak)] : "none";
    return `events=${w.events}, rode=${w.rode}, gave_in=${w.gave_in}, peak_hours=${peakBand}, top_tags=[${w.top_tags.join(", ")}]`;
  };
  return `this_week: ${describe(req.this_week)}\nlast_week: ${describe(req.last_week)}`;
}

export function isValidCoachContext(body: unknown): body is CoachContext {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  const week = b.week as Record<string, unknown> | undefined;
  return (
    typeof b.device_id === "string" &&
    b.device_id.length > 0 &&
    b.device_id.length <= 64 &&
    typeof b.urge === "string" &&
    b.urge.length <= 40 &&
    typeof b.local_time === "string" &&
    typeof week === "object" &&
    week !== null &&
    typeof week.events === "number" &&
    typeof week.rode === "number" &&
    typeof week.common_hour === "string"
  );
}

export function isValidReportRequest(body: unknown): body is ReportRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  const isWeek = (w: unknown): boolean => {
    if (typeof w !== "object" || w === null) return false;
    const x = w as Record<string, unknown>;
    return (
      typeof x.events === "number" &&
      typeof x.rode === "number" &&
      typeof x.gave_in === "number" &&
      Array.isArray(x.by_band) &&
      Array.isArray(x.top_tags)
    );
  };
  return (
    typeof b.device_id === "string" &&
    b.device_id.length > 0 &&
    b.device_id.length <= 64 &&
    isWeek(b.this_week) &&
    isWeek(b.last_week)
  );
}
