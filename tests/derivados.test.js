'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, F, C, D, O, A, HOY, docDemo, porNombre, cerca, agregarInsumo } = require('./_util.js');

function docBase() {
  // Un insumo, un producto de $1.000 de costo (100 g de harina a $10/g), un canal, una cuenta.
  const doc = M.docNuevo();
  const harina = agregarInsumo(doc, 'Harina', 'g', 10000, 1000, 'g'); // $10/g
  const prod = O.guardarReceta(doc, M.nuevaReceta({ nombre: 'Pan', precioBase: 2000, lineas: [M.nuevaLinea('insumo', harina.id, 100, 'g')] }));
  const canal = O.guardarEntidad(doc, 'canales', M.nuevoCanal({ nombre: 'Directo', tipo: 'directo' }));
  const cuenta = O.guardarEntidad(doc, 'cuentas', M.nuevaCuenta({ nombre: 'Efectivo', saldoInicial: 100000 }));
  return { doc, harina, prod, canal, cuenta };
}
function pedido(b, cantidad, estado) {
  return M.nuevoPedido({ fecha: HOY, canalId: b.canal.id, estado: estado || 'pendiente', lineas: [M.nuevaLineaPedido(b.prod.id, 'Pan', cantidad, 2000)] });
}
const stockDe = (doc, id) => A.stockInsumos(doc)[id] || 0;
const ordenado = (arr) => arr.slice().sort((a, b) => (a.id < b.id ? -1 : 1));

test('pedido entregado descuenta insumos una sola vez; pendiente no descuenta', () => {
  const b = docBase();
  O.guardarCompra(b.doc, M.nuevaCompra({ fecha: HOY, estadoPago: 'pendiente', lineas: [{ insumoId: b.harina.id, cantidad: 1000, unidad: 'g', precioTotal: 10000 }] }));
  const p = O.guardarPedido(b.doc, pedido(b, 3, 'pendiente'));
  assert.equal(stockDe(b.doc, b.harina.id), 1000);
  O.cambiarEstadoPedido(b.doc, p.id, 'entregado');
  assert.equal(stockDe(b.doc, b.harina.id), 700);
  O.cambiarEstadoPedido(b.doc, p.id, 'entregado'); // repetir no descuenta de nuevo
  assert.equal(stockDe(b.doc, b.harina.id), 700);
  O.cambiarEstadoPedido(b.doc, p.id, 'pendiente'); // volver atrás revierte
  assert.equal(stockDe(b.doc, b.harina.id), 1000);
  O.cambiarEstadoPedido(b.doc, p.id, 'entregado');
  assert.equal(stockDe(b.doc, b.harina.id), 700);
});

test('editar un pedido entregado regenera sus movimientos sin duplicarlos', () => {
  const b = docBase();
  const p = O.guardarPedido(b.doc, pedido(b, 3, 'entregado'));
  assert.equal(b.doc.datos.movInventario.filter((m) => m.origen && m.origen.id === p.id).length, 1);
  const editado = O.clonar(p);
  editado.lineas[0].cantidad = 5;
  O.guardarPedido(b.doc, editado);
  const movs = b.doc.datos.movInventario.filter((m) => m.origen && m.origen.id === p.id);
  assert.equal(movs.length, 1);
  assert.ok(cerca(movs[0].cantidadBase, -500));
});

test('pedido cancelado: no cuenta en ventas ni inventario; sus pagos generan devolución', () => {
  const b = docBase();
  const p = O.guardarPedido(b.doc, pedido(b, 2, 'entregado'));
  O.registrarPago(b.doc, p.id, { cuentaId: b.cuenta.id, monto: 4000, medio: 'efectivo', fecha: HOY });
  assert.equal(A.resumenPeriodo(b.doc, HOY, HOY).nVentas, 1);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 104000);
  const r = O.cancelarPedido(b.doc, p.id, { devolver: true, cuentaId: b.cuenta.id });
  assert.equal(r.devuelto, 4000);
  const res = A.resumenPeriodo(b.doc, HOY, HOY);
  assert.equal(res.nVentas, 0);
  assert.equal(res.ingresosNetos, 0);
  assert.equal(res.contribucion, 0);
  assert.equal(stockDe(b.doc, b.harina.id), 0);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 100000); // devolución revierte el cobro
  assert.equal(b.doc.datos.movimientosCaja.filter((m) => m.tipo === 'devolucion').length, 1);
  // cancelar de nuevo no duplica la devolución
  O.cancelarPedido(b.doc, p.id, { devolver: true, cuentaId: b.cuenta.id });
  assert.equal(b.doc.datos.movimientosCaja.filter((m) => m.tipo === 'devolucion').length, 1);
});

