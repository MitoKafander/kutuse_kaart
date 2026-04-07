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
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const prompt = `You are a high-accuracy vision system analyzing a fuel station price board (totem) for a station named "${stationName || 'gas station'}".
Your ONLY job is to extract the numeric float prices for the following fuel types if they are visible: "Bensiin 95", "Bensiin 98", "Diisel", "LPG".
Understand that European signs generally use commas instead of decimals (e.g. 1,749) but you MUST return proper javascript floats (1.749).
Return exactly a valid JSON object mapping these exact keys to the float values.
If a fuel grade does not exist on the board, simply omit that key or set it to null.
Example JSON: {"Bensiin 95": 1.749, "Bensiin 98": 1.799, "Diisel": 1.629}`;

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
    return new Response(JSON.stringify({ error: error.message || 'Unknown API Exception' }), { 
      status: 500, headers: { 'Content-Type': 'application/json' }  
    });
  }
}
