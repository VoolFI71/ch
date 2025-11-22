(() => {
  const state = {
    games: [],
    waitingGames: [],
    liveGames: [],
    finishedGames: [],
    selectedGameId: null,
    selectedGame: null,
    moves: [],
    ws: null,
    wsStatusEl: null,
    lastStateTimestamp: null,
    clockTimer: null,
    currentUser: null,
    pendingGameId: new URLSearchParams(window.location.search).get('game'),
    activeTab: 'quick',
  };
  const playerUsernames = new Map();
  const pendingUsernameRequests = new Map();
  let isDarkTheme = false;

  // --- Base URL helper: force :8080 for local host like other pages ------
  const API_BASE = (() => {
    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === '127.0.0.1' || hostname === 'localhost';
    if (isLocalHost) {
      // Явно используем порт 8080 для всех запросов в dev
      return `${protocol}//${hostname}:8080`;
    }
    // В проде используем текущий origin (относительные пути)
    return '';
  })();

  const buildUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return API_BASE + path;
  };

  // -------------------- Auth helpers --------------------
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
    } catch {}
  };
  const clearTokens = () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {}
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    const token = getAccessToken();
    return !!token && token.trim().length > 0;
  };

  // Check authentication and redirect if needed
  const requireAuth = (redirectTo = '/login.html') => {
    if (!isAuthenticated()) {
      if (typeof window.showToast === 'function') {
        window.showToast('Войдите в аккаунт, чтобы создать партию', 'error');
      } else {
        alert('Войдите в аккаунт, чтобы создать партию');
      }
      window.location.href = redirectTo;
      return false;
    }
    return true;
  };

  // Unified function to create a game
  const createGame = async (options = {}) => {
    const {
      minutes = 5,
      increment = 0,
      isRated = false,
      creatorColor = 'white',
      initialFen = 'startpos',
      onSuccess = null,
      onError = null,
    } = options;

    if (!requireAuth()) {
      return null;
    }

    const payload = {
      initial_fen: initialFen === 'startpos' ? 'startpos' : initialFen,
      creator_color: creatorColor,
      time_control: {
        initial_ms: Math.max(1, minutes) * 60000,
        increment_ms: Math.max(0, increment) * 1000,
        type: 'STANDARD',
      },
      metadata: {
        variant: 'standard',
        rated: isRated,
      },
    };

    try {
      const res = await authedFetch('/api/games/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorText = 'Не удалось создать партию';
        try {
          const errorData = await res.json();
          errorText = errorData.detail || errorData.message || errorText;
        } catch {
          const text = await res.text();
          errorText = text || errorText;
        }
        throw new Error(errorText);
      }

      const game = await res.json();
      
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(game);
      }
      
      return game;
    } catch (err) {
      console.error(err);
      const errorMessage = err.message || 'Не удалось создать партию';
      
      if (onError && typeof onError === 'function') {
        onError(err, errorMessage);
      } else if (typeof window.showToast === 'function') {
        window.showToast(errorMessage, 'error');
      }
      
      return null;
    }
  };

  async function authedFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response = await fetch(buildUrl(path), { ...options, headers });
    if (response.status !== 401 && response.status !== 403) return response;

    const rt = getRefreshToken();
    if (!rt) return response;
    try {
      const refreshRes = await fetch(buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!refreshRes.ok) return response;
      const data = await refreshRes.json();
      setTokens(data.access_token, data.refresh_token);
      const retryHeaders = new Headers(options.headers || {});
      const newToken = getAccessToken();
      if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
      if (options.body && !retryHeaders.has('Content-Type')) retryHeaders.set('Content-Type', 'application/json');
      response = await fetch(buildUrl(path), { ...options, headers: retryHeaders });
    } catch {
      return response;
    }
    return response;
  }

  // -------------------- UI helpers ----------------------
  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (toast) {
      toast.textContent = message;
      toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
      setTimeout(() => {
        toast.className = 'toast';
      }, 4000);
    } else {
      // Fallback: use console or alert
      console.log(`[${type.toUpperCase()}] ${message}`);
      if (type === 'error') {
        alert(message);
      }
    }
  }

  const formatClock = (ms) => {
    if (ms === null || ms === undefined) return '—';
    const clamped = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(clamped / 60).toString().padStart(2, '0');
    const seconds = (clamped % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const translateStatus = (status) => ({
    CREATED: 'Ожидает соперника',
    ACTIVE: 'Идёт партия',
    PAUSED: 'Пауза',
    FINISHED: 'Завершена',
  }[status] || status || '—');

  const statusClass = (status) => ({
    CREATED: 'status-created',
    ACTIVE: 'status-active',
    PAUSED: 'status-paused',
    FINISHED: 'status-finished',
  }[status] || '');

  const normalizeUserId = (value) => {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  };

  const usernameFromCache = (id) => {
    const key = normalizeUserId(id);
    if (key === null) return null;
    return playerUsernames.has(key) ? playerUsernames.get(key) : null;
  };

  const storeUsername = (id, username) => {
    const key = normalizeUserId(id);
    if (key === null) return;
    if (typeof username === 'string') {
      const trimmed = username.trim();
      playerUsernames.set(key, trimmed.length ? trimmed : null);
    } else {
      playerUsernames.set(key, null);
    }
  };

  async function fetchUsername(id) {
    const key = normalizeUserId(id);
    if (key === null) return null;
    if (playerUsernames.has(key)) return playerUsernames.get(key);
    if (pendingUsernameRequests.has(key)) return pendingUsernameRequests.get(key);

    const request = (async () => {
      try {
        const res = await fetch(buildUrl(`/api/users/${encodeURIComponent(key)}`));
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        const username =
          (data && (data.username || data.display_name || data.name || data.handle || data.login)) ||
          null;
        storeUsername(key, username);
        return usernameFromCache(key);
      } catch {
        storeUsername(key, null);
        return null;
      } finally {
        pendingUsernameRequests.delete(key);
      }
    })();

    pendingUsernameRequests.set(key, request);
    return request;
  }

  async function ensureUsernamesForGames(games) {
    if (!Array.isArray(games)) return;
    const fetchIds = [];
    games.forEach((game) => {
      if (!game) return;
      [game.white_id, game.black_id].forEach((id) => {
        const key = normalizeUserId(id);
        if (key === null) return;
        if (!playerUsernames.has(key) && !pendingUsernameRequests.has(key)) {
          fetchIds.push(key);
        }
      });
    });
    if (!fetchIds.length) return;
    await Promise.all(fetchIds.map((id) => fetchUsername(id)));
  }

  const labelPlayer = (id) => {
    if (!id) return '—';
    if (state.currentUser && state.currentUser.id === id) {
      return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
    }
    const cached = usernameFromCache(id);
    if (cached) return cached;
    return `ID ${id}`;
  };

  const getAvailableSeat = (game) => {
    if (!game) return null;
    if (game.white_id == null) return 'white';
    if (game.black_id == null) return 'black';
    return null;
  };

  // -------------------- Data loading --------------------
  async function fetchCurrentUser() {
    try {
      const res = await authedFetch('/api/auth/me');
      state.currentUser = res && res.ok ? await res.json() : null;
    } catch {
      state.currentUser = null;
    }
    updateAuthPanel();
    toggleCreateForm();
  }

  async function loadGames(showSpinner = false) {
    if (showSpinner) {
      const waiting = document.getElementById('waitingList');
      const live = document.getElementById('liveList');
      if (waiting) waiting.innerHTML = '<div class="empty-state">Загружаем партии...</div>';
      if (live) live.innerHTML = '<div class="empty-state">Загружаем матчи...</div>';
    }
    try {
      const url = buildUrl('/api/games/');
      console.debug('Loading games from URL:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      state.games = await res.json();
      await ensureUsernamesForGames(state.games);
      segmentGames();
      renderCollections();
      updateHeroStats();
      if (state.pendingGameId) {
        selectGame(state.pendingGameId);
        state.pendingGameId = null;
      }
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить список партий', 'error');
    }
  }

  const segmentGames = () => {
    state.waitingGames = state.games.filter((g) => g.status === 'CREATED');
    state.liveGames = state.games.filter((g) => g.status === 'ACTIVE');
    state.finishedGames = state.games.filter((g) => g.status === 'FINISHED');
  };

  // -------------------- Rendering lists ----------------
  function renderCollections() {
    renderGameCollection('waitingList', state.waitingGames, 'waiting');
    renderGameCollection('liveList', state.liveGames, 'live');
    highlightSelectedCard();
  }

  function renderGameCollection(containerId, games, view) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!games.length) {
      container.innerHTML = `<div class="empty-state">${
        view === 'waiting' ? 'Ни одной партии в ожидании. Создайте свою!' : 'Пока нет активных матчей.'
      }</div>`;
      return;
    }

    container.innerHTML = '';
    games.forEach((game) => {
      const card = document.createElement('div');
      card.className = `game-card${state.selectedGameId === game.id ? ' selected' : ''}`;
      card.dataset.gameId = game.id;
      card.innerHTML = `
        <div class="card-top">
          <span class="pill ${statusClass(game.status)}">${translateStatus(game.status)}</span>
          <span style="font-size:0.85rem;color:rgba(248,250,252,0.7);">${describeTimeControl(game.time_control)}</span>
        </div>
        <div class="players">${labelPlayer(game.white_id)} <span style="opacity:.6;">vs</span> ${labelPlayer(game.black_id)}</div>
        <div class="meta-row">
          <span>Ходы: ${game.move_count}</span>
          <span>ID ${game.id.slice(0, 8)}</span>
        </div>
        <div class="actions"></div>
      `;
      const actions = card.querySelector('.actions');

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-outline';
      openBtn.textContent = 'Открыть';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `/match/${game.id}`;
      });
      actions.appendChild(openBtn);

      const openSeat = getAvailableSeat(game);
      if (view === 'waiting' && canJoinGame(game) && openSeat) {
        const joinBtn = document.createElement('button');
        joinBtn.className = 'btn-primary';
        joinBtn.textContent = openSeat === 'white' ? 'Играть за белых' : 'Играть за чёрных';
        joinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectGame(game.id).then(() => joinGame());
        });
        actions.appendChild(joinBtn);
      }

      card.addEventListener('click', () => selectGame(game.id));
      container.appendChild(card);
    });
  }

  function canJoinGame(game) {
    if (!state.currentUser) return false;
    if (game.status !== 'CREATED') return false;
    if (state.currentUser.id === game.white_id || state.currentUser.id === game.black_id) return false;
    return getAvailableSeat(game) !== null;
  }

  const highlightSelectedCard = () => {
    document.querySelectorAll('.game-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.gameId === state.selectedGameId);
    });
  };

  // -------------------- Detail panel ------------------
  async function selectGame(gameId) {
    if (!gameId) return;
    if (state.selectedGameId === gameId && state.selectedGame) {
      highlightSelectedCard();
      return;
    }
    state.selectedGameId = gameId;
    highlightSelectedCard();
    window.history.replaceState({}, '', `?game=${encodeURIComponent(gameId)}`);
    await loadGameDetail(gameId);
  }

  async function loadGameDetail(gameId) {
    const panel = document.getElementById('gameDetailPanel');
    const placeholder = document.getElementById('gameDetailEmpty');
    if (placeholder) placeholder.textContent = 'Загружаем данные партии...';
    if (panel) panel.classList.add('hidden');

    try {
      const res = await fetch(buildUrl(`/api/games/${gameId}?moves_limit=200`));
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.moves = detail.moves || [];
      state.lastStateTimestamp = Date.now();
      await ensureUsernamesForGames([detail]);
      renderGameDetail();
      connectWebSocket(gameId);
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить детали партии', 'error');
      if (placeholder) placeholder.textContent = 'Произошла ошибка при загрузке данных.';
    }
  }

  function renderGameDetail() {
    const panel = document.getElementById('gameDetailPanel');
    const placeholder = document.getElementById('gameDetailEmpty');
    if (!state.selectedGame) {
      if (panel) panel.classList.add('hidden');
      if (placeholder) placeholder.classList.remove('hidden');
      return;
    }

    if (panel) panel.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');

    document.getElementById('detailTitle').textContent = `Партия #${state.selectedGame.move_count}`;
    document.getElementById('gameIdField').value = state.selectedGame.id;
    const badge = document.getElementById('gameStatusBadge');
    if (badge) {
      badge.textContent = translateStatus(state.selectedGame.status);
      badge.className = `pill ${statusClass(state.selectedGame.status)}`;
    }
    document.getElementById('gameTimeControl').textContent = describeTimeControl(state.selectedGame.time_control);
    document.getElementById('gameResult').textContent = state.selectedGame.result || '—';
    document.getElementById('whitePlayerLabel').textContent = labelPlayer(state.selectedGame.white_id);
    document.getElementById('blackPlayerLabel').textContent = labelPlayer(state.selectedGame.black_id);

    renderMoves();
    renderActions();
    updateClockDisplays(true);
  }

  const describeTimeControl = (tc) => {
    if (!tc) return 'Без контроля';
    const minutes = Math.round((tc.initial_ms || 0) / 60000);
    const inc = Math.round((tc.increment_ms || 0) / 1000);
    return `${minutes} мин + ${inc} сек`;
  };

  function renderMoves() {
    const list = document.getElementById('movesList');
    if (!list) return;
    if (!state.moves.length) {
      list.innerHTML = '<li style="justify-content:center;color:rgba(148,163,184,.7);">Ходов пока нет</li>';
      return;
    }
    list.innerHTML = '';
    state.moves.forEach((move) => {
      const row = document.createElement('li');
      row.innerHTML = `
        <span>#${move.move_index}</span>
        <span>${move.san || move.uci}</span>
        <span style="font-size:0.8rem;color:rgba(148,163,184,.8);">${move.player_id ? `ID ${move.player_id}` : '—'}</span>
      `;
      list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
  }

  function renderActions() {
    const container = document.getElementById('gameActions');
    if (!container || !state.selectedGame) return;
    container.innerHTML = '';

    const openSeat = getAvailableSeat(state.selectedGame);
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn-primary';
    joinBtn.textContent =
      openSeat === 'white'
        ? 'Присоединиться белыми'
        : openSeat === 'black'
          ? 'Присоединиться чёрными'
          : 'Присоединиться';
    joinBtn.addEventListener('click', joinGame);

    const resignBtn = document.createElement('button');
    resignBtn.className = 'btn-danger';
    resignBtn.textContent = 'Сдаться';
    resignBtn.addEventListener('click', resignGame);

    const flagBtn = document.createElement('button');
    flagBtn.className = 'btn-outline';
    flagBtn.textContent = 'Заявить флаг соперника';
    flagBtn.addEventListener('click', declareTimeout);

    const copyLinkBtn = document.createElement('button');
    copyLinkBtn.className = 'btn-outline';
    copyLinkBtn.textContent = 'Скопировать ссылку';
    copyLinkBtn.addEventListener('click', copyShareLink);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-outline';
    refreshBtn.textContent = 'Обновить';
    refreshBtn.addEventListener('click', () => loadGameDetail(state.selectedGame.id));

    if (canJoinCurrentGame()) container.appendChild(joinBtn);

    const role = getCurrentUserRole();
    if (role && state.selectedGame.status === 'ACTIVE') {
      container.appendChild(resignBtn);
      if (canDeclareTimeout(role)) container.appendChild(flagBtn);
    }

    container.appendChild(copyLinkBtn);
    container.appendChild(refreshBtn);
  }

  const canJoinCurrentGame = () => {
    if (!state.currentUser || !state.selectedGame) return false;
    if (state.selectedGame.status !== 'CREATED') return false;
    if (
      state.currentUser.id === state.selectedGame.white_id ||
      state.currentUser.id === state.selectedGame.black_id
    ) {
      return false;
    }
    return getAvailableSeat(state.selectedGame) !== null;
  };

  const getCurrentUserRole = () => {
    if (!state.currentUser || !state.selectedGame) return null;
    if (state.currentUser.id === state.selectedGame.white_id) return 'white';
    if (state.currentUser.id === state.selectedGame.black_id) return 'black';
    return null;
  };

  const canDeclareTimeout = (role) => {
    const clocks = getDisplayedClocks(false);
    if (!clocks) return false;
    if (role === 'white') return clocks.black <= 0;
    if (role === 'black') return clocks.white <= 0;
    return false;
  };

  // -------------------- WebSocket ----------------------
  function connectWebSocket(gameId) {
    if (state.ws) {
      state.ws.onopen = null;
      state.ws.onclose = null;
      state.ws.onmessage = null;
      state.ws.close();
      state.ws = null;
    }
    updateWsIndicator('offline');
    const token = getAccessToken();
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws/games/${gameId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => updateWsIndicator('online');
    ws.onclose = () => updateWsIndicator('offline');
    ws.onerror = () => updateWsIndicator('offline');
    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        await handleWsPayload(payload);
      } catch (err) {
        console.error('WS parse error', err);
      }
    };
  }

  async function handleWsPayload(payload) {
    if (!payload) return;
    if (payload.type === 'move_rejected' || payload.type === 'error') {
      showToast(payload.message || 'Ход отклонён', 'error');
      return;
    }
    if (payload.type === 'state' || payload.type === 'game_finished' || payload.type === 'move_made') {
      state.selectedGame = payload.game;
      state.moves = payload.game.moves || [];
      state.lastStateTimestamp = Date.now();
      await ensureUsernamesForGames([payload.game]);
      renderGameDetail();
      loadGames(false);
    }
  }

  function updateWsIndicator(status) {
    const indicator = document.getElementById('wsStatus');
    if (!indicator) return;
    indicator.textContent = `WS: ${status}`;
    indicator.className = `ws-indicator ${status === 'online' ? 'ws-online' : 'ws-offline'}`;
  }

  // -------------------- Clock logic -------------------
  function getDisplayedClocks(applyRunning = true) {
    if (!state.selectedGame) return null;
    let { white_clock_ms: white, black_clock_ms: black, status, next_turn } = state.selectedGame;
    if (!applyRunning) return { white, black };
    if (status === 'ACTIVE' && typeof state.lastStateTimestamp === 'number') {
      const elapsed = Date.now() - state.lastStateTimestamp;
      if (next_turn === 'w') white = Math.max(0, white - elapsed);
      else if (next_turn === 'b') black = Math.max(0, black - elapsed);
    }
    return { white, black };
  }

  function updateClockDisplays(resetTimer = false) {
    const clocks = getDisplayedClocks(true);
    if (!clocks) return;
    document.getElementById('whiteClock').textContent = formatClock(clocks.white);
    document.getElementById('blackClock').textContent = formatClock(clocks.black);

    if (resetTimer) {
      if (state.clockTimer) clearInterval(state.clockTimer);
      state.clockTimer = setInterval(() => {
        const tick = getDisplayedClocks(true);
        if (!tick) return;
        document.getElementById('whiteClock').textContent = formatClock(tick.white);
        document.getElementById('blackClock').textContent = formatClock(tick.black);
        renderActions();
      }, 1000);
    }
  }

  function computeClocksAfterMove() {
    if (!state.selectedGame) return null;
    const base = getDisplayedClocks(true);
    if (!base) return null;
    const increment = (state.selectedGame.time_control && state.selectedGame.time_control.increment_ms) || 0;
    // next_turn указывает на того, кто должен ходить СЛЕДУЮЩИМ
    // Значит, если next_turn === 'w', то только что ходили чёрные (black)
    // и инкремент нужно добавить чёрным
    if (state.selectedGame.next_turn === 'w') {
      // Только что ходили чёрные - добавляем инкремент чёрным
      return {
        white: Math.max(0, base.white),
        black: Math.max(0, base.black) + increment,
      };
    }
    // Только что ходили белые - добавляем инкремент белым
    return {
      white: Math.max(0, base.white) + increment,
      black: Math.max(0, base.black),
    };
  }

  // -------------------- Actions -----------------------
  async function joinGame() {
    if (!state.selectedGameId) return;
    if (!state.currentUser) {
      showToast('Войдите в аккаунт, чтобы присоединиться', 'error');
      return;
    }
    try {
      const res = await authedFetch(`/api/games/${state.selectedGameId}/join`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.moves = detail.moves || [];
      state.lastStateTimestamp = Date.now();
      await ensureUsernamesForGames([detail]);
      renderGameDetail();
      showToast('Вы присоединились к партии');
    } catch (err) {
      console.error(err);
      showToast('Не удалось присоединиться: ' + (err.message || ''), 'error');
    }
  }

  async function resignGame() {
    if (!state.selectedGameId) return;
    if (!state.currentUser) {
      showToast('Сначала войдите в аккаунт', 'error');
      return;
    }
    if (!confirm('Точно сдаться?')) return;
    try {
      const res = await authedFetch(`/api/games/${state.selectedGameId}/resign`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.lastStateTimestamp = Date.now();
      renderGameDetail();
      showToast('Вы сдались.');
    } catch (err) {
      console.error(err);
      showToast('Не удалось сдаться: ' + (err.message || ''), 'error');
    }
  }

  async function declareTimeout() {
    if (!state.selectedGameId) return;
    const role = getCurrentUserRole();
    if (!role) {
      showToast('Только участники партии могут заявлять тайм-аут', 'error');
      return;
    }
    const loser = role === 'white' ? 'black' : 'white';
    try {
      const res = await authedFetch(`/api/games/${state.selectedGameId}/timeout`, {
        method: 'POST',
        body: JSON.stringify({ loser_color: loser }),
      });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.lastStateTimestamp = Date.now();
      renderGameDetail();
      showToast('Партия завершена по времени');
    } catch (err) {
      console.error(err);
      showToast('Не удалось завершить по времени: ' + (err.message || ''), 'error');
    }
  }

  function copyShareLink() {
    if (!state.selectedGame) return;
    const url = `${window.location.origin}/games?game=${state.selectedGame.id}`;
    navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована')).catch(() => showToast('Не удалось скопировать ссылку', 'error'));
  }

  async function handleMoveSubmit(event) {
    event.preventDefault();
    if (!state.selectedGame || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
      showToast('Вебсокет не подключен', 'error');
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      showToast('Ходы могут делать только участники партии', 'error');
      return;
    }
    if (state.selectedGame.status !== 'ACTIVE') {
      showToast('Партия неактивна', 'error');
      return;
    }
    const uci = (document.getElementById('uciInput').value || '').trim();
    const promotion = (document.getElementById('promotionInput').value || '').trim();
    if (uci.length < 4) {
      showToast('Введите ход в формате UCI', 'error');
      return;
    }
    const clocks = computeClocksAfterMove();
    if (!clocks) {
      showToast('Не удалось вычислить таймеры', 'error');
      return;
    }
    const payload = {
      type: 'make_move',
      uci,
      promotion: promotion || null,
      white_clock_ms: Math.round(clocks.white),
      black_clock_ms: Math.round(clocks.black),
      client_move_id: `web-${Date.now()}`,
    };
    state.ws.send(JSON.stringify(payload));
    document.getElementById('uciInput').value = '';
    document.getElementById('promotionInput').value = '';
  }

  async function handleCreateGame(event) {
    event.preventDefault();
    if (!state.currentUser) {
      showToast('Войдите, чтобы создавать партии', 'error');
      return;
    }
    const variant = document.getElementById('variant').value;
    const fen = variant === 'custom' ? document.getElementById('customFen').value.trim() : null;
    const minutes = Number(document.getElementById('initialMinutes').value || 5);
    const increment = Number(document.getElementById('incrementSeconds').value || 0);
    const rated = document.getElementById('ratedFlag').checked;
    const colorInput = document.querySelector('input[name="creatorColor"]:checked');
    const creatorColor = colorInput ? colorInput.value : 'white';

    const payload = {
      initial_fen: fen || null,
      creator_color: creatorColor,
      time_control: {
        initial_ms: Math.max(1, minutes) * 60000,
        increment_ms: Math.max(0, increment) * 1000,
        type: variant === 'custom' ? 'CUSTOM' : 'STANDARD',
      },
      metadata: {
        variant,
        rated,
      },
    };

    try {
      document.getElementById('createGameBtn').disabled = true;
      const res = await authedFetch('/api/games/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const game = await res.json();
      if (game && game.id) {
        window.location.href = `/match/${game.id}`;
        return;
      }
      showToast('Партия создана');
      await loadGames(false);
      document.getElementById('createGameForm').reset();
    } catch (err) {
      console.error(err);
      showToast('Не удалось создать партию: ' + (err.message || ''), 'error');
    } finally {
      document.getElementById('createGameBtn').disabled = false;
    }
  }

  // -------------------- Auth panel --------------------
  function updateAuthPanel() {
    const info = document.getElementById('gamesUserInfo');
    const infoMobile = document.getElementById('gamesUserInfoMobile');
    const loginBtns = [
      document.getElementById('gamesLoginBtn'),
      document.getElementById('gamesLoginBtnMobile'),
    ];
    const registerBtns = [
      document.getElementById('gamesRegisterBtn'),
      document.getElementById('gamesRegisterBtnMobile'),
    ];
    const logoutBtns = [
      document.getElementById('gamesLogoutBtn'),
      document.getElementById('gamesLogoutBtnMobile'),
    ];
    const userActions = document.getElementById('userActions');
    const authButtons = document.getElementById('authButtons');
    const mobileUser = document.getElementById('mobileUserActions');
    const mobileAuth = document.getElementById('mobileAuthButtons');

    const displayName = state.currentUser
      ? state.currentUser.username || `ID ${state.currentUser.id}`
      : '—';

    // Hide user info pills (name) on games page
    if (info) info.style.display = 'none';
    if (infoMobile) infoMobile.style.display = 'none';

    if (state.currentUser) {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      if (userActions) userActions.style.display = 'flex';
      if (authButtons) authButtons.style.display = 'none';
      if (mobileUser) mobileUser.style.display = 'flex';
      if (mobileAuth) mobileAuth.style.display = 'none';
    } else {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      if (userActions) userActions.style.display = 'none';
      if (authButtons) authButtons.style.display = 'flex';
      if (mobileUser) mobileUser.style.display = 'none';
      if (mobileAuth) mobileAuth.style.display = 'flex';
    }
  }

  function toggleCreateForm() {
    const hint = document.getElementById('createGameHint');
    const submit = document.getElementById('createGameBtn');
    if (!hint || !submit) return;
    if (state.currentUser) {
      hint.style.display = 'none';
      submit.disabled = false;
    } else {
      hint.style.display = 'block';
      submit.disabled = true;
    }
  }

  const handleLoginRedirect = () => {
    closeMobileMenu();
    window.location.href = '/login.html';
  };

  const handleRegisterRedirect = () => {
    closeMobileMenu();
    window.location.href = '/register.html';
  };

  function handleLogout() {
    clearTokens();
    state.currentUser = null;
    updateAuthPanel();
    toggleCreateForm();
    showToast('Вы вышли из аккаунта');
  }

  function updateHeroStats() {
    const waiting = document.getElementById('statWaiting');
    const live = document.getElementById('statLive');
    const finished = document.getElementById('statFinished');
    if (waiting) waiting.textContent = state.waitingGames.length;
    if (live) live.textContent = state.liveGames.length;
    if (finished) finished.textContent = state.finishedGames.length;
  }

  // -------------------- Tabs --------------------------
  function bindTabs() {
    // Bind old UI tabs (.tab-btn)
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    
    // Bind new UI tabs (.tab)
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });
  }

  function setActiveTab(tab) {
    if (!tab) return;
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    
    // Handle new UI tabs (.tab elements)
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach((content) => {
      const targetTab = content.id?.replace('-tab', '');
      content.style.display = targetTab === tab ? 'block' : 'none';
    });
    
    // Load games when switching to lobby or TV tabs
    if (tab === 'lobby') {
      if (typeof window.loadWaitingRoomGames === 'function') {
        window.loadWaitingRoomGames();
      }
    } else if (tab === 'tv') {
      if (typeof window.loadTVGames === 'function') {
        window.loadTVGames();
      }
    }
  }

  // -------------------- Event wiring ------------------
  function bindEvents() {
    document.getElementById('createGameForm')?.addEventListener('submit', handleCreateGame);
    document.getElementById('moveForm')?.addEventListener('submit', handleMoveSubmit);
    document.getElementById('copyGameIdBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('refreshWaitingBtn')?.addEventListener('click', () => loadGames(true));
    document.getElementById('refreshLiveBtn')?.addEventListener('click', () => loadGames(true));
    document.getElementById('gamesLoginBtn')?.addEventListener('click', handleLoginRedirect);
    document.getElementById('gamesLoginBtnMobile')?.addEventListener('click', handleLoginRedirect);
    document.getElementById('gamesLogoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('gamesLogoutBtnMobile')?.addEventListener('click', handleLogout);
    document.getElementById('gamesRegisterBtn')?.addEventListener('click', handleRegisterRedirect);
    document.getElementById('gamesRegisterBtnMobile')?.addEventListener('click', handleRegisterRedirect);
    document.getElementById('openCreateTab')?.addEventListener('click', () => setActiveTab('create'));
    document.getElementById('openLiveTab')?.addEventListener('click', () => setActiveTab('live'));
    
    // Theme toggle button - use ID selector to match games.html
    const themeToggle = document.getElementById('themeToggleBtn');
    if (themeToggle) {
      themeToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Directly call window.toggleTheme from auth.js if available
        if (window.toggleTheme && typeof window.toggleTheme === 'function') {
          window.toggleTheme();
        } else {
          // Fallback to local implementation
          toggleThemeLocal();
        }
      });
    }

    const variantSelect = document.getElementById('variant');
    if (variantSelect) {
      variantSelect.addEventListener('change', () => {
        const customGroup = document.getElementById('customFenGroup');
        if (customGroup) customGroup.style.display = variantSelect.value === 'custom' ? 'block' : 'none';
      });
    }
    bindTabs();
  }

  function loadTheme() {
    // Всегда используем единый ключ 'theme' для загрузки
    const saved = localStorage.getItem('theme');
    isDarkTheme = saved === 'dark';
    document.body.classList.toggle('dark', isDarkTheme);
    document.documentElement.classList.toggle('dark', isDarkTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
  }

  function toggleThemeLocal() {
    // Локальная реализация для случаев, когда auth.js не загружен
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark', isDarkTheme);
    document.documentElement.classList.toggle('dark', isDarkTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
  }

  function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const icon = document.getElementById('menuIcon');
    if (!menu || !icon) return;
    menu.classList.toggle('active');
    icon.className = menu.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
  }

  function closeMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const icon = document.getElementById('menuIcon');
    if (!menu || !icon) return;
    menu.classList.remove('active');
    icon.className = 'fas fa-bars';
  }

  function handleHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;
    if (window.scrollY > 50) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }

  // Экспортируем функции для мобильного меню
  // НЕ перезаписываем window.toggleTheme, чтобы не конфликтовать с auth.js
  window.toggleMobileMenu = toggleMobileMenu;
  window.closeMobileMenu = closeMobileMenu;

  // Load waiting room games
  async function loadWaitingRoomGames() {
    try {
      const res = await authedFetch('/api/games/?status=CREATED&limit=50');
      if (!res.ok) throw new Error('Failed to load games');
      const games = await res.json();
      
      const waitingRoom = document.querySelector('#lobby-tab .waiting-room');
      if (!waitingRoom) return;
      
      if (!games || games.length === 0) {
        waitingRoom.innerHTML = '<div class="empty-state">Нет партий в ожидании. Создайте свою!</div>';
        return;
      }
      
      waitingRoom.innerHTML = '';
      games.forEach(game => {
        const item = document.createElement('div');
        item.className = 'waiting-item';
        
        const timeControl = game.time_control || {};
        const minutes = Math.round((timeControl.initial_ms || 0) / 60000);
        const increment = Math.round((timeControl.increment_ms || 0) / 1000);
        const timeStr = `${minutes}+${increment}`;
        
        const rated = game.metadata?.rated ? 'Рейтинговая' : 'Товарищеская';
        
        // Показываем только партии, где второй игрок не присоединился
        // (либо white_id, либо black_id должен быть null)
        const hasBothPlayers = game.white_id && game.black_id;
        if (hasBothPlayers) {
          // Пропускаем партии, где оба игрока уже присоединились
          return;
        }
        
        const whitePlayer = game.white_id ? `ID ${game.white_id}` : 'Ожидает белых';
        const blackPlayer = game.black_id ? `ID ${game.black_id}` : 'Ожидает чёрных';
        
        item.innerHTML = `
          <div class="waiting-info">
            <div class="waiting-player">${whitePlayer} vs ${blackPlayer}</div>
            <div class="waiting-time">${timeStr} • ${rated}</div>
          </div>
          <button class="btn-join" data-game-id="${game.id}">Принять</button>
        `;
        
        const joinBtn = item.querySelector('.btn-join');
        joinBtn.addEventListener('click', async () => {
          await joinWaitingGame(game.id);
        });
        
        waitingRoom.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to load waiting room games:', err);
      const waitingRoom = document.querySelector('#lobby-tab .waiting-room');
      if (waitingRoom) {
        waitingRoom.innerHTML = '<div class="empty-state">Ошибка загрузки партий</div>';
      }
    }
  }

  async function loadTVGames() {
    try {
      const res = await authedFetch('/api/games/?status=ACTIVE&limit=50');
      if (!res.ok) throw new Error('Failed to load games');
      const games = await res.json();
      
      const tvGames = document.querySelector('#tv-tab .tv-games');
      if (!tvGames) return;
      
      if (!games || games.length === 0) {
        tvGames.innerHTML = '<div class="empty-state">Пока нет активных матчей.</div>';
        return;
      }
      
      tvGames.innerHTML = '';
      
      // Фильтруем только активные партии, где оба игрока присоединились
      const activeGames = games.filter(game => {
        // Показываем только партии со статусом ACTIVE, где оба игрока присоединились
        return game.status === 'ACTIVE' && game.white_id && game.black_id;
      });
      
      if (activeGames.length === 0) {
        tvGames.innerHTML = '<div class="empty-state">Пока нет активных матчей.</div>';
        return;
      }
      
      activeGames.forEach(game => {
        const item = document.createElement('div');
        item.className = 'tv-game';
        item.dataset.gameId = game.id;
        
        const timeControl = game.time_control || {};
        const minutes = Math.round((timeControl.initial_ms || 0) / 60000);
        const increment = Math.round((timeControl.increment_ms || 0) / 1000);
        const timeStr = `${minutes}+${increment}`;
        
        // Используем кэш имен пользователей, если доступен
        const whitePlayer = game.white_id ? (usernameFromCache(game.white_id) || `ID ${game.white_id}`) : '—';
        const blackPlayer = game.black_id ? (usernameFromCache(game.black_id) || `ID ${game.black_id}`) : '—';
        
        item.innerHTML = `
          <div class="tv-live-badge">
            <div class="live-dot"></div>
            LIVE
          </div>
          <div class="tv-players">
            <div class="tv-player">⚪ ${whitePlayer}</div>
            <div class="tv-player">⚫ ${blackPlayer}</div>
          </div>
          <div class="tv-time">${timeStr} • Ход ${game.move_count || 0}</div>
        `;
        
        item.addEventListener('click', () => {
          window.location.href = `/match/${game.id}`;
        });
        
        tvGames.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to load TV games:', err);
      const tvGames = document.querySelector('#tv-tab .tv-games');
      if (tvGames) {
        tvGames.innerHTML = '<div class="empty-state">Ошибка загрузки партий</div>';
      }
    }
  }

  // Join waiting game
  async function joinWaitingGame(gameId) {
    const token = getAccessToken();
    if (!token) {
      showToast('Войдите в аккаунт, чтобы присоединиться', 'error');
      window.location.href = '/login.html';
      return;
    }
    
    try {
      const res = await authedFetch(`/api/games/${gameId}/join`, {
        method: 'POST'
      });
      
      if (!res.ok) {
        let errorText = 'Не удалось присоединиться';
        try {
          const errorData = await res.json();
          errorText = errorData.detail || errorData.message || errorText;
        } catch {
          const text = await res.text();
          errorText = text || errorText;
        }
        throw new Error(errorText);
      }
      
      const game = await res.json();
      showToast('Вы присоединились к партии!');
      
      if (game && game.id) {
        window.location.href = `/match/${game.id}`;
      }
    } catch (err) {
      console.error(err);
      showToast('Не удалось присоединиться: ' + (err.message || ''), 'error');
    }
  }

  // Export functions for use outside IIFE
  window.loadWaitingRoomGames = loadWaitingRoomGames;
  window.loadTVGames = loadTVGames;
  window.joinWaitingGame = joinWaitingGame;
  window.authedFetch = authedFetch;
  window.showToast = showToast;
  window.isAuthenticated = isAuthenticated;
  window.getAccessToken = getAccessToken;
  window.requireAuth = requireAuth;
  window.createGame = createGame;

  // -------------------- Init --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    state.wsStatusEl = document.getElementById('wsStatus');
    bindEvents();
    setActiveTab('quick');
    loadTheme();
    handleHeaderScroll();
    window.addEventListener('scroll', handleHeaderScroll, { passive: true });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) closeMobileMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileMenu();
    });
    fetchCurrentUser();
    loadGames(true);
    setInterval(() => loadGames(false), 15000);
  });
})();

