# ReRoute — Multi-Objective Itinerary Optimizer
**Challenge:** APS-09 — Multi-Objective Itinerary Optimizer | **Kognivera Hackathon 2026**  
**Domain:** Travel & Tourism

---

## 1. Project Overview

**ReRoute** is an intelligent, deterministic multi-objective travel itinerary optimization engine. Instead of returning arbitrary travel lists or hallucinatory AI itineraries, ReRoute finds mathematically optimal, schedule-feasible tourist itineraries that rigorously balance three competing real-world objectives:
1. **Cost** (₹ Entry fees + Transport fares)
2. **Time** (Activity durations + Transit times + Opening-hour waits)
3. **Carbon Emissions** (Attraction footprints + Mode-specific transport emissions in kg CO₂)

> **Core AI/System Architecture Principle:**  
> *"LLM handles natural-language interpretation and explanation. Deterministic optimization and constraint validation are performed by our backend."*

---

## 2. Architecture & Tech Stack

```
                              ┌─────────────────────────────────────────┐
                              │            ReRoute Web UI               │
                              │    React 18 + Vite + Lucide Icons       │
                              │    (Warm Off-White + Lime Accent)       │
                              └──────────────────┬──────────────────────┘
                                                 │
                                                 │ HTTP JSON API
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Express.js Backend                                     │
├────────────────────────────────┬───────────────────────────────────────────────────────┤
│ AI Assistant Module            │ Multi-Objective Optimization Engine                   │
│ - Natural Language Intent      │ - Graph Route Constructor                             │
│ - Grounded POI Entity Resolver │ - Branch & Bound Pruned Search                        │
│ - Post-Optimization Explainer  │ - Normalized Objective Scoring (Cost, Time, Carbon)   │
├────────────────────────────────┴───────────────────────────────────────────────────────┤
│ Feasibility & Relaxation Engine                                                        │
│ - Hard Constraint Validation (Opening hours, time windows, budget & carbon caps)       │
│ - Infeasibility Diagnosis (Binding constraint detector & mathematical gap analysis)    │
│ - Exactly-One-Constraint Relaxation Engine (Deterministic minimal relaxation search)   │
└────────────────────────────────┬───────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Source of Truth: SQLite (APS-09.db)                             │
│  cities • activities_poi • poi_travel_matrix • eval_optimizer_cases • categories       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, Vite, React Router DOM, Lucide React, Custom CSS Design System
- **Backend:** Node.js, Express 5, Better-SQLite3 (WAL mode)
- **Database:** `data/APS-09.db` (900 real POIs, 6,418 precomputed travel edges, 60 cities, 20 evaluation benchmark cases)

---

## 3. Database & Real-Data Integrity

ReRoute operates exclusively on the verified SQLite database schema without inventing POIs, travel times, or emissions:
- **`cities`**: 60 active cities across India and Asia with coordinates, timezones, and climate profiles.
- **`activities_poi`**: 900 attractions with entry costs (string currency format), typical durations, opening/closing hours (`opens_at`, `closes_at`), popularity, and carbon footprints.
- **`poi_travel_matrix`**: 6,418 multi-modal routing edges between attractions with precomputed minutes, distances, carbon emissions, and fares across walking, metro/rail, bus, and cab modes.
- **`eval_optimizer_cases`**: 20 benchmark optimization cases with verified reference sequences and metrics.

---

## 4. Optimizer Approach & Constraint Handling

### Deterministic Search & Multi-Modal Routing
1. **Candidate POI & Subgraph Loading:** Relevant POIs and travel edges are indexed into memory for sub-millisecond graph traversals.
2. **Branch-and-Bound Pruning:** Depth-first exploration with early cutoff when cumulative time exceeds the day window, cost exceeds budget, or carbon exceeds cap.
3. **Multi-Modal Route Selection:** For each leg $A \to B$, available transport modes are evaluated. If multiple modes exist, ReRoute deterministically selects the mode that aligns with objective weights while ensuring the traveler arrives in time to complete the visit before closing hours.
4. **Normalized Objective Scoring:**
   $$\text{Score} = w_{\text{cost}} \cdot \hat{C} + w_{\text{time}} \cdot \hat{T} + w_{\text{carbon}} \cdot \hat{E}$$
   where weights $w_{\text{cost}} + w_{\text{time}} + w_{\text{carbon}} = 1.0$ and objectives are normalized using Min-Max scaling across the feasible pool.

### Hard Constraints (Never Violated)
- **Must-See Attractions:** Every selected must-see POI must be visited.
- **Attraction Opening Hours:** $T_{\text{start}} = \max(T_{\text{arrival}}, T_{\text{open}})$, requiring $T_{\text{start}} + \text{Duration} \le T_{\text{close}}$.
- **Day Time Window:** Tour begins at `day_start` and last departure $\le$ `day_end`.
- **Budget Cap:** Total POI admissions + total transit costs $\le$ `budget_cap`.
- **Carbon Cap:** Total POI emissions + transit emissions $\le$ `carbon_cap_kg`.

---

## 5. Infeasibility Engine & Exactly-One Relaxation

If a user specifies mutually conflicting constraints (e.g. 4 must-see attractions in a 2-hour window or with ₹5 budget), ReRoute **never returns a partial or invalid plan**.

Instead, it returns:
1. `feasible: false`
2. **Binding Constraint Identification:** Real mathematical diagnosis (e.g., `TIME_LIMIT`, `BUDGET_LIMIT`, `CARBON_LIMIT`, `OPENING_HOURS`).
3. **Plain-Language Explanation:**  
   *"Your selected must-see attractions require 180 minutes (including activities and travel), but your available day window from 09:00 to 09:30 is only 30 minutes (short by 150 minutes)."*
4. **Exactly-One-Constraint Relaxation Proposal:**  
   ReRoute methodically tests modifying **exactly one** constraint (extending day end, advancing day start, increasing budget, or increasing carbon cap) while keeping all other hard constraints enforced.
5. **Full Relaxed Feasible Plan:** Displays the new valid itinerary, cost, time, and carbon with a 1-click "Adopt This Relaxed Itinerary" action.

---

## 6. AI Intent Parser & Grounded Explainer

- **Natural Language Input:** Users can type natural queries like:  
  `"Plan a low-carbon day in Bengaluru under ₹1500 with palace and park"`
- **Grounded NLP Resolver:** Resolves city names, parses budget and carbon figures, detects weight biases, and grounds attraction names against **actual database records**.
- **Grounded Explainer:** Once the deterministic optimizer selects the best plan, the explainer generates a faithful, factual description of trade-offs based strictly on calculated metrics.

---

## 7. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health and database connection status |
| `GET` | `/api/cities` | List of all active cities from SQLite |
| `GET` | `/api/pois?city_id=...` | List of active POIs with entry costs, opening hours, carbon |
| `GET` | `/api/pois/:poi_id` | Single POI detailed metadata |
| `POST` | `/api/optimize` | Core multi-objective optimizer with infeasibility & relaxation |
| `POST` | `/api/explain/parse` | Natural language query intent parser grounded in DB |
| `POST` | `/api/explain` | Grounded post-optimization trade-off explanation |
| `GET` | `/api/cases` | Benchmark evaluation cases from `eval_optimizer_cases` |
| `GET` | `/api/travel/:from/:to` | Travel matrix edges between two POIs |

---

## 8. Setup & Execution Instructions

### Prerequisites
- Node.js (v18+ or v20+)
- npm

### 1. Backend Setup
```bash
cd backend
npm install
npm start
```
*Backend runs on `http://localhost:5000`.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

