'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, F, C, O, A, HOY, docDemo, porNombre, cerca, agregarInsumo } = require('./_util.js');

function docConReceta(insumoDef, lineaDef, extra) {
  const doc = M.docNuevo();
  const ins = agregarInsumo(doc, insumoDef.nombre, insumoDef.unidadBase, insumoDef.precio, insumoDef.cantidad, insumoDef.unidad, insumoDef.extra);
  const r = O.guardarReceta(doc, M.nuevaReceta(Object.assign({ nombre: 'R', precioBase: 1000, lineas: [M.nuevaLinea('insumo', ins.id, lineaDef.cantidad, lineaDef.unidad, lineaDef.merma)] }, extra || {})));
  return { doc, ins, r, ctx: C.crearContexto(doc) };
}

test('A: costo 1.000, precio 2.000 → ganancia 1.000, margen 50 %, % sobre costo 100 %', () => {
  const r = C.resultadoUnitario({ precio: 2000, costoProd: 1000 }, 'produccion');
  assert.ok(cerca(r.ganancia, 1000));
  assert.ok(cerca(r.margen, 0.5));
  assert.ok(cerca(r.pctSobreCosto, 1));
});

test('B: tomate $6.000/kg, 30 g → $180', () => {
  const { ctx, r } = docConReceta({ nombre: 'Tomate', unidadBase: 'g', precio: 6000, cantidad: 1, unidad: 'kg' }, { cantidad: 30, unidad: 'g' });
  assert.ok(cerca(ctx.receta(r.id).lineas[0].costo, 180));
  assert.ok(cerca(ctx.receta(r.id).costoProd, 180));
});

test('C: aceite $12.000/l, 10 ml → $120', () => {
  const { ctx, r } = docConReceta({ nombre: 'Aceite', unidadBase: 'ml', precio: 12000, cantidad: 1, unidad: 'l' }, { cantidad: 10, unidad: 'ml' });
  assert.ok(cerca(ctx.receta(r.id).costoProd, 120));
});

test('D: merma 10 %: 30 g netos de tomate a $6/g → bruto 33,333 g y costo $200', () => {
  const { ctx, r } = docConReceta({ nombre: 'Tomate', unidadBase: 'g', precio: 6000, cantidad: 1, unidad: 'kg' }, { cantidad: 30, unidad: 'g', merma: 0.1 });
  const l = ctx.receta(r.id).lineas[0];
  assert.ok(cerca(l.cantidadBruta, 33.333333333333336, 1e-9));
  assert.ok(cerca(l.costo, 200));
  // La merma del insumo se usa si la línea no define la suya
  const d2 = docConReceta({ nombre: 'Tomate', unidadBase: 'g', precio: 6000, cantidad: 1, unidad: 'kg', extra: { mermaPct: 0.1 } }, { cantidad: 30, unidad: 'g' });
  assert.ok(cerca(d2.ctx.receta(d2.r.id).lineas[0].costo, 200));
  assert.ok(cerca(C.cantidadBruta(30, 0.1), 33.33333333333333, 1e-9));
});

test('E: preparación 200 g mayonesa + 50 g cebolla, rinde 250 g; 10 g cuestan $166', () => {
  const doc = M.docNuevo();
  const may = agregarInsumo(doc, 'Mayonesa', 'g', 8000, 400, 'g');
  const ceb = agregarInsumo(doc, 'Cebolla', 'g', 3000, 1000, 'g');
  const prep = O.guardarReceta(doc, M.nuevaReceta({
    tipo: 'preparacion', nombre: 'Salsa', rinde: 250, unidadRinde: 'g',
    lineas: [M.nuevaLinea('insumo', may.id, 200, 'g'), M.nuevaLinea('insumo', ceb.id, 50, 'g')]
  }));
  const prod = O.guardarReceta(doc, M.nuevaReceta({ nombre: 'Con salsa', precioBase: 5000, lineas: [M.nuevaLinea('preparacion', prep.id, 10, 'g')] }));
  const ctx = C.crearContexto(doc);
  assert.ok(cerca(ctx.receta(prep.id).costoTotal, 4150));
  assert.ok(cerca(ctx.receta(prep.id).costoProd, 16.6));
  assert.ok(cerca(ctx.receta(prod.id).costoProd, 166));
  // también funciona usando kg en la línea
  const prod2 = O.guardarReceta(doc, M.nuevaReceta({ nombre: 'Con salsa kg', lineas: [M.nuevaLinea('preparacion', prep.id, 0.01, 'kg')] }));
  assert.ok(cerca(C.crearContexto(doc).receta(prod2.id).costoProd, 166, 1e-9));
});

