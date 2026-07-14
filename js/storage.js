// IndexedDB wrapper for wardrobe items + app settings (incl. AI API key).

const DB_NAME = 'fitted-db';
const DB_VERSION = 1;
const ITEMS_STORE = 'items';
const SETTINGS_STORE = 'settings';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const store = db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(
    (db) => db.transaction(storeName, mode).objectStore(storeName)
  );
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function addItem(item) {
  const store = await tx(ITEMS_STORE, 'readwrite');
  await reqToPromise(store.add(item));
  return item;
}

export async function updateItem(item) {
  const store = await tx(ITEMS_STORE, 'readwrite');
  await reqToPromise(store.put(item));
  return item;
}

export async function deleteItem(id) {
  const store = await tx(ITEMS_STORE, 'readwrite');
  await reqToPromise(store.delete(id));
}

export async function getItem(id) {
  const store = await tx(ITEMS_STORE, 'readonly');
  return reqToPromise(store.get(id));
}

export async function getAllItems() {
  const store = await tx(ITEMS_STORE, 'readonly');
  const items = await reqToPromise(store.getAll());
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSetting(key, fallback = null) {
  const store = await tx(SETTINGS_STORE, 'readonly');
  const result = await reqToPromise(store.get(key));
  return result ? result.value : fallback;
}

export async function setSetting(key, value) {
  const store = await tx(SETTINGS_STORE, 'readwrite');
  await reqToPromise(store.put({ key, value }));
}

export async function deleteSetting(key) {
  const store = await tx(SETTINGS_STORE, 'readwrite');
  await reqToPromise(store.delete(key));
}
