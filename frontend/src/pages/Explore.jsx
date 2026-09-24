import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import {
  Search,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Compass,
  X,
  Loader2
} from 'lucide-react';

import { getCities } from '../services/api';
import '../styles/Explore.css';

export default function Explore() {
  const navigate = useNavigate();

  // -----------------------------
  // STATE
  // -----------------------------
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');

  // -----------------------------
  // LOAD CITIES
  // -----------------------------
  useEffect(() => {
    let mounted = true;

    async function loadCities() {
      try {
        setLoading(true);
        setError('');

        const data = await getCities();

        console.log('Explore API response:', data);

        if (!mounted) return;

        if (data && Array.isArray(data.cities)) {
          setCities(data.cities);
        } else {
          setCities([]);
          setError('No city data was returned from the database.');
        }
      } catch (err) {
        console.error('Failed to load explore cities:', err);

        if (!mounted) return;

        setError(
          'Failed to fetch cities from database. Please ensure the backend is running.'
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCities();

    return () => {
      mounted = false;
    };
  }, []);

  // -----------------------------
  // UNIQUE REGIONS
  // -----------------------------
  const regions = useMemo(() => {
    const regionSet = new Set();

    cities.forEach((city) => {
      if (city?.region) {
        regionSet.add(String(city.region));
      }
    });

    return ['All', ...Array.from(regionSet).sort()];
  }, [cities]);

  // -----------------------------
  // SEARCH + REGION FILTER
  // -----------------------------
  const filteredCities = useMemo(() => {
    const query = String(searchQuery || '')
      .trim()
      .toLowerCase();

    return cities.filter((city) => {
      if (!city) return false;

      /*
       * Convert every searchable database field
       * into a safe lowercase string.
       *
       * This prevents errors if SQLite returns
       * null / numbers / unexpected values.
       */
      const searchableText = [
        city.name,
        city.state,
        city.region,
        city.country_code,
        city.description
      ]
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value).toLowerCase())
        .join(' ');

      const matchesSearch =
        query === '' || searchableText.includes(query);

      const cityRegion = city.region
        ? String(city.region)
        : '';

      const matchesRegion =
        selectedRegion === 'All' ||
        cityRegion === selectedRegion;

      return matchesSearch && matchesRegion;
    });
  }, [cities, searchQuery, selectedRegion]);

  // -----------------------------
  // CITY CLICK
  // -----------------------------
  const handleCityClick = (cityId) => {
    if (!cityId) {
      console.error('Missing city_id');
      return;
    }

    navigate(
      `/planner?city=${encodeURIComponent(String(cityId))}`
    );
  };

  // -----------------------------
  // CLEAR SEARCH
  // -----------------------------
  const clearSearch = () => {
    setSearchQuery('');
  };

  // -----------------------------
  // CLEAR ALL FILTERS
  // -----------------------------
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedRegion('All');
  };

  // -----------------------------
  // KEYBOARD CARD NAVIGATION
  // -----------------------------
  const handleCardKeyDown = (event, cityId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCityClick(cityId);
    }
  };

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <main className="explore-page">

      {/* =========================================
          HERO
      ========================================= */}
      <section className="explore-hero">
        <div className="explore-container">

          <div className="explore-eyebrow">
            <span className="eyebrow-dot" />
            <span>REAL APS-09 DATABASE DESTINATIONS</span>
          </div>

          <h1 className="explore-hero-title">
            Discover destinations.
            <span>Plan feasible days.</span>
          </h1>

          <p className="explore-hero-desc">
            Browse through active destinations backed by verified
            SQLite attractions, opening hours, and transit matrices.
          </p>

          {/* =====================================
              SEARCH
          ===================================== */}
          <div className="explore-search-container">

            <div className="explore-search-bar">

              <Search
                size={18}
                className="search-icon"
                aria-hidden="true"
              />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="Search city by name, state, or region..."
                className="search-input"
                aria-label="Search destinations"
                autoComplete="off"
              />

              {searchQuery.trim() !== '' && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* SEARCH STATUS */}
            {!loading && !error && searchQuery.trim() !== '' && (
              <div className="search-result-status">
                <span>
                  {filteredCities.length === 0
                    ? 'No destinations found'
                    : `${filteredCities.length} destination${
                        filteredCities.length !== 1 ? 's' : ''
                      } found`}
                </span>
              </div>
            )}

            {/* QUICK SEARCH */}
            <div className="search-hints">
              <Sparkles
                size={13}
                className="sparkle-gold"
                aria-hidden="true"
              />

              <span>
                Try clicking:{' '}

                <button
                  type="button"
                  className="hint-btn"
                  onClick={() => setSearchQuery('Bengaluru')}
                >
                  Bengaluru
                </button>
                ,{' '}

                <button
                  type="button"
                  className="hint-btn"
                  onClick={() => setSearchQuery('Jaipur')}
                >
                  Jaipur
                </button>
                ,{' '}

                <button
                  type="button"
                  className="hint-btn"
                  onClick={() => setSearchQuery('Mumbai')}
                >
                  Mumbai
                </button>
                ,{' '}

                <button
                  type="button"
                  className="hint-btn"
                  onClick={() => setSearchQuery('Delhi')}
                >
                  Delhi
                </button>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          REGION FILTER
      ========================================= */}
      <section className="explore-filter-bar">
        <div className="explore-container">

          <div className="filter-scroll-row">

            <span className="filter-title">
              REGIONS:
            </span>

            {regions.map((region) => (
              <button
                key={region}
                type="button"
                className={`region-pill ${
                  selectedRegion === region
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  setSelectedRegion(region)
                }
              >
                {region}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================
          DESTINATION GRID
      ========================================= */}
      <section className="explore-grid-section">
        <div className="explore-container">

          {/* RESULTS BAR */}
          <div className="results-count-bar">

            <span>
              Showing{' '}
              <strong>
                {loading ? '—' : filteredCities.length}
              </strong>{' '}
              active cities
            </span>

            {selectedRegion !== 'All' && (
              <span className="active-filter-badge">
                Region: {selectedRegion}
              </span>
            )}

            {searchQuery.trim() !== '' && (
              <span className="active-filter-badge">
                Search: "{searchQuery}"
              </span>
            )}
          </div>

          {/* =====================================
              LOADING
          ===================================== */}
          {loading && (
            <div className="explore-loading-state">

              <Loader2
                size={32}
                className="spin accent-spin"
              />

              <p>
                Loading real destination data from SQLite...
              </p>
            </div>
          )}

          {/* =====================================
              ERROR
          ===================================== */}
          {!loading && error && (
            <div className="explore-error-card">

              <div>
                <h3>
                  Unable to load destinations
                </h3>

                <p>
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-retry"
              >
                Reload Cities
              </button>
            </div>
          )}

          {/* =====================================
              EMPTY SEARCH
          ===================================== */}
          {!loading &&
            !error &&
            filteredCities.length === 0 && (
              <div className="explore-empty-search">

                <Compass size={40} />

                <h3>
                  No matching destinations found
                </h3>

                <p>
                  Try searching for another city,
                  state, region, or clear your filters.
                </p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn-clear-filters"
                >
                  Clear Filters
                </button>
              </div>
            )}

          {/* =====================================
              CITY CARDS
          ===================================== */}
          {!loading &&
            !error &&
            filteredCities.length > 0 && (
              <div className="destination-cards-grid">

                {filteredCities.map((city) => {

                  const cityId = city?.city_id;

                  const cityName =
                    city?.name || 'Unknown City';

                  const region =
                    city?.region || 'India';

                  const state =
                    city?.state || '';

                  const countryCode =
                    city?.country_code || 'IN';

                  const description =
                    city?.description ||
                    `${cityName} features verified attractions and transit networks optimized for carbon, time, and budget efficiency.`;

                  return (
                    <article
                      key={cityId || cityName}
                      className="destination-card"
                      onClick={() =>
                        handleCityClick(cityId)
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) =>
                        handleCardKeyDown(
                          event,
                          cityId
                        )
                      }
                    >

                      {/* CARD TOP */}
                      <div className="card-top-row">

                        <div className="card-location-meta">

                          <span className="card-region-tag">
                            {region}
                          </span>

                          {state && (
                            <span className="card-state-tag">
                              {state}
                            </span>
                          )}

                        </div>

                        <span className="card-country-code">
                          {countryCode}
                        </span>

                      </div>

                      {/* CITY NAME */}
                      <h3 className="card-city-name">
                        {cityName}
                      </h3>

                      {/* DESCRIPTION */}
                      <p className="card-city-desc">
                        {description}
                      </p>

                      {/* CTA */}
                      <div className="card-bottom-action">

                        <span className="card-cta-text">
                          Plan Day in {cityName}
                        </span>

                        <div className="card-cta-arrow">
                          <ArrowRight size={16} />
                        </div>

                      </div>

                    </article>
                  );
                })}

              </div>
            )}

        </div>
      </section>

      {/* =========================================
          BOTTOM CTA
      ========================================= */}
      <section className="explore-bottom-cta">
        <div className="explore-container">

          <div className="bottom-cta-box">

            <div>
              <h3>
                Have a custom prompt in mind?
              </h3>

              <p>
                Type your wishes into our AI planner
                and let ReRoute optimize your itinerary.
              </p>
            </div>

            <Link
              to="/planner"
              className="btn-go-planner"
            >
              <span>
                Open Itinerary Planner
              </span>

              <ArrowUpRight size={17} />
            </Link>

          </div>

        </div>
      </section>

    </main>
  );
}