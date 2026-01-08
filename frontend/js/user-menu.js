// frontend/js/user-menu.js
class UserMenu {
  constructor() {
    this.user = null;
    this.init();
  }

  async init() {
    // Try localStorage first for instant render
    const cached = localStorage.getItem('user');
    if (cached) {
      this.user = JSON.parse(cached);
      this.render();
    }

    // Verify with server
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.user = data.user;
        localStorage.setItem('user', JSON.stringify(this.user));
        this.render();
      } else {
        // Not authenticated - redirect to login
        localStorage.removeItem('user');
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  }

  render() {
    // Find or create container
    let container = document.getElementById('user-menu');
    if (!container) {
      container = document.createElement('div');
      container.id = 'user-menu';
      // Insert into header - adjust selector as needed
      const header = document.querySelector('.header-right') || document.querySelector('header');
      if (header) header.appendChild(container);
    }

    const isAdmin = this.user?.role === 'admin';

    container.innerHTML = `
      <div class="user-menu-wrapper">
        <button class="user-menu-trigger" id="userMenuTrigger">
          <span class="user-avatar">${this.getInitials()}</span>
          <span class="user-name">${this.user?.name || 'User'}</span>
          <i class="fas fa-chevron-down"></i>
        </button>
        <div class="user-menu-dropdown" id="userMenuDropdown">
          <div class="user-menu-header">
            <strong>${this.user?.name}</strong>
            <span class="user-role">${this.user?.role}</span>
          </div>
          <div class="user-menu-divider"></div>
          ${isAdmin ? `<a href="/admin.html" class="user-menu-item"><i class="fas fa-users-cog"></i> User Management</a>` : ''}
          <button class="user-menu-item" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  getInitials() {
    if (!this.user?.name) return '?';
    return this.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  attachListeners() {
    const trigger = document.getElementById('userMenuTrigger');
    const dropdown = document.getElementById('userMenuDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      dropdown?.classList.remove('show');
    });

    logoutBtn?.addEventListener('click', () => this.logout());
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

// Auto-init
window.userMenu = new UserMenu();
