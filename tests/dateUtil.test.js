import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { todayDateString, daysBetween, formatRelativeDate } from '../js/dateUtil.js';

describe('todayDateString', () => {
  test('formats a given date as local YYYY-MM-DD', () => {
    assert.equal(todayDateString(new Date(2026, 6, 15)), '2026-07-15'); // month is 0-indexed
  });

  test('zero-pads single-digit month and day', () => {
    assert.equal(todayDateString(new Date(2026, 0, 5)), '2026-01-05');
  });
});

describe('daysBetween', () => {
  test('zero for the same date', () => {
    assert.equal(daysBetween('2026-07-15', '2026-07-15'), 0);
  });

  test('positive when the second date is later', () => {
    assert.equal(daysBetween('2026-07-15', '2026-07-16'), 1);
  });

  test('negative when the second date is earlier', () => {
    assert.equal(daysBetween('2026-07-15', '2026-07-14'), -1);
  });

  test('handles month/year boundaries', () => {
    assert.equal(daysBetween('2026-06-30', '2026-07-01'), 1);
    assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  });
});

describe('formatRelativeDate', () => {
  const today = '2026-07-15';

  test('null for a missing date', () => {
    assert.equal(formatRelativeDate(null, today), null);
    assert.equal(formatRelativeDate(undefined, today), null);
  });

  test('"Today" for the current date', () => {
    assert.equal(formatRelativeDate('2026-07-15', today), 'Today');
  });

  test('"Today" for a future-dated entry (defensive, should not occur)', () => {
    assert.equal(formatRelativeDate('2026-07-16', today), 'Today');
  });

  test('"Yesterday" for one day back', () => {
    assert.equal(formatRelativeDate('2026-07-14', today), 'Yesterday');
  });

  test('"N days ago" under a week', () => {
    assert.equal(formatRelativeDate('2026-07-10', today), '5 days ago');
    assert.equal(formatRelativeDate('2026-07-09', today), '6 days ago');
  });

  test('"Nw ago" between a week and a month', () => {
    assert.equal(formatRelativeDate('2026-07-08', today), '1w ago');
    assert.equal(formatRelativeDate('2026-06-20', today), '3w ago');
  });

  test('"Nmo ago" a month or more back', () => {
    assert.equal(formatRelativeDate('2026-06-01', today), '1mo ago');
    assert.equal(formatRelativeDate('2026-01-01', today), '6mo ago');
  });
});
