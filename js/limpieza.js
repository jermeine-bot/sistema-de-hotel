/* ============================================================
   limpieza.js — Tareas de limpieza
   ============================================================ */

const Limpieza = (() => {

  function render() {
    const el = document.getElementById('view');
    const tareas = DB.get('tareasLimpieza').slice().reverse();
    const sucias = DB.get('habitaciones').filter(h => h.estado === 'sucia');

    el.innerHTML = `
      <div class="grid-stats">
        <div class="stat-card stat-warning">
          <div class="stat-icon">🧹</div>
          <div class="stat-info">
            <div class="stat-label">Habitaciones sucias</div>
            <div class="stat-value">${sucias.length}</div>
          </div>
        </div>
        <div class="stat-card stat-info">
          <div class="stat-icon">⏳</div>
          <div class="stat-info">
            <div class="stat-label">Tareas pendientes</div>
            <div class="stat-value">${tareas.filter(t => t.estado === 'pendiente').length}</div>
          </div>
        </div>
      </div>

      <div class="toolbar mt-2">
        <button class="btn btn-primary" id="limp-nueva">+ Nueva tarea</button>
      </div>

      <div class="panel mt-2">
        <div class="panel-header"><h3>Tareas de limpieza</h3></div>
        <div class="panel-body">
          ${tareas.length === 0 ? '<div class="empty">Sin tareas</div>' :
            `<table class="table">
              <thead><tr>
                <th>Habitación</th><th>Estado</th><th>Notas</th>
                <th>Asignado</th><th>Fecha</th><th></th>
              </tr></thead>
              <tbody>
                ${tareas.map(t => {
                  const h = DB.find('habitaciones', t.habitacionId);
                  return `<tr>
                    <td>Hab. ${Utils.esc(h?.numero || '—')}</td>
                    <td>${badgeLimpieza(t.estado)}</td>
                    <td>${Utils.esc(t.notas || '—')}</td>
                    <td>${Utils.esc(t.asignado || '—')}</td>
                    <td>${Utils.formatDate(t.fecha)}</td>
                    <td class="acciones">
                      ${t.estado !== 'completada' ? `<button class="btn btn-sm btn-success" data-done="${t.id}">✓</button>` : ''}
                      <button class="btn btn-sm btn-danger" data-del="${t.id}">🗑️</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;

    document.getElementById('limp-nueva').addEventListener('click', () => form());
    el.querySelectorAll('[data-done]').forEach(b =>
      b.addEventListener('click', () => completar(Number(b.dataset.done)))
    );
    el.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => eliminar(Number(b.dataset.del)))
    );
  }

  function badgeLimpieza(estado) {
    const map = {
      pendiente: { txt: 'Pendiente', cls: 'badge-warning' },
      en_proceso: { txt: 'En proceso', cls: 'badge-info' },
      completada: { txt: 'Completada', cls: 'badge-success' }
    };
    const b = map[estado] || { txt: estado, cls: 'badge-muted' };
    return `<span class="badge ${b.cls}">${b.txt}</span>`;
  }

  function form() {
    const sucias = DB.get('habitaciones').filter(h => ['sucia','disponible','ocupada'].includes(h.estado));
    const body = `
      <form id="limp-form" class="form-grid">
        <div class="form-group">
          <label>Habitación *</label>
          <select class="input" name="habitacionId" required>
            <option value="">— Seleccionar —</option>
            ${sucias.map(h => `<option value="${h.id}">Hab. ${Utils.esc(h.numero)} (${h.estado})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Asignado a</label>
          <input class="input" name="asignado" placeholder="Nombre del personal">
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select class="input" name="estado">
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En proceso</option>
            <option value="completada">Completada</option>
          </select>
        </div>
        <div class="form-group form-full">
          <label>Notas</label>
          <textarea class="input" name="notas" rows="2"></textarea>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="limp-guardar">Guardar</button>
    `;
    const m = Utils.modal({ title: 'Nueva tarea de limpieza', body, footer });
    m.el.querySelector('#limp-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#limp-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      DB.insert('tareasLimpieza', {
        habitacionId: Number(fd.get('habitacionId')),
        asignado: fd.get('asignado').trim(),
        estado: fd.get('estado'),
        notas: fd.get('notas').trim(),
        fecha: Utils.nowISO()
      });
      Utils.toast('Tarea creada', 'success');
      m.close();
      render();
    });
  }

  function completar(id) {
    const t = DB.find('tareasLimpieza', id);
    DB.update('tareasLimpieza', id, { estado: 'completada', fechaFin: Utils.nowISO() });
    DB.update('habitaciones', t.habitacionId, { estado: 'disponible' });
    Utils.toast('Tarea completada. Habitación disponible.', 'success');
    render();
  }

  function eliminar(id) {
    Utils.confirm('¿Eliminar esta tarea?', () => {
      DB.remove('tareasLimpieza', id);
      Utils.toast('Tarea eliminada', 'success');
      render();
    }, { danger: true });
  }

  return { render };
})();
