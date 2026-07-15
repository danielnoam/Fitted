// Date helpers for the wear-history log. Dates are plain 'YYYY-MM-DD'
// strings in the device's local calendar day (not UTC), matching what a
// user means by "today" regardless of timezone.

export function todayDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from dateStrA to dateStrB (positive if B is later). */
export function daysBetween(dateStrA, dateStrB) {
  const [y1, m1, d1] = dateStrA.split('-').map(Number);
  const [y2, m2, d2] = dateStrB.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utcB - utcA) / 86400000);
}

/** Short relative label for a 'YYYY-MM-DD' date, e.g. "Today", "3 days ago". */
export function formatRelativeDate(dateStr, today = todayDateString()) {
  if (!dateStr) return null;
  const diff = daysBetween(dateStr, today);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 31) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}
