/**
 * AEGIS SAR — Multi-Drone Rescue Command Dashboard Controller (rescue-command.js)
 *
 * Strictly separates:
 * 1. SIMULATED 10-Drone Fleet Metadata (Drone 01 - Drone 10, clearly labelled SIMULATED)
 * 2. ACTUAL FastAPI YOLO Thermal Person-Detection API Output (GET /health, POST /detect with FormData "file")
 * 3. Human-in-the-Loop Candidate Review Queue (sorted by model confidence only; no GPS inferred from bbox)
 */

const RC_STORAGE_KEY = 'aegis_rescue_command_demo_candidates_v1';
const RC_SEQ_KEY = 'aegis_rescue_command_demo_seq_v1';
const HEALTH_TIMEOUT_MS = 10000;
const DETECT_TIMEOUT_MS = 35000;

/**
 * A. Ten-Drone Simulation Dataset (Drone 01 through Drone 10)
 * Explicitly labelled as SIMULATED / DEMO values — not physically connected aircraft.
 */
const SIMULATED_DRONES = [
  { id: 'Drone 01', sector: 'Sector Alpha-1 (Sim)', simLat: 45.9763, simLon: 7.7491, demoBattery: 92, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 02', sector: 'Sector Alpha-2 (Sim)', simLat: 45.9781, simLon: 7.7524, demoBattery: 88, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 03', sector: 'Sector Bravo-1 (Sim)', simLat: 45.9740, simLon: 7.7460, demoBattery: 84, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 04', sector: 'Sector Bravo-2 (Sim)', simLat: 45.9802, simLon: 7.7550, demoBattery: 79, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 05', sector: 'Sector Charlie-1 (Sim)', simLat: 45.9718, simLon: 7.7512, demoBattery: 95, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 06', sector: 'Sector Charlie-2 (Sim)', simLat: 45.9755, simLon: 7.7428, demoBattery: 73, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 07', sector: 'Sector Delta-1 (Sim)', simLat: 45.9820, simLon: 7.7485, demoBattery: 67, simStatus: 'SIMULATED LOITER' },
  { id: 'Drone 08', sector: 'Sector Delta-2 (Sim)', simLat: 45.9695, simLon: 7.7472, demoBattery: 91, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 09', sector: 'Sector Echo-1 (Sim)', simLat: 45.9774, simLon: 7.7589, demoBattery: 81, simStatus: 'SIMULATED PATROL' },
  { id: 'Drone 10', sector: 'Sector Echo-2 (Sim)', simLat: 45.9732, simLon: 7.7561, demoBattery: 86, simStatus: 'SIMULATEDSTANDBY' }
];

// Normalize Drone 10 label spacing
SIMULATED_DRONES[9].simStatus = 'SIMULATED STANDBY';

// Active UI State
let selectedDroneId = 'Drone 01';
let selectedImageFile = null;
let latestApiDetectionPayload = null;
let queueStatusFilter = 'ALL';

// DOM Elements
const rcSimulatedDroneGrid = document.getElementById('rcSimulatedDroneGrid');
const rcSelectedDroneBanner = document.getElementById('rcSelectedDroneBanner');
const rcDroneSelect = document.getElementById('rcDroneSelect');

const rcApiBaseUrl = document.getElementById('rcApiBaseUrl');
const rcApiDocsLink = document.getElementById('rcApiDocsLink');
const btnCheckHealthMain = document.getElementById('btnCheckHealthMain');
const btnHeaderCheckHealth = document.getElementById('btnHeaderCheckHealth');
const rcHeaderApiDot = document.getElementById('rcHeaderApiDot');
const rcHeaderApiText = document.getElementById('rcHeaderApiText');
const rcHealthDetailBadge = document.getElementById('rcHealthDetailBadge');
const rcHealthStatusField = document.getElementById('rcHealthStatusField');
const rcHealthLoadedField = document.getElementById('rcHealthLoadedField');
const rcHealthClassesField = document.getElementById('rcHealthClassesField');

const rcImageInput = document.getElementById('rcImageInput');
const rcUploadDropzone = document.getElementById('rcUploadDropzone');
const rcSelectedFileLabel = document.getElementById('rcSelectedFileLabel');
const btnRunDetection = document.getElementById('btnRunDetection');
const btnClearUpload = document.getElementById('btnClearUpload');
const rcDetectionAlert = document.getElementById('rcDetectionAlert');
const rcAlertSpinner = document.getElementById('rcAlertSpinner');
const rcAlertText = document.getElementById('rcAlertText');
const btnRcAlertRetry = document.getElementById('btnRcAlertRetry');

const rcPreviewPlaceholder = document.getElementById('rcPreviewPlaceholder');
const rcPreviewWrap = document.getElementById('rcPreviewWrap');
const rcImagePreview = document.getElementById('rcImagePreview');
const rcBboxCanvas = document.getElementById('rcBboxCanvas');

const rcApiWarningBanner = document.getElementById('rcApiWarningBanner');
const rcOutStatus = document.getElementById('rcOutStatus');
const rcOutCount = document.getElementById('rcOutCount');
const rcOutDims = document.getElementById('rcOutDims');
const rcOutGps = document.getElementById('rcOutGps');
const rcMetaDroneId = document.getElementById('rcMetaDroneId');
const rcMetaDroneCoords = document.getElementById('rcMetaDroneCoords');
const rcMetaDistance = document.getElementById('rcMetaDistance');
const rcMetaEta = document.getElementById('rcMetaEta');
const rcLatestDetectionsBody = document.getElementById('rcLatestDetectionsBody');
const rcRawEndpointTag = document.getElementById('rcRawEndpointTag');
const rcRawJsonPre = document.getElementById('rcRawJsonPre');

const rcReviewQueueBody = document.getElementById('rcReviewQueueBody');
const rcQueueCountBadge = document.getElementById('rcQueueCountBadge');
const rcQueueFilterSelect = document.getElementById('rcQueueFilterSelect');
const btnClearDemoData = document.getElementById('btnClearDemoData');

const calcCandLat = document.getElementById('calcCandLat');
const calcCandLon = document.getElementById('calcCandLon');
const calcTeamLat = document.getElementById('calcTeamLat');
const calcTeamLon = document.getElementById('calcTeamLon');
const calcRangeResult = document.getElementById('calcRangeResult');
const btnCalcValidatedRange = document.getElementById('btnCalcValidatedRange');
const btnResetValidatedRange = document.getElementById('btnResetValidatedRange');

let pendingRcRetryCallback = null;

/**
 * Helper: Escape HTML to prevent XSS when displaying filenames or API strings
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBaseUrl() {
  const url = (rcApiBaseUrl.value || '').trim().replace(/\/+$/, '');
  if (rcApiDocsLink && url) {
    rcApiDocsLink.href = `${url}/docs`;
  }
  return url;
}

function formatGpsCoordinates(gpsVal) {
  if (gpsVal === null || gpsVal === undefined || gpsVal === '') {
    return 'GPS unavailable';
  }
  if (typeof gpsVal === 'object') {
    const lat = gpsVal.lat ?? gpsVal.latitude;
    const lon = gpsVal.lon ?? gpsVal.lng ?? gpsVal.longitude;
    if (typeof lat === 'number' && typeof lon === 'number') {
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  }
  return String(gpsVal);
}

function setAlert(type, message, spinning = false, retryAction = null) {
  pendingRcRetryCallback = retryAction;
  if (!type) {
    rcDetectionAlert.className = 'rc-alert mono';
    rcDetectionAlert.style.display = 'none';
    if (btnRcAlertRetry) btnRcAlertRetry.style.display = 'none';
    return;
  }
  rcDetectionAlert.className = `rc-alert ${type} mono`;
  rcDetectionAlert.style.display = 'flex';
  rcAlertSpinner.style.display = spinning ? 'inline-block' : 'none';
  rcAlertText.textContent = message;
  if (btnRcAlertRetry) {
    btnRcAlertRetry.style.display = typeof retryAction === 'function' ? 'inline-flex' : 'none';
  }
}

/**
 * Section A: Render 10 Simulated Drones (Drone 01 - Drone 10)
 */
function initSimulatedDroneFleet() {
  // Populate dropdown
  rcDroneSelect.innerHTML = '';
  SIMULATED_DRONES.forEach(drone => {
    const opt = document.createElement('option');
    opt.value = drone.id;
    opt.textContent = `${drone.id} [SIMULATED] — ${drone.simLat.toFixed(4)}° N, ${drone.simLon.toFixed(4)}° E (Demo Bat: ${drone.demoBattery}%)`;
    rcDroneSelect.appendChild(opt);
  });
  rcDroneSelect.value = selectedDroneId;

  renderSimulatedDroneCards();
  updateSelectedDroneMetadataPanel();
}

function renderSimulatedDroneCards() {
  rcSimulatedDroneGrid.innerHTML = '';

  SIMULATED_DRONES.forEach(drone => {
    const isSelected = drone.id === selectedDroneId;
    const card = document.createElement('div');
    card.className = `rc-drone-card ${isSelected ? 'selected' : ''}`;

    const batColor = drone.demoBattery >= 75 ? '#10b981' : '#f59e0b';

    card.innerHTML = `
      <div class="rc-drone-top">
        <span class="rc-drone-id">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isSelected ? '#f97316' : '#38bdf8'};"></span>
          ${escapeHtml(drone.id)}
        </span>
        <span class="rc-badge rc-badge-sim">SIMULATED</span>
      </div>
      <div class="rc-battery-track">
        <div class="rc-battery-fill" style="width: ${drone.demoBattery}%; background: ${batColor};"></div>
      </div>
      <div class="rc-drone-meta">
        <div class="rc-drone-meta-row">
          <span>STATUS:</span>
          <span style="color: #e2e8f0; font-weight: 600;">${escapeHtml(drone.simStatus)}</span>
        </div>
        <div class="rc-drone-meta-row">
          <span>SIM COORDS:</span>
          <span style="color: #38bdf8;">${drone.simLat.toFixed(4)}°N, ${drone.simLon.toFixed(4)}°E</span>
        </div>
        <div class="rc-drone-meta-row">
          <span>DEMO BATTERY:</span>
          <span style="color: ${batColor}; font-weight: 700;">${drone.demoBattery}% (DEMO)</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectSimulatedDrone(drone.id);
    });

    rcSimulatedDroneGrid.appendChild(card);
  });
}

function selectSimulatedDrone(droneId) {
  selectedDroneId = droneId;
  rcDroneSelect.value = droneId;
  renderSimulatedDroneCards();
  updateSelectedDroneMetadataPanel();
}

function getSelectedSimulatedDrone() {
  return SIMULATED_DRONES.find(d => d.id === selectedDroneId) || SIMULATED_DRONES[0];
}

function updateSelectedDroneMetadataPanel() {
  const drone = getSelectedSimulatedDrone();
  rcSelectedDroneBanner.textContent = `ACTIVE SUBMITTING DRONE: ${drone.id.toUpperCase()} (SIMULATED)`;
  rcMetaDroneId.textContent = `${drone.id} (SIMULATED)`;
  rcMetaDroneCoords.textContent = `SIMULATED: ${drone.simLat.toFixed(4)}° N, ${drone.simLon.toFixed(4)}° E`;
}

/**
 * Section B1: Check API Health (GET /health) with Timeout & Error Handling
 */
async function checkApiHealth() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    setHealthOffline('Missing API URL');
    return;
  }

  rcHeaderApiDot.className = 'rc-status-dot checking';
  rcHeaderApiText.textContent = 'API: CHECKING...';
  rcHealthDetailBadge.textContent = 'GET /health...';
  btnCheckHealthMain.disabled = true;
  btnHeaderCheckHealth.disabled = true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Endpoint returned non-JSON response (ngrok tunnel may be offline or interstitial).');
    }

    rcRawEndpointTag.textContent = `GET ${baseUrl}/health (HTTP ${response.status})`;
    rcRawJsonPre.textContent = JSON.stringify(data, null, 2);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Actual fields from GET /health: status ("ok" or "running"), model_loaded (or detector_loaded), classes
    const isOnline = data.status === 'ok' || data.status === 'running' || response.ok;
    rcHeaderApiDot.className = `rc-status-dot ${isOnline ? 'online' : 'offline'}`;
    rcHeaderApiText.textContent = isOnline ? 'API: ONLINE' : 'API: DEGRADED';

    rcHealthDetailBadge.className = 'rc-badge rc-badge-real mono';
    rcHealthDetailBadge.textContent = `ONLINE (HTTP ${response.status})`;

    rcHealthStatusField.textContent = data.status !== undefined ? String(data.status) : 'unknown';
    rcHealthStatusField.style.color = '#10b981';

    const loadedVal = data.model_loaded !== undefined ? data.model_loaded : data.detector_loaded;
    rcHealthLoadedField.textContent = loadedVal !== undefined ? String(loadedVal) : 'unknown';
    rcHealthLoadedField.style.color = loadedVal === true ? '#10b981' : '#f59e0b';

    if (data.classes && typeof data.classes === 'object') {
      rcHealthClassesField.textContent = Object.entries(data.classes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } else {
      rcHealthClassesField.textContent = data.classes !== undefined ? String(data.classes) : '--';
    }
    if (rcDetectionAlert.classList.contains('error')) {
      setAlert(null, '');
    }
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError'
      ? 'Request timed out (10s)'
      : (err.message === 'Failed to fetch' ? 'Network/CORS error or ngrok tunnel offline' : err.message);
    setHealthOffline(reason);
  } finally {
    btnCheckHealthMain.disabled = false;
    btnHeaderCheckHealth.disabled = false;
  }
}

function setHealthOffline(reason) {
  rcHeaderApiDot.className = 'rc-status-dot offline';
  rcHeaderApiText.textContent = 'API: OFFLINE';
  rcHealthDetailBadge.className = 'rc-badge rc-badge-danger mono';
  rcHealthDetailBadge.textContent = `OFFLINE (${reason})`;
  rcHealthStatusField.textContent = 'offline';
  rcHealthStatusField.style.color = '#ef4444';
  rcHealthLoadedField.textContent = 'false';
  rcHealthLoadedField.style.color = '#ef4444';
  rcHealthClassesField.textContent = '--';
  setAlert(
    'error',
    `Backend offline or unreachable (${getBaseUrl()}/health): ${reason}. Verify your Colab/ngrok tunnel and click Retry.`,
    false,
    checkApiHealth
  );
}

/**
 * Section B2: Image Upload & Preview
 */
function handleImageFileSelected(file) {
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {
    setAlert('error', `Invalid file "${file.name}". Please select a valid image file (JPG, PNG, WEBP).`);
    return;
  }

  selectedImageFile = file;
  latestApiDetectionPayload = null;

  // Ensure input[type="file"].files[0] is populated even when selected via drag-and-drop
  try {
    const input = document.querySelector('input[type="file"]');
    if (typeof DataTransfer !== 'undefined' && input && (!input.files || input.files[0] !== file)) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
  } catch (_) {
    // Fallback: selectedImageFile holds the File reference
  }

  const sizeKb = (file.size / 1024).toFixed(1);
  rcSelectedFileLabel.textContent = `${file.name} (${sizeKb} KB)`;
  rcSelectedFileLabel.style.color = '#f1f5f9';

  btnRunDetection.disabled = false;
  btnClearUpload.disabled = false;
  clearOverlayCanvas();
  setAlert(null, '');

  const reader = new FileReader();
  reader.onerror = () => {
    setAlert('error', 'Failed to read the selected image file locally.');
  };
  reader.onload = (e) => {
    rcImagePreview.onload = () => {
      rcPreviewPlaceholder.style.display = 'none';
      rcPreviewWrap.style.display = 'inline-block';
      rcImagePreview.style.display = 'block';
      syncOverlayCanvasDimensions();
    };
    rcImagePreview.onerror = () => {
      setAlert('error', 'Corrupted or unsupported image format.');
    };
    rcImagePreview.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearImageUpload() {
  selectedImageFile = null;
  latestApiDetectionPayload = null;
  rcImageInput.value = '';
  rcImagePreview.src = '';
  rcImagePreview.style.display = 'none';
  rcPreviewWrap.style.display = 'none';
  rcPreviewPlaceholder.style.display = 'block';
  clearOverlayCanvas();

  rcSelectedFileLabel.textContent = 'No image selected';
  rcSelectedFileLabel.style.color = 'var(--rc-text-muted)';
  btnRunDetection.disabled = true;
  btnClearUpload.disabled = true;
  setAlert(null, '');
}

function syncOverlayCanvasDimensions() {
  if (!rcImagePreview || !rcBboxCanvas) return;
  const rect = rcImagePreview.getBoundingClientRect();
  rcBboxCanvas.width = Math.round(rect.width) || rcImagePreview.clientWidth || 1;
  rcBboxCanvas.height = Math.round(rect.height) || rcImagePreview.clientHeight || 1;
  if (latestApiDetectionPayload) {
    drawDetectionsOnCanvas(latestApiDetectionPayload);
  }
}

function clearOverlayCanvas() {
  const ctx = rcBboxCanvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, rcBboxCanvas.width, rcBboxCanvas.height);
  }
}

/**
 * Ensure the upload payload is an actual File/Blob object (never a string, URL, or raw DOM element).
 * If an HTMLCanvasElement is provided, convert it to a JPEG File before uploading.
 */
async function ensureValidImageFile(source) {
  if (source instanceof File) {
    return source;
  }
  if (source instanceof Blob) {
    return new File([source], 'image.jpg', { type: source.type || 'image/jpeg' });
  }
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Failed to convert canvas snapshot to image Blob.');
    return new File([blob], 'image.jpg', { type: 'image/jpeg' });
  }
  throw new Error('Please select an image before running detection.');
}

/**
 * Section B3: Submit Image to POST /detect using FormData("image") per /docs OpenAPI schema
 * Do not manually set the multipart Content-Type header.
 */
async function runThermalDetection() {
  const baseUrl = getBaseUrl() || 'https://slam-slapping-gusty.ngrok-free.dev';
  const submittingDrone = getSelectedSimulatedDrone();

  btnRunDetection.disabled = true;
  btnRunDetection.textContent = '⏳ RUNNING AI DETECTION...';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);

  try {
    const input = document.getElementById('rcImageInput') || document.querySelector('input[type="file"]');
    const rawCandidate = input?.files?.[0] || selectedImageFile;

    if (!rawCandidate) {
      throw new Error('Please select an image before running detection.');
    }

    const imageFile = await ensureValidImageFile(rawCandidate);
    selectedImageFile = imageFile;

    setAlert(
      'loading',
      `Submitting "${imageFile.name}" (${imageFile.size} bytes) attributed to ${submittingDrone.id} [SIMULATED] via POST ${baseUrl}/detect (FormData field: "image")...`,
      true
    );

    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name || 'image.jpg');
    formData.append('file', imageFile, imageFile.name || 'image.jpg');

    const response = await fetch(`${baseUrl}/detect`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timer);

    const responseText = await response.text();
    rcRawEndpointTag.textContent = `POST ${baseUrl}/detect (HTTP ${response.status})`;
    try {
      rcRawJsonPre.textContent = JSON.stringify(JSON.parse(responseText), null, 2);
    } catch {
      rcRawJsonPre.textContent = responseText;
    }

    if (!response.ok) {
      throw new Error(`Detection API returned HTTP ${response.status}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log('Detection result:', result);

    latestApiDetectionPayload = result;
    rcHeaderApiDot.className = 'rc-status-dot online';
    rcHeaderApiText.textContent = 'API: ONLINE';

    // Display actual response fields & store candidate records
    renderActualDetectionResponse(result, submittingDrone);
    const createdRecords = appendDetectionsToCandidateQueue(result, submittingDrone, imageFile.name);

    setAlert(
      'success',
      `POST /detect succeeded (status: "${result.status ?? 'ok'}"). ${createdRecords.length} unverified candidate record(s) added to the review queue.`,
      false
    );
  } catch (err) {
    clearTimeout(timer);
    const msg = err.name === 'AbortError'
      ? 'Detection request timed out after 35 seconds. Check if Google Colab / ngrok is responsive.'
      : (err.message === 'Failed to fetch' ? 'Network/CORS error or ngrok tunnel offline.' : err.message);
    rcHeaderApiDot.className = 'rc-status-dot offline';
    rcHeaderApiText.textContent = 'API: OFFLINE';
    setAlert('error', `Backend offline or POST /detect failed: ${msg}`, false, runThermalDetection);
  } finally {
    const input = document.getElementById('rcImageInput') || document.querySelector('input[type="file"]');
    btnRunDetection.disabled = !(input?.files?.[0] || selectedImageFile);
    btnRunDetection.textContent = '🎯 RUN DETECTION (POST /detect)';
  }
}

/**
 * Render Actual Response Fields from POST /detect
 * Fields: status, detection_count, detections, class, confidence, bbox / bbox_xyxy, image_width, image_height, gps_coordinates, warning
 */
function renderActualDetectionResponse(data, submittingDrone) {
  rcOutStatus.textContent = data.status !== undefined ? String(data.status) : '--';
  rcOutStatus.style.color = data.status === 'ok' ? '#10b981' : '#f1f5f9';

  const detectionsArr = Array.isArray(data.detections) ? data.detections : [];
  const count = data.detection_count !== undefined ? data.detection_count : detectionsArr.length;
  rcOutCount.textContent = String(count);

  if (data.image_width !== undefined && data.image_height !== undefined) {
    rcOutDims.textContent = `${data.image_width} × ${data.image_height} px`;
  } else {
    rcOutDims.textContent = '--';
  }

  const parsedGps = formatGpsCoordinates(data.gps_coordinates ?? null);
  if (rcOutGps) {
    rcOutGps.textContent = parsedGps === 'GPS unavailable' ? 'GPS unavailable' : parsedGps;
  }

  // Update simulated drone metadata & explicit unavailable GPS/Distance/ETA
  rcMetaDroneId.textContent = `${submittingDrone.id} (SIMULATED)`;
  rcMetaDroneCoords.textContent = `SIMULATED: ${submittingDrone.simLat.toFixed(4)}° N, ${submittingDrone.simLon.toFixed(4)}° E`;
  rcMetaDistance.textContent = 'unavailable (GPS unavailable)';
  rcMetaEta.textContent = 'unavailable (GPS unavailable)';

  // API warning field (always surface thermal accuracy warning)
  const warningText = data.warning || 'Unvalidated for thermal imagery. Results are not confirmed survivor detections.';
  rcApiWarningBanner.style.display = 'block';
  rcApiWarningBanner.innerHTML = `<strong>API Warning (<code>warning</code>):</strong> ${escapeHtml(warningText)}`;

  // Populate Latest Detections Table
  rcLatestDetectionsBody.innerHTML = '';
  if (detectionsArr.length === 0) {
    rcLatestDetectionsBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 18px; color: var(--rc-text-secondary);">
          0 detections returned (<code>detection_count: 0</code>, <code>detections: []</code>).
        </td>
      </tr>
    `;
  } else {
    detectionsArr.forEach((det, idx) => {
      const tr = document.createElement('tr');
      const cls = det.class !== undefined ? String(det.class) : 'Person';
      const confNum = typeof det.confidence === 'number' ? det.confidence : null;
      const confText = confNum !== null
        ? `${(confNum * 100).toFixed(2)}% (${confNum})`
        : String(det.confidence ?? '--');
      const rawBbox = Array.isArray(det.bbox)
        ? det.bbox
        : (Array.isArray(det.bbox_xyxy) ? det.bbox_xyxy : null);
      const bboxText = rawBbox
        ? `[${rawBbox.map(n => Number(n).toFixed(2)).join(', ')}]`
        : JSON.stringify(det.bbox ?? det.bbox_xyxy ?? []);
      const detGpsText = formatGpsCoordinates(det.gps_coordinates ?? data.gps_coordinates ?? null);

      tr.innerHTML = `
        <td style="color: #fff; font-weight: 700;">#${idx + 1}</td>
        <td style="color: var(--rc-accent-orange-bright); font-weight: 700;">${escapeHtml(cls)}</td>
        <td style="color: var(--rc-accent-emerald); font-weight: 700;">${escapeHtml(confText)}</td>
        <td>${escapeHtml(bboxText)}</td>
        <td style="color: var(--rc-accent-amber);">${escapeHtml(detGpsText)}</td>
      `;
      rcLatestDetectionsBody.appendChild(tr);
    });
  }

  syncOverlayCanvasDimensions();
}

function drawDetectionsOnCanvas(data) {
  clearOverlayCanvas();
  if (!data || !Array.isArray(data.detections) || data.detections.length === 0) return;

  const ctx = rcBboxCanvas.getContext('2d');
  const dispW = rcBboxCanvas.width;
  const dispH = rcBboxCanvas.height;

  const srcW = Number(data.image_width) || rcImagePreview.naturalWidth || dispW;
  const srcH = Number(data.image_height) || rcImagePreview.naturalHeight || dispH;

  const scaleX = dispW / srcW;
  const scaleY = dispH / srcH;

  data.detections.forEach((det, idx) => {
    const rawBbox = Array.isArray(det.bbox)
      ? det.bbox
      : (Array.isArray(det.bbox_xyxy) ? det.bbox_xyxy : null);
    if (!rawBbox || rawBbox.length < 4) return;
    const [x1, y1, x2, y2] = rawBbox.map(Number);

    const rx = x1 * scaleX;
    const ry = y1 * scaleY;
    const rw = Math.max(4, (x2 - x1) * scaleX);
    const rh = Math.max(4, (y2 - y1) * scaleY);

    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    const confPct = typeof det.confidence === 'number'
      ? `${(det.confidence * 100).toFixed(1)}%`
      : '';
    const tag = `#${idx + 1} ${det.class || 'Candidate'} ${confPct} [UNVERIFIED]`;

    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const textW = ctx.measureText(tag).width;
    const labelY = Math.max(14, ry);

    ctx.fillStyle = 'rgba(7, 11, 20, 0.9)';
    ctx.fillRect(rx, labelY - 14, textW + 8, 14);

    ctx.fillStyle = '#fb923c';
    ctx.fillText(tag, rx + 4, labelY - 3);
  });
}

/**
 * Section C & E: Local Demo Candidate Records & Confidence-Sorted Review Queue
 */
function loadCandidateRecords() {
  try {
    const raw = localStorage.getItem(RC_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCandidateRecords(records) {
  try {
    localStorage.setItem(RC_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn('Unable to save demo records to localStorage:', e);
  }
}

function nextCandidateSequenceId() {
  let seq = 1;
  try {
    seq = parseInt(localStorage.getItem(RC_SEQ_KEY) || '0', 10) + 1;
    localStorage.setItem(RC_SEQ_KEY, String(seq));
  } catch {
    seq = Math.floor(Date.now() % 10000);
  }
  return `CAND-DEMO-${String(seq).padStart(4, '0')}`;
}

function appendDetectionsToCandidateQueue(apiData, submittingDrone, imageFileName) {
  const detectionsArr = Array.isArray(apiData.detections) ? apiData.detections : [];
  if (detectionsArr.length === 0) return [];

  const existing = loadCandidateRecords();
  const nowIso = new Date().toISOString();
  const created = [];

  detectionsArr.forEach(det => {
    const rawBbox = Array.isArray(det.bbox)
      ? det.bbox
      : (Array.isArray(det.bbox_xyxy) ? det.bbox_xyxy : []);
    const record = {
      candidateId: nextCandidateSequenceId(),
      timestamp: nowIso,
      simulatedDroneId: submittingDrone.id,
      simulatedDroneCoords: `SIMULATED: ${submittingDrone.simLat.toFixed(4)}° N, ${submittingDrone.simLon.toFixed(4)}° E`,
      imageName: imageFileName || 'uploaded_image',
      modelClass: det.class !== undefined ? String(det.class) : 'Person',
      confidence: typeof det.confidence === 'number' ? det.confidence : Number(det.confidence || 0),
      bbox_xyxy: rawBbox,
      candidateGps: 'Candidate GPS: unavailable',
      distance: 'unavailable',
      eta: 'unavailable',
      verificationStatus: 'Pending Review'
    };
    existing.push(record);
    created.push(record);
  });

  saveCandidateRecords(existing);
  renderCandidateReviewQueue();
  return created;
}

function renderCandidateReviewQueue() {
  const allRecords = loadCandidateRecords();
  rcQueueCountBadge.textContent = `${allRecords.length} DEMO CANDIDATE${allRecords.length === 1 ? '' : 'S'} STORED`;

  // Filter by status if selected
  const filtered = allRecords.filter(rec => {
    if (queueStatusFilter === 'ALL') return true;
    return rec.verificationStatus === queueStatusFilter;
  });

  // Sort strictly by model detection confidence descending ("AI review order — confidence only")
  filtered.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));

  rcReviewQueueBody.innerHTML = '';

  if (filtered.length === 0) {
    rcReviewQueueBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 26px; color: var(--rc-text-muted);">
          No candidate records match the current view. Upload a thermal/aerial image above and click <strong>Run Detection</strong> to populate the confidence-sorted review queue.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((rec, index) => {
    const tr = document.createElement('tr');

    const confNum = Number(rec.confidence) || 0;
    const confFormatted = `${(confNum * 100).toFixed(2)}% (${confNum.toFixed(4)})`;

    const bboxStr = Array.isArray(rec.bbox_xyxy) && rec.bbox_xyxy.length === 4
      ? `[${rec.bbox_xyxy.map(n => Number(n).toFixed(1)).join(', ')}]`
      : '[]';

    let statusBadgeHtml = '';
    if (rec.verificationStatus === 'Reviewed') {
      statusBadgeHtml = `<span class="rc-badge rc-badge-real">Reviewed</span>`;
    } else if (rec.verificationStatus === 'False Positive') {
      statusBadgeHtml = `<span class="rc-badge rc-badge-neutral">False Positive</span>`;
    } else {
      statusBadgeHtml = `<span class="rc-badge rc-badge-warn">Pending Review</span>`;
    }

    const timeDisplay = rec.timestamp
      ? new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--';

    tr.innerHTML = `
      <td style="font-weight: 800; color: var(--rc-accent-orange-bright);">
        #${index + 1} <span style="font-size: 0.6rem; color: var(--rc-text-muted);">(CONF ORDER)</span>
      </td>
      <td style="font-weight: 700; color: #fff;">${escapeHtml(rec.candidateId)}</td>
      <td>${escapeHtml(timeDisplay)}</td>
      <td>
        <span class="rc-badge rc-badge-sim">${escapeHtml(rec.simulatedDroneId)} [SIMULATED]</span>
      </td>
      <td style="color: #38bdf8;">${escapeHtml(rec.simulatedDroneCoords)}</td>
      <td>
        <div style="color: var(--rc-accent-amber); font-weight: 600;">Candidate GPS: unavailable</div>
        <div style="font-size: 0.63rem; color: var(--rc-text-muted);">Dist: unavailable • ETA: unavailable</div>
      </td>
      <td>
        <strong style="color: #fff;">${escapeHtml(rec.modelClass)}</strong>
        <div style="font-size: 0.63rem; color: var(--rc-text-muted);">bbox: ${escapeHtml(bboxStr)}</div>
      </td>
      <td style="font-weight: 800; color: var(--rc-accent-emerald);">
        ${escapeHtml(confFormatted)}
        <div style="font-size: 0.6rem; color: var(--rc-text-muted); font-weight: 400;">Confidence only (not clinical)</div>
      </td>
      <td>${statusBadgeHtml}</td>
      <td>
        <select class="rc-select mono rc-status-updater" data-cid="${escapeHtml(rec.candidateId)}" style="font-size: 0.68rem; padding: 4px 8px;">
          <option value="Pending Review" ${rec.verificationStatus === 'Pending Review' ? 'selected' : ''}>Pending Review</option>
          <option value="Reviewed" ${rec.verificationStatus === 'Reviewed' ? 'selected' : ''}>Reviewed</option>
          <option value="False Positive" ${rec.verificationStatus === 'False Positive' ? 'selected' : ''}>False Positive</option>
        </select>
      </td>
    `;

    rcReviewQueueBody.appendChild(tr);
  });

  // Bind status change listeners
  document.querySelectorAll('.rc-status-updater').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const cid = e.target.dataset.cid;
      const newStatus = e.target.value;
      updateCandidateVerificationStatus(cid, newStatus);
    });
  });
}

