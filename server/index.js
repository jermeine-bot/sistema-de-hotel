import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createStore, hashPassword, verifyPassword } from './store.js';
import { resolveBackupDir, resolveDbPath, resolveSeedPath, root } from './paths.js';
import { overlaps, nightsBetween, priceReservation, round2 } from './domain.js';

/* ------------------------------------------------------------------ */
/* Configuración general                                              */
/* ------------------------------------------------------------------ */

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const shouldOpen = process.argv.includes('--open');
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = resolveDbPath();
const BACKUP_DIR = resolveBackupDir();
const SEED_PATH = resolveSeedPath();
const VERSION = '2.1.0';

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  console.error(`\nFlambergers PMS necesita Node.js 22.13 o superior. Versión detectada: ${process.versions.node}\n`);
  process.exit(1);
}

const store = createStore({
  dbPath: DB_PATH,
  seedFile: SEED_PATH,
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
});

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function fail(status, message, extra = {}) {
  throw new HttpError(status, message, extra);
}

const now = () => new Date().toISOString();
const dateOnly = (value) => String(value ?? '').slice(0, 10);
const isDate = (value) => {
  if (!value) return false;
  const parsed = new Date(`${dateOnly(value)}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
};
const requireText = (value, label, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min) fail(422, `${label} es obligatorio${min > 1 ? ` (mínimo ${min} caracteres)` : ''}`);
  return value.trim();
};
const requireNumber = (value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    fail(422, `${label} inválido`);
  }
  return number;
};
const asBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'si' || value === 'sí';
};
const sanitizeInput = (body, { keepPassword = false } = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Datos inválidos');
  const copy = { ...body };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.passwordHash;
  if (!keepPassword) delete copy.password;
  return copy;
};
const sanitizeUser = (user) => {
  const { password, passwordHash, ...safe } = user;
  return safe;
};
const ensureUnique = (collection, field, value, excludeId, label = 'valor') => {
  if (value === undefined || value === null || value === '') return;
  const duplicate = store.all(collection).some((row) =>
    String(row.id) !== String(excludeId ?? '') &&
    String(row[field] ?? '').trim().toLowerCase() === String(value).trim().toLowerCase()
  );
  if (duplicate) fail(409, `Ya existe un registro con ese ${label}`);
};

const COLLECTIONS = [
  'config', 'usuarios', 'tiposHabitacion', 'habitaciones', 'huespedes', 'reservaciones',
  'estancias', 'consumos', 'pagos', 'movimientosCaja', 'cierresCaja', 'facturas',
  'servicios', 'productos', 'proveedores', 'compras', 'movimientosInventario',
  'tareasLimpieza', 'incidenciasMantenimiento', 'gastos', 'metodosPago', 'auditoria',
];

const ROLES = ['admin', 'gerente', 'recepcion', 'limpieza', 'inventario', 'contabilidad', 'auditor'];
const ROOM_STATES = ['disponible', 'ocupada', 'reservada', 'sucia', 'mantenimiento', 'fuera_servicio'];
const RESERVATION_STATES = ['pendiente', 'confirmada', 'checkin', 'checkout', 'cancelada', 'no_show'];
const TASK_STATES = ['pendiente', 'en_progreso', 'finalizada'];
const INCIDENT_STATES = ['abierta', 'en_progreso', 'resuelta'];
const INVOICE_STATES = ['emitida', 'pagada', 'anulada'];

const ROLE_COLLECTIONS = {
  admin: new Set(COLLECTIONS),
  gerente: new Set(COLLECTIONS),
  recepcion: new Set([
    'config', 'tiposHabitacion', 'habitaciones', 'huespedes', 'reservaciones', 'estancias',
    'consumos', 'pagos', 'servicios', 'metodosPago', 'tareasLimpieza', 'incidenciasMantenimiento',
  ]),
  limpieza: new Set(['habitaciones', 'tareasLimpieza', 'incidenciasMantenimiento', 'config']),
  inventario: new Set(['productos', 'proveedores', 'compras', 'movimientosInventario', 'config']),
  contabilidad: new Set([
    'config', 'habitaciones', 'tiposHabitacion', 'reservaciones', 'estancias', 'consumos', 'pagos',
    'movimientosCaja', 'cierresCaja', 'facturas', 'gastos', 'servicios', 'metodosPago', 'productos',
  ]),
  auditor: new Set([
    'config', 'habitaciones', 'tiposHabitacion', 'reservaciones', 'estancias', 'consumos', 'pagos',
    'movimientosCaja', 'cierresCaja', 'facturas', 'gastos', 'servicios', 'metodosPago', 'productos',
    'auditoria',
  ]),
};

function canAccess(role, collection) {
  if (role === 'admin' || role === 'gerente') return true;
  return ROLE_COLLECTIONS[role]?.has(collection) ?? false;
}

function ensureAccess(role, collection) {
  if (!canAccess(role, collection)) fail(403, 'No tiene permiso para este módulo');
}

function requireRole(req, ...roles) {
  if (!roles.includes(req.user?.rol)) fail(403, 'Permiso insuficiente');
}

/* ------------------------------------------------------------------ */
/* Autenticación                                                      */
/* ------------------------------------------------------------------ */

function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(path.dirname(DB_PATH), '.session-secret');
  try {
    if (fs.existsSync(file)) {
      const stored = fs.readFileSync(file, 'utf8').trim();
      if (stored) return stored;
    }
    const generated = randomBytes(32).toString('hex');
    fs.writeFileSync(file, generated, { mode: 0o600 });
    return generated;
  } catch {
    console.warn('No se pudo guardar el secreto de sesión; las sesiones se invalidarán al reiniciar.');
    return randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = loadSessionSecret();
const loginAttempts = new Map();

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    usuario: user.usuario,
    nombre: user.nombre,
    rol: user.rol,
    iat: Date.now(),
    exp: Date.now() + 12 * 3600 * 1000,
  })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return res.status(401).json({ error: 'Sesión inválida o vencida' });
  try {
    const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('firma');
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!user.exp || user.exp < Date.now()) throw new Error('expirado');
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}

/* ------------------------------------------------------------------ */
/* Preparación de registros                                           */
/* ------------------------------------------------------------------ */

const configRecord = () => store.all('config')[0] || { id: 'main', impuesto: 0, moneda: 'NIO' };
const findRoom = (id) => store.get('habitaciones', id);
const findGuest = (id) => store.get('huespedes', id);
const findStay = (id) => store.get('estancias', id);
const findReservation = (id) => store.get('reservaciones', id);
const findService = (id) => store.get('servicios', id);
const findProduct = (id) => store.get('productos', id);

function prepareRoom(input, current) {
  const record = { ...current, ...input };
  record.numero = requireText(record.numero, 'El número de habitación');
  ensureUnique('habitaciones', 'numero', record.numero, current?.id, 'número de habitación');
  const typeId = Number(record.tipoId);
  if (!Number.isInteger(typeId) || !store.get('tiposHabitacion', typeId)) fail(422, 'El tipo de habitación no existe');
  record.tipoId = typeId;
  record.capacidad = requireNumber(record.capacidad, 'La capacidad', { min: 1, integer: true });
  record.camas = requireNumber(record.camas ?? 1, 'El número de camas', { min: 1, integer: true });
  record.precioNoche = requireNumber(record.precioNoche, 'La tarifa por noche', { min: 0 });
  record.precioHora = requireNumber(record.precioHora ?? 0, 'La tarifa por hora', { min: 0 });
  record.estado = ROOM_STATES.includes(record.estado) ? record.estado : 'disponible';
  record.activo = asBool(record.activo, true);
  return record;
}

function prepareGuest(input, current) {
  const record = { ...current, ...input };
  record.nombre = requireText(record.nombre, 'El nombre');
  record.apellido = typeof record.apellido === 'string' ? record.apellido.trim() : '';
  record.documento = typeof record.documento === 'string' ? record.documento.trim() : '';
  record.telefono = typeof record.telefono === 'string' ? record.telefono.trim() : '';
  record.correo = typeof record.correo === 'string' ? record.correo.trim() : '';
  record.pais = typeof record.pais === 'string' ? record.pais.trim() : 'Nicaragua';
  record.activo = asBool(record.activo, true);
  return record;
}

function prepareReservation(input, current) {
  const data = { ...current, ...input };
  const guestId = Number(data.huespedId);
  if (!Number.isInteger(guestId) || !findGuest(guestId)) fail(422, 'El huésped seleccionado no existe');
  const roomId = Number(data.habitacionId);
  const room = findRoom(roomId);
  if (!room || room.activo === false) fail(422, 'La habitación seleccionada no existe o está inactiva');
  const fechaIn = dateOnly(data.fechaIn);
  const fechaOut = dateOnly(data.fechaOut);
  if (!isDate(fechaIn) || !isDate(fechaOut) || nightsBetween(fechaIn, fechaOut) < 1) {
    fail(422, 'Las fechas de entrada y salida son inválidas');
  }
  const numHuespedes = requireNumber(data.numHuespedes ?? 1, 'El número de personas', { min: 1, integer: true });
  if (numHuespedes > Number(room.capacidad)) fail(422, 'La ocupación supera la capacidad de la habitación');
  if (['mantenimiento', 'fuera_servicio'].includes(room.estado)) fail(409, 'La habitación no está operativa');

  const estado = RESERVATION_STATES.includes(data.estado) ? data.estado : 'pendiente';
  if (current && ['checkout', 'cancelada', 'no_show'].includes(current.estado)) {
    fail(409, 'No se puede editar una reserva cerrada');
  }
  const activeStay = store.all('estancias').some((stay) => Number(stay.reservacionId) === Number(current?.id) && stay.estado === 'activa');
  if (activeStay && (Number(current?.habitacionId) !== roomId || dateOnly(current?.fechaIn) !== fechaIn || dateOnly(current?.fechaOut) !== fechaOut)) {
    fail(409, 'No se puede modificar una reserva con una estancia activa');
  }
  if (activeStay && current?.estado && input.estado && input.estado !== current.estado) {
    fail(409, 'No se puede cambiar el estado de una reserva con una estancia activa');
  }

  if (!['cancelada', 'no_show', 'checkout', 'finalizada'].includes(estado)) {
    const conflict = store.all('reservaciones').some((other) =>
      String(other.id) !== String(current?.id ?? '') &&
      Number(other.habitacionId) === roomId &&
      !['cancelada', 'no_show', 'checkout', 'finalizada'].includes(other.estado) &&
      overlaps(fechaIn, fechaOut, other.fechaIn, other.fechaOut)
    );
    if (conflict) fail(409, 'La habitación ya tiene una reserva en ese rango');
  }

  const payments = current
    ? store.all('pagos').filter((payment) => Number(payment.reservacionId) === Number(current.id))
    : [];
  const paid = current
    ? (payments.length
      ? payments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0)
      : Number(current.anticipo || 0))
    : Number(data.anticipo || 0);
  if (current && ['cancelada', 'no_show'].includes(estado) && payments.length > 0) {
    fail(409, 'La reserva tiene pagos registrados; la cancelación requiere un ajuste financiero autorizado');
  }

  const nights = nightsBetween(fechaIn, fechaOut);
  let pricing;
  try {
    pricing = priceReservation({
      nights,
      rate: Number(room.precioNoche),
      discount: Number(data.descuento || 0),
      taxRate: Number(configRecord().impuesto || 0),
      advance: paid,
    });
  } catch (error) {
    fail(422, error.message);
  }

  return {
    ...data,
    huespedId: guestId,
    habitacionId: roomId,
    fechaIn,
    fechaOut,
    numHuespedes,
    estado,
    anticipo: current ? Number(current.anticipo || 0) : Number(data.anticipo || 0),
    noches: nights,
    tarifaNoche: Number(room.precioNoche),
    ...pricing,
  };
}

function preparePayment(input) {
  const data = { ...input };
  const monto = requireNumber(data.monto, 'El monto', { min: 0.01 });
  const fecha = data.fecha ? new Date(data.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) fail(422, 'La fecha del pago es inválida');

  let stay = null;
  let reservation = null;
  if (data.estanciaId !== undefined && data.estanciaId !== '') {
    stay = findStay(data.estanciaId);
    if (!stay) fail(422, 'La estancia no existe');
    if (!['activa', 'finalizada'].includes(stay.estado)) fail(409, 'La estancia no admite pagos');
  }
  if (data.reservacionId !== undefined && data.reservacionId !== '') {
    reservation = findReservation(data.reservacionId);
    if (!reservation) fail(422, 'La reserva no existe');
  }
  if (!reservation && stay) reservation = findReservation(stay.reservacionId);
  if (stay && reservation && Number(stay.reservacionId) !== Number(reservation.id)) {
    fail(422, 'La estancia no pertenece a la reserva indicada');
  }

  const targetBalance = stay
    ? Number(stay.saldoPendiente || 0)
    : reservation
      ? Number(reservation.saldoPendiente || 0)
      : null;
  if (targetBalance !== null && monto > round2(targetBalance) + 0.005) {
    fail(422, `El pago supera el saldo pendiente (${targetBalance.toFixed(2)})`);
  }
  if (targetBalance !== null && targetBalance <= 0.005) {
    fail(409, 'El registro seleccionado no tiene saldo pendiente');
  }

  return {
    record: {
      ...data,
      monto: round2(monto),
      fecha: fecha.toISOString(),
      metodo: data.metodo || 'Efectivo',
      tipo: data.tipo || 'pago',
      estanciaId: stay?.id,
      reservacionId: reservation?.id,
    },
    stay,
    reservation,
    targetBalance,
  };
}

function prepareConsumption(input) {
  const stay = findStay(input.estanciaId);
  if (!stay) fail(422, 'La estancia no existe');
  if (stay.estado !== 'activa') fail(409, 'Solo se pueden registrar consumos en estancias activas');
  const service = findService(input.servicioId);
  if (!service) fail(422, 'El servicio no existe');
  const cantidad = requireNumber(input.cantidad, 'La cantidad', { min: 0.01 });
  const fecha = input.fecha ? new Date(input.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) fail(422, 'La fecha del consumo es inválida');
  const total = round2(Number(service.precio || 0) * cantidad);
  return {
    record: {
      ...input,
      estanciaId: stay.id,
      servicioId: service.id,
      cantidad,
      precioUnitario: Number(service.precio || 0),
      total,
      fecha: fecha.toISOString(),
      descripcion: input.descripcion || service.nombre,
    },
    stay,
    reservation: findReservation(stay.reservacionId),
    service,
    total,
  };
}

function preparePurchase(input) {
  const product = findProduct(input.productoId);
  if (!product) fail(422, 'El producto no existe');
  const cantidad = requireNumber(input.cantidad, 'La cantidad', { min: 0.01 });
  const costoUnitario = requireNumber(input.costoUnitario ?? input.costo ?? 0, 'El costo unitario', { min: 0 });
  const fecha = input.fecha ? new Date(input.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) fail(422, 'La fecha de la compra es inválida');
  return {
    record: {
      ...input,
      productoId: product.id,
      cantidad,
      costoUnitario,
      total: round2(cantidad * costoUnitario),
      fecha: fecha.toISOString(),
    },
    product,
  };
}

function prepareInventoryMovement(input) {
  const product = findProduct(input.productoId);
  if (!product) fail(422, 'El producto no existe');
  const tipo = ['entrada', 'salida', 'ajuste'].includes(input.tipo) ? input.tipo : 'ajuste';
  const stockAntes = Number(product.stock || 0);
  let stockDespues;

  if (tipo === 'ajuste' && input.stockNuevo !== undefined && input.stockNuevo !== '') {
    stockDespues = requireNumber(input.stockNuevo, 'El stock nuevo', { min: 0 });
  } else {
    const cantidad = requireNumber(input.cantidad, 'La cantidad', { min: 0.01 });
    const direction = input.direccion === 'salida' || tipo === 'salida' ? 'salida' : 'entrada';
    stockDespues = direction === 'salida' ? stockAntes - cantidad : stockAntes + cantidad;
    if (stockDespues < 0) fail(409, 'El movimiento dejaría el stock en negativo');
  }

  const delta = round2(stockDespues - stockAntes);
  const fecha = input.fecha ? new Date(input.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) fail(422, 'La fecha del movimiento es inválida');
  return {
    record: {
      ...input,
      productoId: product.id,
      tipo,
      cantidad: Math.abs(delta),
      direccion: delta >= 0 ? 'entrada' : 'salida',
      stockAntes,
      stockDespues,
      motivo: input.motivo || 'Ajuste manual',
      fecha: fecha.toISOString(),
    },
    product,
    stockDespues,
  };
}

function prepareCashMovement(input) {
  const tipo = input.tipo === 'egreso' ? 'egreso' : 'ingreso';
  const monto = requireNumber(input.monto, 'El monto', { min: 0.01 });
  const fecha = input.fecha ? new Date(input.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) fail(422, 'La fecha del movimiento es inválida');
  return {
    record: {
      ...input,
      tipo,
      monto: round2(monto),
      metodo: input.metodo || 'Efectivo',
      descripcion: input.descripcion || 'Movimiento de caja',
      fecha: fecha.toISOString(),
    },
  };
}

function prepareClosure(input) {
  const previous = [...store.all('cierresCaja')].sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)))[0];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const desde = input.desde
    ? new Date(String(input.desde).length <= 10 ? `${input.desde}T00:00:00` : input.desde)
    : new Date(previous?.hasta || startOfMonth);
  const hasta = input.hasta
    ? new Date(String(input.hasta).length <= 10 ? `${input.hasta}T23:59:59.999` : input.hasta)
    : new Date();
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) fail(422, 'El rango del cierre es inválido');
  if (hasta <= desde) fail(422, 'La fecha final debe ser posterior a la inicial');

  const payments = store.all('pagos').filter((payment) => {
    const at = new Date(payment.fecha);
    return at >= desde && at <= hasta;
  });
  const movements = store.all('movimientosCaja').filter((movement) => {
    const at = new Date(movement.fecha);
    return at >= desde && at <= hasta;
  });
  const totalPagos = round2(payments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0));
  const totalIngresos = round2(movements.filter((m) => m.tipo === 'ingreso').reduce((sum, m) => sum + Number(m.monto || 0), 0));
  const totalEgresos = round2(movements.filter((m) => m.tipo === 'egreso').reduce((sum, m) => sum + Number(m.monto || 0), 0));

  return {
    record: {
      ...input,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      totalPagos,
      cantidadPagos: payments.length,
      totalIngresos,
      totalEgresos,
      cantidadMovimientos: movements.length,
      totalCaja: round2(totalPagos + totalIngresos - totalEgresos),
      cerradoPor: input.cerradoPor || '',
      fecha: now(),
    },
    payments,
    movements,
  };
}

function prepareCleaning(input, current) {
  const data = { ...current, ...input };
  const room = findRoom(data.habitacionId);
  if (!room) fail(422, 'La habitación no existe');
  const estado = TASK_STATES.includes(data.estado) ? data.estado : 'pendiente';
  const record = {
    ...data,
    habitacionId: Number(room.id),
    estado,
    prioridad: ['baja', 'media', 'alta', 'urgente'].includes(data.prioridad) ? data.prioridad : 'media',
    fecha: data.fecha ? dateOnly(data.fecha) : dateOnly(now()),
  };
  const context = {};
  if (current && estado === 'finalizada' && current.estado !== 'finalizada') {
    record.fechaFin = now();
    const activeStay = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(room.id) && stay.estado === 'activa');
    if (!activeStay && !['mantenimiento', 'fuera_servicio'].includes(room.estado)) {
      context.roomUpdate = { id: room.id, estado: 'disponible' };
    }
  }
  if (current && estado !== 'finalizada' && current.estado === 'finalizada') record.fechaFin = null;
  return { record, context };
}

function prepareIncident(input, current) {
  const data = { ...current, ...input };
  const room = findRoom(data.habitacionId);
  if (!room) fail(422, 'La habitación no existe');
  const estado = INCIDENT_STATES.includes(data.estado) ? data.estado : 'abierta';
  const record = {
    ...data,
    habitacionId: Number(room.id),
    estado,
    prioridad: ['baja', 'media', 'alta', 'urgente'].includes(data.prioridad) ? data.prioridad : 'media',
    fecha: data.fecha ? dateOnly(data.fecha) : dateOnly(now()),
  };
  const context = {};
  const activeStay = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(room.id) && stay.estado === 'activa');
  if (!current) {
    if (!activeStay && room.estado !== 'fuera_servicio') context.roomUpdate = { id: room.id, estado: 'mantenimiento' };
  } else if (estado === 'resuelta' && current.estado !== 'resuelta') {
    record.fechaResolucion = now();
    if (!activeStay && room.estado === 'mantenimiento') context.roomUpdate = { id: room.id, estado: 'disponible' };
  } else if (estado !== 'resuelta' && current.estado === 'resuelta') {
    record.fechaResolucion = null;
    if (!activeStay && room.estado !== 'fuera_servicio') context.roomUpdate = { id: room.id, estado: 'mantenimiento' };
  }
  return { record, context };
}

function prepareUser(input, current) {
  const data = { ...current, ...input };
  const usuario = requireText(data.usuario, 'El usuario', 3).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(usuario)) fail(422, 'El usuario solo puede contener letras, números, punto, guion y guion bajo');
  ensureUnique('usuarios', 'usuario', usuario, current?.id, 'nombre de usuario');
  const nombre = requireText(data.nombre, 'El nombre');
  const rol = ROLES.includes(data.rol) ? data.rol : 'recepcion';
  const activo = asBool(data.activo, true);

  if (!current) {
    const password = requireText(data.password, 'La contraseña', 8);
    return {
      ...data,
      usuario,
      nombre,
      rol,
      activo,
      passwordHash: hashPassword(password),
      password: undefined,
      ultimoAcceso: data.ultimoAcceso || null,
    };
  }

  const next = { ...data, usuario, nombre, rol, activo };
  if (data.password) {
    requireText(data.password, 'La contraseña', 8);
    next.passwordHash = hashPassword(data.password);
  }
  next.password = undefined;

  const activeAdmins = store.all('usuarios').filter((user) => user.rol === 'admin' && user.activo !== false);
  if (activeAdmins.length <= 1 && activeAdmins.some((user) => String(user.id) === String(current.id)) && (rol !== 'admin' || !activo)) {
    fail(409, 'No se puede desactivar o cambiar el rol del último administrador');
  }
  return next;
}

function prepareInvoice(input, current) {
  const data = { ...current, ...input };
  const monto = requireNumber(data.monto, 'El monto', { min: 0.01 });
  const estado = INVOICE_STATES.includes(data.estado) ? data.estado : 'emitida';
  const reservacionId = data.reservacionId ? Number(data.reservacionId) : null;
  if (reservacionId && !findReservation(reservacionId)) fail(422, 'La reserva no existe');
  return { ...data, monto: round2(monto), estado, reservacionId, fecha: data.fecha ? dateOnly(data.fecha) : dateOnly(now()) };
}

function prepareExpense(input, current) {
  const data = { ...current, ...input };
  const monto = requireNumber(data.monto, 'El monto', { min: 0.01 });
  return {
    ...data,
    descripcion: requireText(data.descripcion, 'La descripción'),
    monto: round2(monto),
    fecha: data.fecha ? dateOnly(data.fecha) : dateOnly(now()),
  };
}

/* ------------------------------------------------------------------ */
/* Creación y edición                                                 */
/* ------------------------------------------------------------------ */

function buildCreate(collection, input, user) {
  const id = store.nextId(collection);
  let record = { ...input, id, createdAt: now(), updatedAt: now() };
  const context = {};

  switch (collection) {
    case 'usuarios':
      record = { ...record, ...prepareUser(input) };
      break;
    case 'tiposHabitacion': {
      record.nombre = requireText(record.nombre, 'El nombre');
      ensureUnique('tiposHabitacion', 'nombre', record.nombre, null, 'nombre');
      record.capacidad = requireNumber(record.capacidad, 'La capacidad', { min: 1, integer: true });
      record.precioBase = requireNumber(record.precioBase, 'El precio base', { min: 0 });
      record.activo = asBool(record.activo, true);
      break;
    }
    case 'habitaciones':
      record = { ...record, ...prepareRoom(input) };
      break;
    case 'huespedes':
      record = { ...record, ...prepareGuest(input) };
      break;
    case 'reservaciones': {
      const prepared = prepareReservation(input);
      record = { ...record, ...prepared };
      if (Number(record.anticipo || 0) > 0) {
        context.advancePayment = {
          id: store.nextId('pagos'),
          reservacionId: record.id,
          monto: Number(record.anticipo),
          metodo: record.metodoPago || 'Efectivo',
          tipo: 'anticipo',
          fecha: record.createdAt,
          referencia: `Anticipo reserva ${record.id}`,
          createdAt: now(),
          updatedAt: now(),
        };
      }
      break;
    }
    case 'consumos': {
      const prepared = prepareConsumption(input);
      record = { ...record, ...prepared.record };
      context.consumption = { record, stay: prepared.stay, reservation: prepared.reservation };
      break;
    }
    case 'pagos': {
      const prepared = preparePayment(input);
      record = { ...record, ...prepared.record };
      context.payment = { record, stay: prepared.stay, reservation: prepared.reservation };
      break;
    }
    case 'movimientosCaja':
      record = { ...record, ...prepareCashMovement(input).record };
      break;
    case 'cierresCaja':
      record = { ...record, ...prepareClosure(input).record };
      break;
    case 'facturas':
      record = { ...record, ...prepareInvoice(input) };
      record.numero = record.numero || `F-${String(record.id).padStart(6, '0')}`;
      break;
    case 'servicios':
      record.nombre = requireText(record.nombre, 'El nombre');
      record.precio = requireNumber(record.precio ?? 0, 'El precio', { min: 0 });
      record.categoria = record.categoria || 'servicio';
      record.activo = asBool(record.activo, true);
      break;
    case 'productos':
      record.nombre = requireText(record.nombre, 'El nombre');
      record.codigo = typeof record.codigo === 'string' ? record.codigo.trim() : '';
      if (record.codigo) ensureUnique('productos', 'codigo', record.codigo, null, 'código');
      record.stock = requireNumber(record.stock ?? 0, 'El stock', { min: 0 });
      record.stockMinimo = requireNumber(record.stockMinimo ?? 0, 'El stock mínimo', { min: 0 });
      record.costo = requireNumber(record.costo ?? 0, 'El costo', { min: 0 });
      record.activo = asBool(record.activo, true);
      break;
    case 'proveedores':
      record.nombre = requireText(record.nombre, 'El nombre');
      record.activo = asBool(record.activo, true);
      break;
    case 'compras': {
      const prepared = preparePurchase(input);
      record = { ...record, ...prepared.record, usuario: user.usuario };
      context.purchase = { record, product: prepared.product };
      break;
    }
    case 'movimientosInventario': {
      const prepared = prepareInventoryMovement(input);
      record = { ...record, ...prepared.record, usuario: user.usuario };
      context.movement = { record, product: prepared.product, stockDespues: prepared.stockDespues };
      break;
    }
    case 'tareasLimpieza': {
      const prepared = prepareCleaning(input);
      record = { ...record, ...prepared.record };
      context.roomUpdate = prepared.context.roomUpdate;
      break;
    }
    case 'incidenciasMantenimiento': {
      const prepared = prepareIncident(input);
      record = { ...record, ...prepared.record };
      context.roomUpdate = prepared.context.roomUpdate;
      break;
    }
    case 'gastos':
      record = { ...record, ...prepareExpense(input) };
      break;
    case 'metodosPago':
      record.nombre = requireText(record.nombre, 'El nombre');
      ensureUnique('metodosPago', 'nombre', record.nombre, null, 'nombre');
      record.activo = asBool(record.activo, true);
      break;
    default:
      fail(400, 'No se permite crear este recurso');
  }

  return { record, context };
}

function buildPatch(collection, current, input, user) {
  const next = { ...current, ...input, id: current.id, updatedAt: now() };
  const context = {};

  switch (collection) {
    case 'usuarios':
      return { record: { ...next, ...prepareUser(input, current), updatedAt: now() }, context };
    case 'tiposHabitacion': {
      const record = { ...next };
      record.nombre = requireText(record.nombre, 'El nombre');
      ensureUnique('tiposHabitacion', 'nombre', record.nombre, current.id, 'nombre');
      record.capacidad = requireNumber(record.capacidad, 'La capacidad', { min: 1, integer: true });
      record.precioBase = requireNumber(record.precioBase, 'El precio base', { min: 0 });
      record.activo = asBool(record.activo, true);
      return { record, context };
    }
    case 'habitaciones': {
      const record = { ...next, ...prepareRoom(input, current) };
      const activeStay = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(current.id) && stay.estado === 'activa');
      if (activeStay && (record.estado !== 'ocupada' || record.activo === false)) {
        fail(409, 'La habitación tiene una estancia activa');
      }
      return { record, context };
    }
    case 'huespedes':
      return { record: { ...next, ...prepareGuest(input, current), updatedAt: now() }, context };
    case 'reservaciones': {
      return { record: { ...next, ...prepareReservation(input, current), updatedAt: now() }, context };
    }
    case 'estancias': {
      const record = { ...next };
      if (record.estado !== current.estado) fail(409, 'Use el check-out para finalizar la estancia');
      if (!isDate(record.fechaOut) || dateOnly(record.fechaOut) < dateOnly(current.fechaIn)) fail(422, 'La fecha de salida es inválida');
      record.fechaOut = dateOnly(record.fechaOut);
      if (!['admin', 'gerente'].includes(user.rol)) record.saldoPendiente = current.saldoPendiente;
      record.habitacionId = current.habitacionId;
      record.huespedId = current.huespedId;
      record.reservacionId = current.reservacionId;
      return { record, context };
    }
    case 'productos': {
      const record = { ...next };
      record.nombre = requireText(record.nombre, 'El nombre');
      record.codigo = typeof record.codigo === 'string' ? record.codigo.trim() : '';
      if (record.codigo) ensureUnique('productos', 'codigo', record.codigo, current.id, 'código');
      record.stock = requireNumber(record.stock ?? 0, 'El stock', { min: 0 });
      record.stockMinimo = requireNumber(record.stockMinimo ?? 0, 'El stock mínimo', { min: 0 });
      record.costo = requireNumber(record.costo ?? 0, 'El costo', { min: 0 });
      record.activo = asBool(record.activo, true);
      const stockAntes = Number(current.stock || 0);
      const stockDespues = Number(record.stock);
      if (stockDespues !== stockAntes) {
        context.stockMovement = {
          id: store.nextId('movimientosInventario'),
          productoId: current.id,
          tipo: 'ajuste',
          cantidad: Math.abs(stockDespues - stockAntes),
          direccion: stockDespues >= stockAntes ? 'entrada' : 'salida',
          stockAntes,
          stockDespues,
          motivo: 'Ajuste desde ficha de producto',
          usuario: user.usuario,
          fecha: now(),
          createdAt: now(),
        };
      }
      return { record, context };
    }
    case 'proveedores':
      return { record: { ...next, nombre: requireText(next.nombre, 'El nombre'), activo: asBool(next.activo, true) }, context };
    case 'compras':
    case 'movimientosInventario':
    case 'pagos':
    case 'movimientosCaja':
    case 'cierresCaja':
    case 'consumos':
    case 'auditoria':
      fail(403, 'Este registro no se puede modificar');
      break;
    case 'servicios': {
      const record = { ...next };
      record.nombre = requireText(record.nombre, 'El nombre');
      record.precio = requireNumber(record.precio ?? 0, 'El precio', { min: 0 });
      record.categoria = record.categoria || 'servicio';
      record.activo = asBool(record.activo, true);
      return { record, context };
    }
    case 'tareasLimpieza': {
      const prepared = prepareCleaning(input, current);
      return { record: { ...next, ...prepared.record, updatedAt: now() }, context: prepared.context };
    }
    case 'incidenciasMantenimiento': {
      const prepared = prepareIncident(input, current);
      return { record: { ...next, ...prepared.record, updatedAt: now() }, context: prepared.context };
    }
    case 'gastos':
      return { record: { ...next, ...prepareExpense(input, current), updatedAt: now() }, context };
    case 'facturas': {
      const record = { ...next, ...prepareInvoice(input, current), updatedAt: now() };
      record.numero = current.numero || `F-${String(current.id).padStart(6, '0')}`;
      return { record, context };
    }
    case 'metodosPago': {
      const record = { ...next };
      record.nombre = requireText(record.nombre, 'El nombre');
      ensureUnique('metodosPago', 'nombre', record.nombre, current.id, 'nombre');
      record.activo = asBool(record.activo, true);
      return { record, context };
    }
    default:
      fail(400, 'No se permite modificar este recurso');
  }
  return { record: next, context };
}

function applyPayment({ record, stay, reservation }) {
  if (stay) {
    const balance = Math.max(0, round2(Number(stay.saldoPendiente || 0) - Number(record.monto)));
    store.put('estancias', { ...stay, saldoPendiente: balance, updatedAt: now() });
  }
  if (reservation) {
    const balance = Math.max(0, round2(Number(reservation.saldoPendiente || 0) - Number(record.monto)));
    store.put('reservaciones', { ...reservation, saldoPendiente: balance, updatedAt: now() });
    if (!stay) {
      const activeStays = store.all('estancias').filter((item) => Number(item.reservacionId) === Number(reservation.id) && item.estado === 'activa');
      if (activeStays.length === 1) {
        const active = activeStays[0];
        store.put('estancias', {
          ...active,
          saldoPendiente: Math.max(0, round2(Number(active.saldoPendiente || 0) - Number(record.monto))),
          updatedAt: now(),
        });
      }
    }
  }
}

function applyConsumption({ record, stay, reservation }) {
  store.put('estancias', {
    ...stay,
    saldoPendiente: round2(Number(stay.saldoPendiente || 0) + Number(record.total || 0)),
    updatedAt: now(),
  });
  if (reservation) {
    store.put('reservaciones', {
      ...reservation,
      saldoPendiente: round2(Number(reservation.saldoPendiente || 0) + Number(record.total || 0)),
      updatedAt: now(),
    });
  }
}

function applyPurchase({ record, product }) {
  const stock = round2(Number(product.stock || 0) + Number(record.cantidad || 0));
  store.put('productos', {
    ...product,
    stock,
    costo: Number(record.costoUnitario) || product.costo,
    updatedAt: now(),
  });
  store.put('movimientosInventario', {
    id: store.nextId('movimientosInventario'),
    productoId: product.id,
    tipo: 'entrada',
    cantidad: Number(record.cantidad),
    direccion: 'entrada',
    stockAntes: Number(product.stock || 0),
    stockDespues: stock,
    motivo: `Compra #${record.id}`,
    referencia: String(record.id),
    usuario: record.usuario || 'sistema',
    fecha: record.fecha || now(),
    createdAt: now(),
  });
}

