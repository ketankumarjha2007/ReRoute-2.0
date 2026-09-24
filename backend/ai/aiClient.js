/**
 * Abstract AI Client for ReRoute
 * Built for Groq + GPT-OSS (OpenAI-compatible) with multi-provider support:
 * - Groq (openai/gpt-oss-20b, llama-3.3-70b-versatile, etc.)
 * - OpenAI-compatible endpoints (OpenRouter, Together, Local Ollama)
 * - Google Gemini (gemini-1.5-flash)
 *
 * Configurable via environment variables:
 *   AI_API_KEY
 *   AI_BASE_URL (defaults to https://api.groq.com/openai/v1)
 *   AI_MODEL (defaults to openai/gpt-oss-20b)
 */

function getAiConfig() {
  const apiKey = (process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').trim();
  const model = (process.env.AI_MODEL || 'openai/gpt-oss-20b').trim();

  let provider = 'OpenAI-Compatible';
  if (baseUrl.includes('groq.com')) {
    provider = 'Groq';
  } else if (baseUrl.includes('openai.com')) {
    provider = 'OpenAI';
  } else if (baseUrl.includes('openrouter.ai')) {
    provider = 'OpenRouter';
  } else if (baseUrl.includes('together.xyz')) {
    provider = 'Together AI';
  } else if (baseUrl.includes('googleapis.com') || model.startsWith('gemini')) {
    provider = 'Gemini';
  }

  return {
    apiKey,
    baseUrl,
    model,
    provider,
    configured: Boolean(apiKey)
  };
}

/**
 * Returns safe AI status without exposing secrets
 */
function getAiStatus() {
  const config = getAiConfig();
  return {
    success: true,
    configured: config.configured,
    provider: config.provider,
    model: config.model
  };
}

/**
 * Tests connectivity to the configured AI model with a tiny request
 */
async function testAiConnection() {
  const config = getAiConfig();

  if (!config.configured) {
    return {
      success: false,
      configured: false,
      provider: config.provider,
      model: config.model,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'AI_API_KEY is not configured in backend environment.'
      }
    };
  }

  try {
    const isGemini = config.provider === 'Gemini';
    let shortResponse = '';

    if (isGemini) {
      const endpoint = config.baseUrl.includes('googleapis.com')
        ? `${config.baseUrl}?key=${config.apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with exactly: ReRoute AI is ready.' }] }],
          generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = await res.json();
      shortResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Connected';
    } else {
      const endpoint = config.baseUrl.endsWith('/chat/completions')
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          max_tokens: 30,
          messages: [
            { role: 'user', content: 'Say "ReRoute AI is online." in 5 words or fewer.' }
          ]
        }),
        signal: AbortSignal.timeout(7000)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${config.provider} API error (${res.status}): ${errText.slice(0, 180)}`);
      }

      const data = await res.json();
      shortResponse = data?.choices?.[0]?.message?.content?.trim() || 'Connected';
    }

    return {
      success: true,
      provider: config.provider,
      model: config.model,
      short_response: shortResponse
    };
  } catch (err) {
    return {
      success: false,
      provider: config.provider,
      model: config.model,
      error: {
        code: 'AI_CONNECTION_FAILED',
        message: err.message
      }
    };
  }
}

/**
 * Extracts structured intent from natural language using the configured LLM.
 * Returns { success: true, parsed: {...} } or { success: false, fallback: true, error: string }
 */
