/* ============================================================
   db.js — Capa de datos sobre LocalStorage
   ============================================================ */

const DB = (() => {
  const KEY = 'hotel_pms_db_v1';
  const SESSION_KEY = 'hotel_pms_session';
  let _data = null;

  /* ---------- Init ---------- */
  async function init() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try { _data = JSON.parse(raw); }
      catch(e) { console.error('DB corrupta, reiniciando', e); _data = null; }
    }
    if (!_data) {
      const seed = await loadSeed();
      _data = seed;
      save();
    }
    return _data;
  }

  async function loadSeed() {
    try {
      const res = await fetch('data/seed.json');
      if (!res.ok) throw new Error('No se pudo cargar seed.json');
      return await res.json();
    } catch(e) {
      console.error('Error cargando seed:', e);
      return { usuarios:[], habitaciones:[], tiposHabitacion:[], huespedes:[],
               reservaciones:[], estancias:[], pagos:[], movimientosCaja:[],
               servicios:[], productos:[], tareasLimpieza:[], incidenciasMantenimiento:[],
               config:{}, contadores:{} };
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(_data));
  }

  function reset() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function all() { return _data; }

  /* ---------- CRUD genérico ---------- */
  function get(collection) {
    return _data[collection] || [];
  }

  function find(collection, id) {
    return get(collection).find(x => x.id === Number(id));
  }

  function insert(collection, item) {
    if (!_data[collection]) _data[collection] = [];
    const id = _data.contadores[collection] !== undefined
      ? ++_data.contadores[collection]
      : (item.id || Utils.uid());
    const nuevo = { ...item, id, createdAt: item.createdAt || Utils.nowISO() };
    _data[collection].push(nuevo);
    audit('crear', collection, id);
    save();
    return nuevo;
  }

  function update(collection, id, cambios) {
    const arr = _data[collection] || [];
    const idx = arr.findIndex(x => x.id === Number(id));
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...cambios, updatedAt: Utils.nowISO() };
    audit('editar', collection, id);
    save();
    return arr[idx];
  }

  function remove(collection, id) {
    const arr = _data[collection] || [];
    const idx = arr.findIndex(x => x.id === Number(id));
    if (idx === -1) return false;
    arr.splice(idx, 1);
    audit('eliminar', collection, id);
    save();
    return true;
  }

  /* ---------- Sesión ---------- */
  function setSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id, usuario: user.usuario, nombre: user.nombre
    }));
  }
  function getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ---------- Auditoría ---------- */
  function audit(accion, entidad, entidadId, detalle = '') {
    if (!_data.auditoria) _data.auditoria = [];
    if (!_data.contadores.auditoria) _data.contadores.auditoria = 0;
    _data.contadores.auditoria += 1;
    const user = getSession();
    _data.auditoria.push({
      id: _data.contadores.auditoria,
      fecha: Utils.nowISO(),
      usuario: user?.usuario || 'sistema',
      accion, entidad, entidadId, detalle
    });
    if (_data.auditoria.length > 5000) _data.auditoria.splice(0, 1000);
  }

  /* ---------- Reglas de negocio ---------- */
  /* Verificar disponibilidad de habitación en rango */
  function estaDisponible(habitacionId, fechaIn, fechaOut, excluirReservaId = null) {
    const reservas = get('reservaciones').filter(r =>
      r.habitacionId === Number(habitacionId) &&
      ['pendiente','confirmada','checkin'].includes(r.estado) &&
      r.id !== excluirReservaId
    );
    return !reservas.some(r =>
      Utils.rangesOverlap(fechaIn, fechaOut, r.fechaIn, r.fechaOut)
    );
  }

  /* Habitaciones disponibles en un rango */
  function habitacionesDisponibles(fechaIn, fechaOut) {
    return get('habitaciones').filter(h => {
      if (['mantenimiento','fuera_servicio'].includes(h.estado)) return false;
      return estaDisponible(h.id, fechaIn, fechaOut);
    });
  }

  /* ---------- Caja ---------- */
  function cajaAbierta() {
    return get('cierresCaja').find(c => c.estado === 'abierta') ||
           get('movimientosCaja').find(m => m.tipo === 'apertura' &&
             !get('cierresCaja').some(c => c.id === m.cierreId));
  }

  function abrirCaja(fondoInicial) {
    const mov = insert('movimientosCaja', {
      tipo: 'apertura',
      monto: fondoInicial,
      metodo: 'efectivo',
      descripcion: 'Apertura de caja',
      fecha: Utils.nowISO()
    });
    return mov;
  }

  /* ---------- Dashboard ---------- */
  function stats() {
    const habs = get('habitaciones');
    const reservas = get('reservaciones');
    const estancias = get('estancias');
    const pagos = get('pagos');
    const hoy = Utils.todayISO();

    const totalHab = habs.length;
    const ocupadas = habs.filter(h => h.estado === 'ocupada').length;
    const disponibles = habs.filter(h => h.estado === 'disponible').length;
    const reservadas = habs.filter(h => h.estado === 'reservada').length;
    const sucias = habs.filter(h => h.estado === 'sucia').length;
    const mantenimiento = habs.filter(h => ['mantenimiento','fuera_servicio'].includes(h.estado)).length;
    const ocupacion = totalHab ? Math.round((ocupadas / totalHab) * 100) : 0;

    const llegadasHoy = reservas.filter(r => r.fechaIn?.startsWith(hoy) && ['confirmada','pendiente'].includes(r.estado));
    const salidasHoy = estancias.filter(e => e.fechaOut?.startsWith(hoy) && e.estado === 'activa');

    const ingresosHoy = pagos
      .filter(p => p.fecha?.startsWith(hoy) && p.tipo !== 'egreso')
      .reduce((s,p) => s + (Number(p.monto) || 0), 0);

    const ingresosMes = pagos
      .filter(p => p.fecha?.slice(0,7) === hoy.slice(0,7) && p.tipo !== 'egreso')
      .reduce((s,p) => s + (Number(p.monto) || 0), 0);

    const gastosMes = get('gastos')
      .filter(g => g.fecha?.slice(0,7) === hoy.slice(0,7))
      .reduce((s,g) => s + (Number(g.monto) || 0), 0);

    const pendientesCobro = estancias
      .filter(e => e.estado === 'activa')
      .reduce((s,e) => s + (Number(e.saldoPendiente) || 0), 0);

    return {
      totalHab, ocupadas, disponibles, reservadas, sucias, mantenimiento,
      ocupacion, llegadasHoy, salidasHoy,
      ingresosHoy, ingresosMes, gastosMes,
      utilidad: ingresosMes - gastosMes,
      pendientesCobro,
      huespedesAlojados: ocupadas
    };
  }

  /* ---------- API pública ---------- */
  return {
    init, save, reset, all,
    get, find, insert, update, remove,
    setSession, getSession, clearSession,
    audit,
    estaDisponible, habitacionesDisponibles,
    cajaAbierta, abrirCaja,
    stats
  };
})();
