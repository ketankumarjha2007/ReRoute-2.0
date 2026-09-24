/**
 * Grounded AI Explainer
 * Generates plain-language, mathematically faithful explanations for optimization outcomes.
 */

function generateExplanation(planResult, weights) {
  if (!planResult) return '';

  if (!planResult.feasible) {
    if (planResult.explanation) return planResult.explanation;
    return 'The requested combination of attractions cannot be scheduled within your given time, budget, or carbon constraints.';
  }

  const { summary, stops, transfers } = planResult;
  const w = weights || { cost: 0.33, time: 0.33, carbon: 0.34 };

  const sentences = [];

  // Determine dominant priority
  const maxWeightKey = Object.keys(w).reduce((a, b) => w[a] > w[b] ? a : b);
  const maxWeightVal = Math.round(w[maxWeightKey] * 100);

  if (maxWeightKey === 'carbon' && maxWeightVal >= 40) {
    sentences.push(
      `Carbon emissions were prioritized (${maxWeightVal}% weight), leading the optimizer to schedule eco-friendly transfers that keep total carbon footprint down to ${summary.carbon_kg} kg CO₂.`
    );
  } else if (maxWeightKey === 'cost' && maxWeightVal >= 40) {
    sentences.push(
      `Cost was prioritized (${maxWeightVal}% weight), yielding an economical route costing ₹${summary.cost} across all ${summary.stops_count} attractions and transit.`
    );
  } else if (maxWeightKey === 'time' && maxWeightVal >= 40) {
    sentences.push(
      `Time efficiency was prioritized (${maxWeightVal}% weight), minimizing dead time and transit to fit ${summary.stops_count} attractions into ${summary.minutes} minutes (${summary.activity_minutes} min activities, ${summary.travel_minutes} min transit).`
    );
  } else {
    sentences.push(
      `The optimizer found a balanced Pareto compromise across cost (₹${summary.cost}), time (${summary.minutes} mins), and emissions (${summary.carbon_kg} kg CO₂).`
    );
  }

  // Mention modes
  if (transfers && transfers.length > 0) {
    const modes = Array.from(new Set(transfers.map(t => t.mode)));
    sentences.push(`Transit utilizes ${modes.join(' and ')} connections to eliminate impossible gaps.`);
  }

  return sentences.join(' ');
}

module.exports = {
  generateExplanation
};
