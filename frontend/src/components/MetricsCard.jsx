import React from 'react';
import { DollarSign, Clock, Leaf, MapPin, Compass } from 'lucide-react';

export default function MetricsCard({ summary, budgetCap, carbonCap, language = 'en' }) {
  if (!summary) return null;

  const t = {
    en: {
      heading: 'YOUR OPTIMIZED DAY',
      cost: 'TOTAL COST',
      time: 'TOTAL TIME',
      carbon: 'CARBON FOOTPRINT',
      stops: 'TOTAL STOPS',
      activityTime: 'activities',
      travelTime: 'transit',
      wait: 'waiting',
      remaining: 'remaining',
      ofCap: 'of limit'
    },
    hi: {
      heading: '\u0906\u092a\u0915\u093e \u0905\u0928\u0941\u0915\u0942\u0932\u093f\u0924 \u0926\u093f\u0928',
      cost: '\u0915\u0941\u0932 \u0932\u093e\u0917\u0924',
      time: '\u0915\u0941\u0932 \u0938\u092e\u092f',
      carbon: '\u0915\u093e\u0930\u094d\u092c\u0928 \u092a\u0926\u091a\u093f\u0939\u094d\u0928',
      stops: '\u0915\u0941\u0932 \u092a\u095c\u093e\u0935',
      activityTime: '\u0917\u0924\u093f\u0935\u093f\u0927\u093f\u092f\u093e\u0902',
      travelTime: '\u092a\u093e\u0930\u0917\u092e\u0928',
      wait: '\u092a\u094d\u0930\u0924\u0940\u0915\u094d\u0937\u093e',
      remaining: '\u0936\u0947\u0937',
      ofCap: '\u0938\u0940\u092e\u093e \u092e\u0947\u0902 \u0938\u0947'
    }
  }[language] || {
    heading: 'YOUR OPTIMIZED DAY',
    cost: 'TOTAL COST',
    time: 'TOTAL TIME',
    carbon: 'CARBON FOOTPRINT',
    stops: 'TOTAL STOPS',
    activityTime: 'activities',
    travelTime: 'transit',
    wait: 'waiting',
    remaining: 'remaining',
    ofCap: 'of limit'
  };

  // Parse costs and caps safely
  const costNum = parseFloat(summary.cost) || 0;
  const budgetNum = budgetCap ? parseFloat(budgetCap) : null;
  const budgetRemaining = budgetNum ? Math.max(0, budgetNum - costNum) : null;

  // Format time
  const totalMins = Number(summary.minutes) || 0;
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  const timeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Carbon
  const carbonNum =
    summary.carbon_kg !== undefined
      ? Number(summary.carbon_kg).toFixed(1)
      : '0.0';

  const carbonCapNum = carbonCap ? parseFloat(carbonCap) : null;
  const carbonRemaining = carbonCapNum
    ? Math.max(0, carbonCapNum - parseFloat(carbonNum))
    : null;

  return (
    <div className="metrics-dashboard">
      <div className="metrics-dashboard-kicker">
        <Compass size={14} />
        <span>{t.heading}</span>
      </div>

      <div className="metrics-container">
        {/* Cost Metric */}
        <div className="metric-box cost-box">
          <div className="metric-top">
            <span className="metric-label">{t.cost}</span>
            <div className="metric-icon cost-icon">
              <DollarSign size={16} />
            </div>
          </div>

          <div className="metric-value">
            {'\u20B9'}{summary.cost}
          </div>

          <div className="metric-subtext">
            {budgetNum ? (
              <span>
                {'\u20B9'}{budgetRemaining.toFixed(0)} {t.remaining} (
                {t.ofCap} {'\u20B9'}{budgetNum})
              </span>
            ) : (
              <span>Entry fees & low-carbon transit</span>
            )}
          </div>
        </div>

        {/* Time Metric */}
        <div className="metric-box time-box">
          <div className="metric-top">
            <span className="metric-label">{t.time}</span>
            <div className="metric-icon time-icon">
              <Clock size={16} />
            </div>
          </div>

          <div className="metric-value">{timeFormatted}</div>

          <div className="metric-subtext">
            <span>
              {summary.activity_minutes}m {t.activityTime}{' '}
              {'\u2022'} {summary.travel_minutes}m {t.travelTime}
            </span>
          </div>
        </div>

        {/* Carbon Metric */}
        <div className="metric-box carbon-box">
          <div className="metric-top">
            <span className="metric-label">{t.carbon}</span>
            <div className="metric-icon carbon-icon">
              <Leaf size={16} />
            </div>
          </div>

          <div className="metric-value">
            {carbonNum} kg CO{'\u2082'}
          </div>

          <div className="metric-subtext">
            {carbonCapNum ? (
              <span>
                {carbonRemaining.toFixed(1)} kg {t.remaining} ({t.ofCap}{' '}
                {carbonCapNum} kg)
              </span>
            ) : (
              <span>Optimized transit emissions</span>
            )}
          </div>
        </div>

        {/* Stops Metric */}
        <div className="metric-box stops-box">
          <div className="metric-top">
            <span className="metric-label">{t.stops}</span>
            <div className="metric-icon stops-icon">
              <MapPin size={16} />
            </div>
          </div>

          <div className="metric-value">
            {summary.stops_count} Attractions
          </div>

          <div className="metric-subtext">
            <span>
              {summary.day_start} {'\u2192'} {summary.day_end}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
