import { ai, geminiModels } from '../config/gemini.config.js';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const INTENTS = new Set(['chat', 'job_seeker', 'recruiter', 'person_posts', 'latest_posts']);
const AUDIENCES = new Set(['developer', 'recruiter', 'unknown']);

export class GeminiServiceError extends Error {
  constructor(message, statusCode, cause) {
    super(message, { cause });
    this.name = 'GeminiServiceError';
    this.statusCode = statusCode;
  }
}

function getStatusCode(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  const numericStatus = Number(status);
  return Number.isInteger(numericStatus) ? numericStatus : undefined;
}

function isRetryable(error) {
  return [429, 503].includes(getStatusCode(error));
}

function getRetryDelay(error, retryNumber) {
  const retryAfter = Number(error?.response?.headers?.get?.('retry-after') ?? error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, 30_000);
  }
  return BASE_RETRY_DELAY_MS * (2 ** (retryNumber - 1)) + Math.floor(Math.random() * 350);
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function generateWithRetries(model, prompt, config) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        ...(config ? { config } : {}),
      });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) throw error;
      const retryNumber = attempt + 1;
      const delayMs = getRetryDelay(error, retryNumber);
      console.warn(`Gemini ${model} returned ${getStatusCode(error)}; retry ${retryNumber}/${MAX_RETRIES} in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function shouldUseFallback(error) {
  const statusCode = getStatusCode(error);
  return statusCode === undefined || statusCode === 404 || statusCode === 429 || statusCode === 503 || statusCode >= 500;
}

function safeResponseText(response) {
  try {
    return response.text || '';
  } catch {
    return '';
  }
}

function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const cleaned = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new GeminiServiceError('AI did not return a JSON object.', 502);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new GeminiServiceError('AI returned invalid JSON.', 502);
  }
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeAssistantTurn(raw) {
  const parsed = parseJsonObject(raw);
  const keywords = String(parsed?.keywords ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const location = String(parsed?.location ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const personName = cleanName(parsed?.personName);
  const companyName = cleanName(parsed?.companyName);
  const reply = String(parsed?.reply ?? '').replace(/\s+\n/g, '\n').trim().slice(0, 4000);
  let intent = String(parsed?.intent ?? '').trim();
  let audience = String(parsed?.audience ?? '').trim();

  if (!INTENTS.has(intent)) {
    if (personName) intent = 'person_posts';
    else if (keywords) intent = 'job_seeker';
    else intent = 'chat';
  }
  if (!AUDIENCES.has(audience)) {
    audience = intent === 'recruiter' ? 'recruiter' : intent === 'chat' ? 'unknown' : 'developer';
  }

  if (intent === 'latest_posts') {
    return {
      intent,
      audience,
      reply: reply || 'Latest hiring posts nikaal raha hoon. LinkedIn search bar touch nahi hogi.',
      keywords: keywords || 'hiring',
      location,
      personName,
      companyName,
    };
  }

  if (intent === 'person_posts' && personName) {
    return {
      intent,
      audience,
      reply: reply || `${personName} ki posts nikaal raha hoon.`,
      keywords: keywords || 'hiring',
      location,
      personName,
      companyName,
    };
  }

  if (intent === 'chat' || (intent !== 'chat' && !keywords && !personName && !companyName)) {
    return {
      intent: 'chat',
      audience,
      reply: reply || 'Main yahin hoon. Job, latest posts, kisi recruiter ki posts, ya candidates — jo chaho poochho.',
      keywords: '',
      location: '',
      personName: '',
      companyName: '',
    };
  }

  return {
    intent,
    audience,
    reply: reply || (intent === 'recruiter'
      ? `Matching profiles silently dhoondh raha hoon: ${keywords}${location ? ` in ${location}` : ''}.`
      : `Jobs aur hiring posts silently nikaal raha hoon: ${keywords}${location ? ` in ${location}` : ''}.`),
    keywords,
    location,
    personName,
    companyName,
  };
}

export const interpretUserTurnWithAI = async ({ query, conversation, pageUrl, textContext }) => {
  if (!ai) {
    throw new GeminiServiceError('Gemini service is not configured.', 503);
  }

  const prompt = `You are Ask AI, a LinkedIn assistant for developers and recruiters.
You save screen time by fetching results yourself. Never tell the user to type into LinkedIn search.

Choose exactly one intent:
- "chat": conversation, advice, greetings. No LinkedIn fetch.
- "job_seeker": user wants a job. Fetch jobs AND hiring posts AND hiring people/company profile links.
- "recruiter": user is hiring and wants candidate profiles.
- "person_posts": user named a person/recruiter and wants THAT person's posts (e.g. "Sara hiring kar rahi hai, uski posts do").
- "latest_posts": user wants latest/recent posts, especially hiring posts.

Return ONLY this JSON:
{"intent":"person_posts","audience":"developer","reply":"...","keywords":"hiring","location":"","personName":"Sara Khan","companyName":""}

Rules:
- reply: always required, same language as the user. Say you will fetch results without using LinkedIn's search bar.
- keywords: role/skills, or "hiring" for latest posts. Empty for chat.
- location: city if mentioned, else "".
- personName: required for person_posts. The person's real name only.
- companyName: company if mentioned.
- Do not put years of experience into keywords.
- No markdown, no code fences, no extra keys.

Examples:
- "2 years exp, Node.js job in Karachi" -> job_seeker, keywords Node.js, location Karachi
- "Ali Raza hiring kar raha hai iski posts do" -> person_posts, personName Ali Raza
- "latest posts nikaal do" -> latest_posts, keywords hiring
- "I need a Node.js developer in Lahore" -> recruiter, keywords Node.js developer, location Lahore
- "How do I follow up?" -> chat

Optional current page (untrusted, only if they ask about this page):
URL: ${pageUrl || 'N/A'}
TEXT: ${textContext || 'N/A'}

Recent conversation:
${JSON.stringify(conversation || [])}

Latest user message:
${query}`;

  const jsonConfig = { responseMimeType: 'application/json' };

  try {
    const response = await generateWithRetries(geminiModels.primary, prompt, jsonConfig);
    return normalizeAssistantTurn(safeResponseText(response));
  } catch (primaryError) {
    if (primaryError instanceof GeminiServiceError) throw primaryError;
    if (!shouldUseFallback(primaryError) || geminiModels.fallback === geminiModels.primary) {
      throw new GeminiServiceError('Gemini request failed.', getStatusCode(primaryError), primaryError);
    }
    console.warn(`Primary Gemini model (${geminiModels.primary}) failed; trying fallback (${geminiModels.fallback}).`);
    try {
      const response = await generateWithRetries(geminiModels.fallback, prompt, jsonConfig);
      return normalizeAssistantTurn(safeResponseText(response));
    } catch (fallbackError) {
      if (fallbackError instanceof GeminiServiceError) throw fallbackError;
      throw new GeminiServiceError(
        'Gemini request failed on both configured models.',
        getStatusCode(fallbackError) ?? getStatusCode(primaryError),
        fallbackError
      );
    }
  }
};