test('F: unidades incompatibles → error controlado, sin cálculo', () => {
  const { ctx, r } = docConReceta({ nombre: 'Tomate', unidadBase: 'g', precio: 6000, cantidad: 1, unidad: 'kg' }, { cantidad: 10, unidad: 'ml' });
  const rc = ctx.receta(r.id);
  assert.equal(rc.costoProd, null);
  assert.equal(rc.ok, false);
  assert.match(rc.errores[0], /incompatibles/);
  const res = C.resultadoProducto(ctx, r.id, null);
  assert.equal(res.errorCosto, true);
  assert.ok(res.indicadores.some((i) => i.id === 'costoError'));
});

test('equivalencia: 1 huevo (und) = 50 g permite usar unidades en una insumo medido en g', () => {
  const { ctx, r } = docConReceta({ nombre: 'Huevo', unidadBase: 'g', precio: 15000, cantidad: 30, unidad: 'und', extra: { equivalencias: [{ de: 'und', a: 'g', factor: 50 }] } }, { cantidad: 2, unidad: 'und' });
  // 30 und = 1500 g → $10/g; 2 und = 100 g → $1.000
  assert.ok(cerca(ctx.receta(r.id).costoProd, 1000));
});

test('G: hamburguesa de ejemplo (plataforma 20 %, extra $500, precio $12.000)', () => {
  const doc = docDemo();
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  const plat = porNombre(doc.datos.canales, 'Plataforma de domicilios');
  let ctx = C.crearContexto(doc);
  assert.ok(cerca(ctx.receta(hamb.id).costoProd, 3905));
  let res = C.resultadoProducto(ctx, hamb.id, plat.id);
  assert.ok(cerca(res.costosVariables, 6805));
  assert.ok(cerca(res.ganancia, 5195));
  assert.ok(cerca(res.margen, 0.432916666666667, 1e-12));
  assert.ok(cerca(res.pctSobreCosto, 1.330346, 1e-6)); // base producción
  doc.config.baseMarkup = 'variables';
  ctx = C.crearContexto(doc);
  res = C.resultadoProducto(ctx, hamb.id, plat.id);
  assert.ok(cerca(res.pctSobreCosto, 0.763409, 1e-6));
});

test('H: sándwich de ejemplo (directo 0 %, extra $300, precio $9.000)', () => {
  const doc = docDemo();
  const sand = porNombre(doc.datos.recetas, 'Sándwich de pollo');
  const dir = porNombre(doc.datos.canales, 'Venta directa');
  let ctx = C.crearContexto(doc);
  assert.ok(cerca(ctx.receta(sand.id).costoProd, 4185));
  let res = C.resultadoProducto(ctx, sand.id, dir.id);
  assert.ok(cerca(res.costosVariables, 4485));
  assert.ok(cerca(res.ganancia, 4515));
  assert.ok(cerca(res.margen, 0.501666666666667, 1e-12));
  assert.ok(cerca(res.pctSobreCosto, 1.078853, 1e-6));
  doc.config.baseMarkup = 'variables';
  ctx = C.crearContexto(doc);
  res = C.resultadoProducto(ctx, sand.id, dir.id);
  assert.ok(cerca(res.pctSobreCosto, 1.006689, 1e-6));
});

test('I, J, K: precio recomendado', () => {
  let r = C.precioRecomendado({ costoProd: 1000, margenObjetivo: 0.5, redondeo: 100 });
  assert.equal(r.precio, 2000);
  r = C.precioRecomendado({ costoProd: 1000, margenObjetivo: 0.3, comisionPct: 0.2, redondeo: 100 });
  assert.equal(r.precio, 2000);
  assert.ok(cerca(r.margenReal, 0.3));
  assert.ok(cerca(C.resultadoUnitario({ precio: r.precio, costoProd: 1000, comisionPct: 0.2 }).ganancia, 600));
  r = C.precioRecomendado({ costoProd: 1000, fijosAdic: 500, margenObjetivo: 0.3, comisionPct: 0.2, redondeo: 100 });
  assert.equal(r.precio, 3000);
  assert.ok(cerca(C.resultadoUnitario({ precio: r.precio, costoProd: 1000, fijosAdic: 500, comisionPct: 0.2 }).ganancia, 900));
});

test('precio recomendado: el redondeo hacia arriba nunca baja del margen objetivo', () => {
  for (const redondeo of [50, 100, 500, 1000]) {
    for (const m of [0.1, 0.25, 0.33, 0.5, 0.6]) {
      for (const costo of [333, 1234, 3905, 4185]) {
        const r = C.precioRecomendado({ costoProd: costo, fijosAdic: 120, pctAdic: 0.03, comisionPct: 0.15, margenObjetivo: m, redondeo });
        if (!r.ok) continue;
        assert.ok(r.margenReal >= m - 1e-12, 'margen ' + r.margenReal + ' < ' + m);
        assert.equal(r.precio % redondeo, 0);
      }
    }
  }
});

