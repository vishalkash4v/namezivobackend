const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

class GeminiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

function getApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '').trim();
}

async function callGemini(options) {
  const apiKey = getApiKey();
  if (!apiKey) throw new GeminiError('Missing GEMINI_API_KEY environment variable.', 500);

  const model = options.model || DEFAULT_MODEL;
  const body = {
    contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
    generationConfig: { temperature: options.temperature ?? 0.7 },
  };

  if (options.systemInstruction) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }
  if (options.responseMimeType) {
    body.generationConfig.responseMimeType = options.responseMimeType;
  }
  if (options.responseSchema) {
    body.generationConfig.responseSchema = options.responseSchema;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400) throw new GeminiError('Invalid Gemini API request or key.', 400);
      if (res.status === 429) throw new GeminiError('Gemini rate limit reached. Please try again shortly.', 429);
      throw new GeminiError(`Gemini error: ${text.slice(0, 200)}`, res.status);
    }

    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim();
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof GeminiError) throw err;
    if (err?.name === 'AbortError') throw new GeminiError('Gemini request timed out.', 504);
    throw new GeminiError(`Gemini call failed: ${err.message}`, 500);
  }
}

function safeJsonParse(input) {
  let s = input.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { callGemini, safeJsonParse, GeminiError, getApiKey };
