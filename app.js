/**
 * AEGIS SAR Console: Tactical Operations Controller & Multi-Agent Swarm Platform
 * Supabase Developer Console Design System & Ethical Search and Rescue Workflows
 */

// Global Operational State
let sim = null;
let benchmarkRunner = null;
let animationFrameId = null;
let isPlaying = true;
let simSpeed = 2; // Default 2x speed
let selectedDroneId = 1; // Default selected drone for FLIR gimbal feed
let soundEnabled = false; // SOUND MUTED BY DEFAULT AS REQUIRED
let currentView = 'operations'; // OPERATIONS MAP AS DEFAULT PAGE ON LOAD
let victimFilter = 'all';
let logCategoryFilter = 'all';
let logSearchQuery = '';

// Honest SAR Operator Profile State
let currentOperator = {
  callsign: 'SARAH CHEN [INCIDENT COMMANDER]',
  role: 'Incident Commander // Mountain SAR Lead'
};

// Leaflet Map & Layer State
let leafletMap = null;
let currentTileLayer = null;
let currentLayerType = 'satellite';

const SCENARIO_GEO = {
  avalanche: {
    name: 'ZERMATT ALPINE RIDGE, SWITZERLAND',
    lat: 45.9763,
    lon: 7.7491,
    zoom: 12,
    title: 'SEARCH SECTOR: 5.0 KM × 5.0 KM (25.0 KM²) • ZERMATT RIDGE'
  },
  flood: {
    name: 'FUKUSHIMA COASTAL BASIN, JAPAN',
    lat: 37.4211,
    lon: 141.0328,
    zoom: 12,
    title: 'SEARCH SECTOR: 5.0 KM × 5.0 KM (25.0 KM²) • FUKUSHIMA BASIN'
  },
  earthquake: {
    name: 'KAHRAMANMARAŞ EPICENTER, TURKEY',
    lat: 37.5753,
    lon: 36.9228,
    zoom: 12,
    title: 'SEARCH SECTOR: 5.0 KM × 5.0 KM (25.0 KM²) • KAHRAMANMARAŞ FAULT'
  },
  uniform: {
    name: 'YELLOWSTONE DISPERSED BASIN, USA',
    lat: 44.4280,
    lon: -110.5885,
    zoom: 12,
    title: 'SEARCH SECTOR: 5.0 KM × 5.0 KM (25.0 KM²) • YELLOWSTONE BASIN'
  }
};

const TILE_URLS = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
};

// Web Audio API Synthesizer (Optional, Muted by default)
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio not supported');
    }
  }
}

function playSound(type) {
  if (!soundEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'found') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'alarm') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(160, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'dispatch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  } catch (e) {}
}

// Canvases
const canvas = document.getElementById('missionCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const flirCanvas = document.getElementById('flirCanvas');
const flirCtx = flirCanvas ? flirCanvas.getContext('2d') : null;

// Initialize on DOM Ready - Directly into Operations Map
window.addEventListener('DOMContentLoaded', () => {
  initSimulation('avalanche', 'aegis');
  initLeafletMap();
  setupEventListeners();
  resizeCanvases();
  renderFleetSidebar();
  updateOperatorHeaderBadge();
  startSimulationLoop();
});

window.addEventListener('resize', resizeCanvases);

function resizeCanvases() {
  const container = document.querySelector('.canvas-viewport');
  if (container && canvas) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
}

function updateOperatorHeaderBadge() {
  const lbl = document.getElementById('operatorCallsignText');
  if (lbl) {
    lbl.textContent = currentOperator.callsign;
  }
}

/**
 * Initialize Leaflet Geographic Map
 */
function initLeafletMap() {
  const mapEl = document.getElementById('mapContainer');
  if (!mapEl || typeof L === 'undefined') {
    console.warn('Leaflet not available, falling back to standalone canvas.');
    return;
  }

  const geo = SCENARIO_GEO.avalanche;
  leafletMap = L.map('mapContainer', {
    center: [geo.lat, geo.lon],
    zoom: geo.zoom || 12,
    minZoom: 11,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true
  });

  setTileLayer('satellite');

  leafletMap.on('move', () => {
    renderCanvas();
    updateZoomRadiusIndicator();
  });
  leafletMap.on('zoom', () => {
    renderCanvas();
    updateZoomRadiusIndicator();
  });
  leafletMap.on('zoomend', () => {
    renderCanvas();
    updateZoomRadiusIndicator();
  });

  updateZoomRadiusIndicator();
}

/**
 * Dynamic Visible Radius Calculation (within 10km radius)
 */
function updateZoomRadiusIndicator() {
  if (!leafletMap) return;
  try {
    const center = leafletMap.getCenter();
    const bounds = leafletMap.getBounds();
    const eastLatLng = L.latLng(center.lat, bounds.getEast());
    const radiusMeters = center.distanceTo(eastLatLng);
    const radiusKm = (radiusMeters / 1000).toFixed(1);
    
    const lbl = document.getElementById('radiusLabelText');
    if (lbl) {
      lbl.textContent = `RADIUS: ${radiusKm} KM (SEARCH BOUNDARY)`;
    }

    const currentZoom = leafletMap.getZoom();
    const btn10 = document.getElementById('btnZoom10km');
    const btn5 = document.getElementById('btnZoom5km');
    const btn2 = document.getElementById('btnZoom2km');
    if (btn10) btn10.classList.toggle('active', currentZoom <= 12);
    if (btn5) btn5.classList.toggle('active', currentZoom === 13);
    if (btn2) btn2.classList.toggle('active', currentZoom >= 14);
  } catch (e) {}
}

function setTileLayer(type) {
  if (!leafletMap) return;
  if (currentTileLayer) {
    leafletMap.removeLayer(currentTileLayer);
  }
  currentLayerType = type;
  const url = TILE_URLS[type] || TILE_URLS.satellite;
  const maxZ = type === 'dark' ? 19 : 18;
  const subdomains = type === 'dark' ? 'abcd' : (type === 'topo' ? 'abc' : '');

  currentTileLayer = L.tileLayer(url, {
    maxZoom: maxZ,
    subdomains: subdomains
  }).addTo(leafletMap);

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layer === type);
  });
}

/**
 * Convert Simulation Meters to GPS Coordinates
 */
function simToLatLng(simX, simY) {
  const geo = SCENARIO_GEO[sim ? sim.scenarioType : 'avalanche'] || SCENARIO_GEO.avalanche;
  const dNorthMeters = simY - 2500;
  const dEastMeters = simX - 2500;

  const dLat = dNorthMeters / 111320.0;
  const dLon = dEastMeters / (111320.0 * Math.cos(geo.lat * Math.PI / 180.0));

  return [geo.lat + dLat, geo.lon + dLon];
}

/**
 * Convert Simulation Coordinates (meters) to Screen Canvas Pixels
 */
function simToScreen(simX, simY) {
  if (leafletMap) {
    const latLng = simToLatLng(simX, simY);
    const pt = leafletMap.latLngToContainerPoint(latLng);
    return { x: pt.x, y: pt.y };
  }
  const scale = canvas.width / (sim ? sim.mapSize : 5000);
  return { x: simX * scale, y: canvas.height - (simY * scale) };
}

