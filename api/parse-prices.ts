import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const config = {
  // Node runtime so Gemini vision calls that take 20–40s don't get killed by the
  // 25s Edge ceiling. Node serverless maxDuration is 60s on Hobby as of 2024 —
  // comfortably above Gemini's p99 and below Vercel's bill-a-minute threshold.
  runtime: 'nodejs',
  maxDuration: 60,
};

const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = hasUpstash ? Redis.fromEnv() : null;
const perIpLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), analytics: true, prefix: 'kyts:parse' })
  : null;
const dayLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(1000, '1 d'), analytics: true, prefix: 'kyts:parse:day' })
  : null;

// Canonical fuel-chain brands that the AI is allowed to return for
// `detectedBrand`. Mirrors CHAIN_PATTERNS in src/utils.ts — kept inline here
// because the API runs on Vercel's Node serverless without the React app's
// import graph. Without this whitelist Gemini hallucinates sub-text on totems
// (e.g. the "Teeline" loyalty slogan on Olerex signs) as the station brand.
const ALLOWED_BRANDS = [
  // Estonian
  'Olerex', 'Circle K', 'Neste', 'Alexela', 'Terminal', 'Krooning',
  'Jetoil', 'JetGas', 'Statoil', 'Eesti Autogaas', 'Eksar Transoil',
  'Premium 7', 'Hepa', 'Thor', 'Saare Kütus',
  // Latvian (border + LV region)
  'Virši-A', 'Viada', 'KOOL', 'Astarte Nafta', 'Latvijas Nafta',
  'Latvijas Propāna Gāze', 'Lateva', 'Gotika Auto',
] as const;
const ALLOWED_BRANDS_LIST = ALLOWED_BRANDS.map(b => `"${b}"`).join(', ');

function repairAndParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* fall through */ }

  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const braceStart = s.indexOf('{');
  const braceEnd = s.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    s = s.slice(braceStart, braceEnd + 1);
  }
  try { return JSON.parse(s); } catch { return null; }
}

type NodeReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
};
type NodeRes = {
  status: (code: number) => NodeRes;
  setHeader: (name: string, value: string) => void;
  json: (data: any) => void;
};

