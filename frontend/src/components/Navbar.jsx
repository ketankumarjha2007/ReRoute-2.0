import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X, Compass, Route } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import '../styles/Navbar.css';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Planner', path: '/planner' },
    { label: 'Explore', path: '/explore' },
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' }
  ];

  // Close mobile drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      <header className="navbar sticky-header">
        <div className="navbar-container">
          {/* Logo */}
          <Link to="/" className="navbar-logo" aria-label="ReRoute Home">
            <span className="logo-symbol">
              <span className="logo-dot" />
              <span className="logo-ring" />
            </span>
            <span className="logo-name">ReRoute</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="navbar-links" aria-label="Main Navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="navbar-actions">
            <Link to="/planner" className="navbar-cta">
              <span>Plan My Day</span>
              <ArrowUpRight size={16} strokeWidth={2.2} />
            </Link>

            {/* Mobile Menu Button */}
            <button
              type="button"
              className="navbar-menu-button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <div className={`mobile-navigation ${menuOpen ? 'open' : ''}`}>
        <div className="mobile-navigation-inner">
          <div className="mobile-nav-top">
            <div className="mobile-intro">
              <span className="mobile-brand">REROUTE</span>
              <p>Multi-objective travel intelligence for days that actually work.</p>
            </div>
            <button
              type="button"
              className="mobile-close-btn"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="mobile-links" aria-label="Mobile Navigation">
            {navItems.map((item, index) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `mobile-link ${isActive ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mobile-link-number">0{index + 1}</span>
                <span className="mobile-link-label">{item.label}</span>
                <ArrowUpRight size={18} strokeWidth={2} />
              </NavLink>
            ))}
          </nav>

          <Link
            to="/planner"
            className="mobile-cta"
            onClick={() => setMenuOpen(false)}
          >
            <span>
              <small>START PLANNING</small>
              Plan My Day
            </span>
            <ArrowUpRight size={20} />
          </Link>

          <div className="mobile-footer">
            <span>PARETO TRAVEL OPTIMIZER</span>
            <span>APS-09 VERIFIED</span>
          </div>
        </div>
      </div>
    </>
  );
}