function metersToScreenPixels(meters) {
  if (leafletMap) {
    const p1 = simToScreen(2500, 2500);
    const p2 = simToScreen(2500 + meters, 2500);
    return Math.max(8, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  }
  const scale = canvas.width / (sim ? sim.mapSize : 5000);
  return meters * scale;
}

/**
 * Initialize Simulation Engine
 */
function initSimulation(scenario = 'avalanche', algo = 'aegis') {
  sim = new SwarmSimulation({
    mapSize: 5000,
    gridResolution: 50,
    droneCount: 10,
    sensorRadius: 260,
    commRadius: 1200,
    droneSpeed: 22,
    scenarioType: scenario,
    algorithm: algo
  });
  benchmarkRunner = new SwarmBenchmarkRunner();
  updateScenarioGeoHud(scenario);
}

function updateScenarioGeoHud(scenario) {
  const geo = SCENARIO_GEO[scenario] || SCENARIO_GEO.avalanche;
  const hudGps = document.getElementById('hudGpsCoordinates');
  const hudTitle = document.getElementById('hudSectorTitle');
  if (hudGps) hudGps.textContent = `GPS: ${geo.lat.toFixed(4)}° N, ${geo.lon.toFixed(4)}° E • ${geo.name}`;
  if (hudTitle) hudTitle.textContent = geo.title;

  const planLat = document.getElementById('plannerLat');
  const planLon = document.getElementById('plannerLon');
  if (planLat) planLat.value = `${geo.lat.toFixed(4)}° N`;
  if (planLon) planLon.value = `${geo.lon.toFixed(4)}° E`;

  if (leafletMap) {
    leafletMap.flyTo([geo.lat, geo.lon], geo.zoom, { duration: 1.0 });
  }
}

/**
 * Setup All Event Handlers
 */
function setupEventListeners() {
  // 1. Navigation Tabs (Operations Map, Mission Planner, Victim Reports, Fleet Status, Mission Log)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      playSound('click');
      switchView(tab.dataset.view);
    });
  });

  // 2. Operator Profile Modal Switcher
  const btnOperatorProfile = document.getElementById('btnOperatorProfile');
  const operatorModal = document.getElementById('operatorModal');
  const btnCloseOperatorModal = document.getElementById('btnCloseOperatorModal');
  const btnConfirmOperatorProfile = document.getElementById('btnConfirmOperatorProfile');

  if (btnOperatorProfile && operatorModal) {
    btnOperatorProfile.addEventListener('click', () => {
      playSound('click');
      operatorModal.classList.add('open');
    });
  }

  if (btnCloseOperatorModal && operatorModal) {
    btnCloseOperatorModal.addEventListener('click', () => {
      operatorModal.classList.remove('open');
    });
  }

  document.querySelectorAll('.operator-preset-item').forEach(item => {
    item.addEventListener('click', () => {
      playSound('click');
      document.querySelectorAll('.operator-preset-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('customOperatorName').value = '';
    });
  });

  if (btnConfirmOperatorProfile && operatorModal) {
    btnConfirmOperatorProfile.addEventListener('click', () => {
      playSound('click');
      const customName = document.getElementById('customOperatorName').value.trim();
      const activePreset = document.querySelector('.operator-preset-item.active');

      if (customName) {
        currentOperator.callsign = customName.toUpperCase();
      } else if (activePreset) {
        currentOperator.callsign = activePreset.dataset.callsign;
      }

      updateOperatorHeaderBadge();
      operatorModal.classList.remove('open');
      showTacticalNotification(`OPERATOR PROFILE UPDATED: ${currentOperator.callsign}`, 'info');

      if (sim) {
        sim.logEvent(
          'INFO',
          'OPERATOR',
          currentOperator.callsign,
          `Active SAR dispatch profile set to: ${currentOperator.callsign}.`,
          null
        );
      }
    });
  }

  // 3. Help & About Modal
  const btnHelpModal = document.getElementById('btnHelpModal');
  const helpModal = document.getElementById('helpModal');
  const btnCloseHelpModal = document.getElementById('btnCloseHelpModal');

  if (btnHelpModal && helpModal) {
    btnHelpModal.addEventListener('click', () => {
      playSound('click');
      helpModal.classList.add('open');
    });
  }

  if (btnCloseHelpModal && helpModal) {
    btnCloseHelpModal.addEventListener('click', () => {
      helpModal.classList.remove('open');
    });
  }

  // 4. Sound Toggle (Muted by Default)
  const btnToggleSound = document.getElementById('btnToggleSound');
  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', (e) => {
      initAudio();
      soundEnabled = !soundEnabled;
      e.target.textContent = soundEnabled ? '🔊 AUDIO: ON' : '🔇 AUDIO: OFF';
      showTacticalNotification(soundEnabled ? 'Audio telemetry enabled.' : 'Audio telemetry muted.', 'info');
    });
  }

  // 5. Operations Controls
  const btnPlayPause = document.getElementById('btnPlayPause');
  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      playSound('click');
      isPlaying = !isPlaying;
      btnPlayPause.innerHTML = isPlaying ? '⏸ PAUSE' : '▶ RESUME';
    });
  }

  const btnStep = document.getElementById('btnStep');
  if (btnStep) {
    btnStep.addEventListener('click', () => {
      playSound('click');
      isPlaying = false;
      if (btnPlayPause) btnPlayPause.innerHTML = '▶ RESUME';
      sim.step();
      updateUI();
    });
  }

  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      playSound('click');
      const scenario = document.getElementById('scenarioSelect').value;
      const algo = document.querySelector('.algo-tab.active')?.dataset.algo || 'aegis';
      initSimulation(scenario, algo);
      updateUI();
      showTacticalNotification(`MISSION RESET: Dispatched to ${scenario.toUpperCase()} theater.`, 'info');
    });
  }

  const speedSlider = document.getElementById('speedSlider');
  const speedDisplay = document.getElementById('speedDisplay');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      simSpeed = parseInt(e.target.value, 10);
      if (speedDisplay) speedDisplay.textContent = `${simSpeed}x`;
    });
  }

  // Algorithm Switcher
  document.querySelectorAll('.algo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      playSound('click');
      document.querySelectorAll('.algo-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const algo = tab.dataset.algo;
      sim.algorithm = algo;
      showTacticalNotification(`ALGORITHM ENGAGED: ${algo === 'aegis' ? 'DECENTRALIZED SWARM' : 'CONVENTIONAL PARALLEL SWEEP'}`, 'info');
    });
  });

  // Scenario Selector
  const scenarioSelect = document.getElementById('scenarioSelect');
  if (scenarioSelect) {
    scenarioSelect.addEventListener('change', (e) => {
      playSound('click');
      const algo = document.querySelector('.algo-tab.active')?.dataset.algo || 'aegis';
      initSimulation(e.target.value, algo);
      updateUI();
    });
  }

  // Map Layer Switcher
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      setTileLayer(btn.dataset.layer);
    });
  });

  // Map Zoom & 10KM Radius Controls
  const btnZoomIn = document.getElementById('btnZoomIn');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      playSound('click');
      if (leafletMap) leafletMap.zoomIn();
    });
  }

  const btnZoomOut = document.getElementById('btnZoomOut');
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      playSound('click');
      if (leafletMap) leafletMap.zoomOut();
    });
  }

  const btnZoom10km = document.getElementById('btnZoom10km');
  if (btnZoom10km) {
    btnZoom10km.addEventListener('click', () => {
      playSound('click');
      if (leafletMap) {
        const geo = SCENARIO_GEO[sim ? sim.scenarioType : 'avalanche'] || SCENARIO_GEO.avalanche;
        leafletMap.flyTo([geo.lat, geo.lon], 12, { duration: 0.8 });
      }
    });
  }

  const btnZoom5km = document.getElementById('btnZoom5km');
  if (btnZoom5km) {
    btnZoom5km.addEventListener('click', () => {
      playSound('click');
      if (leafletMap) {
        const geo = SCENARIO_GEO[sim ? sim.scenarioType : 'avalanche'] || SCENARIO_GEO.avalanche;
        leafletMap.flyTo([geo.lat, geo.lon], 13, { duration: 0.8 });
      }
    });
  }

  const btnZoom2km = document.getElementById('btnZoom2km');
  if (btnZoom2km) {
    btnZoom2km.addEventListener('click', () => {
      playSound('click');
      if (leafletMap) {
        let avgX = 2500, avgY = 2500;
        if (sim && sim.drones.length > 0) {
          const alive = sim.drones.filter(d => d.status !== 'DEAD');
          if (alive.length > 0) {
            avgX = alive.reduce((acc, d) => acc + d.x, 0) / alive.length;
            avgY = alive.reduce((acc, d) => acc + d.y, 0) / alive.length;
          }
        }
        const droneLatLng = simToLatLng(avgX, avgY);
        leafletMap.flyTo(droneLatLng, 14, { duration: 0.8 });
      }
    });
  }

  // FLIR PIP Minimize/Expand
  const btnMinFlir = document.getElementById('btnMinFlir');
  const thermalCard = document.getElementById('thermalPipCard');
  if (btnMinFlir && thermalCard) {
    btnMinFlir.addEventListener('click', () => {
      playSound('click');
      thermalCard.classList.toggle('minimized');
      btnMinFlir.textContent = thermalCard.classList.contains('minimized') ? '+' : '−';
    });
  }

  // Stress Testing: 30% Node Loss
  const btnKill30 = document.getElementById('btnKill30');
  if (btnKill30) {
    btnKill30.addEventListener('click', () => {
      playSound('alarm');
      const res = sim.injectDroneFailures(0.3);
      showTacticalNotification(`ALERT: ${res.killedCount} Drones Lost (${res.killedIds.join(', ')}). Dynamic Voronoi Reallocation Triggered!`, 'danger');
      updateUI();
      checkFleetAlerts();
    });
  }

  // RF Degradation Checkbox
  const chkRfJamming = document.getElementById('chkRfJamming');
  if (chkRfJamming) {
    chkRfJamming.addEventListener('change', (e) => {
      playSound('click');
      sim.setRfJamming(e.target.checked);
      showTacticalNotification(e.target.checked ? 'WARNING: RF Range Limited to 350m (Mountain Shadow)!' : 'RF Mesh Restored to 1.2km Nominal.', 'warning');
    });
  }

  // Weather Noise Checkbox
  const chkSensorNoise = document.getElementById('chkSensorNoise');
  if (chkSensorNoise) {
    chkSensorNoise.addEventListener('change', (e) => {
      playSound('click');
      sim.setSensorNoise(e.target.checked);
      showTacticalNotification(e.target.checked ? 'WEATHER NOISE: Optical & Thermal Sensor Degradation Active.' : 'Weather Cleared: Nominal Sensor Conditions.', 'info');
    });
  }

  // 6. Mission Planner: Review & Start Proposed Plan Button
  const btnApplyAndStartPlan = document.getElementById('btnApplyAndStartPlan');
  if (btnApplyAndStartPlan) {
    btnApplyAndStartPlan.addEventListener('click', () => {
      playSound('dispatch');
      const missionName = document.getElementById('plannerMissionName')?.value || 'Operation Alpine Reach';
      const preset = document.getElementById('plannerPresetSelect')?.value || 'avalanche';

      // Log commitment to Mission Log
      if (sim) {
        sim.logEvent(
          'DISPATCH',
          'PLAN CHANGE',
          currentOperator.callsign,
          `Search Plan Authorized & Dispatched by Operator for mission: "${missionName}". All 10 UAV search sectors committed.`,
          null
        );
      }

      showTacticalNotification(`SEARCH PLAN ACTIVATED: "${missionName}". Swarm deployed across 25 km² boundary.`, 'info');

      // Seamlessly switch to Operations Map
      switchView('operations');
    });
  }

  // Planner: Add Hazard
  const btnAddHazard = document.getElementById('btnAddHazardSubmit');
  if (btnAddHazard) {
    btnAddHazard.addEventListener('click', () => {
      const nameInput = document.getElementById('newHazardName').value.trim();
      const typeSelect = document.getElementById('newHazardType').value;
      if (!nameInput) {
        showTacticalNotification('Please provide a hazard name.', 'warning');
        return;
      }
      playSound('alarm');
      sim.addHazard({
        name: nameInput,
        type: typeSelect,
        severity: 'EXCLUSION ZONE',
        x: 2000 + Math.random() * 1000,
        y: 2000 + Math.random() * 1000,
        radius: 400
      });
      document.getElementById('newHazardName').value = '';
      renderPlannerPage();
      showTacticalNotification(`HAZARD REGISTERED: ${nameInput}. Swarm avoidance vectors calculated.`, 'info');
    });
  }

  // Planner: Auto-balance sectors
  const btnAutoBalance = document.getElementById('btnAutoBalanceSectors');
  if (btnAutoBalance) {
    btnAutoBalance.addEventListener('click', () => {
      playSound('click');
      sim.detectFailuresAndReallocate();
      renderPlannerPage();
      showTacticalNotification('DYNAMIC VORONOI REBALANCED: Search sectors auto-optimized across available fleet.', 'info');
    });
  }

  // 7. Quick Sector Reassignment Actions (Operations Map & Fleet View)
  const btnOpsQuickReassign = document.getElementById('btnOpsQuickReassign');
  const btnFleetQuickReassign = document.getElementById('btnFleetQuickReassign');

  const executeQuickReassign = () => {
    playSound('dispatch');
    if (sim) {
      sim.detectFailuresAndReallocate();
      // Reassign dead/low battery drone sectors to available active ones
      const deadDrones = sim.drones.filter(d => d.status === 'DEAD' || d.battery < 20);
      const activeDrones = sim.drones.filter(d => d.status === 'ACTIVE' && d.battery >= 20);

      deadDrones.forEach((d, idx) => {
        if (activeDrones.length > 0) {
          const target = activeDrones[idx % activeDrones.length];
          sim.logEvent(
            'ALERT',
            'FLEET',
            'SWARM-ORCHESTRATOR',
            `Search Sector "${d.assignedSector}" dynamically reallocated to ${target.callsign} due to power threshold alert on ${d.callsign}.`,
            null
          );
        }
      });

      renderFleetPage();
      renderPlannerPage();
      checkFleetAlerts();
      showTacticalNotification('SECTOR REALLOCATION EXECUTED: All affected sectors re-covered by active airframes.', 'info');
    }
  };

  if (btnOpsQuickReassign) btnOpsQuickReassign.addEventListener('click', executeQuickReassign);
  if (btnFleetQuickReassign) btnFleetQuickReassign.addEventListener('click', executeQuickReassign);

  // 8. Victim Reports Filter Pills
  document.querySelectorAll('.filter-pill-bar .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      playSound('click');
      document.querySelectorAll('.filter-pill-bar .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      victimFilter = pill.dataset.filter;
      renderVictimReportsPage();
    });
  });

  // 9. Mission Log: Manual Operator Note Entry
  const btnAddManualLog = document.getElementById('btnAddManualLogNote');
  const manualLogInput = document.getElementById('manualLogInput');

  if (btnAddManualLog && manualLogInput) {
    btnAddManualLog.addEventListener('click', () => {
      const noteText = manualLogInput.value.trim();
      if (!noteText) {
        showTacticalNotification('Please enter a note before adding.', 'warning');
        return;
      }
      playSound('click');
      if (sim) {
        sim.logEvent(
          'OPERATOR',
          'OPERATOR',
          currentOperator.callsign,
          noteText,
          null
        );
      }
      manualLogInput.value = '';
      renderMissionLogsPage();
      showTacticalNotification('RESPONDER NOTE APPENDED TO MISSION AUDIT LOG.', 'info');
    });

    manualLogInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnAddManualLog.click();
    });
  }

  // Mission Log Filters & Search
  document.querySelectorAll('.log-filter-group .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      playSound('click');
      document.querySelectorAll('.log-filter-group .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      logCategoryFilter = pill.dataset.logcat;
      renderMissionLogsPage();
    });
  });

  const logSearchInput = document.getElementById('logSearchInput');
  if (logSearchInput) {
    logSearchInput.addEventListener('input', (e) => {
      logSearchQuery = e.target.value.toLowerCase();
      renderMissionLogsPage();
    });
  }

  const btnExportJson = document.getElementById('btnExportLogJson');
  if (btnExportJson) btnExportJson.addEventListener('click', exportLogsAsJson);

  const btnExportCsv = document.getElementById('btnExportLogCsv');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportLogsAsCsv);
}

