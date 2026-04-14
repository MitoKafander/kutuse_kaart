import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge', // Use edge compute for ultra-fast, cold-bootless API response
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = hasUpstash ? Redis.fromEnv() : null;
const perIpLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), analytics: true, prefix: 'kyts:parse' })
  : null;
const dayLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(1000, '1 d'), analytics: true, prefix: 'kyts:parse:day' })
  : null;

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing Gemini API key.' }), {
      status: 500, headers: JSON_HEADERS
    });
  }

  // Rate limit before doing any work (only if Upstash env is configured)
  if (perIpLimit && dayLimit) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
    const perIp = await perIpLimit.limit(ip);
    if (!perIp.success) {
      return new Response(JSON.stringify({ error: 'Liiga palju päringuid. Proovi ~1 min pärast.' }), {
        status: 429,
        headers: { ...JSON_HEADERS, 'Retry-After': String(Math.max(1, Math.ceil((perIp.reset - Date.now()) / 1000))) },
      });
    }
    const day = await dayLimit.limit('global');
    if (!day.success) {
      return new Response(JSON.stringify({ error: 'Päevane AI-limiit täis, proovi homme.' }), {
        status: 429, headers: JSON_HEADERS,
      });
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { imageBase64, stationName } = await req.json() as { imageBase64?: string; stationName?: string };

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 payload.' }), { 
        status: 400, headers: JSON_HEADERS 
      });
    }

    // Force strictly validated JSON parsing
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
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

    const text = result.response.text();
    return new Response(text, { 
      status: 200, 
      headers: JSON_HEADERS 
    });
    
  } catch (error: any) {
    console.error('Vision API Error:', error);
    const msg = error.message || 'Unknown API Exception';
    const is503 = msg.includes('503') || /service.?unavailable|high demand/i.test(msg);
    const is429 = msg.includes('429') || /quota|rate.?limit/i.test(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: is429 ? 429 : is503 ? 503 : 500, headers: JSON_HEADERS
    });
  }
}
