/* ============================================================
   mantenimiento.js — Incidencias
   ============================================================ */

const Mantenimiento = (() => {

  function render() {
    const el = document.getElementById('view');
    const incs = DB.get('incidenciasMantenimiento').slice().reverse();

    el.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="man-nueva">+ Reportar incidencia</button>
      </div>
      <div class="panel mt-2">
        <div class="panel-header"><h3>Incidencias</h3></div>
        <div class="panel-body">
          ${incs.length === 0 ? '<div class="empty">Sin incidencias</div>' :
            `<table class="table">
              <thead><tr>
                <th>Habitación</th><th>Descripción</th><th>Prioridad</th>
                <th>Estado</th><th>Fecha</th><th></th>
              </tr></thead>
              <tbody>
                ${incs.map(i => {
                  const h = DB.find('habitaciones', i.habitacionId);
                  return `<tr>
                    <td>Hab. ${Utils.esc(h?.numero || '—')}</td>
                    <td>${Utils.esc(i.descripcion)}</td>
                    <td>${badgePrioridad(i.prioridad)}</td>
                    <td>${badgeEstado(i.estado)}</td>
                    <td>${Utils.formatDate(i.fecha)}</td>
                    <td class="acciones">
                      ${i.estado !== 'resuelta' ? `<button class="btn btn-sm btn-success" data-done="${i.id}">✓</button>` : ''}
                      <button class="btn btn-sm btn-danger" data-del="${i.id}">🗑️</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;

    document.getElementById('man-nueva').addEventListener('click', () => form());
    el.querySelectorAll('[data-done]').forEach(b =>
      b.addEventListener('click', () => resolver(Number(b.dataset.done)))
    );
    el.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => eliminar(Number(b.dataset.del)))
    );
  }

  function badgePrioridad(p) {
    const map = {
      baja: 'badge-muted', media: 'badge-info',
      alta: 'badge-warning', critica: 'badge-danger'
    };
    return `<span class="badge ${map[p] || 'badge-muted'}">${p || 'baja'}</span>`;
  }

  function badgeEstado(e) {
    const map = {
      abierta: 'badge-warning', en_proceso: 'badge-info',
      resuelta: 'badge-success'
    };
    return `<span class="badge ${map[e] || 'badge-muted'}">${e || 'abierta'}</span>`;
  }

  function form() {
    const body = `
      <form id="man-form" class="form-grid">
        <div class="form-group">
          <label>Habitación *</label>
          <select class="input" name="habitacionId" required>
            <option value="">— Seleccionar —</option>
            ${DB.get('habitaciones').map(h => `<option value="${h.id}">Hab. ${Utils.esc(h.numero)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prioridad</label>
          <select class="input" name="prioridad">
            <option value="baja">Baja</option>
            <option value="media" selected>Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        <div class="form-group form-full">
          <label>Descripción *</label>
          <textarea class="input" name="descripcion" rows="3" required></textarea>
        </div>
        <div class="form-group">
          <label>Marcar habitación fuera de servicio</label>
          <select class="input" name="fueraServicio">
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="man-guardar">Reportar</button>
    `;
    const m = Utils.modal({ title: 'Reportar incidencia', body, footer });
    m.el.querySelector('#man-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#man-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const habId = Number(fd.get('habitacionId'));
      DB.insert('incidenciasMantenimiento', {
        habitacionId: habId,
        descripcion: fd.get('descripcion').trim(),
        prioridad: fd.get('prioridad'),
        estado: 'abierta',
        fecha: Utils.nowISO()
      });
      if (fd.get('fueraServicio') === 'si') {
        DB.update('habitaciones', habId, { estado: 'mantenimiento' });
      }
      Utils.toast('Incidencia reportada', 'success');
      m.close();
      render();
    });
  }

  function resolver(id) {
    const i = DB.find('incidenciasMantenimiento', id);
    DB.update('incidenciasMantenimiento', id, { estado: 'resuelta', fechaFin: Utils.nowISO() });
    const h = DB.find('habitaciones', i.habitacionId);
    if (h && h.estado === 'mantenimiento') {
      DB.update('habitaciones', i.habitacionId, { estado: 'disponible' });
    }
    Utils.toast('Incidencia resuelta', 'success');
    render();
  }

  function eliminar(id) {
    Utils.confirm('¿Eliminar esta incidencia?', () => {
      DB.remove('incidenciasMantenimiento', id);
      Utils.toast('Incidencia eliminada', 'success');
      render();
    }, { danger: true });
  }

  return { render };
})();