/**
 * 5-Core View Switcher
 */
function switchView(viewName) {
  currentView = viewName;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === viewName);
  });

  const operationsView = document.getElementById('viewOperations');
  const plannerView = document.getElementById('viewPlanner');
  const reportsView = document.getElementById('viewReports');
  const fleetView = document.getElementById('viewFleet');
  const logsView = document.getElementById('viewLogs');

  if (viewName === 'operations') {
    if (operationsView) operationsView.classList.remove('view-hidden');
    if (plannerView) plannerView.classList.remove('active');
    if (reportsView) reportsView.classList.remove('active');
    if (fleetView) fleetView.classList.remove('active');
    if (logsView) logsView.classList.remove('active');

    setTimeout(() => {
      resizeCanvases();
      if (leafletMap) leafletMap.invalidateSize();
    }, 50);
  } else {
    if (operationsView) operationsView.classList.add('view-hidden');
    if (plannerView) plannerView.classList.toggle('active', viewName === 'planner');
    if (reportsView) reportsView.classList.toggle('active', viewName === 'reports');
    if (fleetView) fleetView.classList.toggle('active', viewName === 'fleet');
    if (logsView) logsView.classList.toggle('active', viewName === 'logs');

    if (viewName === 'planner') renderPlannerPage();
    if (viewName === 'reports') renderVictimReportsPage();
    if (viewName === 'fleet') renderFleetPage();
    if (viewName === 'logs') renderMissionLogsPage();
  }
}

