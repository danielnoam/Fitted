// Shared interface for AI providers. BYOK, no server involved — every call
// goes straight from the browser to the provider's API using the user's key.

import * as gemini from './providerGemini.js';
import * as claude from './providerClaude.js';
import * as gpt from './providerGPT.js';

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
 * Send a message to the configured AI provider.
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
