// OpenAI GPT adapter.

const MODEL = 'gpt-4o';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export async function sendMessage({ apiKey, systemPrompt, messages, image }) {
  const chatMessages = [];
  if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });

  messages.forEach((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && image) {
      chatMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
        ],
      });
    } else {
      chatMessages.push({ role: m.role, content: m.content });
    }
  });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, messages: chatMessages }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GPT API error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('GPT returned an empty response.');
  return text;
}
