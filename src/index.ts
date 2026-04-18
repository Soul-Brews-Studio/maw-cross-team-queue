/**
 * cross-team-queue plugin entry.
 *
 * Scans <MAW_VAULT_ROOT>/<oracle>/inbox/*.md, applies filter, computes stats.
 * Loud on missing env — no hardcoded vault path.
 */

import type { QueueResponse, QueueFilter } from "./types";
import { scanInboxes } from "./scan";
import { applyFilter } from "./filter";
import { computeStats } from "./aggregate";

const EMPTY_STATS = {
  totalItems: 0,
  byRecipient: {},
  byType: {},
  oldestAgeHours: null,
  newestAgeHours: null,
} as const;

export async function handle(filter: QueueFilter = {}): Promise<QueueResponse> {
  const vaultRoot = process.env.MAW_VAULT_ROOT;
  if (!vaultRoot) {
    return {
      items: [],
      stats: { ...EMPTY_STATS },
      errors: [{ path: "", reason: "MAW_VAULT_ROOT env required" }],
      schemaVersion: 1,
    };
  }
  const { items, errors } = await scanInboxes(vaultRoot);
  const filtered = applyFilter(items, filter);
  const stats = computeStats(filtered);
  return { items: filtered, stats, errors, schemaVersion: 1 };
}

export type {
  InboxItem,
  QueueFilter,
  QueueStats,
  ParseError,
  QueueResponse,
} from "./types";
