import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Leaf,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Sliders,
  Compass,
  CheckCircle2,
  Footprints,
  Train,
  Check,
  Zap,
  BarChart3
} from 'lucide-react';
import '../styles/Home.css';

export default function Home() {
  const steps = [
    {
      num: '01',
      title: 'Choose',
      desc: 'Pick any of our 40+ database cities and set your preferred date and daily time window.'
    },
    {
      num: '02',
      title: 'Customize',
      desc: 'Set your budget ceiling, carbon targets, mandatory must-see attractions, and objective priorities.'
    },
    {
      num: '03',
      title: 'Optimize',
      desc: 'Our deterministic multi-objective solver evaluates travel matrices and opening hours in milliseconds.'
    },
    {
      num: '04',
      title: 'Explore',
      desc: 'Walk through your chronological, constraint-verified itinerary with transparent trade-off analytics.'
    }
  ];

  const features = [
    {
      icon: Sliders,
      title: 'Multi-objective optimization',
      description: 'Simultaneously balances cost, transit time, and carbon footprint rather than single-metric shortcuts.'
    },
    {
      icon: Leaf,
      title: 'Carbon-aware planning',
      description: 'Accurately quantifies transit emissions across walking, metro, bus, and rideshare to minimize your footprint.'
    },
    {
      icon: ShieldCheck,
      title: 'Constraint-aware routing',
      description: 'Hard-verifies real museum opening hours, travel matrices, and admission costs from SQLite.'
    },
    {
      icon: Sparkles,
      title: 'AI itinerary planning',
      description: 'Extracts preferences from natural language prompts and grounds them strictly into real database POIs.'
    },
    {
      icon: Route,
      title: 'Infeasibility explanation',
      description: 'Pinpoints the exact binding constraint when a day cannot fit, offering single-constraint relaxation.'
    }
  ];

  return (
    <main className="home">
      {/* =====================================================
          HERO SECTION
      ===================================================== */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />

        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="eyebrow-dot" />
              <span>MULTI-OBJECTIVE TRAVEL INTELLIGENCE</span>
            </div>

            <h1 className="hero-title">
              Plan smarter.
              <span className="hero-title-accent">Travel lighter.</span>
            </h1>

            <p className="hero-description">
              ReRoute optimizes your itinerary across cost, time and carbon while respecting real-world constraints.
            </p>

            <div className="hero-actions">
              <Link to="/planner" className="hero-primary">
                <span>PLAN MY DAY</span>
                <ArrowRight size={18} />
              </Link>

              <Link to="/explore" className="hero-secondary">
                <span>EXPLORE DESTINATIONS</span>
                <ArrowUpRight size={17} />
              </Link>
            </div>

            {/* Proof metrics */}
            <div className="hero-proof">
              <div className="hero-proof-item">
                <strong>40+</strong>
                <span>Active Cities</span>
              </div>
              <div className="hero-proof-line" />
              <div className="hero-proof-item">
                <strong>3</strong>
                <span>Objectives (Cost • Time • Carbon)</span>
              </div>
              <div className="hero-proof-line" />
              <div className="hero-proof-item">
                <strong>100%</strong>
                <span>Deterministic Grounding</span>
              </div>
            </div>
          </div>

          {/* Product Dashboard Preview */}
          <div className="hero-visual">
            <div className="product-preview-mockup">
              <div className="mockup-header-bar">
                <div className="mockup-dots">
                  <span className="m-dot red" />
                  <span className="m-dot yellow" />
                  <span className="m-dot green" />
                </div>
                <span className="mockup-tab-title">ReRoute Optimizer • Bengaluru Day Plan</span>
                <span className="mockup-live-pill">FEASIBLE ✓</span>
              </div>

              {/* Three Metrics Preview */}
              <div className="mockup-metrics-row">
                <div className="mock-metric-card">
                  <span className="mm-label">TOTAL COST</span>
                  <strong className="mm-val">₹1,240</strong>
                  <span className="mm-sub">Budget: ₹2,500</span>
                </div>
                <div className="mock-metric-card">
                  <span className="mm-label">TOTAL TIME</span>
                  <strong className="mm-val">6h 20m</strong>
                  <span className="mm-sub">09:00 – 15:20</span>
                </div>
                <div className="mock-metric-card">
                  <span className="mm-label">CARBON FOOTPRINT</span>
                  <strong className="mm-val green">3.8 kg CO₂</strong>
                  <span className="mm-sub">Low-emission transit</span>
                </div>
              </div>

              {/* Timeline Preview Snippet */}
              <div className="mockup-timeline-snippet">
                <div className="mock-stop">
                  <span className="mock-time">09:00</span>
                  <div className="mock-stop-dot" />
                  <div className="mock-stop-info">
                    <strong>Bengaluru Palace</strong>
                    <span>Heritage • 120 mins • ₹350</span>
                  </div>
                </div>

                <div className="mock-transit">
                  <div className="mock-transit-line" />
                  <span className="mock-transit-tag">
                    <Train size={12} /> ↓ 18m Metro • 0.3 kg CO₂
                  </span>
                  <div className="mock-transit-line" />
                </div>

                <div className="mock-stop">
                  <span className="mock-time">11:38</span>
                  <div className="mock-stop-dot" />
                  <div className="mock-stop-info">
                    <strong>Cubbon Park & Museum</strong>
                    <span>Nature • 90 mins • ₹50</span>
                  </div>
                </div>
              </div>

              {/* Grounded AI Explainer Badge */}
              <div className="mockup-explainer-bar">
                <Sparkles size={14} className="sparkle-gold" />
                <span>Emissions prioritized (40% weight) with verified opening hours.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          HOW IT WORKS SECTION
      ===================================================== */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="section-container">
          <div className="section-heading-centered">
            <span className="section-kicker">STEP-BY-STEP WORKFLOW</span>
            <h2>HOW IT WORKS</h2>
            <p>From initial intent to a verified, mathematical day plan in four transparent steps.</p>
          </div>

          <div className="steps-grid">
            {steps.map((step) => (
              <div key={step.num} className="step-card">
                <span className="step-num">{step.num}</span>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
                <div className="step-indicator-bar" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          FEATURES SECTION
      ===================================================== */}
      <section className="features-section">
        <div className="section-container">
          <div className="section-heading-centered">
            <span className="section-kicker">BUILT FOR REAL TRAVEL DECISIONS</span>
            <h2>CORE OPTIMIZATION FEATURES</h2>
            <p>Engineered to prevent impossible routes, unrealistic transfers, and bloated carbon footprints.</p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-icon">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <div className="feature-content">
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* =====================================================
          FINAL CTA
      ===================================================== */}
      <section className="final-cta">
        <div className="final-cta-inner">
          <div className="final-cta-icon">
            <Route size={26} />
          </div>
          <div>
            <span className="final-cta-label">START OPTIMIZING</span>
            <h2>
              Ready to experience
              <span>a day that actually works?</span>
            </h2>
            <p>Try the planner now with free AI intent assistance or manual priority controls.</p>
          </div>
          <Link to="/planner" className="final-cta-button">
            <span>PLAN MY DAY</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}