test('instantáneas: cambiar precios o costos después de entregar no altera la venta', () => {
  const b = docBase();
  const p = O.guardarPedido(b.doc, pedido(b, 2, 'entregado'));
  const antes = JSON.stringify(C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id)));
  // sube la harina de $10/g a $20/g y cambia la comisión del canal y el precio del producto
  const h = O.clonar(O.buscar(b.doc.datos.insumos, b.harina.id));
  h.presentacion.precio = 20000;
  O.guardarInsumo(b.doc, h);
  b.canal.comisionPct = 0.5;
  O.buscar(b.doc.datos.recetas, b.prod.id).precioBase = 9999;
  const ctx = C.crearContexto(b.doc);
  assert.ok(cerca(ctx.receta(b.prod.id).costoProd, 2000)); // el costo vigente sí cambió
  assert.equal(JSON.stringify(C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id))), antes);
  // editar sólo observaciones del pedido entregado conserva la instantánea
  const ed = O.clonar(O.buscar(b.doc.datos.pedidos, p.id));
  ed.observaciones = 'nota';
  O.guardarPedido(b.doc, ed);
  assert.equal(JSON.stringify(C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id))), antes);
});

test('mientras no esté entregado, la instantánea se recalcula con los valores actuales', () => {
  const b = docBase();
  const p = O.guardarPedido(b.doc, pedido(b, 1, 'pendiente'));
  assert.ok(cerca(p.lineas[0].snap.costoProd, 1000));
  const h = O.clonar(O.buscar(b.doc.datos.insumos, b.harina.id));
  h.presentacion.precio = 20000;
  O.guardarInsumo(b.doc, h);
  const ed = O.clonar(O.buscar(b.doc.datos.pedidos, p.id));
  const p2 = O.guardarPedido(b.doc, ed);
  assert.ok(cerca(p2.lineas[0].snap.costoProd, 2000));
  // al pasar a entregado se congela
  const p3 = O.cambiarEstadoPedido(b.doc, p.id, 'entregado');
  assert.ok(cerca(p3.lineas[0].snap.costoProd, 2000));
});

test('pedido con pago parcial: estado de pago "parcial" y saldo correcto', () => {
  const b = docBase();
  const p = O.guardarPedido(b.doc, pedido(b, 3, 'entregado')); // $6.000
  let c = C.calcularPedido(p);
  assert.equal(c.estadoPago, 'pendiente');
  assert.ok(cerca(c.saldoPorCobrar, 6000));
  O.registrarPago(b.doc, p.id, { cuentaId: b.cuenta.id, monto: 2500, medio: 'Nequi', fecha: HOY });
  c = C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id));
  assert.equal(c.estadoPago, 'parcial');
  assert.ok(cerca(c.saldoPorCobrar, 3500));
  assert.equal(A.cuentasPorCobrar(b.doc, HOY).length, 1);
  O.registrarPago(b.doc, p.id, { cuentaId: b.cuenta.id, monto: 3500, medio: 'efectivo', fecha: HOY });
  c = C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id));
  assert.equal(c.estadoPago, 'pagado');
  assert.equal(A.cuentasPorCobrar(b.doc, HOY).length, 0);
});

test('plataforma que liquida neto: el cobro esperado descuenta la comisión (no queda saldo fantasma)', () => {
  const b = docBase();
  const plat = O.guardarEntidad(b.doc, 'canales', M.nuevoCanal({ nombre: 'App', comisionPct: 0.2, tipo: 'plataforma' }));
  const ped = pedido(b, 1, 'entregado'); ped.canalId = plat.id;
  const p = O.guardarPedido(b.doc, ped);
  const c0 = C.calcularPedido(p);
  assert.ok(cerca(c0.totalPedido, 2000));
  assert.ok(cerca(c0.totalEsperado, 1600));
  O.registrarPago(b.doc, p.id, { cuentaId: b.cuenta.id, monto: 1600, medio: 'plataforma', fecha: HOY });
  const c1 = C.calcularPedido(O.buscar(b.doc.datos.pedidos, p.id));
  assert.equal(c1.estadoPago, 'pagado');
  assert.equal(c1.saldoPorCobrar, 0);
  assert.ok(cerca(c1.comisiones, 400)); // la comisión cuenta una sola vez, como costo variable
});

