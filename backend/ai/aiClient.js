/**
 * Abstract AI Client for ReRoute
 * Supports free/low-cost LLM providers:
 * - Google Gemini (gemini-1.5-flash / gemini-2.5-flash)
 * - OpenAI-compatible endpoints (Groq, OpenRouter, Together, Local Ollama)
 * Fully configurable via environment variables:
 *   AI_API_KEY (or GEMINI_API_KEY / OPENAI_API_KEY)
 *   AI_BASE_URL (optional custom base URL)
 *   AI_MODEL (e.g. 'gemini-1.5-flash', 'llama-3.1-8b-instant', etc.)
 */

function getAiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
  const baseUrl = process.env.AI_BASE_URL || '';
  const model = process.env.AI_MODEL || (baseUrl ? 'llama-3.1-8b-instant' : 'gemini-1.5-flash');

  return { apiKey, baseUrl, model };
}

/**
 * Parses natural language prompt into structured itinerary intent using AI.
 * Returns { success: true, parsed: {...} } or { success: false, fallback: true, error: string }
 */
async function extractIntentWithLlm(promptText, activeCityNames = []) {
  const { apiKey, baseUrl, model } = getAiConfig();

  if (!apiKey) {
    return {
      success: false,
      fallback: true,
      reason: 'NO_API_KEY',
      error: 'No AI API key configured. Utilizing local smart fallback.'
    };
  }

  const systemInstructions = `You are ReRoute's Travel Intent Extraction Engine.
Extract the traveler's constraints and priorities from their prompt into strict JSON.
Available database cities: ${activeCityNames.slice(0, 30).join(', ')}.

Return ONLY valid JSON matching this schema, with no markdown code fences:
{
  "city_name": string (most relevant matched city, or "Bengaluru" default),
  "budget_cap": number or null (budget ceiling in INR if mentioned),
  "carbon_cap_kg": number or null (carbon ceiling in kg if mentioned),
  "day_start": string ("HH:MM" 24hr format, default "09:00"),
  "day_end": string ("HH:MM" 24hr format, default "18:00"),
  "weights": {
    "cost": number (0.05 to 0.90, sum must be 1.0),
    "time": number (0.05 to 0.90),
    "carbon": number (0.05 to 0.90)
  },
  "must_see_keywords": array of strings (names of specific places, monuments, or categories mentioned, e.g. ["palace", "park", "temple"]),
  "theme": string (short 3-5 word title for the day style, e.g. "Green City Heritage")
}`;

  try {
    let rawContent = '';

    // Provider 1: Gemini REST API
    const isGemini = !baseUrl || baseUrl.includes('googleapis.com') || model.startsWith('gemini');
    if (isGemini) {
      const endpoint = baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const url = endpoint.includes('key=') ? endpoint : `${endpoint}?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemInstructions}\n\nTraveler prompt: "${promptText}"`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 600
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errBody.slice(0, 150)}`);
      }

      const data = await res.json();
      rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // Provider 2: OpenAI-compatible endpoint (Groq / OpenRouter / Ollama)
      const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: promptText }
          ]
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`AI API error (${res.status}): ${errBody.slice(0, 150)}`);
      }

      const data = await res.json();
      rawContent = data?.choices?.[0]?.message?.content || '';
    }

    // Clean JSON response (strip markdown fences if model returned them)
    const cleanedJson = rawContent
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);

    // Normalize weights to sum to 1.0
    if (parsed.weights) {
      const sum = (parsed.weights.cost || 0.33) + (parsed.weights.time || 0.33) + (parsed.weights.carbon || 0.34);
      parsed.weights = {
        cost: Number(((parsed.weights.cost || 0.33) / sum).toFixed(2)),
        time: Number(((parsed.weights.time || 0.33) / sum).toFixed(2)),
        carbon: Number(((parsed.weights.carbon || 0.34) / sum).toFixed(2))
      };
    }

    return {
      success: true,
      fallback: false,
      model,
      parsed
    };

  } catch (err) {
    console.warn(`[AI Client] LLM call failed (${err.message}). Using smart fallback.`);
    return {
      success: false,
      fallback: true,
      error: err.message
    };
  }
}

/**
 * Generates an inspiring 2-3 sentence grounded narrative for an itinerary.
 */
async function generateNarrativeWithLlm(cityName, stopsList, summary, promptText) {
  const { apiKey, baseUrl, model } = getAiConfig();
  if (!apiKey) return null;

  try {
    const isGemini = !baseUrl || baseUrl.includes('googleapis.com') || model.startsWith('gemini');
    const prompt = `You are ReRoute's AI travel concierge.
Traveler asked: "${promptText}".
We computed this real optimized day in ${cityName}:
Stops: ${stopsList.map(s => s.name).join(', ')}.
Total Cost: ₹${summary.cost}, Duration: ${summary.minutes} minutes, Carbon: ${summary.carbon_kg} kg CO₂.
In 2-3 concise, engaging sentences, explain why this route is optimal for them and how it respects their time, budget, and carbon goals. Keep it realistic.`;

    if (isGemini) {
      const endpoint = baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const url = endpoint.includes('key=') ? endpoint : `${endpoint}?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 250 }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } else {
      const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() || null;
    }
  } catch (e) {
    return null;
  }
}

module.exports = {
  getAiConfig,
  extractIntentWithLlm,
  generateNarrativeWithLlm
};
