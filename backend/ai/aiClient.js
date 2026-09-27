/**
 * Abstract AI Client for ReRoute
 *
 * Built for Groq + GPT-OSS (OpenAI-compatible) with multi-provider support:
 * - Groq (openai/gpt-oss-20b, llama-3.3-70b-versatile, etc.)
 * - OpenAI-compatible endpoints (OpenRouter, Together, Local Ollama)
 * - Google Gemini
 *
 * AI intent extraction is protected by the ReRoute AI Output Contract.
 *
 * IMPORTANT:
 * The AI is NOT the source of truth for:
 * - itinerary cost
 * - travel time
 * - carbon
 * - feasibility
 * - opening hours
 * - route availability
 *
 * Those are handled by the deterministic ReRoute optimizer
 * and APS-09 database.
 *
 * Configurable via environment variables:
 * AI_API_KEY
 * AI_BASE_URL
 * AI_MODEL
 */

const {
  validateAiOutput
} = require('./outputContract');


/**
 * ============================================================
 * AI CONFIGURATION
 * ============================================================
 */

function getAiConfig() {

  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim();

  const baseUrl = (
    process.env.AI_BASE_URL ||
    'https://api.groq.com/openai/v1'
  ).trim();

  const model = (
    process.env.AI_MODEL ||
    'openai/gpt-oss-20b'
  ).trim();


  let provider = 'OpenAI-Compatible';


  if (baseUrl.includes('groq.com')) {

    provider = 'Groq';

  } else if (baseUrl.includes('openai.com')) {

    provider = 'OpenAI';

  } else if (baseUrl.includes('openrouter.ai')) {

    provider = 'OpenRouter';

  } else if (baseUrl.includes('together.xyz')) {

    provider = 'Together AI';

  } else if (
    baseUrl.includes('googleapis.com') ||
    model.startsWith('gemini')
  ) {

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
 * ============================================================
 * AI STATUS
 * ============================================================
 *
 * Returns safe AI status without exposing secrets.
 */

function getAiStatus() {

  const config =
    getAiConfig();

  return {

    success: true,

    configured:
      config.configured,

    provider:
      config.provider,

    model:
      config.model
  };
}


/**
 * ============================================================
 * TEST AI CONNECTION
 * ============================================================
 */

async function testAiConnection() {

  const config =
    getAiConfig();


  if (!config.configured) {

    return {

      success: false,

      configured: false,

      provider:
        config.provider,

      model:
        config.model,

      error: {

        code:
          'NOT_CONFIGURED',

        message:
          'AI_API_KEY is not configured in backend environment.'
      }
    };
  }


  try {

    const isGemini =
      config.provider === 'Gemini';

    let shortResponse = '';


    /*
     * --------------------------------------------------------
     * Gemini
     * --------------------------------------------------------
     */

    if (isGemini) {

      const endpoint =
        config.baseUrl.includes(
          'googleapis.com'
        )
          ? `${config.baseUrl}?key=${config.apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              contents: [
                {
                  parts: [
                    {
                      text:
                        'Respond with exactly: ReRoute AI is ready.'
                    }
                  ]
                }
              ],

              generationConfig: {
                maxOutputTokens: 20,
                temperature: 0.1
              }

            }),

            signal:
              AbortSignal.timeout(6000)
          }
        );


      if (!res.ok) {

        const errText =
          await res.text();

        throw new Error(
          `Gemini API error (${res.status}): ${errText.slice(0, 150)}`
        );
      }


      const data =
        await res.json();

      shortResponse =
        data?.candidates?.[0]
          ?.content?.parts?.[0]
          ?.text
          ?.trim() ||
        'Connected';


      /*
       * --------------------------------------------------------
       * OpenAI-compatible providers
       * --------------------------------------------------------
       */

    } else {

      const endpoint =
        config.baseUrl.endsWith(
          '/chat/completions'
        )
          ? config.baseUrl
          : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {

              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${config.apiKey}`
            },

            body: JSON.stringify({

              model:
                config.model,

              temperature:
                0.1,

              max_tokens:
                30,

              messages: [

                {
                  role: 'user',

                  content:
                    'Say "ReRoute AI is online." in 5 words or fewer.'
                }

              ]

            }),

            signal:
              AbortSignal.timeout(7000)
          }
        );


      if (!res.ok) {

        const errText =
          await res.text();

        throw new Error(
          `${config.provider} API error (${res.status}): ${errText.slice(0, 180)}`
        );
      }


      const data =
        await res.json();

      shortResponse =
        data?.choices?.[0]
          ?.message
          ?.content
          ?.trim() ||
        'Connected';
    }


    return {

      success: true,

      provider:
        config.provider,

      model:
        config.model,

      short_response:
        shortResponse
    };


  } catch (err) {

    return {

      success: false,

      provider:
        config.provider,

      model:
        config.model,

      error: {

        code:
          'AI_CONNECTION_FAILED',

        message:
          err.message
      }
    };
  }
}


