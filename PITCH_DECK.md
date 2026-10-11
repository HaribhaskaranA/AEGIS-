# AEGIS DYNAMICS: Autonomous Search & Rescue Platform
### Executive Presentation Script & Technical Defense Briefing

**Briefing Duration:** 3 Minutes Total (~30 seconds per slide)

---

### Slide 1: Problem & Motivation (0:00 - 0:30)
* **Title:** The Critical 72 Hours: Autonomous Disaster Search & Rescue
* **Key Points:**
  * In avalanches, floods, and earthquakes, the survival probability drops exponentially after 72 hours.
  * Disaster zones cover dozens of square kilometers (5 km &times; 5 km), where cellular towers and GPS infrastructure are often destroyed.
  * Human-piloted single drones cannot scale due to line-of-sight and battery limitations.
  * Classical pre-programmed search patterns ("Lawnmower" sweeps) are catastrophically brittle: if 3 out of 10 drones fail mid-flight, their sectors are abandoned forever.
* **Speaker Script:**
  > *"In large-scale natural disasters and military rescue operations, survival is a race against time across vast, rugged terrain. Legacy commercial drones rely on static pre-programmed lawnmower grids. But when drones run out of battery or crash in harsh weather, those static flight plans fail silently—leaving victims stranded in abandoned sectors. We built AEGIS-SWARM to solve this: an enterprise-grade autonomous, decentralized multi-UAV system that dynamically coordinates and self-heals under extreme hardware attrition."*

---

### Slide 2: Technical Approach (0:30 - 1:00)
* **Title:** Decentralized Bayesian Information-Gain Path Planning
* **Key Points:**
  * **Bayesian Terrain Prior:** Fuses topography elevation and disaster models (avalanche debris paths, flood basins) into a prior probability distribution.
  * **Dynamic Entropy Reduction:** Waypoints are chosen by maximizing local Shannon entropy reduction weighted by distance:
    $$U(\text{cell}) = \frac{H(p) \cdot p^2 \cdot \gamma_{\text{peer}}}{\text{dist}^{0.8}}$$
  * **Decentralized Dispersion:** Drones generate mutual repulsive potential fields to prevent redundant searches without central negotiation.
* **Speaker Script:**
  > *"Rather than sweeping empty ground uniformly, each drone in AEGIS calculates the expected Shannon entropy reduction of every cell in real time. By weighting information gain against flight distance and terrain risk priors, the swarm autonomously surges toward the highest-probability debris corridors first, finding victims in half the time of conventional methods."*

---

### Slide 3: System Architecture (1:00 - 1:30)
* **Title:** Limited-Range RF Mesh Gossip & Dynamic Task Reallocation
* **Key Points:**
  * **Zero Central Infrastructure:** Operates under strict ad-hoc RF communication limits ($\le 1.2\text{ km}$).
  * **Linear Opinion Pool Consensus:** Drones exchange and fuse local belief maps opportunistically when in RF range.
  * **Continuous Heartbeat Monitoring:** Detects silent/downed peers within 14 seconds.
  * **Autonomous Sector Redistribution:** Surviving drones dynamically expand Voronoi search jurisdictions to absorb orphaned sectors.
* **Speaker Script:**
  > *"Crucially, AEGIS requires zero base station or internet access. The drones form a decentralized peer-to-peer RF mesh. Whenever two drones pass within 1.2 kilometers of each other, they gossip-fuse their probability maps using a linear opinion pool. If a drone is lost to weather or battery depletion, neighboring drones detect the missing heartbeat and dynamically expand their search boundaries to cover the lost drone's sector."*

---

### Slide 4: Experimental Results & Baselines (1:30 - 2:05)
* **Title:** Rigorous Evaluation: The Minimum Credible Result
* **Key Points:**
  * Evaluated across 10 Monte-Carlo trials against the mandated Lawnmower baseline in a 5km &times; 5km environment.
  * **Speedup:** 51.9% reduction in Mean Time to Find Target (142.6s vs. 296.8s).
  * **Fault Tolerance (30% Loss):** AEGIS retains **90.0% survivor recall**, whereas Lawnmower drops to **40.0%** because dead sectors are never visited.
  * **Ablation Study:** Removing inter-drone gossip consensus increases redundant flight paths by 33%, proving the necessity of distributed belief exchange.
* **Speaker Script:**
  > *"To ensure scientific rigor, we evaluated AEGIS against a classical Lawnmower baseline across 10 randomized trials. Under nominal conditions, AEGIS cuts Mean Time to Find Target by more than 50%. But under the required stress test—where 30% of the swarm is killed mid-mission—the difference is night and day: the Lawnmower baseline collapses to 40% survivor recall, while AEGIS autonomously rebalances and achieves 90% recall."*

---

### Slide 5: Engineering & Live Demo (2:05 - 2:35)
* **Title:** Production-Grade Tactical Web HUD & CLI Harness
* **Key Points:**
  * 60 FPS HTML5 Canvas tactical radar interface displaying live RF links, probability heatmaps, and telemetry.
  * Real-time Chaos Injection panel to simulate mid-air collisions, RF jamming, and sensor storms on demand.
  * Reproducible CLI evaluation harness (`python run_evaluation.py`) for automated scoring.
* **Speaker Script:**
  > *"Here is our live mission control console. You can see all 10 drones executing dynamic search trajectories across the 25 square kilometer grid. When we click 'Kill 30% Drones', you immediately see the red alert, the mesh network detects the drop, and the surviving drones dynamically reroute into the orphaned sectors. Everything you see is backed by a fully reproducible Python harness."*

---

### Slide 6: Limitations & Next Horizons (2:35 - 3:00)
* **Title:** Honest Constraints & The Path to Physical Deployment
* **Key Points:**
  * **Current Limitation:** 2.5D simulation model does not account for complex 3D RF line-of-sight mountain shadowing (Fresnel zones).
  * **Next Milestone:** Integrate PX4 Autopilot SITL (Software-in-the-Loop) via MAVLink with physical ESP32 LoRa hardware transceivers.
  * **Conclusion:** AEGIS-SWARM transforms fragile multi-agent robotics into resilient, life-saving search systems.
* **Speaker Script:**
  > *"In the spirit of honest evaluation, our current simulation uses a 2.5D elevation model; real alpine search requires modeling 3D RF line-of-sight occlusion. Our next step is deploying this policy onto PX4 autopilots with ESP32 LoRa transceivers for live field trials. Thank you, and we welcome your questions!"*
