const db = require('../db');

/**
 * Natural language intent parser (Deterministic Fallback & Fast Extractor)
 * Converts natural queries like:
 * - "Plan my day in Bengaluru"
 * - "Plan a cheap day in Mumbai"
 * - "I want a low carbon day in Delhi"
 * - "Plan a fast itinerary in Bengaluru"
 * - "I have ₹1500 and want to visit these places"
 * - "Plan a 10 AM to 6 PM itinerary"
 * - "I want to visit Bangalore Palace and Cubbon Park"
 * - "Give me a low-carbon heritage day"
 * into structured optimizer parameters with guaranteed real POI matching from the database.
 */
function parseIntent(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    return { success: false, error: 'Query text is required' };
  }

  const text = queryText.toLowerCase();

  // 1. Detect City from DB
  const cities = db.prepare("SELECT city_id, name, state, country_code, region FROM cities WHERE status = 'active'").all();
  let matchedCity = null;

  for (const c of cities) {
    const cName = c.name.toLowerCase();
    // Match exact word or boundary
    const regex = new RegExp(`\\b${cName}\\b`, 'i');
    if (regex.test(text) || text.includes(cName)) {
      matchedCity = c;
      break;
    }
  }

  // Fallback default city if none explicitly mentioned (Bengaluru)
  if (!matchedCity) {
    matchedCity = cities.find(c => c.name.toLowerCase() === 'bengaluru') || cities[0];
  }

  // 2. Detect Time Windows (e.g. "10 AM to 6 PM", "10:00 to 18:00", "from 9am to 5pm", "9 am - 7 pm")
  let dayStart = '09:00';
  let dayEnd = '18:00';

  const timeRangeRegex = /(?:from\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const timeMatch = queryText.match(timeRangeRegex);

  function parseHourStr(str, isEnd = false) {
    if (!str) return null;
    const s = str.trim().toLowerCase();
    const isPm = s.includes('pm');
    const isAm = s.includes('am');
    const clean = s.replace(/(?:am|pm)/g, '').trim();
    const parts = clean.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1], 10) : 0;

    if (isNaN(h)) return null;

    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    // Heuristic for unspecified AM/PM: end time < 12 is likely afternoon/PM
    if (!isPm && !isAm) {
      if (isEnd && h >= 1 && h <= 11) h += 12;
    }

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (timeMatch) {
    const parsedStart = parseHourStr(timeMatch[1], false);
    const parsedEnd = parseHourStr(timeMatch[2], true);
    if (parsedStart) dayStart = parsedStart;
    if (parsedEnd) dayEnd = parsedEnd;
  }

  // 3. Detect Budget Cap (e.g. "under ₹1500", "budget 2000", "< 1200", "I have ₹1500", "₹1500", "1500 inr")
  let budgetCap = null;
  const budgetRegex = /(?:under|budget|max|below|less than|within|cap of|have|spend|around)?\s*(?:₹|rs\.?|inr)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i;
  const budgetAltRegex = /(?:under|budget|max|below|less than|within|cap of|have|spend)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:₹|rs\.?|inr|rupees)?/i;

  const budgetMatch = queryText.match(budgetRegex) || queryText.match(budgetAltRegex);
  if (budgetMatch) {
    budgetCap = budgetMatch[1].replace(/,/g, '');
  }

  // 4. Detect Carbon Cap (e.g. "carbon under 8kg", "5 kg carbon", "low carbon")
  let carbonCap = null;
  const carbonRegex = /(?:carbon|co2|emissions?)\s*(?:under|below|max|within|cap of)?\s*(\d+(?:\.\d+)?)\s*(?:kg)?/i;
  const carbonMatch = queryText.match(carbonRegex);
  if (carbonMatch) {
    carbonCap = parseFloat(carbonMatch[1]);
  } else if (/low[-\s]?carbon|zero[-\s]?carbon|green/i.test(text)) {
    carbonCap = 8.0;
  }

  // 5. Detect Objective Weight Biases
  let weights = { cost: 0.33, time: 0.33, carbon: 0.34 };

  if (/low[-\s]?carbon|green|eco|clean|emission/i.test(text)) {
    weights = { cost: 0.20, time: 0.20, carbon: 0.60 };
  } else if (/cheap|budget|low[-\s]?cost|inexpensive|save money/i.test(text)) {
    weights = { cost: 0.60, time: 0.20, carbon: 0.20 };
  } else if (/fast|quick|short|save time|speed/i.test(text)) {
    weights = { cost: 0.20, time: 0.60, carbon: 0.20 };
  }

  // Normalize weights
  const sumW = weights.cost + weights.time + weights.carbon;
  weights = {
    cost: Number((weights.cost / sumW).toFixed(2)),
    time: Number((weights.time / sumW).toFixed(2)),
    carbon: Number((weights.carbon / sumW).toFixed(2))
  };

  // 6. Match Real POIs from database for this city
  const cityPois = db.prepare("SELECT poi_id, name, poi_category, tags FROM activities_poi WHERE city_id = ? AND status = 'active'").all(matchedCity.city_id);

  const matchedPoiIds = [];
  const mustSeeKeywords = [];

  for (const poi of cityPois) {
    const poiNameLower = poi.name.toLowerCase();
    const nameWords = poiNameLower.split(/\s+/).filter(w => w.length > 3 && !['road', 'street', 'gate', 'tour'].includes(w));

    let matched = false;
    if (text.includes(poiNameLower)) {
      matched = true;
      mustSeeKeywords.push(poi.name);
    } else {
      for (const w of nameWords) {
        if (text.includes(w)) {
          matched = true;
          mustSeeKeywords.push(w);
          break;
        }
      }
    }

    if (matched && !matchedPoiIds.includes(poi.poi_id)) {
      matchedPoiIds.push(poi.poi_id);
    }
  }

  // If no specific POIs matched by name, check category keywords
  const categories = ['palace', 'park', 'temple', 'museum', 'bazaar', 'market', 'lake', 'fort', 'garden', 'heritage', 'beach'];
  for (const cat of categories) {
    if (text.includes(cat)) {
      mustSeeKeywords.push(cat);
      const found = cityPois.find(p => p.name.toLowerCase().includes(cat) || (p.poi_category && p.poi_category.toLowerCase().includes(cat)));
      if (found && !matchedPoiIds.includes(found.poi_id)) {
        matchedPoiIds.push(found.poi_id);
      }
    }
  }

  let theme = 'Optimized City Highlights';
  if (/heritage|culture|historic|monument|fort|palace/i.test(text)) {
    theme = 'Low Carbon Heritage';
  } else if (/green|eco|low[-\s]?carbon|park|garden/i.test(text)) {
    theme = 'Green City Nature & Parks';
  } else if (/cheap|budget/i.test(text)) {
    theme = 'Budget Explorer';
  }

  return {
    success: true,
    parsed: {
      city_id: matchedCity.city_id,
      city_name: matchedCity.name,
      day_start: dayStart,
      day_end: dayEnd,
      budget_cap: budgetCap || '2500',
      carbon_cap_kg: carbonCap || 10,
      weights,
      must_see_keywords: Array.from(new Set(mustSeeKeywords)),
      must_see_poi_ids: matchedPoiIds.slice(0, 4),
      theme
    }
  };
}

module.exports = {
  parseIntent
};