function applyRoomUpdate(update) {
  if (!update) return;
  const room = findRoom(update.id);
  if (room) store.put('habitaciones', { ...room, estado: update.estado, updatedAt: now() });
}

/* ------------------------------------------------------------------ */
/* Aplicación Express                                                 */
/* ------------------------------------------------------------------ */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set('trust proxy', value === 'true' ? true : Number(value) || value);
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    node: process.versions.node,
    platform: process.platform,
    uptime: Math.round(process.uptime()),
    time: now(),
  });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'local';
  const current = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, since: current };
  if (current - attempt.since > 15 * 60 * 1000) {
    attempt.count = 0;
    attempt.since = current;
  }
  if (attempt.count >= 10) {
    return res.status(429).json({ error: 'Demasiados intentos. Espere 15 minutos e intente de nuevo.' });
  }

  const { usuario, password } = req.body || {};
  if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario.trim() || !password) {
    return res.status(400).json({ error: 'Ingrese usuario y contraseña' });
  }

  const user = store.all('usuarios').find((item) => item.usuario === usuario.trim().toLowerCase() && item.activo !== false && verifyPassword(item, password));
  if (!user) {
    attempt.count += 1;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  loginAttempts.delete(ip);
  const updated = {
    ...user,
    passwordHash: hashPassword(password),
    password: undefined,
    ultimoAcceso: now(),
    updatedAt: now(),
  };
  store.put('usuarios', updated);
  store.audit({ user: user.usuario, action: 'login', collection: 'usuarios', recordId: user.id });
  res.json({
    token: createToken(user),
    user: { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol },
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = store.get('usuarios', req.user.id);
  if (!user || user.activo === false) return res.status(401).json({ error: 'Usuario no disponible' });
  res.json({ user: sanitizeUser(user) });
});

app.use('/api', auth);

/* --------------------------- Bootstrap --------------------------- */

app.get('/api/bootstrap', (req, res) => {
  const role = req.user.rol || 'recepcion';
  const data = {};
  for (const collection of COLLECTIONS) {
    if (collection === 'auditoria') {
      data.auditoria = canAccess(role, 'auditoria') ? store.auditList(500) : [];
    } else {
      data[collection] = canAccess(role, collection) ? store.all(collection) : [];
    }
  }
  // Catálogos y datos operativos que todas las pantallas necesitan.
  for (const collection of ['config', 'tiposHabitacion', 'habitaciones', 'servicios', 'metodosPago']) {
    data[collection] = store.all(collection);
  }
  data.usuarios = store.all('usuarios').map(sanitizeUser);
  res.json(data);
});

/* --------------------------- Configuración --------------------------- */

app.patch('/api/config/main', (req, res) => {
  requireRole(req, 'admin', 'gerente');
  const current = configRecord();
  const input = sanitizeInput(req.body);
  const next = { ...current, ...input, id: 'main', updatedAt: now() };
  if (next.nombre !== undefined) next.nombre = requireText(next.nombre, 'El nombre del hotel');
  if (next.impuesto !== undefined) next.impuesto = requireNumber(next.impuesto, 'El impuesto', { min: 0, max: 100 });
  if (next.propina !== undefined) next.propina = requireNumber(next.propina, 'La propina', { min: 0, max: 100 });
  store.put('config', next);
  store.audit({ user: req.user.usuario, action: 'editar', collection: 'config', recordId: 'main' });
  res.json(next);
});

/* --------------------------- Reportes --------------------------- */

app.get('/api/reportes', (req, res) => {
  requireRole(req, 'admin', 'gerente', 'contabilidad', 'auditor');
  const hasta = req.query.hasta ? new Date(`${req.query.hasta}T23:59:59`) : new Date();
  const desde = req.query.desde ? new Date(`${req.query.desde}T00:00:00`) : new Date(hasta.getTime() - 29 * 86400000);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta < desde) {
    return res.status(422).json({ error: 'Rango de fechas inválido' });
  }

  const inRange = (value) => {
    const at = new Date(value);
    return !Number.isNaN(at.getTime()) && at >= desde && at <= hasta;
  };
  const payments = store.all('pagos').filter((item) => inRange(item.fecha));
  const movements = store.all('movimientosCaja').filter((item) => inRange(item.fecha));
  const expenses = store.all('gastos').filter((item) => inRange(item.fecha));
  const consumptions = store.all('consumos').filter((item) => inRange(item.fecha));
  const reservations = store.all('reservaciones');
  const stays = store.all('estancias');
  const rooms = store.all('habitaciones').filter((room) => room.activo !== false);
  const products = store.all('productos');
  const services = store.all('servicios');

  const totalPagos = round2(payments.reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const totalIngresos = round2(movements.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const totalEgresos = round2(movements.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const totalGastos = round2(expenses.reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const saldoPendiente = round2(reservations.filter((item) => !['cancelada', 'no_show'].includes(item.estado)).reduce((sum, item) => sum + Number(item.saldoPendiente || 0), 0));

  const byMethod = {};
  for (const payment of payments) {
    const key = payment.metodo || 'Otro';
    byMethod[key] = round2((byMethod[key] || 0) + Number(payment.monto || 0));
  }
  const byDay = {};
  for (const payment of payments) {
    const key = dateOnly(payment.fecha);
    byDay[key] = round2((byDay[key] || 0) + Number(payment.monto || 0));
  }
  const byState = {};
  for (const reservation of reservations) {
    const key = reservation.estado || 'pendiente';
    byState[key] = (byState[key] || 0) + 1;
  }
  const byService = {};
  for (const consumption of consumptions) {
    const service = services.find((item) => Number(item.id) === Number(consumption.servicioId));
    const key = service?.nombre || consumption.descripcion || 'Otro';
    byService[key] = round2((byService[key] || 0) + Number(consumption.total || 0));
  }
  const roomRevenue = {};
  for (const payment of payments) {
    if (!payment.reservacionId) continue;
    const reservation = reservations.find((item) => Number(item.id) === Number(payment.reservacionId));
    if (!reservation) continue;
    const key = reservation.habitacionId;
    roomRevenue[key] = round2((roomRevenue[key] || 0) + Number(payment.monto || 0));
  }
  const topRooms = Object.entries(roomRevenue)
    .map(([id, total]) => ({ habitacion: rooms.find((room) => Number(room.id) === Number(id))?.numero || id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const days = Math.max(1, Math.min(366, Math.round((new Date(`${dateOnly(hasta)}T00:00:00`) - new Date(`${dateOnly(desde)}T00:00:00`)) / 86400000) + 1));
  let roomNights = 0;
  for (let index = 0; index < days; index += 1) {
    const day = dateOnly(new Date(desde.getTime() + index * 86400000).toISOString());
    roomNights += stays.filter((stay) =>
      ['activa', 'finalizada'].includes(stay.estado) &&
      dateOnly(stay.fechaIn) <= day &&
      day < dateOnly(stay.fechaOut)
    ).length;
  }
  const ocupacion = rooms.length ? Math.min(100, Math.round((roomNights / (rooms.length * days)) * 1000) / 10) : 0;

  res.json({
    rango: { desde: desde.toISOString(), hasta: hasta.toISOString(), dias: days },
    resumen: {
      totalPagos,
      cantidadPagos: payments.length,
      totalIngresos,
      totalEgresos,
      totalGastos,
      utilidad: round2(totalPagos + totalIngresos - totalEgresos - totalGastos),
      saldoPendiente,
      ocupacion,
      habitaciones: rooms.length,
      reservas: reservations.length,
      estanciasActivas: stays.filter((stay) => stay.estado === 'activa').length,
    },
    porMetodo: Object.entries(byMethod).map(([metodo, total]) => ({ metodo, total })).sort((a, b) => b.total - a.total),
    porDia: Object.entries(byDay).map(([fecha, total]) => ({ fecha, total })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porEstado: Object.entries(byState).map(([estado, cantidad]) => ({ estado, cantidad })),
    porServicio: Object.entries(byService).map(([servicio, total]) => ({ servicio, total })).sort((a, b) => b.total - a.total),
    topHabitaciones: topRooms,
    stockBajo: products
      .filter((product) => Number(product.stock || 0) <= Number(product.stockMinimo || 0))
      .map((product) => ({ id: product.id, nombre: product.nombre, stock: product.stock, stockMinimo: product.stockMinimo })),
    gastos: expenses.slice(-20).reverse(),
  });
});

/* --------------------------- Recepción --------------------------- */

app.post('/api/reservaciones/:id/checkin', (req, res) => {
  requireRole(req, 'admin', 'gerente', 'recepcion');
  const reservation = findReservation(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (!['confirmada', 'pendiente'].includes(reservation.estado)) {
    return res.status(409).json({ error: 'La reserva no se puede registrar en check-in' });
  }
  const room = findRoom(reservation.habitacionId);
  if (!room || room.activo === false) return res.status(409).json({ error: 'La habitación de la reserva no está disponible' });
  if (['mantenimiento', 'fuera_servicio', 'ocupada'].includes(room.estado)) {
    return res.status(409).json({ error: 'La habitación no está disponible para check-in' });
  }
  const occupied = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(room.id) && stay.estado === 'activa');
  if (occupied) return res.status(409).json({ error: 'La habitación ya tiene huéspedes alojados' });

  const stay = {
    id: store.nextId('estancias'),
    reservacionId: reservation.id,
    huespedId: reservation.huespedId,
    habitacionId: reservation.habitacionId,
    fechaIn: now(),
    fechaOut: reservation.fechaOut,
    estado: 'activa',
    tarifaNoche: Number(reservation.tarifaNoche || room.precioNoche || 0),
    saldoPendiente: Number(reservation.saldoPendiente ?? reservation.total ?? 0),
    createdAt: now(),
    updatedAt: now(),
  };

  store.transaction(() => {
    store.put('estancias', stay);
    store.put('reservaciones', { ...reservation, estado: 'checkin', updatedAt: now() });
    store.put('habitaciones', { ...room, estado: 'ocupada', updatedAt: now() });
    store.audit({ user: req.user.usuario, action: 'checkin', collection: 'reservaciones', recordId: reservation.id });
  });
  res.status(201).json(stay);
});

app.post('/api/estancias/:id/checkout', (req, res) => {
  requireRole(req, 'admin', 'gerente', 'recepcion');
  const stay = findStay(req.params.id);
  if (!stay) return res.status(404).json({ error: 'Estancia no encontrada' });
  if (stay.estado !== 'activa') return res.status(409).json({ error: 'La estancia ya está cerrada' });
  const balance = round2(Number(stay.saldoPendiente || 0));
  const authorized = Boolean(req.body?.autorizarSaldo);
  if (balance > 0.005 && !authorized) {
    return res.status(409).json({
      error: 'La estancia tiene saldo pendiente; registre el pago o autorice el saldo',
      code: 'SALDO_PENDIENTE',
      saldoPendiente: balance,
    });
  }

  const room = findRoom(stay.habitacionId);
  store.transaction(() => {
    store.put('estancias', {
      ...stay,
      estado: 'finalizada',
      checkoutAt: now(),
      saldoPendiente: balance,
      saldoAutorizado: balance > 0.005 && authorized,
      updatedAt: now(),
    });
    if (room) store.put('habitaciones', { ...room, estado: 'sucia', updatedAt: now() });
    const reservation = findReservation(stay.reservacionId);
    if (reservation) store.put('reservaciones', { ...reservation, estado: 'checkout', updatedAt: now() });
    store.audit({
      user: req.user.usuario,
      action: 'checkout',
      collection: 'estancias',
      recordId: stay.id,
      detail: authorized && balance > 0.005 ? `saldo autorizado: ${balance}` : '',
    });
  });
  res.json({ ok: true, saldoPendiente: balance });
});

/* --------------------------- Respaldos --------------------------- */

app.post('/api/admin/backup', (req, res) => {
  requireRole(req, 'admin');
  const result = store.backup(BACKUP_DIR);
  store.audit({ user: req.user.usuario, action: 'respaldo', collection: 'sistema', recordId: result.archivo });
  res.status(201).json(result);
});

app.get('/api/admin/backups', (req, res) => {
  requireRole(req, 'admin');
  res.json(store.listBackups(BACKUP_DIR));
});

/* --------------------------- CRUD genérico --------------------------- */

app.get('/api/:collection', (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: 'Recurso no encontrado' });
  ensureAccess(req.user.rol, collection);
  if (collection === 'auditoria') return res.json(store.auditList(1000));
  if (collection === 'usuarios') return res.json(store.all('usuarios').map(sanitizeUser));
  res.json(store.all(collection));
});

app.post('/api/:collection', (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: 'Recurso no encontrado' });
  ensureAccess(req.user.rol, collection);
  if (['config', 'auditoria', 'estancias'].includes(collection)) {
    return res.status(400).json({ error: 'No se permite crear este recurso directamente' });
  }
  const input = sanitizeInput(req.body, { keepPassword: collection === 'usuarios' });
  const { record, context } = buildCreate(collection, input, req.user);

  const saved = store.transaction(() => {
    store.put(collection, record);
    if (context.advancePayment) store.put('pagos', context.advancePayment);
    if (context.payment) applyPayment(context.payment);
    if (context.consumption) applyConsumption(context.consumption);
    if (context.purchase) applyPurchase(context.purchase);
    if (context.movement) {
      store.put('productos', { ...context.movement.product, stock: context.movement.stockDespues, updatedAt: now() });
    }
    applyRoomUpdate(context.roomUpdate);
    store.audit({ user: req.user.usuario, action: 'crear', collection, recordId: record.id });
    return record;
  });
  res.status(201).json(saved);
});

app.patch('/api/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: 'Recurso no encontrado' });
  ensureAccess(req.user.rol, collection);
  if (collection === 'config') return res.status(400).json({ error: 'Use /api/config/main para actualizar la configuración' });
  if (collection === 'usuarios') requireRole(req, 'admin', 'gerente');

  const current = store.get(collection, id);
  if (!current) return res.status(404).json({ error: 'Registro no encontrado' });
  const input = sanitizeInput(req.body, { keepPassword: collection === 'usuarios' });
  const { record, context } = buildPatch(collection, current, input, req.user);

  const saved = store.transaction(() => {
    store.put(collection, record);
    if (context.stockMovement) store.put('movimientosInventario', context.stockMovement);
    applyRoomUpdate(context.roomUpdate);
    store.audit({ user: req.user.usuario, action: 'editar', collection, recordId: record.id });
    return record;
  });
  res.json(saved);
});

app.delete('/api/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: 'Recurso no encontrado' });
  ensureAccess(req.user.rol, collection);

  const record = store.get(collection, id);
  if (!record) return res.status(404).json({ error: 'Registro no encontrado' });

  const immutable = ['config', 'auditoria', 'pagos', 'movimientosCaja', 'movimientosInventario', 'cierresCaja', 'consumos', 'estancias', 'facturas', 'compras'];
  if (immutable.includes(collection)) return res.status(403).json({ error: 'Este registro no se puede eliminar' });
  if (collection === 'usuarios') return res.status(403).json({ error: 'Desactive el usuario en lugar de eliminarlo' });

  if (collection === 'reservaciones') {
    if (!['pendiente', 'confirmada'].includes(record.estado) || store.all('pagos').some((payment) => Number(payment.reservacionId) === Number(id))) {
      return res.status(409).json({ error: 'Esta reserva no se puede cancelar; requiere una cancelación con ajuste financiero autorizado' });
    }
    store.put(collection, { ...record, estado: 'cancelada', canceladaAt: now(), updatedAt: now() });
    store.audit({ user: req.user.usuario, action: 'cancelar', collection, recordId: id });
    return res.status(204).end();
  }

  if (collection === 'habitaciones') {
    const occupied = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(id) && stay.estado === 'activa');
    if (occupied) return res.status(409).json({ error: 'No se puede desactivar una habitación con huéspedes alojados' });
    store.put(collection, { ...record, activo: false, estado: 'fuera_servicio', updatedAt: now() });
    store.audit({ user: req.user.usuario, action: 'desactivar', collection, recordId: id });
    return res.status(204).end();
  }

  if (collection === 'huespedes') {
    const activeStay = store.all('estancias').some((stay) => Number(stay.huespedId) === Number(id) && stay.estado === 'activa');
    const upcoming = store.all('reservaciones').some((reservation) =>
      Number(reservation.huespedId) === Number(id) &&
      !['cancelada', 'no_show', 'checkout', 'finalizada'].includes(reservation.estado)
    );
    if (activeStay || upcoming) return res.status(409).json({ error: 'El huésped tiene estancias o reservas activas' });
    store.put(collection, { ...record, activo: false, updatedAt: now() });
    store.audit({ user: req.user.usuario, action: 'desactivar', collection, recordId: id });
    return res.status(204).end();
  }

  if (collection === 'incidenciasMantenimiento') {
    const room = findRoom(record.habitacionId);
    const otherOpen = store.all('incidenciasMantenimiento').some((incident) =>
      String(incident.id) !== String(id) &&
      Number(incident.habitacionId) === Number(record.habitacionId) &&
      incident.estado !== 'resuelta'
    );
    const activeStay = store.all('estancias').some((stay) => Number(stay.habitacionId) === Number(record.habitacionId) && stay.estado === 'activa');
    if (room && room.estado === 'mantenimiento' && !otherOpen && !activeStay) {
      store.put('habitaciones', { ...room, estado: 'disponible', updatedAt: now() });
    }
    store.remove(collection, id);
    store.audit({ user: req.user.usuario, action: 'eliminar', collection, recordId: id });
    return res.status(204).end();
  }

  if (['productos', 'proveedores', 'servicios', 'tiposHabitacion', 'metodosPago'].includes(collection)) {
    store.put(collection, { ...record, activo: false, updatedAt: now() });
    store.audit({ user: req.user.usuario, action: 'desactivar', collection, recordId: id });
    return res.status(204).end();
  }

  store.remove(collection, id);
  store.audit({ user: req.user.usuario, action: 'eliminar', collection, recordId: id });
  res.status(204).end();
});

/* --------------------------- Estáticos / errores --------------------------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

if (isProd) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.warn('Aviso: no existe dist/index.html. Ejecute "npm run build" antes de iniciar en producción.');
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
});

/* --------------------------- Arranque --------------------------- */

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* abrir el navegador es opcional */
  }
}

const server = app.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  Flambergers Hotel PMS');
  console.log(`  API y aplicación: http://${shownHost}:${PORT}`);
  console.log(`  Base de datos:    ${DB_PATH}`);
  console.log(`  Modo:             ${isProd ? 'producción' : 'desarrollo'}`);
  console.log(`  Node.js:          ${process.versions.node} (${process.platform})`);
  if (store.seeded) console.log('  Semilla importada en la base de datos.');
  console.log('');
  if (shouldOpen) setTimeout(() => openBrowser(`http://localhost:${PORT}`), 700);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PORT} ya está en uso. Cierre la otra instancia o defina otro puerto con PORT=...\n`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\nCerrando el servidor (${signal})...`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    store.close();
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('Promesa rechazada sin manejar:', error));
