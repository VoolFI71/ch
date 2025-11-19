(() => {
  const isLocalHost = (hostname) => hostname === '127.0.0.1' || hostname === 'localhost';

  const computeApiBase = () => {
    const { protocol, hostname, port } = window.location;
    if (isLocalHost(hostname)) {
      return `${protocol}//${hostname}:8080`;
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  };

  const API_BASE = computeApiBase();

  const buildUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return path;
    return `${API_BASE}/${path.replace(/^\/+/, '')}`;
  };

  const getAccessToken = () => {
    try {
      return localStorage.getItem('access_token') || '';
    } catch {
      return '';
    }
  };

  const getRefreshToken = () => {
    try {
      return localStorage.getItem('refresh_token') || '';
    } catch {
      return '';
    }
  };

  const setTokens = (access, refresh) => {
    try {
      if (access) localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
    } catch {
      // ignore storage errors
    }
  };

  const clearTokens = () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {
      // ignore storage errors
    }
  };

  async function refreshAccessToken() {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const refreshRes = await fetch(buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!refreshRes.ok) return false;
      const data = await refreshRes.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async function authedFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response = await fetch(buildUrl(path), { ...options, headers });
    if (response.status !== 401 && response.status !== 403) return response;

    const refreshed = await refreshAccessToken();
    if (!refreshed) return response;

    const retryHeaders = new Headers(options.headers || {});
    const newToken = getAccessToken();
    if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
    if (options.body && !retryHeaders.has('Content-Type')) retryHeaders.set('Content-Type', 'application/json');
    response = await fetch(buildUrl(path), { ...options, headers: retryHeaders });
    return response;
  }

  window.MatchApi = {
    buildUrl,
    authedFetch,
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens,
    refreshAccessToken,
  };
})();

