import React from 'react';
import { Layers, ArrowRight, TrendingUp, TrendingDown, Scale, Info } from 'lucide-react';

export default function TradeoffView({
  weights,
  normalizedMetrics,
  summary,
  previousSummary = null,
  language = 'en'
}) {
  if (!summary) return null;

  const t = {
    en: {
      title: 'OBJECTIVE TRADE-OFF ANALYSIS',
      subtitle: 'Pareto balance between Cost, Time, and Carbon emissions based on active weights.',
      costWeight: 'Cost Priority',
      timeWeight: 'Time Priority',
      carbonWeight: 'Carbon Priority',
      actual: 'Actual Result',
      shift: 'Weight Shift Impact',
      paretoNote: 'All metrics reflect real calculated values from the optimizer solution.'
    },
    hi: {
      title: 'उद्देश्य ट्रेड-ऑफ विश्लेषण',
      subtitle: 'सक्रिय प्राथमिकताओं के आधार पर लागत, समय और कार्बन उत्सर्जन के बीच संतुलन।',
      costWeight: 'लागत प्राथमिकता',
      timeWeight: 'समय प्राथमिकता',
      carbonWeight: 'कार्बन प्राथमिकता',
      actual: 'वास्तविक परिणाम',
      shift: 'प्राथमिकता परिवर्तन का प्रभाव',
      paretoNote: 'सभी आंकड़े अनुकूलक समाधान से प्राप्त वास्तविक गणना पर आधारित हैं।'
    }
  }[language];

  const costPct = Math.round((weights?.cost || 0.33) * 100);
  const timePct = Math.round((weights?.time || 0.33) * 100);
  const carbonPct = 100 - costPct - timePct;

  return (
    <div className="tradeoff-card">
      <div className="card-header">
        <div className="tradeoff-header-flex">
          <div className="tradeoff-title-wrap">
            <Layers size={16} className="tradeoff-icon" />
            <h4 className="section-title">{t.title}</h4>
          </div>
          <span className="pareto-badge">Pareto Evaluated</span>
        </div>
        <p className="section-subtitle">{t.subtitle}</p>
      </div>

      <div className="tradeoff-bars-grid">
        {/* Cost Objective Bar */}
        <div className="tradeoff-bar-item">
          <div className="tradeoff-bar-head">
            <span className="objective-tag cost">{t.costWeight}: {costPct}%</span>
            <span className="objective-actual">₹{summary.cost}</span>
          </div>
          <div className="progress-bg">
            <div
              className="progress-fill cost-fill"
              style={{ width: `${Math.max(8, Math.min(100, costPct))}%` }}
            />
          </div>
          <div className="bar-footer-text">
            <span>₹{summary.cost} across {summary.stops_count} stops</span>
          </div>
        </div>

        {/* Time Objective Bar */}
        <div className="tradeoff-bar-item">
          <div className="tradeoff-bar-head">
            <span className="objective-tag time">{t.timeWeight}: {timePct}%</span>
            <span className="objective-actual">{summary.minutes} mins</span>
          </div>
          <div className="progress-bg">
            <div
              className="progress-fill time-fill"
              style={{ width: `${Math.max(8, Math.min(100, timePct))}%` }}
            />
          </div>
          <div className="bar-footer-text">
            <span>{summary.activity_minutes}m sights + {summary.travel_minutes}m transit</span>
          </div>
        </div>

        {/* Carbon Objective Bar */}
        <div className="tradeoff-bar-item">
          <div className="tradeoff-bar-head">
            <span className="objective-tag carbon">{t.carbonWeight}: {carbonPct}%</span>
            <span className="objective-actual">{summary.carbon_kg} kg CO₂</span>
          </div>
          <div className="progress-bg">
            <div
              className="progress-fill carbon-fill"
              style={{ width: `${Math.max(8, Math.min(100, carbonPct))}%` }}
            />
          </div>
          <div className="bar-footer-text">
            <span>Total estimated footprint</span>
          </div>
        </div>
      </div>

      {/* Difference comparison if weights were shifted */}
      {previousSummary && (
        <div className="shift-summary-box">
          <div className="shift-title">
            <TrendingDown size={14} />
            <span>{t.shift}</span>
          </div>
          <div className="shift-pills-row">
            <span className="shift-pill">
              Cost: {parseFloat(summary.cost) >= parseFloat(previousSummary.cost) ? '+' : ''}
              ₹{(parseFloat(summary.cost) - parseFloat(previousSummary.cost)).toFixed(0)}
            </span>
            <span className="shift-pill">
              Time: {summary.minutes >= previousSummary.minutes ? '+' : ''}
              {summary.minutes - previousSummary.minutes}m
            </span>
            <span className="shift-pill">
              Carbon: {summary.carbon_kg >= previousSummary.carbon_kg ? '+' : ''}
              {(summary.carbon_kg - previousSummary.carbon_kg).toFixed(2)} kg
            </span>
          </div>
        </div>
      )}

      <div className="tradeoff-note">
        <Info size={13} />
        <span>{t.paretoNote}</span>
      </div>
    </div>
  );
}
