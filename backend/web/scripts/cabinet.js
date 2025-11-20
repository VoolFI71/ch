// Populate cabinet with owned and locked courses

const usernameCache = new Map();
const pendingUsernameRequests = new Map();
const historyState = {
  loading: false,
  loaded: false,
  items: [],
  error: null,
  pageSize: 10,
  hasMore: true,
};
let currentUser = null;
let historyObserver = null;

function createCourseCard(course, owned) {
  const card = document.createElement('div');
  card.className = 'course-card';

  const header = document.createElement('div');
  header.className = 'course-header';

  const info = document.createElement('div');
  info.className = 'course-info';

  const title = document.createElement('div');
  title.className = 'course-title';
  const icon = document.createElement('div');
  icon.className = 'course-icon';
  icon.innerHTML = '<i class="fas fa-chess-pawn"></i>';
  const span = document.createElement('span');
  span.textContent = course.title || course.slug;
  title.appendChild(icon);
  title.appendChild(span);

  const desc = document.createElement('p');
  desc.className = 'course-description';
  desc.textContent = course.description || '';

  info.appendChild(title);
  info.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'course-meta';
  const pill = document.createElement('span');
  pill.className = 'badge-pill';
  pill.textContent = owned ? 'Доступ открыт' : 'Недоступно';
  meta.appendChild(pill);
  const chevron = document.createElement('i');
  chevron.className = 'fas fa-chevron-down expand-icon';
  meta.appendChild(chevron);

  header.appendChild(info);
  header.appendChild(meta);

  const body = document.createElement('div');
  body.className = 'course-body';
  const content = document.createElement('div');
  content.className = 'course-content';
  if (owned) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Открыть курс';
    btn.style.marginTop = '1rem';
    btn.onclick = () => {
      window.location.href = `/course/${course.id}`;
    };
    content.appendChild(btn);
  } else {
    const lock = document.createElement('div');
    lock.style.color = 'var(--muted)';
    lock.style.display = 'flex';
    lock.style.alignItems = 'center';
    lock.style.gap = '0.5rem';
    lock.innerHTML = '<i class="fas fa-lock"></i> Доступ отсутствует';
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.marginTop = '1rem';
    btn.textContent = 'Перейти к покупке';
    btn.onclick = () => window.location.href = '/#courses';
    content.appendChild(lock);
    content.appendChild(btn);
  }
  body.appendChild(content);

  card.appendChild(header);
  card.appendChild(body);

  header.onclick = () => card.classList.toggle('expanded');

  return card;
}

function renderEmptyState(container, text) {
  const wrap = document.createElement('div');
  wrap.style.color = 'var(--muted-foreground)';
  wrap.style.padding = '1rem 0';
  wrap.textContent = text;
  container.appendChild(wrap);
}

const translateStatus = (status) =>
  ({
    CREATED: 'Ожидает соперника',
    ACTIVE: 'Идёт партия',
    FINISHED: 'Завершена',
    PAUSED: 'Пауза',
  }[status] || 'Неизвестно');

const describeTermination = (reason) =>
  ({
    CHECKMATE: 'Мат',
    RESIGNATION: 'Сдача',
    TIMEOUT: 'По времени',
  }[reason] || null);

const describeTimeControl = (settings) => {
  if (!settings) return 'Без контроля';
  const initialMs = Number(settings.initial_ms ?? 0);
  const incrementMs = Number(settings.increment_ms ?? 0);
  const minutes = Math.round(initialMs / 60000);
  const increment = Math.round(incrementMs / 1000);
  const minutesLabel = minutes > 0 ? `${minutes} мин` : `${Math.max(Math.round(initialMs / 1000), 0)} с`;
  const incrementLabel = increment > 0 ? ` +${increment} с` : '';
  return `${minutesLabel}${incrementLabel}`;
};

const formatDate = (value) => {
  if (!value) return 'Дата неизвестна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const usernameFromCache = (id) => {
  if (id === null || id === undefined) return null;
  const key = Number(id);
  return usernameCache.has(key) ? usernameCache.get(key) : null;
};

