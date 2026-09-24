import React from 'react';
import { DollarSign, Clock, Leaf, MapPin, ArrowDownRight, Compass } from 'lucide-react';

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
      heading: 'आपका अनुकूलित दिन',
      cost: 'कुल लागत',
      time: 'कुल समय',
      carbon: 'कार्बन पदचिह्न',
      stops: 'कुल पड़ाव',
      activityTime: 'गतिविधियां',
      travelTime: 'पारगमन',
      wait: 'प्रतीक्षा',
      remaining: 'शेष',
      ofCap: 'सीमा में से'
    }
  }[language];

  // Parse costs and caps safely
  const costNum = parseFloat(summary.cost) || 0;
  const budgetNum = budgetCap ? parseFloat(budgetCap) : null;
  const budgetRemaining = budgetNum ? Math.max(0, budgetNum - costNum) : null;

  // Format time
  const totalMins = summary.minutes || 0;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Carbon
  const carbonNum = summary.carbon_kg !== undefined ? Number(summary.carbon_kg).toFixed(1) : '0.0';
  const carbonCapNum = carbonCap ? parseFloat(carbonCap) : null;
  const carbonRemaining = carbonCapNum ? Math.max(0, carbonCapNum - parseFloat(carbonNum)) : null;

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
          <div className="metric-value">₹{summary.cost}</div>
          <div className="metric-subtext">
            {budgetNum ? (
              <span>₹{budgetRemaining.toFixed(0)} {t.remaining} ({t.ofCap} ₹{budgetNum})</span>
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
            <span>{summary.activity_minutes}m {t.activityTime} • {summary.travel_minutes}m {t.travelTime}</span>
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
          <div className="metric-value">{carbonNum} kg CO₂</div>
          <div className="metric-subtext">
            {carbonCapNum ? (
              <span>{carbonRemaining.toFixed(1)} kg {t.remaining} ({t.ofCap} {carbonCapNum} kg)</span>
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
          <div className="metric-value">{summary.stops_count} Attractions</div>
          <div className="metric-subtext">
            <span>{summary.day_start} → {summary.day_end}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
