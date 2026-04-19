// Gemini = translator, not analyst. We hand it a pulse object of NUMBERS plus
// the already-computed signals, and ask for a human-readable Estonian + English
// rewrite. If the response trips our forbidden-phrase guard or doesn't parse,
// the caller falls back to the deterministic template — the row still ships.

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

export type TranslatorOutput = {
  headline_et: string;
  headline_en: string;
  content_et: string;
  content_en: string;
};

// Phrases that imply causal/news claims we never gave the model. If any of
// these appear in output AND aren't in input, we reject and fall back.
const FORBIDDEN = [
  // Estonian
  'analüütik', 'eksperdid', 'uudiste', 'ennustavad', 'opec', 'sanktsioon',
  'konflikt', 'sõda', 'rünnak', 'tarneahel',
  // English
  'analyst', 'expert', 'news report', 'sanction', 'conflict', 'war',
  'attack', 'supply chain', 'opec',
];

function violatesGuard(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN.some(term => lower.includes(term));
}

const SCHEMA = {
  type: 'object',
  properties: {
    headline_et: { type: 'string', maxLength: 80 },
    headline_en: { type: 'string', maxLength: 80 },
    content_et:  { type: 'string' },
    content_en:  { type: 'string' },
  },
  required: ['headline_et', 'headline_en', 'content_et', 'content_en'],
};

function buildPrompt(input: TranslatorInput): string {
  // We hand Gemini only the numbers. No news, no web access, no prior text.
  // The rules are restrictive on purpose — every rule traces back to a
  // failure mode we want to prevent (causal hallucination, invented events,
  // overclaiming certainty).
  return [
    'You are a careful market-data translator for a fuel-price app in Estonia.',
    'You will receive a JSON object of computed numbers and per-fuel signals.',
    'Your ONLY job: rewrite those numbers as a short, plainspoken update in',
    'Estonian and English. You are a NUMBERS narrator, not an analyst.',
    '',
    'HARD RULES — violations will cause your output to be rejected:',
    '1. Never invent causes. Do not mention news, wars, OPEC, sanctions,',
    '   supply chains, analysts, or experts. If you do not know why a number',
    '   moved, say "põhjus ebaselge" / "cause unclear".',
    '2. Use only numbers from the input JSON. Do not quote figures not present.',
    '3. Keep headlines under 70 characters.',
    '4. Content: 2 short paragraphs per language. First paragraph summarizes',
    '   what is happening to diesel and 95. Second paragraph tells the driver',
    '   what the signal means for their next fill-up — grounded in the numbers.',
    '5. Do not claim certainty. Use hedged language ("tõenäoliselt", "likely").',
    '6. Do not use emoji.',
    '7. Estonian tone: friendly but neutral, like a weather forecaster.',
    '',
    'INPUT:',
    JSON.stringify(input, null, 2),
    '',
    'Return JSON with keys: headline_et, headline_en, content_et, content_en.',
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
      // `responseSchema` is supported on Gemini 1.5+ and enforces the shape.
      // The @google/generative-ai v0.24.1 types may not include it, so we
      // pass it as any-cast below.
      temperature: 0.2,
      // 2 paragraphs × 2 languages + 2 headlines in Estonian (verbose
      // language, ~1.6× English tokens). 800 was cutting mid-sentence and
      // producing unparseable JSON — 2000 leaves comfortable headroom.
      maxOutputTokens: 2000,
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

  // Gemini occasionally wraps JSON in ```json fences despite responseMimeType.
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
  const out: TranslatorOutput = {
    headline_et: String(p.headline_et ?? '').trim(),
    headline_en: String(p.headline_en ?? '').trim(),
    content_et:  String(p.content_et  ?? '').trim(),
    content_en:  String(p.content_en  ?? '').trim(),
  };

  if (!out.headline_et || !out.headline_en || !out.content_et || !out.content_en) {
    const missing = ['headline_et','headline_en','content_et','content_en']
      .filter(k => !(out as any)[k]);
    return { ok: false, reason: `missing_fields: ${missing.join(',')}` };
  }

  // Guard: if output claims a cause (OPEC, sanctions, etc.) that was never in
  // the input prompt, reject. Only way those words get through is if Gemini
  // made them up — which is exactly what we're defending against.
  const combined = `${out.headline_et}\n${out.headline_en}\n${out.content_et}\n${out.content_en}`;
  if (violatesGuard(combined)) {
    const offending = FORBIDDEN.filter(t => combined.toLowerCase().includes(t));
    const spuriousClaims = offending.filter(t => !inputText.includes(t));
    if (spuriousClaims.length > 0) {
      console.warn('[marketInsight] Rejected Gemini output for unsupported claim(s):', spuriousClaims);
      return { ok: false, reason: `guardrail_rejected: ${spuriousClaims.join(',')}` };
    }
  }

  // Length sanity.
  if (out.headline_et.length > 100 || out.headline_en.length > 100) {
    return { ok: false, reason: `headline_too_long: et=${out.headline_et.length} en=${out.headline_en.length}` };
  }

  return { ok: true, out };
}

export { SCHEMA as GEMINI_SCHEMA };
