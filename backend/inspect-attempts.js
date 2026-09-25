require('dotenv').config();

const { optimizeItinerary } = require('./optimizer/optimizer');

async function main() {

  const options = {
    city_id: "cty_34bbfdfe",
    day_start: "08:00",
    day_end: "20:00",

    start_poi_id: "poi_f0480ca4",
    end_poi_id: "poi_a34a401d",

    candidate_poi_ids: [
      "poi_f0480ca4",
      "poi_e0c06ade",
      "poi_fb2bcabe",
      "poi_d668af53",
      "poi_7266e8b1",
      "poi_5b490311",
      "poi_c860207e",
      "poi_48807df0",
      "poi_a666cab4",
      "poi_a34a401d"
    ],

    must_see_poi_ids: [
      "poi_7266e8b1",
      "poi_5b490311"
    ],

    budget_cap: "1749.44",
    carbon_cap_kg: 16.456,

    allowed_modes: [
      "walk",
      "cab"
    ],

    weights: {
      cost: 0.34,
      time: 0.33,
      carbon: 0.33
    },

    max_activities: 6
  };

  const result =
    await optimizeItinerary(options);

  console.log(
    JSON.stringify(
      {
        feasible: result.feasible,
        evaluated_attempts: result.evaluated_attempts
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
