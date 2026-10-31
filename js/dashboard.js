/* dashboard.js — Panel principal premium */
const Dashboard = (() => {

  function render() {
    const s = DB.stats();
    const cfg = DB.all().config || {};
    const el = document.getElementById('view');

    // Datos para gráficos
    const ultimos7 = datos7Dias('pagos');
    const ocup7 = datos7Dias('ocupacion');
    const estados = Charts.estadoHabitaciones();

    el.innerHTML = `
      <div class="grid-stats">
        ${card('Habitaciones', s.totalHab, '🛏️', 'info', 'Registradas', [12,12,12,12,18,18,18])}
        ${card('Ocupadas', s.ocupadas, '🔴', 'danger', 'Alojados ahora', ocup7)}
        ${card('Disponibles', s.disponibles, '🟢', 'success', 'Listas para check-in', [18,16,14,12,10,8,s.disponibles])}
        ${card('Reservadas', s.reservadas, '🔵', 'info', 'Confirmadas', [2,3,4,5,4,3,s.reservadas])}
        ${card('Ocupación', s.ocupacion + '%', '📊', 'warning', 'Tasa actual', [30,45,60,72,85,78,s.ocupacion])}
        ${card('Huéspedes', s.huespedesAlojados, '👥', 'purple', 'Personas', ocup7)}
        ${card('Ingresos hoy', Utils.money(s.ingresosHoy, cfg.simboloMoneda), '💰', 'success', 'Cobros del día', ultimos7)}
        ${card('Ingresos mes', Utils.money(s.ingresosMes, cfg.simboloMoneda), '📈', 'success', 'Cobros del mes', ultimos7)}
        ${card('Gastos mes', Utils.money(s.gastosMes, cfg.simboloMoneda), '📉', 'danger', 'Egresos', [0,0,0,0,0,0,0])}
        ${card('Utilidad est.', Utils.money(s.utilidad, cfg.simboloMoneda), '💵', s.utilidad >= 0 ? 'success' : 'danger', 'Ingresos − gastos', ultimos7)}
        ${card('Por cobrar', Utils.money(s.pendientesCobro, cfg.simboloMoneda), '⏳', 'warning', 'Saldos', [0,0,0,0,0,0,0])}
        ${card('Sucias', s.sucias, '🧹', 'warning', 'Limpieza pend.', [0,0,0,0,0,0,s.sucias])}
      </div>

      <div class="grid-2 mt-3">
        <div class="panel">
          <div class="panel-header"><h3>Estado de habitaciones</h3></div>
          <div class="panel-body" style="display:flex;align-items:center;justify-content:center;gap:2rem;flex-wrap:wrap">
            <div>${Charts.donut([
              { label:'Disponibles', value: s.disponibles, color:'#10b981' },
              { label:'Ocupadas',    value: s.ocupadas,    color:'#ef4444' },
              { label:'Reservadas',  value: s.reservadas,  color:'#3b82f6' },
              { label:'Sucias',      value: s.sucias,      color:'#f59e0b' }
            ], 180, 26)}</div>
            <div style="flex:1;min-width:180px">
              ${Charts.bars([
                { label:'Disponibles', value: s.disponibles },
                { label:'Ocupadas',    value: s.ocupadas },
                { label:'Reservadas',  value: s.reservadas },
                { label:'Sucias',      value: s.sucias }
              ])}
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Tendencia de ingresos (7 días)</h3></div>
          <div class="panel-body">
            ${tendenciaChart()}
          </div>
        </div>
      </div>

      <div class="grid-2 mt-3">
        <div class="panel">
          <div class="panel-header"><h3>Llegadas de hoy</h3></div>
          <div class="panel-body" style="padding:0">
            ${s.llegadasHoy.length === 0 ? '<div class="empty">Sin llegadas programadas</div>' :
              `<table class="table">
                <thead><tr><th>Huésped</th><th>Hab.</th><th>Fecha</th><th>Estado</th></tr></thead>
                <tbody>
                  ${s.llegadasHoy.map(r => {
                    const h = DB.find('habitaciones', r.habitacionId);
                    const g = DB.find('huespedes', r.huespedId);
                    return `<tr>
                      <td><strong>${Utils.esc(g?.nombre || '—')}</strong></td>
                      <td>Hab. ${Utils.esc(h?.numero || '—')}</td>
                      <td>${Utils.formatDate(r.fechaIn)}</td>
                      <td>${Utils.badgeReservacion(r.estado)}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Salidas de hoy</h3></div>
          <div class="panel-body" style="padding:0">
            ${s.salidasHoy.length === 0 ? '<div class="empty">Sin salidas programadas</div>' :
              `<table class="table">
                <thead><tr><th>Huésped</th><th>Hab.</th><th>Salida</th><th>Saldo</th></tr></thead>
                <tbody>
                  ${s.salidasHoy.map(e => {
                    const h = DB.find('habitaciones', e.habitacionId);
                    const g = DB.find('huespedes', e.huespedId);
                    return `<tr>
                      <td><strong>${Utils.esc(g?.nombre || '—')}</strong></td>
                      <td>Hab. ${Utils.esc(h?.numero || '—')}</td>
                      <td>${Utils.formatDate(e.fechaOut)}</td>
                      <td>${Utils.money(e.saldoPendiente || 0, cfg.simboloMoneda)}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
          </div>
        </div>
      </div>

      <div class="panel mt-3">
        <div class="panel-header">
          <h3>Mapa de habitaciones</h3>
          <span class="badge badge-info">${DB.get('habitaciones').length} habitaciones · Click para gestionar</span>
        </div>
        <div class="panel-body">
          <div class="habitaciones-grid">
            ${DB.get('habitaciones').map(h => `
              <div class="hab-card estado-${h.estado}" title="Hab. ${h.numero} — ${h.estado}" onclick="Router.go('habitaciones')">
                <div class="hab-num">${Utils.esc(h.numero)}</div>
                <div class="hab-estado">${Utils.badgeHabitacion(h.estado)}</div>
                <div class="hab-precio">${Utils.money(h.precioNoche, cfg.simboloMoneda)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function card(label, valor, icono, tipo, subtitulo = '', sparkData = null) {
    return `
      <div class="stat-card stat-${tipo}">
        <div class="stat-icon">${icono}</div>
        <div class="stat-info">
          <div class="stat-label">${Utils.esc(label)}</div>
          <div class="stat-value">${valor}</div>
          ${subtitulo ? `<div style="font-size:.7rem;color:var(--text-subtle);margin-top:.2rem">${Utils.esc(subtitulo)}</div>` : ''}
        </div>
        ${sparkData ? `<div style="position:absolute;right:.85rem;bottom:.6rem;opacity:.7">${Charts.sparkline(sparkData, 70, 26, 'var(--accent-500)')}</div>` : ''}
      </div>
    `;
  }

  function datos7Dias(coleccion) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      if (coleccion === 'pagos') {
        const t = DB.get('pagos')
          .filter(p => p.fecha?.startsWith(iso))
          .reduce((s, p) => s + Number(p.monto || 0), 0);
        out.push(t);
      } else {
        out.push(DB.get('habitaciones').filter(h => h.estado === 'ocupada').length);
      }
    }
    return out.length ? out : [0];
  }

  function tendenciaChart() {
    const cfg = DB.all().config || {};
    const datos = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const total = DB.get('pagos')
        .filter(p => p.fecha?.startsWith(iso))
        .reduce((s, p) => s + Number(p.monto || 0), 0);
      datos.push(total);
      labels.push(d.toLocaleDateString('es-NI', { weekday: 'short' }));
    }
    const max = Math.max(...datos, 1);
    const total = datos.reduce((s,v) => s+v, 0);
    return `
      <div style="display:flex;align-items:flex-end;gap:.65rem;height:180px;padding:0 .5rem">
        ${datos.map((v, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.4rem;height:100%;justify-content:flex-end">
            <div style="font-size:.7rem;font-weight:700;color:var(--text-muted);font-variant-numeric:tabular-nums">${Utils.num(v)}</div>
            <div style="width:100%;height:${(v/max)*100}%;min-height:4px;background:linear-gradient(180deg,var(--accent-400),var(--accent-600));border-radius:6px 6px 0 0;transition:height .8s cubic-bezier(.16,1,.3,1);box-shadow:0 -4px 12px var(--accent-glow)" title="${Utils.money(v, cfg.simboloMoneda)}"></div>
            <div style="font-size:.65rem;color:var(--text-subtle);text-transform:uppercase;font-weight:600">${labels[i]}</div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin-top:1rem;padding-top:1rem;border-top:1px dashed var(--border)">
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Total 7 días</div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--accent-600);margin-top:.25rem">${Utils.money(total, cfg.simboloMoneda)}</div>
      </div>
    `;
  }

  return { render };
})();
