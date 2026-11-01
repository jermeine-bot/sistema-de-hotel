/** Reglas de negocio puras, sin dependencias de Express ni de la base de datos. */

export function overlaps(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

export function nightsBetween(start, end) {
  const a = new Date(`${String(start).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(end).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return 0;
  return Math.ceil((b - a) / 86400000);
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function priceReservation({ nights, rate, discount = 0, taxRate = 0, advance = 0 }) {
  const n = Number(nights);
  const r = Number(rate);
  const d = Number(discount);
  const tax = Number(taxRate);
  const paid = Number(advance);
  if (!Number.isInteger(n) || n < 1 || ![r, d, tax, paid].every(Number.isFinite) || r < 0 || d < 0 || d > n * r || tax < 0 || paid < 0) {
    throw new Error('Datos tarifarios inválidos');
  }
  const subtotal = round2(n * r);
  const taxAmount = round2(((subtotal - d) * tax) / 100);
  const total = round2(subtotal - d + taxAmount);
  if (paid > total) throw new Error('El anticipo supera el total');
  return { subtotal, impuesto: taxAmount, total, saldoPendiente: round2(total - paid) };
}
