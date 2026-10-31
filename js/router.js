/* ============================================================
   router.js — Navegación entre vistas (hash-based)
   ============================================================ */

const Router = (() => {
  const routes = {
    dashboard:      { title: 'Dashboard',        render: () => Dashboard.render() },
    habitaciones:   { title: 'Habitaciones',     render: () => Habitaciones.render() },
    reservaciones:  { title: 'Reservaciones',    render: () => Reservaciones.render() },
    huespedes:      { title: 'Huéspedes',        render: () => Huespedes.render() },
    checkin:        { title: 'Check-in / Check-out', render: () => Checkin.render() },
    caja:           { title: 'Caja y Pagos',     render: () => Caja.render() },
    inventario:     { title: 'Inventario',       render: () => Inventario.render() },
    limpieza:       { title: 'Limpieza',         render: () => Limpieza.render() },
    mantenimiento:  { title: 'Mantenimiento',    render: () => Mantenimiento.render() },
    reportes:       { title: 'Reportes',         render: () => Reportes.render() },
    config:         { title: 'Configuración',    render: () => Config.render() },
  };

  function current() {
    const hash = location.hash.replace('#','') || 'dashboard';
    return routes[hash] ? hash : 'dashboard';
  }

  function go(view) {
    if (location.hash === '#' + view) {
      render();
    } else {
      location.hash = '#' + view;
    }
  }

  function render() {
    const view = current();
    const route = routes[view];

    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.view === view);
    });

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = route.title;

    const viewEl = document.getElementById('view');
    if (viewEl) {
      viewEl.innerHTML = '<div class="loader">Cargando…</div>';
      setTimeout(() => {
        try { route.render(); }
        catch(e) {
          console.error(e);
          viewEl.innerHTML = `<div class="empty">Error al cargar la vista: ${Utils.esc(e.message)}</div>`;
        }
      }, 10);
    }

    document.getElementById('sidebar')?.classList.remove('open');
  }

  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { init, go, render, current };
})();