/**
 * ============================================================
 * EXTRACT STRUCTURED TRAVEL INTENT
 * ============================================================
 *
 * IMPORTANT:
 *
 * The LLM ONLY extracts user intent.
 *
 * It does NOT:
 * - calculate cost
 * - calculate carbon
 * - calculate travel time
 * - decide feasibility
 * - create an itinerary
 *
 * After JSON parsing, the output is passed through
 * validateAiOutput().
 *
 * Invalid AI output is rejected instead of silently
 * being corrected.
 */

async function extractIntentWithLlm(
  promptText,
  activeCityNames = []
) {

  const config =
    getAiConfig();


  /*
   * ----------------------------------------------------------
   * No API key
   * ----------------------------------------------------------
   */

  if (!config.configured) {

    return {

      success: false,

      fallback: true,

      reason:
        'NO_API_KEY',

      error:
        'AI_API_KEY not set. Utilizing deterministic fallback parser.'
    };
  }


  /*
   * ----------------------------------------------------------
   * AI OUTPUT CONTRACT
   * ----------------------------------------------------------
   */

  const backendToday = new Date().toISOString().split('T')[0];
  const systemInstructions = `
  You are ReRoute's Travel Intent Extraction Engine.

Your ONLY job is to understand the user's travel preferences
and convert them into structured JSON.

You are NOT the itinerary optimizer.

You MUST NOT calculate or invent:

- itinerary cost
- travel cost
- travel duration
- carbon emissions
- opening hours
- route availability
- feasibility
- final itinerary
- stops
- transfers
- scores

Those values are calculated by the ReRoute backend using the
official APS-09 database and deterministic optimizer.

Current backend date: ${backendToday}

Available database cities:

${activeCityNames
      .slice(0, 40)
      .join(', ')}

Return ONLY valid JSON.

Do not use markdown.
Do not use code fences.
Do not add explanations.

Use EXACTLY this schema:

{
  "city_name": string or null,
  "day_date": "YYYY-MM-DD",

  "budget_cap": string or null,

  "carbon_cap_kg": number or null,

  "day_start": "HH:MM",

  "day_end": "HH:MM",

  "weights": {
    "cost": number,
    "time": number,
    "carbon": number
  },

  "must_see_keywords": [],

  "allowed_modes": [],

  "theme": string
}

Rules:

1. budget_cap must be a STRING containing INR.
   Example: "2500.00"

2. Never return estimated_cost.

3. Never return total_cost.

4. Never return itinerary cost.

5. Never return carbon emissions for an itinerary.

6. Never return travel duration.

7. Never return feasibility.

8. Never return an itinerary.

9. Never return stops.

10. Never return transfers.

11. Never invent POI IDs.

12. Return places as natural-language keywords
    inside must_see_keywords.

13. allowed_modes may contain ONLY:
    "walk"
    "cab"

14. If the user does not specify a budget,
    return null.

15. If the user does not specify a carbon cap,
    return null.

16. Weights must be non-negative and sum to 1.0.

17. day_date must use YYYY-MM-DD format.

18. If the user says today, use the current backend date.

19. If the user says tomorrow, use the next calendar date.

20. If the user gives an explicit date, convert it to YYYY-MM-DD.

21. If the user gives yesterday or a date before the current backend date, do not create a past-date plan.

22. If the user does not specify a date, use the current backend date.

23. day_start and day_end must use HH:MM 24-hour format.

24. Extract user preferences only.

25. Do not make factual claims about POI prices,
    carbon, travel times or opening hours.

26. Do not generate final itinerary metrics.
`;


  try {

    let rawContent = '';

    const isGemini =
      config.provider === 'Gemini';


    /*
     * ========================================================
     * GEMINI
     * ========================================================
     */

    if (isGemini) {

      const endpoint =
        config.baseUrl.includes(
          'googleapis.com'
        )
          ? `${config.baseUrl}?key=${config.apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              contents: [

                {

                  parts: [

                    {
                      text:
                        `${systemInstructions}\n\nTraveler prompt:\n${promptText}`
                    }

                  ]

                }

              ],

              generationConfig: {

                temperature:
                  0.1,

                maxOutputTokens:
                  600
              }

            }),

            signal:
              AbortSignal.timeout(8000)
          }
        );


      if (!res.ok) {

        const errBody =
          await res.text();

        throw new Error(
          `Gemini API error (${res.status}): ${errBody.slice(0, 150)}`
        );
      }


      const data =
        await res.json();

      rawContent =
        data?.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text ||
        '';


      /*
       * ========================================================
       * OPENAI-COMPATIBLE PROVIDERS
       * ========================================================
       */

    } else {

      const endpoint =
        config.baseUrl.endsWith(
          '/chat/completions'
        )
          ? config.baseUrl
          : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {

              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${config.apiKey}`
            },

            body: JSON.stringify({

              model:
                config.model,

              temperature:
                0.1,

              messages: [

                {
                  role: 'system',

                  content:
                    systemInstructions
                },

                {
                  role: 'user',

                  content:
                    promptText
                }

              ]

            }),

            signal:
              AbortSignal.timeout(8000)
          }
        );


      if (!res.ok) {

        const errBody =
          await res.text();

        throw new Error(
          `${config.provider} API error (${res.status}): ${errBody.slice(0, 150)}`
        );
      }


      const data =
        await res.json();

      rawContent =
        data?.choices?.[0]
          ?.message
          ?.content ||
        '';
    }


    /*
     * ========================================================
     * CLEAN MODEL OUTPUT
     * ========================================================
     *
     * We allow the model to accidentally wrap JSON in
     * markdown fences, but nothing else is silently corrected.
     * ========================================================
     */

    const cleanedJson =
      rawContent
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();


    /*
     * ========================================================
     * PARSE JSON
     * ========================================================
     */

    let parsed;

    try {

      parsed =
        JSON.parse(
          cleanedJson
        );

    } catch (jsonError) {

      console.warn(
        '[AI Client] AI returned invalid JSON:',
        rawContent
      );

      return {

        success: false,

        fallback: true,

        reason:
          'AI_INVALID_JSON',

        error:
          'The AI returned invalid JSON.',

        validation: {

          valid: false,

          errors: [
            'AI response could not be parsed as JSON'
          ],

          warnings: []
        }
      };
    }


    /*
     * ========================================================
     * AI OUTPUT CONTRACT VALIDATION
     * ========================================================
     *
     * THIS IS THE IMPORTANT PART.
     *
     * We do NOT silently repair:
     * - invalid weights
     * - invalid time
     * - invalid budget
     * - invalid carbon
     * - unsupported modes
     * - forbidden fields
     *
     * We reject the response instead.
     * ========================================================
     */

    const validation =
      validateAiOutput(
        parsed
      );


    if (!validation.valid) {

      console.warn(
        '[AI Client] AI output rejected by contract:',
        validation.errors
      );


      return {

        success: false,

        fallback: true,

        reason:
          'AI_OUTPUT_CONTRACT_FAILED',

        error:
          'The AI response did not satisfy the ReRoute AI Output Contract.',

        validation: {

          valid: false,

          errors:
            validation.errors,

          warnings:
            validation.warnings
        }
      };
    }


    /*
     * ========================================================
     * SUCCESS
     * ========================================================
     *
     * At this point:
     *
     * JSON is valid
     * +
     * schema is valid
     * +
     * values are within allowed format/rules
     *
     * BUT:
     *
     * This does NOT mean the AI has generated a valid
     * itinerary.
     *
     * It has only generated VALID USER INTENT.
     * ========================================================
     */

    return {

      success: true,

      fallback: false,

      provider:
        config.provider,

      model:
        config.model,

      parsed,

      validation: {

        valid: true,

        errors: [],

        warnings:
          validation.warnings
      }
    };


  } catch (err) {

    console.warn(
      `[AI Client] LLM intent extraction failed (${err.message}). Falling back safely.`
    );


    return {

      success: false,

      fallback: true,

      reason:
        'AI_REQUEST_FAILED',

      error:
        err.message
    };
  }
}


