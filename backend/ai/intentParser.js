const db = require('../db');

/**
 * Natural language intent parser
 * Converts natural queries like "Plan a low-carbon day in Bengaluru under ₹1500, visit palace and park"
 * into structured optimizer parameters with guaranteed real POI matching from the database.
 */
function parseIntent(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    return { success: false, error: 'Query text is required' };
  }

  const text = queryText.toLowerCase();

  // 1. Detect City from DB
  const cities = db.prepare("SELECT city_id, name FROM cities WHERE status = 'active'").all();
  let matchedCity = null;

  for (const c of cities) {
    if (text.includes(c.name.toLowerCase())) {
      matchedCity = c;
      break;
    }
  }

  // Fallback default city if none explicitly mentioned (Bengaluru)
  if (!matchedCity) {
    matchedCity = cities.find(c => c.name.toLowerCase() === 'bengaluru') || cities[0];
  }

  // 2. Detect Budget Cap (e.g., "under ₹1500", "budget 2000", "< 1200", "under 1000")
  let budgetCap = null;
  const budgetRegex = /(?:under|budget|max|below|less than|within|cap of)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i;
  const budgetMatch = queryText.match(budgetRegex);
  if (budgetMatch) {
    budgetCap = budgetMatch[1].replace(/,/g, '');
  }

  // 3. Detect Carbon Cap (e.g. "carbon under 8kg", "5 kg carbon", "low carbon")
  let carbonCap = null;
  const carbonRegex = /(?:carbon|co2|emissions?)\s*(?:under|below|max|within|cap of)?\s*(\d+(?:\.\d+)?)\s*(?:kg)?/i;
  const carbonMatch = queryText.match(carbonRegex);
  if (carbonMatch) {
    carbonCap = parseFloat(carbonMatch[1]);
  }

  // 4. Detect Objective Weight Biases
  let weights = { cost: 0.33, time: 0.33, carbon: 0.34 };

  if (/low[-\s]?carbon|green|eco|clean|emission/i.test(text)) {
    weights = { cost: 0.20, time: 0.20, carbon: 0.60 };
  } else if (/cheap|budget|low[-\s]?cost|inexpensive|save money/i.test(text)) {
    weights = { cost: 0.60, time: 0.20, carbon: 0.20 };
  } else if (/fast|quick|short|save time|speed/i.test(text)) {
    weights = { cost: 0.20, time: 0.60, carbon: 0.20 };
  }

  // 5. Match Real POIs from database for this city
  const cityPois = db.prepare("SELECT poi_id, name, poi_category, tags FROM activities_poi WHERE city_id = ? AND status = 'active'").all(matchedCity.city_id);

  const matchedPoiIds = [];
  for (const poi of cityPois) {
    const poiNameLower = poi.name.toLowerCase();
    // Check if POI name or significant part is mentioned
    const nameWords = poiNameLower.split(/\s+/).filter(w => w.length > 3 && !['road', 'street', 'gate', 'tour'].includes(w));
    
    let matched = false;
    if (text.includes(poiNameLower)) {
      matched = true;
    } else {
      for (const w of nameWords) {
        if (text.includes(w)) {
          matched = true;
          break;
        }
      }
    }

    if (matched && !matchedPoiIds.includes(poi.poi_id)) {
      matchedPoiIds.push(poi.poi_id);
    }
  }

  // If no specific POIs matched by name, check category keywords (palace, park, temple, museum)
  if (matchedPoiIds.length === 0) {
    const categories = ['palace', 'park', 'temple', 'museum', 'bazaar', 'market', 'lake', 'fort', 'garden'];
    for (const cat of categories) {
      if (text.includes(cat)) {
        const found = cityPois.find(p => p.name.toLowerCase().includes(cat) || (p.poi_category && p.poi_category.toLowerCase().includes(cat)));
        if (found && !matchedPoiIds.includes(found.poi_id)) {
          matchedPoiIds.push(found.poi_id);
        }
      }
    }
  }

  return {
    success: true,
    parsed: {
      city_id: matchedCity.city_id,
      city_name: matchedCity.name,
      day_start: '09:00',
      day_end: '18:00',
      budget_cap: budgetCap || '2000',
      carbon_cap_kg: carbonCap || 8,
      weights,
      must_see_poi_ids: matchedPoiIds.slice(0, 4)
    }
  };
}

module.exports = {
  parseIntent
};
