// Anthropic Claude adapter. Requires the direct-browser-access header since
// this app calls the API straight from the client (BYOK, no server).

const MODEL = 'claude-sonnet-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export async function sendMessage({ apiKey, systemPrompt, messages, image }) {
  const anthropicMessages = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && image) {
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } },
          { type: 'text', text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt || undefined,
      messages: anthropicMessages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.content?.map((block) => block.text ?? '').join('') ?? '';
  if (!text) throw new Error('Claude returned an empty response.');
  return text;
}
