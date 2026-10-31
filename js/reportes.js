/* ============================================================
   reportes.js — Reportes y exportaciones
   ============================================================ */

const Reportes = (() => {

  function render() {
    const el = document.getElementById('view');
    el.innerHTML = `
      <div class="toolbar">
        <input type="date" id="rep-ini" class="input" value="${Utils.todayISO()}">
        <input type="date" id="rep-fin" class="input" value="${Utils.todayISO()}">
        <button class="btn btn-primary" id="rep-generar">Generar reporte</button>
        <button class="btn" id="rep-exportar">⬇️ Exportar JSON</button>
      </div>
      <div id="rep-contenido" class="mt-2"></div>
    `;

    document.getElementById('rep-generar').addEventListener('click', generar);
    document.getElementById('rep-exportar').addEventListener('click', exportar);
    generar();
  }

  function generar() {
    const cfg = DB.all().config || {};
    const ini = document.getElementById('rep-ini').value;
    const fin = document.getElementById('rep-fin').value;

    const pagos = DB.get('pagos').filter(p =>
      p.fecha?.slice(0,10) >= ini && p.fecha?.slice(0,10) <= fin);
    const gastos = DB.get('gastos').filter(g =>
      g.fecha?.slice(0,10) >= ini && g.fecha?.slice(0,10) <= fin);
    const estancias = DB.get('estancias').filter(e =>
      e.fechaIn?.slice(0,10) >= ini && e.fechaIn?.slice(0,10) <= fin);

    const totalPagos = pagos.reduce((s,p) => s + Number(p.monto || 0), 0);
    const totalGastos = gastos.reduce((s,g) => s + Number(g.monto || 0), 0);

    document.getElementById('rep-contenido').innerHTML = `
      <div class="grid-stats">
        <div class="stat-card stat-success">
          <div class="stat-info">
            <div class="stat-label">Ingresos del período</div>
            <div class="stat-value">${Utils.money(totalPagos, cfg.simboloMoneda)}</div>
          </div>
        </div>
        <div class="stat-card stat-danger">
          <div class="stat-info">
            <div class="stat-label">Gastos</div>
            <div class="stat-value">${Utils.money(totalGastos, cfg.simboloMoneda)}</div>
          </div>
        </div>
        <div class="stat-card stat-info">
          <div class="stat-info">
            <div class="stat-label">Utilidad estimada</div>
            <div class="stat-value">${Utils.money(totalPagos - totalGastos, cfg.simboloMoneda)}</div>
          </div>
        </div>
        <div class="stat-card stat-info">
          <div class="stat-info">
            <div class="stat-label">Estancias del período</div>
            <div class="stat-value">${estancias.length}</div>
          </div>
        </div>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Detalle de pagos (${pagos.length})</h3></div>
        <div class="panel-body">
          ${pagos.length === 0 ? '<div class="empty">Sin pagos en el período</div>' :
            `<table class="table">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Método</th><th>Monto</th></tr></thead>
              <tbody>
                ${pagos.map(p => `<tr>
                  <td>${Utils.formatDateTime(p.fecha)}</td>
                  <td>${Utils.esc(p.descripcion || '—')}</td>
                  <td>${Utils.esc(p.metodo || '—')}</td>
                  <td>${Utils.money(p.monto, cfg.simboloMoneda)}</td>
                </tr>`).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;
  }

  function exportar() {
    const data = DB.all();
    Utils.download(`reporte_${Utils.todayISO()}.json`, JSON.stringify(data, null, 2));
    Utils.toast('Reporte exportado', 'success');
  }

  return { render };
})();