/**
 * ============================================================
 * GROUNDED NARRATIVE GENERATION
 * ============================================================
 *
 * This function receives deterministic optimizer output.
 *
 * The AI is ONLY allowed to explain the already-calculated
 * result.
 */

async function generateNarrativeWithLlm(
  cityName,
  stopsList,
  summary,
  promptText
) {

  const config =
    getAiConfig();


  if (!config.configured) {
    return null;
  }


  try {

    const isGemini =
      config.provider === 'Gemini';


    const stopsNames =
      stopsList
        .map(
          stop => stop.name
        )
        .join(', ');


    const prompt = `
You are ReRoute's AI travel concierge.

The deterministic ReRoute optimizer has already calculated
and verified the itinerary.

Traveler request:
"${promptText}"

Verified optimizer result:

City:
${cityName}

Attractions:
${stopsNames}

Total Cost:
₹${summary.cost}

Total Duration:
${summary.minutes} minutes

Day:
${summary.day_start} to ${summary.day_end}

Total Carbon:
${summary.carbon_kg} kg CO₂

Number of stops:
${stopsList.length}

IMPORTANT RULES:

1. Use ONLY the verified facts provided above.
2. Do not invent any new place.
3. Do not invent any price.
4. Do not invent any carbon value.
5. Do not invent any travel duration.
6. Do not change any number.
7. Do not claim that a different itinerary was calculated.
8. Do not make claims about feasibility beyond the supplied
   verified result.

Write 2 to 3 concise natural sentences explaining why
this itinerary matches the traveler's stated preferences.
`;


    /*
     * --------------------------------------------------------
     * Gemini
     * --------------------------------------------------------
     */

    if (isGemini) {

      const endpoint =
        config.baseUrl.includes(
          'googleapis.com'
        )
          ? `${config.baseUrl}?key=${config.apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              contents: [

                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }

              ],

              generationConfig: {

                temperature:
                  0.2,

                maxOutputTokens:
                  250
              }

            }),

            signal:
              AbortSignal.timeout(6000)
          }
        );


      if (!res.ok) {
        return null;
      }


      const data =
        await res.json();


      return (
        data?.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text
          ?.trim() ||
        null
      );


      /*
       * --------------------------------------------------------
       * OpenAI-compatible
       * --------------------------------------------------------
       */

    } else {

      const endpoint =
        config.baseUrl.endsWith(
          '/chat/completions'
        )
          ? config.baseUrl
          : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {

              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${config.apiKey}`
            },

            body: JSON.stringify({

              model:
                config.model,

              temperature:
                0.2,

              max_tokens:
                250,

              messages: [

                {
                  role: 'user',

                  content:
                    prompt
                }

              ]

            }),

            signal:
              AbortSignal.timeout(6000)
          }
        );


      if (!res.ok) {
        return null;
      }


      const data =
        await res.json();


      return (
        data?.choices?.[0]
          ?.message
          ?.content
          ?.trim() ||
        null
      );
    }


  } catch (e) {

    return null;
  }
}