/**
 * Check for Fleet Low Battery or Disconnected Drones
 */
function checkFleetAlerts() {
  if (!sim) return;
  const lowBatDrones = sim.drones.filter(d => d.battery < 20 || d.status === 'DEAD');
  const opsBanner = document.getElementById('opsReassignBanner');
  const fleetBanner = document.getElementById('fleetReassignAlertBanner');
  const opsBannerText = document.getElementById('opsAlertBannerText');

  if (lowBatDrones.length > 0) {
    const d = lowBatDrones[0];
    const alertMsg = d.status === 'DEAD'
      ? `CRITICAL ALERT: Drone ${d.callsign} lost connection / offline. Sector "${d.assignedSector}" requires immediate reassignment.`
      : `BATTERY WARNING: Drone ${d.callsign} at critical level (${Math.round(d.battery)}%). Sector "${d.assignedSector}" requires reassignment.`;

    if (opsBanner) {
      opsBanner.style.display = 'flex';
      if (opsBannerText) opsBannerText.textContent = alertMsg;
    }
    if (fleetBanner) {
      fleetBanner.style.display = 'flex';
    }
  } else {
    if (opsBanner) opsBanner.style.display = 'none';
    if (fleetBanner) fleetBanner.style.display = 'none';
  }
}

/**
 * Render Mission Planner View
 */
function renderPlannerPage() {
  if (!sim) return;

  // Review Summary Card Sync
  const revMission = document.getElementById('reviewMissionName');
  const planMissionInput = document.getElementById('plannerMissionName');
  if (revMission && planMissionInput) revMission.textContent = planMissionInput.value;

  const revHazards = document.getElementById('reviewHazardCount');
  if (revHazards) revHazards.textContent = `${sim.hazards.filter(h => h.active).length} Active Exclusion Corridors`;

  const revDrones = document.getElementById('reviewDroneCount');
  if (revDrones) revDrones.textContent = `${sim.drones.filter(d => d.status === 'ACTIVE').length} / ${sim.drones.length} Hexa-Rotor UAVs`;

  // Hazards Table
  const hazardTbody = document.getElementById('plannerHazardsTableBody');
  const hazardBadge = document.getElementById('plannerHazardCountBadge');
  if (hazardBadge) hazardBadge.textContent = `${sim.hazards.length} ACTIVE`;

  if (hazardTbody) {
    hazardTbody.innerHTML = '';
    sim.hazards.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: #fff; font-weight: 600;">${h.name}</td>
        <td>${h.type}</td>
        <td><span class="badge-subtle" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4);">${h.severity}</span></td>
        <td>${h.radius}m</td>
        <td>
          <button class="btn-console small btn-toggle-hazard" data-hid="${h.id}">
            ${h.active ? '🟢 ACTIVE' : '⚪ DISABLED'}
          </button>
        </td>
      `;
      hazardTbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-toggle-hazard').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('click');
        const hid = btn.dataset.hid;
        sim.toggleHazard(hid);
        renderPlannerPage();
      });
    });
  }

  // Drone Sector Allocation Table
  const sectorTbody = document.getElementById('plannerSectorTableBody');
  if (sectorTbody) {
    sectorTbody.innerHTML = '';
    sim.drones.forEach(d => {
      const tr = document.createElement('tr');
      const isDead = d.status === 'DEAD';

      tr.innerHTML = `
        <td style="color: #fff; font-weight: 700;">
          <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${isDead ? '#ef4444' : '#10b981'}; margin-right: 6px;"></span>
          ${d.callsign}
        </td>
        <td style="color: ${d.battery < 20 ? 'var(--accent-red)' : 'var(--accent-emerald)'}; font-weight: 700;">
          ${Math.round(d.battery)}%
        </td>
        <td>
          <select class="console-select sector-select" data-did="${d.id}" ${isDead ? 'disabled' : ''}>
            <option value="Sector 1 (North Ridge)" ${d.assignedSector.includes('Sector 1') ? 'selected' : ''}>Sector 1 (North Ridge)</option>
            <option value="Sector 2 (Debris Basin)" ${d.assignedSector.includes('Sector 2') ? 'selected' : ''}>Sector 2 (Debris Basin)</option>
            <option value="Sector 3 (South Couloir)" ${d.assignedSector.includes('Sector 3') ? 'selected' : ''}>Sector 3 (South Couloir)</option>
            <option value="Sector 4 (Valley Floor)" ${d.assignedSector.includes('Sector 4') ? 'selected' : ''}>Sector 4 (Valley Floor)</option>
            <option value="Sector 5 (East Flank)" ${d.assignedSector.includes('Sector 5') ? 'selected' : ''}>Sector 5 (East Flank)</option>
            <option value="Sector R (Mesh Relay)" ${d.assignedSector.includes('Sector R') ? 'selected' : ''}>Sector R (Mesh Relay)</option>
          </select>
        </td>
        <td>${d.role}</td>
        <td>${d.signalDbm} dBm</td>
        <td>
          <span class="badge-subtle" style="color: ${isDead ? '#ef4444' : '#3ecf8e'};">
            ${isDead ? 'OFFLINE' : (d.status === 'RTL' ? 'RTL' : 'AIRBORNE')}
          </span>
        </td>
      `;
      sectorTbody.appendChild(tr);
    });

    document.querySelectorAll('.sector-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        playSound('click');
        const did = e.target.dataset.did;
        sim.updateDroneSector(did, e.target.value);
      });
    });
  }
}

/**
 * Render Victim Reports View (Strict Ethical Human Verification)
 */
function renderVictimReportsPage() {
  const container = document.getElementById('victimReportsList');
  if (!container || !sim) return;

  const total = sim.survivors.length;
  const located = sim.foundSurvivors.size;
  let dispatched = 0;
  let pending = 0;

  sim.survivors.forEach(s => {
    if (s.verified) dispatched++;
    else if (!s.falsePositive && s.found) pending++;
  });

  const kpiTot = document.getElementById('repKpiTotal');
  const kpiLoc = document.getElementById('repKpiLocated');
  const kpiDisp = document.getElementById('repKpiDispatched');
  const kpiPend = document.getElementById('repKpiPending');

  if (kpiTot) kpiTot.textContent = total;
  if (kpiLoc) kpiLoc.textContent = `${located} / ${total}`;
  if (kpiDisp) kpiDisp.textContent = `${dispatched} RESCUES`;
  if (kpiPend) kpiPend.textContent = `${pending} TARGETS`;

  container.innerHTML = '';

  const filtered = sim.survivors.filter(s => {
    if (victimFilter === 'critical') return s.dangerLevel === 'CRITICAL';
    if (victimFilter === 'urgent') return s.dangerLevel === 'URGENT';
    if (victimFilter === 'stable') return s.dangerLevel === 'STABLE';
    if (victimFilter === 'verified') return s.verified === true;
    if (victimFilter === 'false-alarm') return s.falsePositive === true;
    if (victimFilter === 'pending') return s.found && !s.verified && !s.falsePositive;
    return true; // 'all'
  });

  filtered.forEach(s => {
    const latLng = simToLatLng(s.x, s.y);
    const card = document.createElement('div');
    const borderClass = s.verified ? 'verified-border' : (s.falsePositive ? 'false-alarm-border' : '');
    card.className = `victim-report-card ${borderClass}`;

    let dangerBadgeClass = 'stable';
    if (s.dangerLevel === 'CRITICAL') dangerBadgeClass = 'critical';
    else if (s.dangerLevel === 'URGENT') dangerBadgeClass = 'urgent';

    const confidenceVal = s.confidence > 0 ? `${s.confidence.toFixed(1)}%` : '89.4%';
    const detectTimeStr = s.foundAt !== null ? `T+${Math.floor(s.foundAt / 60)}m ${Math.floor(s.foundAt % 60)}s` : 'ESTIMATED PRIORITY';
    const detectorNode = s.foundBy || 'ALPHA-02';

    let statusPill = '';
    if (s.verified) {
      statusPill = `<span style="color: var(--accent-emerald); font-weight: 700;">✅ CONFIRMED SUBJECT • MEDEVAC UNIT RESCUE-01 DISPATCHED (ETA: 4 MIN)</span>`;
    } else if (s.falsePositive) {
      statusPill = `<span style="color: var(--text-muted); font-weight: 600;">⚪ DISMISSED (FALSE ALARM / NATURAL HEAT SOURCE)</span>`;
    } else if (s.found) {
      statusPill = `<span style="color: var(--accent-amber); font-weight: 700;">⚠️ POSSIBLE DETECTION • AWAITING HUMAN OPERATOR VERIFICATION</span>`;
    } else {
      statusPill = `<span style="color: var(--text-muted);">⏳ PREDICTED PROBABILITY HOTSPOT • AREA SCAN IN PROGRESS</span>`;
    }

    card.innerHTML = `
      <div class="report-header">
        <span class="report-victim-id mono">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${s.dangerLevel === 'CRITICAL' ? '#ef4444' : (s.dangerLevel === 'URGENT' ? '#f59e0b' : '#3ecf8e')};"></span>
          DETECTION #${s.id < 10 ? '0' : ''}${s.id} // CAS-${8800 + s.id}
        </span>
        <span class="triage-badge ${dangerBadgeClass} mono">${s.dangerLevel} PRIORITY</span>
      </div>

      <!-- Simulated Aerial Snapshot Preview -->
      <div class="aerial-snapshot-box" id="snapshotBox-${s.id}">
        <canvas class="aerial-snapshot-canvas" id="snapCanvas-${s.id}" width="380" height="150"></canvas>
        <div class="snapshot-hud-overlay mono">
          <div style="display: flex; justify-content: space-between;">
            <span>SENSOR: FLIR EO/IR THERMAL</span>
            <span>ALT: 120m AGL</span>
          </div>
          <div class="snapshot-reticle-box"></div>
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            <span>TEMP: 36.8°C (Δ +${s.thermalDelta}°C)</span>
            <span>CONFIDENCE: ${confidenceVal}</span>
          </div>
        </div>
      </div>

      <div style="font-size: 0.76rem; color: var(--text-secondary); line-height: 1.4;">
        <strong style="color: #fff;">Field Assessment:</strong> ${s.medicalCondition}
      </div>

      <div class="report-meta-grid mono">
        <div class="report-meta-item">
          <span class="report-meta-lbl">GPS COORDINATES</span>
          <span class="report-meta-val">${latLng[0].toFixed(5)}° N, ${latLng[1].toFixed(5)}° E</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-lbl">EST. SURVIVAL WINDOW</span>
          <span class="report-meta-val" style="color: ${s.dangerLevel === 'CRITICAL' ? '#ef4444' : '#fff'};">${s.survivalWindow}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-lbl">DETECTING SENSOR NODE</span>
          <span class="report-meta-val">${detectorNode} @ ${detectTimeStr}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-lbl">EST. BIOMETRIC VITALS</span>
          <span class="report-meta-val">${s.heartRate} BPM (Body: ${s.bodyTemp})</span>
        </div>
      </div>

      <div class="mono" style="font-size: 0.72rem; padding: 4px 0;">
        ${statusPill}
      </div>

      <div class="responder-actions-row mono">
        <button class="btn-confirm-rescue" data-vid="${s.id}" ${s.verified ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
          ✅ CONFIRM SUBJECT &amp; DISPATCH TEAM
        </button>
        <button class="btn-dismiss-false" data-vid="${s.id}" ${s.falsePositive ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
          ❌ DISMISS FALSE ALARM
        </button>
        <button class="btn-console small btn-locate-map" data-x="${s.x}" data-y="${s.y}" data-vid="${s.id}">
          🗺️ MAP
        </button>
      </div>
    `;

    container.appendChild(card);

    setTimeout(() => {
      drawAerialSnapshotCanvas(`snapCanvas-${s.id}`, s);
    }, 10);
  });

  // Action Button Listeners
  document.querySelectorAll('.btn-confirm-rescue').forEach(btn => {
    btn.addEventListener('click', () => {
      const vid = btn.dataset.vid;
      playSound('dispatch');
      sim.verifyVictim(vid);
      renderVictimReportsPage();
      showTacticalNotification(`SUBJECT CONFIRMED: Ground rescue and Medevac unit dispatched to Casualty #${vid}.`, 'info');
    });
  });

  document.querySelectorAll('.btn-dismiss-false').forEach(btn => {
    btn.addEventListener('click', () => {
      const vid = btn.dataset.vid;
      playSound('click');
      sim.flagFalsePositive(vid);
      renderVictimReportsPage();
      showTacticalNotification(`Detection #${vid} dismissed as false alarm by Operator.`, 'warning');
    });
  });

  document.querySelectorAll('.btn-locate-map').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const vx = parseFloat(btn.dataset.x);
      const vy = parseFloat(btn.dataset.y);
      const vid = btn.dataset.vid;
      switchView('operations');
      const latLng = simToLatLng(vx, vy);
      if (leafletMap) {
        leafletMap.flyTo(latLng, 15, { duration: 1.0 });
      }
      showTacticalNotification(`CAMERA CENTERING: CASUALTY #${vid} (${latLng[0].toFixed(4)}° N, ${latLng[1].toFixed(4)}° E)`, 'info');
    });
  });
}

