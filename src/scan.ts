import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { InboxItem, ParseError } from "./types";

type FMValue = string | string[] | number;
type ParsedFM = { fields: Record<string, FMValue>; body: string };

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseFrontmatter(raw: string): ParsedFM | { error: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { fields: {}, body: raw };
  }
  const endIdx = lines.indexOf("---", 1);
  if (endIdx === -1) {
    return { error: "unterminated frontmatter (no closing ---)" };
  }
  const fmLines = lines.slice(1, endIdx);
  const bodyLines = lines.slice(endIdx + 1);
  const fields: Record<string, FMValue> = {};
  for (const line of fmLines) {
    if (line.trim() === "") continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      return { error: `invalid frontmatter line: "${line}"` };
    }
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (!key) {
      return { error: `missing key in frontmatter line: "${line}"` };
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inside = rest.slice(1, -1).trim();
      fields[key] = inside === ""
        ? []
        : inside.split(",").map((s) => stripQuotes(s.trim()));
    } else if (/^-?\d+(\.\d+)?$/.test(rest)) {
      fields[key] = Number(rest);
    } else {
      fields[key] = stripQuotes(rest);
    }
  }
  return { fields, body: bodyLines.join("\n") };
}

function firstNonEmptyLine(body: string): string {
  const line = body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").trim();
}

export async function scanInboxes(
  vaultRoot: string,
): Promise<{ items: InboxItem[]; errors: ParseError[] }> {
  const items: InboxItem[] = [];
  const errors: ParseError[] = [];
  const now = Date.now();

  let oracles: string[];
  try {
    oracles = readdirSync(vaultRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    errors.push({ path: vaultRoot, reason: `cannot read vault root: ${reason}` });
    return { items, errors };
  }

  for (const oracle of oracles) {
    const inboxDir = join(vaultRoot, oracle, "inbox");
    let files: string[];
    try {
      files = readdirSync(inboxDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(inboxDir, file);
      let raw: string;
      let mtime: number;
      try {
        raw = readFileSync(path, "utf8");
        mtime = statSync(path).mtimeMs;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        errors.push({ path, reason: `read failed: ${reason}` });
        continue;
      }
      const parsed = parseFrontmatter(raw);
      if ("error" in parsed) {
        errors.push({ path, reason: parsed.error });
        continue;
      }
      const { fields, body } = parsed;
      const recipient = fields.recipient;
      const sender = fields.sender;
      const type = fields.type;
      const missing: string[] = [];
      if (typeof recipient !== "string" || !recipient) missing.push("recipient");
      if (typeof sender !== "string" || !sender) missing.push("sender");
      if (typeof type !== "string" || !type) missing.push("type");

      let subject = typeof fields.subject === "string" ? fields.subject : "";
      if (!subject) subject = firstNonEmptyLine(body);
      if (!subject) missing.push("subject");

      if (missing.length > 0) {
        errors.push({
          path,
          reason: `missing required field(s): ${missing.join(", ")}`,
        });
        continue;
      }
      const team = typeof fields.team === "string" ? fields.team : undefined;
      items.push({
        recipient: recipient as string,
        sender: sender as string,
        team,
        type: type as string,
        subject,
        body,
        path,
        mtime,
        ageHours: (now - mtime) / 3600000,
        schemaVersion: 1,
      });
    }
  }
  return { items, errors };
}
