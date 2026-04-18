import type { InboxItem, QueueFilter } from "./types";

export function applyFilter(items: InboxItem[], filter: QueueFilter): InboxItem[] {
  const recipient = filter.recipient?.toLowerCase();
  return items.filter((item) => {
    if (recipient !== undefined && item.recipient.toLowerCase() !== recipient) {
      return false;
    }
    if (filter.team !== undefined && item.team !== filter.team) return false;
    if (filter.type !== undefined && item.type !== filter.type) return false;
    if (filter.maxAgeHours !== undefined && item.ageHours > filter.maxAgeHours) {
      return false;
    }
    return true;
  });
}
