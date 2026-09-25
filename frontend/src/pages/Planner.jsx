import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import MapView from "../components/MapView";
import "../styles/MapView.css";

import {
  getCities,
  getPois,
  optimizeItinerary
} from "../services/api";

import PlannerForm from "../components/PlannerForm";
import WeightSliders from "../components/WeightSliders";
import MetricsCard from "../components/MetricsCard";
import ItineraryTimeline from "../components/ItineraryTimeline";
import InfeasibilityCard from "../components/InfeasibilityCard";
import RelaxedPlan from "../components/RelaxedPlan";
import TradeoffView from "../components/TradeoffView";

import {
  Sparkles,
  Globe,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Compass,
  ShieldCheck
} from "lucide-react";

import "../styles/Planner.css";

export default function Planner() {
  const location = useLocation();

  const resultsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // ============================================================
  // LANGUAGE
  // ============================================================

  const [language, setLanguage] = useState("en");

  // ============================================================
  // CITY + POI DATA
  // ============================================================

  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [pois, setPois] = useState([]);

  // ============================================================
  // MAP
  // ============================================================

  const [selectedMapPoi, setSelectedMapPoi] = useState(null);

  // ============================================================
  // PLANNER CONSTRAINTS
  // ============================================================

  const [dayDate, setDayDate] = useState("2026-09-25");

  const [dayStart, setDayStart] = useState("09:00");

  const [dayEnd, setDayEnd] = useState("18:00");

  const [budgetCap, setBudgetCap] = useState("2500");

  const [carbonCap, setCarbonCap] = useState("10");

  const [mustSeePoiIds, setMustSeePoiIds] = useState([]);

  // Hard route endpoints
  const [startPoiId, setStartPoiId] = useState("");

  const [endPoiId, setEndPoiId] = useState("");

  // APS-09 supports walk + cab
  const [allowedModes, setAllowedModes] = useState([
    "walk",
    "cab"
  ]);

  // ============================================================
  // OBJECTIVE WEIGHTS
  // ============================================================

  const [weights, setWeights] = useState({
    cost: 0.3,
    time: 0.3,
    carbon: 0.4
  });

  // ============================================================
  // RESULT STATE
  // ============================================================

  const [result, setResult] = useState(null);

  const [previousSummary, setPreviousSummary] = useState(null);

  const [isLoading, setIsLoading] = useState(false);

  const [loadingStepText, setLoadingStepText] = useState(
    "Optimizing your route..."
  );

  const [error, setError] = useState("");

  const [showingRelaxedPlan, setShowingRelaxedPlan] =
    useState(false);

  // ============================================================
  // AI
  // ============================================================

  const [aiNarrative, setAiNarrative] = useState("");

  const [aiStatus, setAiStatus] = useState(null);

  // ============================================================
  // TRANSLATIONS
  // ============================================================

  const translations = {
    en: {
      tag: "MULTI-OBJECTIVE ITINERARY OPTIMIZER",

      title:
        "Optimal Travel Routes Grounded in Reality",

      subtitle:
        "Deterministic multi-objective routing balancing cost, time, and carbon with real data & opening hours.",

      resultHeading: "YOUR OPTIMIZED DAY",

      feasibleBadge:
        "Feasible Itinerary Verified ✓",

      infeasibleBadge:
        "Hard Constraint Infeasibility Detected ⚠",

      resetBtn: "Reset Controls"
    },

    hi: {
      tag:
        "बहु-उद्देश्यीय यात्रा कार्यक्रम अनुकूलक",

      title:
        "वास्तविकता पर आधारित सर्वोत्तम यात्रा मार्ग",

      subtitle:
        "लागत, समय और कार्बन का सटीक गणितीय संतुलन, वास्तविक डेटा और समय सीमाओं के साथ।",

      resultHeading:
        "आपका अनुकूलित दिन",

      feasibleBadge:
        "व्यावहारिक योजना सत्यापित ✓",

      infeasibleBadge:
        "कठोर प्रतिबंध उल्लंघन पाया गया ⚠",

      resetBtn:
        "रीसेट करें"
    }
  };

  const t = translations[language];

  // ============================================================
  // LOAD CITIES
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadCities() {
      try {
        setError("");

        const data = await getCities();

        if (cancelled) return;

        if (
          data?.cities &&
          data.cities.length > 0
        ) {
          setCities(data.cities);

          const params = new URLSearchParams(
            location.search
          );

          const cityQuery = params.get("city");

          let initialCity = null;

          // URL city selection
          if (cityQuery) {
            initialCity = data.cities.find(
              (city) =>
                city.city_id === cityQuery ||
                city.name?.toLowerCase() ===
                  cityQuery.toLowerCase()
            );
          }

          // Default Bengaluru
          if (!initialCity) {
            initialCity =
              data.cities.find(
                (city) =>
                  city.name
                    ?.toLowerCase()
                    .includes("bengaluru")
              ) || data.cities[0];
          }

          setSelectedCityId(
            initialCity.city_id
          );
        }
      } catch (err) {
        console.error(
          "Failed to load cities:",
          err
        );

        setError(
          "Unable to connect to ReRoute backend server. Please verify the backend is running."
        );
      }
    }

    loadCities();

    return () => {
      cancelled = true;
    };
  }, [location.search]);

  // ============================================================
  // LOAD POIs WHEN CITY CHANGES
  // ============================================================

  useEffect(() => {
    if (!selectedCityId) return;

    let cancelled = false;

    async function loadPois() {
      try {
        setError("");

        const data = await getPois(
          selectedCityId
        );

        if (cancelled) return;

        if (data?.pois) {
          const cityPois = data.pois;

          setPois(cityPois);

          setSelectedMapPoi(null);

          // Do not automatically mark POIs as must-see.
          // Required POIs are selected explicitly by the user.
          setMustSeePoiIds([]);

          // Default start/end
          if (cityPois.length > 0) {
            setStartPoiId(
              cityPois[0].poi_id
            );

            setEndPoiId(
              cityPois[cityPois.length - 1]
                .poi_id
            );
          } else {
            setStartPoiId("");
            setEndPoiId("");
          }

          // Reset result because city changed
          setResult(null);
          setPreviousSummary(null);
          setAiNarrative("");
          setAiStatus(null);
        }
      } catch (err) {
        console.error(
          "Failed to load POIs:",
          err
        );

        setError(
          "Failed to fetch attractions for the selected city."
        );
      }
    }

    loadPois();

    return () => {
      cancelled = true;
    };
  }, [selectedCityId]);

  // ============================================================
  // SELECTED CITY
  // ============================================================

  const selectedCity = cities.find(
    (city) =>
      city.city_id === selectedCityId
  );

  // ============================================================
  // SELECTED PLACES FOR MAP
  //
  // IMPORTANT:
  // The map DOES NOT show the entire city's POIs.
  //
  // It only shows:
  // 1. Must-see places
  // 2. Start place
  // 3. End place
  //
  // There are NO route lines.
  // ============================================================

  const selectedMapPois = pois.filter((poi) =>
    mustSeePoiIds.includes(poi.poi_id) ||
    poi.poi_id === startPoiId ||
    poi.poi_id === endPoiId
  );

  // ============================================================
  // OPTIMIZED PLACES FOR MAP
  //
  // After optimization, show ONLY the POIs
  // included in the feasible itinerary.
  //
  // There is intentionally NO route prop.
  // ============================================================

  const optimizedPlaces =
    result?.feasible
      ? (result.stops || [])
          .map((stop) =>
            pois.find(
              (poi) =>
                poi.poi_id === stop.poi_id
            )
          )
          .filter(Boolean)
      : [];

  // ============================================================
  // SELECTED MAP POI
  // ============================================================

  const selectedPoi = selectedMapPoi
    ? pois.find(
        (poi) =>
          poi.poi_id === selectedMapPoi
      )
    : null;

  // ============================================================
  // MAP POI SELECT
  // ============================================================

  const handleMapPoiSelect = (poiId) => {
    setSelectedMapPoi(poiId);
  };

  // ============================================================
  // SET MAP POI AS START
  // ============================================================

  const handleSetSelectedAsStart = () => {
    if (!selectedPoi) return;

    setStartPoiId(selectedPoi.poi_id);

    setSelectedMapPoi(selectedPoi.poi_id);
  };

  // ============================================================
  // SET MAP POI AS END
  // ============================================================

  const handleSetSelectedAsEnd = () => {
    if (!selectedPoi) return;

    setEndPoiId(selectedPoi.poi_id);

    setSelectedMapPoi(selectedPoi.poi_id);
  };

  // ============================================================
  // ADD MAP POI AS MUST SEE
  // ============================================================

  const handleAddSelectedAsMustSee = () => {
    if (!selectedPoi) return;

    setMustSeePoiIds((current) => {
      if (
        current.includes(
          selectedPoi.poi_id
        )
      ) {
        return current;
      }

      return [
        ...current,
        selectedPoi.poi_id
      ];
    });
  };

  // ============================================================
  // RUN OPTIMIZER
  // ============================================================

  const runOptimization = async (
    overrideParams = {}
  ) => {
    if (!selectedCityId) return;

    const effectiveCityId =
      overrideParams.city_id ||
      selectedCityId;

    const effectiveMustSee =
      overrideParams.must_see_poi_ids ??
      mustSeePoiIds;

    const effectiveStartPoi =
      overrideParams.start_poi_id !==
      undefined
        ? overrideParams.start_poi_id
        : startPoiId || null;

    const effectiveEndPoi =
      overrideParams.end_poi_id !==
      undefined
        ? overrideParams.end_poi_id
        : endPoiId || null;

    const effectiveModes =
      overrideParams.allowed_modes ??
      allowedModes;

    const effectiveCandidates =
      overrideParams.candidate_poi_ids ??
      Array.from(
        new Set([
          effectiveStartPoi,
          effectiveEndPoi,
          ...effectiveMustSee
        ].filter(Boolean))
      );

    const effectiveBudget =
      overrideParams.budget_cap !==
      undefined
        ? overrideParams.budget_cap
        : budgetCap;

    const effectiveCarbon =
      overrideParams.carbon_cap_kg !==
      undefined
        ? overrideParams.carbon_cap_kg
        : carbonCap
          ? Number(carbonCap)
          : null;

    const effectiveWeights =
      overrideParams.weights ||
      weights;

    const payload = {
      city_id: effectiveCityId,

      day_start:
        overrideParams.day_start ||
        dayStart,

      day_end:
        overrideParams.day_end ||
        dayEnd,

      budget_cap:
        effectiveBudget,

      carbon_cap_kg:
        effectiveCarbon,

      must_see_poi_ids:
        effectiveMustSee,

      candidate_poi_ids:
        effectiveCandidates,

      start_poi_id:
        effectiveStartPoi,

      end_poi_id:
        effectiveEndPoi,

      allowed_modes:
        effectiveModes,

      weights:
        effectiveWeights
    };

    // Opening-hours relaxation
    if (
      overrideParams.opening_hours_overrides
    ) {
      payload.opening_hours_overrides =
        overrideParams.opening_hours_overrides;
    }

    setIsLoading(true);
    setError("");

    setLoadingStepText(
      "Reading your preferences..."
    );

    const timer1 = setTimeout(() => {
      setLoadingStepText(
        "Checking constraints & travel matrix..."
      );
    }, 250);

    const timer2 = setTimeout(() => {
      setLoadingStepText(
        "Optimizing your route across cost, time and carbon..."
      );
    }, 650);

    try {
      const data =
        await optimizeItinerary(
          payload
        );

      // Preserve previous feasible result
      if (
        data?.feasible &&
        result?.feasible
      ) {
        setPreviousSummary(
          result.summary
        );
      }

      setResult(data);

      if (data?.explanation) {
        setAiNarrative(
          data.explanation
        );
      }

      setShowingRelaxedPlan(false);

      // Scroll after result
      if (
        overrideParams.shouldScroll !==
          false &&
        resultsRef.current
      ) {
        setTimeout(() => {
          resultsRef.current.scrollIntoView(
            {
              behavior: "smooth",
              block: "start"
            }
          );
        }, 100);
      }
    } catch (err) {
      console.error(
        "Optimization error:",
        err
      );

      setError(
        err?.message ||
          "Optimization request failed. Please check your inputs."
      );
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);

      setIsLoading(false);
    }
  };

  // ============================================================
  // INITIAL OPTIMIZATION
  // ============================================================

  useEffect(() => {
    if (
      selectedCityId &&
      mustSeePoiIds.length > 0 &&
      startPoiId &&
      endPoiId &&
      !result
    ) {
      runOptimization({
        shouldScroll: false
      });
    }

    // Initial optimizer intentionally runs after
    // city/POI defaults are available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCityId,
    mustSeePoiIds,
    startPoiId,
    endPoiId
  ]);

  // ============================================================
  // AI PLAN COMPLETE
  // ============================================================

  const handleAiPlanComplete = (
    aiData
  ) => {
    if (!aiData) return;

    if (aiData.ai_status) {
      setAiStatus(
        aiData.ai_status
      );
    }

    if (aiData.narrative) {
      setAiNarrative(
        aiData.narrative
      );
    }

    if (aiData.plan) {
      if (
        result?.feasible &&
        aiData.plan?.feasible
      ) {
        setPreviousSummary(
          result.summary
        );
      }

      setResult(
        aiData.plan
      );
    } else {
      setResult(aiData);
    }

    if (resultsRef.current) {
      setTimeout(() => {
        resultsRef.current.scrollIntoView(
          {
            behavior: "smooth",
            block: "start"
          }
        );
      }, 100);
    }
  };

  // ============================================================
  // WEIGHT SLIDER HANDLER
  // ============================================================

  const handleWeightsChange = (
    newWeights
  ) => {
    setWeights(newWeights);

    if (debounceTimerRef.current) {
      clearTimeout(
        debounceTimerRef.current
      );
    }

    debounceTimerRef.current =
      setTimeout(() => {
        runOptimization({
          weights: newWeights,
          shouldScroll: false
        });
      }, 400);
  };

  // ============================================================
  // APPLY RELAXATION
  // ============================================================

  const handleApplyRelaxation = (
    chosenConstraintType
  ) => {
    if (
      !result ||
      !result.relaxed_plan
    ) {
      return;
    }

    const relaxedPlan =
      result.relaxed_plan;

    const overrides = {
      shouldScroll: true
    };

    // ----------------------------------------------------------
    // TIME END
    // ----------------------------------------------------------

    if (
      chosenConstraintType === "TIME" ||
      (!chosenConstraintType &&
        relaxedPlan.constraint_type ===
          "TIME")
    ) {
      const relaxedEnd =
        relaxedPlan.relaxed_value;

      setDayEnd(relaxedEnd);

      overrides.day_end =
        relaxedEnd;
    }

    // ----------------------------------------------------------
    // TIME START
    // ----------------------------------------------------------

    else if (
      chosenConstraintType ===
        "TIME_START" ||
      (!chosenConstraintType &&
        relaxedPlan.constraint_type ===
          "TIME_START")
    ) {
      const relaxedStart =
        relaxedPlan.relaxed_value;

      setDayStart(relaxedStart);

      overrides.day_start =
        relaxedStart;
    }

    // ----------------------------------------------------------
    // BUDGET
    // ----------------------------------------------------------

    else if (
      chosenConstraintType ===
        "BUDGET" ||
      (!chosenConstraintType &&
        relaxedPlan.constraint_type ===
          "BUDGET")
    ) {
      const value = String(
        relaxedPlan.relaxed_value ||
          ""
      ).replace(
        /[^0-9.]/g,
        ""
      );

      setBudgetCap(value);

      overrides.budget_cap =
        value;
    }

    // ----------------------------------------------------------
    // CARBON
    // ----------------------------------------------------------

    else if (
      chosenConstraintType ===
        "CARBON" ||
      (!chosenConstraintType &&
        relaxedPlan.constraint_type ===
          "CARBON")
    ) {
      const value = String(
        relaxedPlan.relaxed_value ||
          ""
      ).replace(
        /[^0-9.]/g,
        ""
      );

      setCarbonCap(value);

      overrides.carbon_cap_kg =
        Number(value);
    }

    // ----------------------------------------------------------
    // OPENING HOURS
    // ----------------------------------------------------------

    else if (
      chosenConstraintType ===
        "OPENING_HOURS" ||
      (!chosenConstraintType &&
        relaxedPlan.constraint_type ===
          "OPENING_HOURS")
    ) {
      const poiId =
        relaxedPlan.poi_id ||
        relaxedPlan.binding_constraint
          ?.poi_id;

      const relaxedClosing =
        relaxedPlan.relaxed_value;

      if (
        poiId &&
        relaxedClosing
      ) {
        overrides.opening_hours_overrides =
          {
            [poiId]: {
              closes_at:
                relaxedClosing
            }
          };
      } else {
        setShowingRelaxedPlan(true);
        return;
      }
    }

    runOptimization(
      overrides
    );
  };

  // ============================================================
  // RESET
  // ============================================================

  const resetControls = () => {
    setDayStart("09:00");

    setDayEnd("18:00");

    setBudgetCap("2500");

    setCarbonCap("10");

    setWeights({
      cost: 0.3,
      time: 0.3,
      carbon: 0.4
    });

    setAllowedModes([
      "walk",
      "cab"
    ]);

    setShowingRelaxedPlan(false);

    setSelectedMapPoi(null);

    setResult(null);

    setPreviousSummary(null);

    setAiNarrative("");

    setAiStatus(null);

    setTimeout(() => {
      runOptimization({
        shouldScroll: false
      });
    }, 50);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="planner-page">

      {/* ======================================================
          TOP BAR
      ====================================================== */}

      <div className="planner-topbar">

        <div className="brand-sub">
          <span className="live-pulse-dot" />
          <span>{t.tag}</span>
        </div>

        <div className="language-toggle">

          <Globe size={14} />

          <button
            type="button"
            className={
              language === "en"
                ? "lang-btn active"
                : "lang-btn"
            }
            onClick={() =>
              setLanguage("en")
            }
          >
            English
          </button>

          <span className="lang-sep">
            |
          </span>

          <button
            type="button"
            className={
              language === "hi"
                ? "lang-btn active"
                : "lang-btn"
            }
            onClick={() =>
              setLanguage("hi")
            }
          >
            हिंदी
          </button>

        </div>
      </div>

      {/* ======================================================
          HERO
      ====================================================== */}

      <div className="planner-hero">

        <h1 className="planner-headline">
          {t.title}
        </h1>

        <p className="planner-tagline">
          {t.subtitle}
        </p>

      </div>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="planner-error-banner">

          <AlertCircle size={18} />

          <span>
            {error}
          </span>

          <button
            type="button"
            className="error-retry-btn"
            onClick={() =>
              runOptimization()
            }
          >
            Retry
          </button>

        </div>
      )}

      {/* ======================================================
          THREE COLUMN LAYOUT
      ====================================================== */}

      <div className="planner-layout-grid">

        {/* ====================================================
            LEFT SIDEBAR
        ==================================================== */}

        <aside className="planner-sidebar">

          <PlannerForm
            cities={cities}

            selectedCityId={
              selectedCityId
            }

            onCityChange={(cityId) => {
              setSelectedCityId(
                cityId
              );

              setSelectedMapPoi(null);

              setResult(null);

              setPreviousSummary(null);

              setAiNarrative("");

              setAiStatus(null);
            }}

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

            mustSeePoiIds={
              mustSeePoiIds
            }

            setMustSeePoiIds={
              setMustSeePoiIds
            }

            startPoiId={
              startPoiId
            }

            setStartPoiId={
              setStartPoiId
            }

            endPoiId={
              endPoiId
            }

            setEndPoiId={
              setEndPoiId
            }

            allowedModes={
              allowedModes
            }

            setAllowedModes={
              setAllowedModes
            }

            onOptimize={() =>
              runOptimization({
                shouldScroll: true
              })
            }

            isLoading={isLoading}

            onAiPlanComplete={
              handleAiPlanComplete
            }

            language={language}
          />

          {/* ====================================================
              INTERACTIVE MAP
          ==================================================== */}

          <section className="planner-map-section">

            <div className="planner-map-header">

              <div>

                <span className="planner-map-eyebrow">
                  EXPLORE DESTINATION
                </span>

                <h3>
                  Choose a place on the map
                </h3>

                <p>
                  Click a real POI to inspect it,
                  then use it as your start, end,
                  or must-see location.
                </p>

              </div>

              {selectedPoi && (
                <div className="planner-map-selection-badge">

                  <span>
                    SELECTED
                  </span>

                  <strong>
                    {selectedPoi.name}
                  </strong>

                </div>
              )}

            </div>

            {/* ==================================================
                IMPORTANT:
                Only selected places are shown.
                No route.
            ================================================== */}

            <MapView
              pois={selectedMapPois}
              selectedPoiId={
                selectedMapPoi
              }
              onPoiSelect={
                handleMapPoiSelect
              }
              city={
                selectedCity
              }
            />

            {/* Selected POI actions */}

            {selectedPoi && (
              <div className="selected-poi-card">

                <div className="selected-poi-info">

                  <span className="selected-poi-label">
                    SELECTED PLACE
                  </span>

                  <h3>
                    📍 {selectedPoi.name}
                  </h3>

                  <p>
                    {
                      selectedPoi.poi_category ||
                      "Attraction"
                    }

                    {" • "}

                    {
                      selectedPoi.typical_duration_minutes ??
                      0
                    }

                    {" min • ₹"}

                    {
                      selectedPoi.entry_cost ??
                      "0.00"
                    }
                  </p>

                  <div className="selected-poi-meta">

                    <span>
                      🕐{" "}
                      {
                        selectedPoi.opens_at ||
                        "--"
                      }

                      {" – "}

                      {
                        selectedPoi.closes_at ||
                        "--"
                      }
                    </span>

                    <span>
                      🌱{" "}
                      {
                        selectedPoi.carbon_kg ??
                        0
                      }

                      {" kg CO₂"}
                    </span>

                  </div>

                </div>

                <div className="selected-poi-actions">

                  <button
                    type="button"
                    onClick={
                      handleSetSelectedAsStart
                    }
                  >
                    Set as Start
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleSetSelectedAsEnd
                    }
                  >
                    Set as End
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleAddSelectedAsMustSee
                    }
                    disabled={mustSeePoiIds.includes(
                      selectedPoi.poi_id
                    )}
                  >
                    {
                      mustSeePoiIds.includes(
                        selectedPoi.poi_id
                      )
                        ? "✓ Must-see"
                        : "★ Add Must-see"
                    }
                  </button>

                </div>

              </div>
            )}

          </section>

          {/* ====================================================
              OBJECTIVE WEIGHTS
          ==================================================== */}

          <WeightSliders
            weights={weights}
            onChange={
              handleWeightsChange
            }
            disabled={isLoading}
            language={language}
          />

          {/* Reset */}

          <button
            type="button"
            className="planner-reset-btn"
            onClick={
              resetControls
            }
          >
            <RefreshCw size={15} />

            {t.resetBtn}
          </button>

        </aside>

        {/* ====================================================
            CENTER RESULT COLUMN
        ==================================================== */}

        <section
          className="planner-content"
          ref={resultsRef}
        >

          {/* Results header */}

          <div className="results-header-row">

            <div className="results-title-group">

              <h3 className="results-heading">
                {t.resultHeading}
              </h3>

              {result && (
                <span className="results-city-crumb">

                  {
                    selectedCity?.name ||
                    "Destination"
                  }

                  {" • "}

                  {dayDate}

                </span>
              )}

            </div>

            {result && (
              <span
                className={
                  `status-pill ${
                    result.feasible
                      ? "feasible"
                      : "infeasible"
                  }`
                }
              >

                {result.feasible ? (
                  <>
                    <CheckCircle2
                      size={14}
                    />

                    <span>
                      {
                        t.feasibleBadge
                      }
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle
                      size={14}
                    />

                    <span>
                      {
                        t.infeasibleBadge
                      }
                    </span>
                  </>
                )}

              </span>
            )}

          </div>

          {/* ==================================================
              LOADING
          ================================================== */}

          {isLoading && (
            <div className="optimizing-overlay">

              <RefreshCw
                size={28}
                className="spin accent-spin"
              />

              <h4>
                {loadingStepText}
              </h4>

              <p>
                Evaluating travel times,
                opening hours, cost and
                carbon footprint
                deterministically...
              </p>

            </div>
          )}

          {/* ==================================================
              FEASIBLE RESULT
          ================================================== */}

          {result &&
            result.feasible && (
              <div className="feasible-results-block">

                {/* AI explanation */}

                {aiNarrative && (
                  <div className="ai-explanation-card">

                    <div className="explanation-icon-title">

                      <Sparkles
                        size={16}
                        className="sparkle-accent"
                      />

                      <span className="explanation-label">

                        {
                          aiStatus?.fallback
                            ? "Smart Grounded Explanation"
                            : "AI Concierge Insight"
                        }

                      </span>

                    </div>

                    <p className="explanation-body">
                      {aiNarrative}
                    </p>

                    {aiStatus?.message && (
                      <div className="ai-provider-tag">

                        <span>
                          {
                            aiStatus.message
                          }
                        </span>

                      </div>
                    )}

                  </div>
                )}

                {/* Metrics */}

                <MetricsCard
                  summary={
                    result.summary
                  }
                  budgetCap={
                    budgetCap
                  }
                  carbonCap={
                    carbonCap
                  }
                  language={
                    language
                  }
                />

                {/* ==================================================
                    OPTIMIZED PLACES MAP
                ================================================== */}

                {optimizedPlaces.length >
                  0 && (

                  <div className="timeline-section-card planner-result-map-card">

                    <div className="card-header">

                      <h4 className="section-title">
                        OPTIMIZED PLACES MAP
                      </h4>

                      <p className="section-subtitle">
                        Only the places included in the feasible itinerary are shown on the map. No route lines or turn-by-turn directions.
                      </p>

                    </div>

                    <MapView
                      pois={optimizedPlaces}
                      selectedPoiId={
                        selectedMapPoi
                      }
                      onPoiSelect={
                        handleMapPoiSelect
                      }
                      city={
                        selectedCity
                      }
                      route={{
                        stops: result.stops || [],
                        transfers: result.transfers || []
                      }}
                    />

                  </div>
                )}

                {/* ==================================================
                    TIMELINE
                ================================================== */}

                <div className="timeline-section-card">

                  <div className="card-header">

                    <h4 className="section-title">
                      CHRONOLOGICAL DAY
                      SCHEDULE
                    </h4>

                    <p className="section-subtitle">

                      {
                        result.summary
                          ?.day_start
                      }

                      {" to "}

                      {
                        result.summary
                          ?.day_end
                      }

                      {" • "}

                      {
                        result.stops
                          ?.length || 0
                      }

                      {" Attractions • "}

                      {
                        result.transfers
                          ?.length || 0
                      }

                      {" Transfers"}

                    </p>

                  </div>

                  <ItineraryTimeline
                    stops={
                      result.stops
                    }
                    transfers={
                      result.transfers
                    }
                    language={
                      language
                    }
                  />

                </div>

              </div>
            )}

          {/* ==================================================
              INFEASIBLE RESULT
          ================================================== */}

          {result &&
            !result.feasible && (
              <div className="infeasible-results-block">

                <InfeasibilityCard
                  bindingConstraint={
                    result.binding_constraint
                  }

                  explanation={
                    result.explanation
                  }

                  relaxation={
                    result.relaxation
                  }

                  onApplyRelaxation={
                    handleApplyRelaxation
                  }

                  onViewRelaxedPlan={() =>
                    setShowingRelaxedPlan(
                      !showingRelaxedPlan
                    )
                  }

                  showingRelaxedPlan={
                    showingRelaxedPlan
                  }

                  language={
                    language
                  }
                />

                {showingRelaxedPlan &&
                  result.relaxed_plan && (
                    <RelaxedPlan
                      relaxedPlan={
                        result.relaxed_plan
                      }

                      onApply={() =>
                        handleApplyRelaxation()
                      }

                      language={
                        language
                      }
                    />
                  )}

              </div>
            )}

          {/* ==================================================
              EMPTY STATE
          ================================================== */}

          {!result &&
            !isLoading && (
              <div className="planner-initial-empty-state">

                <Compass
                  size={40}
                  className="empty-icon"
                />

                <h3>
                  Ready to craft
                  your day
                </h3>

                <p>
                  Select your attractions
                  and priorities on the
                  left, or type a request
                  in the AI box.
                </p>

              </div>
            )}

        </section>

        {/* ====================================================
            RIGHT INSIGHTS COLUMN
        ==================================================== */}

        <aside className="planner-insights-col">

          {/* Tradeoff analysis */}

          {result &&
            result.feasible && (
              <TradeoffView
                weights={
                  weights
                }

                normalizedMetrics={
                  result.normalized_metrics
                }

                summary={
                  result.summary
                }

                previousSummary={
                  previousSummary
                }

                language={
                  language
                }
              />
            )}

          {/* Constraint verification */}

          {result &&
            result.feasible && (
              <div className="solver-meta-card">

                <div className="meta-card-header">

                  <ShieldCheck
                    size={16}
                  />

                  <span>
                    CONSTRAINT
                    VERIFICATION
                  </span>

                </div>

                <ul className="meta-checks-list">

                  <li>

                    <CheckCircle2
                      size={13}
                      className="check-green"
                    />

                    <span>
                      Time window:{" "}
                      {
                        result.summary
                          ?.day_start
                      }

                      {" – "}

                      {
                        result.summary
                          ?.day_end
                      }

                      {" satisfied"}
                    </span>

                  </li>

                  <li>

                    <CheckCircle2
                      size={13}
                      className="check-green"
                    />

                    <span>
                      Opening hours
                      strictly verified
                      for all{" "}
                      {
                        result.stops
                          ?.length || 0
                      }{" "}
                      stops
                    </span>

                  </li>

                  <li>

                    <CheckCircle2
                      size={13}
                      className="check-green"
                    />

                    <span>
                      Budget limit: ₹
                      {
                        result.summary
                          ?.cost
                      }

                      {" / ₹"}

                      {
                        budgetCap ||
                        "∞"
                      }
                    </span>

                  </li>

                  <li>

                    <CheckCircle2
                      size={13}
                      className="check-green"
                    />

                    <span>
                      Emissions limit:{" "}
                      {
                        result.summary
                          ?.carbon_kg
                      }

                      {" kg / "}

                      {
                        carbonCap ||
                        "∞"
                      }

                      {" kg"}
                    </span>

                  </li>

                  <li>

                    <CheckCircle2
                      size={13}
                      className="check-green"
                    />

                    <span>
                      All{" "}
                      {
                        mustSeePoiIds.length
                      }{" "}
                      mandatory
                      must-see POIs
                      scheduled
                    </span>

                  </li>

                </ul>

              </div>
            )}

        </aside>

      </div>
    </div>
  );
}