test('L: objetivo 60 % con comisión 40 % → sin precio posible, con mensaje', () => {
  const r = C.precioRecomendado({ costoProd: 1000, margenObjetivo: 0.6, comisionPct: 0.4, redondeo: 100 });
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /No existe un precio posible/);
  assert.equal(C.precioRecomendado({ costoProd: 1000, margenObjetivo: 1.2 }).ok, false);
});

test('M: precio 0 o costo 0 → null, sin NaN ni Infinity', () => {
  for (const base of ['produccion', 'variables']) {
    let r = C.resultadoUnitario({ precio: 0, costoProd: 1000 }, base);
    assert.equal(r.margen, null);
    assert.equal(r.pctSobreCosto, null);
    assert.equal(r.calculable, false);
    r = C.resultadoUnitario({ precio: 2000, costoProd: 0 }, base);
    assert.equal(r.pctSobreCosto, null);
    r = C.resultadoUnitario({ precio: 0, costoProd: 0 }, base);
    Object.values(r).forEach((v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v)); });
  }
});

test('N: prorrata del descuento de pedido (10 % sobre $20.000 y $5.000)', () => {
  const p = M.nuevoPedido({
    lineas: [
      { id: 'a', productoId: 'x', nombreSnap: 'A', cantidad: 1, precioUnit: 20000, descuentoLinea: { tipo: '$', valor: 0 }, snap: { costoProd: 5000, fijosAdic: 0, pctAdic: 0, comisionPct: 0 } },
      { id: 'b', productoId: 'y', nombreSnap: 'B', cantidad: 1, precioUnit: 5000, descuentoLinea: { tipo: '$', valor: 0 }, snap: { costoProd: 1000, fijosAdic: 0, pctAdic: 0, comisionPct: 0 } }
    ],
    descuentoPedido: { tipo: '%', valor: 0.1 }
  });
  const c = C.calcularPedido(p);
  assert.ok(cerca(c.lineas[0].descPedidoLinea, 2000));
  assert.ok(cerca(c.lineas[1].descPedidoLinea, 500));
  assert.ok(cerca(c.lineas[0].ingresoNeto, 18000));
  assert.ok(cerca(c.lineas[1].ingresoNeto, 4500));
  assert.ok(cerca(c.totalPedido, 22500));
  assert.ok(cerca(c.descuentoPedido, 2500));
});

test('pedido: descuento por línea, envío y comisión (no se calcula sobre el envío)', () => {
  const p = M.nuevoPedido({
    lineas: [{ id: 'a', productoId: 'x', nombreSnap: 'A', cantidad: 2, precioUnit: 12000, descuentoLinea: { tipo: '%', valor: 0.1 }, snap: { costoProd: 3905, fijosAdic: 500, pctAdic: 0, comisionPct: 0.2 } }],
    envioCobrado: 3000, costoEnvio: 2500
  });
  const c = C.calcularPedido(p);
  // bruto 24.000, desc 2.400 → neto 21.600; comisión 4.320; costo prod 7.810; otros 1.000
  assert.ok(cerca(c.lineas[0].ingresoNeto, 21600));
  assert.ok(cerca(c.comisiones, 4320));
  assert.ok(cerca(c.totalPedido, 24600));
  assert.ok(cerca(c.contribucion, 21600 - 7810 - 1000 - 4320 + 3000 - 2500));
});

test('O: lote de 20 hamburguesas → costo de producción $78.100', () => {
  const doc = docDemo();
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  const plat = porNombre(doc.datos.canales, 'Plataforma de domicilios');
  const ctx = C.crearContexto(doc);
  const lote = C.calcularLote(ctx, hamb.id, 20, plat.id);
  assert.ok(cerca(lote.costoProduccion, 78100));
  assert.ok(cerca(lote.gananciaEstimada, 5195 * 20));
  const pan = lote.ingredientes.find((i) => i.nombre === 'Pan de hamburguesa');
  assert.ok(cerca(pan.cantidad, 20));
});

test('P y Q: punto de equilibrio', () => {
  const a = C.puntoEquilibrio({ gastosFijos: 1000000, margenPonderado: 0.4 });
  assert.ok(cerca(a.ventasEquilibrio, 2500000));
  const b = C.puntoEquilibrio({ gastosFijos: 1000000, gananciaUnitaria: 5195 });
  assert.equal(b.unidadesEquilibrio, 193);
  assert.equal(C.puntoEquilibrio({ gastosFijos: 0, margenPonderado: 0.4 }).ok, false);
  assert.equal(C.puntoEquilibrio({ gastosFijos: 1000, margenPonderado: -0.1 }).ok, false);
  assert.equal(C.puntoEquilibrio({ gastosFijos: 1000, gananciaUnitaria: 0 }).ok, false);
});

