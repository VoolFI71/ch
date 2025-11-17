// Backend-driven authentication for all pages that include this file

(function () {
  const ACCESS_KEY = 'access_token';
  const REFRESH_KEY = 'refresh_token';

  function getAccessToken() {
    return localStorage.getItem(ACCESS_KEY) || '';
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY) || '';
  }

  function setTokens(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }

  function clearTokens() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(path, { ...options, headers });
    if (res.status !== 401) return res;

    // Try refresh once
    const refreshed = await tryRefresh();
    if (!refreshed) return res;

    const headers2 = new Headers(options.headers || {});
    if (!headers2.has('Content-Type') && options.body) headers2.set('Content-Type', 'application/json');
    const token2 = getAccessToken();
    if (token2) headers2.set('Authorization', `Bearer ${token2}`);
    return fetch(path, { ...options, headers: headers2 });
  }

  async function tryRefresh() {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const msg = await safeError(res);
      throw new Error(msg || 'Login failed');
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async function register(username, email, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const msg = await safeError(res);
      throw new Error(msg || 'Registration failed');
    }
    return res.json();
  }

  async function me() {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return null;
    return res.json();
  }

  async function safeError(res) {
    try {
      const d = await res.json();
      return d && (d.detail || d.message) ? (d.detail || d.message) : res.statusText;
    } catch {
      return res.statusText;
    }
  }

  function ensureLogoutButton(container) {
    if (!container) return null;
    let btn = container.querySelector('.logout-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<i class="fas fa-sign-out-alt" style="margin-right: 0.5rem;"></i> Выйти';
      btn.style.display = 'none';
      if (container.classList.contains('mobile-user-actions')) {
        btn.classList.add('btn', 'btn-outline', 'logout-btn');
        btn.style.width = '100%';
        btn.style.justifyContent = 'center';
        btn.style.marginTop = '0.5rem';
      } else {
        btn.classList.add('btn', 'btn-outline', 'logout-btn');
        btn.style.marginLeft = '0.5rem';
      }
      container.appendChild(btn);
    }
    return btn;
  }

  let lastAuthState = false;
  let cachedUser = null;

  function updateAuthUI(user) {
    const isLoggedIn = !!user;
    cachedUser = user || null;
    lastAuthState = isLoggedIn;
    const isDesktop = window.innerWidth >= 1024;

    const authButtons = document.getElementById('authButtons');
    if (authButtons) {
      if (isDesktop) authButtons.style.display = isLoggedIn ? 'none' : 'flex';
      else authButtons.style.display = 'none';
    }

    const userActions = document.getElementById('userActions');
    if (userActions) {
      if (isLoggedIn && isDesktop) ensureLogoutButton(userActions);
      userActions.style.display = isLoggedIn && isDesktop ? 'flex' : 'none';
    }

    const mobileUserActions = document.getElementById('mobileUserActions');
    if (mobileUserActions) {
      if (isLoggedIn) ensureLogoutButton(mobileUserActions);
      mobileUserActions.style.display = isLoggedIn ? 'block' : 'none';
    }

    const pillText = user ? user.username || `ID ${user.id}` : '';
    document.querySelectorAll('.user-pill').forEach((pill) => {
      const label = pill.querySelector('span');
      if (isLoggedIn) {
        pill.style.display = 'inline-flex';
        if (label) label.textContent = pillText;
      } else {
        pill.style.display = 'none';
      }
    });

    const mobileAuthButtons = document.getElementById('mobileAuthButtons');
    if (mobileAuthButtons) {
      mobileAuthButtons.style.display = !isDesktop && !isLoggedIn ? 'flex' : 'none';
    }

    document.querySelectorAll('.logout-btn').forEach((el) => {
      el.style.display = isLoggedIn ? '' : 'none';
    });

    bindLogoutButtons();
  }

  async function initAuth() {
    let user = null;
    if (getAccessToken() || getRefreshToken()) {
      user = await me();
    }
    lastAuthState = !!user;
    updateAuthUI(user);
  }

  // Expose fetch and helpers globally for page scripts
  window.apiFetch = apiFetch;
  window.authMe = me;

  // Global theme initializer used by multiple pages
  window.loadTheme = function loadTheme() {
    try {
      const saved = localStorage.getItem('theme');
      const isDark = saved === 'dark';
      document.body.classList.toggle('dark', isDark);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    } catch {
      // no-op
    }
  };

  // Global theme toggle for all pages
  window.toggleTheme = function toggleTheme() {
    try {
      const isDark = document.body.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    } catch {
      // no-op
    }
  };

  // Override handlers expected in pages
  window.handleLogin = async function (event) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      const form = event?.target || document.querySelector('#loginModal form') || document.querySelector('form[action="#login"]');
      const inputs = form ? form.querySelectorAll('input') : [];
      const email = inputs[0]?.value?.trim() || '';
      const password = inputs[1]?.value || '';
      await login(email, password);
      const user = await me();
      updateAuthUI(user);
      // Close modals if present
      if (typeof window.closeLoginModal === 'function') window.closeLoginModal();
      if (typeof window.closeModal === 'function') window.closeModal('loginModal');
    } catch (e) {
      alert(e.message || 'Не удалось войти');
    }
  };

  window.handleRegister = async function (event) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      const form = event?.target || document.querySelector('#registerModal form') || document.querySelector('form[action="#register"]');
      const formData = form ? new FormData(form) : null;
      const username = (formData?.get('username') || '').toString().trim();
      const email = (formData?.get('email') || '').toString().trim();
      const password = (formData?.get('password') || '').toString();
      if (!username) throw new Error('Укажите имя пользователя');
      if (!email) throw new Error('Укажите email');
      if (!password) throw new Error('Укажите пароль');
      await register(username, email, password);
      await login(email, password);
      const user = await me();
      updateAuthUI(user);
      if (typeof window.closeRegisterModal === 'function') window.closeRegisterModal();
      if (typeof window.closeModal === 'function') window.closeModal('registerModal');
    } catch (e) {
      alert(e.message || 'Не удалось зарегистрироваться');
    }
  };

  window.handleLogout = async function () {
    clearTokens();
    cachedUser = null;
    updateAuthUI(null);
    window.location.reload();
  };

  // Wire logout buttons
  function bindLogoutButtons() {
    document.querySelectorAll('.logout-btn').forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleLogout();
      });
      btn.dataset.bound = 'true';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    bindLogoutButtons();
  });

  window.addEventListener('resize', () => {
    updateAuthUI(cachedUser);
  });
})();