test('compra: sube stock, actualiza costo y registra el egreso una sola vez', () => {
  const b = docBase();
  const c = O.guardarCompra(b.doc, M.nuevaCompra({
    fecha: HOY, estadoPago: 'pagado', cuentaId: b.cuenta.id, flete: 1000,
    lineas: [{ insumoId: b.harina.id, cantidad: 2, unidad: 'kg', precioTotal: 30000 }]
  }));
  assert.equal(stockDe(b.doc, b.harina.id), 2000);
  // costo = (30.000 + flete 1.000) / 2.000 g = $15,5/g
  assert.ok(cerca(C.crearContexto(b.doc).costoBase(b.harina.id), 15.5));
  const egresos = b.doc.datos.movimientosCaja.filter((m) => m.origen && m.origen.id === c.id);
  assert.equal(egresos.length, 1);
  assert.equal(egresos[0].monto, -31000);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 69000);
  // regenerar varias veces no duplica
  D.regenerarOrigen(b.doc, 'compra', c.id); D.regenerarOrigen(b.doc, 'compra', c.id);
  assert.equal(b.doc.datos.movimientosCaja.filter((m) => m.origen && m.origen.id === c.id).length, 1);
  assert.equal(stockDe(b.doc, b.harina.id), 2000);
  assert.equal(b.doc.datos.insumos[0].historialPrecios.filter((h) => h.origen === 'compra:' + c.id).length, 1);
  // compra pendiente: sin egreso hasta que se paga (cuenta por pagar)
  const c2 = O.guardarCompra(b.doc, M.nuevaCompra({ fecha: HOY, estadoPago: 'pendiente', lineas: [{ insumoId: b.harina.id, cantidad: 1000, unidad: 'g', precioTotal: 12000 }] }));
  assert.equal(b.doc.datos.movimientosCaja.filter((m) => m.origen && m.origen.id === c2.id).length, 0);
  assert.equal(A.cuentasPorPagar(b.doc, HOY).length, 1);
  O.pagarCompra(b.doc, c2.id, b.cuenta.id, HOY);
  assert.equal(A.cuentasPorPagar(b.doc, HOY).length, 0);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 57000);
  // eliminar la compra revierte stock, caja y el costo
  O.eliminarDocumento(b.doc, 'compras', c.id);
  O.eliminarDocumento(b.doc, 'compras', c2.id);
  assert.equal(stockDe(b.doc, b.harina.id), 0);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 100000);
  assert.ok(cerca(C.crearContexto(b.doc).costoBase(b.harina.id), 10));
});

test('gasto pagado crea el egreso en caja; pendiente no; no se duplica', () => {
  const b = docBase();
  const g = O.guardarGasto(b.doc, M.nuevoGasto({ fecha: HOY, descripcion: 'Gas', valor: 20000, estadoPago: 'pagado', cuentaId: b.cuenta.id }));
  O.guardarGasto(b.doc, O.clonar(g)); O.guardarGasto(b.doc, O.clonar(g));
  assert.equal(b.doc.datos.movimientosCaja.filter((m) => m.origen && m.origen.id === g.id).length, 1);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 80000);
  const g2 = O.guardarGasto(b.doc, M.nuevoGasto({ fecha: HOY, descripcion: 'Luz', valor: 30000, estadoPago: 'pendiente' }));
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 80000);
  O.pagarGasto(b.doc, g2.id, b.cuenta.id, HOY);
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 50000);
});

test('R: caja = saldo inicial + cobro − gasto − retiro', () => {
  const b = docBase(); // saldo inicial 100.000
  const p = O.guardarPedido(b.doc, pedido(b, 1, 'entregado'));
  O.registrarPago(b.doc, p.id, { cuentaId: b.cuenta.id, monto: 50000, medio: 'efectivo', fecha: HOY });
  O.guardarGasto(b.doc, M.nuevoGasto({ fecha: HOY, descripcion: 'Gasto', valor: 20000, estadoPago: 'pagado', cuentaId: b.cuenta.id }));
  O.movimientoCajaManual(b.doc, { fecha: HOY, cuentaId: b.cuenta.id, tipo: 'retiro', monto: 10000, descripcion: 'Retiro del dueño' });
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 120000);
});

test('transferencia entre cuentas suma cero en el total', () => {
  const b = docBase();
  const nequi = O.guardarEntidad(b.doc, 'cuentas', M.nuevaCuenta({ nombre: 'Nequi', saldoInicial: 0 }));
  const antes = A.saldosCaja(b.doc).total;
  O.transferir(b.doc, { fecha: HOY, desdeCuentaId: b.cuenta.id, haciaCuentaId: nequi.id, monto: 30000 });
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 70000);
  assert.equal(A.saldoCuenta(b.doc, nequi.id), 30000);
  assert.equal(A.saldosCaja(b.doc).total, antes);
  const mov = b.doc.datos.movimientosCaja.find((m) => m.transferId);
  assert.ok(O.eliminarMovimientoCajaManual(b.doc, mov.id));
  assert.equal(A.saldoCuenta(b.doc, b.cuenta.id), 100000); // elimina el par completo
});

