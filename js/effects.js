/* effects.js — Ripple, contadores, tema/acento, navegación suave */
const Effects = (() => {

  function init() {
    bindRipple();
    bindCounter();
    loadPreferences();
    bindAccentPicker();
    new MutationObserver(bindCounter).observe(document.getElementById('view'), {childList:true,subtree:true});
  }

  /* Ripple en botones */
  function bindRipple() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size/2;
      const y = e.clientY - rect.top - size/2;
      const r = document.createElement('span');
      r.className = 'ripple';
      r.style.width = r.style.height = size + 'px';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      btn.appendChild(r);
      setTimeout(() => r.remove(), 650);
    });
  }

  /* Animar números */
  function bindCounter() {
    document.querySelectorAll('.stat-value').forEach(el => {
      if (el._counted) return;
      el._counted = true;
      const txt = el.textContent;
      const match = txt.match(/[\d.,]+/);
      if (!match) return;
      const final = match[0];
      const num = parseFloat(final.replace(/,/g,''));
      if (isNaN(num) || num === 0) return;
      const prefix = txt.slice(0, match.index);
      const suffix = txt.slice(match.index + final.length);
      let cur = 0;
      const steps = 30;
      const step = num / steps;
      const isDecimal = final.includes('.');
      const tick = () => {
        cur += step;
        if (cur >= num) {
          el.textContent = prefix + final + suffix;
          return;
        }
        el.textContent = prefix + (isDecimal ? cur.toFixed(2) : Math.floor(cur).toLocaleString('es-NI')) + suffix;
        requestAnimationFrame(tick);
      };
      el.textContent = prefix + '0' + suffix;
      setTimeout(tick, 100);
    });
  }

  /* Preferencias guardadas */
  function loadPreferences() {
    const theme = localStorage.getItem('hotel_theme') || 'light';
    const accent = localStorage.getItem('hotel_accent') || 'gold';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    document.querySelectorAll('.accent-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.accent === accent));
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️ Tema claro' : '🌙 Tema oscuro';
  }

  /* Selector de acento */
  function bindAccentPicker() {
    document.querySelectorAll('.accent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const accent = btn.dataset.accent;
        document.documentElement.dataset.accent = accent;
        localStorage.setItem('hotel_accent', accent);
        document.querySelectorAll('.accent-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.accent === accent));
        Utils.toast(`Acento: ${accent}`, 'success');
      });
    });
  }

  return { init };
})();