// ===== New UI functionality for games.html =====
// Tab switching is handled inside IIFE via bindTabs() function

// Initialize UI elements when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Game type toggle
  document.querySelectorAll('.game-type-toggle').forEach(toggle => {
      const options = toggle.querySelectorAll('.type-option');
      options.forEach(option => {
          option.addEventListener('click', (e) => {
              e.preventDefault();
              options.forEach(o => o.classList.remove('active'));
              option.classList.add('active');
          });
      });
  });

  // Mode card click - Open friend game modal with selected time
  document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
          const time = card.dataset.time;
          if (!time) return; // Skip custom game button

          // Check authentication
          if (!window.requireAuth || !window.requireAuth()) {
              return;
          }

          // Parse time control
          const [minutes, increment] = time.split('+').map(Number);

          // Get friend game modal elements
          const friendGameModal = document.getElementById('friendGameModal');
          const friendSetupScreen = document.getElementById('friendSetupScreen');
          const friendShareScreen = document.getElementById('friendShareScreen');
          const friendMinutesSlider = document.getElementById('friendMinutesSlider');
          const friendMinutesValue = document.getElementById('friendMinutesValue');
          const friendIncrementSlider = document.getElementById('friendIncrementSlider');
          const friendIncrementValue = document.getElementById('friendIncrementValue');

          if (!friendGameModal || !friendSetupScreen) return;

          // Set slider values
          if (friendMinutesSlider) {
              friendMinutesSlider.value = minutes;
              if (friendMinutesValue) friendMinutesValue.textContent = minutes;
          }
          if (friendIncrementSlider) {
              friendIncrementSlider.value = increment || 0;
              if (friendIncrementValue) friendIncrementValue.textContent = increment || 0;
          }

          // Open modal and show setup screen
          friendGameModal.classList.add('active');
          friendSetupScreen.style.display = 'block';
          if (friendShareScreen) friendShareScreen.classList.remove('active');
      });
  });

  // Custom game modal
  const customGameBtn = document.getElementById('customGameBtn');
  const customGameModal = document.getElementById('customGameModal');
  const closeModal = document.getElementById('closeModal');

  if (customGameBtn && customGameModal) {
      customGameBtn.addEventListener('click', () => {
          customGameModal.classList.add('active');
      });
  }

  if (closeModal) {
      closeModal.addEventListener('click', () => {
          customGameModal.classList.remove('active');
      });
  }

  if (customGameModal) {
      customGameModal.addEventListener('click', (e) => {
          if (e.target === customGameModal) {
              customGameModal.classList.remove('active');
          }
      });
  }

  // Friend game modal
  const friendGameModal = document.getElementById('friendGameModal');
  const closeFriendModal = document.getElementById('closeFriendModal');
  const friendSetupScreen = document.getElementById('friendSetupScreen');
  const friendShareScreen = document.getElementById('friendShareScreen');

  if (closeFriendModal) {
    closeFriendModal.addEventListener('click', () => {
        friendGameModal.classList.remove('active');
        // Stop polling when modal is closed
        if (opponentPollingInterval) {
            clearInterval(opponentPollingInterval);
            opponentPollingInterval = null;
        }
        opponentPollingStartTime = null;
    });
}

  if (friendGameModal) {
      friendGameModal.addEventListener('click', (e) => {
          if (e.target === friendGameModal) {
              friendGameModal.classList.remove('active');
              // Stop polling when modal is closed
              if (opponentPollingInterval) {
                  clearInterval(opponentPollingInterval);
                  opponentPollingInterval = null;
              }
              opponentPollingStartTime = null;
          }
      });
  }

  // Sliders - Custom game
  const minutesSlider = document.getElementById('minutesSlider');
  const minutesValue = document.getElementById('minutesValue');
  const incrementSlider = document.getElementById('incrementSlider');
  const incrementValue = document.getElementById('incrementValue');

  if (minutesSlider && minutesValue) {
      minutesSlider.addEventListener('input', () => {
          minutesValue.textContent = minutesSlider.value;
      });
  }

  if (incrementSlider && incrementValue) {
      incrementSlider.addEventListener('input', () => {
          incrementValue.textContent = incrementSlider.value;
      });
  }

  // Sliders - Friend game
  const friendMinutesSlider = document.getElementById('friendMinutesSlider');
  const friendMinutesValue = document.getElementById('friendMinutesValue');
  const friendIncrementSlider = document.getElementById('friendIncrementSlider');
  const friendIncrementValue = document.getElementById('friendIncrementValue');

  if (friendMinutesSlider && friendMinutesValue) {
      friendMinutesSlider.addEventListener('input', () => {
          friendMinutesValue.textContent = friendMinutesSlider.value;
      });
  }

  if (friendIncrementSlider && friendIncrementValue) {
      friendIncrementSlider.addEventListener('input', () => {
          friendIncrementValue.textContent = friendIncrementSlider.value;
      });
  }

  // Forms - Create Game (Quick Game Tab)
  // Обработчик createGameForm находится внутри IIFE (bindEvents -> handleCreateGame)

  const customGameForm = document.getElementById('customGameForm');
  if (customGameForm && minutesSlider && incrementSlider) {
      customGameForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const submitBtn = customGameForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;

          try {
              const minutes = parseInt(minutesSlider.value) || 5;
              const increment = parseInt(incrementSlider.value) || 0;
              const gameType = document.querySelector('#customGameForm .type-option.active');
              if (!gameType) {
                  if (submitBtn) submitBtn.disabled = false;
                  return;
              }

              const isRated = gameType.dataset.type === 'rated';
              
              const game = await window.createGame({
                  minutes,
                  increment,
                  isRated,
                  creatorColor: 'white',
                  initialFen: 'startpos',
                  onSuccess: (game) => {
                      if (typeof window.showToast === 'function') {
                          window.showToast('Партия создана! Ищем соперника...');
                      }
                      if (customGameModal) customGameModal.classList.remove('active');
                      if (game && game.id) {
                          window.location.href = `/match/${game.id}`;
                      }
                  },
                  onError: (err, message) => {
                      // Error already handled in createGame
                  }
              });
              
              if (!game && submitBtn) {
                  submitBtn.disabled = false;
              }
          } catch (err) {
              console.error(err);
              if (submitBtn) submitBtn.disabled = false;
          }
      });
  }

  const friendGameForm = document.getElementById('friendGameForm');
  if (friendGameForm && friendMinutesSlider && friendIncrementSlider) {
      friendGameForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const submitBtn = friendGameForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;

          try {
              const minutes = parseInt(friendMinutesSlider.value) || 5;
              const increment = parseInt(friendIncrementSlider.value) || 0;
              const gameType = document.querySelector('#friendGameForm .type-option.active');
              if (!gameType) {
                  if (submitBtn) submitBtn.disabled = false;
                  return;
              }

              const isRated = gameType.dataset.type === 'rated';
              
              const game = await window.createGame({
                  minutes,
                  increment,
                  isRated,
                  creatorColor: 'white',
                  initialFen: 'startpos',
                  onSuccess: (game) => {
                      // Update share screen info
                      const shareGameTitle = document.getElementById('shareGameTitle');
                      const shareGameType = document.getElementById('shareGameType');
                      if (shareGameTitle) shareGameTitle.textContent = `Партия ${minutes}+${increment}`;
                      if (shareGameType) shareGameType.textContent = isRated ? 'Рейтинговая партия' : 'Товарищеская партия';
                      
                      // Generate share link
                      const shareLink = document.getElementById('shareLink');
                      if (shareLink && game.id) {
                          shareLink.value = `${window.location.origin}/match/${game.id}`;
                      }
                      
                      // Show share screen
                      if (friendSetupScreen) friendSetupScreen.style.display = 'none';
                      if (friendShareScreen) friendShareScreen.classList.add('active');
                      
                      // Start polling for second player
                      if (game.id) {
                          startWaitingForOpponent(game.id);
                      }
                  },
                  onError: (err, message) => {
                      // Error already handled in createGame
                      if (submitBtn) submitBtn.disabled = false;
                  }
              });
              
              if (!game && submitBtn) {
                  submitBtn.disabled = false;
              }
          } catch (err) {
              console.error(err);
              if (submitBtn) submitBtn.disabled = false;
          }
      });
  }

