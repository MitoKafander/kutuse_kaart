import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  runtime: 'edge', // Use edge compute for ultra-fast, cold-bootless API response
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing Gemini API key.' }), { 
      status: 500, headers: { 'Content-Type': 'application/json' } 
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { imageBase64, stationName } = await req.json() as { imageBase64?: string; stationName?: string };

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 payload.' }), { 
        status: 400, headers: { 'Content-Type': 'application/json' } 
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
      headers: { 'Content-Type': 'application/json' } 
    });
    
  } catch (error: any) {
    console.error('Vision API Error:', error);
    const msg = error.message || 'Unknown API Exception';
    const is503 = msg.includes('503') || /service.?unavailable|high demand/i.test(msg);
    const is429 = msg.includes('429') || /quota|rate.?limit/i.test(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: is429 ? 429 : is503 ? 503 : 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