export default async function handler(req: NodeReq, res: NodeRes) {
  // Allow cross-origin POST from www.kyts.ee — installed PWAs from before the
  // apex/www swap still load from www and would otherwise get 308'd to apex,
  // which Safari refuses to follow for a JSON POST preflight.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing Gemini API key.' });
  }

  if (perIpLimit && dayLimit) {
    const fwd = req.headers['x-forwarded-for'];
    const fwdStr = Array.isArray(fwd) ? fwd[0] : fwd;
    const ip = fwdStr?.split(',')[0]?.trim() ?? 'anon';
    const perIp = await perIpLimit.limit(ip);
    if (!perIp.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((perIp.reset - Date.now()) / 1000))));
      // RATE_LIMITED (per-IP burst) is distinct from QUOTA_EXCEEDED (global/day).
      // Collapsing the two surfaced the "daily limit exhausted" copy every time
      // a user burned through the 10/min burst with retries — misleading since
      // the per-IP window resets in seconds.
      return res.status(429).json({ error: 'Liiga palju päringuid. Proovi ~1 min pärast.', code: 'RATE_LIMITED' });
    }
    const day = await dayLimit.limit('global');
    if (!day.success) {
      return res.status(429).json({ error: 'Päevane AI-limiit täis, proovi homme.', code: 'QUOTA_EXCEEDED' });
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // Vercel's Node runtime auto-parses JSON bodies into req.body.
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    const { imageBase64, stationName } = body as { imageBase64?: string; stationName?: string };

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 payload.' });
    }

    // Build a fresh model handle for each attempt so the fallback path can
    // swap to Flash-Lite without mutating state from the primary call.
    const buildModel = (modelName: string) => genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        // Gemini 2.5 Flash has "thinking" mode on by default. For pure vision
        // extraction (read the sign, return JSON) reasoning adds 2–10s of
        // latency and burns quota on invisible tokens. Turn it off — the
        // market-insight translator did this a week ago (63f2038); parse-prices
        // was missed. Cast matches that callsite.
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    // FAB-mode photo scans don't know the station yet — they pass no hint or
    // the placeholder "tankla". In that case the brand-match check is meaningless
    // and confuses the model into returning empty/malformed responses, so use a
    // simpler "unknown station" prompt that focuses purely on price + brand extraction.
    const hint = (stationName || '').trim();
    const hasKnownStation = hint.length > 0 && hint.toLowerCase() !== 'tankla' && hint.toLowerCase() !== 'gas station';

    const prompt = hasKnownStation
      ? `You are a high-accuracy vision system analyzing a fuel station price board (totem) for a station conceptually named "${hint}".
Your job is twofold:
1. Identify the station's brand based on logos, colors, or text in the image. Determine if it matches the expected name "${hint}".
2. Extract the numeric float prices for the following fuel types if they are visible: "Bensiin 95", "Bensiin 98", "Diisel", "LPG".

Understand that European signs generally use commas instead of decimals (e.g. 1,749) but you MUST return proper javascript floats (1.749).
Return strictly a valid JSON object with the following schema:
- "detectedBrand": The brand identified in the image. MUST be EXACTLY one of these values, or null if no recognised brand is visible: ${ALLOWED_BRANDS_LIST}. Do NOT invent brand names from sub-text on the sign such as loyalty programmes, slogans, or sub-services (e.g. "Teeline" on an Olerex totem is a loyalty slogan, not a brand — return "Olerex" or null, never "Teeline"). If you cannot map the visible branding to one of the listed values with high confidence, return null.
- "isBrandMatch": boolean (true if detectedBrand is the same company as "${hint}", false if it's clearly a competitor). If detectedBrand is null, return true.
- "Bensiin 95", "Bensiin 98", "Diisel", "LPG": Float values. Omit or set to null if not visible.

Example JSON: {"detectedBrand": "Alexela", "isBrandMatch": true, "Bensiin 95": 1.749}`
      : `You are a high-accuracy vision system analyzing a fuel station price board (totem) at an unknown Estonian or Latvian fuel station.
Your job is twofold:
1. Identify the station's brand based on logos, colors, or text in the image.
2. Extract the numeric float prices for the following fuel types if they are visible: "Bensiin 95", "Bensiin 98", "Diisel", "LPG".

Understand that European signs generally use commas instead of decimals (e.g. 1,749) but you MUST return proper javascript floats (1.749).
Return strictly a valid JSON object with the following schema:
- "detectedBrand": The brand identified in the image. MUST be EXACTLY one of these values, or null if no recognised brand is visible: ${ALLOWED_BRANDS_LIST}. Do NOT invent brand names from sub-text on the sign such as loyalty programmes, slogans, or sub-services (e.g. "Teeline" on an Olerex totem is a loyalty slogan, not a brand — return "Olerex" or null, never "Teeline"). If you cannot map the visible branding to one of the listed values with high confidence, return null.
- "isBrandMatch": Always return true (there is no expected brand to compare against).
- "Bensiin 95", "Bensiin 98", "Diisel", "LPG": Float values. Omit or set to null if not visible.

Always extract any prices you can read, even if you cannot identify the brand.

Example JSON: {"detectedBrand": "Alexela", "isBrandMatch": true, "Bensiin 95": 1.749, "Diisel": 1.529}`;

    // Strip out the descriptive prefix if the frontend sent it
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const contents = [
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ];

    const isOverloaded = (msg: string): boolean =>
      /503|service.?unavailable|overloaded|unavailable|deadline.?exceeded/i.test(msg);

    // Server-side Flash → Flash-Lite fallback. When Gemini 2.5 Flash is
    // overloaded (the dominant failure pattern in our telemetry — every
    // ai_scan_failure in the last 48h was AI_UPSTREAM_BUSY), retry once on
    // Flash-Lite before surfacing a 503 to the client. Lite uses a separate
    // capacity pool at Google, so it clears while Flash is still hot most of
    // the time. Accuracy on a structured JSON vision task is within a few
    // percent of Flash for this use case.
    let result: Awaited<ReturnType<ReturnType<typeof buildModel>['generateContent']>>;
    let modelUsed = 'gemini-2.5-flash';
    try {
      result = await buildModel(modelUsed).generateContent(contents);
    } catch (primaryErr: any) {
      const msg = primaryErr?.message || '';
      if (!isOverloaded(msg)) throw primaryErr;
      modelUsed = 'gemini-2.5-flash-lite';
      console.warn('[parse-prices] Flash overloaded, falling back to Flash-Lite');
      result = await buildModel(modelUsed).generateContent(contents);
    }

    const rawText = result.response.text();

    // Gemini occasionally wraps JSON in ```json fences or prepends commentary
    // despite responseMimeType. Repair before parsing so one stray char doesn't
    // turn into "AI lugemine ebaõnnestus" on the client.
    const parsed = repairAndParseJson(rawText);
    if (!parsed) {
      console.error('[parse-prices] JSON parse failed. Raw response (truncated):', rawText.slice(0, 400));
      return res.status(502).json({
        error: 'AI_JSON_INVALID',
        detail: 'Gemini returned a non-JSON response.',
        rawPreview: rawText.slice(0, 200),
      });
    }

    const FUEL_KEYS = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'] as const;
    const prices: Record<string, number> = {};
    for (const k of FUEL_KEYS) {
      const v = parsed[k];
      if (typeof v === 'number' && isFinite(v) && v > 0) prices[k] = v;
      else if (typeof v === 'string') {
        const num = parseFloat(v.replace(',', '.'));
        if (isFinite(num) && num > 0) prices[k] = num;
      }
    }
    const extractedAny = Object.keys(prices).length > 0;

    if (!extractedAny) {
      console.warn('[parse-prices] No prices extracted. Raw response (truncated):', rawText.slice(0, 400));
    }

    // Belt-and-braces enforcement of the brand whitelist: even with the prompt
    // instruction Gemini occasionally returns sub-text from the totem (slogans,
    // loyalty marks). Drop anything not in ALLOWED_BRANDS so the client never
    // sees an invented brand that would mislead the station picker.
    const rawBrand = typeof parsed.detectedBrand === 'string' ? parsed.detectedBrand.trim() : null;
    const brandLower = rawBrand?.toLowerCase() ?? null;
    const allowedBrand = brandLower
      ? ALLOWED_BRANDS.find(b => b.toLowerCase() === brandLower) ?? null
      : null;
    if (rawBrand && !allowedBrand) {
      console.warn('[parse-prices] Dropped non-whitelisted brand:', rawBrand);
    }
    const normalized = {
      detectedBrand: allowedBrand,
      isBrandMatch: parsed.isBrandMatch !== false,
      extractedAny,
      // Surfaces whether the Flash → Flash-Lite fallback fired on this call
      // so the client can PostHog it and we can measure the fallback hit rate.
      modelUsed,
      ...prices,
    };

    return res.status(200).json(normalized);

  } catch (error: any) {
    // Log structured context so Vercel function logs tell us which Gemini
    // failure mode we're in — plain `console.error(error)` buried the status
    // code inside a stack trace and made frequency analysis impossible.
    const msg = error?.message || 'Unknown API Exception';
    console.error('[parse-prices] Gemini call failed', {
      message: msg,
      name: error?.name,
      status: error?.status ?? error?.response?.status,
      statusText: error?.statusText ?? error?.response?.statusText,
      // The google-generative-ai SDK wraps the upstream error; keep a short
      // preview of the serialized payload but cap length so one bad response
      // doesn't fill the log quota.
      detail: JSON.stringify(error?.errorDetails ?? error?.response?.data ?? null)?.slice(0, 400),
    });
    // Gemini surfaces upstream failures through several naming conventions
    // (HTTP status, GRPC code, free-form prose). Classify them into the two
    // transient buckets the client can branch on. RESOURCE_EXHAUSTED is
    // Gemini's GRPC code for throttle/quota and must land on 429, not 503 —
    // before this explicit check it slipped through as a raw 500.
    const is429 = msg.includes('429') || /quota|rate.?limit|resource.?exhausted/i.test(msg);
    const is503 = msg.includes('503') || msg.includes('504')
      || /service.?unavailable|high demand|overloaded|unavailable|deadline.?exceeded|internal(?!.*server error 500)/i.test(msg);
    if (is429) return res.status(429).json({ error: 'QUOTA_EXCEEDED', code: 'QUOTA_EXCEEDED' });
    if (is503) return res.status(503).json({ error: 'AI_UPSTREAM_BUSY', code: 'AI_UPSTREAM_BUSY' });
    return res.status(500).json({ error: msg });
  }
}
