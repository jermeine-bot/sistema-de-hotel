/* app.js — Orquestador principal */

const App = (() => {

  async function init() {
    await DB.init();

    if (Auth.isLogged()) {
      mostrarApp();
    } else {
      mostrarLogin();
    }

    bindLogin();
    bindLogout();
    bindMenuToggle();
    bindThemeToggle();
    iniciarReloj();

    if (typeof Particles !== 'undefined') Particles.init();
    if (typeof Effects !== 'undefined') Effects.init();
    if (typeof Palette !== 'undefined') Palette.init();
  }

  function mostrarLogin() {
    document.getElementById('login-screen')?.classList.remove('hidden');
    document.getElementById('app')?.classList.add('hidden');
    setTimeout(() => typeof Particles !== 'undefined' && Particles.init(), 50);
  }

  function mostrarApp() {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    if (typeof Particles !== 'undefined') Particles.stop();
    aplicarConfig();
    Router.init();
  }

  function aplicarConfig() {
    const cfg = DB.all().config || {};
    const user = Auth.currentUser();
    const bn = document.getElementById('brand-name');
    const bu = document.getElementById('brand-user');
    if (bn) bn.textContent = cfg.nombre || 'Hotel PMS';
    if (bu) bu.textContent = user?.nombre || 'Administrador';
    document.title = (cfg.nombre || 'Hotel PMS') + ' · PMS';
  }

  function bindLogin() {
    const form = document.getElementById('login-form');
    if (!form || form._bound) return;
    form._bound = true;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const u = document.getElementById('login-user').value.trim();
      const p = document.getElementById('login-pass').value;
      const err = document.getElementById('login-error');
      const btn = form.querySelector('button[type="submit"]');
      const loader = btn.querySelector('.btn-loader');
      const txt = btn.querySelector('.btn-text');
      loader.classList.remove('hidden');
      txt.style.opacity = '.5';
      setTimeout(() => {
        const res = Auth.login(u, p);
        loader.classList.add('hidden');
        txt.style.opacity = '1';
        if (!res.ok) {
          err.textContent = res.error;
          err.style.display = 'block';
          return;
        }
        err.style.display = 'none';
        form.reset();
        mostrarApp();
        Utils.toast(`Bienvenido, ${res.user.nombre} 👋`, 'success');
      }, 400);
    });
  }

  function bindLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      Utils.confirm('¿Cerrar sesión?', () => {
        Auth.logout();
        location.hash = '';
        location.reload();
      });
    });
  }

  function bindMenuToggle() {
    const btn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (window.innerWidth > 900) return;
      if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  function bindThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      const actual = document.documentElement.dataset.theme;
      const next = actual === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('hotel_theme', next);
      btn.textContent = next === 'dark' ? '☀️ Tema claro' : '🌙 Tema oscuro';
      Utils.toast(next === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado', 'info', 1500);
    });
  }

  function iniciarReloj() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = () => {
      const d = new Date();
      el.textContent = d.toLocaleString('es-NI', {
        day:'2-digit', month:'short', year:'numeric',
        hour:'2-digit', minute:'2-digit'
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  return { init, mostrarApp, mostrarLogin };
})();
