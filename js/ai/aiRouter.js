// Shared interface for AI providers. BYOK, no server involved — every call
// goes straight from the browser to the provider's API using the user's key.

import * as gemini from './providerGemini.js';
import * as claude from './providerClaude.js';
import * as gpt from './providerGPT.js';
import { FORMALITY_LEVELS } from '../matcher.js';
import { getSetting, setSetting } from '../storage.js';

export const PROVIDERS = {
  gemini: { id: 'gemini', label: 'Gemini', module: gemini },
  claude: { id: 'claude', label: 'Claude', module: claude },
  gpt: { id: 'gpt', label: 'GPT', module: gpt },
};

export const DEFAULT_PROVIDER = 'gemini';

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Send a message to one specific AI provider (no fallback). Most callers
 * should use sendMessageWithFallback instead.
 *
 * @param {object} opts
 * @param {string} opts.provider - one of PROVIDERS keys
 * @param {string} opts.apiKey
 * @param {string} opts.systemPrompt - wardrobe context / instructions
 * @param {{role: 'user'|'assistant', content: string}[]} opts.messages
 * @param {Blob} [opts.image] - optional image attached to the last user message
 * @returns {Promise<string>} assistant reply text
 */
export async function sendMessage({ provider, apiKey, systemPrompt, messages, image }) {
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error(`Unknown AI provider: ${provider}`);
  if (!apiKey) throw new Error('No API key set for this provider.');

  let imagePayload = null;
  if (image) {
    imagePayload = {
      base64: await blobToBase64(image),
      mimeType: image.type || 'image/jpeg',
    };
  }

  return entry.module.sendMessage({ apiKey, systemPrompt, messages, image: imagePayload });
}

// ---------- Config (primary + optional fallback provider) ----------

/**
 * Reads the saved { primary: {provider, apiKey}, fallback: {provider, apiKey}|null }
 * config, migrating the old single-provider settings (aiApiKey/aiProvider) the
 * first time it's read if present.
 */
export async function getAiConfig() {
  const saved = await getSetting('aiConfig', null);
  if (saved) return saved;

  const legacyKey = await getSetting('aiApiKey', null);
  if (legacyKey) {
    const legacyProvider = await getSetting('aiProvider', DEFAULT_PROVIDER);
    const migrated = { primary: { provider: legacyProvider, apiKey: legacyKey }, fallback: null };
    await setSetting('aiConfig', migrated);
    return migrated;
  }

  return null;
}

export async function setAiConfig(config) {
  await setSetting('aiConfig', config);
}

export function hasPrimaryKey(config) {
  return !!config?.primary?.apiKey;
}

/**
 * Sends via the primary provider; if it throws or comes back empty, retries
 * with the fallback provider (when one is configured). Throws the last
 * error encountered if every configured attempt fails.
 */
export async function sendMessageWithFallback({ config, systemPrompt, messages, image }) {
  const attempts = [config?.primary, config?.fallback].filter((a) => a?.provider && a?.apiKey);
  if (!attempts.length) throw new Error('No AI provider configured.');

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const reply = await sendMessage({ provider: attempt.provider, apiKey: attempt.apiKey, systemPrompt, messages, image });
      if (reply && reply.trim()) return reply;
      lastError = new Error(`${PROVIDERS[attempt.provider]?.label ?? attempt.provider} returned an empty response.`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const FORMALITY_PROMPT = `Look at this clothing item photo. How dressy or casual does it read? Reply with exactly one word from this list, nothing else, no punctuation: ${FORMALITY_LEVELS.join(', ')}.`;

/**
 * Ask the AI to classify a single item's photo into one of matcher.js's
 * fixed formality levels (tries primary then fallback). Returns the
 * matched level string, or null if the reply couldn't be mapped.
 */
export async function classifyFormality({ config, image }) {
  const reply = await sendMessageWithFallback({ config, messages: [{ role: 'user', content: FORMALITY_PROMPT }], image });
  const normalized = reply.trim().toLowerCase().replace(/[^a-z-]/g, '');
  return FORMALITY_LEVELS.includes(normalized) ? normalized : null;
}
