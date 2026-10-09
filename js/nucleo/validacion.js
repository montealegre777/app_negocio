/* Validación de formularios y de documentos importados. Trata todo JSON importado como no confiable. UMD. */
(function (root, factory) {
  var M, U, F, G, C;
  if (typeof module === 'object' && module.exports) {
    M = require('./modelo.js'); U = require('./unidades.js'); F = require('./formato.js'); G = require('./migraciones.js'); C = require('./calculos.js');
  } else { M = root.App.Modelo; U = root.App.Unidades; F = root.App.Formato; G = root.App.Migraciones; C = root.App.Calculos; }
  var mod = factory(M, U, F, G, C);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Validacion = mod; }
}(typeof self !== 'undefined' ? self : this, function (M, U, F, G, C) {
  'use strict';

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function esNum(x) { return typeof x === 'number' && isFinite(x); }
  function esTexto(x) { return typeof x === 'string'; }
  function resultado(errores) { return { ok: Object.keys(errores).length === 0, errores: errores }; }

  // ---------------- Formularios ----------------
  function validarInsumo(i, doc) {
    var e = {};
    if (!esTexto(i.nombre) || !i.nombre.trim()) e.nombre = 'Escribe el nombre del insumo.';
    else if (doc && doc.datos.insumos.some(function (x) { return x.id !== i.id && !x.archivado && x.nombre.trim().toLowerCase() === i.nombre.trim().toLowerCase(); })) e.nombre = 'Ya existe un insumo con ese nombre.';
    if (M.CATEGORIAS_INSUMO.indexOf(i.categoria) < 0) e.categoria = 'Elige una categoría.';
    if (U.UNIDADES_BASE.indexOf(i.unidadBase) < 0) e.unidadBase = 'Elige la unidad base (g, ml o und).';
    var p = i.presentacion || {};
    if (!esNum(p.precio) || p.precio < 0) e.precio = 'El precio debe ser un número mayor o igual a 0.';
    if (!esNum(p.cantidad) || p.cantidad <= 0) e.cantidad = 'La cantidad de la presentación debe ser mayor que 0.';
    if (!U.esUnidad(p.unidad)) e.unidad = 'Elige la unidad de la presentación.';
    else if (U.UNIDADES_BASE.indexOf(i.unidadBase) >= 0 && !U.sePuedeConvertir(p.unidad, i.unidadBase, i.equivalencias)) e.unidad = 'Unidades incompatibles: agrega una equivalencia (ej. 1 und = 50 g) o usa una unidad de la misma familia.';
    if (!esNum(i.mermaPct) || i.mermaPct < 0 || i.mermaPct > 0.95) e.mermaPct = 'La merma debe estar entre 0 % y 95 %.';
    if (i.stockMinimo !== undefined && (!esNum(i.stockMinimo) || i.stockMinimo < 0)) e.stockMinimo = 'El stock mínimo no puede ser negativo.';
    (i.equivalencias || []).forEach(function (q, k) {
      if (!U.esUnidad(q.de) || !U.esUnidad(q.a) || U.familia(q.de) === U.familia(q.a) || !(q.factor > 0)) e['equivalencia' + k] = 'Equivalencia inválida: usa unidades de familias distintas y un factor mayor que 0.';
    });
    return resultado(e);
  }

  function validarReceta(r, doc) {
    var e = {};
    if (!esTexto(r.nombre) || !r.nombre.trim()) e.nombre = 'Escribe el nombre.';
    else if (doc && doc.datos.recetas.some(function (x) { return x.id !== r.id && !x.archivado && x.tipo === r.tipo && x.nombre.trim().toLowerCase() === r.nombre.trim().toLowerCase(); })) e.nombre = 'Ya existe uno con ese nombre.';
    if (!esNum(r.rinde) || r.rinde <= 0) e.rinde = 'El rendimiento debe ser mayor que 0.';
    if (!U.esUnidad(r.unidadRinde)) e.unidadRinde = 'Elige la unidad del rendimiento.';
    if (r.tipo !== 'preparacion') {
      if (!esNum(r.precioBase) || r.precioBase < 0) e.precioBase = 'El precio debe ser mayor o igual a 0.';
      if (r.margenObjetivo !== undefined && r.margenObjetivo !== null && (!esNum(r.margenObjetivo) || r.margenObjetivo < 0 || r.margenObjetivo >= 1)) e.margenObjetivo = 'El margen objetivo debe estar entre 0 % y menos de 100 %.';
    }
    (r.lineas || []).forEach(function (l, k) {
      if (!esNum(l.cantidad) || l.cantidad <= 0) e['linea' + k] = 'La cantidad debe ser mayor que 0.';
      else if (!U.esUnidad(l.unidad)) e['linea' + k] = 'Elige una unidad.';
      else if (doc) {
        if (l.refTipo === 'insumo') {
          var ins = doc.datos.insumos.filter(function (x) { return x.id === l.refId; })[0];
          if (!ins) e['linea' + k] = 'El insumo no existe.';
          else if (!U.sePuedeConvertir(l.unidad, ins.unidadBase, ins.equivalencias)) e['linea' + k] = 'Unidades incompatibles (' + l.unidad + ' → ' + ins.unidadBase + '). Agrega una equivalencia al insumo.';
        } else if (l.refTipo === 'preparacion') {
          var pr = doc.datos.recetas.filter(function (x) { return x.id === l.refId; })[0];
          if (!pr) e['linea' + k] = 'La preparación no existe.';
          else if (!U.sePuedeConvertir(l.unidad, pr.unidadRinde || 'g', [])) e['linea' + k] = 'Unidades incompatibles con la preparación (' + (pr.unidadRinde || 'g') + ').';
          else if (r.id && C.creariaCiclo(doc, r.id, pr.id)) e['linea' + k] = 'Referencia circular: esa preparación ya usa esta receta.';
        } else if (l.refTipo === 'producto') {
          if (!doc.datos.recetas.some(function (x) { return x.id === l.refId && x.tipo === 'producto'; })) e['linea' + k] = 'El producto no existe.';
          else if (r.id && C.creariaCiclo(doc, r.id, l.refId)) e['linea' + k] = 'Referencia circular.';
        }
      }
      if (l.mermaPct !== undefined && (!esNum(l.mermaPct) || l.mermaPct < 0 || l.mermaPct > 0.95)) e['linea' + k] = 'La merma debe estar entre 0 % y 95 %.';
    });
    (r.costosAdicionales || []).forEach(function (c, k) {
      if (!esTexto(c.concepto) || !c.concepto.trim()) e['adic' + k] = 'Escribe el concepto del costo adicional.';
      else if (!esNum(c.valor) || c.valor < 0) e['adic' + k] = 'El valor debe ser mayor o igual a 0.';
      else if (c.tipo === 'porcentaje' && c.valor >= 1) e['adic' + k] = 'El porcentaje debe ser menor que 100 %.';
    });
    return resultado(e);
  }

  function validarCanal(c, doc) {
    var e = {};
    if (!esTexto(c.nombre) || !c.nombre.trim()) e.nombre = 'Escribe el nombre del canal.';
    else if (doc && doc.datos.canales.some(function (x) { return x.id !== c.id && !x.archivado && x.nombre.trim().toLowerCase() === c.nombre.trim().toLowerCase(); })) e.nombre = 'Ya existe un canal con ese nombre.';
    if (!esNum(c.comisionPct) || c.comisionPct < 0 || c.comisionPct >= 1) e.comisionPct = 'La comisión debe estar entre 0 % y menos de 100 %.';
    return resultado(e);
  }

  function validarCliente(c) {
    var e = {};
    if (!esTexto(c.nombre) || !c.nombre.trim()) e.nombre = 'Escribe el nombre del cliente.';
    return resultado(e);
  }
  function validarProveedor(c) {
    var e = {};
    if (!esTexto(c.nombre) || !c.nombre.trim()) e.nombre = 'Escribe el nombre del proveedor.';
    return resultado(e);
  }
  function validarCuenta(c) {
    var e = {};
    if (!esTexto(c.nombre) || !c.nombre.trim()) e.nombre = 'Escribe el nombre de la cuenta.';
    if (!esNum(c.saldoInicial)) e.saldoInicial = 'El saldo inicial debe ser un número.';
    if (!F.esFechaISO(c.fechaSaldoInicial)) e.fechaSaldoInicial = 'Fecha inválida.';
    return resultado(e);
  }

  function validarPedido(p, doc) {
    var e = {};
    if (!F.esFechaISO(p.fecha)) e.fecha = 'Fecha inválida.';
    if (M.ESTADOS_PEDIDO.indexOf(p.estado) < 0) e.estado = 'Estado inválido.';
    if (!p.lineas || !p.lineas.length) e.lineas = 'Agrega al menos un producto.';
    (p.lineas || []).forEach(function (l, k) {
      if (!l.productoId) e['linea' + k] = 'Elige el producto.';
      else if (!esNum(l.cantidad) || l.cantidad <= 0) e['linea' + k] = 'La cantidad debe ser mayor que 0.';
      else if (!esNum(l.precioUnit) || l.precioUnit < 0) e['linea' + k] = 'El precio no puede ser negativo.';
      else if (l.descuentoLinea && l.descuentoLinea.tipo === '%' && (l.descuentoLinea.valor < 0 || l.descuentoLinea.valor > 1)) e['linea' + k] = 'El descuento debe estar entre 0 % y 100 %.';
    });
    if (p.descuentoPedido && p.descuentoPedido.tipo === '%' && (p.descuentoPedido.valor < 0 || p.descuentoPedido.valor > 1)) e.descuentoPedido = 'El descuento debe estar entre 0 % y 100 %.';
    if (p.descuentoPedido && p.descuentoPedido.valor < 0) e.descuentoPedido = 'El descuento no puede ser negativo.';
    if (!esNum(p.envioCobrado) || p.envioCobrado < 0) e.envioCobrado = 'El envío cobrado no puede ser negativo.';
    if (!esNum(p.costoEnvio) || p.costoEnvio < 0) e.costoEnvio = 'El costo de envío no puede ser negativo.';
    (p.pagos || []).forEach(function (pg, k) {
      if (!esNum(pg.monto) || pg.monto <= 0) e['pago' + k] = 'El monto del pago debe ser mayor que 0.';
      else if (!pg.cuentaId) e['pago' + k] = 'Elige la cuenta del pago.';
    });
    return resultado(e);
  }

  function validarPago(pg, doc) {
    var e = {};
    if (!esNum(pg.monto) || pg.monto <= 0) e.monto = 'El monto debe ser mayor que 0.';
    else if (Math.round(pg.monto) !== pg.monto) e.monto = 'Registra el pago en pesos enteros.';
    if (!pg.cuentaId) e.cuentaId = 'Elige la cuenta donde entra el dinero.';
    if (!F.esFechaISO(pg.fecha)) e.fecha = 'Fecha inválida.';
    return resultado(e);
  }

  function validarGasto(g) {
    var e = {};
    if (!esTexto(g.descripcion) || !g.descripcion.trim()) e.descripcion = 'Describe el gasto.';
    if (!esNum(g.valor) || g.valor <= 0) e.valor = 'El valor debe ser mayor que 0.';
    if (!F.esFechaISO(g.fecha)) e.fecha = 'Fecha inválida.';
    if (g.estadoPago === 'pagado' && !g.cuentaId) e.cuentaId = 'Elige la cuenta de la que salió el dinero.';
    return resultado(e);
  }

  function validarCompra(c, doc) {
    var e = {};
    if (!F.esFechaISO(c.fecha)) e.fecha = 'Fecha inválida.';
    if (!c.lineas || !c.lineas.length) e.lineas = 'Agrega al menos un insumo.';
    (c.lineas || []).forEach(function (l, k) {
      var ins = doc && doc.datos.insumos.filter(function (x) { return x.id === l.insumoId; })[0];
      if (!l.insumoId || (doc && !ins)) e['linea' + k] = 'Elige el insumo.';
      else if (!esNum(l.cantidad) || l.cantidad <= 0) e['linea' + k] = 'La cantidad debe ser mayor que 0.';
      else if (!esNum(l.precioTotal) || l.precioTotal < 0) e['linea' + k] = 'El precio total no puede ser negativo.';
      else if (ins && !U.sePuedeConvertir(l.unidad, ins.unidadBase, ins.equivalencias)) e['linea' + k] = 'Unidades incompatibles con ' + ins.nombre + '.';
    });
    if (!esNum(c.flete) || c.flete < 0) e.flete = 'El flete no puede ser negativo.';
    if (c.estadoPago === 'pagado' && !c.cuentaId) e.cuentaId = 'Elige la cuenta de la que salió el dinero.';
    return resultado(e);
  }

  // ---------------- Documento completo ----------------
  var CLAVES_PELIGROSAS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };

  function validarDocumento(doc) {
    var errores = [];
    function err(t) { if (errores.length < 40) errores.push(t); }
    if (!esObjeto(doc)) return { ok: false, errores: ['El archivo no contiene un objeto JSON válido.'] };
    if (!Number.isInteger(doc.schemaVersion)) err('Falta schemaVersion.');
    else if (doc.schemaVersion > M.SCHEMA_VERSION) err('El esquema es más nuevo que esta versión de la app.');
    if (!esObjeto(doc.config)) err('Falta la configuración.');
    if (!esObjeto(doc.datos)) { err('Faltan los datos.'); return { ok: false, errores: errores }; }
    var cfg = doc.config || {};
    if (esObjeto(doc.config)) {
      if (!esNum(cfg.margenObjetivo) || cfg.margenObjetivo < 0 || cfg.margenObjetivo >= 1) err('Configuración: margenObjetivo fuera de rango.');
      if ([50, 100, 500, 1000].indexOf(cfg.redondeoPrecio) < 0) err('Configuración: redondeoPrecio inválido.');
      if (['produccion', 'variables'].indexOf(cfg.baseMarkup) < 0) err('Configuración: baseMarkup inválido.');
      if (['ultimo', 'promedio'].indexOf(cfg.politicaCosto) < 0) err('Configuración: politicaCosto inválida.');
      if (['sobrePedido', 'conProduccion'].indexOf(cfg.modoInventario) < 0) err('Configuración: modoInventario inválido.');
    }
    var d = doc.datos;
    M.COLECCIONES.forEach(function (c) {
      if (!Array.isArray(d[c])) err('La colección «' + c + '» no es una lista.');
    });
    if (errores.length) return { ok: false, errores: errores };

    var ids = {};
    M.COLECCIONES.forEach(function (c) {
      ids[c] = {};
      d[c].forEach(function (x, k) {
        if (!esObjeto(x)) { err(c + ' #' + (k + 1) + ': no es un objeto.'); return; }
        if (!esTexto(x.id) || !x.id) { err(c + ' #' + (k + 1) + ': falta el id.'); return; }
        if (ids[c][x.id]) err(c + ': id repetido (' + x.id + ').');
        ids[c][x.id] = true;
      });
    });
    function ref(col, id, desde) { if (id && !ids[col][id]) err(desde + ': referencia a «' + col + '» inexistente.'); }

    d.insumos.forEach(function (i) {
      var n = 'Insumo «' + i.nombre + '»';
      if (!esTexto(i.nombre)) err(n + ': nombre inválido.');
      if (U.UNIDADES_BASE.indexOf(i.unidadBase) < 0) err(n + ': unidad base inválida.');
      if (!esObjeto(i.presentacion) || !esNum(i.presentacion.precio) || i.presentacion.precio < 0 || !(i.presentacion.cantidad > 0) || !U.esUnidad(i.presentacion.unidad)) err(n + ': presentación inválida.');
      if (!esNum(i.mermaPct) || i.mermaPct < 0 || i.mermaPct > 0.95) err(n + ': merma fuera de rango.');
      if (i.historialPrecios !== undefined && !Array.isArray(i.historialPrecios)) err(n + ': historial inválido.');
      if (i.proveedorIdPreferido) ref('proveedores', i.proveedorIdPreferido, n);
    });
    d.canales.forEach(function (c) { if (!esNum(c.comisionPct) || c.comisionPct < 0 || c.comisionPct >= 1) err('Canal «' + c.nombre + '»: comisión fuera de rango.'); });
    d.recetas.forEach(function (r) {
      var n = 'Receta «' + r.nombre + '»';
      if (['producto', 'preparacion', 'combo'].indexOf(r.tipo) < 0) err(n + ': tipo inválido.');
      if (!(r.rinde > 0)) err(n + ': rinde inválido.');
      if (!Array.isArray(r.lineas)) { err(n + ': líneas inválidas.'); return; }
      r.lineas.forEach(function (l) {
        if (!esNum(l.cantidad) || l.cantidad < 0 || !U.esUnidad(l.unidad)) err(n + ': línea con cantidad o unidad inválida.');
        if (l.refTipo === 'insumo') ref('insumos', l.refId, n); else if (l.refTipo === 'preparacion' || l.refTipo === 'producto') ref('recetas', l.refId, n); else err(n + ': tipo de línea inválido.');
      });
      if (r.precioBase !== undefined && (!esNum(r.precioBase) || r.precioBase < 0)) err(n + ': precio inválido.');
      if (esObjeto(r.preciosPorCanal)) Object.keys(r.preciosPorCanal).forEach(function (k) { if (!esNum(r.preciosPorCanal[k]) || r.preciosPorCanal[k] < 0) err(n + ': precio por canal inválido.'); });
    });
    d.pedidos.forEach(function (p) {
      var n = 'Pedido #' + p.numero;
      if (!F.esFechaISO(p.fecha)) err(n + ': fecha inválida.');
      if (M.ESTADOS_PEDIDO.indexOf(p.estado) < 0) err(n + ': estado inválido.');
      if (p.canalId) ref('canales', p.canalId, n);
      if (p.clienteId) ref('clientes', p.clienteId, n);
      if (!Array.isArray(p.lineas) || !Array.isArray(p.pagos)) { err(n + ': líneas o pagos inválidos.'); return; }
      p.lineas.forEach(function (l) {
        ref('recetas', l.productoId, n);
        if (!esNum(l.cantidad) || l.cantidad < 0 || !esNum(l.precioUnit) || l.precioUnit < 0) err(n + ': línea con valores inválidos.');
      });
      p.pagos.forEach(function (pg) {
        ref('cuentas', pg.cuentaId, n);
        if (!esNum(pg.monto) || pg.monto < 0 || !F.esFechaISO(pg.fecha)) err(n + ': pago inválido.');
      });
    });
    d.cuentas.forEach(function (c) { if (!esNum(c.saldoInicial)) err('Cuenta «' + c.nombre + '»: saldo inicial inválido.'); });
    d.movimientosCaja.forEach(function (m) {
      ref('cuentas', m.cuentaId, 'Movimiento de caja');
      if (!esNum(m.monto) || !F.esFechaISO(m.fecha) || M.TIPOS_MOV_CAJA.indexOf(m.tipo) < 0) err('Movimiento de caja inválido.');
    });
    d.gastos.forEach(function (g) {
      if (!esNum(g.valor) || g.valor < 0 || !F.esFechaISO(g.fecha)) err('Gasto «' + g.descripcion + '»: valores inválidos.');
      if (g.cuentaId) ref('cuentas', g.cuentaId, 'Gasto');
    });
    d.compras.forEach(function (c) {
      if (!F.esFechaISO(c.fecha) || !Array.isArray(c.lineas)) { err('Compra inválida.'); return; }
      if (c.proveedorId) ref('proveedores', c.proveedorId, 'Compra');
      if (c.cuentaId) ref('cuentas', c.cuentaId, 'Compra');
      c.lineas.forEach(function (l) { ref('insumos', l.insumoId, 'Compra'); if (!esNum(l.cantidad) || !esNum(l.precioTotal)) err('Compra con valores inválidos.'); });
    });
    d.movInventario.forEach(function (m) {
      if (!esNum(m.cantidadBase) || !F.esFechaISO(m.fecha)) err('Movimiento de inventario inválido.');
      if (m.insumoId) ref('insumos', m.insumoId, 'Movimiento de inventario');
      if (m.productoId) ref('recetas', m.productoId, 'Movimiento de inventario');
    });
    d.lotes.forEach(function (l) { ref('recetas', l.productoId, 'Lote'); if (!esNum(l.cantidad) || l.cantidad <= 0) err('Lote inválido.'); });
    return { ok: errores.length === 0, errores: errores };
  }

  function resumenDocumento(doc) {
    var r = {};
    M.COLECCIONES.forEach(function (c) { r[c] = Array.isArray(doc.datos[c]) ? doc.datos[c].length : 0; });
    return r;
  }

  /** Lee un JSON importado: parsea sin claves peligrosas, migra y valida. No modifica nada por sí solo. */
  function importarTexto(texto) {
    var obj;
    if (typeof texto !== 'string' || !texto.trim()) return { ok: false, errores: ['El archivo está vacío.'] };
    try { obj = JSON.parse(texto, function (k, v) { return CLAVES_PELIGROSAS[k] ? undefined : v; }); }
    catch (e) { return { ok: false, errores: ['El archivo no es un JSON válido: ' + e.message] }; }
    var pareceRespaldo = obj && typeof obj === 'object' && !Array.isArray(obj) && obj.datos && typeof obj.datos === 'object' &&
      M.COLECCIONES.some(function (c) { return Array.isArray(obj.datos[c]); });
    if (!pareceRespaldo) return { ok: false, errores: ['Este archivo no parece un respaldo de esta app (no encuentro la sección «datos» con tus registros). Usa un archivo .json descargado desde «Configuración y respaldos».'] };
    var mig = G.migrar(obj);
    if (!mig.doc) return { ok: false, errores: [mig.error] };
    var v = validarDocumento(mig.doc);
    if (!v.ok) return { ok: false, errores: v.errores };
    return { ok: true, doc: mig.doc, migrado: mig.migrado, desde: mig.desde, resumen: resumenDocumento(mig.doc) };
  }

  return {
    validarInsumo: validarInsumo, validarReceta: validarReceta, validarCanal: validarCanal, validarCliente: validarCliente,
    validarProveedor: validarProveedor, validarCuenta: validarCuenta, validarPedido: validarPedido, validarPago: validarPago,
    validarGasto: validarGasto, validarCompra: validarCompra, validarDocumento: validarDocumento, resumenDocumento: resumenDocumento,
    importarTexto: importarTexto
  };
}));
