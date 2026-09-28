import React, { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, Leaf, Route, ShieldCheck, Sparkles, Sliders,
  Train, Footprints, Bus, Car, Check, MapPin, Wallet, Clock3,
} from 'lucide-react';
import '../styles/Home.css';

/* Candidate day plans the demo optimizer chooses between */
const PLANS = [
  { id: 'balanced', name: 'Metro-first', cost: 1240, time: 380, co2: 3.8, Icon: Train,
    stops: [['09:00', 'Bengaluru Palace', 'Heritage · 120 min · ₹350'], ['11:38', 'Cubbon Park & Museum', 'Nature · 90 min · ₹50'], ['13:40', 'Lalbagh Botanical Garden', 'Nature · 100 min · ₹30']],
    legs: ['Metro 18 min · 0.3 kg', 'Metro + walk 22 min · 0.4 kg'] },
  { id: 'fast', name: 'Cab hopper', cost: 2180, time: 300, co2: 9.6, Icon: Car,
    stops: [['09:00', 'Bengaluru Palace', 'Heritage · 90 min · ₹350'], ['10:52', 'Vidhana Soudha', 'Landmark · 40 min · Free'], ['12:10', 'Lalbagh Botanical Garden', 'Nature · 80 min · ₹30']],
    legs: ['Cab 12 min · 2.6 kg', 'Cab 15 min · 3.1 kg'] },
  { id: 'cheap', name: 'City bus loop', cost: 690, time: 455, co2: 2.6, Icon: Bus,
    stops: [['09:00', 'Cubbon Park & Museum', 'Nature · 90 min · ₹50'], ['11:20', 'Lalbagh Botanical Garden', 'Nature · 100 min · ₹30'], ['14:05', 'Bull Temple', 'Heritage · 45 min · Free']],
    legs: ['Bus 35 min · 0.5 kg', 'Bus 40 min · 0.6 kg'] },
  { id: 'green', name: 'Walk + metro', cost: 980, time: 470, co2: 1.4, Icon: Footprints,
    stops: [['09:00', 'Cubbon Park & Museum', 'Nature · 100 min · ₹50'], ['11:25', 'Lalbagh Botanical Garden', 'Nature · 110 min · ₹30'], ['14:00', 'Bull Temple', 'Heritage · 45 min · Free']],
    legs: ['Walk 25 min · 0 kg', 'Metro 20 min · 0.3 kg'] },
];

const PRESETS = [
  { label: 'Balanced', w: { cost: 34, time: 33, co2: 33 } },
  { label: 'Fastest', w: { cost: 10, time: 80, co2: 10 } },
  { label: 'Cheapest', w: { cost: 80, time: 10, co2: 10 } },
  { label: 'Greenest', w: { cost: 10, time: 10, co2: 80 } },
];

const STEPS = [
  ['Choose', 'Pick one of 40+ cities, a date and your daily time window.'],
  ['Customize', 'Set a budget ceiling, carbon target, must-see places and what matters most.'],
  ['Optimize', 'The solver checks travel times and opening hours across every option in milliseconds.'],
  ['Explore', 'Follow a verified, chronological plan and see exactly what each trade-off costs you.'],
];

const FEATURES = [
  { Icon: Sliders, title: 'Balances cost, time and carbon together', text: 'No single-metric shortcuts. Move a slider and the whole day re-plans around it.', wide: true },
  { Icon: Leaf, title: 'Carbon-aware', text: 'Emissions counted for walking, metro, bus and rideshare.' },
  { Icon: ShieldCheck, title: 'Checked against reality', text: 'Real opening hours, travel matrices and admission prices.' },
  { Icon: Sparkles, title: 'Plan in plain language', text: 'Describe your day; preferences are matched to real places in the database.' },
  { Icon: Route, title: 'Explains when a day cannot fit', text: 'See the exact constraint that blocks the plan and relax just that one.', wide: true },
];

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Jaipur', 'Kochi', 'Goa', 'Ahmedabad', 'Mysuru'];

