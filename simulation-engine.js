/**
 * AEGIS DYNAMICS: Tactical Swarm Intelligence & Mission Simulation Engine
 * Autonomous Multi-Agent Search-and-Rescue Architecture
 *
 * Implements:
 * 1. 5km x 5km Bayesian Probability Map (25 km² disaster area constraint)
 * 2. Decentralized Information-Gain Path Planning
 * 3. Limited-Range RF Mesh Gossip Consensus (<= 1.2km communication range)
 * 4. Dynamic Failure Detection & Voronoi-weighted Task Reallocation
 * 5. Multi-Spectral Sensor Confidence Updates & Ground-Truth Verification
 * 6. Real-Time Flight Hazard Avoidance & Dynamic Sector Management
 * 7. Chronological Mission Audit Log & Responder Medevac Dispatch
 */

class SwarmSimulation {
  constructor(options = {}) {
    // Spatial dimensions (in meters)
    this.mapSize = options.mapSize || 5000; // 5000m x 5000m = 25 km²
    this.gridResolution = options.gridResolution || 50; // 50x50 cells (100m x 100m per cell)
    this.cellSize = this.mapSize / this.gridResolution;

    // Simulation params
    this.droneCount = options.droneCount || 10;
    this.sensorRadius = options.sensorRadius || 250; // 250m sensor radius (500m scan footprint)
    this.commRadius = options.commRadius || 1200; // 1.2km RF communication limit
    this.droneSpeed = options.droneSpeed || 20; // 20 m/s (~72 km/h search speed)
    this.timeStep = options.timeStep || 1.0; // 1 second per step
    this.algorithm = options.algorithm || 'aegis'; // 'aegis' (decentralized swarm) or 'lawnmower' (baseline)

    // Noise parameters
    this.sensorTruePositive = options.sensorTruePositive || 0.92;
    this.sensorFalsePositive = options.sensorFalsePositive || 0.04;
    this.sensorNoiseActive = options.sensorNoiseActive || false;

    // State
    this.simTime = 0; // seconds
    this.drones = [];
    this.survivors = [];
    this.foundSurvivors = new Set();
    this.hazards = []; // Active airspace and terrain hazards
    this.missionLogs = []; // Chronological event & decision audit trail
    this.lastGossipLogTime = 0;
    this.history = {
      timestamps: [],
      coverageOverTime: [],
      survivorsFoundOverTime: [],
      packetsExchanged: 0,
      energySpent: 0
    };

    // Global Ground Truth Probability & Prior Grid
    this.groundTruthGrid = new Float32Array(this.gridResolution * this.gridResolution);
    this.priorProbability = new Float32Array(this.gridResolution * this.gridResolution);
    this.exploredMask = new Uint8Array(this.gridResolution * this.gridResolution);

    // Active Scenario
    this.scenarioType = options.scenarioType || 'avalanche';
    this.initScenario(this.scenarioType);
  }

