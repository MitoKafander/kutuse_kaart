// Gemini = translator, not analyst. We hand it a pulse object of NUMBERS plus
// the already-computed signals, and ask for a human-readable rewrite in ALL
// SIX app languages (ET/EN/RU/FI/LV/LT). If the response trips our
// forbidden-phrase guard or doesn't parse, the caller falls back to the
// deterministic template — the row still ships.

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { FuelSignal } from './computeSignal.js';

export type TranslatorInput = {
  diesel: FuelSignal;
  gasoline: FuelSignal;
  /** Kyts current averages in €/L — used verbatim in the prose. */
  kytsAvg: {
    diesel: number | null;
    gasoline95: number | null;
  };
  /** Headline global numbers, all already deltaed 7d. */
  globals: {
    brentUsd: number | null;
    brentDelta7d: number | null;
    eurUsd: number | null;
    eurUsdDelta7d: number | null;
    gasoilDelta7d: number | null;
    rbobDelta7d: number | null;
  };
};

export const LANGS = ['et', 'en', 'ru', 'fi', 'lv', 'lt'] as const;
export type Lang = (typeof LANGS)[number];

export type TranslatorOutput = {
  headline_et: string; headline_en: string; headline_ru: string;
  headline_fi: string; headline_lv: string; headline_lt: string;
  content_et: string; content_en: string; content_ru: string;
  content_fi: string; content_lv: string; content_lt: string;
};

// Phrases that imply causal/news claims we never gave the model. If any of
// these appear in output AND aren't in input, we reject and fall back. We
// keep this list to high-signal terms only — false positives here silently
// revert the whole row to fallback text.
const FORBIDDEN = [
  // Estonian
  'analüütik', 'eksperdid', 'uudiste', 'ennustavad', 'opec', 'sanktsioon',
  'konflikt', 'sõda', 'rünnak', 'tarneahel',
  // English
  'analyst', 'expert', 'news report', 'sanction', 'war',
  'attack', 'supply chain',
  // Russian
  'аналитик', 'эксперт', 'новост', 'санкц', 'конфликт', 'война', 'опек',
  // Finnish
  'analyytik', 'asiantunt', 'sanktio', 'sota', 'hyökkäys',
  // Latvian
  'analītiķ', 'eksperti', 'sankcij', 'karš', 'uzbrukum',
  // Lithuanian
  'analitik', 'ekspert', 'sankcij', 'karas', 'puolim',
];

function violatesGuard(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN.some(term => lower.includes(term));
}

function buildPrompt(input: TranslatorInput): string {
  // We hand Gemini only the numbers. No news, no web access, no prior text.
  // The rules are restrictive on purpose — every rule traces back to a
  // failure mode we want to prevent (causal hallucination, invented events,
  // overclaiming certainty).
  return [
    'You are a careful market-data translator for a fuel-price app in Estonia.',
    'You will receive a JSON object of computed numbers and per-fuel signals.',
    'Your ONLY job: rewrite those numbers as a short, plainspoken update in',
    'SIX languages: Estonian, English, Russian, Finnish, Latvian, Lithuanian.',
    'You are a NUMBERS narrator, not an analyst.',
    '',
    'HARD RULES — violations will cause your output to be rejected:',
    '1. Never invent causes. Do not mention news, wars, OPEC, sanctions,',
    '   supply chains, analysts, or experts. If you do not know why a number',
    '   moved, just describe the move without a reason.',
    '2. Use only numbers from the input JSON. Do not quote figures not present.',
    '3. Keep each headline under 70 characters.',
    '4. Content: 2 short paragraphs per language. First paragraph summarizes',
    '   what is happening to diesel and petrol 95. Second paragraph tells the',
    '   driver what the signal means for their next fill-up, grounded in the',
    '   numbers.',
    '5. Do not claim certainty. Use hedged language ("likely", "tõenäoliselt",',
    '   "вероятно", "todennäköisesti", "iespējams", "tikėtina").',
    '6. Do not use emoji.',
    '7. Tone: friendly but neutral, like a weather forecaster.',
    '8. All six languages must be faithful translations of the same meaning —',
    '   do not add a detail in one language that is missing from the others.',
    '',
    'INPUT:',
    JSON.stringify(input, null, 2),
    '',
    'Return a single JSON object with these 12 string keys:',
    '  headline_et, headline_en, headline_ru, headline_fi, headline_lv, headline_lt,',
    '  content_et,  content_en,  content_ru,  content_fi,  content_lv,  content_lt',
  ].join('\n');
}

