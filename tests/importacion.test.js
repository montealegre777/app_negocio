'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/nucleo/validacion.js');
const G = require('../js/nucleo/migraciones.js');
const Almacen = require('../js/almacen.js');
const { M, C, O, D, docDemo } = require('./_util.js');

test('ida y vuelta: exportar → importar produce un estado idéntico', () => {
  const doc = docDemo();
  const texto = JSON.stringify(doc, null, 2);
  const r = V.importarTexto(texto);
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc, JSON.parse(texto));
  assert.equal(r.migrado, false);
  assert.equal(r.resumen.pedidos, doc.datos.pedidos.length);
  // y los cálculos dan lo mismo
  const a = C.crearContexto(doc), b = C.crearContexto(r.doc);
  doc.datos.recetas.forEach((rc) => assert.equal(a.receta(rc.id).costoProd, b.receta(rc.id).costoProd));
});

test('importar JSON inválido no modifica nada y explica el error', () => {
  const st = new Map();
  const storage = { getItem: (k) => (st.has(k) ? st.get(k) : null), setItem: (k, v) => st.set(k, v), removeItem: (k) => st.delete(k) };
  const alm = Almacen.crear(storage);
  alm.guardar(docDemo());
  const antes = storage.getItem(M.CLAVE);
  for (const malo of ['', 'no es json', '[]', '{"schemaVersion":1}', '{"schemaVersion":99,"config":{},"datos":{}}',
    JSON.stringify({ schemaVersion: 1, config: M.configPorDefecto(), datos: { insumos: 'x' } })]) {
    const r = V.importarTexto(malo);
    assert.equal(r.ok, false, 'debió rechazar: ' + malo.slice(0, 30));
    assert.ok(r.errores.length >= 1 && typeof r.errores[0] === 'string');
  }
  assert.equal(storage.getItem(M.CLAVE), antes);
});

test('importar rechaza referencias rotas y claves peligrosas no se heredan', () => {
  const doc = docDemo();
  doc.datos.pedidos[0].lineas[0].productoId = 'fantasma';
  let r = V.importarTexto(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => /inexistente/.test(e)));
  const limpio = JSON.stringify(docDemo()).replace('"config":{', '"config":{"__proto__":{"polluted":true},');
  r = V.importarTexto(limpio);
  assert.equal(r.ok, true);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(r.doc.config, 'polluted'), false);
});

test('migración: un documento sin schemaVersion se migra sin perder datos', () => {
  const viejo = {
    config: { nombreNegocio: 'Mi negocio viejo', margenObjetivo: 0.4 },
    datos: {
      insumos: [{ nombre: 'Harina', unidadBase: 'g', presentacion: { precio: 4000, cantidad: 1000, unidad: 'g' } }],
      recetas: [{ nombre: 'Pan', precioBase: 2500, lineas: [{ refTipo: 'insumo', refId: 'X', cantidad: 100, unidad: 'g' }] }],
      pedidos: [{ id: 'p1', numero: 7, fecha: '2026-10-01', estado: 'entregado', lineas: [], pagos: [] }]
    }
  };
  viejo.datos.recetas[0].lineas[0].refId = 'ins-1';
  viejo.datos.insumos[0].id = 'ins-1';
  const m = G.migrar(viejo);
  assert.ok(m.doc);
  assert.equal(m.migrado, true);
  assert.equal(m.desde, 0);
  assert.equal(m.doc.schemaVersion, M.SCHEMA_VERSION);
  assert.equal(m.doc.config.nombreNegocio, 'Mi negocio viejo');
  assert.equal(m.doc.config.margenObjetivo, 0.4);
  assert.equal(m.doc.config.modoInventario, 'sobrePedido'); // completado con valores por defecto
  assert.equal(m.doc.datos.insumos[0].nombre, 'Harina');
  assert.equal(m.doc.datos.recetas[0].rinde, 1);
  assert.ok(m.doc.datos.recetas[0].id && m.doc.datos.recetas[0].lineas[0].id);
  assert.equal(m.doc.datos.pedidos[0].numero, 7);
  assert.equal(m.doc.config.siguientePedido, 8);
  assert.deepEqual(M.COLECCIONES.filter((c) => !Array.isArray(m.doc.datos[c])), []);
  // el original no se modifica
  assert.equal(viejo.schemaVersion, undefined);
  // pasa la validación completa tras migrar
  assert.equal(V.validarDocumento(m.doc).ok, true);
  // importarTexto lo acepta y lo marca como migrado
  const r = V.importarTexto(JSON.stringify(viejo));
  assert.equal(r.ok, true);
  assert.equal(r.migrado, true);
});

