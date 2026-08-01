import { describe, expect, it } from "vitest";
import {
  buildCoachUserMessage,
  buildReportUserMessage,
  isValidCoachContext,
  isValidReportRequest,
} from "../src/prompts";

const coachCtx = {
  device_id: "abc-123",
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
  top_tags: ["bored", "stressed"],
};

describe("buildCoachUserMessage", () => {
  it("includes urge, time, tag, and week aggregates", () => {
    const msg = buildCoachUserMessage(coachCtx);
    expect(msg).toContain("urge=snacking");
    expect(msg).toContain("local_time=23:10");
    expect(msg).toContain("tag=bored");
    expect(msg).toContain("events: 4");
    expect(msg).toContain("rode: 3");
    expect(msg).toContain("minutes_to_pass: 12");
  });

  it("says there is no history instead of implying a pattern", () => {
    const msg = buildCoachUserMessage({
      ...coachCtx,
      week: { events: 0, rode: 0, common_hour: "none" },
      last: null,
    });
    expect(msg).toContain("this_week={no history yet}");
    expect(msg).not.toContain("common_hour");
  });

  it("omits tag and last event when absent", () => {
    const msg = buildCoachUserMessage({ ...coachCtx, tag: null, last: null });
    expect(msg).not.toContain("tag=");
    expect(msg).not.toContain("last_event");
  });
});

describe("buildReportUserMessage", () => {
  it("summarizes both weeks with peak hours", () => {
    const msg = buildReportUserMessage({
      device_id: "abc-123",
      this_week: weekStats,
      last_week: { ...weekStats, events: 9, rode: 3, gave_in: 6 },
    });
    expect(msg).toContain("this_week: events=6");
    expect(msg).toContain("last_week: events=9");
    expect(msg).toContain("peak_hours=20-24");
    expect(msg).toContain("top_tags=[bored, stressed]");
  });

  it("reports peak_hours=none for an empty week", () => {
    const empty = { events: 0, rode: 0, gave_in: 0, by_band: [0, 0, 0, 0, 0, 0], top_tags: [] };
    const msg = buildReportUserMessage({
      device_id: "abc-123",
      this_week: empty,
      last_week: empty,
    });
    expect(msg).toContain("peak_hours=none");
  });
});

describe("validation", () => {
  it("accepts valid payloads", () => {
    expect(isValidCoachContext(coachCtx)).toBe(true);
    expect(
      isValidReportRequest({ device_id: "x", this_week: weekStats, last_week: weekStats }),
    ).toBe(true);
  });

  it("rejects junk", () => {
    expect(isValidCoachContext(null)).toBe(false);
    expect(isValidCoachContext({})).toBe(false);
    expect(isValidCoachContext({ ...coachCtx, device_id: "" })).toBe(false);
    expect(isValidCoachContext({ ...coachCtx, urge: "x".repeat(50) })).toBe(false);
    expect(isValidReportRequest({ device_id: "x" })).toBe(false);
  });
});
