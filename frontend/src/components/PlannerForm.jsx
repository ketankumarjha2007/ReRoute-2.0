import React, { useState } from 'react';

import {
  Search,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Leaf,
  Check,
  X,
  Loader2,
  ArrowRight,
  RotateCcw,
  Navigation,
  Flag,
  Footprints,
  Car,
} from 'lucide-react';

import { planMyDay } from '../services/api';

export default function PlannerForm({
  cities = [],
  selectedCityId,
  onCityChange,

  pois = [],

  dayDate,
  setDayDate,

  dayStart,
  setDayStart,

  dayEnd,
  setDayEnd,

  budgetCap,
  setBudgetCap,

  carbonCap,
  setCarbonCap,

  mustSeePoiIds,
  setMustSeePoiIds,

  // Route controls
  startPoiId,
  setStartPoiId,

  endPoiId,
  setEndPoiId,

  allowedModes,
  setAllowedModes,

  // Optional - AI can seed optimization weights
  setWeights,

  onOptimize,
  isLoading,

  onAiPlanComplete,

  language = 'en',
}) {
  const [poiSearch, setPoiSearch] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState('all');

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccessMessage, setAiSuccessMessage] =
    useState('');

  // ============================================================
  // AI QUICK SUGGESTIONS
  // ============================================================

  const suggestions = [
    {
      label: 'Low-carbon day',
      prompt:
        'Plan a low-carbon day in Bengaluru from 08:00 to 20:00. Choose practical start and end locations, prioritize walking, and prefer green attractions.',
    },
    {
      label: 'Budget-friendly',
      prompt:
        'Plan a budget-friendly day in Bengaluru from 08:00 to 20:00 under ₹1200. Choose practical start and end locations, cultural sights and parks, and prefer low-cost transport.',
    },
    {
      label: 'Fastest day',
      prompt:
        'Plan a fast, time-efficient day in Bengaluru from 08:00 to 18:00. Choose practical start and end locations and prioritize the shortest feasible travel time.',
    },
    {
      label: 'Must-see highlights',
      prompt:
        'Plan a day in Bengaluru from 08:00 to 20:00 covering the most important landmarks and historic attractions. Choose practical start and end locations.',
    },
  ];

  // ============================================================
  // TRANSLATIONS
  // ============================================================

  const t = {
    en: {
      planYourDay: 'PLAN YOUR ROUTE',

      planSubtitle:
        'Configure constraints or use the AI concierge to seed your day.',

      aiHeader: 'AI PLAN MY DAY',

      aiPlaceholder:
        'What does your ideal day look like? (e.g. "Low carbon day in Bengaluru under 1500...")',

      aiBtn: 'Plan My Day',

      aiThinking:
        'AI Concierge is reasoning about your day...',

      destination: 'Destination City',

      date: 'Date of Travel',

      startTime: 'Day Start Time',

      endTime: 'Day End Time',

      budget: 'Budget Cap',

      carbon: 'Carbon Cap (kg CO₂)',

      route: 'ROUTE CONFIGURATION',

      routeSubtitle:
        'Define the hard start, end and transport constraints.',

      hardConstraints: 'HARD CONSTRAINTS',

      startLocation: 'Start Location',

      endLocation: 'End Location',

      startHint:
        'Where your itinerary begins',

      endHint:
        'Where your itinerary finishes',

      selectStart:
        'Select start location',

      selectEnd:
        'Select end location',

      transport: 'ALLOWED TRANSPORT MODES',

      selected: 'selected',

      walk: 'Walk',

      cab: 'Cab',

      bus: 'Bus',

      metro: 'Metro',

      mustSee:
        'Must-See Attractions (Hard Constraints)',

      searchPois:
        'Filter attractions by name or tag...',

      allCats: 'All Categories',

      selectedCount:
        'selected (strictly enforced)',

      optimizeBtn:
        'Optimize My Route',

      optimizingBtn:
        'Optimizing Route...',

      clearBtn:
        'Clear AI Prompt',

      minutes: 'min',

      start: 'START',

      end: 'END',

      maximumBudget:
        'Maximum: ₹1,00,000',

      maximumCarbon:
        'Maximum: 1,000 kg CO₂',
    },

    hi: {
      planYourDay:
        'यात्रा की योजना बनाएँ',

      planSubtitle:
        'प्रतिबंध निर्धारित करें या AI सहायक की मदद से अपनी यात्रा की योजना बनाएँ।',

      aiHeader:
        'AI यात्रा योजना',

      aiPlaceholder:
        'आपका आदर्श दिन कैसा दिखता है?',

      aiBtn:
        'दिन की योजना बनाएँ',

      aiThinking:
        'AI सहायक आपकी यात्रा की योजना बना रहा है...',

      destination:
        'गंतव्य शहर',

      date:
        'यात्रा की तारीख',

      startTime:
        'दिन शुरू होने का समय',

      endTime:
        'दिन समाप्त होने का समय',

      budget:
        'बजट सीमा (₹)',

      carbon:
        'कार्बन सीमा (kg CO₂)',

      route:
        'मार्ग कॉन्फ़िगरेशन',

      routeSubtitle:
        'प्रारंभ, अंतिम स्थान और परिवहन की अनिवार्य सीमाएँ निर्धारित करें।',

      hardConstraints:
        'हार्ड प्रतिबंध',

      startLocation:
        'प्रारंभ स्थान',

      endLocation:
        'अंतिम स्थान',

      startHint:
        'यात्रा यहाँ से शुरू होगी',

      endHint:
        'यात्रा यहाँ समाप्त होगी',

      selectStart:
        'प्रारंभ स्थान चुनें',

      selectEnd:
        'अंतिम स्थान चुनें',

      transport:
        'अनुमत परिवहन साधन',

      selected:
        'चयनित',

      walk:
        'पैदल',

      cab:
        'कैब',

      bus:
        'बस',

      metro:
        'मेट्रो',

      mustSee:
        'अनिवार्य आकर्षण (हार्ड प्रतिबंध)',

      searchPois:
        'आकर्षण खोजें...',

      allCats:
        'सभी श्रेणियाँ',

      selectedCount:
        'चयनित (अनिवार्य)',

      optimizeBtn:
        'मार्ग अनुकूलित करें',

      optimizingBtn:
        'मार्ग अनुकूलित हो रहा है...',

      clearBtn:
        'AI प्रॉम्प्ट साफ़ करें',

      minutes: 'मिनट',

      start: 'प्रारंभ',

      end: 'अंत',

      maximumBudget:
        'अधिकतम: ₹1,00,000',

      maximumCarbon:
        'अधिकतम: 1,000 kg CO₂',
    },
  }[language] || null;

  // ============================================================
  // CATEGORIES
  // ============================================================

  const categories = [
    'all',
    ...Array.from(
      new Set(
        pois
          .map((poi) => poi.poi_category)
          .filter(Boolean)
      )
    ),
  ];

  // ============================================================
  // FILTER POIs
  // ============================================================

  const filteredPois = pois.filter((poi) => {
    const query =
      poiSearch.trim().toLowerCase();

    const matchesSearch =
      query === '' ||
      String(poi.name || '')
        .toLowerCase()
        .includes(query) ||
      (
        poi.tags &&
        String(poi.tags)
          .toLowerCase()
          .includes(query)
      );

    const matchesCategory =
      selectedCategory === 'all' ||
      poi.poi_category ===
      selectedCategory;

    return (
      matchesSearch &&
      matchesCategory
    );
  });

  // ============================================================
  // MUST-SEE TOGGLE
  // ============================================================

  const toggleMustSee = (poiId) => {
    if (
      mustSeePoiIds.includes(poiId)
    ) {
      setMustSeePoiIds(
        mustSeePoiIds.filter(
          (id) => id !== poiId
        )
      );
    } else {
      setMustSeePoiIds([
        ...mustSeePoiIds,
        poiId,
      ]);
    }
  };

  // ============================================================
  // TRANSPORT MODE TOGGLE
  // ============================================================

  const toggleTransportMode = (
    mode
  ) => {
    const currentModes =
      allowedModes || [];

    if (
      currentModes.includes(mode)
    ) {
      // Never allow zero transport
      // modes.
      if (
        currentModes.length === 1
      ) {
        return;
      }

      setAllowedModes(
        currentModes.filter(
          (item) => item !== mode
        )
      );
    } else {
      setAllowedModes([
        ...currentModes,
        mode,
      ]);
    }
  };

  // ============================================================
  // AI SUGGESTION
  // ============================================================

  const handleSelectSuggestion = (
    promptText
  ) => {
    setAiPrompt(promptText);
    setAiError('');
    setAiSuccessMessage('');
  };

  // ============================================================
  // AI PLAN MY DAY
  // ============================================================

  const handleAiPlanMyDay = async (
    event
  ) => {
    if (event) {
      event.preventDefault();
    }

    if (!aiPrompt.trim()) {
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiSuccessMessage('');

    try {
      const data = await planMyDay(
        aiPrompt,
        selectedCityId,
        {
          day_date: dayDate,

          day_start: dayStart,
          day_end: dayEnd,

          budget_cap:
            budgetCap !== ''
              ? Number(budgetCap)
              : null,

          carbon_cap_kg:
            carbonCap !== ''
              ? Number(carbonCap)
              : null,

          start_poi_id:
            startPoiId || null,

          end_poi_id:
            endPoiId || null,

          must_see_poi_ids:
            Array.isArray(mustSeePoiIds)
              ? mustSeePoiIds
              : [],

          allowed_modes:
            Array.isArray(allowedModes)
              ? allowedModes
              : []
        }
      );

      if (
        data &&
        data.success
      ) {
        // ------------------------------------------------------
        // CITY
        // ------------------------------------------------------

        if (
          data.city?.city_id
        ) {
          onCityChange(
            data.city.city_id
          );
        }

        // ------------------------------------------------------
        // BASIC CONSTRAINTS
        // ------------------------------------------------------

        if (
          data.parsed_intent?.budget_cap !==
          undefined &&
          data.parsed_intent?.budget_cap !==
          null &&
          data.parsed_intent?.budget_cap !==
          ''
        ) {
          setBudgetCap(
            String(
              data.parsed_intent
                .budget_cap
            )
          );
        }

        if (
          data.parsed_intent?.carbon_cap_kg !==
          undefined &&
          data.parsed_intent?.carbon_cap_kg !==
          null &&
          data.parsed_intent?.carbon_cap_kg !==
          ''
        ) {
          setCarbonCap(
            String(
              data.parsed_intent
                .carbon_cap_kg
            )
          );
        }

        if (
          data.parsed_intent
            ?.day_start
        ) {
          setDayStart(
            data.parsed_intent
              .day_start
          );
        }

        if (
          data.parsed_intent
            ?.day_end
        ) {
          setDayEnd(
            data.parsed_intent
              .day_end
          );
        }

        // ------------------------------------------------------
        // MUST-SEE POIs
        // ------------------------------------------------------

        if (
          Array.isArray(
            data.parsed_intent
              ?.must_see_poi_ids
          )
        ) {
          setMustSeePoiIds(
            data.parsed_intent
              .must_see_poi_ids
          );
        }

        // ------------------------------------------------------
        // DATE
        // ------------------------------------------------------

        if (
          data.parsed_intent?.day_date
        ) {
          setDayDate(
            data.parsed_intent.day_date
          );
        }

        // ------------------------------------------------------
        // AI -> START LOCATION
        // ------------------------------------------------------

        if (
          data.parsed_intent
            ?.start_poi_id
        ) {
          setStartPoiId(
            data.parsed_intent
              .start_poi_id
          );
        }

        // ------------------------------------------------------
        // AI -> END LOCATION
        // ------------------------------------------------------

        if (
          data.parsed_intent
            ?.end_poi_id
        ) {
          setEndPoiId(
            data.parsed_intent
              .end_poi_id
          );
        }

        // ------------------------------------------------------
        // AI -> TRANSPORT MODES
        // ------------------------------------------------------

        const aiAllowedModes =
          data.parsed_intent
            ?.allowed_modes ||
          data.parsed_intent
            ?.transport_modes ||
          data.parsed_intent
            ?.modes;

        if (
          Array.isArray(
            aiAllowedModes
          ) &&
          aiAllowedModes.length > 0
        ) {
          const validModes = [
            'walk',
            'cab',
            'bus',
            'metro',
          ];

          const normalizedModes =
            aiAllowedModes
              .map((mode) =>
                String(mode)
                  .trim()
                  .toLowerCase()
              )
              .filter((mode) =>
                validModes.includes(
                  mode
                )
              );

          if (
            normalizedModes.length > 0
          ) {
            setAllowedModes(
              Array.from(
                new Set(
                  normalizedModes
                )
              )
            );
          }
        }

        // ------------------------------------------------------
        // AI -> OPTIMIZATION WEIGHTS
        // ------------------------------------------------------

        if (
          typeof setWeights ===
          'function' &&
          data.parsed_intent
            ?.weights
        ) {
          const aiWeights =
            data.parsed_intent
              .weights;

          const cost =
            Number(
              aiWeights.cost
            );

          const time =
            Number(
              aiWeights.time
            );

          const carbon =
            Number(
              aiWeights.carbon
            );

          if (
            Number.isFinite(cost) &&
            Number.isFinite(time) &&
            Number.isFinite(carbon) &&
            cost >= 0 &&
            time >= 0 &&
            carbon >= 0 &&
            cost + time + carbon > 0
          ) {
            setWeights({
              cost,
              time,
              carbon,
            });
          }
        }

        // ------------------------------------------------------
        // AI STATUS
        // ------------------------------------------------------

        if (
          data.ai_status?.fallback
        ) {
          setAiSuccessMessage(
            'AI is temporarily unavailable. ReRoute is using smart fallback planning.'
          );
        } else {
          setAiSuccessMessage(
            data.ai_status?.message ||
            'AI planned your day based on your preferences!'
          );
        }

        // ------------------------------------------------------
        // CALLBACK
        // ------------------------------------------------------

        if (
          onAiPlanComplete
        ) {
          onAiPlanComplete(data);
        }
      } else {
        throw new Error(
          data?.error ||
          'Failed to generate itinerary plan.'
        );
      }
    } catch (err) {
      console.error(
        'Plan my day error:',
        err
      );

      setAiError(
        err.message ||
        'Could not complete AI planning request.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  // ============================================================
  // TRANSPORT OPTIONS
  // ============================================================

  // ReRoute currently supports only transport modes
  // that are backed by the APS-09 travel matrix.

  const transportOptions = [
    {
      id: 'walk',
      label: t.walk,
      icon: Footprints,
    },
    {
      id: 'cab',
      label: t.cab,
      icon: Car,
    },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="planner-form-card">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="form-header">

        <h2 className="form-main-title">
          {t.planYourDay}
        </h2>

        <p className="form-subtitle">
          {t.planSubtitle}
        </p>

      </div>

      {/* ======================================================
          AI CONCIERGE
      ====================================================== */}

      <div className="ai-concierge-panel">

        <div className="ai-panel-header">

          <div className="ai-panel-title">

            <Sparkles
              size={16}
              className="ai-sparkle-icon"
            />

            <span>
              {t.aiHeader}
            </span>

          </div>

          {aiPrompt && (
            <button
              type="button"
              className="ai-clear-btn"
              onClick={() => {
                setAiPrompt('');
                setAiError('');
                setAiSuccessMessage('');
              }}
              title={t.clearBtn}
            >
              <RotateCcw size={13} />
              <span>Clear</span>
            </button>
          )}

        </div>

        <form
          onSubmit={
            handleAiPlanMyDay
          }
          className="ai-input-form"
        >

          <div className="ai-input-wrapper">

            <textarea
              rows={2}
              className="ai-textarea"
              placeholder={
                t.aiPlaceholder
              }
              value={aiPrompt}
              onChange={(event) =>
                setAiPrompt(
                  event.target.value
                )
              }
              disabled={aiLoading}
            />

          </div>

          {/* Suggestions */}

          <div className="ai-suggestions-row">

            {suggestions.map(
              (suggestion) => (
                <button
                  key={
                    suggestion.label
                  }
                  type="button"
                  className="ai-suggestion-chip"
                  onClick={() =>
                    handleSelectSuggestion(
                      suggestion.prompt
                    )
                  }
                >
                  {
                    suggestion.label
                  }
                </button>
              )
            )}

          </div>

          <div className="ai-action-row">

            <button
              type="submit"
              disabled={
                aiLoading ||
                !aiPrompt.trim()
              }
              className="btn-ai-plan"
            >

              {aiLoading ? (
                <>
                  <Loader2
                    size={16}
                    className="spin"
                  />

                  <span>
                    {t.aiThinking}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles
                    size={16}
                  />

                  <span>
                    {t.aiBtn}
                  </span>
                </>
              )}

            </button>

          </div>

        </form>

        {aiError && (
          <div className="ai-status-banner error">
            <span>
              {aiError}
            </span>
          </div>
        )}

        {aiSuccessMessage && (
          <div className="ai-status-banner success">

            <Check size={14} />

            <span>
              {aiSuccessMessage}
            </span>

          </div>
        )}

      </div>

      {/* ======================================================
          BASIC CONSTRAINTS
      ====================================================== */}

      <div className="form-grid">

        {/* Destination */}

        <div className="form-field full-width">

          <label className="field-label">

            <MapPin size={14} />

            <span>
              {t.destination}
            </span>

          </label>

          <div className="select-wrapper">

            <select
              value={
                selectedCityId
              }
              onChange={(event) =>
                onCityChange(
                  event.target.value
                )
              }
              className="form-select"
            >

              {cities.map(
                (city) => (
                  <option
                    key={
                      city.city_id
                    }
                    value={
                      city.city_id
                    }
                  >
                    {city.name}

                    {city.state
                      ? ` (${city.state})`
                      : ''}

                    {' • '}

                    {city.region ||
                      'India'}

                  </option>
                )
              )}

            </select>

          </div>

        </div>

        {/* Date */}

        <div className="form-field">

          <label className="field-label">

            <Calendar size={14} />

            <span>
              {t.date}
            </span>

          </label>

          <input
            type="date"
            value={dayDate}
            min={
              new Date()
                .toISOString()
                .split('T')[0]
            }
            onChange={(event) =>
              setDayDate(
                event.target.value
              )
            }
            className="form-input"
          />

        </div>

        {/* Start Time */}

        <div className="form-field">

          <label className="field-label">

            <Clock size={14} />

            <span>
              {t.startTime}
            </span>

          </label>

          <input
            type="time"
            value={dayStart}
            onChange={(event) =>
              setDayStart(
                event.target.value
              )
            }
            className="form-input"
          />

        </div>

        {/* End Time */}

        <div className="form-field">

          <label className="field-label">

            <Clock size={14} />

            <span>
              {t.endTime}
            </span>

          </label>

          <input
            type="time"
            value={dayEnd}
            onChange={(event) =>
              setDayEnd(
                event.target.value
              )
            }
            className="form-input"
          />

        </div>

        {/* Budget */}

        <div className="form-field">

          <label className="field-label">

            <DollarSign size={14} />

            <span>
              {t.budget}
            </span>

          </label>

          <input
            type="text"
            inputMode="numeric"
            value={budgetCap}
            onChange={(event) => {

              const value =
                event.target.value;

              if (value === '') {
                setBudgetCap('');
                return;
              }

              if (!/^\d+$/.test(value)) {
                return;
              }

              const numericValue =
                Number(value);

              if (
                numericValue > 100000
              ) {
                setBudgetCap(
                  '100000'
                );
                return;
              }

              setBudgetCap(value);
            }}
            placeholder="2500"
            className="form-input"
          />

          <span className="field-hint">
            {t.maximumBudget}
          </span>

        </div>

        {/* Carbon */}

        <div className="form-field">

          <label className="field-label">

            <Leaf size={14} />

            <span>
              {t.carbon}
            </span>

          </label>

          <input
            type="text"
            inputMode="decimal"
            value={carbonCap}
            onChange={(event) => {

              const value =
                event.target.value;

              if (value === '') {
                setCarbonCap('');
                return;
              }

              // Allows:
              // 10
              // 10.5
              // 0.5

              if (
                !/^\d+(?:\.\d+)?$/.test(
                  value
                )
              ) {
                return;
              }

              const numericValue =
                Number(value);

              if (
                numericValue > 1000
              ) {
                setCarbonCap(
                  '1000'
                );
                return;
              }

              setCarbonCap(value);
            }}
            placeholder="10"
            className="form-input"
          />

          <span className="field-hint">
            {t.maximumCarbon}
          </span>

        </div>

      </div>

      {/* ======================================================
          ROUTE CONFIGURATION
      ====================================================== */}

      <div className="route-config-section">

        <div className="route-config-header">

          <div>

            <div className="route-config-title">

              <Navigation
                size={16}
              />

              <span>
                {t.route}
              </span>

            </div>

            <p className="route-config-subtitle">
              {t.routeSubtitle}
            </p>

          </div>

          <div className="route-config-badge">
            {t.hardConstraints}
          </div>

        </div>

        {/* Start / End */}

        <div className="route-endpoints-grid">

          {/* START */}

          <div className="form-field">

            <label className="field-label">

              <Navigation
                size={14}
              />

              <span>
                {t.startLocation}
              </span>

            </label>

            <div className="select-wrapper">

              <select
                value={
                  startPoiId || ''
                }
                onChange={(event) =>
                  setStartPoiId(
                    event.target.value
                  )
                }
                className="form-select"
              >

                <option value="">
                  {t.selectStart}
                </option>

                {pois.map(
                  (poi) => (
                    <option
                      key={
                        poi.poi_id
                      }
                      value={
                        poi.poi_id
                      }
                    >
                      {poi.name}
                    </option>
                  )
                )}

              </select>

            </div>

            <span className="field-hint">
              {t.startHint}
            </span>

          </div>

          {/* END */}

          <div className="form-field">

            <label className="field-label">

              <Flag
                size={14}
              />

              <span>
                {t.endLocation}
              </span>

            </label>

            <div className="select-wrapper">

              <select
                value={
                  endPoiId || ''
                }
                onChange={(event) =>
                  setEndPoiId(
                    event.target.value
                  )
                }
                className="form-select"
              >

                <option value="">
                  {t.selectEnd}
                </option>

                {pois.map(
                  (poi) => (
                    <option
                      key={
                        poi.poi_id
                      }
                      value={
                        poi.poi_id
                      }
                    >
                      {poi.name}
                    </option>
                  )
                )}

              </select>

            </div>

            <span className="field-hint">
              {t.endHint}
            </span>

          </div>

        </div>

        {/* Transport */}

        <div className="transport-section">

          <div className="transport-header">

            <label className="field-label">

              <Car size={14} />

              <span>
                {t.transport}
              </span>

            </label>

            <span className="transport-count">

              {(allowedModes || [])
                .length}{' '}

              {t.selected}

            </span>

          </div>

          <div className="transport-options">

            {transportOptions.map(
              ({
                id,
                label,
                icon: Icon,
              }) => {

                const selected =
                  (
                    allowedModes ||
                    []
                  ).includes(id);

                return (

                  <button
                    key={id}
                    type="button"
                    className={`transport-option ${selected
                        ? 'selected'
                        : ''
                      }`}
                    onClick={() =>
                      toggleTransportMode(
                        id
                      )
                    }
                    aria-pressed={
                      selected
                    }
                  >

                    <span className="transport-icon">

                      <Icon
                        size={17}
                      />

                    </span>

                    <span>
                      {label}
                    </span>

                    {selected && (
                      <Check
                        size={14}
                        className="transport-check"
                      />
                    )}

                  </button>

                );
              }
            )}

          </div>

        </div>

      </div>

      {/* ======================================================
          MUST-SEE POIs
      ====================================================== */}

      <div className="must-see-section">

        <div className="must-see-header">

          <label className="field-label bold">

            <span>
              {t.mustSee}
            </span>

            <span className="selected-tag">

              {
                mustSeePoiIds.length
              }{' '}

              {t.selectedCount}

            </span>

          </label>

          <div className="poi-filter-controls">

            <div className="poi-search-box">

              <Search size={14} />

              <input
                type="text"
                placeholder={
                  t.searchPois
                }
                value={poiSearch}
                onChange={(event) =>
                  setPoiSearch(
                    event.target.value
                  )
                }
              />

            </div>

            <select
              value={
                selectedCategory
              }
              onChange={(event) =>
                setSelectedCategory(
                  event.target.value
                )
              }
              className="cat-select"
            >

              {categories.map(
                (category) => (
                  <option
                    key={
                      category
                    }
                    value={
                      category
                    }
                  >
                    {category ===
                      'all'
                      ? t.allCats
                      : category.toUpperCase()}
                  </option>
                )
              )}

            </select>

          </div>

        </div>

        {/* Selected chips */}

        {mustSeePoiIds.length >
          0 && (

            <div className="selected-chips-row">

              {mustSeePoiIds.map(
                (id) => {

                  const poi =
                    pois.find(
                      (item) =>
                        item.poi_id ===
                        id
                    );

                  return (

                    <div
                      key={id}
                      className="selected-poi-chip"
                    >

                      <span>

                        {poi
                          ? poi.name
                          : id}

                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          toggleMustSee(
                            id
                          )
                        }
                        aria-label={`Remove ${poi
                            ? poi.name
                            : id
                          }`}
                      >

                        <X
                          size={13}
                        />

                      </button>

                    </div>

                  );
                }
              )}

            </div>

          )}

        {/* POI cards */}

        <div className="poi-cards-grid">

          {filteredPois
            .slice(0, 16)
            .map((poi) => {

              const isSelected =
                mustSeePoiIds.includes(
                  poi.poi_id
                );

              const isStart =
                startPoiId ===
                poi.poi_id;

              const isEnd =
                endPoiId ===
                poi.poi_id;

              const entryCost =
                Number(
                  poi.entry_cost || 0
                );

              return (

                <div
                  key={
                    poi.poi_id
                  }
                  className={`poi-select-card ${isSelected
                      ? 'selected'
                      : ''
                    }`}
                  onClick={() =>
                    toggleMustSee(
                      poi.poi_id
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(
                    event
                  ) => {

                    if (
                      event.key ===
                      'Enter' ||
                      event.key ===
                      ' '
                    ) {

                      event.preventDefault();

                      toggleMustSee(
                        poi.poi_id
                      );

                    }

                  }}
                >

                  <div className="poi-select-top">

                    <span className="poi-name">
                      {poi.name}
                    </span>

                    <div
                      className={`checkbox-indicator ${isSelected
                          ? 'checked'
                          : ''
                        }`}
                    >

                      {isSelected && (
                        <Check
                          size={12}
                        />
                      )}

                    </div>

                  </div>

                  {/* POI metadata */}

                  <div className="poi-select-meta">

                    <span>
                      {
                        poi.typical_duration_minutes
                      } {t.minutes}
                    </span>

                    <span
                      className="poi-meta-separator"
                      aria-hidden="true"
                    >
                      •
                    </span>

                    <span>
                      ₹
                      {entryCost.toLocaleString(
                        'en-IN'
                      )}
                    </span>

                    <span
                      className="poi-meta-separator"
                      aria-hidden="true"
                    >
                      •
                    </span>

                    <span>
                      {poi.carbon_kg} kg CO₂
                    </span>

                    {poi.opens_at && (
                      <>
                        <span
                          className="poi-meta-separator"
                          aria-hidden="true"
                        >
                          •
                        </span>

                        <span className="poi-hours">
                          {poi.opens_at}
                          {'–'}
                          {poi.closes_at}
                        </span>
                      </>
                    )}

                  </div>

                  {/* Route markers */}

                  {(isStart ||
                    isEnd) && (

                      <div className="poi-route-tags">

                        {isStart && (
                          <span className="poi-route-tag start">

                            <Navigation
                              size={10}
                            />

                            {t.start}

                          </span>
                        )}

                        {isEnd && (
                          <span className="poi-route-tag end">

                            <Flag
                              size={10}
                            />

                            {t.end}

                          </span>
                        )}

                      </div>

                    )}

                </div>

              );

            })}

        </div>

      </div>

      {/* ======================================================
          OPTIMIZE
      ====================================================== */}

      <div className="optimize-cta-container">

        <button
          type="button"
          onClick={onOptimize}
          disabled={
            isLoading ||
            !selectedCityId ||
            !startPoiId ||
            !endPoiId ||
            !allowedModes?.length
          }
          className="btn-optimize-main"
        >

          {isLoading ? (

            <>
              <Loader2
                size={18}
                className="spin"
              />

              <span>
                {t.optimizingBtn}
              </span>
            </>

          ) : (

            <>
              <span>
                {t.optimizeBtn}
              </span>

              <ArrowRight
                size={18}
              />
            </>

          )}

        </button>

      </div>

    </div>
  );
}