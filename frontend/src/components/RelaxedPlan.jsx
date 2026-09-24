import React from 'react';
import MetricsCard from './MetricsCard';
import ItineraryTimeline from './ItineraryTimeline';
import { CheckCircle2, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';

export default function RelaxedPlan({
  relaxedPlan,
  onApply,
  language = 'en'
}) {
  if (!relaxedPlan) return null;

  const constraintName = relaxedPlan.constraint_name || 'selected constraint';

  const t = {
    en: {
      heading: 'RELAXED PLAN',
      tag: 'FEASIBLE ALTERNATIVE FOUND',
      relaxedNotice: `Only ${constraintName} was relaxed (${relaxedPlan.original_value} → ${relaxedPlan.relaxed_value}). All other hard constraints remain strictly enforced.`,
      adoptBtn: 'Adopt This Relaxed Itinerary'
    },
    hi: {
      heading: 'शिथिलित यात्रा योजना (RELAXED PLAN)',
      tag: 'व्यावहारिक विकल्प उपलब्ध',
      relaxedNotice: `केवल ${constraintName} को शिथिल किया गया है (${relaxedPlan.original_value} → ${relaxedPlan.relaxed_value})। अन्य सभी नियम पूर्णतः लागू हैं।`,
      adoptBtn: 'यह शिथिलित यात्रा कार्यक्रम अपनाएं'
    }
  }[language];

  return (
    <div className="relaxed-plan-container">
      {/* Banner */}
      <div className="relaxed-header-box">
        <div className="relaxed-title-left">
          <div className="relaxed-spark-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="relaxed-badge">{t.tag}</span>
            <h3 className="relaxed-main-title">{t.heading}</h3>
            <div className="only-relaxed-statement">
              <ShieldCheck size={15} />
              <span>{t.relaxedNotice}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-adopt-relaxed"
          onClick={onApply}
        >
          <CheckCircle2 size={16} />
          <span>{t.adoptBtn}</span>
        </button>
      </div>

      {/* Metrics of Relaxed Plan */}
      <div className="relaxed-metrics-wrapper">
        <MetricsCard
          summary={relaxedPlan.summary}
          language={language}
        />
      </div>

      {/* Itinerary Timeline of Relaxed Plan */}
      <div className="relaxed-timeline-wrapper">
        <div className="relaxed-timeline-kicker">
          <span>RELAXED DAY ITINERARY</span>
          <small>{relaxedPlan.stops?.length || 0} stops • Feasible with adjusted {constraintName}</small>
        </div>

        <ItineraryTimeline
          stops={relaxedPlan.stops}
          transfers={relaxedPlan.transfers}
          language={language}
        />
      </div>
    </div>
  );
}
