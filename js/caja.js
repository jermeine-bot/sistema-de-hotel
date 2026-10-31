/* ============================================================
   caja.js — Movimientos de caja y pagos
   ============================================================ */

const Caja = (() => {

  function render() {
    const el = document.getElementById('view');
    const cfg = DB.all().config || {};
    const movs = DB.get('movimientosCaja').slice().reverse();
    const pagos = DB.get('pagos').slice().reverse();

    const totalIngresos = movs.filter(m => m.tipo === 'ingreso' || m.tipo === 'apertura')
      .reduce((s,m) => s + Number(m.monto || 0), 0);
    const totalEgresos = movs.filter(m => m.tipo === 'egreso')
      .reduce((s,m) => s + Number(m.monto || 0), 0);

    el.innerHTML = `
      <div class="grid-stats">
        <div class="stat-card stat-success">
          <div class="stat-icon">💰</div>
          <div class="stat-info">
            <div class="stat-label">Total ingresos</div>
            <div class="stat-value">${Utils.money(totalIngresos, cfg.simboloMoneda)}</div>
          </div>
        </div>
        <div class="stat-card stat-danger">
          <div class="stat-icon">📉</div>
          <div class="stat-info">
            <div class="stat-label">Total egresos</div>
            <div class="stat-value">${Utils.money(totalEgresos, cfg.simboloMoneda)}</div>
          </div>
        </div>
        <div class="stat-card stat-info">
          <div class="stat-icon">💵</div>
          <div class="stat-info">
            <div class="stat-label">Saldo en caja</div>
            <div class="stat-value">${Utils.money(totalIngresos - totalEgresos, cfg.simboloMoneda)}</div>
          </div>
        </div>
      </div>

      <div class="toolbar mt-2">
        <button class="btn btn-success" id="caja-ingreso">+ Registrar ingreso</button>
        <button class="btn btn-danger" id="caja-egreso">- Registrar egreso</button>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Últimos movimientos</h3></div>
        <div class="panel-body">
          ${movs.length === 0 ? '<div class="empty">Sin movimientos</div>' :
            `<table class="table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Monto</th></tr></thead>
              <tbody>
                ${movs.slice(0,50).map(m => `
                  <tr>
                    <td>${Utils.formatDateTime(m.fecha)}</td>
                    <td>${m.tipo}</td>
                    <td>${Utils.esc(m.descripcion || '—')}</td>
                    <td>${Utils.money(m.monto, cfg.simboloMoneda)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
        </div>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Pagos registrados</h3></div>
        <div class="panel-body">
          ${pagos.length === 0 ? '<div class="empty">Sin pagos</div>' :
            `<table class="table">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Método</th><th>Monto</th></tr></thead>
              <tbody>
                ${pagos.slice(0,50).map(p => `
                  <tr>
                    <td>${Utils.formatDateTime(p.fecha)}</td>
                    <td>${Utils.esc(p.descripcion || '—')}</td>
                    <td>${Utils.esc(p.metodo || '—')}</td>
                    <td>${Utils.money(p.monto, cfg.simboloMoneda)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;

    document.getElementById('caja-ingreso').addEventListener('click', () => form('ingreso'));
    document.getElementById('caja-egreso').addEventListener('click', () => form('egreso'));
  }

  function form(tipo) {
    const cfg = DB.all().config || {};
    const body = `
      <form id="caja-form" class="form-grid">
        <div class="form-group form-full">
          <label>Descripción *</label>
          <input class="input" name="descripcion" required>
        </div>
        <div class="form-group">
          <label>Monto (${cfg.simboloMoneda}) *</label>
          <input type="number" min="0.01" step="0.01" class="input" name="monto" required>
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
      <button class="btn btn-primary" id="caja-guardar">Registrar</button>
    `;

    const m = Utils.modal({ title: tipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo egreso', body, footer });
    m.el.querySelector('#caja-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#caja-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      DB.insert('movimientosCaja', {
        tipo,
        descripcion: fd.get('descripcion').trim(),
        monto: Number(fd.get('monto')),
        metodo: fd.get('metodo'),
        fecha: Utils.nowISO()
      });
      Utils.toast('Movimiento registrado', 'success');
      m.close();
      render();
    });
  }

  return { render };
})();
