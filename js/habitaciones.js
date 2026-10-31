/* habitaciones.js — Gestión completa de habitaciones */
const Habitaciones = (() => {
  let filtroEstado = 'todas';
  let filtroBusqueda = '';

  function getTipoNombre(tipoId) {
    const tipos = DB.get('tiposHabitacion') || [];
    const t = tipos.find(x => Number(x.id) === Number(tipoId));
    return t ? t.nombre : 'Estándar';
  }

  function render() {
    const view = document.getElementById('view');
    const cfg = DB.all().config || {};
    const todas = DB.get('habitaciones') || [];

    const habs = todas.filter(h => {
      const okEstado = filtroEstado === 'todas' || h.estado === filtroEstado;
      const q = filtroBusqueda.toLowerCase();
      const tipoNom = getTipoNombre(h.tipoId).toLowerCase();
      const okBusq = !q ||
        String(h.numero).toLowerCase().includes(q) ||
        tipoNom.includes(q) ||
        (h.descripcion || '').toLowerCase().includes(q);
      return okEstado && okBusq;
    });

    let cardsHtml = '';
    if (habs.length === 0) {
      cardsHtml = '<div class="empty">No hay habitaciones que coincidan con el filtro</div>';
    } else {
      cardsHtml = '<div class="habitaciones-grid">' + habs.map(h => {
        const tipoNombre = getTipoNombre(h.tipoId);
        const badge = Utils.badgeHabitacion ? Utils.badgeHabitacion(h.estado) : '<span class="badge">' + Utils.esc(h.estado) + '</span>';
        const desc = h.descripcion ? '<div style="font-size:.78rem;color:var(--text-muted)">' + Utils.esc(h.descripcion) + '</div>' : '';
        return '<div class="hab-card estado-' + Utils.esc(h.estado) + ' hover-lift" style="padding:1.1rem;border-radius:14px;border:1px solid var(--border);display:flex;flex-direction:column;gap:.5rem;text-align:left">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span class="hab-num" style="font-size:1.35rem;font-weight:800">Hab. ' + Utils.esc(h.numero) + '</span>' +
            badge +
          '</div>' +
          '<div style="font-size:.8rem;color:var(--text-muted);font-weight:600;text-transform:uppercase">' +
            Utils.esc(tipoNombre) + ' · 🛏️ ' + Utils.esc(h.camas || 1) + ' cama(s) · 👥 ' + Utils.esc(h.capacidad || 2) +
          '</div>' +
          desc +
          '<div class="hab-precio" style="font-size:1.15rem;font-weight:800;color:var(--accent-600);margin-top:auto">' +
            Utils.money(h.precioNoche || 0, cfg.simboloMoneda) + ' <small style="font-weight:400;color:var(--text-muted)">/ noche</small>' +
            (h.precioHora ? ' · <small style="font-weight:600;color:var(--text-muted)">' + Utils.money(h.precioHora, cfg.simboloMoneda) + '/h</small>' : '') +
          '</div>' +
          '<div style="display:flex;gap:.4rem;margin-top:.5rem;padding-top:.6rem;border-top:1px dashed var(--border)">' +
            '<button class="btn btn-sm" style="flex:1" onclick="Habitaciones.form(' + h.id + ')">✏️ Editar</button>' +
            '<button class="btn btn-sm" onclick="Habitaciones.cambiarEstado(' + h.id + ')" title="Cambiar estado">🔄</button>' +
            '<button class="btn btn-sm" onclick="Habitaciones.eliminar(' + h.id + ')" title="Eliminar">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    view.innerHTML =
      '<div class="panel">' +
        '<div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">' +
            '<input type="text" id="hab-search" class="input" placeholder="🔍 Buscar N° o tipo..." value="' + Utils.esc(filtroBusqueda) + '" style="max-width:220px">' +
            '<select id="hab-filtro" class="input" style="max-width:190px">' +
              '<option value="todas" ' + (filtroEstado==='todas'?'selected':'') + '>Todos los estados (' + todas.length + ')</option>' +
              '<option value="disponible" ' + (filtroEstado==='disponible'?'selected':'') + '>🟢 Disponibles</option>' +
              '<option value="ocupada" ' + (filtroEstado==='ocupada'?'selected':'') + '>🔴 Ocupadas</option>' +
              '<option value="reservada" ' + (filtroEstado==='reservada'?'selected':'') + '>🔵 Reservadas</option>' +
              '<option value="sucia" ' + (filtroEstado==='sucia'?'selected':'') + '>🧹 Sucias / Limpieza</option>' +
              '<option value="mantenimiento" ' + (filtroEstado==='mantenimiento'?'selected':'') + '>🔧 Mantenimiento</option>' +
            '</select>' +
          '</div>' +
          '<button class="btn btn-primary" id="btn-nueva-hab">➕ Nueva Habitación</button>' +
        '</div>' +
        '<div class="panel-body">' + cardsHtml + '</div>' +
      '</div>';

    document.getElementById('hab-search')?.addEventListener('input', e => {
      filtroBusqueda = e.target.value;
      render();
      const input = document.getElementById('hab-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.getElementById('hab-filtro')?.addEventListener('change', e => {
      filtroEstado = e.target.value;
      render();
    });

    document.getElementById('btn-nueva-hab')?.addEventListener('click', () => form(null));
  }

  function form(id = null) {
    const h = id ? (DB.find('habitaciones', Number(id)) || DB.find('habitaciones', id)) : null;
    const tipos = DB.get('tiposHabitacion') || [
      { id: 1, nombre: 'Sencilla' },
      { id: 2, nombre: 'Doble' },
      { id: 3, nombre: 'Matrimonial' },
      { id: 4, nombre: 'Triple' },
      { id: 5, nombre: 'Familiar' },
      { id: 6, nombre: 'Suite' }
    ];

    const optsTipo = tipos.map(t =>
      '<option value="' + t.id + '" ' + (Number(h?.tipoId) === Number(t.id) ? 'selected' : '') + '>' + Utils.esc(t.nombre) + '</option>'
    ).join('');

    const estados = ['disponible', 'ocupada', 'reservada', 'sucia', 'mantenimiento'];
    const optsEstado = estados.map(est =>
      '<option value="' + est + '" ' + (h?.estado === est ? 'selected' : '') + '>' + est.toUpperCase() + '</option>'
    ).join('');

    const html =
      '<form id="form-hab">' +
        '<div class="grid-2" style="gap:1rem">' +
          '<div class="form-group">' +
            '<label>Número de Habitación *</label>' +
            '<input type="text" name="numero" class="input" required value="' + Utils.esc(h?.numero || '') + '" placeholder="Ej: 101">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Tipo de Habitación *</label>' +
            '<select name="tipoId" class="input" required>' + optsTipo + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Capacidad (personas)</label>' +
            '<input type="number" name="capacidad" class="input" value="' + Utils.esc(h?.capacidad || 2) + '" min="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Camas</label>' +
            '<input type="number" name="camas" class="input" value="' + Utils.esc(h?.camas || 1) + '" min="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Precio por Noche *</label>' +
            '<input type="number" step="0.01" name="precioNoche" class="input" required value="' + Utils.esc(h?.precioNoche || 45) + '" min="0">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Precio por Hora</label>' +
            '<input type="number" step="0.01" name="precioHora" class="input" value="' + Utils.esc(h?.precioHora || 15) + '" min="0">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Estado</label>' +
            '<select name="estado" class="input">' + optsEstado + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:1rem">' +
          '<label>Descripción / Amenidades</label>' +
          '<textarea name="descripcion" class="input" rows="2" placeholder="Planta baja, vista jardín, A/C...">' + Utils.esc(h?.descripcion || '') + '</textarea>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.25rem">' +
          '<button type="button" class="btn" onclick="Utils.closeModal()">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">💾 Guardar</button>' +
        '</div>' +
      '</form>';

    Utils.modal(h ? 'Editar Habitación ' + h.numero : 'Nueva Habitación', html);

    document.getElementById('form-hab')?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        numero: fd.get('numero').trim(),
        tipoId: Number(fd.get('tipoId')) || 1,
        capacidad: Number(fd.get('capacidad')) || 2,
        camas: Number(fd.get('camas')) || 1,
        precioNoche: Number(fd.get('precioNoche')) || 0,
        precioHora: Number(fd.get('precioHora')) || 0,
        estado: fd.get('estado'),
        descripcion: fd.get('descripcion').trim()
      };

      if (h) {
        DB.update('habitaciones', h.id, data);
        Utils.toast('Habitación actualizada', 'success');
      } else {
        DB.insert('habitaciones', data);
        Utils.toast('Habitación creada', 'success');
      }
      Utils.closeModal();
      render();
    });
  }

  function cambiarEstado(id) {
    const h = DB.find('habitaciones', Number(id)) || DB.find('habitaciones', id);
    if (!h) return;
    const orden = ['disponible', 'ocupada', 'reservada', 'sucia', 'mantenimiento'];
    const sig = orden[(orden.indexOf(h.estado) + 1) % orden.length];
    DB.update('habitaciones', h.id, { estado: sig });
    Utils.toast('Hab. ' + h.numero + ' → ' + sig.toUpperCase(), 'info');
    render();
  }

  function eliminar(id) {
    const h = DB.find('habitaciones', Number(id)) || DB.find('habitaciones', id);
    if (!h) return;
    Utils.confirm('¿Eliminar la habitación ' + h.numero + '?', () => {
      DB.remove('habitaciones', h.id);
      Utils.toast('Habitación eliminada', 'info');
      render();
    });
  }

  return { render, form, cambiarEstado, eliminar };
})();
