/* config.js — Configuración del hotel y respaldos */
const Config = (() => {

  function render() {
    const view = document.getElementById('view');
    const cfg = DB.all().config || {};

    view.innerHTML =
      '<div class="grid-2">' +
        '<div class="panel">' +
          '<div class="panel-header"><h3>⚙️ Datos del Hotel</h3></div>' +
          '<div class="panel-body">' +
            '<form id="form-config">' +
              '<div class="form-group" style="margin-bottom:1rem">' +
                '<label>Nombre del Hotel</label>' +
                '<input type="text" name="nombre" class="input" value="' + Utils.esc(cfg.nombre || 'Hotel, Las colinas') + '" required>' +
              '</div>' +
              '<div class="grid-2" style="gap:1rem;margin-bottom:1rem">' +
                '<div class="form-group">' +
                  '<label>Símbolo de Moneda</label>' +
                  '<input type="text" name="simboloMoneda" class="input" value="' + Utils.esc(cfg.simboloMoneda || 'C$') + '" required>' +
                '</div>' +
                '<div class="form-group">' +
                  '<label>IVA / Impuesto (%)</label>' +
                  '<input type="number" step="0.01" name="impuesto" class="input" value="' + Utils.esc(cfg.impuesto ?? 15) + '">' +
                '</div>' +
              '</div>' +
              '<div class="form-group" style="margin-bottom:1rem">' +
                '<label>Teléfono</label>' +
                '<input type="text" name="telefono" class="input" value="' + Utils.esc(cfg.telefono || '') + '">' +
              '</div>' +
              '<div class="form-group" style="margin-bottom:1.25rem">' +
                '<label>Dirección</label>' +
                '<input type="text" name="direccion" class="input" value="' + Utils.esc(cfg.direccion || '') + '">' +
              '</div>' +
              '<button type="submit" class="btn btn-primary">💾 Guardar Cambios</button>' +
            '</form>' +
          '</div>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-header"><h3>🗄️ Respaldo y Base de Datos</h3></div>' +
          '<div class="panel-body" style="display:flex;flex-direction:column;gap:1rem">' +
            '<p style="font-size:.9rem;color:var(--text-muted)">Exportá o restaurá todos los datos del sistema en formato JSON, o reiniciá la base de datos a los valores de demostración.</p>' +
            '<div style="display:flex;gap:.75rem;flex-wrap:wrap">' +
              '<button class="btn btn-primary" id="btn-exportar">⬇️ Exportar JSON</button>' +
              '<label class="btn" style="cursor:pointer">⬆️ Importar JSON<input type="file" id="input-importar" accept=".json" style="display:none"></label>' +
              '<button class="btn" id="btn-reset" style="color:#ef4444;border-color:#ef4444">⚠️ Restaurar Demo</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('form-config')?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const all = DB.all();
      all.config = {
        ...all.config,
        nombre: fd.get('nombre').trim(),
        simboloMoneda: fd.get('simboloMoneda').trim(),
        impuesto: Number(fd.get('impuesto')) || 0,
        telefono: fd.get('telefono').trim(),
        direccion: fd.get('direccion').trim()
      };
      DB.save();
      const bn = document.getElementById('brand-name');
      if (bn) bn.textContent = all.config.nombre;
      Utils.toast('Configuración guardada', 'success');
    });

    document.getElementById('btn-exportar')?.addEventListener('click', exportarBackup);

    document.getElementById('input-importar')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          localStorage.setItem('hotel_pms_db', JSON.stringify(data));
          Utils.toast('Respaldo importado con éxito', 'success');
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          Utils.toast('Archivo JSON inválido', 'error');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      Utils.confirm('¿Seguro que deseás borrar los cambios y restaurar los datos de demostración?', () => {
        localStorage.removeItem('hotel_pms_db');
        location.reload();
      });
    });
  }

  function exportarBackup() {
    const data = JSON.stringify(DB.all(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hotel-pms-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    Utils.toast('Respaldo descargado', 'success');
  }

  return { render, form, cambiarEstado, eliminar };
})();
