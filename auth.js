/**
 * AEGIS SAR Auth System
 * localStorage-based authentication for rescue personnel
 * Government Rescuer ID serves as the unique Login ID.
 */

const AEGIS_AUTH = {
  STORAGE_KEY: 'aegis_sar_rescuers_v1',
  SESSION_KEY: 'aegis_sar_session_v1',

  getUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveUsers(users) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  },

  getSession() {
    try {
      return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  },

  saveSession(user) {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.SESSION_KEY);
  },

  register(data) {
    const users = this.getUsers();
    const normalizedGovId = data.govId.trim().toUpperCase();
    if (users.find(u => u.govId.toUpperCase() === normalizedGovId)) {
      return {
        success: false,
        error: `Government Rescuer ID "${normalizedGovId}" is already registered. Please sign in.`
      };
    }
    const user = {
      id: 'RSC-' + Date.now(),
      fullName: data.fullName.trim(),
      role: data.role.trim(),
      phone: data.phone.trim(),
      unit: (data.unit || 'NDRF / Alpine SAR Wing').trim(),
      govId: normalizedGovId, // Used as Login ID
      password: data.password,
      registeredAt: new Date().toISOString()
    };
    users.push(user);
    this.saveUsers(users);
    return { success: true, user };
  },

  login(govId, password) {
    const users = this.getUsers();
    const normalizedGovId = govId.trim().toUpperCase();
    const user = users.find(
      u => u.govId.toUpperCase() === normalizedGovId && u.password === password
    );
    if (!user) {
      return {
        success: false,
        error: 'Invalid Government Rescuer ID or password. If not registered, click "Register as a Rescuer" below.'
      };
    }
    this.saveSession(user);
    return { success: true, user };
  },

  isAuthenticated() {
    return this.getSession() !== null;
  }
};

function bootDashboardAfterAuth() {
  const session = AEGIS_AUTH.getSession();
  if (session) {
    const callsignFormatted = `${session.fullName.toUpperCase()} [${session.role.toUpperCase()} // ${session.govId}]`;
    const el = document.getElementById('operatorCallsignText');
    if (el) el.textContent = callsignFormatted;
    if (typeof currentOperator !== 'undefined') {
      currentOperator.callsign = callsignFormatted;
      currentOperator.role = session.role;
      currentOperator.govId = session.govId;
      currentOperator.phone = session.phone;
    }
  }

  if (typeof sim === 'undefined' || !sim) {
    if (typeof initSimulation === 'function') {
      initSimulation('avalanche', 'aegis');
    }
  }
  if (typeof initLeafletMap === 'function' && !window._leafletInited) {
    window._leafletInited = true;
    initLeafletMap();
  }
  setTimeout(() => {
    if (typeof resizeCanvases === 'function') resizeCanvases();
    if (typeof leafletMap !== 'undefined' && leafletMap) leafletMap.invalidateSize();
    if (typeof updateUI === 'function') updateUI();
  }, 60);

  if (typeof startSimulationLoop === 'function' && !window._simLoopStarted) {
    window._simLoopStarted = true;
    startSimulationLoop();
  }
}

function initAuthSystem() {
  if (AEGIS_AUTH.isAuthenticated()) {
    showDashboard();
    bootDashboardAfterAuth();
    return;
  }
  // Open Login page by default; if no users exist yet, show helpful hint
  showLoginPage();
}

function showLoginPage(registeredGovId) {
  const overlay = document.getElementById('authOverlay');
  const loginPage = document.getElementById('loginPage');
  const registerPage = document.getElementById('registerPage');
  const dashboardRoot = document.getElementById('dashboardRoot');

  if (overlay) overlay.style.display = 'flex';
  if (loginPage) loginPage.style.display = 'flex';
  if (registerPage) registerPage.style.display = 'none';
  if (dashboardRoot) dashboardRoot.style.display = 'none';

  const errEl = document.getElementById('loginError');
  const okEl = document.getElementById('loginSuccessBanner');
  if (errEl) errEl.style.display = 'none';

  if (registeredGovId) {
    const loginInput = document.getElementById('loginGovId');
    if (loginInput) loginInput.value = registeredGovId;
    if (okEl) {
      okEl.innerHTML = `✅ Registration complete! Your Login ID is <strong>${registeredGovId}</strong>. Enter your password to sign in.`;
      okEl.style.display = 'block';
    }
  } else if (okEl) {
    okEl.style.display = 'none';
  }
}

