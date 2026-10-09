'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/nucleo/validacion.js');
const { M, C, O, docDemo, porNombre, agregarInsumo, HOY } = require('./_util.js');

test('validarInsumo: campos obligatorios, rangos y unidades incompatibles', () => {
  const doc = M.docNuevo();
  let r = V.validarInsumo(M.nuevoInsumo({ nombre: '', presentacion: { precio: -5, cantidad: 0, unidad: 'g' } }), doc);
  assert.equal(r.ok, false);
  assert.ok(r.errores.nombre && r.errores.precio && r.errores.cantidad);
  r = V.validarInsumo(M.nuevoInsumo({ nombre: 'Leche', unidadBase: 'ml', presentacion: { precio: 4000, cantidad: 1, unidad: 'kg' } }), doc);
  assert.match(r.errores.unidad, /incompatibles/);
  r = V.validarInsumo(M.nuevoInsumo({ nombre: 'Leche', unidadBase: 'ml', presentacion: { precio: 4000, cantidad: 1, unidad: 'l' }, mermaPct: 0.99 }), doc);
  assert.ok(r.errores.mermaPct);
  r = V.validarInsumo(M.nuevoInsumo({ nombre: 'Leche', unidadBase: 'ml', presentacion: { precio: 4000, cantidad: 1, unidad: 'l' } }), doc);
  assert.equal(r.ok, true);
});

test('validarInsumo: nombre repetido', () => {
  const doc = M.docNuevo();
  agregarInsumo(doc, 'Sal', 'g', 1000, 500, 'g');
  const r = V.validarInsumo(M.nuevoInsumo({ nombre: ' sal ', unidadBase: 'g', presentacion: { precio: 1, cantidad: 1, unidad: 'g' } }), doc);
  assert.ok(r.errores.nombre);
});

test('validarReceta: unidades, circularidad y costos adicionales', () => {
  const doc = M.docNuevo();
  const ins = agregarInsumo(doc, 'Sal', 'g', 1000, 1000, 'g');
  const prep = O.guardarReceta(doc, M.nuevaReceta({ tipo: 'preparacion', nombre: 'P', rinde: 10, lineas: [M.nuevaLinea('insumo', ins.id, 1, 'g')] }));
  const r1 = M.nuevaReceta({ nombre: 'X', precioBase: 100, lineas: [M.nuevaLinea('insumo', ins.id, 5, 'ml')] });
  assert.match(V.validarReceta(r1, doc).errores.linea0, /incompatibles/);
  const r2 = M.nuevaReceta({ nombre: 'X', precioBase: 100, lineas: [M.nuevaLinea('insumo', ins.id, 0, 'g')] });
  assert.ok(V.validarReceta(r2, doc).errores.linea0);
  const r3 = M.nuevaReceta({ nombre: 'X', precioBase: 100, costosAdicionales: [{ concepto: 'Gas', tipo: 'porcentaje', valor: 1.5 }] });
  assert.ok(V.validarReceta(r3, doc).errores.adic0);
  const ciclo = Object.assign({}, prep, { lineas: [M.nuevaLinea('preparacion', prep.id, 1, 'g')] });
  assert.match(V.validarReceta(ciclo, doc).errores.linea0, /circular/);
  const ok = M.nuevaReceta({ nombre: 'Bueno', precioBase: 100, lineas: [M.nuevaLinea('insumo', ins.id, 5, 'g'), M.nuevaLinea('preparacion', prep.id, 2, 'g')] });
  assert.equal(V.validarReceta(ok, doc).ok, true);
});

test('validarPedido, pago, gasto, compra y canal', () => {
  const doc = docDemo();
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  let p = M.nuevoPedido({ fecha: HOY, lineas: [] });
  assert.ok(V.validarPedido(p, doc).errores.lineas);
  p = M.nuevoPedido({ fecha: HOY, lineas: [M.nuevaLineaPedido(hamb.id, 'H', 0, 12000)] });
  assert.ok(V.validarPedido(p, doc).errores.linea0);
  p = M.nuevoPedido({ fecha: HOY, lineas: [M.nuevaLineaPedido(hamb.id, 'H', 1, 12000)], descuentoPedido: { tipo: '%', valor: 1.5 } });
  assert.ok(V.validarPedido(p, doc).errores.descuentoPedido);
  assert.equal(V.validarPedido(M.nuevoPedido({ fecha: HOY, lineas: [M.nuevaLineaPedido(hamb.id, 'H', 1, 12000)] }), doc).ok, true);
  assert.ok(V.validarPago({ monto: 0, cuentaId: 'x', fecha: HOY }).errores.monto);
  assert.ok(V.validarPago({ monto: 10.5, cuentaId: 'x', fecha: HOY }).errores.monto);
  assert.ok(V.validarPago({ monto: 100, fecha: HOY }).errores.cuentaId);
  assert.ok(V.validarGasto({ descripcion: '', valor: 0, fecha: HOY, estadoPago: 'pagado' }).errores.descripcion);
  assert.ok(V.validarGasto({ descripcion: 'x', valor: 5, fecha: HOY, estadoPago: 'pagado' }).errores.cuentaId);
  assert.equal(V.validarGasto({ descripcion: 'x', valor: 5, fecha: HOY, estadoPago: 'pendiente' }).ok, true);
  assert.ok(V.validarCanal({ nombre: 'X', comisionPct: 1 }, doc).errores.comisionPct);
  assert.ok(V.validarCompra({ fecha: HOY, lineas: [], flete: 0, estadoPago: 'pendiente' }, doc).errores.lineas);
});

test('validarDocumento acepta los datos de ejemplo y detecta referencias rotas y rangos', () => {
  const doc = docDemo();
  assert.deepEqual(V.validarDocumento(doc), { ok: true, errores: [] });
  const roto = JSON.parse(JSON.stringify(doc));
  roto.datos.pedidos[0].canalId = 'no-existe';
  roto.datos.insumos[0].mermaPct = 2;
  roto.datos.canales[0].comisionPct = -1;
  const r = V.validarDocumento(roto);
  assert.equal(r.ok, false);
  assert.ok(r.errores.length >= 3);
});
