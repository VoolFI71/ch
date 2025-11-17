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
    activeTab: 'waiting',
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
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
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
      return state.currentUser.username ? `Вы (@${state.currentUser.username})` : 'Вы';
    }
    const cached = usernameFromCache(id);
    if (cached) return `@${cached}`;
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
    if (state.selectedGame.next_turn === 'w') {
      return {
        white: Math.max(0, base.white),
        black: Math.max(0, base.black) + increment,
      };
    }
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

    if (state.currentUser) {
      if (info) {
        info.style.display = 'inline-flex';
        const displayName = state.currentUser.username ? `@${state.currentUser.username}` : `ID ${state.currentUser.id}`;
        info.textContent = displayName;
      }
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      if (userActions) userActions.style.display = 'flex';
      if (authButtons) authButtons.style.display = 'none';
      if (mobileUser) mobileUser.style.display = 'flex';
      if (mobileAuth) mobileAuth.style.display = 'none';
    } else {
      if (info) info.style.display = 'none';
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
    window.location.href = '/login.html';
  };

  const handleRegisterRedirect = () => {
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
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
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
    const saved = localStorage.getItem('powerchess-theme');
    isDarkTheme = saved === 'dark';
    document.body.classList.toggle('dark', isDarkTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
  }

  function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark', isDarkTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
    localStorage.setItem('powerchess-theme', isDarkTheme ? 'dark' : 'light');
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

  window.toggleTheme = toggleTheme;
  window.toggleMobileMenu = toggleMobileMenu;
  window.closeMobileMenu = closeMobileMenu;

  // -------------------- Init --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    state.wsStatusEl = document.getElementById('wsStatus');
    bindEvents();
    setActiveTab('waiting');
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

