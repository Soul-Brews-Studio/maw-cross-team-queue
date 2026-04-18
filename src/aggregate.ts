import type { InboxItem, QueueStats } from "./types";

export function computeStats(items: InboxItem[]): QueueStats {
  const byRecipient: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const item of items) {
    byRecipient[item.recipient] = (byRecipient[item.recipient] ?? 0) + 1;
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (oldest === null || item.ageHours > oldest) oldest = item.ageHours;
    if (newest === null || item.ageHours < newest) newest = item.ageHours;
  }
  return {
    totalItems: items.length,
    byRecipient,
    byType,
    oldestAgeHours: oldest,
    newestAgeHours: newest,
  };
}
