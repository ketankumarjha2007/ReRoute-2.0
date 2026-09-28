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
  ShieldCheck,
  Download,
} from "lucide-react";

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import "../styles/Planner.css";

export default function Planner() {
  const location = useLocation();

  const resultsRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const optimizationAbortRef = useRef(null);
  const optimizationRequestIdRef = useRef(0);

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

  const [dayDate, setDayDate] = useState(
    new Date().toISOString().split("T")[0]
  );

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
  const [isReoptimizing, setIsReoptimizing] = useState(false);

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
        "Hard Constraint Infeasibility Detected",

      resetBtn: "Reset Controls",

      exploreDestination: "EXPLORE DESTINATION",

      choosePlaceOnMap:
        "Choose a place on the map",

      mapInstruction:
        "Click a real POI to inspect it, then use it as your start, end, or must-see location.",

      selected: "SELECTED",

      selectedPlace: "SELECTED PLACE",

      setAsStart: "Set as Start",

      setAsEnd: "Set as End",

      addMustSee: "★ Add Must-see",

      mustSeeAdded: "✓ Must-see",

      optimizedPlacesMap:
        "OPTIMIZED PLACES MAP",

      optimizedPlacesDescription:
        "Only the places included in the feasible itinerary are shown on the map. No route lines or turn-by-turn directions.",

      reoptimizing:
        "Re-optimizing your route...",

      evaluatingTravel:
        "Evaluating travel times, opening hours, cost and carbon footprint deterministically...",

      smartGroundedExplanation:
        "Smart Grounded Explanation",

      aiConciergeInsight:
        "AI Concierge Insight",

      constraintVerification:
        "CONSTRAINT VERIFICATION",

      readyToCraft:
        "Ready to craft your day",

      readyToCraftDescription:
        "Select your attractions and priorities on the left, or type a request in the AI box.",

      min: "min"
    },

    hi: {
      tag:
        "बहु-उद्देश्यीय यात्रा योजना अनुकूलक",

      title:
        "वास्तविक डेटा पर आधारित सर्वोत्तम यात्रा मार्ग",

      subtitle:
        "लागत, समय और कार्बन का सटीक गणितीय संतुलन, वास्तविक डेटा और समय सीमाओं के साथ।",

      resultHeading:
        "आपका अनुकूलित दिन",

      feasibleBadge:
        "व्यावहारिक योजना सत्यापित ✓",

      infeasibleBadge:
        "कठोर प्रतिबंध उल्लंघन पाया गया",

      resetBtn:
        "नियंत्रण रीसेट करें",

      exploreDestination:
        "गंतव्य देखें",

      choosePlaceOnMap:
        "मानचित्र पर कोई स्थान चुनें",

      mapInstruction:
        "वास्तविक आकर्षण को देखने के लिए उस पर क्लिक करें और उसे प्रारंभ, अंत या अनिवार्य स्थान के रूप में चुनें।",

      selected:
        "चयनित",

      selectedPlace:
        "चयनित स्थान",

      setAsStart:
        "प्रारंभ के रूप में चुनें",

      setAsEnd:
        "अंत के रूप में चुनें",

      addMustSee:
        "★ अनिवार्य आकर्षण जोड़ें",

      mustSeeAdded:
        "✓ अनिवार्य आकर्षण",

      optimizedPlacesMap:
        "अनुकूलित स्थान मानचित्र",

      optimizedPlacesDescription:
        "केवल व्यवहार्य यात्रा योजना में शामिल स्थान मानचित्र पर दिखाए गए हैं। कोई मार्ग रेखा या टर्न-बाय-टर्न दिशा नहीं है।",

      reoptimizing:
        "आपके मार्ग का पुनः अनुकूलन हो रहा है...",

      evaluatingTravel:
        "यात्रा समय, खुलने के घंटे, लागत और कार्बन उत्सर्जन का मूल्यांकन किया जा रहा है...",

      smartGroundedExplanation:
        "स्मार्ट ग्राउंडेड विवरण",

      aiConciergeInsight:
        "AI सहायक की जानकारी",

      constraintVerification:
        "प्रतिबंध सत्यापन",

      readyToCraft:
        "अपना दिन तैयार करें",

      readyToCraftDescription:
        "बाईं ओर अपने आकर्षण और प्राथमिकताएँ चुनें, या AI बॉक्स में अपनी आवश्यकता लिखें।",

      min:
        "मिनट"
    }
  };

  const t = translations[language] || translations.en;

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
    const isReoptimization =
      overrideParams.isReoptimization === true;

    const today = new Date();
    const todayDate =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    if (dayDate < todayDate) {
      setError("Please select today or a future date to plan your day.");
      return;
    }

    if (!selectedCityId) return;

    const effectiveCityId =
      overrideParams.city_id ||
      selectedCityId;

    const effectiveMustSee =
      overrideParams.must_see_poi_ids ||
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
      overrideParams.allowed_modes ||
      allowedModes;

    const effectiveCandidates =
      overrideParams.candidate_poi_ids ||
      null;

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

      day_date: dayDate,

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

    const requestId = ++optimizationRequestIdRef.current;

    if (isReoptimization) {
      setIsReoptimizing(true);
    } else {
      setIsLoading(true);
    }

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

      // Cancel the previous optimization request.
      if (optimizationAbortRef.current) {
        optimizationAbortRef.current.abort();
      }

      const controller = new AbortController();
      optimizationAbortRef.current = controller;

      const data =
        await optimizeItinerary(
          payload,
          {
            signal: controller.signal
          }
        );

      // Ignore this response if a newer optimization request has started.
      if (requestId !== optimizationRequestIdRef.current) {
        return;
      }

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

      if (err?.name === "AbortError") {
        return;
      }

      // Ignore errors from an older optimization request.
      if (requestId !== optimizationRequestIdRef.current) {
        return;
      }

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

      if (requestId === optimizationRequestIdRef.current) {
        if (isReoptimization) {
          setIsReoptimizing(false);
        } else {
          setIsLoading(false);
        }
      }
    }
  };

  // ============================================================
  // OPTIMIZATION REQUEST CLEANUP
  // ============================================================

  useEffect(() => {
    return () => {
      if (optimizationAbortRef.current) {
        optimizationAbortRef.current.abort();
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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

    if (aiData.parsed_intent?.weights) {
      const aiWeights = aiData.parsed_intent.weights;
      const cost = Number(aiWeights.cost);
      const time = Number(aiWeights.time);
      const carbon = Number(aiWeights.carbon);

      if (
        Number.isFinite(cost) &&
        Number.isFinite(time) &&
        Number.isFinite(carbon) &&
        cost >= 0 &&
        time >= 0 &&
        carbon >= 0 &&
        cost + time + carbon > 0
      ) {
        setWeights({ cost, time, carbon });
      }
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
          shouldScroll: false,
          isReoptimization: true
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
  // REROUTE - PREMIUM PDF EXPORT (v2)
  // Drop-in replacement for handleDownloadPlan.
  // Needs in scope: jsPDF, result, selectedCity, allowedModes, dayDate,
  // dayStart, dayEnd, budgetCap, carbonCap, weights, aiNarrative, mustSeePoiIds
  // ============================================================

  const handleDownloadPlan = () => {
    if (!result?.feasible || !result?.stops?.length) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 15; // page margin
    const CW = W - M * 2; // content width
    const BOTTOM = H - 20; // lowest y content may reach

    // ----------------------------------------------------------
    // PALETTE
    // ----------------------------------------------------------
    const C = {
      green: [22, 163, 74],
      greenDark: [21, 128, 61],
      greenSoft: [240, 253, 244],
      greenBorder: [187, 247, 208],
      mint: [134, 239, 172],
      blue: [37, 99, 235],
      blueSoft: [239, 246, 255],
      amber: [217, 119, 6],
      amberSoft: [255, 247, 237],
      amberBorder: [253, 230, 138],
      red: [220, 38, 38],
      redSoft: [254, 242, 242],
      redBorder: [254, 202, 202],
      navy: [15, 23, 42],
      navy2: [24, 36, 62],
      slate800: [30, 41, 59],
      slate700: [51, 65, 85],
      slate600: [71, 85, 105],
      slate500: [100, 116, 139],
      slate400: [148, 163, 184],
      slate300: [203, 213, 225],
      slate200: [226, 232, 240],
      slate100: [241, 245, 249],
      slate50: [248, 250, 252],
      white: [255, 255, 255],
    };

    const summary = result.summary || {};
    const stops = result.stops;
    const transfers = result.transfers || [];

    // ----------------------------------------------------------
    // DATA HELPERS
    // ----------------------------------------------------------
    // jsPDF's built-in Helvetica only supports Latin-1, so we scrub
    // anything else (rupee sign, subscript 2, smart quotes...) to avoid garbled glyphs.
    const clean = (v) =>
      String(v)
        .replace(/CO₂/g, "CO2")
        .replace(/₂/g, "2")
        .replace(/₹/g, "INR ")
        .replace(/[–—]/g, "-")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/…/g, "...")
        .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
        .replace(/ {2,}/g, " ")
        .trim();

    const safe = (v, fb = "-") =>
      v === undefined || v === null || v === "" ? fb : clean(v);

    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const toMin = (s) => {
      if (typeof s !== "string") return null;
      const m = s.match(/(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const fmtMin = (v) => {
      const t = Math.round(Number(v) || 0);
      const h = Math.floor(t / 60);
      const m = t % 60;
      if (h > 0 && m > 0) return `${h}h ${m}m`;
      if (h > 0) return `${h}h`;
      return `${m}m`;
    };
    const money = (v) => `INR ${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;
    const carbon = (v) => `${(Number(v) || 0).toFixed(1)} kg CO2`;
    const km = (v) => `${(Number(v) || 0).toFixed(1)} km`;
    const slugify = (v) =>
      String(v).trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const cityName = safe(selectedCity?.name || result.city_name || result.city, "Destination");
    const dateText = safe(dayDate, "");
    const transportText =
      Array.isArray(allowedModes) && allowedModes.length
        ? allowedModes.map((m) => String(m).toUpperCase()).join(" + ")
        : "Not specified";

    // Day window
    let ds = toMin(dayStart);
    let de = toMin(dayEnd);
    if (ds === null) ds = (toMin(stops[0]?.arrival) ?? 540) - 30;
    if (de === null) de = (toMin(stops[stops.length - 1]?.departure) ?? 1080) + 30;
    if (de <= ds) de = ds + 540;
    const windowMin = de - ds;

    const used = {
      cost: Number(summary.cost) || 0,
      minutes: Number(summary.minutes) || 0,
      carbon: Number(summary.carbon_kg) || 0,
    };
    const budgetLimit = Number(budgetCap) || 0;
    const carbonLimit = Number(carbonCap) || 0;
    const activityMin = Math.round(Number(summary.activity_minutes) || 0);
    const travelMin = Math.round(Number(summary.travel_minutes) || 0);

    // ----------------------------------------------------------
    // INTEGRITY CHECKS (so the PDF never claims "verified" blindly)
    // ----------------------------------------------------------
    const transferIssue = (t) => {
      const mode = String(t.mode || "").toLowerCase();
      const d = Number(t.distance_km) || 0;
      const mins = Number(t.minutes) || 0;
      if (mode.includes("walk") && d > 0 && mins > 0) {
        const speed = d / (mins / 60);
        if (speed > 7) {
          return `Walking ${km(d)} in ${Math.round(mins)} min implies ${speed.toFixed(0)} km/h. Verify mode or distance.`;
        }
        if (d > 3) return `${km(d)} on foot is a long walk. Consider a cab.`;
      }
      if (!mode.includes("walk") && d > 1 && Number(t.cost) === 0) {
        return `${safe(t.mode, "Transit")} leg of ${km(d)} has zero fare. Fare may be missing.`;
      }
      return null;
    };

    const stopHoursBad = stops.map((s) => {
      const o = toMin(s.opens_at);
      const c = toMin(s.closes_at);
      const a = toMin(s.arrival);
      const d = toMin(s.departure);
      if (c !== null && d !== null && d > c) return true;
      if (o !== null && a !== null && a < o && !(Number(s.wait_minutes) > 0)) return true;
      return false;
    });

    const issues = [];
    transfers.forEach((t, i) => {
      const msg = transferIssue(t);
      if (msg) issues.push(`Transfer ${i + 1} to ${i + 2}: ${msg}`);
    });
    stops.forEach((s, i) => {
      if (stopHoursBad[i]) issues.push(`Stop ${i + 1} (${safe(s.name)}): visit falls outside opening hours.`);
    });

    const requiredIds = Array.isArray(mustSeePoiIds) ? mustSeePoiIds : [];
    const stopIds = stops.map((s) => s.poi_id ?? s.id ?? s.poiId).filter((x) => x !== undefined);
    const missingMust = stopIds.length ? requiredIds.filter((id) => !stopIds.includes(id)) : [];

    // ----------------------------------------------------------
    // DRAW PRIMITIVES
    // ----------------------------------------------------------
    const txt = (s, x, y, o = {}) => {
      const { size = 8, bold = false, color = C.slate700, align = "left", maxW } = o;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      let out = clean(s);
      if (maxW) {
        if (doc.getTextWidth(out) > maxW) {
          while (out.length > 1 && doc.getTextWidth(out + "...") > maxW) out = out.slice(0, -1);
          out = out.trimEnd() + "...";
        }
      }
      doc.text(out, x, y, { align });
    };

    const wrap = (s, maxW, size = 8, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      return doc.splitTextToSize(clean(s), maxW);
    };

    const box = (x, y, w, h, fill, o = {}) => {
      const { r = 3, stroke = null, sw = 0.3 } = o;
      if (w <= 0 || h <= 0) return;
      const rr = Math.min(r, w / 2, h / 2);
      doc.setFillColor(...fill);
      if (stroke) {
        doc.setDrawColor(...stroke);
        doc.setLineWidth(sw);
        doc.roundedRect(x, y, w, h, rr, rr, "FD");
      } else {
        doc.roundedRect(x, y, w, h, rr, rr, "F");
      }
    };

    const line = (x1, y1, x2, y2, color = C.slate200, w = 0.3) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(w);
      doc.line(x1, y1, x2, y2);
    };

    // align: "left" => x is left edge, "right" => x is right edge
    const pill = (text, x, y, bg, fg, align = "left", size = 6) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      const label = clean(text);
      const w = doc.getTextWidth(label) + 8;
      const px = align === "right" ? x - w : x;
      box(px, y, w, 6, bg, { r: 3 });
      doc.setTextColor(...fg);
      doc.text(label, px + w / 2, y + 4.1, { align: "center" });
      return w;
    };

    const ring = (cx, cy, r, pct, color, label) => {
      doc.setDrawColor(...C.slate200);
      doc.setLineWidth(2.2);
      doc.circle(cx, cy, r, "S");
      if (pct !== null) {
        const p = clamp(pct, 0, 1);
        const steps = Math.max(2, Math.round(p * 96));
        doc.setLineCap("round");
        doc.setDrawColor(...color);
        doc.setLineWidth(2.2);
        for (let i = 0; i < steps; i++) {
          const a1 = -Math.PI / 2 + (2 * Math.PI * p * i) / steps;
          const a2 = -Math.PI / 2 + (2 * Math.PI * p * (i + 1)) / steps;
          doc.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
        }
        doc.setLineCap("butt");
      }
      txt(label, cx, cy + 1.6, { size: 6.5, bold: true, color: C.navy, align: "center" });
    };

    const bar = (x, y, w, h, pct, color, track = C.slate200) => {
      box(x, y, w, h, track, { r: h / 2 });
      box(x, y, w * clamp(pct, 0, 1), h, color, { r: h / 2 });
    };

    const gaugeColor = (p, accent) => (p > 1 ? C.red : p > 0.9 ? C.amber : accent);

    const icon = (cx, cy, kind) => {
      const col = kind === "ok" ? C.green : kind === "warn" ? C.amber : C.red;
      doc.setFillColor(...col);
      doc.circle(cx, cy, 4.6, "F");
      doc.setDrawColor(...C.white);
      doc.setLineWidth(0.9);
      doc.setLineCap("round");
      if (kind === "ok") {
        doc.line(cx - 2, cy + 0.2, cx - 0.6, cy + 1.7);
        doc.line(cx - 0.6, cy + 1.7, cx + 2.2, cy - 1.6);
      } else if (kind === "fail") {
        doc.line(cx - 1.7, cy - 1.7, cx + 1.7, cy + 1.7);
        doc.line(cx + 1.7, cy - 1.7, cx - 1.7, cy + 1.7);
      } else {
        doc.line(cx, cy - 2.1, cx, cy + 0.6);
        doc.circle(cx, cy + 2, 0.2, "F");
      }
      doc.setLineCap("butt");
    };

    // ----------------------------------------------------------
    // PAGE FRAME
    // ----------------------------------------------------------
    let y = 0;

    const header = (section) => {
      box(M, 10, 9, 9, C.green, { r: 2.4 });
      txt("R", M + 4.5, 16.4, { size: 10, bold: true, color: C.white, align: "center" });
      txt("ReRoute", M + 12, 15, { size: 12, bold: true, color: C.navy });
      txt(section, M + 12, 19.2, { size: 5.8, bold: true, color: C.slate400 });
      txt(`${cityName}  |  ${dateText}`, W - M, 15, { size: 7, color: C.slate500, align: "right" });
      line(M, 25, W - M, 25, C.slate200, 0.4);
      y = 36;
    };

    const newPage = (section) => {
      doc.addPage();
      header(section);
    };

    const ensure = (h, section) => {
      if (y + h > BOTTOM) {
        newPage(section);
        return true;
      }
      return false;
    };

    const sectionTitle = (title, sub) => {
      txt(title, M, y, { size: 12, bold: true, color: C.navy });
      if (sub) txt(sub, W - M, y, { size: 6.8, color: C.slate500, align: "right" });
      y += 6;
    };

    // ==========================================================
    // PAGE 1 - HERO + DASHBOARD
    // ==========================================================
    const HERO = 90;
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, W, HERO, "F");
    doc.setFillColor(...C.navy2);
    doc.circle(W - 8, 6, 46, "F");
    doc.setFillColor(...C.navy);
    doc.circle(W - 8, 6, 30, "F");
    doc.setFillColor(...C.navy2);
    doc.circle(W - 8, 6, 16, "F");
    doc.setFillColor(...C.green);
    doc.rect(0, 0, W, 2.6, "F");

    box(M, 11, 9, 9, C.green, { r: 2.4 });
    txt("R", M + 4.5, 17.4, { size: 10, bold: true, color: C.white, align: "center" });
    txt("ReRoute", M + 12, 17.6, { size: 13, bold: true, color: C.white });
    pill("OPTIMIZED ITINERARY", W - M, 12, C.greenDark, C.white, "right");

    txt("Your Day,", M, 38, { size: 27, bold: true, color: C.white });
    txt("Optimized.", M, 49, { size: 27, bold: true, color: C.mint });
    txt(`${cityName}  |  ${dateText}  |  ${safe(dayStart)} - ${safe(dayEnd)}`, M, 57, {
      size: 8.5,
      color: C.slate300,
    });

    // route strip: every stop, not just start and end
    const n = stops.length;
    const rx0 = M + 8;
    const rx1 = W - M - 8;
    const ry = 68;
    const step = n > 1 ? (rx1 - rx0) / (n - 1) : 0;
    const rx = (i) => (n > 1 ? rx0 + step * i : (rx0 + rx1) / 2);
    line(rx0, ry, rx1, ry, C.slate600, 0.6);
    if (n > 1) line(rx0, ry, rx1, ry, C.green, 1.2);
    txt("START", rx(0), ry - 6, { size: 5.5, bold: true, color: C.mint, align: "center" });
    if (n > 1) txt("END", rx(n - 1), ry - 6, { size: 5.5, bold: true, color: C.mint, align: "center" });
    stops.forEach((s, i) => {
      doc.setFillColor(...C.navy);
      doc.circle(rx(i), ry, 4.8, "F");
      doc.setFillColor(...C.green);
      doc.circle(rx(i), ry, 3.8, "F");
      txt(String(i + 1), rx(i), ry + 1.5, { size: 6.5, bold: true, color: C.white, align: "center" });
      const lw = n > 1 ? Math.min(42, step - 3) : 60;
      txt(s.name, rx(i), ry + 9, { size: 6.3, color: C.slate300, align: "center", maxW: lw });
    });

    // KPI cards overlapping the hero
    y = HERO - 8;
    const gap = 5;
    const kw = (CW - gap * 2) / 3;
    const kh = 46;
    const kpis = [
      {
        label: "Total cost",
        value: money(used.cost),
        sub: budgetLimit ? `${money(Math.max(0, budgetLimit - used.cost))} remaining of ${money(budgetLimit)}` : "No budget cap set",
        pct: budgetLimit ? used.cost / budgetLimit : null,
        accent: C.green,
      },
      {
        label: "Total time",
        value: fmtMin(used.minutes),
        sub: `${activityMin} min activities | ${travelMin} min transit`,
        pct: used.minutes / windowMin,
        accent: C.blue,
      },
      {
        label: "Carbon",
        value: carbon(used.carbon),
        sub: carbonLimit ? `${Math.max(0, carbonLimit - used.carbon).toFixed(1)} kg remaining of ${carbonLimit.toFixed(1)}` : "No carbon cap set",
        pct: carbonLimit ? used.carbon / carbonLimit : null,
        accent: C.greenDark,
      },
    ];
    kpis.forEach((k, i) => {
      const x = M + i * (kw + gap);
      box(x + 0.6, y + 1, kw, kh, C.slate200, { r: 5 }); // soft shadow
      box(x, y, kw, kh, C.white, { r: 5, stroke: C.slate200 });
      box(x, y + 8, 1.6, 14, k.accent, { r: 0.8 });
      txt(k.label.toUpperCase(), x + 7, y + 10, { size: 6, bold: true, color: C.slate500 });
      ring(
        x + kw - 13,
        y + 15,
        6.8,
        k.pct,
        gaugeColor(k.pct ?? 0, k.accent),
        k.pct === null ? "--" : `${Math.round(k.pct * 100)}%`
      );
      txt(k.value, x + 7, y + 29, { size: 14, bold: true, color: C.navy, maxW: kw - 12 });
      wrap(k.sub, kw - 14, 6.3)
        .slice(0, 2)
        .forEach((l, li) => txt(l, x + 7, y + 35.5 + li * 3.6, { size: 6.3, color: C.slate500 }));
    });
    y += kh + 12;

    // Day at a glance - gantt
    sectionTitle("Your day at a glance", `${safe(dayStart)} to ${safe(dayEnd)}`);
    const trackY = y + 1;
    const trackH = 13;
    const tx = (t) => M + (clamp(t, ds, de) - ds) / windowMin * CW;
    box(M, trackY, CW, trackH, C.slate100, { r: 3, stroke: C.slate200 });

    const segs = [];
    stops.forEach((s, i) => {
      if (i > 0 && transfers[i - 1]) {
        const a = toMin(transfers[i - 1].departure_time);
        const b = toMin(transfers[i - 1].arrival_time);
        if (a !== null && b !== null) segs.push({ a, b, color: C.blue });
      }
      const a = toMin(s.arrival);
      const b = toMin(s.departure);
      const wait = Number(s.wait_minutes) || 0;
      if (a !== null && wait > 0) segs.push({ a: a - wait, b: a, color: C.amber });
      if (a !== null && b !== null) segs.push({ a, b, color: C.green, idx: i + 1 });
    });
    segs.forEach((s) => {
      const x0 = tx(s.a);
      const w = Math.max(0.9, tx(s.b) - x0);
      doc.setFillColor(...s.color);
      doc.rect(x0, trackY + 1.5, w, trackH - 3, "F");
      if (s.idx && w > 6) txt(String(s.idx), x0 + w / 2, trackY + trackH / 2 + 1.7, { size: 7, bold: true, color: C.white, align: "center" });
    });

    const tickStep = windowMin > 600 ? 120 : 60;
    for (let t = Math.ceil(ds / tickStep) * tickStep; t <= de; t += tickStep) {
      const x = tx(t);
      line(x, trackY + trackH, x, trackY + trackH + 1.6, C.slate400, 0.3);
      const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
      txt(`${hh}:${String(t % 60).padStart(2, "0")}`, x, trackY + trackH + 5, { size: 5.8, color: C.slate500, align: "center" });
    }
    y = trackY + trackH + 10;

    const legend = [
      ["Activity", C.green],
      ["Travel", C.blue],
      ["Wait", C.amber],
      ["Free time", C.slate200],
    ];
    let lx = M;
    legend.forEach(([label, col]) => {
      box(lx, y - 2.6, 3.2, 3.2, col, { r: 0.8 });
      txt(label, lx + 5, y, { size: 6.3, color: C.slate600 });
      lx += 24;
    });
    txt(`${fmtMin(Math.max(0, windowMin - used.minutes))} of free buffer in your day window`, W - M, y, {
      size: 6.3,
      color: C.slate500,
      align: "right",
    });
    y += 11;

    // Trip configuration
    sectionTitle("Trip configuration");
    const cw3 = (CW - gap * 2) / 3;
    const cfg = [
      ["DATE", safe(dayDate)],
      ["DAY WINDOW", `${safe(dayStart)} to ${safe(dayEnd)}`],
      ["TRANSPORT", transportText],
      ["BUDGET LIMIT", budgetLimit ? money(budgetLimit) : "No limit"],
      ["CARBON LIMIT", carbonLimit ? carbon(carbonLimit) : "No limit"],
      ["ATTRACTIONS", `${safe(summary.stops_count, stops.length)} selected`],
    ];
    cfg.forEach((c, i) => {
      const x = M + (i % 3) * (cw3 + gap);
      const cy = y + Math.floor(i / 3) * 21;
      box(x, cy, cw3, 17, C.slate50, { r: 3.5, stroke: C.slate200 });
      txt(c[0], x + 6, cy + 6.5, { size: 5.6, bold: true, color: C.slate400 });
      txt(c[1], x + 6, cy + 12.5, { size: 8, bold: true, color: C.slate800, maxW: cw3 - 12 });
    });
    y += 48;

    // Priorities
    sectionTitle("Optimization priorities");
    const pr = [
      { label: "COST", value: Math.round((weights?.cost || 0) * 100), color: C.green },
      { label: "TIME", value: Math.round((weights?.time || 0) * 100), color: C.blue },
      { label: "CARBON", value: Math.round((weights?.carbon || 0) * 100), color: C.greenDark },
    ];
    pr.forEach((p, i) => {
      const x = M + i * (cw3 + gap);
      txt(p.label, x, y + 2, { size: 5.8, bold: true, color: C.slate500 });
      txt(`${p.value}%`, x + cw3, y + 2, { size: 9, bold: true, color: p.color, align: "right" });
      bar(x, y + 5, cw3, 3, p.value / 100, p.color);
    });
    const top = [...pr].sort((a, b) => b.value - a.value)[0];
    txt(`The optimizer leaned toward ${top.label.toLowerCase()} (${top.value}%) whenever options traded off.`, M, y + 16, {
      size: 7.5,
      color: C.slate600,
    });

    // ==========================================================
    // PAGE 2 - ITINERARY (auto-paginates)
    // ==========================================================
    const SEC2 = "CHRONOLOGICAL ITINERARY";
    newPage(SEC2);
    txt("Your journey", M, y + 4, { size: 21, bold: true, color: C.navy });
    y += 11;
    txt(`${stops.length} attractions  |  ${transfers.length} transfers  |  ${fmtMin(used.minutes)} total`, M, y, {
      size: 8,
      color: C.slate500,
    });
    y += 10;

    const railX = 31;
    const cardX = 41;
    const cardW = W - M - cardX;
    const GAP = 4;
    let pageTop = y;

    const elements = [];
    stops.forEach((s, i) => {
      if (i > 0) elements.push({ type: "t", data: transfers[i - 1], i: i - 1 });
      elements.push({ type: "s", data: s, i });
    });

    elements.forEach((el, ei) => {
      const isFirst = ei === 0;
      const isLast = ei === elements.length - 1;

      if (el.type === "t") {
        const t = el.data;
        if (!t) return;
        const issue = transferIssue(t);
        const h = issue ? 19 : 12;
        if (ensure(h + GAP, SEC2)) pageTop = y;
        const cy = y;

        line(railX, Math.max(cy - GAP, pageTop), railX, cy + h + GAP, C.green, 1);
        doc.setFillColor(...C.white);
        doc.circle(railX, cy + 6, 2.6, "F");
        doc.setFillColor(...C.blue);
        doc.circle(railX, cy + 6, 1.5, "F");

        box(cardX, cy, cardW, h, issue ? C.amberSoft : C.slate50, { r: 3, stroke: issue ? C.amberBorder : C.slate200 });
        const mode = String(t.mode || "Transit").toUpperCase();
        const isWalk = mode.includes("WALK");
        const pw = pill(mode, cardX + 5, cy + 3, isWalk ? C.greenSoft : C.blueSoft, isWalk ? C.greenDark : C.blue);
        txt(`${safe(t.departure_time)} - ${safe(t.arrival_time)}`, cardX + pw + 10, cy + 7.2, {
          size: 7,
          bold: true,
          color: C.slate800,
        });
        txt(
          `${Math.round(Number(t.minutes) || 0)} min  |  ${km(t.distance_km)}  |  ${money(t.cost)}  |  ${carbon(t.carbon_kg)}`,
          cardX + cardW - 5,
          cy + 7.2,
          { size: 6.5, color: C.slate600, align: "right" }
        );
        if (issue) {
          icon(cardX + 8, cy + 14.2, "warn");
          doc.setFillColor(...C.amber);
          wrap(issue, cardW - 24, 6.2, true)
            .slice(0, 1)
            .forEach((l) => txt(l, cardX + 15, cy + 15, { size: 6.2, bold: true, color: C.amber }));
        }
        y += h + GAP;
        return;
      }

      // ---- STOP ----
      const s = el.data;
      const i = el.i;
      const banners = [];
      if (Number(s.wait_minutes) > 0) {
        banners.push({ text: `WAIT ${Math.round(s.wait_minutes)} min  |  Opens at ${safe(s.opens_at)}`, bg: C.amberSoft, fg: C.amber });
      }
      if (stopHoursBad[i]) {
        banners.push({ text: "VISIT FALLS OUTSIDE OPENING HOURS", bg: C.redSoft, fg: C.red });
      }
      const h = 38 + banners.length * 8;
      if (ensure(h + GAP, SEC2)) pageTop = y;
      const cy = y;

      line(railX, isFirst ? cy + 8 : Math.max(cy - GAP, pageTop), railX, isLast ? cy + 8 : cy + h + GAP, C.green, 1);

      // times to the left of the rail
      txt(safe(s.arrival), M, cy + 7.6, { size: 7, bold: true, color: C.greenDark });
      txt(safe(s.departure), M, cy + 12.2, { size: 6.3, color: C.slate400 });

      doc.setFillColor(...C.white);
      doc.circle(railX, cy + 8, 6.4, "F");
      doc.setFillColor(...C.green);
      doc.circle(railX, cy + 8, 5.2, "F");
      txt(String(i + 1), railX, cy + 10.3, { size: 8, bold: true, color: C.white, align: "center" });

      box(cardX + 0.5, cy + 0.8, cardW, h, C.slate100, { r: 4 }); // shadow
      box(cardX, cy, cardW, h, C.white, { r: 4, stroke: C.slate200 });
      box(cardX, cy + 5, 1.6, 12, C.green, { r: 0.8 });

      let catW = 0;
      if (s.category) catW = pill(String(s.category).toUpperCase(), cardX + cardW - 6, cy + 5, C.greenSoft, C.greenDark, "right");
      txt(s.name, cardX + 7, cy + 10.5, { size: 10.5, bold: true, color: C.navy, maxW: cardW - 20 - catW });
      txt(`${fmtMin(s.duration_minutes)} visit`, cardX + 7, cy + 17, { size: 7, color: C.slate500 });

      line(cardX + 7, cy + 22, cardX + cardW - 7, cy + 22, C.slate200, 0.3);

      const mw = (cardW - 14) / 3;
      const metrics = [
        ["ENTRY", Number(s.entry_cost) > 0 ? money(s.entry_cost) : "FREE"],
        ["CARBON", carbon(s.carbon_kg)],
        ["OPEN HOURS", s.opens_at && s.closes_at ? `${s.opens_at} - ${s.closes_at}` : "Not listed"],
      ];
      metrics.forEach((m, mi) => {
        const mx = cardX + 7 + mi * mw;
        txt(m[0], mx, cy + 28, { size: 5.6, bold: true, color: C.slate400 });
        txt(m[1], mx, cy + 34, { size: 7.4, bold: true, color: C.slate800, maxW: mw - 3 });
      });

      banners.forEach((b, bi) => {
        const by = cy + 38 + bi * 8 - 1;
        box(cardX + 7, by, cardW - 14, 6.4, b.bg, { r: 2 });
        txt(b.text, cardX + 11, by + 4.4, { size: 5.8, bold: true, color: b.fg });
      });

      y += h + GAP + 3;
    });

    // ==========================================================
    // PAGE 3 - INTELLIGENCE
    // ==========================================================
    const SEC3 = "PLAN INTELLIGENCE";
    newPage(SEC3);
    pill("AI CONCIERGE", M, y - 4, C.blueSoft, C.blue);
    y += 9;
    txt("Why this plan works", M, y + 4, { size: 21, bold: true, color: C.navy });
    y += 12;

    const insight = clean(
      aiNarrative || "Your itinerary was optimized across cost, time and carbon while respecting every configured constraint."
    );
    const iLines = wrap(insight, CW - 24, 8.5);
    const iH = Math.max(34, iLines.length * 4.7 + 22);
    ensure(iH + 8, SEC3);
    box(M, y, CW, iH, C.greenSoft, { r: 5, stroke: C.greenBorder });
    box(M, y + 6, 2, iH - 12, C.green, { r: 1 });
    txt("OPTIMIZER INSIGHT", M + 10, y + 10, { size: 6.5, bold: true, color: C.greenDark });
    iLines.forEach((l, li) => txt(l, M + 10, y + 17 + li * 4.7, { size: 8.5, color: C.slate700 }));
    y += iH + 12;

    // Constraint verification
    ensure(24, SEC3);
    sectionTitle("Constraint verification");
    y += 2;
    const timeOk = used.minutes <= windowMin;
    const budgetOk = !budgetLimit || used.cost <= budgetLimit;
    const carbonOk = !carbonLimit || used.carbon <= carbonLimit;
    const hoursOk = !stopHoursBad.some(Boolean);
    const mustOk = missingMust.length === 0;
    const checks = [
      { label: "TIME WINDOW", value: `${fmtMin(used.minutes)} / ${fmtMin(windowMin)}`, pct: used.minutes / windowMin, state: timeOk ? "ok" : "fail" },
      { label: "BUDGET", value: budgetLimit ? `${money(used.cost)} / ${money(budgetLimit)}` : money(used.cost), pct: budgetLimit ? used.cost / budgetLimit : null, state: budgetOk ? "ok" : "fail" },
      { label: "CARBON", value: carbonLimit ? `${carbon(used.carbon)} / ${carbon(carbonLimit)}` : carbon(used.carbon), pct: carbonLimit ? used.carbon / carbonLimit : null, state: carbonOk ? "ok" : "fail" },
      { label: "OPENING HOURS", value: hoursOk ? `${stops.length} of ${stops.length} stops open on arrival` : `${stopHoursBad.filter(Boolean).length} stop(s) conflict`, pct: null, state: hoursOk ? "ok" : "fail" },
      { label: "MANDATORY STOPS", value: mustOk ? `${requiredIds.length} required, all included` : `${missingMust.length} of ${requiredIds.length} missing`, pct: null, state: mustOk ? "ok" : "fail" },
      { label: "TRANSFER REALISM", value: issues.length ? `${issues.length} item(s) need review` : "All transfers look realistic", pct: null, state: issues.length ? "warn" : "ok" },
    ];
    const vw = (CW - gap) / 2;
    checks.forEach((c, i) => {
      const x = M + (i % 2) * (vw + gap);
      if (i % 2 === 0) ensure(26, SEC3);
      const cy = y;
      const bg = c.state === "ok" ? C.greenSoft : c.state === "warn" ? C.amberSoft : C.redSoft;
      const bd = c.state === "ok" ? C.greenBorder : c.state === "warn" ? C.amberBorder : C.redBorder;
      const fg = c.state === "ok" ? C.greenDark : c.state === "warn" ? C.amber : C.red;
      box(x, cy, vw, 23, bg, { r: 4, stroke: bd });
      icon(x + 9, cy + 9, c.state);
      txt(c.label, x + 17, cy + 8, { size: 5.8, bold: true, color: C.slate500 });
      txt(c.value, x + 17, cy + 14.2, { size: 7.4, bold: true, color: C.slate800, maxW: vw - 44 });
      pill(c.state === "ok" ? "SATISFIED" : c.state === "warn" ? "REVIEW" : "EXCEEDED", x + vw - 5, cy + 5, C.white, fg, "right", 5.6);
      if (c.pct !== null) bar(x + 17, cy + 18, vw - 26, 2, c.pct, gaugeColor(c.pct, C.green), C.white);
      if (i % 2 === 1 || i === checks.length - 1) y += 27;
    });
    y += 4;

    // Needs review
    if (issues.length) {
      ensure(20, SEC3);
      sectionTitle("Needs review before you travel");
      issues.forEach((msg) => {
        const lines = wrap(msg, CW - 22, 7.2);
        const h = lines.length * 4 + 8;
        ensure(h + 3, SEC3);
        box(M, y, CW, h, C.amberSoft, { r: 3.5, stroke: C.amberBorder });
        icon(M + 8, y + h / 2, "warn");
        lines.forEach((l, li) => txt(l, M + 16, y + 6 + li * 4, { size: 7.2, color: C.slate800 }));
        y += h + 3;
      });
      y += 5;
    }

    // Spend breakdown
    ensure(30, SEC3);
    sectionTitle("Where your budget and carbon go");
    txt("STOP", M + 2, y + 2, { size: 5.6, bold: true, color: C.slate400 });
    txt("ENTRY COST", M + 62, y + 2, { size: 5.6, bold: true, color: C.slate400 });
    txt("CARBON", M + 122, y + 2, { size: 5.6, bold: true, color: C.slate400 });
    y += 5;
    const totalEntry = stops.reduce((a, s) => a + (Number(s.entry_cost) || 0), 0) || 1;
    const totalCarbon = stops.reduce((a, s) => a + (Number(s.carbon_kg) || 0), 0) || 1;
    stops.forEach((s, i) => {
      ensure(10, SEC3);
      if (i % 2 === 0) box(M, y, CW, 9, C.slate50, { r: 2 });
      txt(`${i + 1}. ${s.name}`, M + 2, y + 5.8, { size: 7.2, bold: true, color: C.slate800, maxW: 56 });
      const ec = Number(s.entry_cost) || 0;
      const cb = Number(s.carbon_kg) || 0;
      txt(ec > 0 ? money(ec) : "FREE", M + 62, y + 5.8, { size: 6.6, color: C.slate700 });
      bar(M + 77, y + 3.6, 40, 2.6, ec / totalEntry, C.green);
      txt(carbon(cb), M + 122, y + 5.8, { size: 6.6, color: C.slate700 });
      bar(M + 141, y + 3.6, 37, 2.6, cb / totalCarbon, C.greenDark);
      y += 9;
    });
    y += 10;

    // Final summary
    ensure(40, SEC3);
    box(M, y, CW, 36, C.navy, { r: 6 });
    doc.setFillColor(...C.navy2);
    doc.circle(W - M - 4, y + 2, 20, "F");
    box(W - M - 24, y + 22, 24, 14, C.navy, { r: 6 });
    icon(M + 11, y + 11, "ok");
    txt("Plan complete", M + 20, y + 11.5, { size: 12, bold: true, color: C.white });
    txt("A constraint-aware itinerary generated by ReRoute.", M + 20, y + 17, { size: 6.8, color: C.slate300 });
    [
      ["STOPS", safe(summary.stops_count, stops.length)],
      ["TIME", fmtMin(used.minutes)],
      ["COST", money(used.cost)],
      ["CARBON", carbon(used.carbon)],
    ].forEach((f, i) => {
      const fx = M + 10 + i * 42;
      txt(f[0], fx, y + 26, { size: 5.5, bold: true, color: C.slate400 });
      txt(f[1], fx, y + 32, { size: 8.5, bold: true, color: C.white });
    });

    // ==========================================================
    // FOOTERS ("Page X of N" on every page)
    // ==========================================================
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      line(M, H - 14, W - M, H - 14, C.slate200, 0.4);
      txt("ReRoute  |  Multi-Objective Itinerary Optimizer", M, H - 8, { size: 6.3, color: C.slate400 });
      txt(`Page ${p} of ${total}`, W - M, H - 8, { size: 6.3, color: C.slate400, align: "right" });
    }

    doc.setProperties({
      title: `ReRoute - ${cityName} ${dateText}`,
      subject: "Optimized day itinerary",
      creator: "ReRoute",
    });

    doc.save(`ReRoute-${slugify(cityName)}-${dayDate || "plan"}.pdf`);
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
            हिन्दी
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
                    {t.selectedPlace}
                  </span>
                  <h3>
                    📍 {selectedPoi.name}
                  </h3>

                  <p>
                    {
                      selectedPoi.poi_category ||
                      "Attraction"
                    }

                    {"\u0020\u2022\u0020"}

                    {
                      selectedPoi.typical_duration_minutes ||
                      0
                    }

                    {" "}{t.min}

                    {
                      selectedPoi.entry_cost ||
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

                      {" \u2013 "}

                      {
                        selectedPoi.closes_at ||
                        "--"
                      }
                    </span>

                    <span>
                      🌱{" "}
                      {
                        selectedPoi.carbon_kg ||
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
                    {t.setAsStart}
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleSetSelectedAsEnd
                    }
                  >
                    {t.setAsEnd}
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
                        ? "? Must-see"
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
            disabled={isLoading && !isReoptimizing}
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

                  {"\u0020\u2022\u0020"}

                  {dayDate}

                </span>
              )}

            </div>

            {result && (
              <div className="results-header-actions">

                {/* Download Plan */}

                {result.feasible && (
                  <button
                    type="button"
                    className="download-plan-btn"
                    onClick={handleDownloadPlan}
                  >
                    <Download size={16} />
                    <span>Download Plan</span>
                  </button>
                )}

                {/* Status */}

                <span
                  className={
                    `status-pill ${result.feasible
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

              </div>
            )}

          </div>

          {/* ==================================================
              REOPTIMIZATION STATUS
          ================================================== */}

          {isReoptimizing && result && (
            <div className="reoptimization-status" role="status" aria-live="polite">

              <RefreshCw
                size={15}
                className="spin"
              />

              <span>
                {t.reoptimizing}
              </span>

            </div>
          )}

          {/* ==================================================
              LOADING
          ================================================== */}

          {isLoading && !isReoptimizing && (
            <div className="optimizing-overlay">

              <RefreshCw
                size={28}
                className="spin accent-spin"
              />

              <h4>
                {loadingStepText}
              </h4>

              <p>
                {t.evaluatingTravel}
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
                            ? t.smartGroundedExplanation
                            : t.aiConciergeInsight
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
                          {t.optimizedPlacesMap}
                        </h4>

                        <p className="section-subtitle">
                          {t.optimizedPlacesDescription}
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

                      {"\u0020\u2022\u0020"}

                      {
                        result.stops
                          ?.length || 0
                      }

                      {" Attractions \u2022 "}

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
                  {t.readyToCraft}
                </h3>

                <p>
                  {t.readyToCraftDescription}
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

                      {" \u2013 "}

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
                      Budget limit: {"\u20B9"}
                      {
                        result.summary
                          ?.cost
                      }

                      {" / \u20B9"}

                      {
                        budgetCap ||
                        "\u221E"
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
                        "\u221E"
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