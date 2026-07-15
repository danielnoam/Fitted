import 'fake-indexeddb/auto';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../js/storage.js';

describe('storage (IndexedDB wrapper)', () => {
  test('uuid produces distinct RFC4122-shaped v4 ids', () => {
    const a = storage.uuid();
    const b = storage.uuid();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('addItem then getItem round-trips the same data', async () => {
    const item = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    await storage.addItem(item);
    const fetched = await storage.getItem(item.id);
    assert.deepEqual(fetched, item);
  });

  test('updateItem overwrites an existing record', async () => {
    const item = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    await storage.addItem(item);
    await storage.updateItem({ ...item, category: 'bottom' });
    const fetched = await storage.getItem(item.id);
    assert.equal(fetched.category, 'bottom');
  });

  test('deleteItem removes the record', async () => {
    const item = { id: storage.uuid(), category: 'top', createdAt: Date.now() };
    await storage.addItem(item);
    await storage.deleteItem(item.id);
    const fetched = await storage.getItem(item.id);
    assert.equal(fetched, undefined);
  });

  test('getItem returns undefined for a missing id', async () => {
    const fetched = await storage.getItem('does-not-exist');
    assert.equal(fetched, undefined);
  });

  test('getAllItems returns items sorted newest-first by createdAt', async () => {
    const older = { id: storage.uuid(), category: 'top', createdAt: 1000 };
    const newer = { id: storage.uuid(), category: 'bottom', createdAt: 2000 };
    await storage.addItem(older);
    await storage.addItem(newer);

    const all = await storage.getAllItems();
    const idxOlder = all.findIndex((i) => i.id === older.id);
    const idxNewer = all.findIndex((i) => i.id === newer.id);
    assert.ok(idxNewer < idxOlder);
  });

  test('settings: get returns the fallback when unset', async () => {
    const value = await storage.getSetting('does-not-exist', 'fallback-value');
    assert.equal(value, 'fallback-value');
  });

  test('settings: set then get round-trips arbitrary values, including objects', async () => {
    const config = { primary: { provider: 'gemini', apiKey: 'abc123' }, fallback: null };
    await storage.setSetting('aiConfig', config);
    const fetched = await storage.getSetting('aiConfig');
    assert.deepEqual(fetched, config);
  });

  test('settings: deleteSetting removes the value', async () => {
    await storage.setSetting('temp-setting', 'x');
    await storage.deleteSetting('temp-setting');
    const fetched = await storage.getSetting('temp-setting', null);
    assert.equal(fetched, null);
  });

  test('history: addHistoryEntry then getAllHistoryEntries round-trips it', async () => {
    const entry = { id: storage.uuid(), date: '2026-07-01', itemIds: ['a', 'b'] };
    await storage.addHistoryEntry(entry);
    const all = await storage.getAllHistoryEntries();
    assert.ok(all.some((e) => e.id === entry.id && e.date === entry.date));
  });

  test('history: getAllHistoryEntries sorts newest date first', async () => {
    const older = { id: storage.uuid(), date: '2020-01-01', itemIds: [] };
    const newer = { id: storage.uuid(), date: '2030-01-01', itemIds: [] };
    await storage.addHistoryEntry(older);
    await storage.addHistoryEntry(newer);

    const all = await storage.getAllHistoryEntries();
    const idxOlder = all.findIndex((e) => e.id === older.id);
    const idxNewer = all.findIndex((e) => e.id === newer.id);
    assert.ok(idxNewer < idxOlder);
  });

  test('history: deleteHistoryEntry removes the entry', async () => {
    const entry = { id: storage.uuid(), date: '2026-07-01', itemIds: [] };
    await storage.addHistoryEntry(entry);
    await storage.deleteHistoryEntry(entry.id);
    const all = await storage.getAllHistoryEntries();
    assert.ok(!all.some((e) => e.id === entry.id));
  });
});
