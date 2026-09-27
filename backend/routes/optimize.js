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
  verifyItinerary
} = require('../optimizer/verification');

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

      day_date,
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

      // Used internally by the relaxation engine.
      opening_hours_overrides = {}

    } = req.body;


    // ==========================================================
    // REQUIRED CITY
    // ==========================================================

    if (!city_id) {

      return res.status(400).json({

        success: false,

        error: {

          code: 'INVALID_INPUT',

          message:
            'city_id is required.'

        }

      });
    }

    // ==========================================================
    // VALIDATE PLANNING DATE
    // ==========================================================

    if (!day_date) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'day_date is required.'
        }
      });
    }

    const today = new Date();

    const todayDate =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (day_date < todayDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Planning date cannot be in the past.'
        }
      });
    }

    // ==========================================================
    // NORMALIZE TIME FIELDS
    // ==========================================================

    const normalizedDayStart =
      day_start ??
      day_start_time ??
      '09:00';


    const normalizedDayEnd =
      day_end ??
      day_end_time ??
      '18:00';


    // ==========================================================
    // NORMALIZE ARRAYS
    // ==========================================================

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
          .map(
            item => item.trim()
          )
          .filter(Boolean);
      }


      return [];
    };


    const normalizedMustSee =
      normalizeArray(
        must_see_poi_ids
      );


    const normalizedCandidates =
      candidate_poi_ids === null ||
        candidate_poi_ids === undefined

        ? null

        : normalizeArray(
          candidate_poi_ids
        );


    const normalizedModes =
      allowed_modes === null ||
        allowed_modes === undefined

        ? null

        : normalizeArray(
          allowed_modes
        );


    // ==========================================================
    // BUILD OPTIMIZER OPTIONS
    // ==========================================================

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

      opening_hours_overrides

    };


    // ==========================================================
    // RUN DETERMINISTIC OPTIMIZATION
    // ==========================================================

    const result =
      await optimizeItinerary(
        options
      );


    // ==========================================================
    // FEASIBLE RESULT
    // ==========================================================

    if (result.feasible) {


      // --------------------------------------------------------
      // INDEPENDENT MATHEMATICAL VERIFICATION
      // --------------------------------------------------------
      //
      // IMPORTANT:
      //
      // This does NOT use Groq.
      //
      // The verifier independently reads the source data and
      // recalculates:
      //
      // - POI cost
      // - travel cost
      // - activity time
      // - travel time
      // - waiting time
      // - POI carbon
      // - travel carbon
      // - total cost
      // - total time
      // - total carbon
      // - hard constraints
      //
      // --------------------------------------------------------

      const verification =
        await verifyItinerary(

          result,

          {

            day_start:
              normalizedDayStart,

            day_end:
              normalizedDayEnd,

            budget_cap,

            carbon_cap_kg,

            must_see_poi_ids:
              normalizedMustSee,

            start_poi_id,

            end_poi_id,

            allowed_modes:
              normalizedModes

          }

        );


      // --------------------------------------------------------
      // Generate normal deterministic explanation.
      //
      // This explanation is NOT responsible for deciding
      // mathematical correctness.
      // --------------------------------------------------------

      const explanation =
        generateExplanation(
          result,
          weights
        );


      // ========================================================
      // VERIFIED FEASIBLE RESPONSE
      // ========================================================

      return res.json({

        success: true,

        feasible: true,


        // ------------------------------------------------------
        // Mathematical verification
        // ------------------------------------------------------

        verification: {

          verified:
            verification.verified,

          checks:
            verification.checks,

          errors:
            verification.errors,

          warnings:
            verification.warnings,

          recomputed:
            verification.recomputed,

          source:
            verification.source,

          verifier_version:
            verification.verifier_version

        },


        // ------------------------------------------------------
        // Original optimizer result
        // ------------------------------------------------------

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
    // INFEASIBLE RESULT
    // ==========================================================

    const diagnosis =
      diagnoseInfeasibility(

        options,

        result.evaluated_attempts || []

      );


    // ==========================================================
    // OPENING-HOURS POI ID SAFETY FIX
    // ==========================================================
    //
    // If the binding constraint is opening hours but the
    // diagnostic did not preserve the POI ID, recover it from
    // the actual violation.
    //
    // ==========================================================

    if (

      diagnosis.binding_constraint &&

      diagnosis.binding_constraint.type ===
      'OPENING_HOURS' &&

      !diagnosis.binding_constraint.poi_id

    ) {

      const openingViolation =
        (
          diagnosis.violations || []
        ).find(

          violation =>

            violation.type ===
            'OPENING_HOURS' &&

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
    //
    // The relaxation engine receives the deterministic binding
    // constraint and tries changing exactly one constraint.
    //
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

    let relaxedPlanData =
      null;


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
      // The ORIGINAL problem is still infeasible.
      //
      // The relaxed plan is only a counterfactual alternative.

      feasible: false,


      // --------------------------------------------------------
      // Deterministic binding constraint
      // --------------------------------------------------------

      binding_constraint:
        diagnosis.binding_constraint,


      // --------------------------------------------------------
      // Deterministic explanation
      // --------------------------------------------------------

      explanation:
        diagnosis.explanation,


      // --------------------------------------------------------
      // All detected violations
      // --------------------------------------------------------

      violations:
        diagnosis.violations,


      // --------------------------------------------------------
      // Single-constraint relaxation summary
      // --------------------------------------------------------

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


      // --------------------------------------------------------
      // Full relaxed plan
      // --------------------------------------------------------

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