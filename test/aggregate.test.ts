import { describe, expect, test } from "bun:test";
import { computeStats } from "../src/aggregate";
import type { InboxItem } from "../src/types";

function item(partial: Partial<InboxItem>): InboxItem {
  return {
    recipient: "nat",
    sender: "maw",
    type: "handoff",
    subject: "s",
    body: "b",
    path: "/p",
    mtime: 0,
    ageHours: 1,
    schemaVersion: 1,
    ...partial,
  };
}

describe("computeStats", () => {
  test("empty → zero + null oldest/newest", () => {
    const s = computeStats([]);
    expect(s.totalItems).toBe(0);
    expect(s.byRecipient).toEqual({});
    expect(s.byType).toEqual({});
    expect(s.oldestAgeHours).toBeNull();
    expect(s.newestAgeHours).toBeNull();
  });

  test("single item → oldest == newest == its age", () => {
    const s = computeStats([item({ ageHours: 7.5 })]);
    expect(s.totalItems).toBe(1);
    expect(s.byRecipient).toEqual({ nat: 1 });
    expect(s.byType).toEqual({ handoff: 1 });
    expect(s.oldestAgeHours).toBe(7.5);
    expect(s.newestAgeHours).toBe(7.5);
  });

  test("multi → oldest = max, newest = min", () => {
    const s = computeStats([
      item({ recipient: "nat", type: "handoff", ageHours: 1 }),
      item({ recipient: "nat", type: "fyi", ageHours: 48 }),
      item({ recipient: "leo", type: "handoff", ageHours: 12 }),
      item({ recipient: "leo", type: "review", ageHours: 0.5 }),
    ]);
    expect(s.totalItems).toBe(4);
    expect(s.byRecipient).toEqual({ nat: 2, leo: 2 });
    expect(s.byType).toEqual({ handoff: 2, fyi: 1, review: 1 });
    expect(s.oldestAgeHours).toBe(48);
    expect(s.newestAgeHours).toBe(0.5);
  });

  test("zero age is handled (not confused with null)", () => {
    const s = computeStats([item({ ageHours: 0 })]);
    expect(s.oldestAgeHours).toBe(0);
    expect(s.newestAgeHours).toBe(0);
  });
});
