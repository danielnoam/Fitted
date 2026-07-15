import 'fake-indexeddb/auto';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../js/storage.js';
import { logWorn } from '../js/wearLog.js';
import { todayDateString } from '../js/dateUtil.js';

describe('logWorn', () => {
  test('returns null and logs nothing when no items have a saved id', async () => {
    const result = await logWorn([{ category: 'top' }, { category: 'bottom' }]);
    assert.equal(result, null);
  });

  test('creates a history entry with today\'s date and the items\' ids', async () => {
    const top = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    const bottom = { id: storage.uuid(), category: 'bottom', createdAt: Date.now() };
    await storage.addItem(top);
    await storage.addItem(bottom);

    const entry = await logWorn([top, bottom]);
    assert.equal(entry.date, todayDateString());
    assert.deepEqual(entry.itemIds.sort(), [top.id, bottom.id].sort());

    const all = await storage.getAllHistoryEntries();
    assert.ok(all.some((e) => e.id === entry.id));
  });

  test('stamps lastWorn on each saved item', async () => {
    const top = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    await storage.addItem(top);

    await logWorn([top]);
    const fetched = await storage.getItem(top.id);
    assert.equal(fetched.lastWorn, todayDateString());
  });

  test('skips transient items without an id but still logs the saved ones', async () => {
    const saved = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    await storage.addItem(saved);
    const transient = { category: 'bottom' }; // e.g. a "use once" item, never added

    const entry = await logWorn([saved, transient]);
    assert.deepEqual(entry.itemIds, [saved.id]);
  });
});
