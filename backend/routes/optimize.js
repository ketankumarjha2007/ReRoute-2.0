const express = require('express');
const router = express.Router();
const { optimizeItinerary } = require('../optimizer/optimizer');
const { diagnoseInfeasibility } = require('../optimizer/infeasibility');
const { findSingleConstraintRelaxation } = require('../optimizer/relaxation');
const { generateExplanation } = require('../ai/explainer');

// POST /api/optimize
router.post('/', (req, res) => {
  try {
    const {
      city_id,
      day_start = '09:00',
      day_end = '18:00',
      budget_cap,
      carbon_cap_kg,
      must_see_poi_ids = [],
      candidate_poi_ids = null,
      start_poi_id = null,
      end_poi_id = null,
      allowed_modes = null,
      weights = { cost: 0.33, time: 0.33, carbon: 0.34 },
      max_activities = 6
    } = req.body;

    if (!city_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'city_id is required.' }
      });
    }

    const options = {
      city_id,
      day_start,
      day_end,
      budget_cap,
      carbon_cap_kg,
      must_see_poi_ids,
      candidate_poi_ids,
      start_poi_id,
      end_poi_id,
      allowed_modes,
      weights,
      max_activities
    };

    const result = optimizeItinerary(options);

    if (result.feasible) {
      const explanation = generateExplanation(result, weights);

      return res.json({
        success: true,
        feasible: true,
        summary: result.summary,
        stops: result.stops,
        transfers: result.transfers,
        weights: result.weights,
        normalized_metrics: result.normalized_metrics,
        score: result.score,
        explanation
      });
    }

    // Problem is infeasible -> run critical infeasibility diagnostics
    const diagnosis = diagnoseInfeasibility(options, result.evaluated_attempts || []);

    // Run Exactly-One-Constraint Relaxation engine
    const relaxation = findSingleConstraintRelaxation(options, diagnosis.binding_constraint, optimizeItinerary);

    let relaxedPlanData = null;
    if (relaxation && relaxation.plan && relaxation.plan.feasible) {
      relaxedPlanData = {
        constraint_type: relaxation.constraint_type,
        constraint_name: relaxation.name,
        original_value: relaxation.original_value,
        relaxed_value: relaxation.relaxed_value,
        difference: relaxation.difference_text,
        description: relaxation.description,
        summary: relaxation.plan.summary,
        stops: relaxation.plan.stops,
        transfers: relaxation.plan.transfers
      };
    }

    return res.json({
      success: true,
      feasible: false,
      binding_constraint: diagnosis.binding_constraint,
      explanation: diagnosis.explanation,
      violations: diagnosis.violations,
      relaxation: relaxedPlanData ? {
        constraint: relaxedPlanData.constraint_name,
        original: relaxedPlanData.original_value,
        relaxed: relaxedPlanData.relaxed_value,
        description: relaxedPlanData.description
      } : null,
      relaxed_plan: relaxedPlanData
    });

  } catch (error) {
    console.error('Error optimizing itinerary:', error);
    res.status(500).json({
      success: false,
      error: { code: 'OPTIMIZER_ERROR', message: error.message }
    });
  }
});

module.exports = router;