async function extractIntentWithLlm(promptText, activeCityNames = []) {
  const config = getAiConfig();

  if (!config.configured) {
    return {
      success: false,
      fallback: true,
      reason: 'NO_API_KEY',
      error: 'AI_API_KEY not set. Utilizing deterministic fallback parser.'
    };
  }

  const systemInstructions = `You are ReRoute's Travel Intent Extraction Engine.
Extract traveler constraints and priorities from their prompt into strict JSON.
Available database cities: ${activeCityNames.slice(0, 40).join(', ')}.

Return ONLY valid JSON matching this schema, with no markdown code fences and no conversational commentary:
{
  "city_name": string (most relevant matched city, or null if unmentioned),
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
  "theme": string (short 3-5 word title for the day style, e.g. "Low Carbon Heritage")
}`;

  try {
    let rawContent = '';
    const isGemini = config.provider === 'Gemini';

    if (isGemini) {
      const endpoint = config.baseUrl.includes('googleapis.com')
        ? `${config.baseUrl}?key=${config.apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemInstructions}\n\nTraveler prompt: "${promptText}"` }]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
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
      const endpoint = config.baseUrl.endsWith('/chat/completions')
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
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
        throw new Error(`${config.provider} API error (${res.status}): ${errBody.slice(0, 150)}`);
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

    // Validate and sanitize parsed fields
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI returned non-object JSON');
    }

    // Normalize weights to sum exactly to 1.0
    if (parsed.weights && typeof parsed.weights === 'object') {
      const c = Math.max(0.01, Number(parsed.weights.cost) || 0.33);
      const t = Math.max(0.01, Number(parsed.weights.time) || 0.33);
      const carb = Math.max(0.01, Number(parsed.weights.carbon) || 0.34);
      const sum = c + t + carb;
      parsed.weights = {
        cost: Number((c / sum).toFixed(2)),
        time: Number((t / sum).toFixed(2)),
        carbon: Number((carb / sum).toFixed(2))
      };
      // Correct any rounding difference to ensure exact 1.00 sum
      const diff = 1.00 - (parsed.weights.cost + parsed.weights.time + parsed.weights.carbon);
      if (Math.abs(diff) > 0.001) {
        parsed.weights.carbon = Number((parsed.weights.carbon + diff).toFixed(2));
      }
    } else {
      parsed.weights = { cost: 0.33, time: 0.33, carbon: 0.34 };
    }

    // Sanitize time format
    const timeRegex = /^\d{1,2}:\d{2}$/;
    if (!parsed.day_start || !timeRegex.test(parsed.day_start)) {
      parsed.day_start = '09:00';
    }
    if (!parsed.day_end || !timeRegex.test(parsed.day_end)) {
      parsed.day_end = '18:00';
    }

    // Sanitize numeric caps
    if (parsed.budget_cap !== null && parsed.budget_cap !== undefined) {
      const b = Number(parsed.budget_cap);
      parsed.budget_cap = (!isNaN(b) && b > 0) ? b : null;
    }
    if (parsed.carbon_cap_kg !== null && parsed.carbon_cap_kg !== undefined) {
      const cb = Number(parsed.carbon_cap_kg);
      parsed.carbon_cap_kg = (!isNaN(cb) && cb > 0) ? cb : null;
    }

    if (!Array.isArray(parsed.must_see_keywords)) {
      parsed.must_see_keywords = [];
    }

    return {
      success: true,
      fallback: false,
      provider: config.provider,
      model: config.model,
      parsed
    };

  } catch (err) {
    console.warn(`[AI Client] LLM intent extraction failed (${err.message}). Falling back safely.`);
    return {
      success: false,
      fallback: true,
      error: err.message
    };
  }
}

/**
 * Generates an engaging 2-3 sentence grounded narrative for a calculated itinerary.
 * Feeds actual deterministic metrics (stops, cost, time, carbon) to the LLM.
 */
async function generateNarrativeWithLlm(cityName, stopsList, summary, promptText) {
  const config = getAiConfig();
  if (!config.configured) return null;

  try {
    const isGemini = config.provider === 'Gemini';
    const stopsNames = stopsList.map(s => s.name).join(', ');
    const prompt = `You are ReRoute's AI travel concierge.
Traveler asked: "${promptText}".
Our deterministic optimizer computed this verified day in ${cityName}:
- Attractions: ${stopsNames}
- Total Cost: ₹${summary.cost}
- Total Duration: ${summary.minutes} minutes (${summary.day_start} to ${summary.day_end})
- Total Carbon Emissions: ${summary.carbon_kg} kg CO₂
- Number of stops: ${stopsList.length}

In 2 to 3 concise, natural sentences, explain why this route fits their preferences and balances cost, time, and carbon. Mention specific stops and real figures. Do not invent any extra places or numbers.`;

    if (isGemini) {
      const endpoint = config.baseUrl.includes('googleapis.com')
        ? `${config.baseUrl}?key=${config.apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 250 }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } else {
      const endpoint = config.baseUrl.endsWith('/chat/completions')
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.3,
          max_tokens: 250,
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

/**
 * Generates natural language explanation for an infeasible case grounded in deterministic diagnosis.
 */
async function explainInfeasibilityWithLlm(diagnosis, promptText = '') {
  const config = getAiConfig();
  if (!config.configured) return null;

  try {
    const isGemini = config.provider === 'Gemini';
    const prompt = `You are ReRoute's constraint optimization diagnostician.
A traveler requested a route: "${promptText}".
The deterministic solver detected that no feasible plan exists with these hard constraints.
Binding Constraint: ${diagnosis.binding_constraint?.type || 'CONSTRAINTS'}
Constraint Details: ${JSON.stringify(diagnosis.binding_constraint)}
Deterministic Diagnosis: ${diagnosis.explanation}

In 2 clear, helpful sentences for a human traveler:
1. Explain clearly why their plan cannot be scheduled.
2. Explain the suggested relaxation and why it resolves the bottleneck.
Do not hallucinate fake numbers. Rely strictly on the given facts.`;

    if (isGemini) {
      const endpoint = config.baseUrl.includes('googleapis.com')
        ? `${config.baseUrl}?key=${config.apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 250 }
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } else {
      const endpoint = config.baseUrl.endsWith('/chat/completions')
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 250,
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
  getAiStatus,
  testAiConnection,
  extractIntentWithLlm,
  generateNarrativeWithLlm,
  explainInfeasibilityWithLlm
};
