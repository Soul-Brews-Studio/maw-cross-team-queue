/**
 * Adversarial tests — assert forbidden patterns do NOT appear.
 *
 * Motivation: silent-drop on unknown enum, hardcoded vault path, schemaVersion
 * drift are all loud bugs we want to fail CI as early as possible.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "../src/index";
import { scanInboxes } from "../src/scan";
import { applyFilter } from "../src/filter";
import { computeStats } from "../src/aggregate";

let root: string;
const originalEnv = process.env.MAW_VAULT_ROOT;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ctq-adv-"));
  mkdirSync(join(root, "zulu", "inbox"), { recursive: true });
  writeFileSync(
    join(root, "zulu", "inbox", "weird-type.md"),
    [
      "---",
      "recipient: nat",
      "sender: maw",
      "type: absolutely-not-a-known-type",
      "subject: unknown enum must still pass through",
      "---",
      "body",
    ].join("\n"),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (originalEnv === undefined) {
    delete process.env.MAW_VAULT_ROOT;
  } else {
    process.env.MAW_VAULT_ROOT = originalEnv;
  }
});

describe("adversarial: no silent-drop on unknown enum", () => {
  test("unknown type value surfaces as an item, not an error", async () => {
    const { items, errors } = await scanInboxes(root);
    const hit = items.find((i) => i.type === "absolutely-not-a-known-type");
    expect(hit).toBeDefined();
    expect(errors.some((e) => e.path.endsWith("weird-type.md"))).toBe(false);
  });

  test("unknown type passes filter when no type filter set", async () => {
    const { items } = await scanInboxes(root);
    const out = applyFilter(items, { recipient: "nat" });
    expect(out.some((i) => i.type === "absolutely-not-a-known-type")).toBe(true);
  });
});

describe("adversarial: schemaVersion is always literal 1", () => {
  test("every item has schemaVersion 1", async () => {
    const { items } = await scanInboxes(root);
    for (const it of items) expect(it.schemaVersion).toBe(1);
  });

  test("envelope has schemaVersion 1 (empty path)", async () => {
    delete process.env.MAW_VAULT_ROOT;
    const res = await handle();
    expect(res.schemaVersion).toBe(1);
  });

  test("envelope has schemaVersion 1 (populated path)", async () => {
    process.env.MAW_VAULT_ROOT = root;
    const res = await handle({});
    expect(res.schemaVersion).toBe(1);
  });

  test("stats from empty collection still round-trips shape", () => {
    const s = computeStats([]);
    expect(s.totalItems).toBe(0);
    expect(s.oldestAgeHours).toBeNull();
  });
});

describe("adversarial: no hardcoded vault path leak", () => {
  const SRC_DIR = join(__dirname, "..", "src");
  const FORBIDDEN = [
    "/home/",
    "/Users/",
    "SoulBrewsStudio",
    "Soul-Brews-Studio",
    "Code/github.com",
  ];

  test("source files contain no hardcoded vault paths", () => {
    for (const f of readdirSync(SRC_DIR)) {
      if (!f.endsWith(".ts")) continue;
      const body = readFileSync(join(SRC_DIR, f), "utf8");
      for (const needle of FORBIDDEN) {
        expect(body.includes(needle)).toBe(false);
      }
    }
  });

  test("handle() does not fall back to any path when env missing", async () => {
    delete process.env.MAW_VAULT_ROOT;
    const res = await handle();
    expect(res.items).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.path).toBe("");
  });
});
