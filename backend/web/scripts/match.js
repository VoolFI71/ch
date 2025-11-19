(() => {
  const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const PIECES = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  };
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const state = {
    matchId: null,
    game: null,
    moves: [],
    ws: null,
    currentUser: null,
    lastStateTimestamp: null,
    clockTimer: null,
    autoJoinAttempted: false,
    loginPromptShown: false,
    selectedSquare: null,
    availableTargets: new Set(),
    legalMovesByFrom: new Map(),
    pendingMove: false,
    autoCancelDeadline: null,
    autoCancelTimerId: null,
  };

  let isDarkTheme = false;
  let boardOrientation = 'white';
  let userSetOrientation = false;

  const playerUsernames = new Map();
  const AUTO_CANCEL_TIMEOUT_MS = 30_000;

  const API_BASE = (() => {
    const { protocol, hostname, port } = window.location;
    const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';
    if (isLocal) {
      return `${protocol}//${hostname}:8080`;
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  })();

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
      // ignore
    }
  };

  const clearTokens = () => {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {
      // ignore
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

  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
  }

  const translateStatus = (status, nextTurn) => {
    if (status === 'CREATED' || status === 'ACTIVE') {
      if (nextTurn === 'w') return 'Ход белых';
      if (nextTurn === 'b') return 'Ход чёрных';
    }
    return (
      {
        PAUSED: 'Пауза',
        FINISHED: 'Завершена',
      }[status] || status || '—'
    );
  };

  const statusClass = (status) => ({
    CREATED: 'status-created',
    ACTIVE: 'status-active',
    PAUSED: 'status-paused',
    FINISHED: 'status-finished',
  }[status] || '');

  const describeTimeControl = (tc) => {
    if (!tc) return 'Без контроля';
    const minutes = Math.round((tc.initial_ms || 0) / 60000);
    const inc = Math.round((tc.increment_ms || 0) / 1000);
    return `${minutes} мин + ${inc} сек`;
  };

  const formatClock = (ms) => {
    if (ms === null || ms === undefined) return '—';
    const clamped = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(clamped / 60).toString().padStart(2, '0');
    const seconds = (clamped % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

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
      return;
    }
    playerUsernames.set(key, null);
  };

  const formatCountdown = (totalSeconds) => {
    const seconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  function clearAutoCancelTimer() {
    if (state.autoCancelTimerId) {
      clearInterval(state.autoCancelTimerId);
      state.autoCancelTimerId = null;
    }
    state.autoCancelDeadline = null;
    const banner = document.getElementById('autoCancelBanner');
    const timerEl = document.getElementById('autoCancelTimer');
    if (banner) banner.style.display = 'none';
    if (timerEl) timerEl.textContent = '00:30';
  }

  function updateAutoCancelTimerDisplay() {
    const banner = document.getElementById('autoCancelBanner');
    const timerEl = document.getElementById('autoCancelTimer');
    if (!banner || !timerEl) return;
    if (!state.autoCancelDeadline) {
      banner.style.display = 'none';
      return;
    }
    const remainingMs = state.autoCancelDeadline - Date.now();
    if (remainingMs <= 0) {
      clearAutoCancelTimer();
      return;
    }
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    timerEl.textContent = formatCountdown(remainingSeconds);
    banner.style.display = '';
  }

  function setAutoCancelDeadline(deadlineMs) {
    if (deadlineMs === null || deadlineMs === undefined || Number.isNaN(deadlineMs)) {
      clearAutoCancelTimer();
      return;
    }
    if (deadlineMs <= Date.now()) {
      clearAutoCancelTimer();
      return;
    }
    const prev = state.autoCancelDeadline;
    state.autoCancelDeadline = deadlineMs;
    if (prev && Math.abs(prev - deadlineMs) < 500) {
      updateAutoCancelTimerDisplay();
      return;
    }
    if (state.autoCancelTimerId) {
      clearInterval(state.autoCancelTimerId);
      state.autoCancelTimerId = null;
    }
    updateAutoCancelTimerDisplay();
    state.autoCancelTimerId = setInterval(() => {
      if (!state.autoCancelDeadline) {
        clearAutoCancelTimer();
        return;
      }
      updateAutoCancelTimerDisplay();
    }, 1000);
  }

  function syncAutoCancelDeadline(detail) {
    if (!detail) {
      clearAutoCancelTimer();
      return;
    }
    if (detail.status !== 'CREATED' || detail.move_count > 0) {
      clearAutoCancelTimer();
      return;
    }
    const whiteReady = detail.white_id !== null && detail.white_id !== undefined;
    const blackReady = detail.black_id !== null && detail.black_id !== undefined;
    if (!whiteReady || !blackReady) {
      clearAutoCancelTimer();
      return;
    }
    let deadlineMs = null;
    if (detail.auto_cancel_at) {
      const parsed = Date.parse(detail.auto_cancel_at);
      if (!Number.isNaN(parsed)) {
        deadlineMs = parsed;
      }
    }
    if (!deadlineMs) {
      if (state.autoCancelDeadline) {
        updateAutoCancelTimerDisplay();
        return;
      }
      deadlineMs = Date.now() + AUTO_CANCEL_TIMEOUT_MS;
    }
    setAutoCancelDeadline(deadlineMs);
  }

  const titleName = (id) => {
    if (id === null || id === undefined) return '—';
    const username = usernameFromCache(id);
    if (username) return username;
    return `ID ${id}`;
  };

  async function fetchUsername(userId) {
    const key = normalizeUserId(userId);
    if (key === null) return null;
    if (playerUsernames.has(key)) return playerUsernames.get(key);
    try {
      const res = await authedFetch(`/api/users/${encodeURIComponent(key)}`);
      if (!res.ok) {
        storeUsername(key, null);
        return null;
      }
      const data = await res.json();
      const username =
        (data && (data.username || data.display_name || data.name || data.handle || data.login)) || null;
      storeUsername(key, username);
      updatePlayerLabelsAndTitle();
      return usernameFromCache(key);
    } catch {
      storeUsername(key, null);
      updatePlayerLabelsAndTitle();
      return null;
    }
  }

  async function ensurePlayerUsernames(game) {
    if (!game) return;
    const ids = [normalizeUserId(game.white_id), normalizeUserId(game.black_id)]
      .filter((id) => id !== null && !playerUsernames.has(id));
    if (!ids.length) return;
    await Promise.all(ids.map((id) => fetchUsername(id)));
    updatePlayerLabelsAndTitle();
  }

  const labelPlayer = (id) => {
    if (id === null || id === undefined) return '—';
    if (state.currentUser && state.currentUser.id === id) {
      return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
    }
    const username = usernameFromCache(id);
    if (username) return username;
    return `ID ${id}`;
  };

  function updatePlayerLabelsAndTitle() {
    const matchTitle = document.getElementById('matchTitle');
    if (matchTitle) {
      if (state.game) {
        const whiteName = titleName(state.game.white_id);
        const blackName = titleName(state.game.black_id);
        matchTitle.textContent = `${whiteName} vs ${blackName}`;
      } else {
        matchTitle.textContent = 'Партия не найдена';
      }
    }

    const whiteLabel = document.getElementById('whitePlayerLabel');
    if (whiteLabel) {
      whiteLabel.textContent = state.game ? labelPlayer(state.game.white_id) : '—';
    }

    const blackLabel = document.getElementById('blackPlayerLabel');
    if (blackLabel) {
      blackLabel.textContent = state.game ? labelPlayer(state.game.black_id) : '—';
    }
  }

  const getAvailableSeat = (game) => {
    if (!game) return null;
    if (game.white_id == null) return 'white';
    if (game.black_id == null) return 'black';
    return null;
  };

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

    const updateUserPill = (el) => {
      if (!el) return;
      const textNode = el.querySelector('span');
      if (state.currentUser) {
        el.style.display = 'inline-flex';
        if (textNode) textNode.textContent = displayName;
      } else {
        el.style.display = 'none';
      }
    };

    if (state.currentUser) {
      updateUserPill(info);
      updateUserPill(infoMobile);
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      if (userActions) userActions.style.display = 'flex';
      if (authButtons) authButtons.style.display = 'none';
      if (mobileUser) mobileUser.style.display = 'flex';
      if (mobileAuth) mobileAuth.style.display = 'none';
    } else {
      updateUserPill(info);
      updateUserPill(infoMobile);
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      if (userActions) userActions.style.display = 'none';
      if (authButtons) authButtons.style.display = 'flex';
      if (mobileUser) mobileUser.style.display = 'none';
      if (mobileAuth) mobileAuth.style.display = 'flex';
    }
  }

  async function fetchCurrentUser() {
    try {
      const res = await authedFetch('/api/auth/me');
      state.currentUser = res && res.ok ? await res.json() : null;
    } catch {
      state.currentUser = null;
    }
    updateAuthPanel();
    updatePlayerLabelsAndTitle();
    if (state.game) {
      updateLegalMoves();
      renderBoard();
    }
  }

  const parseMatchId = () => {
    const pathMatch = window.location.pathname.match(/\/match\/([0-9a-fA-F-]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    const param = new URLSearchParams(window.location.search).get('game');
    return param || null;
  };

  const parseFenBoard = (fen) => {
    const boardPart = (fen || DEFAULT_FEN).split(' ')[0];
    const rows = boardPart.split('/');
    return rows.map((row) => {
      const squares = [];
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          squares.push(...Array(parseInt(char, 10)).fill(''));
        } else {
          squares.push(char);
        }
      }
      return squares;
    });
  };

  const getBoardMatrix = () => parseFenBoard(state.game?.current_pos || DEFAULT_FEN);

  const getOrientedMatrix = () => {
    const matrix = getBoardMatrix();
    if (boardOrientation === 'white') return matrix;
    return matrix.slice().reverse().map((row) => row.slice().reverse());
  };

  const getHighlightSquares = () => {
    const lastMove = state.moves?.[state.moves.length - 1];
    if (!lastMove || !lastMove.uci || lastMove.uci.length < 4) return [];
    const from = lastMove.uci.slice(0, 2);
    const to = lastMove.uci.slice(2, 4);
    return [from, to];
  };

  function renderBoard() {
    const boardEl = document.getElementById('matchBoard');
    if (!boardEl) return;

    if (!state.game) {
      boardEl.innerHTML = '<div class="board-empty">Партия не найдена</div>';
      return;
    }
    

    const matrix = getOrientedMatrix();
    const highlightSet = new Set(getHighlightSquares());
    const files = boardOrientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = boardOrientation === 'white' ? RANKS : [...RANKS].reverse();
    const utils = window.ChessMoveUtils;
    const baseBoard = state.game && utils ? utils.parseFen(state.game.current_pos).board : null;
    const selectedSquare = state.selectedSquare;
    const targetSquares =
      state.availableTargets instanceof Set ? state.availableTargets : new Set();

    boardEl.innerHTML = '';
    matrix.forEach((row, rIdx) => {
      row.forEach((piece, cIdx) => {
        const square = document.createElement('div');
        const isLight = (rIdx + cIdx) % 2 === 0;
        square.className = `square ${isLight ? 'light' : 'dark'}`;
        const squareName = `${files[cIdx]}${ranks[rIdx]}`;
        if (highlightSet.has(squareName)) {
          square.classList.add('highlighted');
          const overlay = document.createElement('div');
          overlay.className = 'highlight-overlay';
          square.appendChild(overlay);
        }
        if (selectedSquare && squareName === selectedSquare) {
          square.classList.add('selected-user');
        }
        let isCaptureTarget = false;
        if (targetSquares.has(squareName)) {
          square.classList.add('legal-target');
          if (baseBoard) {
            const fileIdx = squareName.charCodeAt(0) - 97;
            const rankIdx = 8 - Number.parseInt(squareName[1], 10);
            const occupant = baseBoard?.[rankIdx]?.[fileIdx];
            if (occupant && occupant !== '') {
              isCaptureTarget = true;
            }
          }
          if (isCaptureTarget) {
            square.classList.add('legal-target-capture');
          }
          const marker = document.createElement('div');
          marker.className = 'legal-move-indicator';
          if (isCaptureTarget) marker.classList.add('capture');
          square.appendChild(marker);
        }
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = 'piece';
          // Используем SVG фигуры если доступны, иначе fallback на Unicode
          if (window.getPieceSVG) {
            pieceEl.innerHTML = window.getPieceSVG(piece);
          } else {
            pieceEl.textContent = PIECES[piece] || '';
          }
          
          // Добавляем класс для фигур текущего игрока (для hover эффектов)
          const role = getCurrentUserRole();
          if (role && pieceBelongsToRole(piece, role)) {
            pieceEl.classList.add('piece-own');
            // Проверяем, есть ли ходы для этой фигуры
            const movesForPiece = state.legalMovesByFrom.get(squareName);
            if (movesForPiece && movesForPiece.length > 0) {
              pieceEl.classList.add('piece-movable');
            }
          }
          
          square.appendChild(pieceEl);
        }
        if (rIdx === matrix.length - 1) {
          const fileCoord = document.createElement('span');
          fileCoord.className = 'coordinate file-coord';
          fileCoord.textContent = files[cIdx];
          square.appendChild(fileCoord);
        }
        if (cIdx === 0) {
          const rankCoord = document.createElement('span');
          rankCoord.className = 'coordinate rank-coord';
          rankCoord.textContent = ranks[rIdx];
          square.appendChild(rankCoord);
        }
        square.dataset.square = squareName;
        square.addEventListener('click', () => handleSquareClick(squareName));
        
        // Добавляем hover эффект для клеток с фигурами текущего игрока
        const role = getCurrentUserRole();
        if (piece && role && pieceBelongsToRole(piece, role)) {
          const movesForPiece = state.legalMovesByFrom.get(squareName);
          if (movesForPiece && movesForPiece.length > 0) {
            square.classList.add('square-hoverable');
            square.title = 'Кликните, чтобы выбрать фигуру и увидеть возможные ходы';
          }
        }
        
        boardEl.appendChild(square);
      });
    });
  }

  function computeOrientationFromRole() {
    if (userSetOrientation) return;
    const role = getCurrentUserRole();
    if (role === 'white' || role === 'black') {
      boardOrientation = role;
    } else {
      boardOrientation = 'white';
    }
  }

  function setMessageVisible(show, text) {
    const message = document.getElementById('matchMessage');
    if (!message) return;
    if (show) {
      message.style.display = 'block';
      if (text) message.textContent = text;
    } else {
      message.style.display = 'none';
    }
  }

  function getDisplayedClocks(applyRunning = true) {
    if (!state.game) return null;
    let { white_clock_ms: white, black_clock_ms: black, status, next_turn } = state.game;
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
    const whiteEl = document.getElementById('whiteClock');
    const blackEl = document.getElementById('blackClock');
    if (whiteEl) whiteEl.textContent = formatClock(clocks.white);
    if (blackEl) blackEl.textContent = formatClock(clocks.black);

    if (resetTimer) {
      if (state.clockTimer) clearInterval(state.clockTimer);
      state.clockTimer = setInterval(() => {
        const tick = getDisplayedClocks(true);
        if (!tick) return;
        if (whiteEl) whiteEl.textContent = formatClock(tick.white);
        if (blackEl) blackEl.textContent = formatClock(tick.black);
        renderActions();
      }, 1000);
    }
  }

  function renderMoves() {
    const list = document.getElementById('movesList');
    if (!list) return;
    if (!state.moves.length) {
      list.innerHTML = '<li style="justify-content:center;color:rgba(148,163,184,.7);">Ходов пока нет</li>';
      return;
    }
    const lastId = state.moves.length ? state.moves[state.moves.length - 1].id : null;
    list.innerHTML = state.moves
      .map((move) => `
        <li class="${move.id === lastId ? 'active' : ''}">
          <span>#${move.move_index}</span>
          <span>${move.san || move.uci}</span>
          <span style="font-size:0.8rem;color:rgba(148,163,184,.8);">${move.player_id ? `ID ${move.player_id}` : '—'}</span>
        </li>
      `)
      .join('');
    list.scrollTop = list.scrollHeight;
  }

  function resetSelection() {
    state.selectedSquare = null;
    state.availableTargets = new Set();
  }

  function pieceBelongsToRole(piece, role) {
    if (!piece) return false;
    const isWhite = piece === piece.toUpperCase();
    return role === (isWhite ? 'white' : 'black');
  }

  function getPieceAtSquare(fen, square) {
    const utils = window.ChessMoveUtils;
    if (!utils || !fen || !square) return null;
    const { board } = utils.parseFen(fen);
    const fileIdx = square.charCodeAt(0) - 97;
    const rankIdx = 8 - Number.parseInt(square[1], 10);
    if (Number.isNaN(fileIdx) || Number.isNaN(rankIdx)) return null;
    return board?.[rankIdx]?.[fileIdx] ?? null;
  }

  function updateLegalMoves() {
    state.legalMovesByFrom = new Map();
    resetSelection();
    
    if (!state.game) {
      return;
    }
    
    // Показываем ходы для активной игры или если оба игрока присоединились (даже в CREATED)
    const bothPlayersJoined = state.game.white_id !== null && state.game.white_id !== undefined &&
                              state.game.black_id !== null && state.game.black_id !== undefined;
    
    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      return;
    }
    
    const utils = window.ChessMoveUtils;
    if (!utils) {
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      return;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      return;
    }
    
    const { movesByFrom } = utils.generateMoves(state.game.current_pos, role);
    
    movesByFrom.forEach((uciSet, fromSquare) => {
      const entries = [];
      uciSet.forEach((uci) => {
        const base = uci.slice(0, 4);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4) : null;
        entries.push({ from: fromSquare, to, base, promotion });
      });
      if (entries.length) {
        state.legalMovesByFrom.set(fromSquare, entries);
      }
    });
  }

  function executeMove(fromSquare, toSquare) {
    const moves = state.legalMovesByFrom.get(fromSquare);
    if (!moves || !moves.length) return;
    const options = moves.filter((entry) => entry.to === toSquare);
    if (!options.length) return;
    let chosen = options[0];
    if (options.length > 1) {
      let promotion = prompt('Выберите фигуру для промоции (q, r, b, n)', 'q');
      if (!promotion) return;
      promotion = promotion.toLowerCase();
      chosen = options.find((entry) => entry.promotion === promotion);
      if (!chosen) {
        showToast('Неверная фигура промоции', 'error');
        return;
      }
    }
    const success = attemptMove(chosen.base, chosen.promotion);
    if (success) {
      resetSelection();
      renderBoard();
    }
  }

  function handleSquareClick(squareName) {
    if (!state.game) {
      return;
    }
    // Проверяем, можно ли делать ходы (ACTIVE или оба игрока присоединились)
    const bothPlayersJoined = state.game.white_id !== null && state.game.white_id !== undefined &&
                              state.game.black_id !== null && state.game.black_id !== undefined;
    
    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      if (state.game.status === 'CREATED') {
        showToast('Дождитесь присоединения соперника, чтобы начать игру', 'info');
      }
      return;
    }
    if (state.pendingMove) {
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      return;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      return;
    }
    const square = squareName.toLowerCase();

    if (state.selectedSquare && state.availableTargets.has(square)) {
      executeMove(state.selectedSquare, square);
      return;
    }

    if (state.selectedSquare === square) {
      resetSelection();
      renderBoard();
      return;
    }

    const moves = state.legalMovesByFrom.get(square);
    
    if (!moves || !moves.length) {
      resetSelection();
      renderBoard();
      return;
    }

    const piece = getPieceAtSquare(state.game.current_pos, square);
    
    if (!piece || !pieceBelongsToRole(piece, role)) {
      resetSelection();
      renderBoard();
      return;
    }
    state.selectedSquare = square;
    state.availableTargets = new Set(moves.map((entry) => entry.to));
    renderBoard();
  }

  const canJoinGame = () => {
    if (!state.currentUser || !state.game) return false;
    if (state.game.status !== 'CREATED') return false;
    if (state.currentUser.id === state.game.white_id || state.currentUser.id === state.game.black_id) return false;
    return getAvailableSeat(state.game) !== null;
  };

  const shouldAutoJoin = () => {
    if (!state.game || state.autoJoinAttempted) return false;
    if (state.game.status !== 'CREATED') return false;
    if (!state.currentUser) return false;
    if (state.currentUser.id === state.game.white_id || state.currentUser.id === state.game.black_id) return false;
    return getAvailableSeat(state.game) !== null;
  };

  const getCurrentUserRole = () => {
    if (!state.currentUser || !state.game) return null;
    if (state.currentUser.id === state.game.white_id) return 'white';
    if (state.currentUser.id === state.game.black_id) return 'black';
    return null;
  };

  const canDeclareTimeout = (role) => {
    const clocks = getDisplayedClocks(false);
    if (!clocks) return false;
    if (role === 'white') return clocks.black <= 0;
    if (role === 'black') return clocks.white <= 0;
    return false;
  };

  const gameDetailPath = (id) => `/api/games/${id}`;
  const gameJoinPath = (id) => `/api/games/${id}/join`;
  const gameResignPath = (id) => `/api/games/${id}/resign`;
  const gameTimeoutPath = (id) => `/api/games/${id}/timeout`;

  function renderActions() {
    const container = document.getElementById('gameActions');
    if (!container) return;
    container.innerHTML = '';
    if (!state.game) return;

    const seat = getAvailableSeat(state.game);
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-primary';
    joinBtn.textContent =
      seat === 'white'
        ? 'Присоединиться белыми'
        : seat === 'black'
          ? 'Присоединиться чёрными'
          : 'Присоединиться';
    joinBtn.addEventListener('click', () => joinGame());

    const resignBtn = document.createElement('button');
    resignBtn.className = 'btn btn-danger';
    resignBtn.textContent = 'Сдаться';
    resignBtn.addEventListener('click', resignGame);

    const flagBtn = document.createElement('button');
    flagBtn.className = 'btn btn-outline';
    flagBtn.textContent = 'Заявить флаг соперника';
    flagBtn.addEventListener('click', declareTimeout);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline';
    copyBtn.textContent = 'Скопировать ссылку';
    copyBtn.addEventListener('click', copyShareLink);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-outline';
    refreshBtn.textContent = 'Обновить';
    refreshBtn.addEventListener('click', loadMatch);

    if (canJoinGame()) container.appendChild(joinBtn);

    const role = getCurrentUserRole();
    if (role && state.game.status === 'ACTIVE') {
      container.appendChild(resignBtn);
      if (canDeclareTimeout(role)) container.appendChild(flagBtn);
    }

    container.appendChild(copyBtn);
    container.appendChild(refreshBtn);
  }

  function maybeAutoJoin() {
    if (shouldAutoJoin()) {
      state.autoJoinAttempted = true;
      joinGame(true);
      return;
    }
    if (
      !state.game ||
      state.game.status !== 'CREATED' ||
      !getAvailableSeat(state.game) ||
      state.currentUser ||
      state.loginPromptShown
    ) {
      return;
    }
    state.loginPromptShown = true;
    showToast('Войдите, чтобы занять место соперника', 'error');
  }

  function copyGameId() {
    const field = document.getElementById('gameIdField');
    if (!field || !field.value) return;
    navigator.clipboard.writeText(field.value)
      .then(() => showToast('UUID партии скопирован', 'success'))
      .catch(() => showToast('Не удалось скопировать UUID', 'error'));
  }

  function copyShareLink() {
    if (!state.matchId) return;
    const url = `${window.location.origin}/match/${state.matchId}`;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Ссылка на партию скопирована', 'success'))
      .catch(() => showToast('Не удалось скопировать ссылку', 'error'));
  }

  function toggleBoardOrientation() {
    boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
    userSetOrientation = true;
    renderBoard();
  }

  function updateWsIndicator(status) {
    const indicator = document.getElementById('wsStatus');
    if (!indicator) return;
    indicator.textContent = `WS: ${status}`;
    indicator.className = `ws-indicator ${status === 'online' ? 'ws-online' : 'ws-offline'}`;
  }

  function applyGameDetail(detail) {
    const previousGame = state.game;
    const previousRole = getCurrentUserRole();
    const previousNextTurn = state.game?.next_turn;
    const previousStatus = state.game?.status;
    
    // Обновляем состояние игры
    state.game = detail;
    state.moves = detail?.moves || [];
    
    // Устанавливаем время последнего обновления на основе последнего хода
    // Это важно для правильного вычисления времени на часах при загрузке страницы
    if (detail.moves && detail.moves.length > 0) {
      // Используем время последнего хода
      const lastMove = detail.moves[detail.moves.length - 1];
      if (lastMove.created_at) {
        state.lastStateTimestamp = new Date(lastMove.created_at).getTime();
      } else {
        state.lastStateTimestamp = Date.now();
      }
    } else if (detail.started_at) {
      // Если ходов нет, но игра началась, используем время начала игры
      state.lastStateTimestamp = new Date(detail.started_at).getTime();
    } else {
      // Если игра еще не началась, используем текущее время
      state.lastStateTimestamp = Date.now();
    }
    
    state.pendingMove = false;
    
    const newRole = getCurrentUserRole();
    const newNextTurn = detail?.next_turn;
    const newStatus = detail?.status;
    
    if (newRole !== previousRole) {
      userSetOrientation = false;
    }
    
    syncAutoCancelDeadline(detail);
    updateLegalMoves(); // Обновляем легальные ходы при изменении состояния игры
    computeOrientationFromRole();
    updateUI();
    maybeAutoJoin();
    ensurePlayerUsernames(detail);

    const notifyOpponentJoined = () => {
      if (!state.game) return;
      const role = getCurrentUserRole();
      if (role === 'white') {
        const currentOpponent = state.game.black_id;
        const previousOpponent = previousGame?.black_id ?? null;
        if (
          currentOpponent !== null &&
          currentOpponent !== undefined &&
          currentOpponent !== previousOpponent
        ) {
          fetchUsername(currentOpponent).then((resolved) => {
            const display = resolved || `ID ${currentOpponent}`;
            showToast(`Соперник ${display} подключился к партии`, 'info');
          });
        }
      } else if (role === 'black') {
        const currentOpponent = state.game.white_id;
        const previousOpponent = previousGame?.white_id ?? null;
        if (
          currentOpponent !== null &&
          currentOpponent !== undefined &&
          currentOpponent !== previousOpponent
        ) {
          fetchUsername(currentOpponent).then((resolved) => {
            const display = resolved || `ID ${currentOpponent}`;
            showToast(`Соперник ${display} подключился к партии`, 'info');
          });
        }
      }
    };

    notifyOpponentJoined();
  }

  function updateUI() {
    updatePlayerLabelsAndTitle();

    const badge = document.getElementById('gameStatusBadge');
    if (badge) {
      if (state.game) {
        badge.textContent = translateStatus(state.game.status, state.game.next_turn);
        badge.className = `pill ${statusClass(state.game.status)}`;
      } else {
        badge.textContent = '—';
        badge.className = 'pill';
      }
    }

    const timeControlEl = document.getElementById('gameTimeControl');
    if (timeControlEl) {
      timeControlEl.textContent = state.game ? describeTimeControl(state.game.time_control) : '—';
    }

    const resultEl = document.getElementById('gameResult');
    if (resultEl) {
      resultEl.textContent = state.game?.result || '—';
    }

    const gameIdField = document.getElementById('gameIdField');
    if (gameIdField) {
      gameIdField.value = state.game?.id || '';
    }

    if (!state.game) {
      setMessageVisible(true, 'Партия не найдена или недоступна. Проверьте ссылку или вернитесь к списку матчей.');
    } else {
      setMessageVisible(false);
    }

    renderBoard();
    renderMoves();
    renderActions();
    updateClockDisplays(true);
  }

  async function loadMatch() {
    if (!state.matchId) {
      state.game = null;
      clearAutoCancelTimer();
      updateUI();
      return;
    }
    try {
      const res = await fetch(buildUrl(`${gameDetailPath(state.matchId)}?moves_limit=200`));
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      connectWebSocket(state.matchId);
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить партию', 'error');
      state.game = null;
      state.moves = [];
      clearAutoCancelTimer();
      updateUI();
    }
  }

  function connectWebSocket(gameId) {
    if (!gameId) return;
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
    try {
      const ws = new WebSocket(url);
      state.ws = ws;
      ws.onopen = () => updateWsIndicator('online');
      ws.onclose = () => updateWsIndicator('offline');
      ws.onerror = () => updateWsIndicator('offline');
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWsPayload(payload);
        } catch (err) {
          console.error('WS parse error', err);
        }
      };
    } catch (err) {
      console.error('WS connection error', err);
      updateWsIndicator('offline');
    }
  }

  function handleWsPayload(payload) {
    if (!payload) return;
    if (payload.type === 'game_cancelled') {
      state.pendingMove = false;
      clearAutoCancelTimer();
      showToast('Партия отменена: никто не сделал ход', 'error');
      setTimeout(() => {
        window.location.href = '/games';
      }, 1200);
      return;
    }
    if (payload.type === 'move_rejected' || payload.type === 'error') {
      state.pendingMove = false;
      updateLegalMoves();
      renderBoard();
      showToast(payload.message || 'Ход отклонён', 'error');
      return;
    }
    if (payload.type === 'state' || payload.type === 'game_finished' || payload.type === 'move_made') {
      const previousStatus = state.game?.status;
      const previousWhiteId = state.game?.white_id;
      const previousBlackId = state.game?.black_id;
      
      applyGameDetail(payload.game);
      
      // Если игра только что стала активной, показываем уведомление
      if (previousStatus === 'CREATED' && payload.game.status === 'ACTIVE') {
        showToast('Игра началась! Теперь вы можете делать ходы', 'success');
      }
      // Если присоединился второй игрок, обновляем ходы
      const bothJoined = payload.game.white_id && payload.game.black_id;
      const wasWaiting = !previousWhiteId || !previousBlackId;
      
      if (wasWaiting && bothJoined) {
        // Принудительно обновляем ходы после присоединения второго игрока
        // Важно: это должно произойти ДО того, как пользователь попытается сделать ход
        updateLegalMoves();
        renderBoard();
        // Показываем уведомление первому игроку
        showToast('Соперник присоединился! Теперь можно начинать игру', 'success');
      }
      // Если это был ход (move_made), убеждаемся что все обновлено
      if (payload.type === 'move_made') {
        // Принудительно обновляем ходы после хода противника
        // Это важно, так как next_turn изменился
        updateLegalMoves();
        renderBoard();
      }
    }
  }

  async function joinGame(autoTriggered = false) {
    if (!state.matchId) return;
    if (!state.currentUser) {
      if (autoTriggered) {
        if (!state.loginPromptShown) {
          state.loginPromptShown = true;
          showToast('Войдите, чтобы занять место соперника', 'error');
        }
      } else {
        showToast('Войдите в аккаунт, чтобы присоединиться', 'error');
      }
      return;
    }
    state.autoJoinAttempted = true;
    try {
      const res = await authedFetch(gameJoinPath(state.matchId), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      connectWebSocket(state.matchId);
      showToast('Вы присоединились к партии', 'success');
    } catch (err) {
      console.error(err);
      showToast('Не удалось присоединиться к партии', 'error');
    }
  }

  async function resignGame() {
    if (!state.matchId) return;
    if (!state.currentUser) {
      showToast('Войдите в аккаунт, чтобы сдаться', 'error');
      return;
    }
    if (!confirm('Подтвердите сдачу партии')) return;
    try {
      const res = await authedFetch(gameResignPath(state.matchId), { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      showToast('Вы сдались в партии', 'success');
    } catch (err) {
      console.error(err);
      showToast('Не удалось сдаться в партии', 'error');
    }
  }

  async function declareTimeout(event) {
    event.preventDefault();
    if (!state.matchId) return;
    if (!state.currentUser) {
      showToast('Войдите в аккаунт, чтобы заявить флаг', 'error');
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      showToast('Заявлять флаг могут только участники партии', 'error');
      return;
    }
    const loser = role === 'white' ? 'black' : 'white';
    try {
      const res = await authedFetch(gameTimeoutPath(state.matchId), {
        method: 'POST',
        body: JSON.stringify({ loser_color: loser }),
      });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      showToast('Партия завершена по времени', 'success');
    } catch (err) {
      console.error(err);
      showToast('Не удалось завершить партию по времени', 'error');
    }
  }

  function computeClocksAfterMove() {
    if (!state.game) return null;
    const base = getDisplayedClocks(true);
    if (!base) return null;
    const increment = state.game.time_control?.increment_ms || 0;
    if (state.game.next_turn === 'w') {
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

  function attemptMove(baseUci, promotion) {
    if (!state.game || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
      showToast('Вебсокет не подключен', 'error');
      return false;
    }
    if (state.pendingMove) {
      showToast('Дождитесь подтверждения предыдущего хода', 'error');
      return false;
    }
    const role = getCurrentUserRole();
    if (!role) {
      showToast('Ходы могут делать только участники партии', 'error');
      return false;
    }
    // Разрешаем ходы если игра ACTIVE или оба игрока присоединились (даже в CREATED)
    const bothPlayersJoined = state.game.white_id !== null && state.game.white_id !== undefined &&
                              state.game.black_id !== null && state.game.black_id !== undefined;
    
    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      showToast('Партия не активна. Дождитесь присоединения соперника', 'error');
      return false;
    }
    
    if (!bothPlayersJoined) {
      showToast('Дождитесь присоединения соперника', 'error');
      return false;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      showToast('Сейчас очередь соперника', 'error');
      return false;
    }
    const normalizedPromotion = promotion ? promotion.toLowerCase() : null;
    if (normalizedPromotion && !['q', 'r', 'b', 'n'].includes(normalizedPromotion)) {
      showToast('Символ промоции должен быть q, r, b или n', 'error');
      return false;
    }
    const normalizedUci = baseUci.toLowerCase();
    const uciForValidation = normalizedPromotion
      ? `${normalizedUci}${normalizedPromotion}`
      : normalizedUci;
    const moveUtils = window.ChessMoveUtils;
    if (moveUtils) {
      const fen = state.game.current_pos;
      if (!moveUtils.isMoveAllowed(fen, role, uciForValidation)) {
        showToast('Недопустимый ход для ваших фигур', 'error');
        return false;
      }
    }
    const clocks = computeClocksAfterMove();
    if (!clocks) {
      showToast('Не удалось вычислить таймеры', 'error');
      return false;
    }
    const payload = {
      type: 'make_move',
      uci: normalizedUci,
      promotion: normalizedPromotion,
      white_clock_ms: Math.round(clocks.white),
      black_clock_ms: Math.round(clocks.black),
      client_move_id: `web-${Date.now()}`,
    };
    state.ws.send(JSON.stringify(payload));
    state.pendingMove = true;
    resetSelection();
    renderBoard();
    return true;
  }

  function handleMoveSubmit(event) {
    event.preventDefault();
    const uciInput = document.getElementById('uciInput');
    const promotionInput = document.getElementById('promotionInput');
    const rawUci = (uciInput?.value || '').trim().toLowerCase();
    let promotion = (promotionInput?.value || '').trim().toLowerCase();
    if (rawUci.length < 4) {
      showToast('Введите ход в формате UCI', 'error');
      return;
    }
    const baseUci = rawUci.slice(0, 4);
    if (!promotion && rawUci.length > 4) {
      promotion = rawUci.slice(4);
    }
    if (attemptMove(baseUci, promotion)) {
    if (uciInput) uciInput.value = '';
    if (promotionInput) promotionInput.value = '';
    }
  }

  function handleLoginRedirect() {
    window.location.href = '/login.html';
  }

  function handleRegisterRedirect() {
    window.location.href = '/register.html';
  }

  function handleLogout() {
    clearTokens();
    state.currentUser = null;
    updateAuthPanel();
    showToast('Вы вышли из аккаунта');
  }

  function loadTheme() {
    // Всегда используем единый ключ 'theme' для загрузки
    const saved = localStorage.getItem('theme');
    isDarkTheme = saved === 'dark';
    document.body.classList.toggle('dark', isDarkTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
  }

  function toggleTheme() {
    // Всегда используем единый ключ 'theme' для сохранения
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark', isDarkTheme);
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

  async function init() {
    loadTheme();
    handleHeaderScroll();
    window.addEventListener('scroll', handleHeaderScroll, { passive: true });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) closeMobileMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileMenu();
    });

    document.getElementById('flipBoardBtn')?.addEventListener('click', () => {
      toggleBoardOrientation();
    });
    document.getElementById('copyMatchLinkBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('copyGameIdBtn')?.addEventListener('click', copyGameId);
    document.getElementById('backToGamesBtn')?.addEventListener('click', () => {
      window.location.href = '/games';
    });
    document.getElementById('moveForm')?.addEventListener('submit', handleMoveSubmit);

    document.getElementById('gamesLoginBtn')?.addEventListener('click', handleLoginRedirect);
    document.getElementById('gamesRegisterBtn')?.addEventListener('click', handleRegisterRedirect);
    document.getElementById('gamesLogoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('gamesLoginBtnMobile')?.addEventListener('click', () => {
      handleLoginRedirect();
      closeMobileMenu();
    });
    document.getElementById('gamesRegisterBtnMobile')?.addEventListener('click', () => {
      handleRegisterRedirect();
      closeMobileMenu();
    });
    document.getElementById('gamesLogoutBtnMobile')?.addEventListener('click', () => {
      handleLogout();
      closeMobileMenu();
    });

    state.matchId = parseMatchId();
    if (!state.matchId) {
      setMessageVisible(true, 'Не удалось найти ID партии в URL. Проверьте ссылку.');
      renderBoard();
      return;
    }

    await fetchCurrentUser();
    await loadMatch();
  }

  // Экспортируем локальную функцию toggleTheme
  // Она будет использовать глобальную из auth.js, если доступна
  window.toggleTheme = toggleTheme;
  window.toggleMobileMenu = toggleMobileMenu;
  window.closeMobileMenu = closeMobileMenu;

  document.addEventListener('DOMContentLoaded', init);
})();