test('meta: avance y promedio diario requerido', () => {
  const m = C.avanceMeta({ meta: 1000000, ventas: 400000, hoy: '2026-10-09' });
  assert.ok(cerca(m.avance, 0.4));
  assert.equal(m.diasRestantes, 23); // 9 al 31 de octubre incluye hoy
  assert.ok(cerca(m.promedioDiarioRequerido, 600000 / 23));
  assert.equal(C.avanceMeta({ meta: 0, ventas: 5, hoy: '2026-10-09' }), null);
});

test('referencias circulares entre preparaciones se detectan', () => {
  const doc = M.docNuevo();
  const ins = agregarInsumo(doc, 'Sal', 'g', 1000, 1000, 'g');
  const a = O.guardarReceta(doc, M.nuevaReceta({ tipo: 'preparacion', nombre: 'A', rinde: 100, lineas: [M.nuevaLinea('insumo', ins.id, 10, 'g')] }));
  const b = O.guardarReceta(doc, M.nuevaReceta({ tipo: 'preparacion', nombre: 'B', rinde: 100, lineas: [M.nuevaLinea('preparacion', a.id, 10, 'g')] }));
  assert.equal(C.creariaCiclo(doc, a.id, b.id), true);
  assert.equal(C.creariaCiclo(doc, b.id, a.id), false);
  // forzamos el ciclo en los datos: no debe colgarse y debe marcar error
  O.guardarReceta(doc, Object.assign({}, a, { lineas: [M.nuevaLinea('preparacion', b.id, 10, 'g')] }));
  const ctx = C.crearContexto(doc);
  assert.equal(ctx.receta(a.id).costoProd, null);
  assert.ok(ctx.receta(a.id).errores.length > 0);
});

test('simulador no modifica datos y refleja el efecto de subir 10 % los insumos', () => {
  const doc = docDemo();
  const antesJSON = JSON.stringify(doc);
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  const plat = porNombre(doc.datos.canales, 'Plataforma de domicilios');
  const s = C.simular(doc, hamb.id, plat.id, { factorInsumos: 1.1 });
  assert.ok(cerca(s.despues.costoProd, 3905 * 1.1, 1e-6));
  assert.ok(s.despues.ganancia < s.antes.ganancia);
  const s2 = C.simular(doc, hamb.id, plat.id, { precio: 14000, comisionPct: 0.25 });
  assert.ok(cerca(s2.despues.comision, 3500));
  assert.equal(JSON.stringify(doc), antesJSON);
});

test('impacto de cambiar el precio de un insumo en los productos', () => {
  const doc = docDemo();
  const queso = porNombre(doc.datos.insumos, 'Queso en lonjas');
  const imp = C.impactoCambioInsumo(doc, queso.id, 900); // sube de 800 a 900 por unidad
  const nombres = imp.map((x) => x.nombre).sort();
  assert.deepEqual(nombres, ['Hamburguesa de lentejas', 'Sándwich de pollo']);
  imp.forEach((x) => assert.ok(cerca(x.delta, 100)));
});

test('indicadores: contribución negativa, margen bajo, precio por debajo del recomendado', () => {
  const doc = docDemo();
  const hamb = porNombre(doc.datos.recetas, 'Hamburguesa de lentejas');
  hamb.precioBase = 5000; // por debajo del costo con comisión
  const plat = porNombre(doc.datos.canales, 'Plataforma de domicilios');
  const ctx = C.crearContexto(doc);
  const res = C.resultadoProducto(ctx, hamb.id, plat.id);
  const ids = res.indicadores.map((i) => i.id);
  assert.ok(ids.includes('contribNegativa'));
  assert.ok(ids.includes('precioBajo'));
});

test('política de costo promedio ponderado usa las compras', () => {
  const doc = M.docNuevo();
  doc.config.politicaCosto = 'promedio';
  const ins = agregarInsumo(doc, 'Arroz', 'g', 3000, 1000, 'g'); // $3/g
  O.guardarCompra(doc, M.nuevaCompra({ fecha: '2026-10-01', estadoPago: 'pendiente', lineas: [{ insumoId: ins.id, cantidad: 1000, unidad: 'g', precioTotal: 3000 }] }));
  O.guardarCompra(doc, M.nuevaCompra({ fecha: '2026-10-05', estadoPago: 'pendiente', lineas: [{ insumoId: ins.id, cantidad: 3000, unidad: 'g', precioTotal: 15000 }] }));
  const ctx = C.crearContexto(doc);
  assert.ok(cerca(ctx.costoBase(ins.id), 18000 / 4000)); // $4,5/g
  doc.config.politicaCosto = 'ultimo';
  assert.ok(cerca(C.crearContexto(doc).costoBase(ins.id), 5)); // última compra: $5/g
});
