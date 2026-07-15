import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractPrecacheUrls() {
  const swSource = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const match = swSource.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find PRECACHE_URLS in sw.js');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function listFilesRecursive(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, exts));
    else if (exts.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function toPrecacheStylePath(absPath) {
  return './' + path.relative(ROOT, absPath).split(path.sep).join('/');
}

describe('sw.js PRECACHE_URLS stays in sync with the app shell', () => {
  test('every listed file actually exists on disk', () => {
    const urls = extractPrecacheUrls();
    for (const url of urls) {
      if (url === './') continue; // the app shell root, not a real file
      assert.ok(existsSync(path.join(ROOT, url.replace(/^\.\//, ''))), `Missing precached file: ${url}`);
    }
  });

  test('every js/ and css/ file is listed (nothing forgotten)', () => {
    const urls = new Set(extractPrecacheUrls());
    const shipped = [
      ...listFilesRecursive(path.join(ROOT, 'js'), ['.js']),
      ...listFilesRecursive(path.join(ROOT, 'css'), ['.css']),
    ].map(toPrecacheStylePath);

    const missing = shipped.filter((rel) => !urls.has(rel));
    assert.deepEqual(missing, [], `Files present on disk but missing from PRECACHE_URLS: ${missing.join(', ')}`);
  });
});
