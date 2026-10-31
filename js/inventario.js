/* ============================================================
   inventario.js — Productos y stock
   ============================================================ */

const Inventario = (() => {

  function render() {
    const el = document.getElementById('view');
    const cfg = DB.all().config || {};
    const prods = DB.get('productos');

    el.innerHTML = `
      <div class="toolbar">
        <input id="inv-buscar" class="input" placeholder="Buscar producto…">
        <button class="btn btn-primary" id="inv-nuevo">+ Nuevo producto</button>
      </div>
      <div class="panel mt-2">
        <div class="panel-body">
          ${prods.length === 0 ? '<div class="empty">Sin productos registrados</div>' :
            `<table class="table">
              <thead><tr>
                <th>Nombre</th><th>Categoría</th><th>Stock</th>
                <th>Mínimo</th><th>Precio</th><th></th>
              </tr></thead>
              <tbody>
                ${prods.map(p => `
                  <tr class="${p.stock <= p.stockMinimo ? 'row-warning' : ''}">
                    <td>${Utils.esc(p.nombre)}</td>
                    <td>${Utils.esc(p.categoria || '—')}</td>
                    <td>${p.stock} ${Utils.esc(p.unidad || '')}</td>
                    <td>${p.stockMinimo}</td>
                    <td>${Utils.money(p.precio, cfg.simboloMoneda)}</td>
                    <td class="acciones">
                      <button class="btn btn-sm" data-edit="${p.id}">✏️</button>
                      <button class="btn btn-sm btn-danger" data-del="${p.id}">🗑️</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
        </div>
      </div>
    `;

    document.getElementById('inv-nuevo').addEventListener('click', () => form(null));
    el.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => form(Number(b.dataset.edit)))
    );
    el.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => eliminar(Number(b.dataset.del)))
    );
  }

  function form(id) {
    const p = id ? DB.find('productos', id) : null;
    const cfg = DB.all().config || {};
    const body = `
      <form id="inv-form" class="form-grid">
        <div class="form-group form-full">
          <label>Nombre *</label>
          <input class="input" name="nombre" value="${Utils.esc(p?.nombre || '')}" required>
        </div>
        <div class="form-group">
          <label>Categoría</label>
          <input class="input" name="categoria" value="${Utils.esc(p?.categoria || '')}">
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <input class="input" name="unidad" value="${Utils.esc(p?.unidad || 'unidad')}">
        </div>
        <div class="form-group">
          <label>Stock actual *</label>
          <input type="number" min="0" class="input" name="stock" value="${p?.stock || 0}" required>
        </div>
        <div class="form-group">
          <label>Stock mínimo *</label>
          <input type="number" min="0" class="input" name="stockMinimo" value="${p?.stockMinimo || 5}" required>
        </div>
        <div class="form-group">
          <label>Precio venta (${cfg.simboloMoneda})</label>
          <input type="number" min="0" step="0.01" class="input" name="precio" value="${p?.precio || 0}">
        </div>
        <div class="form-group">
          <label>Costo compra</label>
          <input type="number" min="0" step="0.01" class="input" name="costo" value="${p?.costo || 0}">
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="inv-guardar">Guardar</button>
    `;
    const m = Utils.modal({ title: p ? 'Editar producto' : 'Nuevo producto', body, footer });
    m.el.querySelector('#inv-guardar').addEventListener('click', () => {
      const f = m.el.querySelector('#inv-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const data = {
        nombre: fd.get('nombre').trim(),
        categoria: fd.get('categoria').trim(),
        unidad: fd.get('unidad').trim(),
        stock: Number(fd.get('stock')),
        stockMinimo: Number(fd.get('stockMinimo')),
        precio: Number(fd.get('precio')),
        costo: Number(fd.get('costo'))
      };
      if (p) DB.update('productos', p.id, data);
      else DB.insert('productos', data);
      Utils.toast('Producto guardado', 'success');
      m.close();
      render();
    });
  }

  function eliminar(id) {
    Utils.confirm('¿Eliminar este producto?', () => {
      DB.remove('productos', id);
      Utils.toast('Producto eliminado', 'success');
      render();
    }, { danger: true });
  }

  return { render };
})();
