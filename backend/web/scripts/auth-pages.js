(() => {
  'use strict';

  const ACCESS_KEY = 'access_token';
  const REFRESH_KEY = 'refresh_token';
  const THEME_KEY = 'theme';

  const redirectTarget = resolveNextRoute();

  function resolveNextRoute() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
      return { url: raw, isCustom: raw !== '/cabinet' };
    }
    return { url: '/cabinet', isCustom: false };
  }

  function setTokens(access, refresh) {
    try {
      if (access) localStorage.setItem(ACCESS_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      // localStorage might be disabled
    }
  }

  function setThemePreference(isDark) {
    document.body.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore storage issues
    }
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  }

  function loadStoredTheme() {
    let isDark = false;
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') {
        isDark = stored === 'dark';
      } else if (window.matchMedia) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {
      // ignore
    }
    setThemePreference(isDark);
  }

  function toggleTheme() {
    const nextIsDark = !document.body.classList.contains('dark');
    setThemePreference(nextIsDark);
  }

  async function postJson(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      return response.json();
    }
    throw new Error(await extractError(response));
  }

  async function extractError(response) {
    try {
      const data = await response.clone().json();
      if (data?.detail) return data.detail;
      if (data?.message) return data.message;
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        return data.errors[0]?.message || 'Проверьте введённые данные';
      }
    } catch {
      // fall back to text
    }
    try {
      const text = await response.text();
      if (text) return text;
    } catch {
      // ignore
    }
    return response.status === 0
      ? 'Не удалось связаться с сервером. Проверьте соединение.'
      : `Ошибка ${response.status}`;
  }

  function showFeedback(form, message, type = 'error') {
    const target = form.querySelector('[data-feedback]');
    if (!target) return;
    target.textContent = message;
    target.classList.remove('error', 'success', 'is-visible');
    target.classList.add(type);
    target.classList.add('is-visible');
    target.hidden = false;
    target.setAttribute('role', type === 'success' ? 'status' : 'alert');
  }

  function clearFeedback(form) {
    const target = form.querySelector('[data-feedback]');
    if (!target) return;
    target.textContent = '';
    target.classList.remove('error', 'success', 'is-visible');
    target.hidden = true;
    target.removeAttribute('role');
  }

  function setFormLoading(form, isLoading, loadingText) {
    const submit = form.querySelector('[type="submit"]');
    const fields = form.querySelectorAll('input, button, textarea, select');
    fields.forEach((field) => {
      if (isLoading) {
        field.dataset._previouslyDisabled = field.disabled ? 'true' : 'false';
        field.disabled = true;
      } else if (field.dataset._previouslyDisabled !== 'true') {
        field.disabled = false;
      }
      if (!isLoading) delete field.dataset._previouslyDisabled;
    });
    if (submit) {
      if (!submit.dataset.originalContent) {
        submit.dataset.originalContent = submit.innerHTML;
      }
      submit.dataset.loading = isLoading ? 'true' : 'false';
      if (isLoading) {
        const text = loadingText || submit.getAttribute('data-loading-text') || submit.textContent;
        submit.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${text}</span>`;
      } else {
        submit.innerHTML = submit.dataset.originalContent;
      }
    }
  }

  async function handleLoginSubmit(form) {
    clearFeedback(form);
    const login = form.querySelector('input[name="login"]')?.value.trim();
    const password = form.querySelector('input[name="password"]')?.value || '';

    if (!login || !password) {
      showFeedback(form, 'Введите логин или email и пароль');
      return;
    }

    setFormLoading(form, true, 'Входим…');
    try {
      const token = await postJson('/api/auth/login', { login, password });
      setTokens(token.access_token, token.refresh_token);
      showFeedback(form, 'Готово! Перенаправляем…', 'success');
      redirectAfterSuccess();
    } catch (error) {
      showFeedback(form, error.message || 'Не удалось войти');
    } finally {
      setFormLoading(form, false);
    }
  }

  function validatePassword(password) {
    if (password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов';
    }
    // Проверка на кириллицу: если есть символы вне ASCII (латиница, цифры, спецсимволы)
    // Кириллица находится в диапазоне \u0400-\u04FF
    if (/[\u0400-\u04FF]/.test(password)) {
      return 'Пароль должен содержать только латиницу, цифры и специальные символы';
    }
    return null;
  }

  function showPasswordError(input, message) {
    // Удаляем предыдущее сообщение об ошибке
    const existingError = input.parentElement.querySelector('.password-error');
    if (existingError) {
      existingError.remove();
    }

    if (message) {
      const errorEl = document.createElement('span');
      errorEl.className = 'password-error';
      errorEl.style.cssText = 'display: block; margin-top: 0.5rem; font-size: 0.875rem; color: #ef4444; animation: fadeIn 0.2s ease;';
      errorEl.textContent = message;
      input.parentElement.appendChild(errorEl);
      input.style.borderColor = '#ef4444';
      input.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.15)';
    } else {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    }
  }

  async function handleRegisterSubmit(form) {
    clearFeedback(form);
    const username = form.querySelector('input[name="username"]')?.value.trim();
    const email = form.querySelector('input[name="email"]')?.value.trim();
    const password = form.querySelector('input[name="password"]')?.value || '';
    const confirm = form.querySelector('input[name="password_confirm"]')?.value || '';

    if (!username || !email || !password || !confirm) {
      showFeedback(form, 'Заполните все обязательные поля');
      return;
    }

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      showFeedback(form, 'Имя пользователя должно быть 3-32 символа: латиница, цифры, _ . -');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      showFeedback(form, passwordError);
      const passwordInput = form.querySelector('input[name="password"]');
      if (passwordInput) {
        showPasswordError(passwordInput, passwordError);
      }
      return;
    }

    if (password !== confirm) {
      showFeedback(form, 'Пароли не совпадают');
      return;
    }

    setFormLoading(form, true, 'Создаём аккаунт…');
    try {
      await postJson('/api/auth/register', { username, email, password });
      // После регистрации входим используя email (можно использовать и username)
      const token = await postJson('/api/auth/login', { login: email, password });
      setTokens(token.access_token, token.refresh_token);
      showFeedback(form, 'Аккаунт создан! Перенаправляем…', 'success');
      redirectAfterSuccess();
    } catch (error) {
      showFeedback(form, error.message || 'Не удалось зарегистрироваться');
    } finally {
      setFormLoading(form, false);
    }
  }

  function redirectAfterSuccess() {
    window.setTimeout(() => {
      window.location.replace(redirectTarget.url);
    }, 600);
  }

  function initForms() {
    const loginForm = document.querySelector('[data-auth-form="login"]');
    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handleLoginSubmit(loginForm);
      });
      loginForm.addEventListener('input', () => clearFeedback(loginForm));
    }

    const registerForm = document.querySelector('[data-auth-form="register"]');
    if (registerForm) {
      registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handleRegisterSubmit(registerForm);
      });
      registerForm.addEventListener('input', () => clearFeedback(registerForm));

      // Валидация пароля в реальном времени
      const passwordInput = registerForm.querySelector('input[name="password"]');
      if (passwordInput) {
        passwordInput.addEventListener('input', (event) => {
          const password = event.target.value;
          const error = validatePassword(password);
          showPasswordError(passwordInput, error);
        });
      }
    }
  }

  function initNextNotes() {
    const noteElements = document.querySelectorAll('[data-next-note]');
    if (!noteElements.length) return;
    noteElements.forEach((el) => {
      if (redirectTarget.isCustom) {
        el.textContent = `После входа мы перенаправим вас на ${redirectTarget.url}.`;
      } else {
        el.textContent = 'После входа вы автоматически перейдёте в личный кабинет.';
      }
    });
  }

  function initThemeToggle() {
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      toggle.addEventListener('click', toggleTheme);
    }
    window.toggleTheme = toggleTheme;
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadStoredTheme();
    initThemeToggle();
    initForms();
    initNextNotes();
    const yearEl = document.querySelector('[data-current-year]');
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  });
})();