const fmt = (n) => n.toLocaleString('en-IN');
const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export default function Home() {
  const [w, setW] = useState(PRESETS[0].w);
  const [active, setActive] = useState('Balanced');

  const best = useMemo(() => {
    const r = (k) => [Math.min(...PLANS.map((p) => p[k])), Math.max(...PLANS.map((p) => p[k]))];
    const [c0, c1] = r('cost'), [t0, t1] = r('time'), [e0, e1] = r('co2');
    const n = (v, a, b) => (v - a) / (b - a);
    return PLANS.map((p) => ({
      p, s: w.cost * n(p.cost, c0, c1) + w.time * n(p.time, t0, t1) + w.co2 * n(p.co2, e0, e1),
    })).sort((a, b) => a.s - b.s)[0].p;
  }, [w]);

  const setWeight = (key) => (e) => {
    setActive('Custom');
    setW((prev) => ({ ...prev, [key]: Number(e.target.value) }));
  };
  const pick = (pr) => { setActive(pr.label); setW(pr.w); };

  const spotlight = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  const total = w.cost + w.time + w.co2 || 1;
  const pct = (v) => Math.round((v / total) * 100);
  const Mode = best.Icon;

  return (
    <main className="home">
      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-tag"><span className="live-dot" /> Now planning 40+ cities</p>
            <h1>
              Plan smarter.
              <em>Travel lighter.</em>
            </h1>
            <p className="hero-lead">
              ReRoute builds your day around what you care about most: what you spend, how long it
              takes, and the carbon you leave behind, always within real opening hours.
            </p>
            <div className="hero-cta">
              <Link to="/planner" className="btn btn-dark">Plan my day <ArrowRight size={18} /></Link>
              <Link to="/explore" className="btn btn-ghost">Explore destinations <ArrowUpRight size={17} /></Link>
            </div>
            <dl className="hero-stats">
              <div><dt>40+</dt><dd>cities</dd></div>
              <div><dt>3</dt><dd>goals balanced</dd></div>
              <div><dt>100%</dt><dd>verified stops</dd></div>
            </dl>
          </div>

          {/* Live optimizer */}
          <div className="optimizer" role="group" aria-label="Live itinerary optimizer demo">
            <div className="opt-top">
              <span>Bengaluru · one-day plan</span>
              <span className="opt-ok"><Check size={13} strokeWidth={3} /> Feasible</span>
            </div>

            <div className="opt-presets" role="tablist">
              {[...PRESETS, ...(active === 'Custom' ? [{ label: 'Custom' }] : [])].map((pr) => (
                <button key={pr.label} type="button" role="tab" aria-selected={active === pr.label}
                  className={active === pr.label ? 'on' : ''} onClick={() => pr.w && pick(pr)}>
                  {pr.label}
                </button>
              ))}
            </div>

            <div className="opt-sliders">
              {[['cost', 'Cost', Wallet], ['time', 'Time', Clock3], ['co2', 'Carbon', Leaf]].map(([k, label, I]) => (
                <label key={k} className="slider">
                  <span className="slider-l"><I size={14} /> {label}</span>
                  <input type="range" min="0" max="100" value={w[k]} onChange={setWeight(k)}
                    style={{ '--fill': `${w[k]}%` }} aria-label={`${label} priority`} />
                  <span className="slider-v">{pct(w[k])}%</span>
                </label>
              ))}
            </div>

            <div className="opt-result" key={best.id}>
              <div className="opt-plan"><Mode size={16} /> {best.name}</div>
              <div className="opt-metrics">
                <div><small>Total cost</small><strong>₹{fmt(best.cost)}</strong></div>
                <div><small>Total time</small><strong>{hm(best.time)}</strong></div>
                <div className={best.co2 < 4 ? 'good' : ''}><small>Carbon</small><strong>{best.co2} kg</strong></div>
              </div>
              <ol className="timeline">
                {best.stops.map(([t, n, m], i) => (
                  <li key={n}>
                    <time>{t}</time>
                    <div>
                      <strong>{n}</strong>
                      <span>{m}</span>
                      {best.legs[i] && <em><MapPin size={11} /> {best.legs[i]}</em>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[...CITIES, ...CITIES].map((c, i) => <span key={i}>{c}</span>)}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how-it-works">
        <div className="wrap">
          <header className="sec-head">
            <h2>From a rough idea to a day that works</h2>
            <p>Four steps, no spreadsheets, and every stop checked before you leave.</p>
          </header>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="step">
                <span className="step-n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section section-tint">
        <div className="wrap">
          <header className="sec-head">
            <h2>Built to prevent impossible days</h2>
            <p>No closed museums, no unrealistic transfers, no bloated carbon footprint.</p>
          </header>
          <div className="bento">
            {FEATURES.map(({ Icon, title, text, wide }) => (
              <article key={title} className={`bento-card${wide ? ' wide' : ''}`} onMouseMove={spotlight}>
                <span className="bento-icon"><Icon size={22} strokeWidth={1.8} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-wrap">
        <div className="cta">
          <div className="cta-icon"><Route size={26} /></div>
          <div className="cta-text">
            <h2>Ready for a day that actually works?</h2>
            <p>Start with a plain-language prompt, or set your priorities by hand.</p>
          </div>
          <Link to="/planner" className="btn btn-lime">Plan my day <ArrowRight size={18} /></Link>
        </div>
      </section>
    </main>
  );
}