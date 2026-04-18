import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "../src/index";

let root: string;
const originalEnv = process.env.MAW_VAULT_ROOT;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ctq-handler-"));
  mkdirSync(join(root, "alpha", "inbox"), { recursive: true });
  mkdirSync(join(root, "bravo", "inbox"), { recursive: true });

  writeFileSync(
    join(root, "alpha", "inbox", "one.md"),
    ["---", "recipient: nat", "sender: a", "type: handoff", "subject: one", "---", "body"].join("\n"),
  );
  writeFileSync(
    join(root, "alpha", "inbox", "two.md"),
    ["---", "recipient: leo", "sender: a", "type: review", "subject: two", "---", "body"].join("\n"),
  );
  writeFileSync(
    join(root, "bravo", "inbox", "three.md"),
    ["---", "recipient: nat", "sender: b", "type: fyi", "subject: three", "---", "body"].join("\n"),
  );
  writeFileSync(
    join(root, "bravo", "inbox", "bad.md"),
    ["---", "sender: b", "type: fyi", "subject: bad", "---", ""].join("\n"),
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

describe("handle", () => {
  test("missing MAW_VAULT_ROOT returns loud error + empty envelope", async () => {
    delete process.env.MAW_VAULT_ROOT;
    const res = await handle();
    expect(res.schemaVersion).toBe(1);
    expect(res.items).toEqual([]);
    expect(res.stats.totalItems).toBe(0);
    expect(res.stats.oldestAgeHours).toBeNull();
    expect(res.stats.newestAgeHours).toBeNull();
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.reason).toContain("MAW_VAULT_ROOT");
  });

  test("empty string MAW_VAULT_ROOT treated as unset", async () => {
    process.env.MAW_VAULT_ROOT = "";
    const res = await handle();
    expect(res.errors[0]!.reason).toContain("MAW_VAULT_ROOT");
  });

  test("full pipeline: scan → filter → aggregate → envelope", async () => {
    process.env.MAW_VAULT_ROOT = root;
    const res = await handle({});
    expect(res.schemaVersion).toBe(1);
    expect(res.items.length).toBe(3);
    expect(res.stats.totalItems).toBe(3);
    expect(res.stats.byRecipient).toEqual({ nat: 2, leo: 1 });
    expect(res.stats.byType).toEqual({ handoff: 1, review: 1, fyi: 1 });
    expect(res.stats.oldestAgeHours).not.toBeNull();
    expect(res.stats.newestAgeHours).not.toBeNull();
    expect(res.errors.some((e) => e.path.endsWith("bad.md"))).toBe(true);
  });

  test("filter flows through to stats", async () => {
    process.env.MAW_VAULT_ROOT = root;
    const res = await handle({ recipient: "nat" });
    expect(res.items.length).toBe(2);
    expect(res.stats.totalItems).toBe(2);
    expect(res.stats.byRecipient).toEqual({ nat: 2 });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  test("envelope has all keys even on error path", async () => {
    delete process.env.MAW_VAULT_ROOT;
    const res = await handle();
    expect(Object.keys(res).sort()).toEqual(["errors", "items", "schemaVersion", "stats"]);
    expect(Object.keys(res.stats).sort()).toEqual([
      "byRecipient",
      "byType",
      "newestAgeHours",
      "oldestAgeHours",
      "totalItems",
    ]);
  });
});
