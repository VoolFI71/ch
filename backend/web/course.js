// Course page script: load lessons for courseId from query

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getCourseId() {
  // Prefer pretty path: /course/{id}
  const m = window.location.pathname.match(/\/course\/(\d+)/);
  if (m) return m[1];
  return getQueryParam('courseId');
}

function renderLessonItem(lesson) {
  const item = document.createElement('div');
  item.className = 'lesson-item';
  item.style.display = 'flex';
  item.style.justifyContent = 'space-between';
  item.style.alignItems = 'center';
  item.style.border = '1px solid var(--border-light)';
  item.style.borderRadius = '1rem';
  item.style.padding = '1rem';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '0.75rem';
  left.innerHTML = `<i class="fas fa-play"></i> <strong>${lesson.title}</strong>`;

  const right = document.createElement('div');
  right.style.color = 'var(--muted)';
  const mins = Math.max(1, Math.round((lesson.duration_sec || 0) / 60));
  right.textContent = `${mins} мин`;

  item.appendChild(left);
  item.appendChild(right);
  return item;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const courseId = getCourseId();
    if (courseId) {
      document.body.classList.add('view-course');
      const catalog = document.getElementById('catalog');
      if (catalog) catalog.style.display = 'none';
      const hero = document.querySelector('.hero');
      if (hero) hero.style.display = 'none';
      const lessonsSection = document.getElementById('course-lessons');
      if (lessonsSection) lessonsSection.style.display = '';
    }

    const me = await apiFetch('/api/auth/me');
    if (!me.ok || !courseId) return;

    const res = await apiFetch(`/api/courses/${courseId}/lessons/`);
    if (!res.ok) return;
    const lessons = await res.json();

    const container = document.getElementById('lessonsList');
    if (!container) return;
    container.innerHTML = '';
    if (!lessons.length) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--muted)';
      empty.style.padding = '1rem 0';
      empty.textContent = 'Пока нет уроков';
      container.appendChild(empty);
      return;
    }
    lessons.forEach(l => container.appendChild(renderLessonItem(l)));
  } catch (e) {
    console.error('Course page load failed:', e);
  }
});


