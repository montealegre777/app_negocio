/* Versiones del esquema de datos y migraciones. UMD. */
(function (root, factory) {
  var M;
  if (typeof module === 'object' && module.exports) M = require('./modelo.js'); else M = root.App.Modelo;
  var mod = factory(M);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Migraciones = mod; }
}(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  /**
   * v0 → v1: documentos guardados antes de tener versión de esquema o con campos faltantes.
   * No elimina datos: solo completa lo que falta.
   */
  function v0a1(doc) {
    var t = M.ahoraISO();
    doc.config = Object.assign(M.configPorDefecto(), esObjeto(doc.config) ? doc.config : {});
    if (!esObjeto(doc.config.impuestos)) doc.config.impuestos = { activo: false, preciosIncluyenImpuesto: false };
    if (!esObjeto(doc.datos)) doc.datos = {};
    M.COLECCIONES.forEach(function (c) {
      if (!Array.isArray(doc.datos[c])) doc.datos[c] = [];
      doc.datos[c].forEach(function (x) {
        if (!esObjeto(x)) return;
        if (!x.id) x.id = M.crearId();
        if (!x.creadoEn) x.creadoEn = doc.creadoEn || t;
        if (!x.actualizadoEn) x.actualizadoEn = x.creadoEn;
        if (typeof x.esDemo !== 'boolean') x.esDemo = false;
      });
    });
    ['insumos', 'recetas', 'canales', 'clientes', 'proveedores', 'cuentas'].forEach(function (c) {
      doc.datos[c].forEach(function (x) { if (typeof x.archivado !== 'boolean') x.archivado = false; });
    });
    doc.datos.insumos.forEach(function (i) {
      if (!Array.isArray(i.historialPrecios)) i.historialPrecios = [];
      if (!Array.isArray(i.equivalencias)) i.equivalencias = [];
      if (typeof i.mermaPct !== 'number') i.mermaPct = 0;
    });
    doc.datos.recetas.forEach(function (r) {
      if (!r.tipo) r.tipo = 'producto';
      if (!(r.rinde > 0)) r.rinde = 1;
      if (!r.unidadRinde) r.unidadRinde = r.tipo === 'preparacion' ? 'g' : 'und';
      if (!Array.isArray(r.lineas)) r.lineas = [];
      if (!Array.isArray(r.costosAdicionales)) r.costosAdicionales = [];
      if (!esObjeto(r.preciosPorCanal)) r.preciosPorCanal = {};
      r.lineas.forEach(function (l) { if (!l.id) l.id = M.crearId(); });
    });
    doc.datos.pedidos.forEach(function (p) {
      if (!Array.isArray(p.pagos)) p.pagos = [];
      if (!Array.isArray(p.lineas)) p.lineas = [];
      p.pagos.forEach(function (pg) { if (!pg.id) pg.id = M.crearId(); });
      p.lineas.forEach(function (l) { if (!l.id) l.id = M.crearId(); });
    });
    var maxNum = doc.datos.pedidos.reduce(function (m, p) { return Math.max(m, p.numero || 0); }, 0);
    if (!(doc.config.siguientePedido > maxNum)) doc.config.siguientePedido = maxNum + 1;
    doc.creadoEn = doc.creadoEn || t;
    doc.actualizadoEn = doc.actualizadoEn || t;
    doc.schemaVersion = 1;
    return doc;
  }

  // Lista ordenada de pasos: cada uno lleva de `desde` a `desde + 1`.
  var PASOS = [{ desde: 0, fn: v0a1 }];

  /** Migra (en una copia) hasta la versión actual. Devuelve {doc, migrado, desde, hasta, error?}. */
  function migrar(docEntrada) {
    if (!esObjeto(docEntrada)) return { doc: null, migrado: false, error: 'El archivo no contiene un documento válido.' };
    var doc = JSON.parse(JSON.stringify(docEntrada));
    var v = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
    if (v > M.SCHEMA_VERSION) {
      return { doc: null, migrado: false, desde: v, error: 'Estos datos fueron creados con una versión más nueva de la app (esquema ' + v + '). Actualiza la app antes de importarlos.' };
    }
    var desde = v;
    while (v < M.SCHEMA_VERSION) {
      var paso = PASOS.filter(function (p) { return p.desde === v; })[0];
      if (!paso) return { doc: null, migrado: false, desde: desde, error: 'No existe una migración desde la versión ' + v + '.' };
      doc = paso.fn(doc);
      v = doc.schemaVersion;
    }
    doc.appVersion = M.APP_VERSION;
    return { doc: doc, migrado: desde !== M.SCHEMA_VERSION, desde: desde, hasta: M.SCHEMA_VERSION };
  }

  return { migrar: migrar, PASOS: PASOS };
}));