async function fetchUsername(id) {
  if (id === null || id === undefined) return null;
  const key = Number(id);
  if (usernameCache.has(key)) return usernameCache.get(key);
  if (pendingUsernameRequests.has(key)) return pendingUsernameRequests.get(key);

  const request = (async () => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('Failed to load user');
      const data = await res.json();
      const username = data?.username || data?.display_name || null;
      usernameCache.set(key, username);
      return username;
    } catch {
      usernameCache.set(key, null);
      return null;
    } finally {
      pendingUsernameRequests.delete(key);
    }
  })();

  pendingUsernameRequests.set(key, request);
  return request;
}

async function warmUsernamesForGames(games) {
  const ids = new Set();
  games.forEach((game) => {
    if (!game) return;
    if (game.white_id !== null && game.white_id !== undefined) ids.add(Number(game.white_id));
    if (game.black_id !== null && game.black_id !== undefined) ids.add(Number(game.black_id));
  });
  if (!ids.size) return;
  await Promise.all(Array.from(ids).map((id) => fetchUsername(id)));
}

const playerLabel = (id) => {
  if (id === null || id === undefined) return 'Неизвестно';
  if (currentUser && currentUser.id === id) {
    return currentUser.username ? `Вы (${currentUser.username})` : 'Вы';
  }
  const cached = usernameFromCache(id);
  if (cached) return cached;
  return `ID ${id}`;
};

const getPlayerColor = (game) => {
  if (!currentUser) return null;
  if (game.white_id === currentUser.id) return 'white';
  if (game.black_id === currentUser.id) return 'black';
  return null;
};

const getOpponentId = (game) => {
  const color = getPlayerColor(game);
  if (color === 'white') return game.black_id;
  if (color === 'black') return game.white_id;
  return null;
};

const describeResult = (game) => {
  const color = getPlayerColor(game);
  if (!game.result || game.status !== 'FINISHED' || !color) {
    return { label: 'Партия не завершена', className: 'pending' };
  }
  if (game.result === '1/2-1/2') {
    return { label: 'Ничья', className: 'draw' };
  }
  const isWhiteWin = game.result === '1-0';
  const didWin = (isWhiteWin && color === 'white') || (!isWhiteWin && color === 'black');
  return {
    label: didWin ? 'Победа' : 'Поражение',
    className: didWin ? 'win' : 'loss',
  };
};

function renderHistoryAuthPrompt() {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;
  container.innerHTML = `
    <div class="history-empty">
      <div style="margin-bottom:0.75rem;">Войдите, чтобы просматривать историю своих партий.</div>
      <button class="btn btn-primary" type="button" onclick="window.showLoginModal && window.showLoginModal()">Войти</button>
    </div>
  `;
}

