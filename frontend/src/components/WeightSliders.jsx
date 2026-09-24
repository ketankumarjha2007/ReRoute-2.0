import React from 'react';
import { DollarSign, Clock, Leaf, Sparkles, Scale, Zap } from 'lucide-react';

export default function WeightSliders({ weights, onChange, disabled = false, language = 'en' }) {
  const t = {
    en: {
      title: 'OPTIMIZATION PRIORITIES',
      subtitle: 'Adjust trade-offs. Changing weights recalculates the optimal route.',
      cost: 'Cost',
      time: 'Time',
      carbon: 'Carbon',
      presets: 'Presets',
      balanced: 'Balanced',
      cheapest: 'Cheapest',
      fastest: 'Fastest',
      greenest: 'Greenest'
    },
    hi: {
      title: 'अनुकूलन प्राथमिकताएं',
      subtitle: 'प्राथमिकताएं बदलें। स्लाइडर बदलने से सर्वोत्तम मार्ग स्वतः पुनर्गणना होता है।',
      cost: 'लागत (Cost)',
      time: 'समय (Time)',
      carbon: 'कार्बन (Carbon)',
      presets: 'प्रीसेट्स',
      balanced: 'संतुलित (Balanced)',
      cheapest: 'किफायती (Cheapest)',
      fastest: 'द्रुत (Fastest)',
      greenest: 'पर्यावरण-अनुकूल (Greenest)'
    }
  }[language];

  // Calculate percentages (ensure integer sum is 100)
  const costPct = Math.round(weights.cost * 100);
  const timePct = Math.round(weights.time * 100);
  const carbonPct = 100 - costPct - timePct;

  // Live description based on dominant weight
  let liveDescription = 'Your preferences are balanced across cost, time, and emissions.';
  if (weights.carbon >= 0.45) {
    liveDescription = 'Your preferences currently prioritize lower carbon travel.';
  } else if (weights.cost >= 0.45) {
    liveDescription = 'Your preferences currently prioritize budget savings and low cost.';
  } else if (weights.time >= 0.45) {
    liveDescription = 'Your preferences currently prioritize fastest transit and time efficiency.';
  } else if (weights.carbon > weights.cost && weights.carbon > weights.time) {
    liveDescription = 'Your preferences slightly lean toward eco-friendly transit and lower emissions.';
  } else if (weights.cost > weights.time && weights.cost > weights.carbon) {
    liveDescription = 'Your preferences slightly lean toward cost savings.';
  } else if (weights.time > weights.cost && weights.time > weights.carbon) {
    liveDescription = 'Your preferences slightly lean toward faster travel.';
  }

  // Handle manual slider drag
  const handleSliderChange = (changedKey, newVal) => {
    const val = Math.max(5, Math.min(90, parseInt(newVal, 10)));
    const remaining = 100 - val;

    const otherKeys = ['cost', 'time', 'carbon'].filter(k => k !== changedKey);
    const sumOthers = (weights[otherKeys[0]] + weights[otherKeys[1]]) || 0.0001;

    const newW0 = Math.round((weights[otherKeys[0]] / sumOthers) * remaining);
    const newW1 = remaining - newW0;

    const rawWeights = {
      [changedKey]: val / 100,
      [otherKeys[0]]: Math.max(5, newW0) / 100,
      [otherKeys[1]]: Math.max(5, newW1) / 100
    };

    // Normalize precisely to 1.00
    const sum = rawWeights.cost + rawWeights.time + rawWeights.carbon;
    onChange({
      cost: Number((rawWeights.cost / sum).toFixed(2)),
      time: Number((rawWeights.time / sum).toFixed(2)),
      carbon: Number((rawWeights.carbon / sum).toFixed(2))
    });
  };

  // Presets
  const applyPreset = (presetName) => {
    if (disabled) return;
    if (presetName === 'BALANCED') {
      onChange({ cost: 0.33, time: 0.33, carbon: 0.34 });
    } else if (presetName === 'CHEAPEST') {
      onChange({ cost: 0.60, time: 0.20, carbon: 0.20 });
    } else if (presetName === 'FASTEST') {
      onChange({ cost: 0.20, time: 0.60, carbon: 0.20 });
    } else if (presetName === 'GREENEST') {
      onChange({ cost: 0.20, time: 0.20, carbon: 0.60 });
    }
  };

  const isPresetActive = (presetName) => {
    if (presetName === 'BALANCED') {
      return Math.abs(weights.cost - 0.33) < 0.05 && Math.abs(weights.time - 0.33) < 0.05;
    }
    if (presetName === 'CHEAPEST') return weights.cost >= 0.55;
    if (presetName === 'FASTEST') return weights.time >= 0.55;
    if (presetName === 'GREENEST') return weights.carbon >= 0.55;
    return false;
  };

  return (
    <div className="weights-card">
      <div className="card-header">
        <div className="weights-header-top">
          <h3 className="section-title">{t.title}</h3>
          <span className="weights-sum-badge">100% Total</span>
        </div>
        <p className="section-subtitle">{t.subtitle}</p>
      </div>

      {/* Preset Buttons */}
      <div className="preset-buttons-row">
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyPreset('BALANCED')}
          className={`preset-btn ${isPresetActive('BALANCED') ? 'active' : ''}`}
        >
          <Scale size={13} />
          <span>{t.balanced}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => applyPreset('CHEAPEST')}
          className={`preset-btn ${isPresetActive('CHEAPEST') ? 'active' : ''}`}
        >
          <DollarSign size={13} />
          <span>{t.cheapest}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => applyPreset('FASTEST')}
          className={`preset-btn ${isPresetActive('FASTEST') ? 'active' : ''}`}
        >
          <Zap size={13} />
          <span>{t.fastest}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => applyPreset('GREENEST')}
          className={`preset-btn ${isPresetActive('GREENEST') ? 'active' : ''}`}
        >
          <Leaf size={13} />
          <span>{t.greenest}</span>
        </button>
      </div>

      <div className="slider-group">
        {/* Cost Slider */}
        <div className="slider-row">
          <div className="slider-label">
            <span className="slider-icon-box cost">
              <DollarSign size={15} />
            </span>
            <span className="slider-name">{t.cost}</span>
            <span className="slider-value cost-val">{costPct}%</span>
          </div>
          <div className="slider-track-container">
            <input
              type="range"
              min="5"
              max="90"
              value={costPct}
              disabled={disabled}
              onChange={(e) => handleSliderChange('cost', e.target.value)}
              className="slider-input cost-slider"
              aria-label="Cost priority percentage"
            />
          </div>
        </div>

        {/* Time Slider */}
        <div className="slider-row">
          <div className="slider-label">
            <span className="slider-icon-box time">
              <Clock size={15} />
            </span>
            <span className="slider-name">{t.time}</span>
            <span className="slider-value time-val">{timePct}%</span>
          </div>
          <div className="slider-track-container">
            <input
              type="range"
              min="5"
              max="90"
              value={timePct}
              disabled={disabled}
              onChange={(e) => handleSliderChange('time', e.target.value)}
              className="slider-input time-slider"
              aria-label="Time priority percentage"
            />
          </div>
        </div>

        {/* Carbon Slider */}
        <div className="slider-row">
          <div className="slider-label">
            <span className="slider-icon-box carbon">
              <Leaf size={15} />
            </span>
            <span className="slider-name">{t.carbon}</span>
            <span className="slider-value carbon-val">{carbonPct}%</span>
          </div>
          <div className="slider-track-container">
            <input
              type="range"
              min="5"
              max="90"
              value={carbonPct}
              disabled={disabled}
              onChange={(e) => handleSliderChange('carbon', e.target.value)}
              className="slider-input carbon-slider"
              aria-label="Carbon priority percentage"
            />
          </div>
        </div>
      </div>

      {/* Live Description */}
      <div className="weights-live-desc">
        <Sparkles size={14} className="sparkle-hint" />
        <span>"{liveDescription}"</span>
      </div>
    </div>
  );
}