function showRegisterPage() {
  const overlay = document.getElementById('authOverlay');
  const loginPage = document.getElementById('loginPage');
  const registerPage = document.getElementById('registerPage');
  const dashboardRoot = document.getElementById('dashboardRoot');

  if (overlay) overlay.style.display = 'flex';
  if (loginPage) loginPage.style.display = 'none';
  if (registerPage) registerPage.style.display = 'flex';
  if (dashboardRoot) dashboardRoot.style.display = 'none';

  const errEl = document.getElementById('registerError');
  if (errEl) errEl.style.display = 'none';
}

function showDashboard() {
  const overlay = document.getElementById('authOverlay');
  const dashboardRoot = document.getElementById('dashboardRoot');
  if (overlay) overlay.style.display = 'none';
  if (dashboardRoot) dashboardRoot.style.display = 'flex';
}

function handleLogin(e) {
  e.preventDefault();
  const govId = document.getElementById('loginGovId').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  if (!govId || !password) {
    errEl.textContent = 'Please enter both your Government Rescuer ID and Password.';
    errEl.style.display = 'block';
    return;
  }

  const result = AEGIS_AUTH.login(govId, password);
  if (result.success) {
    errEl.style.display = 'none';
    showDashboard();
    bootDashboardAfterAuth();
    if (typeof showTacticalNotification === 'function') {
      showTacticalNotification(`AUTHENTICATED: Welcome ${result.user.fullName} (${result.user.govId})`, 'info');
    }
  } else {
    errEl.textContent = result.error;
    errEl.style.display = 'block';
  }
}

function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('regFullName').value.trim();
  const role = document.getElementById('regRole').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const govId = document.getElementById('regGovId').value.trim().toUpperCase();
  const unit = document.getElementById('regUnit')?.value.trim() || 'NDRF / SAR Command';
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const errEl = document.getElementById('registerError');

  if (!fullName || !role || !phone || !govId || !password || !confirmPassword) {
    errEl.textContent = 'All rescuer registration fields are required.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters long.';
    errEl.style.display = 'block';
    return;
  }
  if (password !== confirmPassword) {
    errEl.textContent = 'Passwords do not match. Please verify.';
    errEl.style.display = 'block';
    return;
  }

  const result = AEGIS_AUTH.register({ fullName, role, phone, govId, unit, password });
  if (result.success) {
    errEl.style.display = 'none';
    // Take rescuer to login page with their Government Rescuer ID pre-filled as Login ID
    showLoginPage(result.user.govId);
  } else {
    errEl.textContent = result.error;
    errEl.style.display = 'block';
  }
}

function handleLogout() {
  AEGIS_AUTH.clearSession();
  const modal = document.getElementById('operatorModal');
  if (modal) modal.classList.remove('open');
  showLoginPage();
}

window.addEventListener('DOMContentLoaded', () => {
  initAuthSystem();

  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = document.getElementById('registerForm');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);

  const goToRegister = document.getElementById('goToRegister');
  if (goToRegister) {
    goToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterPage();
    });
  }

  const goToLogin = document.getElementById('goToLogin');
  if (goToLogin) {
    goToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginPage();
    });
  }

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  // Sync live Login ID preview on registration form
  const regGovIdInput = document.getElementById('regGovId');
  const loginIdPreview = document.getElementById('regLoginIdPreview');
  if (regGovIdInput && loginIdPreview) {
    regGovIdInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toUpperCase();
      loginIdPreview.textContent = val || 'ENTER GOV RESCUER ID ABOVE';
    });
  }
});
