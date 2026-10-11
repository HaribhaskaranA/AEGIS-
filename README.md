# AEGIS DYNAMICS: Autonomous Search-and-Rescue Swarm Platform
### Decentralized Multi-Agent Airborne Fleet for Large-Scale Disaster Theaters

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Status: Minimum Credible Result Verified](https://img.shields.io/badge/MCR-Verified-brightgreen.svg)]()

> **"After a disaster, a swarm of drones must cover a large area to find survivors despite limited communication and drone failures. Plan and replan coverage dynamically."**

---

## 🚁 Project Overview

**AEGIS-SWARM** is a decentralized, fault-tolerant multi-UAV path planning and victim localization system designed for catastrophic search-and-rescue operations. Operating across a **5 km &times; 5 km (25 km&sup2;)** disaster environment, AEGIS coordinates a fleet of 10 autonomous drones under **strict communication horizon (&le; 1.2 km)** and severe hardware attrition.

Unlike brittle classical "Lawnmower" (Boustrophedon) sweeps that permanently abandon sectors when drones fail, AEGIS combines:
1. **Bayesian Spatial Information-Gain Planning:** Prioritizes high-risk debris corridors using dynamic entropy gradients.
2. **Ad-Hoc RF Mesh Gossip Consensus:** Fuses distributed probability belief maps asynchronously without any central ground control server.
3. **Dynamic Fault Detection & Voronoi Reallocation:** Automatically detects heartbeat drops and redistributes orphaned search sectors to surviving peers upon a **30% drone failure event**.
4. **Interactive Tactical Mission Control Web HUD:** A 60 FPS HTML5 Canvas tactical radar interface with real-time audio telemetry and chaos injection stress testing.

---

## ⚡ Quick Start

### 1. Launch the Tactical Mission Control Web Interface
No dependencies required! Simply open `index.html` in any modern web browser, or serve it via Python:

```bash
# From the aegis-swarm-planner root directory:
python -m http.server 8080
```
Open your browser to: **`http://localhost:8080`**

#### Interactive Web Controls:
* **Algorithm Switcher:** Toggle between **AEGIS Swarm** and the **Lawnmower Baseline** to visually observe search behaviors.
* **Chaos Injection Panel:**
  * ⚡ **Kill 30% Drones (Instant Attrition):** Simulates catastrophic mid-air drone failure; watch surviving drones dynamically reallocate the abandoned sectors.
  * 📡 **RF Jamming:** Drops communication radius from 1,200m to 350m to test mesh isolation resilience.
  * ⛈️ **Sensor Noise Storm:** Injects environmental false positives and false negatives.
* **Benchmark Report:** Click the `BENCHMARK REPORT` button to run a live Monte-Carlo trial and view statistical results.
* **Pitch Deck:** Click `6-SLIDE PITCH DECK` to access the built-in presentation slides.

---

### 2. Run the Reproducible Evaluation CLI (For Judges)
The headless Python evaluation harness tests all conditions and outputs the exact quantitative metrics table:

```bash
cd python_evaluation
python run_evaluation.py --trials 10
```

---

## 📊 Minimum Credible Result (MCR) & Evaluation Report

### Official Quantitative Results Table (10 Drones, 5km &times; 5km Area, 10 Monte-Carlo Trials)

| Condition | Area Coverage @ 10m | Mean Time to Find Target (MTFT) | Survivor Recall | RF Mesh Packets |
| :--- | :---: | :---: | :---: | :---: |
| **AEGIS Swarm (Nominal)** | **88.4% &plusmn; 1.8%** | **142.6s &plusmn; 8.4s** | **100.0%** | **1,840** |
| **AEGIS Swarm (30% Attrition)** | **79.2% &plusmn; 2.4%** | **184.1s &plusmn; 12.1s** | **90.0%** | **1,260** |
| Lawnmower Baseline (Nominal) | 58.6% &plusmn; 0.5% | 296.8s &plusmn; 14.2s | 70.0% | 0 (Static) |
| Lawnmower Baseline (30% Failure) | 41.1% &plusmn; 1.2% | 382.4s &plusmn; 18.0s | 40.0% | 0 (Static) |
| *Ablation: Swarm w/o Gossip Comm* | 71.0% &plusmn; 3.2% | 214.5s &plusmn; 15.8s | 80.0% | 0 |
| *Ablation: Swarm w/ Sensor Noise* | 73.7% &plusmn; 1.3% | 252.0s &plusmn; 15.2s | 96.7% | 9,877 |

### Key Evaluative Findings:
1. **Target Discovery Speedup:** AEGIS achieves a **51.9% reduction in Mean Time to Find Target** compared to the Lawnmower baseline by prioritizing high-entropy disaster hotspots rather than sweeping uniformly.
2. **Robustness Under 30% Loss:** When 30% of drones fail, the static Lawnmower baseline collapses to 40% survivor recall because orphaned lanes are permanently skipped. AEGIS maintains **90% recall** through autonomous Voronoi-weighted failover.
3. **Ablation Proof:** Disabling inter-drone gossip consensus increases redundant sweeps by **33%**, proving that local belief fusion is crucial in decentralized multi-agent systems.

---

## 📐 Mathematical Formulation

### 1. Bayesian Spatial Likelihood Update (Stretch Goal)
Each cell $i$ has an initial prior probability $P(S_i)$ derived from Gaussian mixture terrain hazard distributions. Given sensor observation $z \in \{0, 1\}$ with true positive rate $P(z=1|S_i) = p_{tp}$ and false alarm rate $P(z=1|\neg S_i) = p_{fp}$:

$$P(S_i \mid z) = \frac{P(z \mid S_i) P(S_i)}{P(z \mid S_i) P(S_i) + P(z \mid \neg S_i) (1 - P(S_i))}$$

### 2. Information-Gain Utility Function
Waypoints are chosen dynamically to maximize expected Shannon entropy reduction penalized by travel distance:

$$H(p) = -p \log_2(p) - (1-p) \log_2(1-p)$$

$$U(\text{cell}_k) = \frac{H(p_k) \cdot p_k^2 \cdot \gamma_{\text{peer}}}{d(\mathbf{x}_{\text{drone}}, \mathbf{x}_k)^{0.8}}$$

where $\gamma_{\text{peer}} \in [0.2, 1.0]$ penalizes waypoints currently targeted by neighboring peers.

### 3. Limited-Range Gossip Consensus
When two drones $j, k$ satisfy $\|\mathbf{x}_j - \mathbf{x}_k\| \le R_{\text{comm}} = 1.2\text{ km}$, they fuse local beliefs via a linear opinion pool:

$$\mathbf{B}_j^{(t+1)} = \mathbf{B}_k^{(t+1)} = \frac{1}{2} \left( \mathbf{B}_j^{(t)} + \mathbf{B}_k^{(t)} \right)$$

---

## 🤖 Experimental AI Person Detection & Multi-Drone Rescue Command

This repository includes two frontend interfaces connected to the active ResQSwarm FastAPI YOLO person-detection backend:

- **🌐 BACKEND URL:** `https://slam-slapping-gusty.ngrok-free.dev`
- **❤️ HEALTH (`GET /health`):** `https://slam-slapping-gusty.ngrok-free.dev/health`
- **📘 API DOCS (`/docs`):** `https://slam-slapping-gusty.ngrok-free.dev/docs`
- **🤖 DETECTION ENDPOINT (`POST /detect`):** `https://slam-slapping-gusty.ngrok-free.dev/detect` (`multipart/form-data` field `image`)

1. **Single-Image AI Detection (`ai-detection.html`):** Upload thermal/aerial imagery, check `GET /health` (`status`, `model_loaded`, `classes`), inspect `POST /detect` fields (`image_width`, `image_height`, `detection_count`, `detections`, `status`, `gps_coordinates`, `warning`), and view responsive bounding-box overlays.
2. **Multi-Drone Rescue Command (`rescue-command.html`):** Combines a 10-drone **SIMULATED** fleet overview (`Drone 01`–`Drone 10`) with live FastAPI YOLO inference and a confidence-sorted candidate review queue (`AI review order — confidence only`).

### ⚠️ Temporary ngrok Tunnel & Safety Notice (Not Production-Ready)
- **Temporary & Configurable Backend URL:** The default API base URL (`https://slam-slapping-gusty.ngrok-free.dev`) points to a **temporary Google Colab / ngrok tunnel** and will change whenever the backend session restarts. You can edit the API Base URL directly in the input field at the top of `ai-detection.html` and `rescue-command.html` without modifying code.
- **Experimental Prototype Only:** The YOLO detector is an **experimental demonstration** and is **not production-ready**. Thermal detection accuracy is unvalidated.
- **Unverified Candidates Requiring Human Review:** Every detection is strictly labeled as an **unverified candidate requiring human review** and must never be treated as a confirmed survivor or sole basis for rescue dispatch.
- **GPS Unavailable from Bounding Boxes:** Pixel bounding boxes (`bbox_xyxy`) do not provide geographic coordinates. When `gps_coordinates` is `null`, the UI explicitly displays **`GPS unavailable`** rather than inventing coordinates, distances, or ETAs.
- **Simulated vs. Real Separation:** All 10 drone positions, battery levels, and patrol states in the dashboard are clearly labeled as **SIMULATED DEMO DATA** and are never presented as live hardware telemetry.

---

## 🎯 Platform Capabilities Summary

- [x] **Zero-Dependency Frontend Architecture:** Pure HTML5, CSS3, and vanilla JavaScript + local Leaflet GIS mapping.
- [x] **Headless Python Benchmark Suite:** Reproducible Monte Carlo evaluation scripts comparing against classical baselines.
- [x] **Interactive Tactical Command Console:** 60 FPS HTML5 Canvas with simulated chaos injection (`index.html`).
- [x] **Experimental AI Detection & Rescue Command:** Live FastAPI `/health` and `/detect` integration (`ai-detection.html`, `rescue-command.html`).
