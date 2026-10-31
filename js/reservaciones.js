/* ============================================================
   reservaciones.js — Reservas con validación de solapamiento
   ============================================================ */

const Reservaciones = (() => {

  function render() {
    const el = document.getElementById('view');
    const cfg = DB.all().config || {};
    const lista = DB.get('reservaciones').slice().reverse();

    el.innerHTML = `
      <div class="toolbar">
        <input id="res-buscar" class="input" placeholder="Buscar…">
        <select id="res-filtro" class="input">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmada">Confirmada</option>
          <option value="checkin">Check-in</option>
          <option value="checkout">Check-out</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <button class="btn btn-primary" id="res-nueva">+ Nueva reservación</button>
      </div>
      <div class="panel">
        <div class="panel-body">
          <div id="res-tabla"></div>
        </div>
      </div>
    `;

    document.getElementById('res-nueva').addEventListener('click', () => form(null));
    document.getElementById('res-buscar').addEventListener('input', Utils.debounce(filtrar, 200));
    document.getElementById('res-filtro').addEventListener('change', filtrar);
    filtrar();

    function filtrar() {
      const q = document.getElementById('res-buscar').value.trim().toLowerCase();
      const estado = document.getElementById('res-filtro').value;
      const filtradas = lista.filter(r => {
        if (estado && r.estado !== estado) return false;
        if (q) {
          const g = DB.find('huespedes', r.huespedId);
          const h = DB.find('habitaciones', r.habitacionId);
          return [g?.nombre, h?.numero, String(r.id)]
            .some(v => String(v || '').toLowerCase().includes(q));
        }
        return true;
      });

      const cont = document.getElementById('res-tabla');
      if (!filtradas.length) { cont.innerHTML = '<div class="empty">Sin reservaciones</div>'; return; }
      cont.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>#</th><th>Huésped</th><th>Habitación</th>
            <th>Entrada</th><th>Salida</th><th>Total</th>
            <th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${filtradas.map(r => {
              const g = DB.find('huespedes', r.huespedId);
              const h = DB.find('habitaciones', r.habitacionId);
              return `<tr>
                <td>${r.id}</td>
                <td>${Utils.esc(g?.nombre || '—')}</td>
                <td>Hab. ${Utils.esc(h?.numero || '—')}</td>
                <td>${Utils.formatDate(r.fechaIn)}</td>
                <td>${Utils.formatDate(r.fechaOut)}</td>
                <td>${Utils.money(r.total, cfg.simboloMoneda)}</td>
                <td>${Utils.badgeReservacion(r.estado)}</td>
                <td class="acciones">
                  <button class="btn btn-sm" data-edit="${r.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${r.id}">🗑️</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;

      cont.querySelectorAll('[data-edit]').forEach(b =>
        b.addEventListener('click', () => form(Number(b.dataset.edit)))
      );
      cont.querySelectorAll('[data-del]').forEach(b =>
        b.addEventListener('click', () => eliminar(Number(b.dataset.del)))
      );
    }
  }

  function form(id) {
    const r = id ? DB.find('reservaciones', id) : null;
    const hoy = Utils.todayISO();
    const cfg = DB.all().config || {};
    const titulo = r ? 'Editar reservación' : 'Nueva reservación';

    const body = `
      <form id="res-form" class="form-grid">
        <div class="form-group form-full">
          <label>Huésped *</label>
          ${Huespedes.selector(r?.huespedId, true)}
        </div>
        <div class="form-group">
          <label>Fecha de entrada *</label>
          <input type="date" class="input" name="fechaIn" value="${r?.fechaIn?.slice(0,10) || hoy}" required>
        </div>
        <div class="form-group">
          <label>Fecha de salida *</label>
          <input type="date" class="input" name="fechaOut" value="${r?.fechaOut?.slice(0,10) || hoy}" required>
        </div>
        <div class="form-group">
          <label>Habitación *</label>
          <select class="input" name="habitacionId" required>
            <option value="">— Seleccionar —</option>
            ${DB.get('habitaciones').filter(h => h.estado !== 'fuera_servicio' && h.estado !== 'mantenimiento')
              .map(h => `<option value="${h.id}" ${Number(r?.habitacionId) === h.id ? 'selected' : ''}>
                ${Utils.esc(h.numero)} — ${Utils.money(h.precioNoche, cfg.simboloMoneda)}
              </option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>N° huéspedes</label>
          <input type="number" min="1" class="input" name="numHuespedes" value="${r?.numHuespedes || 1}">
        </div>
        <div class="form-group">
          <label>Descuento (${cfg.simboloMoneda})</label>
          <input type="number" min="0" step="0.01" class="input" name="descuento" value="${r?.descuento || 0}">
        </div>
        <div class="form-group">
          <label>Anticipo (${cfg.simboloMoneda})</label>
          <input type="number" min="0" step="0.01" class="input" name="anticipo" value="${r?.anticipo || 0}">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select class="input" name="estado">
            ${['pendiente','confirmada','checkin','checkout','cancelada','no_show']
              .map(e => `<option value="${e}" ${r?.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-full">
          <label>Observaciones</label>
          <textarea class="input" name="observaciones" rows="2">${Utils.esc(r?.observaciones || '')}</textarea>
        </div>
        <div class="form-group form-full">
          <div id="res-resumen" class="resumen"></div>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="res-guardar">Guardar</button>
    `;

    const m = Utils.modal({ title: titulo, body, footer, size: 'md' });
    const form = m.el.querySelector('#res-form');

    const actualizarResumen = () => {
      const fd = new FormData(form);
      const hab = DB.find('habitaciones', fd.get('habitacionId'));
      const noches = Utils.nightsBetween(fd.get('fechaIn'), fd.get('fechaOut'));
      const subtotal = hab ? noches * hab.precioNoche : 0;
      const desc = Number(fd.get('descuento')) || 0;
      const impuesto = cfg.impuesto || 0;
      const base = subtotal - desc;
      const imp = base * impuesto / 100;
      const total = base + imp;
      m.el.querySelector('#res-resumen').innerHTML = `
        <strong>Resumen:</strong>
        ${noches} noche(s) × ${Utils.money(hab?.precioNoche || 0, cfg.simboloMoneda)} =
        ${Utils.money(subtotal, cfg.simboloMoneda)}<br>
        Descuento: -${Utils.money(desc, cfg.simboloMoneda)}<br>
        Impuesto (${impuesto}%): ${Utils.money(imp, cfg.simboloMoneda)}<br>
        <strong>Total: ${Utils.money(total, cfg.simboloMoneda)}</strong>
      `;
    };

    form.querySelectorAll('input,select').forEach(i => i.addEventListener('input', actualizarResumen));
    form.querySelectorAll('input,select').forEach(i => i.addEventListener('change', actualizarResumen));
    actualizarResumen();

    m.el.querySelector('#res-guardar').addEventListener('click', () => {
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const habId = Number(fd.get('habitacionId'));
      const fIn = fd.get('fechaIn');
      const fOut = fd.get('fechaOut');

      if (Utils.nightsBetween(fIn, fOut) <= 0) {
        Utils.toast('La fecha de salida debe ser posterior a la de entrada', 'error'); return;
      }
      if (!DB.estaDisponible(habId, fIn, fOut, r?.id)) {
        Utils.toast('La habitación ya tiene una reserva en ese rango', 'error'); return;
      }

      const hab = DB.find('habitaciones', habId);
      const noches = Utils.nightsBetween(fIn, fOut);
      const subtotal = noches * hab.precioNoche;
      const desc = Number(fd.get('descuento')) || 0;
      const base = subtotal - desc;
      const imp = base * (cfg.impuesto || 0) / 100;
      const total = base + imp;

      const data = {
        huespedId: Number(fd.get('huespedId')),
        habitacionId: habId,
        fechaIn: fIn,
        fechaOut: fOut,
        numHuespedes: Number(fd.get('numHuespedes')),
        descuento: desc,
        anticipo: Number(fd.get('anticipo')) || 0,
        estado: fd.get('estado'),
        subtotal, impuesto: imp, total,
        observaciones: fd.get('observaciones').trim()
      };

      if (r) DB.update('reservaciones', r.id, data);
      else DB.insert('reservaciones', data);

      Utils.toast(r ? 'Reservación actualizada' : 'Reservación creada', 'success');
      m.close();
      render();
    });
  }

  function eliminar(id) {
    Utils.confirm('¿Eliminar esta reservación?', () => {
      DB.remove('reservaciones', id);
      Utils.toast('Reservación eliminada', 'success');
      render();
    }, { danger: true });
  }

  return { render, form };
})();