test('migración: versión más nueva que la app se rechaza con mensaje claro', () => {
  const m = G.migrar({ schemaVersion: 99, config: {}, datos: {} });
  assert.equal(m.doc, null);
  assert.match(m.error, /más nueva/);
});

test('datos de ejemplo: quitarlos no toca registros reales', () => {
  const doc = docDemo();
  const insumoReal = O.guardarInsumo(doc, M.nuevoInsumo({ nombre: 'Sal real', unidadBase: 'g', presentacion: { precio: 1000, cantidad: 1000, unidad: 'g' } }));
  const cuentaReal = O.guardarEntidad(doc, 'cuentas', M.nuevaCuenta({ nombre: 'Caja real', saldoInicial: 5000 }));
  const recetaReal = O.guardarReceta(doc, M.nuevaReceta({ nombre: 'Arroz real', precioBase: 3000, lineas: [M.nuevaLinea('insumo', insumoReal.id, 50, 'g')] }));
  const gastoReal = O.guardarGasto(doc, M.nuevoGasto({ fecha: '2026-10-08', descripcion: 'Gasto real', valor: 12000, estadoPago: 'pagado', cuentaId: cuentaReal.id }));
  assert.equal(O.hayDemo(doc), true);
  const r = O.quitarDemo(doc);
  assert.equal(r.ok, true);
  assert.equal(O.hayDemo(doc), false);
  assert.deepEqual(doc.datos.insumos.map((i) => i.nombre), ['Sal real']);
  assert.deepEqual(doc.datos.recetas.map((x) => x.nombre), ['Arroz real']);
  assert.equal(doc.datos.pedidos.length, 0);
  assert.equal(doc.datos.gastos.length, 1);
  assert.equal(doc.datos.movimientosCaja.length, 1); // solo el pago del gasto real
  assert.equal(doc.datos.movimientosCaja[0].origen.id, gastoReal.id);
  assert.equal(doc.datos.movInventario.length, 0);
  assert.equal(V.validarDocumento(doc).ok, true);
  assert.ok(recetaReal.id);
});

test('datos de ejemplo: si un registro real depende de uno de ejemplo, se bloquea el borrado', () => {
  const doc = docDemo();
  const queso = doc.datos.insumos.find((i) => i.nombre === 'Queso en lonjas');
  const real = O.guardarReceta(doc, M.nuevaReceta({ nombre: 'Tostada real', precioBase: 4000, lineas: [M.nuevaLinea('insumo', queso.id, 1, 'und')] }));
  const antes = JSON.stringify(doc);
  const r = O.quitarDemo(doc);
  assert.equal(r.ok, false);
  assert.ok(r.bloqueos.length >= 1);
  assert.match(r.bloqueos[0], /Tostada real/);
  assert.equal(JSON.stringify(doc), antes); // no se tocó nada
  assert.ok(real.id);
});

test('archivar frente a borrar: un insumo usado en recetas no se elimina', () => {
  const doc = docDemo();
  const queso = doc.datos.insumos.find((i) => i.nombre === 'Queso en lonjas');
  const uso = O.usoDeEntidad(doc, 'insumos', queso.id);
  assert.equal(uso.tieneHistoria, true);
  assert.equal(uso.recetas.length, 2);
  assert.equal(O.eliminarEntidad(doc, 'insumos', queso.id), false);
  assert.ok(doc.datos.insumos.some((i) => i.id === queso.id));
  O.archivar(doc, 'insumos', queso.id);
  assert.equal(O.buscar(doc.datos.insumos, queso.id).archivado, true);
  // un insumo nuevo sin uso sí puede eliminarse
  const nuevo = O.guardarInsumo(doc, M.nuevoInsumo({ nombre: 'Orégano', unidadBase: 'g', presentacion: { precio: 1000, cantidad: 100, unidad: 'g' } }));
  assert.equal(O.eliminarEntidad(doc, 'insumos', nuevo.id), true);
});

test('importación: un JSON válido que no es un respaldo se rechaza (no reemplaza tus datos por un documento vacío)', () => {
  for (const texto of ['{"hola": 1}', '[]', '{"datos": 5}', '{"config": {}, "datos": {"otraCosa": []}}', 'null']) {
    const r = V.importarTexto(texto);
    assert.equal(r.ok, false, texto);
    assert.match(r.errores[0], /no parece un respaldo|no es un JSON válido|no contiene/i, texto);
  }
});
