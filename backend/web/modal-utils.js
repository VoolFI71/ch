(function () {
  let modalScrollPosition = 0;

  function lockScroll() {
    modalScrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${modalScrollPosition}px`;
    document.body.style.width = '100%';
  }

  function unlockScroll() {
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, modalScrollPosition || 0);
  }

  function updateBodyScrollLock() {
    const hasActiveModal = document.querySelector('.modal.active') !== null;
    if (hasActiveModal) lockScroll();
    else unlockScroll();
  }

  function openModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) return null;
    modal.classList.add('active');
    updateBodyScrollLock();
    if (typeof options.onOpen === 'function') {
      options.onOpen(modal);
    }
    return modal;
  }

  function closeModal(modalId) {
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    } else {
      document.querySelectorAll('.modal.active').forEach((modal) => modal.classList.remove('active'));
    }
    updateBodyScrollLock();
  }

  function showLoginModal() {
    return openModal('loginModal');
  }

  function closeLoginModal() {
    closeModal('loginModal');
  }

  function showRegisterModal() {
    return openModal('registerModal');
  }

  function closeRegisterModal() {
    closeModal('registerModal');
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.classList && target.classList.contains('modal')) {
      target.classList.remove('active');
      updateBodyScrollLock();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  window.modalUtils = {
    openModal,
    closeModal,
    updateBodyScrollLock,
  };

  window.showModal = openModal;
  window.closeModal = closeModal;
  window.showLoginModal = showLoginModal;
  window.closeLoginModal = closeLoginModal;
  window.showRegisterModal = showRegisterModal;
  window.closeRegisterModal = closeRegisterModal;
})();