/**
 * Draw Simulated Aerial Thermal Snapshot
 */
function drawAerialSnapshotCanvas(canvasId, victim) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const sCtx = c.getContext('2d');
  const W = c.width;
  const H = c.height;

  // Dark Terrain Texture
  sCtx.fillStyle = '#080808';
  sCtx.fillRect(0, 0, W, H);

  // Elevation contours
  sCtx.strokeStyle = 'rgba(62, 207, 142, 0.12)';
  sCtx.lineWidth = 1.0;
  for (let i = 0; i < 4; i++) {
    sCtx.beginPath();
    sCtx.arc(W / 2 + (victim.imageSeed % 50) - 25, H / 2 + (victim.imageSeed % 30) - 15, 25 + i * 20, 0, Math.PI * 2);
    sCtx.stroke();
  }

  // Scanlines
  sCtx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let y = 0; y < H; y += 4) {
    sCtx.fillRect(0, y, W, 1);
  }

  // Radiant Body Heat Signature (White-Hot IR)
  const cx = W / 2;
  const cy = H / 2;
  const heatRadius = victim.dangerLevel === 'CRITICAL' ? 16 : 20;

  const grad = sCtx.createRadialGradient(cx, cy, 0, cx, cy, heatRadius);
  grad.addColorStop(0, '#ffffff'); // pure white-hot
  grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.9)'); // yellow
  grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.65)'); // red bloom
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  sCtx.fillStyle = grad;
  sCtx.beginPath();
  sCtx.arc(cx, cy, heatRadius, 0, Math.PI * 2);
  sCtx.fill();

  // Target Reticle
  sCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
  sCtx.lineWidth = 1.2;
  sCtx.beginPath();
  sCtx.moveTo(cx - 16, cy); sCtx.lineTo(cx - 5, cy);
  sCtx.moveTo(cx + 5, cy); sCtx.lineTo(cx + 16, cy);
  sCtx.moveTo(cx, cy - 16); sCtx.lineTo(cx, cy - 5);
  sCtx.moveTo(cx, cy + 5); sCtx.lineTo(cx, cy + 16);
  sCtx.stroke();
}

/**
 * Render Fleet Status View
 */
