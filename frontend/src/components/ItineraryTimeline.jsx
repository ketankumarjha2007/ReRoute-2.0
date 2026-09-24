import React from 'react';
import {
  MapPin,
  Clock,
  DollarSign,
  Leaf,
  Footprints,
  Car,
  Bus,
  Train,
  ArrowDown,
  Navigation,
  Compass
} from 'lucide-react';

function getModeIcon(mode) {
  const m = (mode || '').toLowerCase();
  if (m === 'walk' || m === 'walking') return <Footprints size={15} />;
  if (m === 'metro' || m === 'train' || m === 'rail') return <Train size={15} />;
  if (m === 'bus') return <Bus size={15} />;
  return <Car size={15} />;
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${m} min`;
}

export default function ItineraryTimeline({ stops = [], transfers = [], language = 'en' }) {
  if (!stops || stops.length === 0) {
    return (
      <div className="timeline-empty-state">
        <Compass size={24} />
        <p>No itinerary stops generated yet. Configure constraints or click Optimize.</p>
      </div>
    );
  }

  const t = {
    en: {
      visit: 'Visit',
      transfer: 'Travel via',
      wait: 'Wait for opening',
      entry: 'Entry',
      carbon: 'Carbon',
      hours: 'Hours',
      free: 'Free Entry'
    },
    hi: {
      visit: 'भ्रमण',
      transfer: 'यात्रा साधन',
      wait: 'खुलने की प्रतीक्षा',
      entry: 'शुल्क',
      carbon: 'कार्बन',
      hours: 'समय',
      free: 'निःशुल्क'
    }
  }[language];

  return (
    <div className="vertical-timeline-flow">
      {stops.map((stop, index) => {
        const transfer = index > 0 && transfers[index - 1] ? transfers[index - 1] : null;

        return (
          <div key={stop.poi_id || index} className="timeline-leg-block">
            {/* Transit Step between stops */}
            {transfer && (
              <div className="timeline-transfer-step">
                <div className="transfer-left-gutter">
                  <div className="transfer-spine-line" />
                  <div className="transfer-spine-arrow">
                    <ArrowDown size={14} />
                  </div>
                  <div className="transfer-spine-line" />
                </div>

                <div className="transfer-card-bubble">
                  <div className="transfer-bubble-icon">
                    {getModeIcon(transfer.mode)}
                  </div>
                  <div className="transfer-bubble-text">
                    <div className="transfer-mode-title">
                      ↓ {transfer.minutes} min {transfer.mode.charAt(0).toUpperCase() + transfer.mode.slice(1)}
                    </div>
                    <div className="transfer-sub-info">
                      {transfer.distance_km ? `${transfer.distance_km} km • ` : ''}
                      ₹{transfer.cost} • {transfer.carbon_kg} kg CO₂ • {transfer.departure_time} → {transfer.arrival_time}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attraction Stop Card */}
            <div className="timeline-stop-node">
              <div className="stop-time-column">
                <span className="stop-node-time">{stop.arrival}</span>
                <span className="stop-node-badge-num">{index + 1}</span>
              </div>

              <div className="stop-content-card">
                <div className="stop-top-bar">
                  <div className="stop-title-wrap">
                    <h4 className="stop-card-name">{stop.name}</h4>
                    {stop.category && (
                      <span className="stop-cat-tag">{stop.category}</span>
                    )}
                  </div>
                  <div className="stop-window-span">
                    {stop.arrival} – {stop.departure}
                  </div>
                </div>

                <div className="stop-duration-highlight">
                  <Clock size={13} />
                  <span>{formatDuration(stop.duration_minutes)}</span>
                </div>

                <div className="stop-data-badges">
                  <div className="stop-data-pill cost">
                    <DollarSign size={12} />
                    <span>{parseFloat(stop.entry_cost) > 0 ? `₹${stop.entry_cost}` : t.free}</span>
                  </div>

                  <div className="stop-data-pill carbon">
                    <Leaf size={12} />
                    <span>{stop.carbon_kg} kg CO₂</span>
                  </div>

                  {stop.opens_at && stop.closes_at && (
                    <div className="stop-data-pill hours">
                      <Clock size={12} />
                      <span>{stop.opens_at} – {stop.closes_at}</span>
                    </div>
                  )}
                </div>

                {stop.wait_minutes > 0 && (
                  <div className="stop-wait-banner">
                    <Clock size={13} />
                    <span>{t.wait} ({stop.wait_minutes} min until {stop.opens_at} opening)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
