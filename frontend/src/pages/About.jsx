import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Route,
  Zap,
  Leaf,
  Clock,
  DollarSign,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Database,
  Sliders,
  Users
} from 'lucide-react';
import '../styles/About.css';

export default function About() {
  const techStack = [
    { name: 'Deterministic Optimizer', desc: 'Custom branch-and-bound Pareto solver with hard opening-hour verification' },
    { name: 'APS-09 Database', desc: 'SQLite relational storage with real POI opening hours, ticket costs, and transit matrices' },
    { name: 'Free AI Concierge', desc: 'Abstract LLM interface (Gemini / OpenAI API / heuristic fallback) for natural language intent' },
    { name: 'React 19 & Vite', desc: 'Modern reactive frontend with micro-interactions and zero-lag weight sliders' }
  ];

  const team = [
    { name: 'Core Optimizer Lead', role: 'Algorithm & Mathematical Modeling', bio: 'Engineered multi-objective Pareto trade-offs and relaxation engines.' },
    { name: 'AI & Systems Architect', role: 'Intent Parsing & Grounded LLM', bio: 'Connected natural language prompt understanding to SQLite database constraints.' },
    { name: 'Product & Design Lead', role: 'Frontend Architecture & Design', bio: 'Crafted the premium travel-tech aesthetic and responsive dashboard.' }
  ];

  return (
    <main className="about-page">
      {/* Hero */}
      <section className="about-hero">
        <div className="about-container">
          <div className="about-eyebrow">
            <span className="eyebrow-dot" />
            <span>ABOUT REROUTE</span>
          </div>
          <h1 className="about-hero-title">
            Travel isn't just a list of places.
            <span>It's a mathematical optimization problem.</span>
          </h1>
          <p className="about-hero-desc">
            ReRoute was created to replace chaotic travel guesswork with deterministic constraint verification and sustainable routing.
          </p>
        </div>
      </section>

      {/* 1. What is ReRoute? */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">01 • OVERVIEW</span>
            <h2>What is ReRoute?</h2>
            <p>
              ReRoute is a constraint-aware, multi-objective travel decision engine. Unlike generic map apps that merely connect dots or conversational LLMs that hallucinate fake opening hours and impossible itineraries, ReRoute combines <strong>real SQLite database records</strong> with <strong>mathematical Pareto optimization</strong> to construct itineraries that genuinely work in the real world.
            </p>
          </div>
        </div>
      </section>

      {/* 2. The Problem */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">02 • THE CHALLENGE</span>
            <h2>The Problem with Modern Travel Planning</h2>
            <div className="cards-split-grid">
              <div className="split-box">
                <h4>Hallucinated Schedules</h4>
                <p>Standard AI bots frequently recommend places that are closed on the day of visit or require transit times that are physically impossible.</p>
              </div>
              <div className="split-box">
                <h4>Blind Single-Metric Routing</h4>
                <p>Navigation apps optimize for driving speed alone, ignoring your actual budget, ticket costs, and environmental impact.</p>
              </div>
              <div className="split-box">
                <h4>Ignored Carbon Footprint</h4>
                <p>Urban tourism accounts for substantial carbon emissions, yet travelers rarely have visibility into the footprint of their routing decisions.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Our Solution */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card highlight-card">
            <span className="section-label">03 • THE SOLUTION</span>
            <h2>Our Solution: Deterministic Grounding</h2>
            <p>
              ReRoute guarantees that every attraction in your schedule exists in the verified database, has valid opening hours, and connects through modeled transit legs. If a plan is not feasible within your time or budget, ReRoute never shows an invalid route—it clearly explains why and shows you how to relax exactly one constraint.
            </p>
          </div>
        </div>
      </section>

      {/* 4. How Optimization Works */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">04 • ALGORITHMIC ENGINE</span>
            <h2>How Optimization Works</h2>
            <div className="stages-flow-grid">
              <div className="stage-card">
                <span className="stage-num">STAGE 1</span>
                <h4>Constraint Pruning</h4>
                <p>Strips attractions whose opening windows do not intersect with the traveler's day start and end times.</p>
              </div>
              <div className="stage-card">
                <span className="stage-num">STAGE 2</span>
                <h4>Combinatorial Sequencing</h4>
                <p>Evaluates candidate permutations against transit distance matrices and enforces all mandatory must-see POIs.</p>
              </div>
              <div className="stage-card">
                <span className="stage-num">STAGE 3</span>
                <h4>Pareto Multi-Objective Scoring</h4>
                <p>Scores each valid permutation against the traveler's weighted priorities across Cost, Time, and Carbon.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Cost x Time x Carbon */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">05 • TRI-OBJECTIVE BALANCE</span>
            <h2>Cost × Time × Carbon</h2>
            <p>
              Travel is always a trade-off. Choosing low emissions often favors walking or metro; choosing high speed may require rapid cabs with higher carbon; choosing low cost prioritizes public transit and free landmarks. ReRoute puts the slider in your hands and updates the optimal schedule dynamically.
            </p>
            <div className="tri-grid">
              <div className="tri-item">
                <DollarSign size={20} className="tri-icon cost" />
                <strong>Cost Priority</strong>
                <span>Minimizes admission fees and rideshare expenses.</span>
              </div>
              <div className="tri-item">
                <Clock size={20} className="tri-icon time" />
                <strong>Time Priority</strong>
                <span>Minimizes transit legs and dead waiting periods.</span>
              </div>
              <div className="tri-item">
                <Leaf size={20} className="tri-icon carbon" />
                <strong>Carbon Priority</strong>
                <span>Maximizes green transit (walking & metro) to cut CO₂.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Infeasibility Explainer */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">06 • TRANSPARENT DIAGNOSTICS</span>
            <h2>The Infeasibility Explainer</h2>
            <p>
              When a traveler asks for 4 attractions scattered across Bengaluru in a 2-hour window under ₹200, no feasible itinerary exists. Rather than failing silently or outputting an impossible plan, ReRoute runs its diagnostic engine to identify the exact <strong>binding constraint</strong> (e.g. Time Window or Budget Limit). It then computes a <strong>Single-Constraint Relaxation</strong> so the user can achieve feasibility by tweaking just one parameter.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Technology Stack */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">07 • ARCHITECTURE</span>
            <h2>Technology Stack</h2>
            <div className="tech-cards-grid">
              {techStack.map((tech) => (
                <div key={tech.name} className="tech-pill-card">
                  <Cpu size={18} className="tech-icon" />
                  <div>
                    <h4>{tech.name}</h4>
                    <p>{tech.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 8. Team */}
      <section className="about-section">
        <div className="about-container">
          <div className="content-card">
            <span className="section-label">08 • THE CREATORS</span>
            <h2>Team ReRoute</h2>
            <div className="team-grid">
              {team.map((member) => (
                <div key={member.name} className="team-member-card">
                  <div className="team-avatar-box">
                    <Users size={20} />
                  </div>
                  <h4>{member.name}</h4>
                  <span className="team-role">{member.role}</span>
                  <p>{member.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="about-cta-section">
        <div className="about-container">
          <div className="about-cta-card">
            <h2>Experience the optimizer for yourself</h2>
            <p>Pick a city, set your targets, and explore a day calculated around reality.</p>
            <Link to="/planner" className="btn-about-planner">
              <span>Open ReRoute Planner</span>
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}