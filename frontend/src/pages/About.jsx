import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, X, Leaf, Clock, Wallet, Cpu, Database, Sparkles, Layers,
  ShieldCheck, Route,
} from 'lucide-react';
import '../styles/About.css';

const PROBLEMS = [
  ['Hallucinated schedules', 'Chatbots recommend places that are closed on the day you visit, or hops that are physically impossible.'],
  ['One-metric routing', 'Map apps optimize for speed alone and ignore your budget, ticket prices and environmental impact.'],
  ['Invisible carbon', 'Urban tourism adds up to real emissions, yet travelers rarely see the footprint of a routing choice.'],
];

const STAGES = [
  ['Prune', 'Constraint pruning', "Removes attractions whose opening windows never overlap your day."],
  ['Sequence', 'Combinatorial sequencing', 'Tests candidate orders against transit matrices and keeps every must-see stop.'],
  ['Score', 'Pareto multi-objective scoring', 'Ranks each valid order by your weighted priorities across cost, time and carbon.'],
];

const OBJECTIVES = [
  [Wallet, 'Cost', 'Minimizes admission fees and rideshare spend.', 'Public transit, free landmarks'],
  [Clock, 'Time', 'Minimizes transit legs and dead waiting.', 'Fewer hops, tighter order'],
  [Leaf, 'Carbon', 'Favors walking and metro to cut CO₂.', 'Green legs first'],
];

const TECH = [
  [Cpu, 'Deterministic optimizer', 'Custom branch-and-bound Pareto solver with hard opening-hour checks.'],
  [Database, 'APS-09 database', 'SQLite storage of real opening hours, ticket costs and transit matrices.'],
  [Sparkles, 'Free AI concierge', 'Swappable LLM layer (Gemini, OpenAI or a heuristic fallback) that turns plain language into constraints.'],
  [Layers, 'React 19 and Vite', 'A reactive frontend with instant weight sliders.'],
];

const TEAM = [
  ['CO', 'Core Optimizer Lead', 'Algorithm and mathematical modeling', 'Built the multi-objective Pareto trade-offs and the relaxation engine.'],
  ['AI', 'AI and Systems Architect', 'Intent parsing and grounded LLM', 'Connected natural-language prompts to SQLite database constraints.'],
  ['PD', 'Product and Design Lead', 'Frontend architecture and design', 'Shaped the travel-tech look and the responsive dashboard.'],
];

/* Demo model: ~75 min per stop, 25 min per transfer, ~₹140 per stop */
const need = (n) => ({ time: n * 75 + (n - 1) * 25, cost: n * 140 });

function Explainer() {
  const [n, setN] = useState(4);
  const [h, setH] = useState(2);
  const [b, setB] = useState(200);

  const r = useMemo(() => {
    const d = need(n);
    const tRatio = d.time / (h * 60), cRatio = d.cost / b;
    if (tRatio <= 1 && cRatio <= 1) return { ok: true, d };
    const bind = tRatio >= cRatio ? 'time' : 'cost';
    let k = n; while (k > 0 && (need(k).time > h * 60 || need(k).cost > b)) k--;
    return {
      ok: false, d, bind, k,
      fix: bind === 'time'
        ? `Extend your day by ${d.time - h * 60} min`
        : `Raise your budget by ₹${d.cost - b}`,
    };
  }, [n, h, b]);

  const Row = ({ label, val, min, max, step, set, fmt }) => (
    <label className="ab-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(Number(e.target.value))}
        style={{ '--f': `${((val - min) / (max - min)) * 100}%` }} />
      <output>{fmt(val)}</output>
    </label>
  );

  return (
    <div className="ab-lab">
      <div className="ab-lab-in">
        <p className="ab-lab-t">Try to break the planner</p>
        <Row label="Attractions" val={n} min={1} max={6} step={1} set={setN} fmt={(v) => v} />
        <Row label="Time window" val={h} min={1} max={8} step={1} set={setH} fmt={(v) => `${v} h`} />
        <Row label="Budget" val={b} min={100} max={1500} step={50} set={setB} fmt={(v) => `₹${v}`} />
        <p className="ab-fine">Demo assumes about 75 min per stop, 25 min per transfer and ₹140 per stop.</p>
      </div>
      <div className={`ab-verdict ${r.ok ? 'ok' : 'bad'}`} key={`${r.ok}-${r.bind}`} aria-live="polite">
        <span className="ab-badge">{r.ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}{r.ok ? 'Feasible' : 'Infeasible'}</span>
        {r.ok ? (
          <p>This day fits. It needs {Math.floor(r.d.time / 60)} h {r.d.time % 60} min and about ₹{r.d.cost}.</p>
        ) : (
          <>
            <p>The <strong>{r.bind === 'time' ? 'time window' : 'budget limit'}</strong> is the binding constraint. This plan needs {Math.floor(r.d.time / 60)} h {r.d.time % 60} min and ₹{r.d.cost}.</p>
            <p className="ab-fix"><strong>Relax just one:</strong> {r.fix}, or drop to {r.k} {r.k === 1 ? 'stop' : 'stops'}.</p>
          </>
        )}
      </div>
    </div>
  );
}

