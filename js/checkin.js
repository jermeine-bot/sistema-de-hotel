/* ============================================================
   checkin.js — Check-in y Check-out
   ============================================================ */

const Checkin = (() => {

  function render() {
    const el = document.getElementById('view');
    const cfg = DB.all().config || {};
    const activas = DB.get('estancias').filter(e => e.estado === 'activa');
    const reservasHoy = DB.get('reservaciones').filter(r =>
      ['confirmada','pendiente'].includes(r.estado));

    el.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="chk-entrada">🔑 Registrar Check-in</button>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Estancias activas</h3></div>
        <div class="panel-body">
          ${activas.length === 0 ? '<div class="empty">Sin estancias activas</div>' :
            `<table class="table">
              <thead><tr>
                <th>Hab.</th><th>Huésped</th><th>Entrada</th>
                <th>Salida prev.</th><th>Saldo</th><th></th>
              </tr></thead>
              <tbody>
                ${activas.map(e => {
                  const h = DB.find('habitaciones', e.habitacionId);
                  const g = DB.find('huespedes', e.huespedId);
                  return `<tr>
                    <td>${Utils.esc(h?.numero || '—')}</td>
                    <td>${Utils.esc(g?.nombre || '—')}</td>
                    <td>${Utils.formatDateTime(e.fechaIn)}</td>
                    <td>${Utils.formatDate(e.fechaOut)}</td>
                    <td>${Utils.money(e.saldoPendiente || 0, cfg.simboloMoneda)}</td>
                    <td class="acciones">
                      <button class="btn btn-sm btn-success" data-out="${e.id}">Check-out</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
        </div>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Reservaciones pendientes de llegada</h3></div>
        <div class="panel-body">
          ${reservasHoy.length === 0 ? '<div class="empty">Sin llegadas pendientes</div>' :
            `<table class="table">
              <thead><tr>
                <th>Hab.</th><th>Huésped</th><th>Entrada</th>
                <th>Estado</th><th></th>
              </tr></thead>
              <tbody>
                ${reservasHoy.map(r => {
                  const h = DB.find('habitaciones', r.habitacionId);
                  const g = DB.find('huespedes', r.huespedId);
                  return `<tr>
                    <td>${Utils.esc(h?.numero || '—')}</td>
                    <td>${Utils.esc(g?.nombre || '—')}</td>
                    <td>${Utils.formatDate(r.fechaIn)}</td>
                    <td>${Utils.badgeReservacion(r.estado)}</td>
                    <td class="acciones">
                      <button class="btn btn-sm btn-primary" data-in="${r.id}">Hacer check-in</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;

    document.getElementById('chk-entrada').addEventListener('click', () => checkinForm(null));
    el.querySelectorAll('[data-in]').forEach(b =>
      b.addEventListener('click', () => checkinForm(Number(b.dataset.in)))
    );
    el.querySelectorAll('[data-out]').forEach(b =>
      b.addEventListener('click', () => checkoutForm(Number(b.dataset.out)))
    );
  }

  function checkinForm(reservaId) {
    const cfg = DB.all().config || {};
    const r = reservaId ? DB.find('reservaciones', reservaId) : null;
    const body = `
      <form id="ci-form" class="form-grid">
        ${r ? `
          <div class="form-group form-full">
            <label>Huésped</label>
            <input class="input" value="${Utils.esc(DB.find('huespedes', r.huespedId)?.nombre || '')}" disabled>
          </div>
          <div class="form-group form-full">
            <label>Habitación</label>
            <input class="input" value="Hab. ${Utils.esc(DB.find('habitaciones', r.habitacionId)?.numero || '')}" disabled>
          </div>
        ` : `
          <div class="form-group form-full"><label>Huésped *</label>${Huespedes.selector(null, true)}</div>
          <div class="form-group form-full">
            <label>Habitación *</label>
            <select class="input" name="habitacionId" required>
              <option value="">— Seleccionar —</option>
              ${DB.get('habitaciones').filter(h => h.estado === 'disponible')
                .map(h => `<option value="${h.id}">${Utils.esc(h.numero)}</option>`).join('')}
            </select>
          </div>
        `}
        <div class="form-group">
          <label>Fecha de salida *</label>
          <input type="date" class="input" name="fechaOut" value="${r?.fechaOut?.slice(0,10) || Utils.todayISO()}" required>
        </div>
        <div class="form-group">
          <label>Depósito inicial (${cfg.simboloMoneda})</label>
          <input type="number" min="0" step="0.01" class="input" name="deposito" value="0">
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="ci-guardar">Hacer check-in</button>
    `;

    const m = Utils.modal({ title: 'Check-in', body, footer });
    m.el.querySelector('#ci-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#ci-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const huespedId = r ? r.huespedId : Number(fd.get('huespedId'));
      const habitacionId = r ? r.habitacionId : Number(fd.get('habitacionId'));
      const fechaOut = fd.get('fechaOut');
      const deposito = Number(fd.get('deposito')) || 0;

      const estancia = DB.insert('estancias', {
        huespedId, habitacionId,
        reservacionId: r?.id || null,
        fechaIn: Utils.nowISO(),
        fechaOut,
        estado: 'activa',
        saldoPendiente: (r?.total || 0) - deposito,
        total: r?.total || 0
      });

      if (deposito > 0) {
        DB.insert('pagos', {
          estanciaId: estancia.id,
          monto: deposito,
          metodo: 'efectivo',
          tipo: 'ingreso',
          fecha: Utils.nowISO(),
          descripcion: 'Depósito check-in'
        });
      }

      DB.update('habitaciones', habitacionId, { estado: 'ocupada' });
      if (r) DB.update('reservaciones', r.id, { estado: 'checkin' });

      Utils.toast('Check-in registrado', 'success');
      m.close();
      render();
    });
  }

  function checkoutForm(estanciaId) {
    const e = DB.find('estancias', estanciaId);
    if (!e) return;
    const cfg = DB.all().config || {};
    const h = DB.find('habitaciones', e.habitacionId);
    const g = DB.find('huespedes', e.huespedId);
    const pagos = DB.get('pagos').filter(p => p.estanciaId === e.id);
    const totalPagado = pagos.reduce((s,p) => s + Number(p.monto || 0), 0);
    const saldo = (e.total || 0) - totalPagado;

    const body = `
      <div class="resumen-box">
        <p><strong>Huésped:</strong> ${Utils.esc(g?.nombre || '—')}</p>
        <p><strong>Habitación:</strong> ${Utils.esc(h?.numero || '—')}</p>
        <p><strong>Entrada:</strong> ${Utils.formatDateTime(e.fechaIn)}</p>
        <p><strong>Salida:</strong> ${Utils.formatDateTime(Utils.nowISO())}</p>
        <hr>
        <p>Total cargos: ${Utils.money(e.total || 0, cfg.simboloMoneda)}</p>
        <p>Total pagado: ${Utils.money(totalPagado, cfg.simboloMoneda)}</p>
        <p><strong>Saldo: ${Utils.money(saldo, cfg.simboloMoneda)}</strong></p>
      </div>
      <form id="co-form" class="form-grid mt-2">
        <div class="form-group">
          <label>Pago final (${cfg.simboloMoneda})</label>
          <input type="number" min="0" step="0.01" class="input" name="pagoFinal" value="${saldo > 0 ? saldo.toFixed(2) : 0}">
        </div>
        <div class="form-group">
          <label>Método</label>
          <select class="input" name="metodo">
            ${DB.get('metodosPago').map(m => `<option value="${m.nombre.toLowerCase()}">${Utils.esc(m.nombre)}</option>`).join('')}
          </select>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-success" id="co-guardar">Confirmar Check-out</button>
    `;

    const m = Utils.modal({ title: 'Check-out', body, footer, size: 'md' });
    m.el.querySelector('#co-guardar').addEventListener('click', () => {
      const fd = new FormData(m.el.querySelector('#co-form'));
      const pagoFinal = Number(fd.get('pagoFinal')) || 0;
      const metodo = fd.get('metodo');
      if (pagoFinal > 0) {
        DB.insert('pagos', {
          estanciaId: e.id,
          monto: pagoFinal,
          metodo,
          tipo: 'ingreso',
          fecha: Utils.nowISO(),
          descripcion: 'Pago final check-out'
        });
      }
      DB.update('estancias', e.id, {
        estado: 'finalizada',
        fechaOutReal: Utils.nowISO(),
        saldoPendiente: Math.max(0, saldo - pagoFinal)
      });
      DB.update('habitaciones', e.habitacionId, { estado: 'sucia' });
      DB.insert('tareasLimpieza', {
        habitacionId: e.habitacionId,
        estado: 'pendiente',
        fecha: Utils.nowISO(),
        notas: `Check-out estancia #${e.id}`
      });
      Utils.toast('Check-out registrado. Habitación marcada como sucia.', 'success');
      m.close();
      render();
    });
  }

  return { render };
})();
