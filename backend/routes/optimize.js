const express = require('express');

const router = express.Router();

const {
  optimizeItinerary
} = require('../optimizer/optimizer');

const {
  diagnoseInfeasibility
} = require('../optimizer/infeasibility');

const {
  findSingleConstraintRelaxation
} = require('../optimizer/relaxation');

const {
  generateExplanation
} = require('../ai/explainer');


// ============================================================
// POST /api/optimize
// ============================================================

router.post('/', async (req, res) => {
  try {

    // ----------------------------------------------------------
    // Accept BOTH organizer field names and frontend field names
    // ----------------------------------------------------------

    const {
      city_id,

      day_start,
      day_end,

      day_start_time,
      day_end_time,

      budget_cap,
      carbon_cap_kg,

      must_see_poi_ids = [],
      candidate_poi_ids = null,

      start_poi_id = null,
      end_poi_id = null,

      allowed_modes = null,

      weights = {
        cost: 0.33,
        time: 0.33,
        carbon: 0.34
      },

      max_activities = 6,

      // Used internally by relaxation engine.
      opening_hours_overrides = {}

    } = req.body;


    // ----------------------------------------------------------
    // Required city
    // ----------------------------------------------------------

    if (!city_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'city_id is required.'
        }
      });
    }


    // ----------------------------------------------------------
    // Normalize time fields
    //
    // Organizer:
    // day_start_time / day_end_time
    //
    // Internal optimizer:
    // day_start / day_end
    // ----------------------------------------------------------

    const normalizedDayStart =
      day_start ??
      day_start_time ??
      '09:00';

    const normalizedDayEnd =
      day_end ??
      day_end_time ??
      '18:00';


    // ----------------------------------------------------------
    // Normalize arrays
    // ----------------------------------------------------------

    const normalizeArray = (value) => {

      if (Array.isArray(value)) {
        return value;
      }

      if (
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        return value
          .split(',')
          .map(x => x.trim())
          .filter(Boolean);
      }

      return [];
    };


    const normalizedMustSee =
      normalizeArray(must_see_poi_ids);

    const normalizedCandidates =
      candidate_poi_ids === null ||
        candidate_poi_ids === undefined
        ? null
        : normalizeArray(candidate_poi_ids);


    const normalizedModes =
      allowed_modes === null ||
        allowed_modes === undefined
        ? null
        : normalizeArray(allowed_modes);


    // ----------------------------------------------------------
    // Build optimizer options
    // ----------------------------------------------------------

    const options = {

      city_id,

      day_start:
        normalizedDayStart,

      day_end:
        normalizedDayEnd,

      budget_cap,

      carbon_cap_kg,

      must_see_poi_ids:
        normalizedMustSee,

      candidate_poi_ids:
        normalizedCandidates,

      start_poi_id,

      end_poi_id,

      allowed_modes:
        normalizedModes,

      weights,

      max_activities,

      // IMPORTANT:
      // Used only during a hypothetical relaxation run.
      opening_hours_overrides
    };


    // ==========================================================
    // RUN NORMAL OPTIMIZATION
    // ==========================================================

    const result =
      await optimizeItinerary(options);


    // ==========================================================
    // FEASIBLE
    // ==========================================================

    if (result.feasible) {

      const explanation =
        generateExplanation(
          result,
          weights
        );

      return res.json({

        success: true,

        feasible: true,

        summary:
          result.summary,

        stops:
          result.stops,

        transfers:
          result.transfers,

        weights:
          result.weights,

        normalized_metrics:
          result.normalized_metrics,

        score:
          result.score,

        candidates_count:
          result.candidates_count,

        explanation

      });
    }


    // ==========================================================
    // INFEASIBLE
    // ==========================================================

    const diagnosis =
      diagnoseInfeasibility(
        options,
        result.evaluated_attempts || []
      );

    if (
      diagnosis.binding_constraint &&
      diagnosis.binding_constraint.type === 'OPENING_HOURS' &&
      !diagnosis.binding_constraint.poi_id
    ) {
      const openingViolation =
        (diagnosis.violations || []).find(
          violation =>
            violation.type === 'OPENING_HOURS' &&
            violation.poi_id
        );

      if (openingViolation) {
        diagnosis.binding_constraint.poi_id =
          openingViolation.poi_id;
      }
    }

    // ==========================================================
    // EXACTLY-ONE-CONSTRAINT RELAXATION
    // ==========================================================

    const relaxation =
      await findSingleConstraintRelaxation(
        options,
        diagnosis.binding_constraint,
        optimizeItinerary
      );


    // ==========================================================
    // BUILD RELAXED PLAN RESPONSE
    // ==========================================================

    let relaxedPlanData = null;


    if (
      relaxation &&
      relaxation.plan &&
      relaxation.plan.feasible
    ) {

      relaxedPlanData = {

        constraint_type:
          relaxation.constraint_type,

        constraint_name:
          relaxation.name,

        action:
          relaxation.action,

        poi_id:
          relaxation.poi_id,

        poi_name:
          relaxation.poi_name,

        original_value:
          relaxation.original_value,

        relaxed_value:
          relaxation.relaxed_value,

        difference:
          relaxation.difference_text,

        description:
          relaxation.description,

        summary:
          relaxation.plan.summary,

        stops:
          relaxation.plan.stops,

        transfers:
          relaxation.plan.transfers

      };
    }


    // ==========================================================
    // FINAL INFEASIBLE RESPONSE
    // ==========================================================

    return res.json({

      success: true,

      // IMPORTANT:
      // Original problem remains infeasible.
      feasible: false,

      binding_constraint:
        diagnosis.binding_constraint,

      explanation:
        diagnosis.explanation,

      violations:
        diagnosis.violations,

      relaxation:
        relaxedPlanData
          ? {
            constraint:
              relaxedPlanData.constraint_name,

            action:
              relaxedPlanData.action,

            poi_name:
              relaxedPlanData.poi_name,

            original:
              relaxedPlanData.original_value,

            relaxed:
              relaxedPlanData.relaxed_value,

            difference:
              relaxedPlanData.difference,

            description:
              relaxedPlanData.description
          }
          : null,

      relaxed_plan:
        relaxedPlanData

    });

  } catch (error) {

    console.error(
      'Error optimizing itinerary:',
      error
    );

    return res.status(500).json({

      success: false,

      error: {

        code:
          'OPTIMIZER_ERROR',

        message:
          error.message

      }

    });
  }
});


module.exports = router;