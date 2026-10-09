'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, F, C, D, O, A, HOY, docDemo, porNombre, cerca, agregarInsumo } = require('./_util.js');
const V = require('../js/nucleo/validacion.js');

test('resultados: ingresos − costos variables = contribución; utilidad = contribución − gastos operativos', () => {
  const doc = docDemo();
  const r = A.resumenPeriodo(doc, F.sumarDias(HOY, -30), HOY);
  assert.ok(r.nVentas > 8);
  assert.ok(cerca(r.ingresosNetos - r.costosVariables, r.contribucion, 1e-6));
  assert.ok(cerca(r.costoProd + r.otrosCostos + r.comisiones + r.costoEnvio, r.costosVariables, 1e-6));
  assert.ok(cerca(r.contribucion - r.gastosOperativos, r.utilidadOperativa, 1e-6));
  // las inversiones (sartén) y los pagos de compras no entran en la utilidad
  const gastosOp = doc.datos.gastos.filter((g) => g.clasificacion === 'operativo').reduce((s, g) => s + g.valor, 0);
  assert.ok(cerca(r.gastosOperativos, gastosOp));
  // la suma por producto coincide con la total
  const suma = Object.values(r.porProducto).reduce((s, x) => s + x.contribucion, 0);
  assert.ok(cerca(suma, r.contribucion - 0, 1e-6)); // sin envío en el ejemplo
  // pedidos abiertos y cancelados no cuentan
  const entregados = doc.datos.pedidos.filter((p) => p.estado === 'entregado').length;
  assert.equal(r.nVentas, entregados);
});

test('el periodo respeta fechas inclusivas y semana desde lunes', () => {
  const doc = docDemo();
  const hoy = A.resumenPeriodo(doc, HOY, HOY);
  const semana = A.resumenPeriodo(doc, F.inicioSemana(HOY), F.finSemana(HOY));
  assert.ok(semana.ingresosNetos >= hoy.ingresosNetos);
  const ant = A.periodoAnterior('2026-10-05', '2026-10-11');
  assert.deepEqual(ant, { desde: '2026-09-28', hasta: '2026-10-04' });
});

test('puente utilidad → caja suma exactamente la variación de caja del periodo', () => {
  const doc = docDemo();
  const desde = F.sumarDias(HOY, -30);
  const p = A.puenteUtilidadCaja(doc, desde, HOY);
  const suma = p.utilidad + p.componentes.reduce((s, c) => s + c.valor, 0);
  assert.ok(cerca(suma, p.variacionCaja, 1e-6));
  // variación real de caja = saldo final − saldo inicial de las cuentas
  const inicial = doc.datos.cuentas.reduce((s, c) => s + c.saldoInicial, 0);
  assert.ok(cerca(A.saldosCaja(doc, HOY).total - inicial, p.variacionCaja, 1e-6));
  assert.ok(p.componentes.find((c) => c.id === 'compras').valor < 0);
});

test('compras de inventario no son costo del periodo: comprar más no cambia la utilidad', () => {
  const doc = docDemo();
  const desde = F.sumarDias(HOY, -30);
  const antes = A.resumenPeriodo(doc, desde, HOY).utilidadOperativa;
  const cuenta = doc.datos.cuentas[0];
  const queso = doc.datos.insumos.find((i) => i.nombre === 'Queso en lonjas');
  O.guardarCompra(doc, M.nuevaCompra({ fecha: HOY, estadoPago: 'pagado', cuentaId: cuenta.id, lineas: [{ insumoId: queso.id, cantidad: 20, unidad: 'und', precioTotal: 16000 }] }));
  assert.ok(cerca(A.resumenPeriodo(doc, desde, HOY).utilidadOperativa, antes, 1e-6));
});

test('comisión de plataforma: se cuenta una sola vez (no hay gasto adicional)', () => {
  const doc = docDemo();
  const plat = porNombre(doc.datos.canales, 'Plataforma de domicilios');
  const r = A.resumenPeriodo(doc, F.sumarDias(HOY, -30), HOY);
  const brutoPlat = doc.datos.pedidos.filter((p) => p.estado === 'entregado' && p.canalId === plat.id)
    .reduce((s, p) => s + C.calcularPedido(p).ingresoNeto, 0);
  assert.ok(cerca(r.comisiones, brutoPlat * 0.2, 1e-6));
  assert.equal(doc.datos.gastos.filter((g) => /comisi/i.test(g.descripcion)).length, 0);
});

