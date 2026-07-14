// Google Gemini adapter (Generative Language API). Default AI provider.

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function sendMessage({ apiKey, systemPrompt, messages, image }) {
  const contents = messages.map((m, i) => {
    const parts = [{ text: m.content }];
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && image) {
      parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const body = {
    contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
  };

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}
