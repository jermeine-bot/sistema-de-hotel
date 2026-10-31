/* ============================================================
   utils.js — Helpers globales del sistema
   ============================================================ */

const Utils = (() => {

  /* ---------- IDs ---------- */
  let _idCounter = Date.now();
  function uid() {
    _idCounter++;
    return _idCounter;
  }

  /* ---------- Formato de moneda ---------- */
  function money(amount, simbolo = 'C$') {
    const n = Number(amount) || 0;
    return `${simbolo} ${n.toLocaleString('es-NI', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  /* ---------- Formato de números ---------- */
  function num(n, decimals = 0) {
    return (Number(n) || 0).toLocaleString('es-NI', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /* ---------- Fechas ---------- */
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-NI', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('es-NI', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('es-NI', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  /* ---------- Noches entre dos fechas ---------- */
  function nightsBetween(fechaIn, fechaOut) {
    if (!fechaIn || !fechaOut) return 0;
    const a = new Date(fechaIn);
    const b = new Date(fechaOut);
    if (isNaN(a) || isNaN(b)) return 0;
    const ms = b.setHours(0,0,0,0) - a.setHours(0,0,0,0);
    return Math.max(0, Math.round(ms / 86400000));
  }

  /* ---------- Horas entre dos fechas/horas ---------- */
  function hoursBetween(fechaIn, fechaOut) {
    if (!fechaIn || !fechaOut) return 0;
    const a = new Date(fechaIn);
    const b = new Date(fechaOut);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 3600000 * 10) / 10);
  }

  /* ---------- Solapamiento de rangos ---------- */
  /* Devuelve true si [aIn, aOut) y [bIn, bOut) se cruzan */
  function rangesOverlap(aIn, aOut, bIn, bOut) {
    const a1 = new Date(aIn).getTime();
    const a2 = new Date(aOut).getTime();
    const b1 = new Date(bIn).getTime();
    const b2 = new Date(bOut).getTime();
    if ([a1,a2,b1,b2].some(isNaN)) return false;
    return a1 < b2 && b1 < a2;
  }

  /* ---------- Validaciones ---------- */
  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function isPhone(s) {
    return /^[0-9+\-\s()]{6,20}$/.test(String(s || '').trim());
  }

  function isNotEmpty(s) {
    return String(s ?? '').trim().length > 0;
  }

  function isPositiveNumber(n) {
    const v = Number(n);
    return !isNaN(v) && v >= 0;
  }

  /* ---------- Escape HTML (anti-XSS) ---------- */
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---------- Debounce ---------- */
  function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /* ---------- Deep clone ---------- */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ---------- Slug ---------- */
  function slug(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /* ---------- Toast (notificación flotante) ---------- */
  function toast(msg, type = 'info', ms = 3200) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = `toast show toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${iconFor(type)}</span>
      <span class="toast-msg">${esc(msg)}</span>
    `;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.classList.remove('show');
    }, ms);
  }

  function iconFor(type) {
    return {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    }[type] || 'ℹ️';
  }

  /* ---------- Modal genérico ---------- */
  function modal({ title, body, footer, size = 'md', onClose }) {
    let el = document.getElementById('modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal';
      document.body.appendChild(el);
    }
    el.className = `modal show modal-${size}`;
    el.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>${esc(title || '')}</h3>
          <button class="btn-icon" data-close>✕</button>
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    const close = () => {
      el.classList.remove('show');
      el.innerHTML = '';
      if (typeof onClose === 'function') onClose();
    };

    el.querySelector('[data-close]')?.addEventListener('click', close);
    el.querySelector('.modal-backdrop')?.addEventListener('click', close);
    el.querySelectorAll('[data-modal-close]').forEach(b =>
      b.addEventListener('click', close)
    );

    return { el, close };
  }

  /* ---------- Confirmación ---------- */
  function confirm(message, onYes, opts = {}) {
    const { yesLabel = 'Sí, continuar', noLabel = 'Cancelar', danger = false } = opts;
    return modal({
      title: 'Confirmar',
      size: 'sm',
      body: `<p style="margin:.25rem 0 1rem">${esc(message)}</p>`,
      footer: `
        <button class="btn btn-ghost" data-modal-close>${esc(noLabel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(yesLabel)}</button>
      `,
      onClose: () => {},
    }).el.querySelector('[data-yes]').addEventListener('click', () => {
      document.getElementById('modal')?.classList.remove('show');
      document.getElementById('modal').innerHTML = '';
      onYes?.();
    });
  }

  /* ---------- Descargar archivo ---------- */
  function download(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Leer archivo ---------- */
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  /* ---------- Estado (badge) ---------- */
  function badgeHabitacion(estado) {
    const map = {
      disponible:      { txt: 'Disponible',      cls: 'badge-success' },
      ocupada:         { txt: 'Ocupada',         cls: 'badge-danger'  },
      reservada:       { txt: 'Reservada',       cls: 'badge-info'    },
      sucia:           { txt: 'Sucia',           cls: 'badge-warning' },
      limpieza:        { txt: 'En limpieza',     cls: 'badge-warning' },
      mantenimiento:   { txt: 'Mantenimiento',   cls: 'badge-danger'  },
      fuera_servicio:  { txt: 'Fuera de servicio', cls: 'badge-muted' }
    };
    const b = map[estado] || { txt: estado, cls: 'badge-muted' };
    return `<span class="badge ${b.cls}">${esc(b.txt)}</span>`;
  }

  function badgeReservacion(estado) {
    const map = {
      pendiente:  { txt: 'Pendiente',  cls: 'badge-warning' },
      confirmada: { txt: 'Confirmada', cls: 'badge-info'    },
      checkin:    { txt: 'Check-in',   cls: 'badge-success' },
      checkout:   { txt: 'Check-out',  cls: 'badge-muted'   },
      cancelada:  { txt: 'Cancelada',  cls: 'badge-danger'  },
      no_show:    { txt: 'No presentó',cls: 'badge-muted'   }
    };
    const b = map[estado] || { txt: estado, cls: 'badge-muted' };
    return `<span class="badge ${b.cls}">${esc(b.txt)}</span>`;
  }

  /* ---------- API pública ---------- */
  return {
    uid, money, num,
    todayISO, nowISO,
    formatDate, formatDateTime, formatTime,
    nightsBetween, hoursBetween, rangesOverlap,
    isEmail, isPhone, isNotEmpty, isPositiveNumber,
    esc, debounce, clone, slug,
    toast, modal, confirm,
    download, readFile,
    badgeHabitacion, badgeReservacion
  };
})();
