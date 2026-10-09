'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/nucleo/unidades.js');
const F = require('../js/nucleo/formato.js');

test('conversión dentro de la misma familia', () => {
  assert.equal(U.convertir(1, 'kg', 'g'), 1000);
  assert.equal(U.convertir(500, 'g', 'kg'), 0.5);
  assert.equal(U.convertir(2, 'l', 'ml'), 2000);
  assert.equal(U.convertir(2, 'docena', 'und'), 24);
  assert.equal(U.convertir(36, 'und', 'docena'), 3);
});

test('F: unidades incompatibles lanzan error controlado', () => {
  assert.throws(() => U.convertir(10, 'g', 'ml'), /Unidades incompatibles/);
  const r = U.intentarConvertir(10, 'g', 'ml');
  assert.equal(r.ok, false);
  assert.match(r.error, /incompatibles/);
  assert.equal(U.sePuedeConvertir('und', 'g', []), false);
});

test('equivalencias entre familias (1 und = 50 g) en ambos sentidos', () => {
  const eq = [{ de: 'und', a: 'g', factor: 50 }];
  assert.equal(U.convertir(3, 'und', 'g', eq), 150);
  assert.equal(U.convertir(100, 'g', 'und', eq), 2);
  assert.equal(U.convertir(1, 'docena', 'kg', eq), 0.6); // 12 und = 600 g
  assert.equal(U.convertir(1, 'kg', 'und', eq), 20);
});

test('unidades compatibles por familia', () => {
  assert.deepEqual(U.unidadesCompatibles('g').sort(), ['g', 'kg']);
  assert.deepEqual(U.unidadesCompatibles('und').sort(), ['docena', 'und']);
});

test('S: parseNumeroCO', () => {
  assert.equal(F.parseNumeroCO('12.500'), 12500);
  assert.equal(F.parseNumeroCO('1.234,5'), 1234.5);
  assert.equal(F.parseNumeroCO('12,5'), 12.5);
  assert.equal(F.parseNumeroCO('0,18'), 0.18);
  assert.equal(F.parseNumeroCO('1.5'), 1.5);
  assert.equal(F.parseNumeroCO('abc'), null);
  assert.equal(F.parseNumeroCO(''), null);
  assert.equal(F.parseNumeroCO('1.2.3'), null);
  assert.equal(F.parseNumeroCO('$ 12.500'), 12500);
  assert.equal(F.parseNumeroCO('1.234.567'), 1234567);
  assert.equal(F.parseNumeroCO('-3,5'), -3.5);
  assert.equal(F.parsePorcentaje('20 %'), 0.2);
  assert.equal(F.parsePorcentaje('20'), 0.2);
});

test('formato COP y porcentajes', () => {
  assert.equal(F.cop(12500).replace(/\s/g, ' '), '$ 12.500');
  assert.equal(F.cop(-1500).replace(/\s/g, ' '), '-$ 1.500');
  assert.equal(F.cop(3.5).replace(/\s/g, ' '), '$ 3,5');
  assert.equal(F.cop(NaN), '—');
  assert.equal(F.cop(Infinity), '—');
  assert.equal(F.pct(0.4329).replace(/\s/g, ' '), '43,3 %');
  assert.equal(F.fecha('2026-10-09'), '09/10/2026');
});

test('fechas: semana desde lunes, meses, zona Bogotá', () => {
  assert.equal(F.inicioSemana('2026-10-09'), '2026-10-05'); // viernes → lunes
  assert.equal(F.finSemana('2026-10-09'), '2026-10-11');
  assert.equal(F.finMes('2026-02-10'), '2026-02-28');
  assert.equal(F.sumarMeses('2026-01', -1), '2025-12');
  assert.equal(F.diasEntre('2026-10-01', '2026-10-09'), 8);
  // 2026-10-10 02:30 UTC es 21:30 del 9 de octubre en Bogotá (UTC-5)
  assert.equal(F.hoy(new Date('2026-10-10T02:30:00Z')), '2026-10-09');
  assert.equal(F.esFechaISO('2026-02-30'), false);
});