// Wait for opponent to join
let opponentPollingInterval = null;
let opponentPollingStartTime = null;
const OPPONENT_POLLING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

function startWaitingForOpponent(gameId) {
    // Clear any existing polling
    if (opponentPollingInterval) {
        clearInterval(opponentPollingInterval);
        opponentPollingInterval = null;
    }
    
    // Record start time
    opponentPollingStartTime = Date.now();
    
    // Check every 2 seconds
    opponentPollingInterval = setInterval(async () => {
        try {
            // Check timeout (10 minutes)
            const elapsed = Date.now() - opponentPollingStartTime;
            if (elapsed >= OPPONENT_POLLING_TIMEOUT) {
                // Stop polling
                if (opponentPollingInterval) {
                    clearInterval(opponentPollingInterval);
                    opponentPollingInterval = null;
                }
                opponentPollingStartTime = null;
                
                // Show timeout message
                if (typeof window.showToast === 'function') {
                    window.showToast('Время ожидания истекло. Партия была удалена.', 'error');
                }
                
                // Close modal if open
                const friendGameModal = document.getElementById('friendGameModal');
                if (friendGameModal) {
                    friendGameModal.classList.remove('active');
                }
                
                return;
            }
            
            const res = await window.authedFetch(`/api/games/${gameId}`);
            if (!res.ok) {
                // Game might have been deleted
                if (res.status === 404) {
                    // Stop polling
                    if (opponentPollingInterval) {
                        clearInterval(opponentPollingInterval);
                        opponentPollingInterval = null;
                    }
                    opponentPollingStartTime = null;
                    
                    // Show message
                    if (typeof window.showToast === 'function') {
                        window.showToast('Партия была удалена (время ожидания истекло).', 'error');
                    }
                    
                    // Close modal if open
                    const friendGameModal = document.getElementById('friendGameModal');
                    if (friendGameModal) {
                        friendGameModal.classList.remove('active');
                    }
                } else {
                    console.error('Failed to check game status');
                }
                return;
            }
            
            const game = await res.json();
            
            // Check if both players have joined
            const whiteReady = game.white_id !== null && game.white_id !== undefined;
            const blackReady = game.black_id !== null && game.black_id !== undefined;
            
            if (whiteReady && blackReady) {
                // Stop polling
                if (opponentPollingInterval) {
                    clearInterval(opponentPollingInterval);
                    opponentPollingInterval = null;
                }
                opponentPollingStartTime = null;
                
                // Redirect to match page
                window.location.href = `/match/${gameId}`;
            }
        } catch (err) {
            console.error('Error checking game status:', err);
        }
    }, 2000);
}

  // Stop polling when modal is closed (handlers added to existing modal handlers above)

  // Copy link button
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
          const linkInput = document.getElementById('shareLink');
          if (linkInput) {
              try {
                  await navigator.clipboard.writeText(linkInput.value);
                  const originalHTML = copyLinkBtn.innerHTML;
                  copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                  setTimeout(() => {
                      copyLinkBtn.innerHTML = originalHTML;
                  }, 2000);
                  if (typeof window.showToast === 'function') {
                      window.showToast('Ссылка скопирована');
                  }
              } catch (err) {
                  // Fallback for older browsers
                  linkInput.select();
                  document.execCommand('copy');
                  if (typeof window.showToast === 'function') {
                      window.showToast('Ссылка скопирована');
                  }
              }
          }
      });
  }
}); // End of DOMContentLoaded

// Functions loadWaitingRoomGames and loadTVGames are now defined inside the IIFE above
// Tab switching is handled inside IIFE via bindTabs() function

