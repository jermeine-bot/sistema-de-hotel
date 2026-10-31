/* ============================================================
   huespedes.js — Gestión de huéspedes
   ============================================================ */

const Huespedes = (() => {

  function render() {
    const el = document.getElementById('view');
    const lista = DB.get('huespedes');

    el.innerHTML = `
      <div class="toolbar">
        <input id="hues-buscar" class="input" placeholder="Buscar por nombre, documento o teléfono…">
        <button class="btn btn-primary" id="hues-nuevo">+ Nuevo huésped</button>
      </div>
      <div class="panel">
        <div class="panel-body">
          <div id="hues-tabla"></div>
        </div>
      </div>
    `;

    document.getElementById('hues-nuevo').addEventListener('click', () => form(null));
    document.getElementById('hues-buscar').addEventListener('input', Utils.debounce(filtrar, 200));
    filtrar();

    function filtrar() {
      const q = document.getElementById('hues-buscar').value.trim().toLowerCase();
      const filtrados = lista.filter(h => {
        if (!q) return true;
        return [h.nombre, h.documento, h.telefono, h.email]
          .some(v => String(v || '').toLowerCase().includes(q));
      });

      const cont = document.getElementById('hues-tabla');
      if (!filtrados.length) {
        cont.innerHTML = '<div class="empty">Sin huéspedes registrados</div>';
        return;
      }
      cont.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Nombre</th><th>Documento</th><th>Teléfono</th>
            <th>Email</th><th>Nacionalidad</th><th></th>
          </tr></thead>
          <tbody>
            ${filtrados.map(h => `
              <tr>
                <td>${Utils.esc(h.nombre)}</td>
                <td>${Utils.esc(h.documento || '—')}</td>
                <td>${Utils.esc(h.telefono || '—')}</td>
                <td>${Utils.esc(h.email || '—')}</td>
                <td>${Utils.esc(h.nacionalidad || '—')}</td>
                <td class="acciones">
                  <button class="btn btn-sm" data-edit="${h.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${h.id}">🗑️</button>
                </td>
              </tr>
            `).join('')}
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
    const h = id ? DB.find('huespedes', id) : null;
    const titulo = h ? 'Editar huésped' : 'Nuevo huésped';

    const body = `
      <form id="hues-form" class="form-grid">
        <div class="form-group form-full">
          <label>Nombre completo *</label>
          <input class="input" name="nombre" value="${Utils.esc(h?.nombre || '')}" required>
        </div>
        <div class="form-group">
          <label>Documento de identidad</label>
          <input class="input" name="documento" value="${Utils.esc(h?.documento || '')}">
        </div>
        <div class="form-group">
          <label>Nacionalidad</label>
          <input class="input" name="nacionalidad" value="${Utils.esc(h?.nacionalidad || 'Nicaragüense')}">
        </div>
        <div class="form-group">
          <label>Teléfono</label>
          <input class="input" name="telefono" value="${Utils.esc(h?.telefono || '')}">
        </div>
        <div class="form-group">
          <label>Correo electrónico</label>
          <input type="email" class="input" name="email" value="${Utils.esc(h?.email || '')}">
        </div>
        <div class="form-group form-full">
          <label>Dirección</label>
          <input class="input" name="direccion" value="${Utils.esc(h?.direccion || '')}">
        </div>
        <div class="form-group">
          <label>Contacto de emergencia</label>
          <input class="input" name="contactoEmergencia" value="${Utils.esc(h?.contactoEmergencia || '')}">
        </div>
        <div class="form-group">
          <label>Teléfono de emergencia</label>
          <input class="input" name="telefonoEmergencia" value="${Utils.esc(h?.telefonoEmergencia || '')}">
        </div>
        <div class="form-group form-full">
          <label>Observaciones</label>
          <textarea class="input" name="observaciones" rows="2">${Utils.esc(h?.observaciones || '')}</textarea>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="hues-guardar">Guardar</button>
    `;

    const m = Utils.modal({ title: titulo, body, footer });
    m.el.querySelector('#hues-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#hues-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const data = Object.fromEntries(fd.entries());
      if (data.email && !Utils.isEmail(data.email)) {
        Utils.toast('Correo inválido', 'error'); return;
      }
      if (h) {
        DB.update('huespedes', h.id, data);
        Utils.toast('Huésped actualizado', 'success');
      } else {
        DB.insert('huespedes', data);
        Utils.toast('Huésped registrado', 'success');
      }
      m.close();
      render();
    });
  }

  function eliminar(id) {
    const h = DB.find('huespedes', id);
    Utils.confirm(`¿Eliminar a ${h.nombre}?`, () => {
      DB.remove('huespedes', id);
      Utils.toast('Huésped eliminado', 'success');
      render();
    }, { danger: true });
  }

  function selector(selectedId = null, required = false) {
    const hs = DB.get('huespedes');
    return `<select class="input" name="huespedId" ${required ? 'required' : ''}>
      <option value="">— Seleccionar huésped —</option>
      ${hs.map(h => `<option value="${h.id}" ${Number(selectedId) === h.id ? 'selected' : ''}>${Utils.esc(h.nombre)} ${h.documento ? `(${Utils.esc(h.documento)})` : ''}</option>`).join('')}
    </select>`;
  }

  return { render, form, selector };
})();
