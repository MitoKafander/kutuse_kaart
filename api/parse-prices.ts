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
    const { imageBase64, stationName } = await req.json();

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

    const prompt = `You are a high-accuracy vision system analyzing a fuel station price board (totem) for a station conceptually named "${stationName || 'gas station'}".
Your job is twofold:
1. Identify the station's brand based on logos, colors, or text in the image. Determine if it matches the expected name "${stationName}".
2. Extract the numeric float prices for the following fuel types if they are visible: "Bensiin 95", "Bensiin 98", "Diisel", "LPG".

Understand that European signs generally use commas instead of decimals (e.g. 1,749) but you MUST return proper javascript floats (1.749).
Return strictly a valid JSON object with the following schema:
- "detectedBrand": The brand identified in the image (e.g., "Olerex", "Circle K", "Neste", "Alexela").
- "isBrandMatch": boolean (true if detectedBrand is the same company as "${stationName}", false if it's clearly a competitor). If there is no branding visible, return true.
- "Bensiin 95", "Bensiin 98", "Diisel", "LPG": Float values. Omit or set to null if not visible.

Example JSON: {"detectedBrand": "Alexela", "isBrandMatch": true, "Bensiin 95": 1.749}`;

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
