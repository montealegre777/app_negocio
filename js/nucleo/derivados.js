/* Movimientos de inventario y de caja DERIVADOS de su documento origen (pedido, compra, gasto, lote).
   Se regeneran de forma idempotente: reemplazan los anteriores del mismo origen. Nunca se editan a mano. UMD. */
(function (root, factory) {
  var C;
  if (typeof module === 'object' && module.exports) C = require('./calculos.js'); else C = root.App.Calculos;
  var mod = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Derivados = mod; }
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  function quitarOrigen(arr, tipo, id) {
    var w = 0;
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!(m.origen && m.origen.tipo === tipo && m.origen.id === id)) arr[w++] = m;
    }
    arr.length = w;
  }

  function buscar(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function sellos(origen, extra) {
    extra.creadoEn = origen.creadoEn || origen.actualizadoEn || null;
    extra.actualizadoEn = origen.actualizadoEn || origen.creadoEn || null;
    extra.esDemo = !!origen.esDemo;
    extra.manual = false;
    return extra;
  }

  function totalCompra(c) {
    var s = 0;
    (c.lineas || []).forEach(function (l) { s += C.num(l.precioTotal); });
    return s + C.num(c.flete);
  }

  // ---------- historial de precios generado por compras ----------
  function quitarHistorialCompra(doc, compraId) {
    var marca = 'compra:' + compraId;
    doc.datos.insumos.forEach(function (ins) {
      if (!ins.historialPrecios || !ins.historialPrecios.length) return;
      var nuevo = ins.historialPrecios.filter(function (h) { return h.origen !== marca; });
      if (nuevo.length !== ins.historialPrecios.length) ins.historialPrecios = nuevo;
    });
  }

  function agregarHistorialCompra(doc, compra) {
    var porId = C.mapaPorId(doc.datos.insumos);
    var lin = C.lineasCompraPorInsumo([compra], porId);
    Object.keys(lin).forEach(function (insId) {
      var q = 0, c = 0;
      lin[insId].forEach(function (x) { q += x.cantidadBase; c += x.costoTotal; });
      if (!(q > 0)) return;
      var ins = porId[insId];
      ins.historialPrecios = ins.historialPrecios || [];
      ins.historialPrecios.push({ fecha: compra.fecha, costoBase: c / q, origen: 'compra:' + compra.id, ts: compra.creadoEn || compra.actualizadoEn || '' });
    });
  }

  // ---------- por tipo de origen ----------
  function regenerarPedido(doc, id) {
    var d = doc.datos;
    quitarOrigen(d.movInventario, 'pedido', id);
    quitarOrigen(d.movimientosCaja, 'pedido', id);
    var p = buscar(d.pedidos, id);
    if (!p) return;
    (p.pagos || []).forEach(function (pg) {
      d.movimientosCaja.push(sellos(p, {
        id: 'mc:pedido:' + p.id + ':' + pg.id, fecha: pg.fecha, cuentaId: pg.cuentaId, tipo: 'venta', monto: C.num(pg.monto),
        origen: { tipo: 'pedido', id: p.id, pagoId: pg.id }, descripcion: 'Pago del pedido #' + p.numero, medio: pg.medio || null
      }));
    });
    if (p.estado !== 'entregado') return;
    var ctx = C.crearContexto(doc);
    if (doc.config.modoInventario === 'conProduccion') {
      var porProd = {};
      (p.lineas || []).forEach(function (l) { porProd[l.productoId] = (porProd[l.productoId] || 0) + C.num(l.cantidad); });
      Object.keys(porProd).sort().forEach(function (pid) {
        d.movInventario.push(sellos(p, {
          id: 'mi:pedido:' + p.id + ':p:' + pid, fecha: p.fecha, productoId: pid, tipo: 'ventaTerminado',
          cantidadBase: -porProd[pid], costoBase: (ctx.receta(pid) || {}).costoProd || 0, origen: { tipo: 'pedido', id: p.id }
        }));
      });
    } else {
      var acc = {};
      (p.lineas || []).forEach(function (l) { C.consumoReceta(ctx, l.productoId, C.num(l.cantidad), acc); });
      Object.keys(acc).sort().forEach(function (insId) {
        d.movInventario.push(sellos(p, {
          id: 'mi:pedido:' + p.id + ':i:' + insId, fecha: p.fecha, insumoId: insId, tipo: 'consumoVenta',
          cantidadBase: -acc[insId], costoBase: ctx.costoBase(insId), origen: { tipo: 'pedido', id: p.id }
        }));
      });
    }
  }

  function regenerarGasto(doc, id) {
    var d = doc.datos;
    quitarOrigen(d.movimientosCaja, 'gasto', id);
    var g = buscar(d.gastos, id);
    if (!g || g.estadoPago !== 'pagado' || !g.cuentaId) return;
    d.movimientosCaja.push(sellos(g, {
      id: 'mc:gasto:' + g.id, fecha: g.fechaPago || g.fecha, cuentaId: g.cuentaId, tipo: 'gasto', monto: -C.num(g.valor),
      origen: { tipo: 'gasto', id: g.id }, descripcion: g.descripcion
    }));
  }

  function regenerarCompra(doc, id) {
    var d = doc.datos;
    quitarOrigen(d.movInventario, 'compra', id);
    quitarOrigen(d.movimientosCaja, 'compra', id);
    quitarHistorialCompra(doc, id);
    var c = buscar(d.compras, id);
    if (!c) return;
    agregarHistorialCompra(doc, c);
    var porId = C.mapaPorId(d.insumos);
    var lin = C.lineasCompraPorInsumo([c], porId);
    Object.keys(lin).sort().forEach(function (insId) {
      lin[insId].forEach(function (x, k) {
        d.movInventario.push(sellos(c, {
          id: 'mi:compra:' + c.id + ':' + insId + ':' + k, fecha: c.fecha, insumoId: insId, tipo: 'compra',
          cantidadBase: x.cantidadBase, costoBase: x.costoTotal / x.cantidadBase, origen: { tipo: 'compra', id: c.id }
        }));
      });
    });
    if (c.estadoPago === 'pagado' && c.cuentaId) {
      d.movimientosCaja.push(sellos(c, {
        id: 'mc:compra:' + c.id, fecha: c.fechaPago || c.fecha, cuentaId: c.cuentaId, tipo: 'compra', monto: -totalCompra(c),
        origen: { tipo: 'compra', id: c.id }, descripcion: 'Compra de insumos' + (c.proveedorId ? '' : '')
      }));
    }
  }

  function regenerarLote(doc, id) {
    var d = doc.datos;
    quitarOrigen(d.movInventario, 'lote', id);
    var l = buscar(d.lotes, id);
    if (!l || doc.config.modoInventario !== 'conProduccion') return;
    var ctx = C.crearContexto(doc);
    var acc = C.consumoReceta(ctx, l.productoId, C.num(l.cantidad), {});
    Object.keys(acc).sort().forEach(function (insId) {
      d.movInventario.push(sellos(l, {
        id: 'mi:lote:' + l.id + ':i:' + insId, fecha: l.fecha, insumoId: insId, tipo: 'consumoProduccion',
        cantidadBase: -acc[insId], costoBase: ctx.costoBase(insId), origen: { tipo: 'lote', id: l.id }
      }));
    });
    d.movInventario.push(sellos(l, {
      id: 'mi:lote:' + l.id + ':p', fecha: l.fecha, productoId: l.productoId, tipo: 'produccionTerminado',
      cantidadBase: C.num(l.cantidad), costoBase: (ctx.receta(l.productoId) || {}).costoProd || 0, origen: { tipo: 'lote', id: l.id }
    }));
  }

  function regenerarOrigen(doc, tipo, id) {
    if (tipo === 'pedido') regenerarPedido(doc, id);
    else if (tipo === 'gasto') regenerarGasto(doc, id);
    else if (tipo === 'compra') regenerarCompra(doc, id);
    else if (tipo === 'lote') regenerarLote(doc, id);
  }

  /** Reconstruye TODO lo derivado (los movimientos manuales —origen null— se conservan). */
  function regenerarTodo(doc) {
    var d = doc.datos;
    d.movInventario = d.movInventario.filter(function (m) { return !m.origen; });
    d.movimientosCaja = d.movimientosCaja.filter(function (m) { return !m.origen; });
    d.insumos.forEach(function (ins) {
      if (ins.historialPrecios) ins.historialPrecios = ins.historialPrecios.filter(function (h) { return !(typeof h.origen === 'string' && h.origen.indexOf('compra:') === 0); });
    });
    d.compras.forEach(function (c) { agregarHistorialCompra(doc, c); });
    d.gastos.forEach(function (g) { regenerarGasto(doc, g.id); });
    d.compras.forEach(function (c) {
      // el historial ya se agregó; regenerarCompra lo reemplaza de forma idempotente
      regenerarCompra(doc, c.id);
    });
    var ctx = C.crearContexto(doc);
    var cm = doc.config.modoInventario === 'conProduccion';
    d.pedidos.forEach(function (p) {
      (p.pagos || []).forEach(function (pg) {
        d.movimientosCaja.push(sellos(p, {
          id: 'mc:pedido:' + p.id + ':' + pg.id, fecha: pg.fecha, cuentaId: pg.cuentaId, tipo: 'venta', monto: C.num(pg.monto),
          origen: { tipo: 'pedido', id: p.id, pagoId: pg.id }, descripcion: 'Pago del pedido #' + p.numero, medio: pg.medio || null
        }));
      });
      if (p.estado !== 'entregado') return;
      if (cm) {
        var porProd = {};
        (p.lineas || []).forEach(function (l) { porProd[l.productoId] = (porProd[l.productoId] || 0) + C.num(l.cantidad); });
        Object.keys(porProd).sort().forEach(function (pid) {
          d.movInventario.push(sellos(p, { id: 'mi:pedido:' + p.id + ':p:' + pid, fecha: p.fecha, productoId: pid, tipo: 'ventaTerminado',
            cantidadBase: -porProd[pid], costoBase: (ctx.receta(pid) || {}).costoProd || 0, origen: { tipo: 'pedido', id: p.id } }));
        });
      } else {
        var acc = {};
        (p.lineas || []).forEach(function (l) { C.consumoReceta(ctx, l.productoId, C.num(l.cantidad), acc); });
        Object.keys(acc).sort().forEach(function (insId) {
          d.movInventario.push(sellos(p, { id: 'mi:pedido:' + p.id + ':i:' + insId, fecha: p.fecha, insumoId: insId, tipo: 'consumoVenta',
            cantidadBase: -acc[insId], costoBase: ctx.costoBase(insId), origen: { tipo: 'pedido', id: p.id } }));
        });
      }
    });
    d.lotes.forEach(function (l) { regenerarLote(doc, l.id); });
  }

  return { regenerarOrigen: regenerarOrigen, regenerarTodo: regenerarTodo, quitarOrigen: quitarOrigen, totalCompra: totalCompra };
}));
