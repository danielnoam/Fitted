import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../js/storage.js';
import { getAiConfig, setAiConfig, hasPrimaryKey, DEFAULT_PROVIDER } from '../js/ai/aiRouter.js';

// Guard against depending on test file execution order/isolation: always
// start from a clean slate for the settings keys this module touches.
beforeEach(async () => {
  await storage.deleteSetting('aiConfig');
  await storage.deleteSetting('aiApiKey');
  await storage.deleteSetting('aiProvider');
});

describe('getAiConfig / setAiConfig', () => {
  test('returns null when nothing has ever been configured', async () => {
    assert.equal(await getAiConfig(), null);
  });

  test('round-trips a saved config', async () => {
    const config = { primary: { provider: 'claude', apiKey: 'sk-test' }, fallback: null };
    await setAiConfig(config);
    assert.deepEqual(await getAiConfig(), config);
  });

  test('migrates legacy single-provider settings into the new shape', async () => {
    await storage.setSetting('aiApiKey', 'legacy-key');
    await storage.setSetting('aiProvider', 'gpt');

    const config = await getAiConfig();
    assert.deepEqual(config, { primary: { provider: 'gpt', apiKey: 'legacy-key' }, fallback: null });
  });

  test('migration defaults to DEFAULT_PROVIDER when no legacy provider was set', async () => {
    await storage.setSetting('aiApiKey', 'legacy-key');

    const config = await getAiConfig();
    assert.equal(config.primary.provider, DEFAULT_PROVIDER);
  });

  test('migration persists so it only runs once', async () => {
    await storage.setSetting('aiApiKey', 'legacy-key');
    await getAiConfig();

    const persisted = await storage.getSetting('aiConfig');
    assert.equal(persisted.primary.apiKey, 'legacy-key');
  });
});

describe('hasPrimaryKey', () => {
  test('false for null config', () => {
    assert.equal(hasPrimaryKey(null), false);
  });

  test('false when primary has no apiKey', () => {
    assert.equal(hasPrimaryKey({ primary: { provider: 'gemini', apiKey: '' } }), false);
  });

  test('true when primary has an apiKey', () => {
    assert.equal(hasPrimaryKey({ primary: { provider: 'gemini', apiKey: 'x' } }), true);
  });
});