/**
 * ============================================================
 * INFEASIBILITY EXPLANATION
 * ============================================================
 *
 * The diagnosis comes from the deterministic optimizer.
 * AI only converts it into human-friendly language.
 */

async function explainInfeasibilityWithLlm(
  diagnosis,
  promptText = ''
) {

  const config =
    getAiConfig();


  if (!config.configured) {
    return null;
  }


  try {

    const isGemini =
      config.provider === 'Gemini';


    const prompt = `
You are ReRoute's constraint optimization diagnostician.

A deterministic ReRoute optimizer has already determined
that no feasible itinerary exists under the requested
hard constraints.

Traveler request:
"${promptText}"

Binding Constraint:
${diagnosis.binding_constraint?.type || 'CONSTRAINTS'}

Constraint Details:
${JSON.stringify(
      diagnosis.binding_constraint
    )}

Deterministic Diagnosis:
${diagnosis.explanation}

Suggested Relaxation:
${JSON.stringify(
      diagnosis.relaxation || null
    )}

IMPORTANT:

1. Do not invent facts.
2. Do not invent numbers.
3. Do not invent places.
4. Do not change the binding constraint.
5. Do not claim that a plan is feasible unless the
   deterministic solver says so.
6. Use only the supplied diagnosis.

In 2 clear sentences:

1. Explain why the requested plan cannot be scheduled.
2. Explain the supplied relaxation if one exists.
`;


    /*
     * --------------------------------------------------------
     * Gemini
     * --------------------------------------------------------
     */

    if (isGemini) {

      const endpoint =
        config.baseUrl.includes(
          'googleapis.com'
        )
          ? `${config.baseUrl}?key=${config.apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              contents: [

                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }

              ],

              generationConfig: {

                temperature:
                  0.1,

                maxOutputTokens:
                  250
              }

            }),

            signal:
              AbortSignal.timeout(6000)
          }
        );


      if (!res.ok) {
        return null;
      }


      const data =
        await res.json();


      return (
        data?.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text
          ?.trim() ||
        null
      );


      /*
       * --------------------------------------------------------
       * OpenAI-compatible
       * --------------------------------------------------------
       */

    } else {

      const endpoint =
        config.baseUrl.endsWith(
          '/chat/completions'
        )
          ? config.baseUrl
          : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;


      const res =
        await fetch(
          endpoint,
          {

            method: 'POST',

            headers: {

              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${config.apiKey}`
            },

            body: JSON.stringify({

              model:
                config.model,

              temperature:
                0.1,

              max_tokens:
                250,

              messages: [

                {
                  role: 'user',

                  content:
                    prompt
                }

              ]

            }),

            signal:
              AbortSignal.timeout(6000)
          }
        );


      if (!res.ok) {
        return null;
      }


      const data =
        await res.json();


      return (
        data?.choices?.[0]
          ?.message
          ?.content
          ?.trim() ||
        null
      );
    }


  } catch (e) {

    return null;
  }
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

  getAiConfig,

  getAiStatus,

  testAiConnection,

  extractIntentWithLlm,

  generateNarrativeWithLlm,

  explainInfeasibilityWithLlm
};