### 3. Run Automated Tests
```bash
# In backend/ or root directory
npm test
```
*Executes all 9 unit and integration tests verifying feasibility, opening hours, budget, carbon, time infeasibility, exactly-one relaxation, and AI grounding.*

### 4. Run Benchmark Evaluation Suite
```bash
cd backend
npm run evaluate
```
*Executes the evaluation suite comparing ReRoute optimizer outputs against the 20 known reference cases in `eval_optimizer_cases`.*

---

## 9. Hackathon Demo Flow (Step-by-Step)

1. **Open ReRoute:** Visit `http://localhost:5173/planner`.
2. **Choose Destination:** Select **Bengaluru** from the city selector.
3. **Select Must-See Attractions:** Select 2–3 attractions (e.g. Bangalore Palace, Cubbon Park).
4. **Configure Bounds:**
   - Day Start: `09:00` | Day End: `18:00`
   - Budget: `₹2500` | Carbon: `12 kg`
5. **Set Optimization Priorities:**
   - Cost: `30%` | Time: `30%` | Carbon: `40%`
6. **Click "OPTIMIZE ITINERARY":**
   - Feasible itinerary is displayed with chronological stops, transfer modes, transit durations, and exact metrics.
7. **Adjust Carbon Slider:**
   - Drag Carbon slider to `70%`.
   - The route re-optimizes dynamically, selecting greener transit legs (metro/walk) and updating trade-off charts.
8. **Trigger Infeasible Scenario:**
   - Change Day End from `18:00` to `09:30` (or set Budget to `₹50`).
   - Click Optimize.
9. **Inspect Infeasibility Diagnosis:**
   - Prominent Infeasibility Card appears: `⚠ No feasible itinerary`.
   - Clear identification of binding constraint (`TIME LIMIT` or `BUDGET LIMIT`).
   - Plain-language explanation with exact calculated gap.
10. **Inspect Exactly-One Relaxation:**
    - View suggested relaxation: e.g. *"Extend your day from 09:30 to 12:15 (+165 mins)"*.
    - Click **"View Relaxed Feasible Plan"** to inspect the alternative metrics and schedule.
    - Click **"Adopt This Relaxed Itinerary"** to automatically apply the relaxation.
11. **Test AI Assistant:**
    - Type: `"Plan a low-carbon day in Bengaluru under ₹1500 with palace and park"`.
    - Click **"Auto-fill with AI"** to see constraints and POIs populate instantly from the database!
12. **Language Toggle:**
    - Click **"हिंदी"** in the top bar to switch UI labels seamlessly into Hindi.

---

## 10. Limitations & Future Roadmap

- **Multi-day trips:** The current MVP specializes in single-day itinerary optimization; multi-day clustering can be extended using the `weather_daily` table.
- **Dynamic traffic:** Relies on the provided `poi_travel_matrix` precomputed travel edges rather than live GPS feeds.
- **Pareto 3D visualizer:** The current trade-off view presents clean comparative bars; full 3D Pareto frontier rendering can be added for deeper multi-objective research.
