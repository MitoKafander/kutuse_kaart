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
      return res.status(429).json({ error: 'Liiga palju päringuid. Proovi ~1 min pärast.' });
    }
    const day = await dayLimit.limit('global');
    if (!day.success) {
      return res.status(429).json({ error: 'Päevane AI-limiit täis, proovi homme.' });
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

    // Force strictly validated JSON parsing
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      }
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
- "detectedBrand": The brand identified in the image (e.g., "Olerex", "Circle K", "Neste", "Alexela").
- "isBrandMatch": boolean (true if detectedBrand is the same company as "${hint}", false if it's clearly a competitor). If there is no branding visible, return true.
- "Bensiin 95", "Bensiin 98", "Diisel", "LPG": Float values. Omit or set to null if not visible.

Example JSON: {"detectedBrand": "Alexela", "isBrandMatch": true, "Bensiin 95": 1.749}`
      : `You are a high-accuracy vision system analyzing a fuel station price board (totem) at an unknown Estonian fuel station.
Your job is twofold:
1. Identify the station's brand based on logos, colors, or text in the image (common Estonian brands: "Olerex", "Circle K", "Neste", "Alexela", "Terminal").
2. Extract the numeric float prices for the following fuel types if they are visible: "Bensiin 95", "Bensiin 98", "Diisel", "LPG".

Understand that European signs generally use commas instead of decimals (e.g. 1,749) but you MUST return proper javascript floats (1.749).
Return strictly a valid JSON object with the following schema:
- "detectedBrand": The brand identified in the image, or null if no brand is visible.
- "isBrandMatch": Always return true (there is no expected brand to compare against).
- "Bensiin 95", "Bensiin 98", "Diisel", "LPG": Float values. Omit or set to null if not visible.

Always extract any prices you can read, even if you cannot identify the brand.

Example JSON: {"detectedBrand": "Alexela", "isBrandMatch": true, "Bensiin 95": 1.749, "Diisel": 1.529}`;

    // Strip out the descriptive prefix if the frontend sent it
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      }
    ]);

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

    const normalized = {
      detectedBrand: typeof parsed.detectedBrand === 'string' ? parsed.detectedBrand : null,
      isBrandMatch: parsed.isBrandMatch !== false,
      extractedAny,
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
    const is503 = msg.includes('503') || /service.?unavailable|high demand|overloaded/i.test(msg);
    const is429 = msg.includes('429') || /quota|rate.?limit/i.test(msg);
    // Collapse verbose Gemini messages into clean codes the client can branch on
    // and keep out of Sentry — these are transient upstream conditions, not bugs.
    if (is429) return res.status(429).json({ error: 'QUOTA_EXCEEDED' });
    if (is503) return res.status(503).json({ error: 'AI_UPSTREAM_BUSY' });
    return res.status(500).json({ error: msg });
  }
}