function renderFleetPage() {
  const container = document.getElementById('fleetPageGrid');
  if (!container || !sim) return;

  checkFleetAlerts();

  const activeDrones = sim.drones.filter(d => d.status === 'ACTIVE');
  let totalBat = 0;
  sim.drones.forEach(d => totalBat += d.battery);
  const avgBat = (totalBat / sim.drones.length).toFixed(1);

  const kpiAct = document.getElementById('fleetKpiActive');
  const kpiBat = document.getElementById('fleetKpiAvgBat');
  const kpiMesh = document.getElementById('fleetKpiMesh');
  const kpiArea = document.getElementById('fleetKpiArea');

  if (kpiAct) kpiAct.textContent = `${activeDrones.length} / ${sim.drones.length}`;
  if (kpiBat) kpiBat.textContent = `${avgBat}%`;
  if (kpiMesh) kpiMesh.textContent = sim.algorithm === 'aegis' ? '100% NOMINAL' : 'MANUAL';
  if (kpiArea) kpiArea.textContent = `${((sim.getCoveragePercent() / 100) * 25.0).toFixed(1)} km²`;

  container.innerHTML = '';

  sim.drones.forEach(d => {
    const card = document.createElement('div');
    const isDead = d.status === 'DEAD';
    card.className = `fleet-drone-card ${isDead ? 'status-dead' : ''}`;

    let statusPill = `<span class="badge-subtle" style="color: var(--accent-emerald);">AIRBORNE SEARCH</span>`;
    if (isDead) statusPill = `<span class="badge-subtle" style="color: var(--accent-red);">NODE LOST (OFFLINE)</span>`;
    else if (d.status === 'RTL') statusPill = `<span class="badge-subtle" style="color: var(--accent-amber);">RETURN TO BASE (RTL)</span>`;
    else if (d.role.includes('Relay')) statusPill = `<span class="badge-subtle" style="color: #38bdf8;">RF MESH RELAY</span>`;

    const batColor = d.battery > 50 ? 'var(--accent-emerald)' : (d.battery > 20 ? 'var(--accent-amber)' : 'var(--accent-red)');

    card.innerHTML = `
      <div class="fleet-card-header">
        <span class="fleet-callsign mono">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 19 21 12 17 5 21 12 2"/></svg>
          ${d.callsign} // SAR-X4
        </span>
        ${statusPill}
      </div>

      <div class="battery-gauge-container mono">
        <div style="display: flex; justify-content: space-between; font-size: 0.72rem;">
          <span style="color: var(--text-muted);">POWER CAPACITY</span>
          <span style="color: ${batColor}; font-weight: 700;">${Math.round(d.battery)}% (${d.batteryVoltage}V)</span>
        </div>
        <div class="battery-bar-track">
          <div class="battery-bar-fill" style="width: ${d.battery}%; background: ${batColor};"></div>
        </div>
      </div>

      <div class="telemetry-row-grid mono">
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">SPEED</span>
          <div style="font-weight: 700; color: #fff;">${isDead ? '0' : '22'} m/s</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">ALTITUDE</span>
          <div style="font-weight: 700; color: #fff;">${isDead ? '0' : '120'}m AGL</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">RF SIGNAL</span>
          <div style="font-weight: 700; color: var(--accent-emerald);">${isDead ? '--' : d.signalDbm + ' dBm'}</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">EDGE COMPUTE</span>
          <div style="font-weight: 700; color: #fff;">${isDead ? '0%' : d.computeLoad + '%'}</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">LATENCY</span>
          <div style="font-weight: 700; color: #fff;">${isDead ? '--' : d.meshLatency + ' ms'}</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.62rem;">DETECTIONS</span>
          <div style="font-weight: 700; color: #38bdf8;">${d.survivorsDetected} FOUND</div>
        </div>
      </div>

      <div class="mono" style="font-size: 0.72rem; color: var(--text-secondary);">
        <strong>ASSIGNED SECTOR:</strong> ${d.assignedSector}
      </div>

      <div style="display: flex; gap: 8px; margin-top: auto;">
        <button class="btn-console btn-drone-rtl mono" data-did="${d.id}" ${isDead ? 'disabled style="opacity: 0.4;"' : ''} style="flex: 1; font-size: 0.7rem; justify-content: center;">
          🛑 ORDER RTL
        </button>
        <button class="btn-console btn-drone-focus mono" data-did="${d.id}" style="font-size: 0.7rem; padding: 4px 10px;">
          🎯 FLIR CAM
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll('.btn-drone-rtl').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('alarm');
      const did = parseInt(btn.dataset.did, 10);
      const drone = sim.drones.find(d => d.id === did);
      if (drone) {
        drone.status = 'RTL';
        sim.logEvent('ALERT', 'FLEET', drone.callsign, 'Manual Return-to-Launch command issued by Operator. Disengaging search sector.', null);
        renderFleetPage();
        showTacticalNotification(`${drone.callsign} RTL INITIATED: Returning to Base Station.`, 'warning');
      }
    });
  });

  document.querySelectorAll('.btn-drone-focus').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      selectedDroneId = parseInt(btn.dataset.did, 10);
      switchView('operations');
      showTacticalNotification(`FLIR GIMBAL FOCUSED ON ALPHA-0${selectedDroneId}.`, 'info');
    });
  });
}

/**
 * Render Mission Log View
 */
function renderMissionLogsPage() {
  const tbody = document.getElementById('missionLogTableBody');
  if (!tbody || !sim) return;

  tbody.innerHTML = '';

  const filteredLogs = sim.missionLogs.filter(item => {
    if (logCategoryFilter !== 'all') {
      if (logCategoryFilter === 'CONFIRMATION' && !item.message.includes('VERIFIED') && !item.message.includes('CONFIRMED')) return false;
      else if (logCategoryFilter !== 'CONFIRMATION' && item.category !== logCategoryFilter) return false;
    }
    if (logSearchQuery) {
      const text = `${item.source} ${item.message} ${item.category} ${item.level}`.toLowerCase();
      if (!text.includes(logSearchQuery)) return false;
    }
    return true;
  });

  filteredLogs.forEach(entry => {
    const tr = document.createElement('tr');
    const coordStr = entry.coords ? `[${Math.round(entry.coords.x)}m, ${Math.round(entry.coords.y)}m]` : '--';

    tr.innerHTML = `
      <td style="color: var(--accent-emerald); font-weight: 700;">${entry.timeStr}</td>
      <td><span class="log-badge ${entry.level}">${entry.level}</span></td>
      <td style="color: #cbd5e1;">${entry.category}</td>
      <td style="font-weight: 600; color: #fff;">${entry.source}</td>
      <td style="color: var(--text-secondary); line-height: 1.4;">${entry.message}</td>
      <td style="color: var(--text-muted); font-size: 0.72rem;">${coordStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportLogsAsJson() {
  if (!sim) return;
  playSound('click');
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sim.missionLogs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `AEGIS_SAR_MISSION_LOG_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showTacticalNotification('MISSION AUDIT LOG DOWNLOADED (JSON FORMAT).', 'info');
}

function exportLogsAsCsv() {
  if (!sim) return;
  playSound('click');
  let csv = 'ID,MissionTime,UTC,Level,Category,Source,Message,Coordinates\n';
  sim.missionLogs.forEach(l => {
    const msg = `"${(l.message || '').replace(/"/g, '""')}"`;
    const coords = l.coords ? `"${l.coords.x},${l.coords.y}"` : '""';
    csv += `${l.id},${l.timeStr},${l.utcStr},${l.level},${l.category},${l.source},${msg},${coords}\n`;
  });
  const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `AEGIS_SAR_MISSION_LOG_${Date.now()}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showTacticalNotification('MISSION AUDIT LOG DOWNLOADED (CSV FORMAT).', 'info');
}

/**
 * Toast Notification
 */
function showTacticalNotification(msg, type = 'info') {
  const toast = document.getElementById('tacticalToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `tactical-toast ${type} show`;
  setTimeout(() => {
    toast.className = 'tactical-toast';
  }, 4000);
}

/**
 * 60 FPS Simulation & Render Loop
 */
function startSimulationLoop() {
  let prevFoundCount = 0;

  function loop() {
    if (isPlaying && sim) {
      for (let s = 0; s < simSpeed; s++) {
        sim.step();
      }

      if (sim.foundSurvivors.size > prevFoundCount) {
        playSound('found');
        prevFoundCount = sim.foundSurvivors.size;
      }
    }

    if (currentView === 'operations') {
      renderCanvas();
      renderFlirFeed();
      updateUI();
      checkFleetAlerts();
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);
}

/**
 * Canvas Rendering: High-Resolution Tactical Overlay on Real GIS Map
 */
function renderCanvas() {
  if (!ctx || !canvas) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (!leafletMap) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(62, 207, 142, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  if (!sim) return;

  // 1a. Draw 10.0 KM Operational Perimeter Ring (Max Search Radius Boundary)
  const pCenter = simToScreen(2500, 2500);
  const r10kmPx = metersToScreenPixels(10000);

  ctx.strokeStyle = '#ffa116';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(pCenter.x, pCenter.y, r10kmPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 10km Boundary Callout Label
  const label10km = '10.0 KM OPERATIONAL SEARCH BOUNDARY';
  ctx.font = 'bold 9px "JetBrains Mono", monospace';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeText(label10km, pCenter.x - r10kmPx + 15, pCenter.y - 6);
  ctx.fillStyle = '#ffa116';
  ctx.fillText(label10km, pCenter.x - r10kmPx + 15, pCenter.y - 6);

  // 1b. Draw 5km x 5km Core Search Sector Overlay
  const pTL = simToScreen(0, 5000);
  const pTR = simToScreen(5000, 5000);
  const pBR = simToScreen(5000, 0);
  const pBL = simToScreen(0, 0);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pTL.x, pTL.y);
  ctx.lineTo(pTR.x, pTR.y);
  ctx.lineTo(pBR.x, pBR.y);
  ctx.lineTo(pBL.x, pBL.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('5.0 KM × 5.0 KM CORE SECTOR', pTL.x + 8, pTL.y + 14);

  // 2. Draw Active Hazard Exclusion Zones
  if (sim.hazards && sim.hazards.length > 0) {
    for (const h of sim.hazards) {
      if (!h.active) continue;
      const hScreen = simToScreen(h.x, h.y);
      const hRadiusPx = metersToScreenPixels(h.radius);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);

      ctx.beginPath();
      ctx.arc(hScreen.x, hScreen.y, hRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      const hLabel = `⚠️ ${h.name.toUpperCase()} (EXCLUSION)`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;
      ctx.strokeText(hLabel, hScreen.x - hRadiusPx * 0.7, hScreen.y - hRadiusPx - 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillText(hLabel, hScreen.x - hRadiusPx * 0.7, hScreen.y - hRadiusPx - 4);
    }
  }

  // 3. Draw Explored Cells & Heatmap
  const N = sim.gridResolution;
  const cellMeters = sim.cellSize;

  for (let r = 0; r < N; r += 2) {
    for (let c = 0; c < N; c += 2) {
      const idx = r * N + c;
      const prior = sim.priorProbability[idx];
      const explored = sim.exploredMask[idx];

      if (prior > 0.18 || explored === 1) {
        const cellCenter = simToScreen((c + 1) * cellMeters, (r + 1) * cellMeters);
        const cellScreenW = metersToScreenPixels(cellMeters * 2);

        if (explored === 1) {
          ctx.fillStyle = 'rgba(62, 207, 142, 0.1)';
          ctx.fillRect(cellCenter.x - cellScreenW / 2, cellCenter.y - cellScreenW / 2, cellScreenW, cellScreenW);
        } else if (prior > 0.18) {
          const alpha = Math.min(0.45, prior * 0.5);
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.fillRect(cellCenter.x - cellScreenW / 2, cellCenter.y - cellScreenW / 2, cellScreenW, cellScreenW);
        }
      }
    }
  }

  // 4. Draw Inter-Drone RF Mesh Communication Links
  if (sim.algorithm === 'aegis') {
    for (let i = 0; i < sim.drones.length; i++) {
      const dA = sim.drones[i];
      if (dA.status === 'DEAD') continue;
      const ptA = simToScreen(dA.x, dA.y);

      for (let j = i + 1; j < sim.drones.length; j++) {
        const dB = sim.drones[j];
        if (dB.status === 'DEAD') continue;
        const ptB = simToScreen(dB.x, dB.y);

        const dist = Math.hypot(dA.x - dB.x, dA.y - dB.y);
        if (dist <= sim.commRadius) {
          const alpha = 1.0 - (dist / sim.commRadius) * 0.7;
          ctx.strokeStyle = `rgba(62, 207, 142, ${alpha * 0.5})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ptA.x, ptA.y);
          ctx.lineTo(ptB.x, ptB.y);
          ctx.stroke();

          // Mesh Data Pulse
          const pulseOffset = (sim.simTime * 2.5 + (i + j)) % 1;
          const pX = ptA.x + (ptB.x - ptA.x) * pulseOffset;
          const pY = ptA.y + (ptB.y - ptA.y) * pulseOffset;
          ctx.fillStyle = '#3ecf8e';
          ctx.beginPath();
          ctx.arc(pX, pY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // 5. Draw Victims with Resilient High-Contrast Visuals
  for (const s of sim.survivors) {
    const pt = simToScreen(s.x, s.y);

    let beaconColor = '#f59e0b';
    let statusLabel = `DETECTION #${s.id} [PENDING REVIEW]`;

    if (s.verified) {
      beaconColor = '#10b981';
      statusLabel = `CONFIRMED #${s.id} [MEDEVAC DISPATCHED]`;
    } else if (s.falsePositive) {
      beaconColor = '#71717a';
      statusLabel = `DISMISSED #${s.id} [FALSE ALARM]`;
    }

    if (s.found) {
      if (!s.falsePositive) {
        // Sonar ripple
        const rippleT = ((sim.simTime * 0.7 + s.id * 0.3) % 2.0) / 2.0;
        const rippleR = 8 + rippleT * 22;
        const rippleAlpha = Math.max(0, (1.0 - rippleT) * 0.6);

        ctx.strokeStyle = s.verified ? `rgba(16, 185, 129, ${rippleAlpha})` : `rgba(245, 158, 11, ${rippleAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, rippleR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Solid Dark Protective Backplate (Guarantees visibility on snow, glaciers, and satellite)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Center Beacon
      ctx.fillStyle = beaconColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Reticle Brackets
      ctx.strokeStyle = beaconColor;
      ctx.lineWidth = 1.4;
      const bSize = 9;
      ctx.beginPath();
      ctx.moveTo(pt.x - bSize, pt.y - 3); ctx.lineTo(pt.x - bSize, pt.y - bSize); ctx.lineTo(pt.x - 3, pt.y - bSize);
      ctx.moveTo(pt.x + bSize, pt.y - 3); ctx.lineTo(pt.x + bSize, pt.y - bSize); ctx.lineTo(pt.x + 3, pt.y - bSize);
      ctx.moveTo(pt.x - bSize, pt.y + 3); ctx.lineTo(pt.x - bSize, pt.y + bSize); ctx.lineTo(pt.x - 3, pt.y + bSize);
      ctx.moveTo(pt.x + bSize, pt.y + 3); ctx.lineTo(pt.x + bSize, pt.y + bSize); ctx.lineTo(pt.x + 3, pt.y + bSize);
      ctx.stroke();

      // Halo text
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.strokeText(statusLabel, pt.x + 12, pt.y + 3);

      ctx.fillStyle = beaconColor;
      ctx.fillText(statusLabel, pt.x + 12, pt.y + 3);
    } else {
      // Undetected
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 6. Draw Drones
  for (const drone of sim.drones) {
    const pt = simToScreen(drone.x, drone.y);

    // Trail
    if (drone.trail.length > 1) {
      ctx.strokeStyle = drone.status === 'DEAD' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(62, 207, 142, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const startPt = simToScreen(drone.trail[0].x, drone.trail[0].y);
      ctx.moveTo(startPt.x, startPt.y);
      for (let k = 1; k < drone.trail.length; k++) {
        const tPt = simToScreen(drone.trail[k].x, drone.trail[k].y);
        ctx.lineTo(tPt.x, tPt.y);
      }
      ctx.stroke();
    }

    if (drone.status === 'DEAD') {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pt.x - 6, pt.y - 6); ctx.lineTo(pt.x + 6, pt.y + 6);
      ctx.moveTo(pt.x + 6, pt.y - 6); ctx.lineTo(pt.x - 6, pt.y + 6);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(`${drone.callsign} [OFFLINE]`, pt.x + 8, pt.y - 6);
      continue;
    }

    // Rotating Radar Sweep Cone
    const sensorRadiusPx = metersToScreenPixels(sim.sensorRadius);
    const sweepAngle = (sim.simTime * 4.0 + drone.id * 0.8) % (Math.PI * 2);
    const sweepWidth = 0.65;

    const gradSweep = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, sensorRadiusPx);
    gradSweep.addColorStop(0, 'rgba(62, 207, 142, 0.25)');
    gradSweep.addColorStop(0.8, 'rgba(62, 207, 142, 0.08)');
    gradSweep.addColorStop(1, 'rgba(62, 207, 142, 0.0)');

    ctx.fillStyle = gradSweep;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.arc(pt.x, pt.y, sensorRadiusPx, sweepAngle - sweepWidth, sweepAngle, false);
    ctx.closePath();
    ctx.fill();

    // Radar scan edge
    ctx.strokeStyle = 'rgba(62, 207, 142, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + Math.cos(sweepAngle) * sensorRadiusPx, pt.y + Math.sin(sweepAngle) * sensorRadiusPx);
    ctx.stroke();

    // Outer Sensor FOV Ring
    ctx.strokeStyle = 'rgba(62, 207, 142, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, sensorRadiusPx, 0, Math.PI * 2);
    ctx.stroke();

    // Quadcopter Airframe
    const heading = Math.atan2(-drone.vy, drone.vx);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(heading);

    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(6, 6);
    ctx.moveTo(-6, 6); ctx.lineTo(6, -6);
    ctx.stroke();

    const rotorOffsets = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
    ctx.fillStyle = 'rgba(62, 207, 142, 0.3)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    for (const [rx, ry] of rotorOffsets) {
      ctx.beginPath();
      ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = drone.id === selectedDroneId ? '#3ecf8e' : (drone.status === 'RTL' ? '#f59e0b' : '#ffffff');
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();

    if (drone.id === selectedDroneId) {
      ctx.strokeStyle = '#3ecf8e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Drone Telemetry Label
    ctx.fillStyle = drone.id === selectedDroneId ? '#3ecf8e' : '#ededed';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(drone.callsign, pt.x + 10, pt.y - 5);

    ctx.fillStyle = drone.battery < 20 ? '#ef4444' : '#10b981';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(`${Math.round(drone.battery)}%`, pt.x + 10, pt.y + 6);
  }
}

/**
 * Render Onboard FLIR Thermal Gimbal Feed
 */
function renderFlirFeed() {
  if (!flirCtx || !sim) return;

  const W = flirCanvas.width;
  const H = flirCanvas.height;
  const targetDrone = sim.drones.find(d => d.id === selectedDroneId) || sim.drones[0];

  flirCtx.fillStyle = '#0a0a0a';
  flirCtx.fillRect(0, 0, W, H);

  flirCtx.fillStyle = 'rgba(62, 207, 142, 0.04)';
  for (let y = 0; y < H; y += 4) {
    flirCtx.fillRect(0, y, W, 1);
  }

  flirCtx.strokeStyle = 'rgba(62, 207, 142, 0.15)';
  flirCtx.lineWidth = 1;
  flirCtx.beginPath();
  flirCtx.arc(W / 2 + (targetDrone.x % 100) - 50, H / 2 + (targetDrone.y % 100) - 50, 45, 0, Math.PI * 2);
  flirCtx.stroke();

  // Artificial Horizon
  const pitch = (targetDrone.vy / 22) * 15;
  const roll = (targetDrone.vx / 22) * 20;

  flirCtx.save();
  flirCtx.translate(W / 2, H / 2);
  flirCtx.rotate((roll * Math.PI) / 180);

  flirCtx.strokeStyle = 'rgba(62, 207, 142, 0.5)';
  flirCtx.lineWidth = 1;
  flirCtx.beginPath();
  flirCtx.moveTo(-35, pitch); flirCtx.lineTo(-12, pitch);
  flirCtx.moveTo(12, pitch); flirCtx.lineTo(35, pitch);
  flirCtx.stroke();
  flirCtx.restore();

  // Thermal Signatures within FOV
  let targetInView = false;
  for (const s of sim.survivors) {
    const dx = s.x - targetDrone.x;
    const dy = s.y - targetDrone.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= sim.sensorRadius) {
      targetInView = true;
      const scale = (W / 2) / sim.sensorRadius;
      const tx = W / 2 + dx * scale;
      const ty = H / 2 - dy * scale;

      const grad = flirCtx.createRadialGradient(tx, ty, 0, tx, ty, 14);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, 'rgba(254, 240, 138, 0.9)');
      grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.6)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      flirCtx.fillStyle = grad;
      flirCtx.beginPath();
      flirCtx.arc(tx, ty, 14, 0, Math.PI * 2);
      flirCtx.fill();

      flirCtx.strokeStyle = '#ffffff';
      flirCtx.lineWidth = 1;
      flirCtx.strokeRect(tx - 8, ty - 8, 16, 16);

      flirCtx.fillStyle = '#ffffff';
      flirCtx.font = '8px "JetBrains Mono", monospace';
      flirCtx.fillText(`TARGET: #${s.id}`, tx + 10, ty + 3);
    }
  }

  const lblDrone = document.getElementById('flirDroneLabel');
  const lblTarget = document.getElementById('flirTargetStatus');
  if (lblDrone) lblDrone.textContent = `${targetDrone.callsign} // FLIR EO/IR CAMERA`;
  if (lblTarget) {
    if (targetInView) {
      lblTarget.textContent = '◎ THERMAL LOCK: TARGET IN FOV';
      lblTarget.style.color = '#ffffff';
      lblTarget.style.fontWeight = '700';
    } else {
      lblTarget.textContent = 'SEARCHING ASSIGNED SECTOR...';
      lblTarget.style.color = 'var(--text-secondary)';
      lblTarget.style.fontWeight = '400';
    }
  }
}

/**
 * Update UI Telemetry & Cards
 */
function updateUI() {
  if (!sim) return;
  const stats = sim.getSummaryStatistics();

  const simTimeEl = document.getElementById('statSimTime');
  const covEl = document.getElementById('statCoverage');
  const surEl = document.getElementById('statSurvivors');
  const actEl = document.getElementById('statActiveDrones');
  const mtftEl = document.getElementById('statMtft');
  const packEl = document.getElementById('statPackets');

  if (simTimeEl) simTimeEl.textContent = `${Math.floor(stats.simTimeSeconds / 60)}m ${stats.simTimeSeconds % 60}s`;
  if (covEl) covEl.textContent = `${stats.coveragePercent}%`;
  if (surEl) surEl.textContent = `${stats.survivorsFound} / ${stats.survivorsTotal}`;
  if (actEl) actEl.textContent = `${stats.activeDronesCount} / ${sim.drones.length}`;
  if (mtftEl) mtftEl.textContent = stats.mtftSeconds !== 'N/A' ? `${stats.mtftSeconds}s` : '--';
  if (packEl) packEl.textContent = stats.packetsExchanged.toLocaleString();

  const covBar = document.getElementById('coverageBarFill');
  if (covBar) covBar.style.width = `${stats.coveragePercent}%`;

  const nodeCountSidebar = document.getElementById('sidebarActiveNodeCount');
  if (nodeCountSidebar) nodeCountSidebar.textContent = `${stats.activeDronesCount} DRONES`;

  renderFleetSidebar();
}

/**
 * Render Left Sidebar Fleet Cards
 */
function renderFleetSidebar() {
  const list = document.getElementById('droneFleetList');
  if (!list || !sim) return;

  list.innerHTML = '';
  sim.drones.forEach(d => {
    const card = document.createElement('div');
    const isSelected = d.id === selectedDroneId;
    card.className = `drone-card ${d.status === 'DEAD' ? 'dead' : ''} ${isSelected ? 'selected' : ''}`;

    let dotColor = '#10b981';
    if (d.status === 'DEAD') dotColor = '#ef4444';
    else if (d.status === 'RTL' || d.battery < 20) dotColor = '#f59e0b';

    let roleText = 'SEARCH';
    if (d.status === 'DEAD') roleText = 'LOST';
    else if (d.status === 'RTL') roleText = 'RTL (LOW)';

    card.innerHTML = `
      <div class="drone-card-header">
        <span class="drone-callsign">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${dotColor};"></span>
          ${d.callsign}
        </span>
        <span class="drone-role-badge">${roleText}</span>
      </div>
      <div class="drone-battery-bar">
        <div class="drone-battery-fill" style="width: ${d.battery}%; background: ${d.battery < 20 ? 'var(--accent-red)' : 'var(--accent-emerald)'}"></div>
      </div>
      <div class="drone-telemetry-row mono">
        <span>BAT: ${Math.round(d.battery)}%</span>
        <span>FOUND: ${d.survivorsDetected}</span>
        <span>${d.signalDbm} dBm</span>
      </div>
    `;

    card.addEventListener('click', () => {
      playSound('click');
      selectedDroneId = d.id;
      renderFleetSidebar();
    });

    list.appendChild(card);
  });
}
