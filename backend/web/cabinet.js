// Populate cabinet with owned and locked courses

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
    btn.onclick = () => window.location.href = 'index.html#courses';
    content.appendChild(lock);
    content.appendChild(btn);
  }
  body.appendChild(content);

  card.appendChild(header);
  card.appendChild(body);

  // Expand/collapse
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Need auth
    const me = await apiFetch('/api/auth/me');
    if (!me.ok) return;

    const [allRes, mineRes] = await Promise.all([
      apiFetch('/api/courses/'),
      apiFetch('/api/courses/me'),
    ]);
    if (!allRes.ok) return;
    const all = await allRes.json();
    const mine = mineRes.ok ? await mineRes.json() : [];
    const ownedIds = new Set((mine || []).map(c => c.id));

    const ownedContainer = document.getElementById('myCoursesList');
    const lockedContainer = document.getElementById('lockedCoursesList');
    if (!ownedContainer || !lockedContainer) return;

    // Clear containers (in case of hot reload)
    ownedContainer.innerHTML = '';
    lockedContainer.innerHTML = '';

    // Render owned
    if (mine && mine.length) {
      mine.forEach(c => ownedContainer.appendChild(createCourseCard(c, true)));
    } else {
      renderEmptyState(ownedContainer, 'Пока нет приобретённых курсов');
    }

    // Render locked (active but not owned)
    const locked = (all || []).filter(c => !ownedIds.has(c.id));
    if (locked.length) {
      locked.forEach(c => lockedContainer.appendChild(createCourseCard(c, false)));
    } else {
      renderEmptyState(lockedContainer, 'Нет недоступных курсов');
    }
  } catch (e) {
    console.error('Cabinet load failed:', e);
  }
});


