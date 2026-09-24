import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Sliders, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';

export default function InfeasibilityCard({
  bindingConstraint,
  explanation,
  relaxation,
  availableRelaxations = [],
  onSelectRelaxationConstraint,
  onApplyRelaxation,
  onViewRelaxedPlan,
  showingRelaxedPlan = false,
  language = 'en'
}) {
  const [selectedConstraintType, setSelectedConstraintType] = useState(
    relaxation?.constraint_type || 'TIME'
  );

  const t = {
    en: {
      title: 'NO FEASIBLE ITINERARY',
      subtitle: 'The requested combination cannot be scheduled without violating physical or user constraints.',
      whyTitle: 'WHY THIS HAPPENED',
      bindingLabel: 'Binding Constraint',
      relaxHeading: 'RELAX ONE CONSTRAINT',
      relaxSub: 'Select EXACTLY ONE constraint to relax. The other hard constraints remain strictly enforced.',
      viewRelaxed: 'View Feasible Relaxed Plan',
      hideRelaxed: 'Hide Relaxed Plan',
      applyRelaxed: 'Apply Relaxation & Re-optimize',
      singleNotice: 'Only ONE constraint will be relaxed at a time.'
    },
    hi: {
      title: 'कोई व्यावहारिक यात्रा कार्यक्रम नहीं मिला',
      subtitle: 'मांगी गई शर्तें किसी न किसी प्रतिबंध का उल्लंघन किए बिना पूरी नहीं हो सकतीं।',
      whyTitle: 'यह स्थिति क्यों आई?',
      bindingLabel: 'मुख्य बाध्यकारी प्रतिबंध',
      relaxHeading: 'केवल एक प्रतिबंध शिथिल (Relax) करें',
      relaxSub: 'किसी एक प्रतिबंध को चुनें। अन्य सभी नियम पूरी तरह से लागू रहेंगे।',
      viewRelaxed: 'शिथिलित योजना देखें',
      hideRelaxed: 'योजना छिपाएं',
      applyRelaxed: 'यह शिथिलता लागू करें',
      singleNotice: 'एक बार में केवल एक ही प्रतिबंध शिथिल किया जाएगा।'
    }
  }[language];

  // Available single constraint options
  const constraintOptions = [
    {
      id: 'TIME',
      label: 'Day End Time',
      desc: 'Extend day end window to accommodate travel & visit durations'
    },
    {
      id: 'BUDGET',
      label: 'Budget Cap',
      desc: 'Increase maximum expenditure to cover admission fees and transit'
    },
    {
      id: 'CARBON',
      label: 'Carbon Limit',
      desc: 'Increase emission ceiling to allow faster transit'
    },
    {
      id: 'TIME_START',
      label: 'Day Start Time',
      desc: 'Start earlier in the morning to allow adequate time'
    }
  ];

  const handleConstraintSelection = (typeId) => {
    setSelectedConstraintType(typeId);
    if (onSelectRelaxationConstraint) {
      onSelectRelaxationConstraint(typeId);
    }
  };

  const bindingType = bindingConstraint?.type || 'CONSTRAINTS';
  const bindingLabel = bindingConstraint?.label || (
    bindingType === 'TIME_LIMIT' ? 'TIME WINDOW' :
    bindingType === 'BUDGET_LIMIT' ? 'BUDGET CAP' :
    bindingType === 'CARBON_LIMIT' ? 'CARBON LIMIT' :
    bindingType === 'OPENING_HOURS' ? 'OPENING HOURS' :
    bindingType
  );

  return (
    <div className="infeasibility-banner-card">
      {/* Alert Header */}
      <div className="infeasibility-header">
        <div className="infeasibility-icon-shield">
          <ShieldAlert size={26} />
        </div>
        <div className="infeasibility-title-wrap">
          <span className="infeasibility-kicker">OPTIMIZATION DIAGNOSTIC</span>
          <h3 className="infeasibility-headline">{t.title}</h3>
          <p className="infeasibility-sub">{t.subtitle}</p>
        </div>
      </div>

      <div className="infeasibility-body">
        {/* Why this happened */}
        <div className="why-happened-box">
          <div className="why-header">
            <span className="why-label">{t.whyTitle}</span>
            <span className="binding-constraint-badge">
              {t.bindingLabel}: <strong>{bindingLabel}</strong>
            </span>
          </div>
          <p className="explanation-text-content">
            {explanation || 'The optimizer could not find a sequence of attractions and transit routes that satisfies all budget, time, opening hours, and carbon limits simultaneously.'}
          </p>
        </div>

        {/* Relaxation Section */}
        <div className="relaxation-chooser-box">
          <div className="relaxation-heading-row">
            <div className="relax-title-group">
              <Sliders size={18} className="relax-icon" />
              <h4>{t.relaxHeading}</h4>
            </div>
            <span className="single-constraint-tag">
              ★ {t.singleNotice}
            </span>
          </div>
          <p className="relaxation-sub-text">{t.relaxSub}</p>

          {/* Constraint Selection Cards (Select EXACTLY ONE) */}
          <div className="constraint-choices-grid">
            {constraintOptions.map((opt) => {
              const isSelected = selectedConstraintType === opt.id || (
                relaxation && relaxation.constraint_type === opt.id && !selectedConstraintType
              );
              const isBinding = (
                (opt.id === 'TIME' && bindingType === 'TIME_LIMIT') ||
                (opt.id === 'BUDGET' && bindingType === 'BUDGET_LIMIT') ||
                (opt.id === 'CARBON' && bindingType === 'CARBON_LIMIT')
              );

              return (
                <div
                  key={opt.id}
                  className={`constraint-choice-card ${isSelected ? 'selected' : ''} ${isBinding ? 'is-binding' : ''}`}
                  onClick={() => handleConstraintSelection(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleConstraintSelection(opt.id); }}
                >
                  <div className="choice-card-top">
                    <span className="choice-name">{opt.label}</span>
                    {isBinding && <span className="binding-pill">Binding</span>}
                    <div className={`radio-dot ${isSelected ? 'active' : ''}`} />
                  </div>
                  <p className="choice-desc">{opt.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Proposed relaxation comparison */}
          {relaxation && (
            <div className="active-relaxation-preview">
              <div className="preview-label">Proposed Minimal Adjustment:</div>
              <div className="relaxation-comparison-row">
                <div className="comp-block original">
                  <span className="comp-meta">Original {relaxation.constraint}</span>
                  <span className="comp-value">{relaxation.original}</span>
                </div>
                <div className="comp-arrow-divider">
                  <ArrowRight size={18} />
                </div>
                <div className="comp-block relaxed">
                  <span className="comp-meta">Relaxed {relaxation.constraint}</span>
                  <span className="comp-value">{relaxation.relaxed}</span>
                </div>
              </div>
              <div className="relaxation-explanation-text">
                {relaxation.description}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="relaxation-btn-row">
            <button
              type="button"
              className="btn-view-relaxed-toggle"
              onClick={onViewRelaxedPlan}
            >
              {showingRelaxedPlan ? t.hideRelaxed : t.viewRelaxed}
            </button>

            <button
              type="button"
              className="btn-apply-relaxation-confirm"
              onClick={() => onApplyRelaxation && onApplyRelaxation(selectedConstraintType)}
            >
              <CheckCircle2 size={16} />
              <span>{t.applyRelaxed}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
