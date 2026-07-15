// Logs a wear-history entry when one or more items are marked as worn, and
// stamps each item's lastWorn date for quick "last worn 3 days ago" display
// without scanning the whole history store. Shared by the wardrobe detail
// view (single item) and the suggest tab (a full outfit at once).

import { addHistoryEntry, updateItem, uuid } from './storage.js';
import { todayDateString } from './dateUtil.js';

/**
 * @param {object[]} items - only items with a real `id` (saved wardrobe
 *   items) are logged; transient "use once" items are silently skipped.
 * @returns {Promise<object|null>} the created history entry, or null if
 *   none of the given items were saved.
 */
export async function logWorn(items) {
  const saved = items.filter((item) => item?.id);
  if (!saved.length) return null;

  const date = todayDateString();
  const entry = { id: uuid(), date, itemIds: saved.map((item) => item.id) };
  await addHistoryEntry(entry);

  for (const item of saved) {
    item.lastWorn = date;
    await updateItem(item);
  }

  return entry;
}
