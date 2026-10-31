import test from 'node:test';import assert from 'node:assert/strict';import{overlaps,priceReservation}from'../server/domain.js';
test('permite reservas consecutivas sin solapamiento',()=>{assert.equal(overlaps('2026-10-19','2026-10-21','2026-10-21','2026-10-23'),false)});
test('detecta rangos de reserva que se cruzan',()=>{assert.equal(overlaps('2026-10-19','2026-10-22','2026-10-21','2026-10-23'),true)});
test('calcula importe, impuestos y saldo',()=>{assert.deepEqual(priceReservation({nights:2,rate:100,discount:20,taxRate:15,advance:200}),{subtotal:200,impuesto:27,total:207,saldoPendiente:7})});
test('rechaza tarifa o descuento fuera de los límites',()=>{assert.throws(()=>priceReservation({nights:1,rate:100,discount:101}),/inválidos/)});
test('rechaza anticipos superiores al total de la reserva',()=>{assert.throws(()=>priceReservation({nights:1,rate:100,advance:101}),/supera el total/)});
