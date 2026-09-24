import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getCities, getPois, optimizeItinerary } from '../services/api';
import PlannerForm from '../components/PlannerForm';
import WeightSliders from '../components/WeightSliders';
import MetricsCard from '../components/MetricsCard';
import ItineraryTimeline from '../components/ItineraryTimeline';
import InfeasibilityCard from '../components/InfeasibilityCard';
import RelaxedPlan from '../components/RelaxedPlan';
import TradeoffView from '../components/TradeoffView';
import {
  Sparkles,
  Globe,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Compass,
  ArrowRight,
  Sliders,
  ShieldCheck,
  Layers
} from 'lucide-react';
import '../styles/Planner.css';

export default function Planner() {
  const [language, setLanguage] = useState('en');
  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState('');
  const [pois, setPois] = useState([]);

  const location = useLocation();
  const resultsRef = useRef(null);

  // Constraints
  const [dayDate, setDayDate] = useState('2026-09-25');
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('18:00');
  const [budgetCap, setBudgetCap] = useState('2500');
  const [carbonCap, setCarbonCap] = useState('10');
  const [mustSeePoiIds, setMustSeePoiIds] = useState([]);

  // Objective weights (always sum to 1.00)
  const [weights, setWeights] = useState({
    cost: 0.30,
    time: 0.30,
    carbon: 0.40
  });

  // Optimizer Result & State
  const [result, setResult] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepText, setLoadingStepText] = useState('Optimizing your route...');
  const [error, setError] = useState('');
  const [showingRelaxedPlan, setShowingRelaxedPlan] = useState(false);
  const [aiNarrative, setAiNarrative] = useState('');
  const [aiStatus, setAiStatus] = useState(null);

  // Debounce ref for slider adjustments
  const debounceTimerRef = useRef(null);

  // 1. Load cities on mount, checking URL query params for preselected city
  useEffect(() => {
    async function initCities() {
      try {
        const data = await getCities();
        if (data && data.cities && data.cities.length > 0) {
          setCities(data.cities);

          // Check query params: ?city=...
          const searchParams = new URLSearchParams(location.search);
          const cityQuery = searchParams.get('city');

          let initialCity = null;
          if (cityQuery) {
            initialCity = data.cities.find(
              c => c.city_id === cityQuery || c.name.toLowerCase() === cityQuery.toLowerCase()
            );
          }

          if (!initialCity) {
            // Default to Bengaluru (cty_17b8ef2f) or first city
            initialCity = data.cities.find(c => c.name.toLowerCase().includes('bengaluru')) || data.cities[0];
          }

          setSelectedCityId(initialCity.city_id);
        }
      } catch (err) {
        console.error('Failed to load cities:', err);
        setError('Unable to connect to ReRoute backend server on port 5000. Please verify the backend is running.');
      }
    }
    initCities();
  }, [location.search]);

  // 2. Load POIs when selected city changes
  useEffect(() => {
    if (!selectedCityId) return;

    async function loadCityPois() {
      try {
        const data = await getPois(selectedCityId);
        if (data && data.pois) {
          setPois(data.pois);
          // Pick top 2 attractions as default must-sees
          const defaults = data.pois.slice(0, 2).map(p => p.poi_id);
          setMustSeePoiIds(defaults);
        }
      } catch (err) {
        console.error('Failed to load POIs:', err);
        setError('Failed to fetch attractions for selected city.');
      }
    }
    loadCityPois();
  }, [selectedCityId]);

  // 3. Execute Optimizer
  const runOptimization = async (overrideParams = {}) => {
    if (!selectedCityId) return;

    const payload = {
      city_id: overrideParams.city_id || selectedCityId,
      day_start: overrideParams.day_start || dayStart,
      day_end: overrideParams.day_end || dayEnd,
      budget_cap: overrideParams.budget_cap !== undefined ? overrideParams.budget_cap : budgetCap,
      carbon_cap_kg: overrideParams.carbon_cap_kg !== undefined ? overrideParams.carbon_cap_kg : (carbonCap ? parseFloat(carbonCap) : null),
      must_see_poi_ids: overrideParams.must_see_poi_ids || mustSeePoiIds,
      weights: overrideParams.weights || weights
    };

    setIsLoading(true);
    setLoadingStepText('Reading your preferences...');
    setError('');

    const stepTimer1 = setTimeout(() => {
      setLoadingStepText('Checking constraints & travel matrix...');
    }, 200);

    const stepTimer2 = setTimeout(() => {
      setLoadingStepText('Optimizing your route across cost, time and carbon...');
    }, 450);

    try {
      const data = await optimizeItinerary(payload);

      if (data.feasible && result && result.feasible) {
        setPreviousSummary(result.summary);
      }

      setResult(data);
      if (data.explanation) {
        setAiNarrative(data.explanation);
      }
      setShowingRelaxedPlan(false);

      // Smooth scroll to results on manual optimization
      if (overrideParams.shouldScroll !== false && resultsRef.current) {
        setTimeout(() => {
          resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch (err) {
      console.error('Optimization error:', err);
      setError(err.message || 'Optimization request failed. Please check inputs.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLoading(false);
    }
  };

  // 4. Initial optimization once POIs are loaded
  useEffect(() => {
    if (selectedCityId && mustSeePoiIds.length > 0 && !result) {
      runOptimization({ shouldScroll: false });
    }
  }, [selectedCityId, mustSeePoiIds]);

  // 5. Handle AI Plan My Day response
  const handleAiPlanComplete = (aiData) => {
    if (!aiData) return;

    if (aiData.ai_status) {
      setAiStatus(aiData.ai_status);
    }
    if (aiData.narrative) {
      setAiNarrative(aiData.narrative);
    }

    if (aiData.plan) {
      if (result && result.feasible && aiData.plan.feasible) {
        setPreviousSummary(result.summary);
      }
      setResult(aiData.plan);
    } else {
      setResult(aiData);
    }

    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 6. Slider change handler with automatic debounce
  const handleWeightsChange = (newWeights) => {
    setWeights(newWeights);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      runOptimization({ weights: newWeights, shouldScroll: false });
    }, 400);
  };

  // 7. Apply Relaxation (User selected single constraint)
  const handleApplyRelaxation = (chosenConstraintType) => {
    if (!result || !result.relaxed_plan) return;
    const rp = result.relaxed_plan;

    const overrides = { shouldScroll: true };

    if (chosenConstraintType === 'TIME' || (!chosenConstraintType && rp.constraint_type === 'TIME')) {
      const relaxedEnd = rp.relaxed_value;
      setDayEnd(relaxedEnd);
      overrides.day_end = relaxedEnd;
    } else if (chosenConstraintType === 'TIME_START' || (!chosenConstraintType && rp.constraint_type === 'TIME_START')) {
      const relaxedStart = rp.relaxed_value;
      setDayStart(relaxedStart);
      overrides.day_start = relaxedStart;
    } else if (chosenConstraintType === 'BUDGET' || (!chosenConstraintType && rp.constraint_type === 'BUDGET')) {
      const num = rp.relaxed_value.replace(/[^0-9.]/g, '');
      setBudgetCap(num);
      overrides.budget_cap = num;
    } else if (chosenConstraintType === 'CARBON' || (!chosenConstraintType && rp.constraint_type === 'CARBON')) {
      const num = rp.relaxed_value.replace(/[^0-9.]/g, '');
      setCarbonCap(num);
      overrides.carbon_cap_kg = parseFloat(num);
    }

    runOptimization(overrides);
  };

  const t = {
    en: {
      tag: 'MULTI-OBJECTIVE ITINERARY OPTIMIZER',
      title: 'Optimal Travel Routes Grounded in Reality',
      subtitle: 'Deterministic multi-objective routing balancing cost, time, and carbon with real SQLite data & opening hours.',
      resultHeading: 'YOUR OPTIMIZED DAY',
      feasibleBadge: 'Feasible Itinerary Verified ✓',
      infeasibleBadge: 'Hard Constraint Infeasibility Detected ⚠',
      resetBtn: 'Reset Controls'
    },
    hi: {
      tag: 'बहु-उद्देश्यीय यात्रा कार्यक्रम अनुकूलक',
      title: 'वास्तविकता पर आधारित सर्वोत्तम यात्रा मार्ग',
      subtitle: 'लागत, समय और कार्बन का सटीक गणितीय संतुलन, बिना किसी काल्पनिक डेटा के।',
      resultHeading: 'आपका अनुकूलित दिन',
      feasibleBadge: 'व्यावहारिक योजना सत्यापित ✓',
      infeasibleBadge: 'प्रतिबंध उल्लंघन पाया गया ⚠',
      resetBtn: 'रीसेट करें'
    }
  }[language];

  return (
    <div className="planner-page">
      {/* Top Bar with Language Toggle */}
      <div className="planner-topbar">
        <div className="brand-sub">
          <span className="live-pulse-dot" />
          <span>{t.tag}</span>
        </div>
        <div className="language-toggle">
          <Globe size={14} />
          <button
            type="button"
            className={`lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => setLanguage('en')}
          >
            English
          </button>
          <span className="lang-sep">|</span>
          <button
            type="button"
            className={`lang-btn ${language === 'hi' ? 'active' : ''}`}
            onClick={() => setLanguage('hi')}
          >
            हिंदी
          </button>
        </div>
      </div>

      {/* Hero Headline */}
      <div className="planner-hero">
        <h1 className="planner-headline">{t.title}</h1>
        <p className="planner-tagline">{t.subtitle}</p>
      </div>

      {error && (
        <div className="planner-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            className="error-retry-btn"
            onClick={() => runOptimization()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Three-Column Desktop Layout (Controls Left, Results Center, Trade-off / Insights Right) */}
      <div className="planner-layout-grid">
        {/* LEFT COLUMN: Controls & Sliders */}
        <aside className="planner-sidebar">
          <PlannerForm
            cities={cities}
            selectedCityId={selectedCityId}
            onCityChange={(cId) => setSelectedCityId(cId)}
            pois={pois}
            dayDate={dayDate}
            setDayDate={setDayDate}
            dayStart={dayStart}
            setDayStart={setDayStart}
            dayEnd={dayEnd}
            setDayEnd={setDayEnd}
            budgetCap={budgetCap}
            setBudgetCap={setBudgetCap}
            carbonCap={carbonCap}
            setCarbonCap={setCarbonCap}
            mustSeePoiIds={mustSeePoiIds}
            setMustSeePoiIds={setMustSeePoiIds}
            onOptimize={() => runOptimization({ shouldScroll: true })}
            isLoading={isLoading}
            onAiPlanComplete={handleAiPlanComplete}
            language={language}
          />

          <WeightSliders
            weights={weights}
            onChange={handleWeightsChange}
            disabled={isLoading}
            language={language}
          />
        </aside>

        {/* CENTER COLUMN: Itinerary & Metrics */}
        <section className="planner-content" ref={resultsRef}>
          <div className="results-header-row">
            <div className="results-title-group">
              <h3 className="results-heading">{t.resultHeading}</h3>
              {result && (
                <span className="results-city-crumb">
                  {cities.find(c => c.city_id === selectedCityId)?.name || 'Destination'} • {dayDate}
                </span>
              )}
            </div>

            {result && (
              <span className={`status-pill ${result.feasible ? 'feasible' : 'infeasible'}`}>
                {result.feasible ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>{t.feasibleBadge}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span>{t.infeasibleBadge}</span>
                  </>
                )}
              </span>
            )}
          </div>

          {isLoading && (
            <div className="optimizing-overlay">
              <RefreshCw size={28} className="spin accent-spin" />
              <h4>{loadingStepText}</h4>
              <p>Evaluating travel times, opening hours, cost and carbon footprint deterministically...</p>
            </div>
          )}

          {/* Feasible Result View */}
          {result && result.feasible && (
            <div className="feasible-results-block">
              {/* AI Narrative or Grounded Explainer */}
              {aiNarrative && (
                <div className="ai-explanation-card">
                  <div className="explanation-icon-title">
                    <Sparkles size={16} className="sparkle-accent" />
                    <span className="explanation-label">
                      {aiStatus?.fallback ? 'Smart Grounded Explanation' : 'AI Concierge Insight'}
                    </span>
                  </div>
                  <p className="explanation-body">{aiNarrative}</p>
                  {aiStatus?.message && (
                    <div className="ai-provider-tag">
                      <span>{aiStatus.message}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Three Large Top Metrics (Cost, Time, Carbon, Stops) */}
              <MetricsCard
                summary={result.summary}
                budgetCap={budgetCap}
                carbonCap={carbonCap}
                language={language}
              />

              {/* Chronological Vertical Journey Timeline */}
              <div className="timeline-section-card">
                <div className="card-header">
                  <h4 className="section-title">CHRONOLOGICAL DAY SCHEDULE</h4>
                  <p className="section-subtitle">
                    {result.summary?.day_start} to {result.summary?.day_end} • {result.stops?.length || 0} Attractions • {result.transfers?.length || 0} Low-Carbon Transfers
                  </p>
                </div>

                <ItineraryTimeline
                  stops={result.stops}
                  transfers={result.transfers}
                  language={language}
                />
              </div>
            </div>
          )}

          {/* Infeasible Result View */}
          {result && !result.feasible && (
            <div className="infeasible-results-block">
              <InfeasibilityCard
                bindingConstraint={result.binding_constraint}
                explanation={result.explanation}
                relaxation={result.relaxation}
                onApplyRelaxation={handleApplyRelaxation}
                onViewRelaxedPlan={() => setShowingRelaxedPlan(!showingRelaxedPlan)}
                showingRelaxedPlan={showingRelaxedPlan}
                language={language}
              />

              {showingRelaxedPlan && result.relaxed_plan && (
                <RelaxedPlan
                  relaxedPlan={result.relaxed_plan}
                  onApply={() => handleApplyRelaxation()}
                  language={language}
                />
              )}
            </div>
          )}

          {/* Empty initial state if no result yet */}
          {!result && !isLoading && (
            <div className="planner-initial-empty-state">
              <Compass size={40} className="empty-icon" />
              <h3>Ready to craft your day</h3>
              <p>Select your attractions and priorities on the left, or type a request in the AI box.</p>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Optimization Insights & Trade-off Analysis */}
        <aside className="planner-insights-col">
          {result && result.feasible && (
            <TradeoffView
              weights={weights}
              normalizedMetrics={result.normalized_metrics}
              summary={result.summary}
              previousSummary={previousSummary}
              language={language}
            />
          )}

          {/* Quick Solver Stats Card */}
          {result && result.feasible && (
            <div className="solver-meta-card">
              <div className="meta-card-header">
                <ShieldCheck size={16} />
                <span>CONSTRAINT VERIFICATION</span>
              </div>
              <ul className="meta-checks-list">
                <li>
                  <CheckCircle2 size={13} className="check-green" />
                  <span>Time window: {result.summary?.day_start}–{result.summary?.day_end} satisfied</span>
                </li>
                <li>
                  <CheckCircle2 size={13} className="check-green" />
                  <span>Opening hours strictly verified for all {result.stops?.length || 0} stops</span>
                </li>
                <li>
                  <CheckCircle2 size={13} className="check-green" />
                  <span>Budget limit: ₹{result.summary?.cost} / ₹{budgetCap || '∞'}</span>
                </li>
                <li>
                  <CheckCircle2 size={13} className="check-green" />
                  <span>Emissions limit: {result.summary?.carbon_kg} kg / {carbonCap || '∞'} kg</span>
                </li>
                <li>
                  <CheckCircle2 size={13} className="check-green" />
                  <span>All {mustSeePoiIds.length} mandatory must-see POIs scheduled</span>
                </li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