export type TranslatorResult =
  | { ok: true; out: TranslatorOutput }
  | { ok: false; reason: string };

export async function translateWithGemini(
  apiKey: string,
  input: TranslatorInput,
): Promise<TranslatorResult> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      // 6 languages × (2 paragraphs + 1 headline). Estonian/Finnish/Latvian
      // /Lithuanian are token-heavy vs English (~1.5-2× per word). Budget of
      // 6000 leaves headroom so a single long paragraph doesn't clip the
      // trailing languages.
      maxOutputTokens: 6000,
      // Disable Gemini 2.5 "thinking" — for a translation task, reasoning
      // burns budget we need for output. See git history for the truncation
      // incident that motivated this.
      thinkingConfig: { thinkingBudget: 0 },
    } as any,
  });

  const prompt = buildPrompt(input);
  const inputText = prompt.toLowerCase();

  let raw: string;
  try {
    const result = await model.generateContent([prompt]);
    raw = result.response.text();
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[marketInsight] Gemini call failed:', msg);
    return { ok: false, reason: `api_call_failed: ${msg.slice(0, 200)}` };
  }

  if (!raw || raw.length === 0) {
    return { ok: false, reason: 'empty_response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const slice = fence ? fence[1].trim() : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    try {
      parsed = JSON.parse(slice);
    } catch {
      console.error('[marketInsight] Gemini JSON parse failed:', raw.slice(0, 300));
      return { ok: false, reason: `parse_failed: ${raw.slice(0, 120)}` };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'not_an_object' };
  }
  const p = parsed as Record<string, unknown>;
  const pick = (k: string) => String(p[k] ?? '').trim();
  const out: TranslatorOutput = {
    headline_et: pick('headline_et'), headline_en: pick('headline_en'),
    headline_ru: pick('headline_ru'), headline_fi: pick('headline_fi'),
    headline_lv: pick('headline_lv'), headline_lt: pick('headline_lt'),
    content_et: pick('content_et'), content_en: pick('content_en'),
    content_ru: pick('content_ru'), content_fi: pick('content_fi'),
    content_lv: pick('content_lv'), content_lt: pick('content_lt'),
  };

  const missing = (Object.keys(out) as (keyof TranslatorOutput)[]).filter(k => !out[k]);
  if (missing.length > 0) {
    return { ok: false, reason: `missing_fields: ${missing.join(',')}` };
  }

  // Guard: if output claims a cause (OPEC, sanctions, etc.) that was never in
  // the input prompt, reject. Only way those words get through is if Gemini
  // made them up — which is exactly what we're defending against.
  const combined = Object.values(out).join('\n');
  if (violatesGuard(combined)) {
    const offending = FORBIDDEN.filter(t => combined.toLowerCase().includes(t));
    const spuriousClaims = offending.filter(t => !inputText.includes(t));
    if (spuriousClaims.length > 0) {
      console.warn('[marketInsight] Rejected Gemini output for unsupported claim(s):', spuriousClaims);
      return { ok: false, reason: `guardrail_rejected: ${spuriousClaims.join(',')}` };
    }
  }

  // Length sanity — if any headline runs way long, reject. Typically the
  // model obeys the 70-char rule; 120 as a hard cap catches obvious runaways.
  const tooLong = LANGS.filter(l => (out[`headline_${l}` as keyof TranslatorOutput] as string).length > 120);
  if (tooLong.length > 0) {
    return { ok: false, reason: `headline_too_long: ${tooLong.join(',')}` };
  }

  return { ok: true, out };
}