const Section = ({ n, title, lead, children, dark, id }) => (
  <section className={`ab-sec${dark ? ' dark' : ''}`} id={id}>
    <div className="ab-wrap ab-split">
      <header className="ab-head">
        <span className="ab-n">{n}</span>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      <div className="ab-body">{children}</div>
    </div>
  </section>
);

export default function About() {
  const bar = useRef(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = document.documentElement;
      const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, p)})`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('scroll', on, { passive: true });
    tick();
    return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <main className="about-page">
      <div className="ab-progress" ref={bar} aria-hidden="true" />

      <section className="ab-hero">
        <div className="ab-wrap">
          <p className="ab-pill"><span className="ab-dot" /> About ReRoute</p>
          <h1>
            Travel isn't just a list of places.
            <em>It's an optimization problem.</em>
          </h1>
          <p className="ab-lead">
            ReRoute replaces travel guesswork with verified constraints and sustainable routing, so every stop in your day is real, open and reachable.
          </p>
          <div className="ab-hero-row">
            <Link to="/planner" className="ab-btn ab-btn-dark">Open the planner <ArrowRight size={17} /></Link>
            <a href="#break-it" className="ab-btn ab-btn-ghost">See it explain itself</a>
          </div>
        </div>
      </section>

      <Section n="01" title="What is ReRoute?">
        <p className="ab-big">
          A constraint-aware, multi-objective travel decision engine. Map apps only connect dots, and chatbots invent opening hours. ReRoute pairs <strong>real SQLite records</strong> with <strong>Pareto optimization</strong> to build itineraries that work in the real world.
        </p>
      </Section>

      <Section n="02" title="What's wrong with travel planning today" lead="Three failures we built ReRoute to fix.">
        <ul className="ab-problems">
          {PROBLEMS.map(([t, d], i) => (
            <li key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>
          ))}
        </ul>
      </Section>

      <Section n="03" title="Deterministic grounding" dark>
        <p className="ab-big">
          Every attraction in your schedule exists in the verified database, has valid opening hours and connects through modeled transit legs. If a plan can't fit your time or budget, ReRoute never shows an invalid route. It explains why and shows you how to <strong>relax exactly one constraint</strong>.
        </p>
        <div className="ab-checks">
          {['Real places only', 'Opening hours verified', 'Transit legs modeled'].map((t) => (
            <span key={t}><ShieldCheck size={15} /> {t}</span>
          ))}
        </div>
      </Section>

      <Section n="04" title="How optimization works">
        <ol className="ab-stages">
          {STAGES.map(([tag, t, d], i) => (
            <li key={t}>
              <span className="ab-stage-i">{i + 1}</span>
              <div><small>{tag}</small><h3>{t}</h3><p>{d}</p></div>
            </li>
          ))}
        </ol>
      </Section>

      <Section n="05" title="Cost × Time × Carbon" lead="Travel is always a trade-off. You hold the sliders and the schedule updates to match.">
        <div className="ab-tri">
          {OBJECTIVES.map(([I, t, d, s]) => (
            <article key={t}>
              <span className="ab-ico"><I size={20} /></span>
              <h3>{t} priority</h3>
              <p>{d}</p>
              <em>{s}</em>
            </article>
          ))}
        </div>
      </Section>

      <Section n="06" title="The infeasibility explainer" id="break-it"
        lead="Ask for four attractions in two hours under ₹200 and no plan exists. Instead of failing silently, ReRoute names the binding constraint.">
        <Explainer />
      </Section>

      <Section n="07" title="Technology stack">
        <ul className="ab-tech">
          {TECH.map(([I, t, d]) => (
            <li key={t}><span className="ab-ico dark"><I size={18} /></span><div><h3>{t}</h3><p>{d}</p></div></li>
          ))}
        </ul>
      </Section>

      <Section n="08" title="Team ReRoute">
        <div className="ab-team">
          {TEAM.map(([ini, name, role, bio]) => (
            <article key={name}>
              <span className="ab-av">{ini}</span>
              <h3>{name}</h3>
              <small>{role}</small>
              <p>{bio}</p>
            </article>
          ))}
        </div>
      </Section>

      <section className="ab-cta-wrap">
        <div className="ab-cta">
          <Route className="ab-cta-ico" size={30} />
          <h2>Experience the optimizer for yourself</h2>
          <p>Pick a city, set your targets and explore a day calculated around reality.</p>
          <Link to="/planner" className="ab-btn ab-btn-lime">Open ReRoute planner <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  );
}