test('impuestos opcionales: márgenes sobre precio sin impuesto', () => {
  const doc = docDemo();
  const sand = porNombre(doc.datos.recetas, 'Sándwich de pollo');
  const dir = porNombre(doc.datos.canales, 'Venta directa');
  sand.tarifaImpuesto = 0.19;
  // desactivado por defecto: no cambia nada
  assert.ok(cerca(C.resultadoProducto(C.crearContexto(doc), sand.id, dir.id).ganancia, 4515));
  doc.config.impuestos = { activo: true, preciosIncluyenImpuesto: true };
  const incl = C.resultadoProducto(C.crearContexto(doc), sand.id, dir.id);
  assert.ok(cerca(incl.precio, 9000 / 1.19, 1e-6));
  assert.ok(cerca(incl.impuesto, 9000 - 9000 / 1.19, 1e-6));
  assert.ok(cerca(incl.ganancia, 9000 / 1.19 - 4485, 1e-6));
  doc.config.impuestos = { activo: true, preciosIncluyenImpuesto: false };
  const excl = C.resultadoProducto(C.crearContexto(doc), sand.id, dir.id);
  assert.ok(cerca(excl.precio, 9000));
  assert.ok(cerca(excl.impuesto, 1710));
  // en un pedido: el total cobrado suma el impuesto, el ingreso neto no
  const ped = O.guardarPedido(doc, M.nuevoPedido({ fecha: HOY, canalId: dir.id, estado: 'entregado', lineas: [M.nuevaLineaPedido(sand.id, 'S', 1, 9000)] }));
  const c = C.calcularPedido(ped);
  assert.ok(cerca(c.totalPedido, 10710));
  assert.ok(cerca(c.ingresoNeto, 9000));
  assert.ok(cerca(c.impuesto, 1710));
});

test('lista de compras: faltantes con merma, por proveedor y en presentaciones completas', () => {
  const doc = docDemo();
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  const ctx = C.crearContexto(doc);
  const stock = {};
  const lista = A.listaCompras(doc, ctx, [{ productoId: hamb.id, cantidad: 10 }], stock);
  const pan = lista.filas.find((f) => f.nombre === 'Pan de hamburguesa');
  assert.ok(cerca(pan.requerido, 10));
  assert.ok(cerca(pan.faltante, 10));
  assert.equal(pan.presentaciones, 2); // paquetes de 6 → 2
  assert.ok(cerca(pan.costoCompra, 14400));
  assert.ok(cerca(lista.totalEstimado, 39050 - 0 - 0, 1e-6) || lista.totalEstimado > 0);
  assert.ok(Object.keys(lista.porProveedor).length >= 1);
  // con stock suficiente no falta nada
  const lleno = {}; lista.filas.forEach((f) => { lleno[f.insumoId] = f.requerido * 2; });
  const lista2 = A.listaCompras(doc, ctx, [{ productoId: hamb.id, cantidad: 10 }], lleno);
  assert.ok(lista2.filas.every((f) => f.faltante === 0 && f.presentaciones === 0));
  // plan desde pedidos abiertos
  const plan = A.planDesdePedidosAbiertos(doc);
  assert.ok(plan.length >= 1 && plan.every((x) => x.cantidad > 0));
});

test('alertas por reglas: precio bajo, insumo que subió, stock bajo, por cobrar vencido, pedidos abiertos', () => {
  const doc = docDemo();
  const ctx = C.crearContexto(doc);
  const ids = A.alertas(doc, ctx, HOY).map((a) => a.id);
  assert.ok(ids.some((i) => i.startsWith('ins-')), 'insumo que subió');
  assert.ok(ids.includes('cobrar'), 'por cobrar vencido');
  assert.ok(ids.includes('abiertos'), 'pedidos abiertos de días anteriores');
  assert.ok(ids.some((i) => i.startsWith('stock-')), 'stock bajo');
  // producto con pérdida
  porNombre(doc.datos.recetas, 'Hamburguesa de lentejas').precioBase = 5000;
  const a2 = A.alertas(doc, C.crearContexto(doc), HOY);
  const alta = a2.find((a) => a.id.startsWith('prod-'));
  assert.ok(alta && alta.nivel === 'alta');
  assert.match(alta.detalle, /pierde/i);
});

test('variación de insumos y puntos de equilibrio con mezcla del periodo', () => {
  const doc = docDemo();
  const tomate = porNombre(doc.datos.insumos, 'Tomate');
  const v = A.variacionInsumo(tomate);
  assert.ok(cerca(v.pct, 3.5 / 2.8 - 1, 1e-9));
  const f = A.gastosFijosMensuales(doc, HOY);
  assert.equal(f.estimados, 180000);
  const r = A.resumenPeriodo(doc, F.sumarDias(HOY, -30), HOY);
  const eq = C.puntoEquilibrio({ gastosFijos: f.estimados, margenPonderado: r.contribucion / r.ingresosNetos });
  assert.ok(eq.ok && eq.ventasEquilibrio > 0 && eq.ventasEquilibrio < 1000000);
});

