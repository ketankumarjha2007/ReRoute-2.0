import React, { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

import L from "leaflet";

import {
  MapPin,
  Clock3,
  IndianRupee,
  Leaf,
  MapPinned,
  Navigation,
  Star
} from "lucide-react";

import "leaflet/dist/leaflet.css";

// ============================================================
// DEFAULT MAP CENTER
// ============================================================

const DEFAULT_CENTER = [20.5937, 78.9629];

// ============================================================
// CUSTOM MARKER
//
// Selected markers get two radar-style pulse rings baked
// straight into the divIcon markup so the ping animates the
// instant Leaflet mounts the icon — no extra state needed.
// ============================================================

const createPoiIcon = (isSelected = false) =>
  L.divIcon({
    className: "reroute-poi-marker-wrapper",

    html: `
      <div class="reroute-poi-marker ${
        isSelected ? "selected" : ""
      }">
        ${
          isSelected
            ? `<span class="reroute-pulse-ring"></span>
               <span class="reroute-pulse-ring reroute-pulse-ring-delay"></span>`
            : ""
        }
        <div class="reroute-poi-marker-inner">
          <span>●</span>
        </div>
      </div>
    `,

    iconSize: isSelected
      ? [46, 56]
      : [38, 48],

    iconAnchor: isSelected
      ? [23, 52]
      : [19, 44],

    popupAnchor: [0, -44]
  });

// ============================================================
// GET POI COORDINATES
// ============================================================

const getPoiCoordinates = (poi) => {
  if (!poi) return null;

  const latitude =
    poi.latitude ??
    poi.lat ??
    poi.location_lat ??
    poi.coordinates?.lat ??
    poi.location?.lat;

  const longitude =
    poi.longitude ??
    poi.lng ??
    poi.lon ??
    poi.location_lng ??
    poi.coordinates?.lng ??
    poi.location?.lng;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return [lat, lng];
};

// ============================================================
// AUTO FIT SELECTED PLACES
//
// IMPORTANT:
// This only fits the visible markers.
// It does NOT create a route.
// Runs on mount and whenever the *set* of visible pois changes.
// ============================================================

function FitSelectedPlaces({ pois }) {
  const map = useMap();

  useEffect(() => {
    const coordinates = pois
      .map(getPoiCoordinates)
      .filter(Boolean);

    if (coordinates.length === 0) {
      map.setView(DEFAULT_CENTER, 5);
      return;
    }

    // One selected place
    if (coordinates.length === 1) {
      map.setView(
        coordinates[0],
        15,
        {
          animate: true
        }
      );

      return;
    }

    // Multiple selected places
    const bounds =
      L.latLngBounds(
        coordinates
      );

    map.fitBounds(
      bounds,
      {
        padding: [60, 60],
        maxZoom: 14,
        animate: true
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois.length, map]);

  return null;
}

// ============================================================
// FLY TO SELECTED POI
//
// Whenever selectedPoiId changes (clicked on the map, in the
// place list, in the popup, or set as start/end from the
// parent form) the camera glides to that exact point and its
// marker's popup opens automatically — this is what makes the
// "which place did I pick" moment feel alive instead of static.
// ============================================================

function FlyToSelectedPoi({
  pois,
  selectedPoiId,
  markerRefs
}) {
  const map = useMap();
  const lastFlownRef = useRef(null);

  useEffect(() => {
    if (!selectedPoiId) return;
    if (lastFlownRef.current === selectedPoiId) return;

    const poi = pois.find(
      (candidate) =>
        candidate.poi_id === selectedPoiId
    );

    const coordinates = getPoiCoordinates(poi);

    if (!coordinates) return;

    lastFlownRef.current = selectedPoiId;

    const currentZoom = map.getZoom() || 13;

    map.flyTo(
      coordinates,
      Math.max(currentZoom, 15.5),
      {
        duration: 1.15,
        easeLinearity: 0.22
      }
    );

    const marker = markerRefs.current[selectedPoiId];

    if (marker) {
      // Let the fly animation begin before popping the popup
      // open, so the popup doesn't fight the camera move.
      const timeoutId = setTimeout(() => {
        marker.openPopup();
      }, 260);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoiId, pois, map]);

  return null;
}

// ============================================================
// MAPVIEW
// ============================================================

export default function MapView({
  pois = [],
  selectedPoiId = null,
  onPoiSelect,
  city = null
}) {
  const markerRefs = useRef({});

  const validPois = pois.filter(
    (poi) =>
      getPoiCoordinates(poi)
  );

  // ==========================================================
  // EMPTY STATE
  // ==========================================================

  if (validPois.length === 0) {
    return (
      <div className="reroute-map-shell">

        <div className="reroute-map-empty">

          <div className="reroute-map-empty-icon">
            <MapPinned size={30} />
          </div>

          <h3>
            No places selected
          </h3>

          <p>
            Select a start, end, or
            must-see attraction to
            display it here.
          </p>

        </div>

      </div>
    );
  }

  // ==========================================================
  // MAP CENTER
  // ==========================================================

  const firstCoordinates =
    getPoiCoordinates(
      validPois[0]
    ) || DEFAULT_CENTER;

  const selectedPoi = selectedPoiId
    ? validPois.find(
        (poi) => poi.poi_id === selectedPoiId
      )
    : null;

  return (
    <div className="reroute-map-shell">

      {/* ======================================================
          MAP HEADER
      ====================================================== */}

      <div className="reroute-map-toolbar">

        <div className="reroute-map-toolbar-left">

          <div className="reroute-map-icon">
            <MapPinned size={17} />
          </div>

          <div>
            <span className="reroute-map-label">
              SELECTED PLACES
            </span>

            <strong>
              {validPois.length}{" "}
              {validPois.length === 1
                ? "destination"
                : "destinations"}
            </strong>
          </div>

        </div>

        <div className="reroute-map-city">

          <Navigation size={13} />

          <span>
            {selectedPoi
              ? selectedPoi.name
              : city?.name ||
                "Your destination"}
          </span>

        </div>

      </div>

      {/* ======================================================
          MAP
      ====================================================== */}

      <div className="reroute-map-container">

        <MapContainer
          center={firstCoordinates}
          zoom={13}
          scrollWheelZoom={true}
          zoomControl={true}
          attributionControl={true}
          className="reroute-leaflet-map"
        >

          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitSelectedPlaces
            pois={validPois}
          />

          <FlyToSelectedPoi
            pois={validPois}
            selectedPoiId={selectedPoiId}
            markerRefs={markerRefs}
          />

          {/* ==================================================
              MARKERS ONLY
              
              NO POLYLINE.
              NO ROUTE.
              NO DIRECTIONS.
          ================================================== */}

          {validPois.map((poi, index) => {
            const coordinates =
              getPoiCoordinates(poi);

            if (!coordinates) {
              return null;
            }

            const isSelected =
              selectedPoiId ===
              poi.poi_id;

            return (
              <Marker
                key={
                  poi.poi_id ||
                  `${poi.name}-${index}`
                }
                position={coordinates}
                icon={createPoiIcon(
                  isSelected
                )}
                ref={(el) => {
                  if (el && poi.poi_id) {
                    markerRefs.current[poi.poi_id] = el;
                  }
                }}
                eventHandlers={{
                  click: () => {
                    onPoiSelect?.(
                      poi.poi_id
                    );
                  }
                }}
              >

                <Popup
                  className="reroute-poi-popup"
                  closeButton={true}
                >

                  <div className="reroute-popup">

                    {/* ----------------------------------------
                        POPUP HEADER
                    ---------------------------------------- */}

                    <div className="reroute-popup-top">

                      <div className="reroute-popup-number">
                        {index + 1}
                      </div>

                      <div className="reroute-popup-title">

                        <span>
                          {
                            poi.poi_category ||
                            "ATTRACTION"
                          }
                        </span>

                        <h3>
                          {poi.name ||
                            "Selected place"}
                        </h3>

                      </div>

                    </div>

                    {/* ----------------------------------------
                        POI DETAILS
                    ---------------------------------------- */}

                    <div className="reroute-popup-details">

                      <div className="reroute-popup-detail">

                        <Clock3 size={15} />

                        <div>
                          <small>
                            VISIT DURATION
                          </small>

                          <strong>
                            {
                              poi.typical_duration_minutes ??
                              0
                            }{" "}
                            min
                          </strong>
                        </div>

                      </div>

                      <div className="reroute-popup-detail">

                        <IndianRupee
                          size={15}
                        />

                        <div>
                          <small>
                            ENTRY COST
                          </small>

                          <strong>
                            ₹
                            {
                              poi.entry_cost ??
                              "0.00"
                            }
                          </strong>
                        </div>

                      </div>

                      <div className="reroute-popup-detail">

                        <Leaf size={15} />

                        <div>
                          <small>
                            CARBON
                          </small>

                          <strong>
                            {
                              poi.carbon_kg ??
                              0
                            }{" "}
                            kg
                          </strong>
                        </div>

                      </div>

                    </div>

                    {/* ----------------------------------------
                        OPENING HOURS
                    ---------------------------------------- */}

                    {(poi.opens_at ||
                      poi.closes_at) && (
                      <div className="reroute-popup-hours">

                        <Clock3
                          size={14}
                        />

                        <span>
                          Open{" "}
                          {poi.opens_at ||
                            "--"}{" "}
                          –{" "}
                          {poi.closes_at ||
                            "--"}
                        </span>

                      </div>
                    )}

                    {/* ----------------------------------------
                        SELECT BUTTON
                    ---------------------------------------- */}

                    <button
                      type="button"
                      className={
                        `reroute-popup-select ${
                          isSelected
                            ? "active"
                            : ""
                        }`
                      }
                      onClick={() =>
                        onPoiSelect?.(
                          poi.poi_id
                        )
                      }
                    >

                      {isSelected ? (
                        <>
                          <Star
                            size={14}
                            fill="currentColor"
                          />

                          Selected
                        </>
                      ) : (
                        <>
                          <MapPin
                            size={14}
                          />

                          View place
                        </>
                      )}

                    </button>

                  </div>

                </Popup>

              </Marker>
            );
          })}

        </MapContainer>

        {/* ====================================================
            MAP OVERLAY
        ==================================================== */}

        <div className="reroute-map-overlay">

          <div className="reroute-map-overlay-dot" />

          <span>
            {selectedPoi
              ? `Focused on ${selectedPoi.name}`
              : "Places selected for your itinerary"}
          </span>

        </div>

        {/* ====================================================
            MAP LEGEND
        ==================================================== */}

        <div className="reroute-map-legend">

          <div className="reroute-map-legend-item">

            <span className="legend-marker" />

            <span>
              Selected place
            </span>

          </div>

        </div>

      </div>

      {/* ======================================================
          SELECTED PLACE LIST
      ====================================================== */}

      <div className="reroute-map-place-list">

        {validPois.map(
          (poi, index) => {

            const isSelected =
              selectedPoiId ===
              poi.poi_id;

            return (
              <button
                key={
                  poi.poi_id ||
                  `${poi.name}-card-${index}`
                }
                type="button"
                style={{
                  "--reroute-stagger-index": index
                }}
                className={
                  `reroute-place-card ${
                    isSelected
                      ? "active"
                      : ""
                  }`
                }
                onClick={() =>
                  onPoiSelect?.(
                    poi.poi_id
                  )
                }
              >

                <div className="reroute-place-number">
                  {index + 1}
                </div>

                <div className="reroute-place-info">

                  <strong>
                    {poi.name}
                  </strong>

                  <span>
                    {
                      poi.poi_category ||
                      "Attraction"
                    }

                    {" • "}

                    {
                      poi.typical_duration_minutes ??
                      0
                    }{" "}
                    min
                  </span>

                </div>

                {isSelected && (
                  <div className="reroute-place-active">
                    <Star
                      size={14}
                      fill="currentColor"
                    />
                  </div>
                )}

              </button>
            );
          }
        )}

      </div>

    </div>
  );
}