test('idempotencia: regenerarTodo da el mismo resultado que las regeneraciones incrementales y que sí mismo', () => {
  const doc = docDemo();
  const incrInv = JSON.stringify(ordenado(doc.datos.movInventario));
  const incrCaja = JSON.stringify(ordenado(doc.datos.movimientosCaja));
  D.regenerarTodo(doc);
  assert.equal(JSON.stringify(ordenado(doc.datos.movInventario)), incrInv);
  assert.equal(JSON.stringify(ordenado(doc.datos.movimientosCaja)), incrCaja);
  const n1 = doc.datos.movInventario.length, c1 = doc.datos.movimientosCaja.length;
  D.regenerarTodo(doc); D.regenerarTodo(doc);
  assert.equal(doc.datos.movInventario.length, n1);
  assert.equal(doc.datos.movimientosCaja.length, c1);
  // y los ids son únicos
  const ids = new Set(doc.datos.movInventario.map((m) => m.id));
  assert.equal(ids.size, doc.datos.movInventario.length);
});

test('modo conProduccion: el lote descuenta insumos; entregar descuenta producto terminado y NO vuelve a descontar insumos', () => {
  const b = docBase();
  O.guardarCompra(b.doc, M.nuevaCompra({ fecha: HOY, estadoPago: 'pendiente', lineas: [{ insumoId: b.harina.id, cantidad: 1000, unidad: 'g', precioTotal: 10000 }] }));
  O.cambiarModoInventario(b.doc, 'conProduccion');
  O.guardarLote(b.doc, { fecha: HOY, productoId: b.prod.id, cantidad: 4 });
  assert.equal(stockDe(b.doc, b.harina.id), 600);
  assert.equal(A.stockProductos(b.doc)[b.prod.id], 4);
  const p = O.guardarPedido(b.doc, pedido(b, 3, 'entregado'));
  assert.equal(stockDe(b.doc, b.harina.id), 600); // los insumos no se tocan al vender
  assert.equal(A.stockProductos(b.doc)[b.prod.id], 1);
  O.cambiarModoInventario(b.doc, 'sobrePedido'); // volver al otro modo: sin lotes ni doble descuento
  assert.equal(stockDe(b.doc, b.harina.id), 700); // 1000 − 300 de la venta (los lotes se ignoran en este modo)
  assert.equal(A.stockProductos(b.doc)[b.prod.id] || 0, 0);
});

test('merma y ajuste manuales afectan el stock y sobreviven a regenerarTodo', () => {
  const b = docBase();
  O.movimientoInventarioManual(b.doc, { insumoId: b.harina.id, tipo: 'ajuste', cantidadBase: 500, motivo: 'Conteo inicial' });
  O.movimientoInventarioManual(b.doc, { insumoId: b.harina.id, tipo: 'merma', cantidadBase: -50, motivo: 'Derrame' });
  assert.equal(stockDe(b.doc, b.harina.id), 450);
  D.regenerarTodo(b.doc);
  assert.equal(stockDe(b.doc, b.harina.id), 450);
});

test('gastos recurrentes: se proponen y se crean solo al confirmar, sin duplicar', () => {
  const b = docBase();
  O.guardarEntidad(b.doc, 'gastosRecurrentes', { descripcion: 'Internet', categoria: 'Servicios', tipo: 'fijo', clasificacion: 'operativo', valor: 60000, diaDelMes: 31, activo: true });
  assert.equal(O.gastosRecurrentesPendientes(b.doc, '2026-11').length, 1);
  assert.equal(b.doc.datos.gastos.length, 0); // nada se crea solo
  const creados = O.generarGastosRecurrentes(b.doc, '2026-11');
  assert.equal(creados.length, 1);
  assert.equal(creados[0].fecha, '2026-11-30'); // día 31 ajustado al último del mes
  assert.equal(creados[0].estadoPago, 'pendiente');
  assert.equal(O.gastosRecurrentesPendientes(b.doc, '2026-11').length, 0);
  assert.equal(O.generarGastosRecurrentes(b.doc, '2026-11').length, 0);
});

test('datos de ejemplo: coherentes (sin stock negativo salvo lo previsto) y con los costos de la hoja', () => {
  const doc = docDemo();
  const stock = A.stockInsumos(doc);
  Object.keys(stock).forEach((id) => assert.ok(stock[id] > -1e-9, 'stock negativo en ' + id));
  const ctx = C.crearContexto(doc);
  assert.ok(cerca(ctx.receta(porNombre(doc.datos.recetas, 'Hamburguesa de lentejas').id).costoProd, 3905));
  assert.ok(cerca(ctx.receta(porNombre(doc.datos.recetas, 'Sándwich de pollo').id).costoProd, 4185));
  assert.ok(cerca(ctx.receta(porNombre(doc.datos.recetas, 'Salsa de la casa').id).costoProd, 16.6));
  assert.ok(doc.datos.pedidos.length >= 15);
  assert.ok(doc.datos.pedidos.every((p) => p.esDemo));
  assert.ok(A.insumosStockBajo(doc, stock).length >= 1);
  const abiertos = A.pedidosAbiertos(doc);
  assert.ok(abiertos.length >= 3);
});