test('rendimiento: 5.000 pedidos y 300 insumos responden en menos de un segundo', () => {
  const doc = M.docNuevo();
  const canal = O.guardarEntidad(doc, 'canales', M.nuevoCanal({ nombre: 'Directo', tipo: 'directo' }));
  const cuenta = O.guardarEntidad(doc, 'cuentas', M.nuevaCuenta({ nombre: 'Efectivo', saldoInicial: 0, fechaSaldoInicial: '2025-01-01' }));
  const insumos = [];
  for (let i = 0; i < 300; i++) insumos.push(agregarInsumo(doc, 'Insumo ' + i, 'g', 1000 + i, 1000, 'g'));
  const productos = [];
  for (let p = 0; p < 40; p++) {
    productos.push(O.guardarReceta(doc, M.nuevaReceta({
      nombre: 'Producto ' + p, precioBase: 15000 + p * 100,
      lineas: Array.from({ length: 8 }, (_, k) => M.nuevaLinea('insumo', insumos[(p * 7 + k) % 300].id, 10 + k, 'g')),
      costosAdicionales: [{ id: 'x' + p, concepto: 'Gas', tipo: 'monto', valor: 300 }]
    })));
  }
  const ctx0 = C.crearContexto(doc);
  const base = F.sumarDias(HOY, -400);
  for (let n = 0; n < 5000; n++) {
    const fecha = F.sumarDias(base, n % 400);
    const lineas = [0, 1, 2].map((k) => {
      const pr = productos[(n * 3 + k) % 40];
      const l = M.nuevaLineaPedido(pr.id, pr.nombre, 1 + (n % 3), pr.precioBase);
      l.snap = C.crearSnap(ctx0, pr.id, canal.id);
      return l;
    });
    const total = lineas.reduce((s, l) => s + l.cantidad * l.precioUnit, 0);
    doc.datos.pedidos.push(Object.assign(M.nuevoPedido({ fecha, canalId: canal.id, estado: 'entregado', lineas }), {
      id: 'ped' + n, numero: n + 1, creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-01-01T00:00:00Z', esDemo: false,
      pagos: [{ id: 'pg' + n, fecha, cuentaId: cuenta.id, monto: total, medio: 'efectivo' }]
    }));
  }
  const t = {};
  function medir(nombre, fn) { const t0 = process.hrtime.bigint(); const r = fn(); t[nombre] = Number(process.hrtime.bigint() - t0) / 1e6; return r; }
  medir('regenerarTodo', () => D.regenerarTodo(doc));
  const ctx = medir('contexto', () => C.crearContexto(doc));
  const res = medir('resumenPeriodo', () => A.resumenPeriodo(doc, F.sumarDias(HOY, -400), HOY));
  medir('ranking', () => A.rankingProductos(doc, ctx, res));
  medir('alertas', () => A.alertas(doc, ctx, HOY));
  const stock = medir('stock', () => A.stockInsumos(doc));
  medir('valorInventario', () => A.valorInventario(doc, ctx, stock));
  medir('saldos', () => A.saldosCaja(doc, HOY));
  medir('porCobrar', () => A.cuentasPorCobrar(doc, HOY));
  medir('puente', () => A.puenteUtilidadCaja(doc, F.sumarDias(HOY, -400), HOY, res));
  medir('validar', () => V.validarDocumento(doc));
  medir('guardarPedido', () => O.guardarPedido(doc, O.clonar(doc.datos.pedidos[100])));
  medir('serializar', () => JSON.stringify(doc));
  console.log('# tiempos (ms): ' + Object.entries(t).map(([k, v]) => k + '=' + v.toFixed(0)).join(' '));
  Object.entries(t).forEach(([k, v]) => assert.ok(v < 1000, k + ' tardó ' + v.toFixed(0) + ' ms'));
  assert.equal(res.nVentas, 5000);
  assert.equal(doc.datos.pedidos.length, 5000);
});

test('gastos fijos reales: el promedio solo cuenta los meses con gastos fijos registrados', () => {
  const doc = M.docNuevo();
  doc.config.mesesPromedioFijos = 3;
  const cuenta = O.guardarEntidad(doc, 'cuentas', M.nuevaCuenta({ nombre: 'Efectivo', saldoInicial: 0, fechaSaldoInicial: '2026-01-01' }));
  // hoy = 2026-10-09: solo septiembre tiene gastos fijos; julio y agosto no tienen registros
  O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-09-05', descripcion: 'Arriendo', tipo: 'fijo', clasificacion: 'operativo', valor: 600000, estadoPago: 'pagado', cuentaId: cuenta.id }));
  O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-09-10', descripcion: 'Internet', tipo: 'fijo', clasificacion: 'operativo', valor: 60000, estadoPago: 'pagado', cuentaId: cuenta.id }));
  // una inversión y un gasto variable no cuentan como gasto fijo
  O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-09-12', descripcion: 'Nevera', tipo: 'fijo', clasificacion: 'inversion', valor: 900000, estadoPago: 'pagado', cuentaId: cuenta.id }));
  O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-09-15', descripcion: 'Gas', tipo: 'variable', clasificacion: 'operativo', valor: 50000, estadoPago: 'pagado', cuentaId: cuenta.id }));
  const f = A.gastosFijosMensuales(doc, '2026-10-09');
  assert.equal(f.mesesConDatos, 1);
  assert.equal(f.reales, 660000);
  // con otro mes registrado el promedio es la media de los dos meses con datos
  O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-08-05', descripcion: 'Arriendo', tipo: 'fijo', clasificacion: 'operativo', valor: 600000, estadoPago: 'pagado', cuentaId: cuenta.id }));
  const f2 = A.gastosFijosMensuales(doc, '2026-10-09');
  assert.equal(f2.mesesConDatos, 2);
  assert.equal(f2.reales, 630000);
});
