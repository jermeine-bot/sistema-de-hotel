/* palette.js — Command Palette (Ctrl+K) */
const Palette = (() => {
  const commands = [
    { label: 'Dashboard', icon: '📊', action: () => Router.go('dashboard') },
    { label: 'Habitaciones', icon: '🛏️', action: () => Router.go('habitaciones') },
    { label: 'Nueva habitación', icon: '➕', action: () => { Router.go('habitaciones'); setTimeout(() => Habitaciones.form(null), 100); } },
    { label: 'Reservaciones', icon: '📅', action: () => Router.go('reservaciones') },
    { label: 'Nueva reservación', icon: '➕', action: () => { Router.go('reservaciones'); setTimeout(() => Reservaciones.form(null), 100); } },
    { label: 'Huéspedes', icon: '👥', action: () => Router.go('huespedes') },
    { label: 'Nuevo huésped', icon: '➕', action: () => { Router.go('huespedes'); setTimeout(() => Huespedes.form(null), 100); } },
    { label: 'Check-in / out', icon: '🔑', action: () => Router.go('checkin') },
    { label: 'Caja y pagos', icon: '💰', action: () => Router.go('caja') },
    { label: 'Inventario', icon: '📦', action: () => Router.go('inventario') },
    { label: 'Limpieza', icon: '🧹', action: () => Router.go('limpieza') },
    { label: 'Mantenimiento', icon: '🔧', action: () => Router.go('mantenimiento') },
    { label: 'Reportes', icon: '📈', action: () => Router.go('reportes') },
    { label: 'Configuración', icon: '⚙️', action: () => Router.go('config') },
    { label: 'Cambiar tema', icon: '🌓', action: () => document.getElementById('theme-toggle')?.click() },
    { label: 'Exportar respaldo', icon: '⬇️', action: () => Config.exportarBackup?.() },
  ];

  let el, input, results, selected = 0, filtered = [];

  function init() {
    el = document.getElementById('palette');
    input = document.getElementById('palette-input');
    results = document.getElementById('palette-results');
    if (!el) return;

    document.getElementById('palette-btn')?.addEventListener('click', open);
    el.querySelector('.palette-backdrop')?.addEventListener('click', close);

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        el.classList.contains('hidden') ? open() : close();
      }
      if (e.key === 'Escape' && !el.classList.contains('hidden')) close();
      if (el.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
      if (e.key === 'Enter') { e.preventDefault(); filtered[selected]?.action(); close(); }
    });

    input.addEventListener('input', () => { selected = 0; render(); });
  }

  function open() {
    el.classList.remove('hidden');
    input.value = '';
    input.focus();
    selected = 0;
    render();
  }

  function close() {
    el.classList.add('hidden');
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    filtered = commands.filter(c => c.label.toLowerCase().includes(q));
    if (!filtered.length) {
      results.innerHTML = '<div class="palette-empty">Sin resultados</div>';
      return;
    }
    results.innerHTML = filtered.map((c, i) => `
      <div class="palette-item ${i === selected ? 'active' : ''}" data-idx="${i}">
        <span>${c.icon}</span>
        <span>${c.label}</span>
      </div>
    `).join('');
    results.querySelectorAll('[data-idx]').forEach(d =>
      d.addEventListener('click', () => { filtered[Number(d.dataset.idx)].action(); close(); }));
  }

  return { init };
})();
