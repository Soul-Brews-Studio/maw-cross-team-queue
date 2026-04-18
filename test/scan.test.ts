import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanInboxes } from "../src/scan";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ctq-scan-"));
  mkdirSync(join(root, "alpha", "inbox"), { recursive: true });
  mkdirSync(join(root, "bravo", "inbox"), { recursive: true });
  mkdirSync(join(root, "charlie", "inbox"), { recursive: true });
  mkdirSync(join(root, "no-inbox-oracle"), { recursive: true });

  writeFileSync(
    join(root, "alpha", "inbox", "ok.md"),
    [
      "---",
      "recipient: nat",
      "sender: maw",
      "type: handoff",
      "subject: ship the thing",
      "team: plugins",
      "priority: 3",
      "tags: [a, b, c]",
      "---",
      "",
      "Body line 1",
    ].join("\n"),
  );

  writeFileSync(
    join(root, "alpha", "inbox", "subject-fallback.md"),
    [
      "---",
      "recipient: nat",
      "sender: maw",
      "type: fyi",
      "---",
      "",
      "# First heading fallback",
      "",
      "rest",
    ].join("\n"),
  );

  writeFileSync(
    join(root, "bravo", "inbox", "missing-recipient.md"),
    ["---", "sender: x", "type: y", "subject: z", "---", ""].join("\n"),
  );

  writeFileSync(
    join(root, "bravo", "inbox", "malformed.md"),
    ["---", "recipient nat", "sender: x", "---", ""].join("\n"),
  );

  writeFileSync(
    join(root, "bravo", "inbox", "unterminated.md"),
    ["---", "recipient: nat", "sender: x", "type: y", "subject: z", "body"].join("\n"),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scanInboxes", () => {
  test("happy path parses frontmatter and items", async () => {
    const { items, errors } = await scanInboxes(root);
    const ok = items.find((i) => i.path.endsWith("ok.md"));
    expect(ok).toBeDefined();
    expect(ok!.recipient).toBe("nat");
    expect(ok!.sender).toBe("maw");
    expect(ok!.type).toBe("handoff");
    expect(ok!.subject).toBe("ship the thing");
    expect(ok!.team).toBe("plugins");
    expect(ok!.schemaVersion).toBe(1);
    expect(ok!.mtime).toBeGreaterThan(0);
    expect(ok!.ageHours).toBeGreaterThanOrEqual(0);
    expect(errors.find((e) => e.path.endsWith("ok.md"))).toBeUndefined();
  });

  test("subject fallback to first non-empty body line", async () => {
    const { items } = await scanInboxes(root);
    const fb = items.find((i) => i.path.endsWith("subject-fallback.md"));
    expect(fb).toBeDefined();
    expect(fb!.subject).toBe("First heading fallback");
  });

  test("missing required field becomes error, not item", async () => {
    const { items, errors } = await scanInboxes(root);
    expect(items.find((i) => i.path.endsWith("missing-recipient.md"))).toBeUndefined();
    const err = errors.find((e) => e.path.endsWith("missing-recipient.md"));
    expect(err).toBeDefined();
    expect(err!.reason).toContain("recipient");
  });

  test("malformed frontmatter becomes error", async () => {
    const { errors } = await scanInboxes(root);
    const err = errors.find((e) => e.path.endsWith("malformed.md"));
    expect(err).toBeDefined();
    expect(err!.reason.toLowerCase()).toContain("invalid");
  });

  test("unterminated frontmatter becomes error", async () => {
    const { errors } = await scanInboxes(root);
    const err = errors.find((e) => e.path.endsWith("unterminated.md"));
    expect(err).toBeDefined();
    expect(err!.reason.toLowerCase()).toContain("unterminated");
  });

  test("empty inbox dir yields no items no errors for that oracle", async () => {
    const { items, errors } = await scanInboxes(root);
    expect(items.some((i) => i.path.includes("/charlie/inbox/"))).toBe(false);
    expect(errors.some((e) => e.path.includes("/charlie/inbox/"))).toBe(false);
  });

  test("oracle without inbox dir skipped silently", async () => {
    const { items, errors } = await scanInboxes(root);
    expect(items.some((i) => i.path.includes("no-inbox-oracle"))).toBe(false);
    expect(errors.some((e) => e.path.includes("no-inbox-oracle"))).toBe(false);
  });

  test("nonexistent vault root returns single error", async () => {
    const { items, errors } = await scanInboxes(join(tmpdir(), "ctq-does-not-exist-xyz"));
    expect(items).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toContain("cannot read vault root");
  });
});
