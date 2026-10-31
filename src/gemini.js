const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const PROMPT = `You are an expert exam tutor. The image shows one or more multiple-choice questions
(it may be a photo of a screen or paper, possibly skewed or with glare).
For EVERY question visible in the image:
- Transcribe the question text and all options exactly.
- Work out the correct option carefully, step by step, before answering.
- Return the option label (A/B/C/D... or 1/2/3/4 exactly as shown) and its text.
- Give a short explanation (1-3 sentences).
- If more than one option is correct (e.g. "select all that apply"), list all labels in answerLabels.
If a question is cut off or unreadable, still include it with readable=false.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'STRING', description: 'Question number as printed, or empty' },
          question: { type: 'STRING' },
          options: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { label: { type: 'STRING' }, text: { type: 'STRING' } },
              required: ['label', 'text'],
            },
          },
          answerLabels: { type: 'ARRAY', items: { type: 'STRING' } },
          answerText: { type: 'STRING' },
          explanation: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          readable: { type: 'BOOLEAN' },
        },
        required: ['question', 'options', 'answerLabels', 'answerText', 'confidence', 'readable'],
      },
    },
  },
  required: ['questions'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** List models on this key that support generateContent (for the model picker). */
export async function listModels(apiKey) {
  const res = await fetch(`${BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`ListModels failed (${res.status})`);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => n.includes('gemini') && !n.includes('image') && !n.includes('tts') && !n.includes('embedding'));
}

/** Send one image to Gemini and return { questions: [...] }. Retries on 429/5xx. */
export async function solveImage({ apiKey, model, base64, mimeType = 'image/jpeg', signal }) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
    },
  };

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      if (!text) {
        const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty response';
        throw new Error(`No answer returned (${reason})`);
      }
      const parsed = JSON.parse(text);
      parsed.questions = (parsed.questions || []).map((q) => ({
        ...q,
        options: q.options || [],
        answerLabels: q.answerLabels || [],
        readable: q.readable !== false,
      }));
      return parsed;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = (await res.json()).error?.message || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    await sleep(1500 * 2 ** (attempt - 1)); // 1.5s, 3s, 6s
  }
}