function renderMatchHistory() {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;

  if (!historyState.items.length) {
    container.innerHTML = `
      <div class="history-empty">
        <i class="fas fa-chess-knight" style="margin-right:0.5rem;"></i>
        У вас пока нет сыгранных партий
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  historyState.items.forEach((game) => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const result = describeResult(game);
    const color = getPlayerColor(game);
    const colorLabel = color === 'white' ? 'Белыми' : color === 'black' ? 'Чёрными' : '—';
    const opponent = getOpponentId(game);
    const termination = describeTermination(game.termination_reason);
    const matchDate = formatDate(game.finished_at || game.started_at || game.created_at);

    card.innerHTML = `
      <div class="history-card-top">
        <div class="history-result ${result.className}">
          <i class="fas fa-flag-checkered"></i>
          ${result.label}
        </div>
        <div class="history-date">${matchDate}</div>
      </div>
      <div class="history-players">
        <span class="color-pill ${color || ''}">${colorLabel}</span>
        <span style="opacity:0.6;">против</span>
        <span class="opponent-name">${playerLabel(opponent)}</span>
      </div>
      <div class="history-meta">
        <span><i class="fas fa-stopwatch"></i> ${describeTimeControl(game.time_control)}</span>
        <span><i class="fas fa-list-ol"></i> Ходов: ${game.move_count}</span>
        <span><i class="fas fa-info-circle"></i> ${translateStatus(game.status)}</span>
        ${termination ? `<span><i class="fas fa-skull-crossbones"></i> ${termination}</span>` : ''}
      </div>
      <div class="history-actions">
        <button class="btn btn-primary" type="button" onclick="window.location.href='/match/${game.id}'">
          <i class="fas fa-eye"></i>
          Смотреть партию
        </button>
        <button class="btn btn-outline" type="button" onclick="window.copyMatchLink && window.copyMatchLink('${game.id}')">
          <i class="fas fa-link"></i>
          Скопировать ссылку
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

async function loadMatchHistory() {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;
  if (!currentUser) {
    renderHistoryAuthPrompt();
    return;
  }

  const limit = Number(container.dataset.limit || 50);
  historyState.loading = true;
  historyState.error = null;
  container.innerHTML = `
    <div class="history-empty">
      <i class="fas fa-spinner fa-spin" style="margin-right:0.5rem;"></i>
      Загружаем историю партий...
    </div>
  `;

  try {
    const res = await apiFetch(`/api/games/history/me?limit=${Math.min(Math.max(limit, 1), 200)}`);
    if (!res.ok) throw new Error(await res.text());
    historyState.items = await res.json();
    historyState.loaded = true;
    await warmUsernamesForGames(historyState.items);
    renderMatchHistory();
  } catch (error) {
    console.error('Failed to load match history:', error);
    historyState.error = error;
    container.innerHTML = `
      <div class="history-empty error">
        <div>Не удалось загрузить историю партий</div>
        <button class="btn btn-primary" style="margin-top:1rem;" type="button" onclick="window.ensureMatchHistoryLoaded(true)">
          Попробовать снова
        </button>
      </div>
    `;
  } finally {
    historyState.loading = false;
  }
}

async function ensureMatchHistoryLoaded(force = false) {
  if (force) {
    historyState.loaded = false;
  }
  if (historyState.loading || historyState.loaded) return;
  await loadMatchHistory();
}

window.ensureMatchHistoryLoaded = ensureMatchHistoryLoaded;
window.copyMatchLink = function copyMatchLink(gameId) {
  const url = `${window.location.origin || ''}/match/${gameId}`;
  if (!navigator.clipboard) {
    window.prompt('Скопируйте ссылку', url);
    return;
  }
  navigator.clipboard
    .writeText(url)
    .then(() => {
      alert('Ссылка скопирована');
    })
    .catch(() => {
      window.prompt('Скопируйте ссылку', url);
    });
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const meRes = await apiFetch('/api/auth/me');
    if (!meRes.ok) {
      renderHistoryAuthPrompt();
      return;
    }
    currentUser = await meRes.json();

    const [allRes, mineRes] = await Promise.all([apiFetch('/api/courses/'), apiFetch('/api/courses/me')]);
    if (!allRes.ok) return;

    const all = await allRes.json();
    const mine = mineRes.ok ? await mineRes.json() : [];
    const ownedIds = new Set((mine || []).map((c) => c.id));

    const ownedContainer = document.getElementById('myCoursesList');
    const lockedContainer = document.getElementById('lockedCoursesList');
    if (!ownedContainer || !lockedContainer) return;

    ownedContainer.innerHTML = '';
    lockedContainer.innerHTML = '';

    if (mine && mine.length) {
      mine.forEach((c) => ownedContainer.appendChild(createCourseCard(c, true)));
    } else {
      renderEmptyState(ownedContainer, 'Пока нет приобретённых курсов');
    }

    const locked = (all || []).filter((c) => !ownedIds.has(c.id));
    if (locked.length) {
      locked.forEach((c) => lockedContainer.appendChild(createCourseCard(c, false)));
    } else {
      renderEmptyState(lockedContainer, 'Нет недоступных курсов');
    }
  } catch (e) {
    console.error('Cabinet load failed:', e);
  }
});

