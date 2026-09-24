import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Leaf,
  Plus,
  X,
  Check,
  Loader2,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal
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
  onOptimize,
  isLoading,
  onAiPlanComplete,
  language = 'en'
}) {
  const [poiSearch, setPoiSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');

  const suggestions = [
    { label: '🌱 Plan a low-carbon day', prompt: 'Plan a low-carbon day in Bengaluru. Prioritize walking and green attractions.' },
    { label: '💰 Plan a budget-friendly day', prompt: 'Plan a budget-friendly day under ₹1200 with cultural sights and parks.' },
    { label: '⚡ Plan the fastest day', prompt: 'Plan a fast, time-efficient route hitting top highlights in 6 hours.' },
    { label: '📍 Must-see highlights', prompt: 'Plan a route covering the most iconic landmarks and historic monuments.' }
  ];

  const t = {
    en: {
      planYourDay: 'PLAN YOUR ROUTE',
      planSubtitle: 'Configure constraints or use the AI concierge to seed your day.',
      aiHeader: 'AI PLAN MY DAY',
      aiPlaceholder: 'What does your ideal day look like? (e.g. "Low carbon day in Bengaluru under ₹1500...")',
      aiBtn: 'Plan My Day →',
      aiThinking: 'AI Concierge is reasoning about your day...',
      destination: 'Destination City',
      date: 'Date of Travel',
      start: 'Day Start Time',
      end: 'Day End Time',
      budget: 'Budget Cap (₹)',
      carbon: 'Carbon Cap (kg CO₂)',
      mustSee: 'Must-See Attractions (Hard Constraints)',
      searchPois: 'Filter attractions by name or tag...',
      allCats: 'All Categories',
      selectedCount: 'selected (strictly enforced)',
      optimizeBtn: 'Optimize My Route →',
      optimizingBtn: 'Optimizing Route...',
      clearBtn: 'Clear AI Prompt',
      validationError: 'Please check your inputs: city and start/end times are required.'
    },
    hi: {
      planYourDay: 'यात्रा मार्ग निर्धारित करें',
      planSubtitle: 'प्रतिबंध चुनें या AI सहायक की मदद से योजना बनाएं।',
      aiHeader: 'AI योजना सहायक (Plan My Day)',
      aiPlaceholder: 'आपका आदर्श दिन कैसा दिखता है? (उदा. "बेंगलुरु में कम कार्बन और ₹1500 बजट...")',
      aiBtn: 'दिन की योजना बनाएं →',
      aiThinking: 'AI आपके लिए सर्वोत्तम मार्ग तैयार कर रहा है...',
      destination: 'गंतव्य शहर',
      date: 'यात्रा की तिथि',
      start: 'आरंभ समय',
      end: 'समाप्ति समय',
      budget: 'बजट सीमा (₹)',
      carbon: 'कार्बन सीमा (kg CO₂)',
      mustSee: 'अनिवार्य आकर्षण (बाध्यकारी)',
      searchPois: 'आकर्षण खोजें...',
      allCats: 'सभी श्रेणियां',
      selectedCount: 'चुने गए (अनिवार्य)',
      optimizeBtn: 'मार्ग अनुकूलित करें (Optimize) →',
      optimizingBtn: 'अनुकूलन जारी है...',
      clearBtn: 'प्रॉम्प्ट साफ़ करें',
      validationError: 'कृपया शहर एवं समय का सही चयन करें।'
    }
  }[language];

  // Unique categories
  const categories = ['all', ...Array.from(new Set(pois.map(p => p.poi_category).filter(Boolean)))];

  // Filtered POIs
  const filteredPois = pois.filter(p => {
    const matchesSearch = poiSearch.trim() === '' ||
      p.name.toLowerCase().includes(poiSearch.toLowerCase()) ||
      (p.tags && p.tags.toLowerCase().includes(poiSearch.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || p.poi_category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const toggleMustSee = (poiId) => {
    if (mustSeePoiIds.includes(poiId)) {
      setMustSeePoiIds(mustSeePoiIds.filter(id => id !== poiId));
    } else {
      setMustSeePoiIds([...mustSeePoiIds, poiId]);
    }
  };

  const handleSelectSuggestion = (promptText) => {
    setAiPrompt(promptText);
    setAiError('');
    setAiSuccessMessage('');
  };

  const handleAiPlanMyDay = async (e) => {
    if (e) e.preventDefault();
    if (!aiPrompt.trim()) return;

    setAiLoading(true);
    setAiError('');
    setAiSuccessMessage('');

    try {
      const data = await planMyDay(aiPrompt, selectedCityId);
      if (data && data.success) {
        if (data.city?.city_id) onCityChange(data.city.city_id);
        if (data.parsed_intent?.budget_cap) setBudgetCap(data.parsed_intent.budget_cap);
        if (data.parsed_intent?.carbon_cap_kg) setCarbonCap(String(data.parsed_intent.carbon_cap_kg));
        if (data.parsed_intent?.day_start) setDayStart(data.parsed_intent.day_start);
        if (data.parsed_intent?.day_end) setDayEnd(data.parsed_intent.day_end);
        if (data.parsed_intent?.must_see_poi_ids) {
          setMustSeePoiIds(data.parsed_intent.must_see_poi_ids);
        }

        if (data.ai_status?.fallback) {
          setAiSuccessMessage('AI is temporarily unavailable. ReRoute is using smart fallback planning.');
        } else {
          setAiSuccessMessage(data.ai_status?.message || 'AI planned your day based on your preferences!');
        }

        if (onAiPlanComplete) {
          onAiPlanComplete(data);
        }
      } else {
        throw new Error(data.error || 'Failed to generate itinerary plan.');
      }
    } catch (err) {
      console.error('Plan my day error:', err);
      setAiError(err.message || 'Could not complete AI planning request.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="planner-form-card">
      {/* Top Heading */}
      <div className="form-header">
        <h2 className="form-main-title">{t.planYourDay}</h2>
        <p className="form-subtitle">{t.planSubtitle}</p>
      </div>

      {/* AI Plan My Day Concierge Box */}
      <div className="ai-concierge-panel">
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <Sparkles size={16} className="ai-sparkle-icon" />
            <span>{t.aiHeader}</span>
          </div>
          {aiPrompt && (
            <button
              type="button"
              className="ai-clear-btn"
              onClick={() => { setAiPrompt(''); setAiError(''); setAiSuccessMessage(''); }}
              title={t.clearBtn}
            >
              <RotateCcw size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>

        <form onSubmit={handleAiPlanMyDay} className="ai-input-form">
          <div className="ai-input-wrapper">
            <textarea
              rows={2}
              className="ai-textarea"
              placeholder={t.aiPlaceholder}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={aiLoading}
            />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="ai-suggestions-row">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                className="ai-suggestion-chip"
                onClick={() => handleSelectSuggestion(s.prompt)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="ai-action-row">
            <button
              type="submit"
              disabled={aiLoading || !aiPrompt.trim()}
              className="btn-ai-plan"
            >
              {aiLoading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{t.aiThinking}</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>{t.aiBtn}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {aiError && (
          <div className="ai-status-banner error">
            <span>{aiError}</span>
          </div>
        )}

        {aiSuccessMessage && (
          <div className="ai-status-banner success">
            <Check size={14} />
            <span>{aiSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* Manual Constraint Grid */}
      <div className="form-grid">
        {/* Destination */}
        <div className="form-field full-width">
          <label className="field-label">
            <MapPin size={14} />
            <span>{t.destination}</span>
          </label>
          <div className="select-wrapper">
            <select
              value={selectedCityId}
              onChange={(e) => onCityChange(e.target.value)}
              className="form-select"
            >
              {cities.map((city) => (
                <option key={city.city_id} value={city.city_id}>
                  {city.name} {city.state ? `(${city.state})` : city.country_code ? `(${city.country_code})` : ''} • {city.region || 'India'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date of Travel */}
        <div className="form-field">
          <label className="field-label">
            <Calendar size={14} />
            <span>{t.date}</span>
          </label>
          <input
            type="date"
            value={dayDate || '2026-09-25'}
            onChange={(e) => setDayDate && setDayDate(e.target.value)}
            className="form-input"
          />
        </div>

        {/* Day Start */}
        <div className="form-field">
          <label className="field-label">
            <Clock size={14} />
            <span>{t.start}</span>
          </label>
          <input
            type="time"
            value={dayStart}
            onChange={(e) => setDayStart(e.target.value)}
            className="form-input"
          />
        </div>

        {/* Day End */}
        <div className="form-field">
          <label className="field-label">
            <Clock size={14} />
            <span>{t.end}</span>
          </label>
          <input
            type="time"
            value={dayEnd}
            onChange={(e) => setDayEnd(e.target.value)}
            className="form-input"
          />
        </div>

        {/* Budget Cap */}
        <div className="form-field">
          <label className="field-label">
            <DollarSign size={14} />
            <span>{t.budget}</span>
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={budgetCap}
            onChange={(e) => setBudgetCap(e.target.value)}
            placeholder="e.g. 2500"
            className="form-input"
          />
        </div>

        {/* Carbon Cap */}
        <div className="form-field">
          <label className="field-label">
            <Leaf size={14} />
            <span>{t.carbon}</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={carbonCap}
            onChange={(e) => setCarbonCap(e.target.value)}
            placeholder="e.g. 10"
            className="form-input"
          />
        </div>
      </div>

      {/* Must-See POIs Section */}
      <div className="must-see-section">
        <div className="must-see-header">
          <label className="field-label bold">
            <span>{t.mustSee}</span>
            <span className="selected-tag">
              {mustSeePoiIds.length} {t.selectedCount}
            </span>
          </label>

          <div className="poi-filter-controls">
            <div className="poi-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder={t.searchPois}
                value={poiSearch}
                onChange={(e) => setPoiSearch(e.target.value)}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="cat-select"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? t.allCats : c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected POIs Chips */}
        {mustSeePoiIds.length > 0 && (
          <div className="selected-chips-row">
            {mustSeePoiIds.map((id) => {
              const poi = pois.find((p) => p.poi_id === id);
              return (
                <div key={id} className="selected-poi-chip">
                  <span>{poi ? poi.name : id}</span>
                  <button
                    type="button"
                    onClick={() => toggleMustSee(id)}
                    aria-label={`Remove ${poi ? poi.name : id}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* POI Selector Grid */}
        <div className="poi-cards-grid">
          {filteredPois.slice(0, 16).map((poi) => {
            const isSelected = mustSeePoiIds.includes(poi.poi_id);
            return (
              <div
                key={poi.poi_id}
                className={`poi-select-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleMustSee(poi.poi_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleMustSee(poi.poi_id); }}
              >
                <div className="poi-select-top">
                  <span className="poi-name">{poi.name}</span>
                  <div className={`checkbox-indicator ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={12} />}
                  </div>
                </div>

                <div className="poi-select-meta">
                  <span>{poi.typical_duration_minutes}m</span>
                  <span>•</span>
                  <span>₹{poi.entry_cost}</span>
                  <span>•</span>
                  <span>{poi.carbon_kg} kg</span>
                  {poi.opens_at && (
                    <>
                      <span>•</span>
                      <span className="poi-hours">{poi.opens_at}–{poi.closes_at}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Optimize Action */}
      <div className="optimize-cta-container">
        <button
          type="button"
          onClick={onOptimize}
          disabled={isLoading || !selectedCityId}
          className="btn-optimize-main"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="spin" />
              <span>{t.optimizingBtn}</span>
            </>
          ) : (
            <>
              <span>{t.optimizeBtn}</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
