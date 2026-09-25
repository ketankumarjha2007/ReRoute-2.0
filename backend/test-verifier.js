require('dotenv').config();
const {
  optimizeItinerary
} = require('./optimizer/optimizer');

const {
  verifyItinerary
} = require('./optimizer/verification');


async function main() {

  console.log('\n========================================');
  console.log(' ReRoute Verifier Tamper Test');
  console.log('========================================\n');


  // ----------------------------------------------------------
  // Generate a known feasible itinerary
  // ----------------------------------------------------------

  const options = {

    city_id:
      'cty_34bbfdfe',

    day_start:
      '08:00',

    day_end:
      '20:00',

    start_poi_id:
      'poi_f0480ca4',

    end_poi_id:
      'poi_a34a401d',

    candidate_poi_ids: [
      'poi_f0480ca4',
      'poi_e0c06ade',
      'poi_fb2bcabe',
      'poi_d668af53',
      'poi_7266e8b1',
      'poi_5b490311',
      'poi_c860207e',
      'poi_48807df0',
      'poi_a666cab4',
      'poi_a34a401d'
    ],

    must_see_poi_ids: [],

    budget_cap:
      '10000.00',

    carbon_cap_kg:
      100,

    allowed_modes: [
      'walk',
      'cab'
    ],

    weights: {
      cost: 0.34,
      time: 0.33,
      carbon: 0.33
    },

    max_activities:
      4
  };


  const plan =
    await optimizeItinerary(
      options
    );


  if (!plan.feasible) {

    console.log(
      '❌ Optimizer did not produce a feasible plan.'
    );

    process.exit(1);
  }


  console.log('Original optimizer result:');

  console.log(
    'Cost:',
    plan.summary.cost
  );

  console.log(
    'Time:',
    plan.summary.minutes,
    'minutes'
  );

  console.log(
    'Carbon:',
    plan.summary.carbon_kg,
    'kg'
  );


  // ----------------------------------------------------------
  // FIRST VERIFICATION
  // ----------------------------------------------------------

  const originalVerification =
    await verifyItinerary(

      plan,

      {

        day_start:
          '08:00',

        day_end:
          '20:00',

        budget_cap:
          '10000.00',

        carbon_cap_kg:
          100,

        must_see_poi_ids: [],

        start_poi_id:
          'poi_f0480ca4',

        end_poi_id:
          'poi_a34a401d',

        allowed_modes: [
          'walk',
          'cab'
        ]

      }

    );


  console.log(
    '\nOriginal verification:'
  );

  console.log(
    JSON.stringify(
      originalVerification,
      null,
      2
    )
  );


  // ----------------------------------------------------------
  // TAMPER WITH THE RESULT
  // ----------------------------------------------------------
  //
  // Pretend some component incorrectly changed the displayed
  // cost from the real value to ₹1.00.
  //
  // ----------------------------------------------------------

  const tamperedPlan =
    JSON.parse(
      JSON.stringify(plan)
    );


  tamperedPlan.summary.cost =
    '1.00';


  console.log(
    '\n========================================'
  );

  console.log(
    ' TAMPERED RESULT'
  );

  console.log(
    '========================================\n'
  );

  console.log(
    'Fake displayed cost:',
    tamperedPlan.summary.cost
  );

  console.log(
    'Actual database-derived cost:',
    plan.summary.cost
  );


  // ----------------------------------------------------------
  // VERIFY TAMPERED RESULT
  // ----------------------------------------------------------

  const tamperedVerification =
    await verifyItinerary(

      tamperedPlan,

      {

        day_start:
          '08:00',

        day_end:
          '20:00',

        budget_cap:
          '10000.00',

        carbon_cap_kg:
          100,

        must_see_poi_ids: [],

        start_poi_id:
          'poi_f0480ca4',

        end_poi_id:
          'poi_a34a401d',

        allowed_modes: [
          'walk',
          'cab'
        ]

      }

    );


  console.log(
    '\nTampered verification:'
  );

  console.log(
    JSON.stringify(
      tamperedVerification,
      null,
      2
    )
  );


  // ----------------------------------------------------------
  // FINAL TEST RESULT
  // ----------------------------------------------------------

  console.log(
    '\n========================================'
  );


  if (

    originalVerification.verified === true &&

    tamperedVerification.verified === false

  ) {

    console.log(
      '✅ VERIFIER TEST PASSED'
    );

    console.log(
      'The verifier accepted the correct plan'
    );

    console.log(
      'and rejected the tampered plan.'
    );

  } else {

    console.log(
      '❌ VERIFIER TEST FAILED'
    );

  }


  console.log(
    '========================================\n'
  );
}


main().catch(
  error => {

    console.error(
      '\n❌ Test failed:'
    );

    console.error(
      error
    );

    process.exit(1);
  }
);