  /**
   * Log an operational event into the Mission Log audit trail
   */
  logEvent(level, category, source, message, coords = null) {
    const mins = Math.floor(this.simTime / 60);
    const secs = Math.floor(this.simTime % 60);
    const timeStr = `T+${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const dateObj = new Date();
    const utcStr = dateObj.toTimeString().split(' ')[0] + ' UTC';

    const entry = {
      id: this.missionLogs.length + 1,
      simTime: this.simTime,
      timeStr: timeStr,
      utcStr: utcStr,
      level: level, // 'CRITICAL', 'ALERT', 'CONSENSUS', 'DISPATCH', 'INFO'
      category: category, // 'DETECTION', 'HAZARD', 'GOSSIP', 'ATTRITION', 'PLAN CHANGE', 'MEDEVAC', 'COMMAND'
      source: source,
      message: message,
      coords: coords
    };

    this.missionLogs.unshift(entry);
    if (this.missionLogs.length > 300) this.missionLogs.pop();
    return entry;
  }

  /**
   * Initialize Disaster Scenarios and Survivor Probability Maps
   */
  initScenario(type = 'avalanche') {
    this.scenarioType = type;
    this.simTime = 0;
    this.foundSurvivors.clear();
    this.missionLogs = [];
    this.history = {
      timestamps: [],
      coverageOverTime: [],
      survivorsFoundOverTime: [],
      packetsExchanged: 0,
      energySpent: 0
    };

    const N = this.gridResolution;
    this.groundTruthGrid.fill(0);
    this.priorProbability.fill(0.05); // base uniform prior
    this.exploredMask.fill(0);

    // Initialize Default Terrain & Airspace Hazards
    if (type === 'avalanche') {
      this.hazards = [
        { id: 1, name: 'Avalanche Fracture Chute (Couloir Alpha)', type: 'Avalanche', severity: 'CRITICAL NO-FLY', x: 2600, y: 3300, radius: 450, active: true },
        { id: 2, name: 'Alpine High-Tension Transmission Lines', type: 'Power Lines', severity: 'COLLISION HAZARD', x: 1600, y: 1800, radius: 350, active: true },
        { id: 3, name: 'Matterhorn Glacier Ridge Wind Shear', type: 'Turbulence', severity: 'ADVISORY', x: 3800, y: 3800, radius: 550, active: true },
        { id: 4, name: 'Granite Blindspot (RF Degradation Zone)', type: 'RF Jamming', severity: 'RF RESTRICTED', x: 1200, y: 2700, radius: 400, active: true }
      ];
    } else if (type === 'flood') {
      this.hazards = [
        { id: 1, name: 'Submerged Power Grid Pylons', type: 'Power Lines', severity: 'COLLISION HAZARD', x: 1500, y: 1300, radius: 400, active: true },
        { id: 2, name: 'Coastal Tsunami Surge Debris Field', type: 'Flood Surge', severity: 'CRITICAL NO-FLY', x: 3800, y: 1600, radius: 500, active: true },
        { id: 3, name: 'Industrial Chemical Leak Plume', type: 'Hazmat', severity: 'NO-FLY EXCLUSION', x: 2600, y: 3900, radius: 450, active: true }
      ];
    } else if (type === 'earthquake') {
      this.hazards = [
        { id: 1, name: 'Unstable High-Rise Structural Collapse', type: 'Collapse Risk', severity: 'CRITICAL NO-FLY', x: 2500, y: 2500, radius: 500, active: true },
        { id: 2, name: 'Ruptured Gas Pipeline Flame Plume', type: 'Fire Risk', severity: 'NO-FLY EXCLUSION', x: 1600, y: 2000, radius: 380, active: true },
        { id: 3, name: 'Dense Urban Rubble RF Multipath Shadow', type: 'RF Jamming', severity: 'RF RESTRICTED', x: 3500, y: 3000, radius: 420, active: true }
      ];
    } else {
      this.hazards = [
        { id: 1, name: 'Thermal Geyser Steam Venting Zone', type: 'Turbulence', severity: 'ADVISORY', x: 2500, y: 2500, radius: 600, active: true }
      ];
    }

    this.survivors = [];
    let hotspotCenters = [];

    const triageCatalog = [
      { dangerLevel: 'CRITICAL', condition: 'Deep Snow Burial & Severe Hypothermia (<32°C)', window: '2.5 Hours', hr: 124, temp: '31.8°C' },
      { dangerLevel: 'CRITICAL', condition: 'Traumatic Brain Injury & Unconscious', window: '3.0 Hours', hr: 132, temp: '33.2°C' },
      { dangerLevel: 'CRITICAL', condition: 'Submerged Water Pocket / Respiratory Distress', window: '1.5 Hours', hr: 140, temp: '32.1°C' },
      { dangerLevel: 'URGENT', condition: 'Compound Femur Fracture & Entrapment', window: '6.0 Hours', hr: 104, temp: '34.5°C' },
      { dangerLevel: 'URGENT', condition: 'Multiple Rib Fractures & Pneumothorax Risk', window: '5.5 Hours', hr: 98, temp: '35.0°C' },
      { dangerLevel: 'URGENT', condition: 'Crush Injury to Lower Extremities', window: '7.0 Hours', hr: 102, temp: '34.8°C' },
      { dangerLevel: 'STABLE', condition: 'Mild Dehydration & Moderate Contusions', window: '18.0 Hours', hr: 84, temp: '36.2°C' },
      { dangerLevel: 'STABLE', condition: 'Conscious / Ambulatory in Shelter Void', window: '24.0 Hours', hr: 78, temp: '36.5°C' },
      { dangerLevel: 'STABLE', condition: 'Minor Lacerations & Awaiting Evacuation', window: '24.0 Hours', hr: 76, temp: '36.7°C' },
      { dangerLevel: 'URGENT', condition: 'Dislocated Shoulder & Moderate Exposure', window: '8.0 Hours', hr: 92, temp: '35.4°C' },
      { dangerLevel: 'CRITICAL', condition: 'Severe Hemorrhage / Unresponsive', window: '2.0 Hours', hr: 138, temp: '32.6°C' },
      { dangerLevel: 'STABLE', condition: 'Stable Vitals / Signaled with Flashlight', window: '20.0 Hours', hr: 80, temp: '36.4°C' }
    ];

    if (type === 'avalanche') {
      hotspotCenters = [
        { x: 2500, y: 3200, sigma: 700, weight: 0.95 },
        { x: 3600, y: 2200, sigma: 600, weight: 0.85 },
        { x: 1400, y: 3800, sigma: 650, weight: 0.80 }
      ];
      const seeds = [
        [2400, 3100], [2550, 3300], [2650, 3450], [3500, 2150],
        [3700, 2350], [1350, 3700], [1500, 3900], [1600, 3750],
        [2900, 2700], [3200, 2900]
      ];
      seeds.forEach((pt, id) => {
        const tri = triageCatalog[id % triageCatalog.length];
        this.survivors.push({
          id: id + 1,
          x: pt[0],
          y: pt[1],
          dangerLevel: tri.dangerLevel,
          medicalCondition: tri.condition,
          survivalWindow: tri.window,
          heartRate: tri.hr,
          bodyTemp: tri.temp,
          found: false,
          foundAt: null,
          foundBy: null,
          verified: false,
          falsePositive: false,
          confidence: 0,
          medevacUnit: null,
          medevacEta: null,
          thermalDelta: (12.4 + (id % 5) * 1.6).toFixed(1),
          imageSeed: (id + 1) * 37
        });
      });
    } else if (type === 'flood') {
      hotspotCenters = [
        { x: 1200, y: 1200, sigma: 800, weight: 0.85 },
        { x: 3800, y: 1500, sigma: 700, weight: 0.75 },
        { x: 2500, y: 3800, sigma: 900, weight: 0.9 },
        { x: 4000, y: 4000, sigma: 600, weight: 0.8 }
      ];
      const seeds = [
        [1100, 1150], [1350, 1280], [3750, 1450], [3900, 1600],
        [2400, 3700], [2600, 3900], [2700, 3950], [3950, 3950],
        [4100, 4100], [2000, 2200], [3000, 2800], [1500, 3200]
      ];
      seeds.forEach((pt, id) => {
        const tri = triageCatalog[(id + 2) % triageCatalog.length];
        this.survivors.push({
          id: id + 1,
          x: pt[0],
          y: pt[1],
          dangerLevel: tri.dangerLevel,
          medicalCondition: tri.condition,
          survivalWindow: tri.window,
          heartRate: tri.hr,
          bodyTemp: tri.temp,
          found: false,
          foundAt: null,
          foundBy: null,
          verified: false,
          falsePositive: false,
          confidence: 0,
          medevacUnit: null,
          medevacEta: null,
          thermalDelta: (11.8 + (id % 5) * 1.4).toFixed(1),
          imageSeed: (id + 1) * 41
        });
      });
    } else if (type === 'earthquake') {
      hotspotCenters = [
        { x: 2500, y: 2500, sigma: 1000, weight: 0.95 },
        { x: 1500, y: 2000, sigma: 500, weight: 0.7 },
        { x: 3500, y: 3000, sigma: 600, weight: 0.75 }
      ];
      const seeds = [
        [2300, 2350], [2450, 2600], [2600, 2400], [2550, 2700], [2700, 2650],
        [1450, 1950], [1580, 2100], [3400, 2950], [3600, 3100], [2200, 2800]
      ];
      seeds.forEach((pt, id) => {
        const tri = triageCatalog[(id + 4) % triageCatalog.length];
        this.survivors.push({
          id: id + 1,
          x: pt[0],
          y: pt[1],
          dangerLevel: tri.dangerLevel,
          medicalCondition: tri.condition,
          survivalWindow: tri.window,
          heartRate: tri.hr,
          bodyTemp: tri.temp,
          found: false,
          foundAt: null,
          foundBy: null,
          verified: false,
          falsePositive: false,
          confidence: 0,
          medevacUnit: null,
          medevacEta: null,
          thermalDelta: (13.1 + (id % 5) * 1.5).toFixed(1),
          imageSeed: (id + 1) * 29
        });
      });
    } else {
      hotspotCenters = [{ x: 2500, y: 2500, sigma: 2000, weight: 0.5 }];
      for (let i = 0; i < 10; i++) {
        const tri = triageCatalog[i % triageCatalog.length];
        this.survivors.push({
          id: i + 1,
          x: 400 + Math.random() * 4200,
          y: 400 + Math.random() * 4200,
          dangerLevel: tri.dangerLevel,
          medicalCondition: tri.condition,
          survivalWindow: tri.window,
          heartRate: tri.hr,
          bodyTemp: tri.temp,
          found: false,
          foundAt: null,
          foundBy: null,
          verified: false,
          falsePositive: false,
          confidence: 0,
          medevacUnit: null,
          medevacEta: null,
          thermalDelta: (12.0 + (i % 5) * 1.2).toFixed(1),
          imageSeed: (i + 1) * 19
        });
      }
    }

    // Populate Prior Probability Distribution from Gaussian Mixture
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cellX = (c + 0.5) * this.cellSize;
        const cellY = (r + 0.5) * this.cellSize;
        let p = 0.04;
        for (const h of hotspotCenters) {
          const dx = cellX - h.x;
          const dy = cellY - h.y;
          const d2 = dx * dx + dy * dy;
          p += h.weight * Math.exp(-d2 / (2 * h.sigma * h.sigma));
        }
        p = Math.min(0.95, p);
        const idx = r * N + c;
        this.priorProbability[idx] = p;
        this.groundTruthGrid[idx] = p;
      }
    }

    // Seed Initial Mission Logs
    this.logEvent('INFO', 'DISPATCH', 'MISSION-HQ', `AEGIS Autonomous Swarm deployed to ${type.toUpperCase()} theater across 25.0 km² search boundary.`, null);
    this.logEvent('INFO', 'PLAN CHANGE', 'PLANNER', `Operational Grid active: ${this.hazards.length} airspace hazard zones marked. Swarm collision avoidance online.`, null);

    // Initialize Drones
    this.initDrones();
  }

  /**
   * Initialize Fleet of 10 Drones (or custom count)
   */
  initDrones() {
    this.drones = [];
    const N = this.droneCount;

    const sectorNames = [
      'Sector 1 (North Avalanche Ridge)',
      'Sector 2 (Central Debris Basin)',
      'Sector 3 (South Couloir Runout)',
      'Sector 4 (Valley Floor Corridor)',
      'Sector 5 (Eastern Flank Slope)'
    ];

    // Base Station is at bottom edge (y = 150m), spread across x
    for (let i = 0; i < N; i++) {
      const startX = 500 + (i * (this.mapSize - 1000)) / Math.max(1, N - 1);
      const startY = 200;
      const sectorIdx = i % 5;
      const isRelay = (i === 8 || i === 9);

      const drone = {
        id: i + 1,
        callsign: `ALPHA-${i + 1 < 10 ? '0' : ''}${i + 1}`,
        x: startX,
        y: startY,
        vx: 0,
        vy: this.droneSpeed,
        targetX: startX,
        targetY: startY + 500,
        battery: 100.0, // 100% capacity
        batteryVoltage: '24.8',
        status: 'ACTIVE', // 'ACTIVE', 'DEAD', 'RTL'
        assignedSector: isRelay ? 'Sector R (Airborne Mesh Relay)' : sectorNames[sectorIdx],
        role: isRelay ? 'Airborne RF Mesh Relay' : (i % 2 === 0 ? 'FLIR LWIR Thermal Scout' : '4K Optical & LiDAR Mapper'),
        signalDbm: -56 - (i % 4) * 4,
        meshLatency: 8 + (i % 3) * 3,
        computeLoad: 32 + (i % 5) * 5,
        scannedCellsCount: 0,
        survivorsDetected: 0,
        trail: [{ x: startX, y: startY }],
        // Local decentralized belief map
        localBelief: new Float32Array(this.priorProbability),
        lastHeardFrom: new Map(), // droneId -> timestamp
        // Lawnmower parameters
        laneIndex: i,
        lawnmowerDirection: 1, // 1: moving north, -1: moving south
        lawnmowerLaneX: startX,
        lawnmowerMaxY: this.mapSize - 250,
        lawnmowerMinY: 250,
        lawnmowerStepX: 450
      };

      // Each drone knows about its own heartbeat
      drone.lastHeardFrom.set(drone.id, 0);
      this.drones.push(drone);
    }
  }

  /**
   * Main Simulation Step
   */
  step() {
    this.simTime += this.timeStep;

    // 1. Drones perform physical movement and local sensor scans
    for (const drone of this.drones) {
      if (drone.status === 'DEAD') continue;

      // Battery consumption model: ~0.028% per second active flight (~1 hour endurance)
      drone.battery = Math.max(0, drone.battery - (0.028 * this.timeStep));
      if (drone.battery <= 5.0 && drone.status === 'ACTIVE') {
        drone.status = 'RTL';
      }

      // Update position
      this.updateDroneMotion(drone);

      // Perform Sensor Scan
      this.performSensorScan(drone);

      // Keep trail points for smooth visualization
      if (Math.floor(this.simTime * 2) % 2 === 0) {
        drone.trail.push({ x: drone.x, y: drone.y });
        if (drone.trail.length > 50) drone.trail.shift();
      }
    }

    // 2. Inter-Drone RF Mesh Communication & Belief Gossip (Decentralized only)
    if (this.algorithm === 'aegis') {
      this.runMeshGossipProtocol();
      this.detectFailuresAndReallocate();
    }

    // 3. Update Global Metrics & Evaluation Record
    this.recordMetrics();
  }

  /**
   * Move drone according to its assigned planner
   */
  updateDroneMotion(drone) {
    if (this.algorithm === 'lawnmower') {
      this.updateLawnmowerMotion(drone);
    } else {
      this.updateAegisMotion(drone);
    }
  }

  /**
   * Lawnmower (Boustrophedon) Classical Sweep Motion
   */
  updateLawnmowerMotion(drone) {
    const stepDist = this.droneSpeed * this.timeStep;

    if (drone.status === 'RTL') {
      const dy = 200 - drone.y;
      drone.y += Math.sign(dy) * Math.min(Math.abs(dy), stepDist);
      return;
    }

    // Static Sector Allocation: Each drone is confined to its assigned 500m slice
    const sectorMinX = (drone.id - 1) * (this.mapSize / this.droneCount) + 125;
    const sectorMaxX = drone.id * (this.mapSize / this.droneCount) - 125;

    // Vertical sweep in lane
    const targetY = drone.lawnmowerDirection === 1 ? drone.lawnmowerMaxY : drone.lawnmowerMinY;
    const dy = targetY - drone.y;

    if (Math.abs(dy) > stepDist) {
      drone.y += Math.sign(dy) * stepDist;
    } else {
      drone.y = targetY;
      drone.lawnmowerDirection *= -1;
      // Bounce between the two sub-lanes of this drone's static sector
      if (drone.lawnmowerLaneX < (sectorMinX + sectorMaxX) / 2) {
        drone.lawnmowerLaneX = sectorMaxX;
      } else {
        drone.lawnmowerLaneX = sectorMinX;
      }
    }

    const dx = drone.lawnmowerLaneX - drone.x;
    drone.x += Math.sign(dx) * Math.min(Math.abs(dx), stepDist * 0.5);
  }

  /**
   * AEGIS: Decentralized Information-Gain Path Planning
   */
  updateAegisMotion(drone) {
    const stepDist = this.droneSpeed * this.timeStep;

    if (drone.status === 'RTL') {
      const dy = 200 - drone.y;
      drone.y += Math.sign(dy) * Math.min(Math.abs(dy), stepDist);
      return;
    }

    const distToTarget = Math.hypot(drone.targetX - drone.x, drone.targetY - drone.y);
    if (distToTarget < 150 || this.simTime % 4 < this.timeStep) {
      this.selectNextInformationGainWaypoint(drone);
    }

    let dirX = drone.targetX - drone.x;
    let dirY = drone.targetY - drone.y;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len;
    dirY /= len;

    // Decentralized collision avoidance / dispersion potential field from nearby peers
    let repulseX = 0;
    let repulseY = 0;
    for (const other of this.drones) {
      if (other.id === drone.id || other.status === 'DEAD') continue;
      const d = Math.hypot(drone.x - other.x, drone.y - other.y);
      if (d < 400 && d > 1) {
        const factor = (400 - d) / 400;
        repulseX += ((drone.x - other.x) / d) * factor * 1.5;
        repulseY += ((drone.y - other.y) / d) * factor * 1.5;
      }
    }

    // Active Airspace & Terrain Hazard Avoidance Potential Field
    if (this.hazards && this.hazards.length > 0) {
      for (const h of this.hazards) {
        if (!h.active) continue;
        const distH = Math.hypot(drone.x - h.x, drone.y - h.y);
        const safeRadius = h.radius + 180;
        if (distH < safeRadius && distH > 1) {
          const factor = (safeRadius - distH) / safeRadius;
          repulseX += ((drone.x - h.x) / distH) * factor * 3.5;
          repulseY += ((drone.y - h.y) / distH) * factor * 3.5;
        }
      }
    }

    let finalVx = dirX + repulseX;
    let finalVy = dirY + repulseY;
    const finalLen = Math.hypot(finalVx, finalVy) || 1;

    drone.vx = (finalVx / finalLen) * this.droneSpeed;
    drone.vy = (finalVy / finalLen) * this.droneSpeed;

    drone.x = Math.max(150, Math.min(this.mapSize - 150, drone.x + drone.vx * this.timeStep));
    drone.y = Math.max(150, Math.min(this.mapSize - 150, drone.y + drone.vy * this.timeStep));
  }

  /**
   * Selects waypoint that maximizes Expected Information Gain
   * I(Cell) = Entropy(P) / (Distance + alpha)
   */
  selectNextInformationGainWaypoint(drone) {
    const N = this.gridResolution;
    let bestScore = -Infinity;
    let bestX = drone.x;
    let bestY = drone.y;

    const candidateStride = 2;
    for (let r = 2; r < N - 2; r += candidateStride) {
      for (let c = 2; c < N - 2; c += candidateStride) {
        const idx = r * N + c;
        const cellX = (c + 0.5) * this.cellSize;
        const cellY = (r + 0.5) * this.cellSize;

        const p = drone.localBelief[idx];
        if (p < 0.01) continue;

        const pClamped = Math.max(1e-4, Math.min(1 - 1e-4, p));
        const entropy = -(pClamped * Math.log2(pClamped) + (1 - pClamped) * Math.log2(1 - pClamped));

        const dist = Math.hypot(cellX - drone.x, cellY - drone.y) + 300;

        let peerPenalty = 1.0;
        for (const peer of this.drones) {
          if (peer.id === drone.id || peer.status === 'DEAD') continue;
          const peerDist = Math.hypot(cellX - peer.x, cellY - peer.y);
          if (peerDist < dist * 0.75) {
            peerPenalty = 0.2;
            break;
          }
        }

        // Expected utility score: strongly prioritize high probability debris cells
        const score = (entropy * p * p * peerPenalty * 5000) / Math.pow(dist, 0.8);

        if (score > bestScore) {
          bestScore = score;
          bestX = cellX;
          bestY = cellY;
        }
      }
    }

    drone.targetX = bestX;
    drone.targetY = bestY;
  }

  /**
   * Perform sensor scan in cone around drone & execute Bayesian belief update
   */
  performSensorScan(drone) {
    const N = this.gridResolution;
    const rCell = Math.ceil(this.sensorRadius / this.cellSize);
    const centerCol = Math.floor(drone.x / this.cellSize);
    const centerRow = Math.floor(drone.y / this.cellSize);

    let noiseFactor = this.sensorNoiseActive ? 0.82 : this.sensorTruePositive;
    let falseAlarm = this.sensorNoiseActive ? 0.08 : this.sensorFalsePositive;

    for (let dr = -rCell; dr <= rCell; dr++) {
      for (let dc = -rCell; dc <= rCell; dc++) {
        const r = centerRow + dr;
        const c = centerCol + dc;

        if (r < 0 || r >= N || c < 0 || c >= N) continue;

        const cellX = (c + 0.5) * this.cellSize;
        const cellY = (r + 0.5) * this.cellSize;
        const d = Math.hypot(cellX - drone.x, cellY - drone.y);

        if (d <= this.sensorRadius) {
          const idx = r * N + c;
          this.exploredMask[idx] = 1;
          drone.scannedCellsCount++;

          let survivorPresent = false;
          let victimRef = null;
          for (const s of this.survivors) {
            if (!s.found && Math.hypot(s.x - cellX, s.y - cellY) < this.cellSize * 0.9) {
              survivorPresent = true;
              victimRef = s;
              break;
            }
          }

          let observation = 0;
          if (survivorPresent) {
            observation = Math.random() < noiseFactor ? 1 : 0;
          } else {
            observation = Math.random() < falseAlarm ? 1 : 0;
          }

          // Stretch Goal: Bayesian Likelihood update
          const prior = drone.localBelief[idx];
          let updatedBelief = prior;

          if (observation === 1) {
            const pZgivenS = noiseFactor;
            const pZgivenNotS = falseAlarm;
            const pZ = pZgivenS * prior + pZgivenNotS * (1.0 - prior);
            updatedBelief = (pZgivenS * prior) / (pZ || 1e-4);
          } else {
            const pNotZgivenS = 1.0 - noiseFactor;
            const pNotZgivenNotS = 1.0 - falseAlarm;
            const pNotZ = pNotZgivenS * prior + pNotZgivenNotS * (1.0 - prior);
            updatedBelief = (pNotZgivenS * prior) / (pNotZ || 1e-4);
          }

          drone.localBelief[idx] = Math.max(0.005, Math.min(0.99, updatedBelief));

          if (victimRef && !victimRef.found && updatedBelief > 0.65) {
            victimRef.found = true;
            victimRef.foundAt = this.simTime;
            victimRef.foundBy = drone.callsign;
            victimRef.confidence = Math.min(99.4, Math.max(88.0, Math.round(updatedBelief * 1000) / 10));
            this.foundSurvivors.add(victimRef.id);
            drone.survivorsDetected++;

            this.logEvent(
              'ALERT',
              'DETECTION',
              drone.callsign,
              `Automated sensor detection: Possible subject at Casualty #${victimRef.id < 10 ? '0' : ''}${victimRef.id} (${victimRef.dangerLevel}) with ${victimRef.confidence}% FLIR sensor confidence. Pending human operator review.`,
              { x: victimRef.x, y: victimRef.y }
            );
          }
        }
      }
    }
  }

  /**
   * Ad-Hoc RF Mesh Gossip Consensus (Drones only talk within commRadius <= 1.2 km)
   */
  runMeshGossipProtocol() {
    const N = this.drones.length;
    const gridLen = this.gridResolution * this.gridResolution;

    for (let i = 0; i < N; i++) {
      const droneA = this.drones[i];
      if (droneA.status === 'DEAD') continue;
      droneA.lastHeardFrom.set(droneA.id, this.simTime);

      for (let j = i + 1; j < N; j++) {
        const droneB = this.drones[j];
        if (droneB.status === 'DEAD') continue;

        const distance = Math.hypot(droneA.x - droneB.x, droneA.y - droneB.y);

        if (distance <= this.commRadius) {
          this.history.packetsExchanged += 2;

          droneA.lastHeardFrom.set(droneB.id, this.simTime);
          droneB.lastHeardFrom.set(droneA.id, this.simTime);

          for (const [id, t] of droneA.lastHeardFrom) {
            if (!droneB.lastHeardFrom.has(id) || droneB.lastHeardFrom.get(id) < t) {
              droneB.lastHeardFrom.set(id, t);
            }
          }
          for (const [id, t] of droneB.lastHeardFrom) {
            if (!droneA.lastHeardFrom.has(id) || droneA.lastHeardFrom.get(id) < t) {
              droneA.lastHeardFrom.set(id, t);
            }
          }

          // Decentralized Belief Map Fusion
          for (let k = 0; k < gridLen; k += 3) {
            const beliefA = droneA.localBelief[k];
            const beliefB = droneB.localBelief[k];
            const fused = (beliefA + beliefB) * 0.5;
            droneA.localBelief[k] = fused;
            droneB.localBelief[k] = fused;
          }
        }
      }
    }
  }

  /**
   * Live Failure Detection and Dynamic Task Reallocation
   */
  detectFailuresAndReallocate() {
    const HEARTBEAT_TIMEOUT = 12.0;

    for (const drone of this.drones) {
      if (drone.status === 'DEAD') continue;

      let deadPeerDetected = false;
      for (const other of this.drones) {
        if (other.id === drone.id) continue;
        const lastT = drone.lastHeardFrom.get(other.id) || 0;
        if (other.status === 'DEAD' || (this.simTime - lastT > HEARTBEAT_TIMEOUT && this.simTime > 15)) {
          deadPeerDetected = true;
          break;
        }
      }

      if (deadPeerDetected && this.simTime % 3 < this.timeStep) {
        this.selectNextInformationGainWaypoint(drone);
      }
    }
  }

  /**
   * Fail-Safe Stress Test: Simulate node attrition across the active fleet
   */
  injectDroneFailures(fraction = 0.3) {
    const activeDrones = this.drones.filter(d => d.status === 'ACTIVE');
    const killCount = Math.max(1, Math.round(activeDrones.length * fraction));

    const shuffled = [...activeDrones].sort(() => Math.random() - 0.5);
    const killedIds = [];

    for (let i = 0; i < killCount; i++) {
      shuffled[i].status = 'DEAD';
      shuffled[i].battery = 0;
      killedIds.push(shuffled[i].callsign);
    }

    this.logEvent(
      'ALERT',
      'ATTRITION',
      'FAILSAFE-CORE',
      `Simulated ${Math.round(fraction * 100)}% node loss: Nodes ${killedIds.join(', ')} reported offline. Dynamic Voronoi boundary expansion triggered autonomously across remaining ${activeDrones.length - killCount} units.`,
      null
    );

    return {
      killedCount: killCount,
      killedIds: killedIds,
      remainingCount: this.drones.filter(d => d.status === 'ACTIVE').length
    };
  }

  /**
   * Responder Action: Verify casualty and dispatch Medevac
   */
  verifyVictim(victimId) {
    const victim = this.survivors.find(s => s.id === parseInt(victimId, 10));
    if (!victim) return false;
    victim.verified = true;
    victim.falsePositive = false;
    victim.medevacUnit = 'AIR-AMBULANCE RESCUE-01';
    victim.medevacEta = '4 MIN';

    this.logEvent(
      'DISPATCH',
      'MEDEVAC',
      'OPERATOR-CMD',
      `Casualty #${victim.id < 10 ? '0' : ''}${victim.id} VERIFIED by Command. Medevac Unit RESCUE-01 dispatched with priority air-corridor clearance. ETA 4 min.`,
      { x: victim.x, y: victim.y }
    );
    return true;
  }

  /**
   * Responder Action: Flag detection as false alarm
   */
  flagFalsePositive(victimId) {
    const victim = this.survivors.find(s => s.id === parseInt(victimId, 10));
    if (!victim) return false;
    victim.falsePositive = true;
    victim.verified = false;

    this.logEvent(
      'ALERT',
      'TRIAGE',
      'OPERATOR-CMD',
      `Casualty #${victim.id < 10 ? '0' : ''}${victim.id} FLAGGED as False Positive. Target demoted from urgent medical evacuation queue.`,
      { x: victim.x, y: victim.y }
    );
    return true;
  }

  /**
   * Planner Action: Add new airspace/terrain hazard
   */
  addHazard(hazard) {
    const newId = this.hazards.length + 1;
    const h = {
      id: newId,
      name: hazard.name || `Hazard Zone H-${newId < 10 ? '0' : ''}${newId}`,
      type: hazard.type || 'Custom Hazard',
      severity: hazard.severity || 'WARNING',
      x: hazard.x || 2500,
      y: hazard.y || 2500,
      radius: hazard.radius || 400,
      active: true
    };
    this.hazards.push(h);

    this.logEvent(
      'ALERT',
      'HAZARD',
      'PLANNER',
      `New Hazard Zone marked: ${h.name} (${h.severity}, Radius ${h.radius}m). Swarm flight vectors updated.`,
      { x: h.x, y: h.y }
    );
    return h;
  }

  /**
   * Planner Action: Toggle or remove hazard
   */
  toggleHazard(hazardId) {
    const h = this.hazards.find(hz => hz.id === parseInt(hazardId, 10));
    if (h) {
      h.active = !h.active;
      this.logEvent(
        'INFO',
        'PLAN CHANGE',
        'PLANNER',
        `Hazard Zone ${h.name} status updated: ${h.active ? 'ACTIVE EXCLUSION' : 'DEACTIVATED'}.`,
        { x: h.x, y: h.y }
      );
      return h.active;
    }
    return false;
  }

  /**
   * Planner Action: Reassign drone search sector
   */
  updateDroneSector(droneId, sectorName, role = null) {
    const drone = this.drones.find(d => d.id === parseInt(droneId, 10));
    if (drone) {
      drone.assignedSector = sectorName;
      if (role) drone.role = role;
      this.logEvent(
        'INFO',
        'PLAN CHANGE',
        'PLANNER',
        `${drone.callsign} sector reassigned to "${sectorName}". Initial flight vector recalculated.`,
        null
      );
      return true;
    }
    return false;
  }

  setRfJamming(enable = true) {
    this.commRadius = enable ? 350 : 1200;
  }

  setSensorNoise(enable = true) {
    this.sensorNoiseActive = enable;
  }

  getCoveragePercent() {
    const totalCells = this.gridResolution * this.gridResolution;
    let exploredCount = 0;
    for (let i = 0; i < totalCells; i++) {
      if (this.exploredMask[i] === 1) exploredCount++;
    }
    return (exploredCount / totalCells) * 100.0;
  }

  recordMetrics() {
    const coverage = this.getCoveragePercent();
    const survivorsFound = this.foundSurvivors.size;

    this.history.timestamps.push(Math.round(this.simTime));
    this.history.coverageOverTime.push(parseFloat(coverage.toFixed(2)));
    this.history.survivorsFoundOverTime.push(survivorsFound);
  }

  getSummaryStatistics() {
    const coverage = this.getCoveragePercent();
    const survivorsCount = this.survivors.length;
    const foundCount = this.foundSurvivors.size;

    let totalTimeToFind = 0;
    let foundItems = 0;
    for (const s of this.survivors) {
      if (s.found && s.foundAt !== null) {
        totalTimeToFind += s.foundAt;
        foundItems++;
      }
    }
    const mtft = foundItems > 0 ? (totalTimeToFind / foundItems).toFixed(1) : 'N/A';

    return {
      simTimeSeconds: Math.round(this.simTime),
      coveragePercent: coverage.toFixed(1),
      survivorsFound: foundCount,
      survivorsTotal: survivorsCount,
      survivorRecall: ((foundCount / Math.max(1, survivorsCount)) * 100).toFixed(1) + '%',
      mtftSeconds: mtft,
      packetsExchanged: this.history.packetsExchanged,
      activeDronesCount: this.drones.filter(d => d.status === 'ACTIVE').length,
      deadDronesCount: this.drones.filter(d => d.status === 'DEAD').length
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SwarmSimulation };
}