function updateCandidateVerificationStatus(candidateId, newStatus) {
  const allowed = ['Pending Review', 'Reviewed', 'False Positive'];
  if (!allowed.includes(newStatus)) return;

  const records = loadCandidateRecords();
  const target = records.find(r => r.candidateId === candidateId);
  if (target) {
    target.verificationStatus = newStatus;
    saveCandidateRecords(records);
    renderCandidateReviewQueue();
  }
}

function clearAllDemoCandidateData() {
  localStorage.removeItem(RC_STORAGE_KEY);
  localStorage.removeItem(RC_SEQ_KEY);
  renderCandidateReviewQueue();
  setAlert('success', 'Cleared all local demo candidate records from browser localStorage.', false);
}

/**
 * Section D: Optional Validated Coordinate Range Calculator
 * Only calculates distance/ETA when valid candidate AND rescue-team coordinates are explicitly supplied.
 */
function calculateValidatedRange() {
  const cLat = parseFloat(calcCandLat.value);
  const cLon = parseFloat(calcCandLon.value);
  const tLat = parseFloat(calcTeamLat.value);
  const tLon = parseFloat(calcTeamLon.value);

  const isValidLat = (n) => !Number.isNaN(n) && n >= -90 && n <= 90;
  const isValidLon = (n) => !Number.isNaN(n) && n >= -180 && n <= 180;

  if (!isValidLat(cLat) || !isValidLon(cLon) || !isValidLat(tLat) || !isValidLon(tLon)) {
    calcRangeResult.style.color = 'var(--rc-accent-amber)';
    calcRangeResult.textContent = 'Candidate GPS: unavailable • Distance: unavailable • ETA: unavailable (Supply valid Lat/Lon for both points)';
    return;
  }

  // Haversine distance in km
  const R = 6371;
  const dLat = ((tLat - cLat) * Math.PI) / 180;
  const dLon = ((tLon - cLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((cLat * Math.PI) / 180) * Math.cos((tLat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distKm = R * c;

  // Assume alpine ground team traverse speed ~ 4.0 km/h
  const etaMinutes = Math.max(1, Math.round((distKm / 4.0) * 60));

  calcRangeResult.style.color = 'var(--rc-accent-emerald)';
  calcRangeResult.textContent = `Supplied Coords Distance: ${distKm.toFixed(2)} km (${Math.round(distKm * 1000)} m) • Ground ETA (@ 4 km/h): ~${etaMinutes} min`;
}

function resetValidatedRange() {
  calcCandLat.value = '';
  calcCandLon.value = '';
  calcTeamLat.value = '';
  calcTeamLon.value = '';
  calcRangeResult.style.color = 'var(--rc-text-secondary)';
  calcRangeResult.textContent = 'Candidate GPS: unavailable • Distance: unavailable • ETA: unavailable';
}

/**
 * Wire All Event Listeners on DOMContentLoaded
 */
window.addEventListener('DOMContentLoaded', () => {
  initSimulatedDroneFleet();
  renderCandidateReviewQueue();
  checkApiHealth();

  rcDroneSelect.addEventListener('change', (e) => {
    selectSimulatedDrone(e.target.value);
  });

  btnCheckHealthMain.addEventListener('click', checkApiHealth);
  btnHeaderCheckHealth.addEventListener('click', checkApiHealth);
  if (btnRcAlertRetry) {
    btnRcAlertRetry.addEventListener('click', () => {
      if (typeof pendingRcRetryCallback === 'function') {
        pendingRcRetryCallback();
      }
    });
  }
  rcApiBaseUrl.addEventListener('input', getBaseUrl);

  rcUploadDropzone.addEventListener('click', () => rcImageInput.click());
  rcImageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFileSelected(e.target.files[0]);
    }
  });

  rcUploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    rcUploadDropzone.classList.add('dragover');
  });
  rcUploadDropzone.addEventListener('dragleave', () => {
    rcUploadDropzone.classList.remove('dragover');
  });
  rcUploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    rcUploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFileSelected(e.dataTransfer.files[0]);
    }
  });

  btnRunDetection.addEventListener('click', runThermalDetection);
  btnClearUpload.addEventListener('click', clearImageUpload);

  rcQueueFilterSelect.addEventListener('change', (e) => {
    queueStatusFilter = e.target.value;
    renderCandidateReviewQueue();
  });

  btnClearDemoData.addEventListener('click', clearAllDemoCandidateData);

  btnCalcValidatedRange.addEventListener('click', calculateValidatedRange);
  btnResetValidatedRange.addEventListener('click', resetValidatedRange);

  window.addEventListener('resize', syncOverlayCanvasDimensions);
  if (typeof ResizeObserver !== 'undefined' && rcImagePreview) {
    const rcPreviewObserver = new ResizeObserver(() => {
      syncOverlayCanvasDimensions();
    });
    rcPreviewObserver.observe(rcImagePreview);
  }
});
