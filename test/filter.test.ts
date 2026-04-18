import { describe, expect, test } from "bun:test";
import { applyFilter } from "../src/filter";
import type { InboxItem } from "../src/types";

function item(partial: Partial<InboxItem>): InboxItem {
  return {
    recipient: "nat",
    sender: "maw",
    team: "plugins",
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

const sample: InboxItem[] = [
  item({ path: "/a", recipient: "Nat", type: "handoff", team: "plugins", ageHours: 1 }),
  item({ path: "/b", recipient: "leo", type: "review", team: "backend", ageHours: 5 }),
  item({ path: "/c", recipient: "nat", type: "fyi", team: "plugins", ageHours: 72 }),
  item({ path: "/d", recipient: "maya", type: "handoff", team: undefined, ageHours: 200 }),
];

describe("applyFilter", () => {
  test("empty filter returns all", () => {
    const out = applyFilter(sample, {});
    expect(out).toHaveLength(sample.length);
    expect(out).not.toBe(sample);
  });

  test("recipient is case-insensitive exact", () => {
    expect(applyFilter(sample, { recipient: "nat" }).map((i) => i.path).sort()).toEqual(["/a", "/c"]);
    expect(applyFilter(sample, { recipient: "NAT" }).map((i) => i.path).sort()).toEqual(["/a", "/c"]);
    expect(applyFilter(sample, { recipient: "na" })).toHaveLength(0);
  });

  test("team exact", () => {
    expect(applyFilter(sample, { team: "plugins" }).map((i) => i.path).sort()).toEqual(["/a", "/c"]);
    expect(applyFilter(sample, { team: "Plugins" })).toHaveLength(0);
  });

  test("type exact", () => {
    expect(applyFilter(sample, { type: "handoff" }).map((i) => i.path).sort()).toEqual(["/a", "/d"]);
  });

  test("maxAgeHours includes equal", () => {
    expect(applyFilter(sample, { maxAgeHours: 72 }).map((i) => i.path).sort()).toEqual(["/a", "/b", "/c"]);
    expect(applyFilter(sample, { maxAgeHours: 1 }).map((i) => i.path)).toEqual(["/a"]);
    expect(applyFilter(sample, { maxAgeHours: 0 })).toHaveLength(0);
  });

  test("combined filter narrows correctly", () => {
    const out = applyFilter(sample, {
      recipient: "nat",
      team: "plugins",
      type: "handoff",
      maxAgeHours: 10,
    });
    expect(out.map((i) => i.path)).toEqual(["/a"]);
  });

  test("returns new array (not mutating input)", () => {
    const out = applyFilter(sample, {});
    out.pop();
    expect(sample).toHaveLength(4);
  });
});
