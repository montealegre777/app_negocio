/* Operaciones de dominio sobre el documento (puras: reciben y modifican `doc`). Las usa el estado de la app y las pruebas. UMD. */
(function (root, factory) {
  var C, D, M, F;
  if (typeof module === 'object' && module.exports) { C = require('./calculos.js'); D = require('./derivados.js'); M = require('./modelo.js'); F = require('./formato.js'); }
  else { C = root.App.Calculos; D = root.App.Derivados; M = root.App.Modelo; F = root.App.Formato; }
  var mod = factory(C, D, M, F);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Operaciones = mod; }
}(typeof self !== 'undefined' ? self : this, function (C, D, M, F) {
  'use strict';

  function clonar(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function buscar(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function quitar(arr, id) { var i = arr.findIndex(function (x) { return x.id === id; }); if (i >= 0) arr.splice(i, 1); }

  /** Inserta o actualiza una entidad cualquiera de una colección. Devuelve el objeto guardado. */
  function guardarEntidad(doc, coleccion, obj) {
    var arr = doc.datos[coleccion];
    var existente = obj.id ? buscar(arr, obj.id) : null;
    if (existente) {
      var t = M.ahoraISO();
      Object.keys(obj).forEach(function (k) { if (k !== 'creadoEn' && k !== 'esDemo' && obj[k] !== undefined) existente[k] = obj[k]; });
      Object.keys(existente).forEach(function (k) { if (obj[k] === undefined && k in obj && k !== 'id' && k !== 'esDemo' && k !== 'creadoEn') delete existente[k]; });
      existente.actualizadoEn = t;
      return existente;
    }
    M.sellar(obj, false);
    arr.push(obj);
    return obj;
  }

  function archivar(doc, coleccion, id, valor) {
    var o = buscar(doc.datos[coleccion], id);
    if (!o) return null;
    o.archivado = valor !== false;
    o.actualizadoEn = M.ahoraISO();
    return o;
  }

  // ---------------- Insumos ----------------
  function guardarInsumo(doc, ins) {
    var existente = ins.id ? buscar(doc.datos.insumos, ins.id) : null;
    var nuevoCB = C.costoBasePresentacion(ins);
    var viejoCB = existente ? C.costoBasePresentacion(existente) : null;
    var historial = existente ? existente.historialPrecios : clonar(ins.historialPrecios || []);
    var guardado;
    var copia = clonar(ins);
    copia.historialPrecios = historial || [];
    guardado = guardarEntidad(doc, 'insumos', copia);
    guardado.historialPrecios = historial || [];
    var cambio = nuevoCB !== null && (!existente || viejoCB === null || Math.abs(nuevoCB - viejoCB) > 1e-9);
    if (cambio) {
      var entrada = { fecha: F.hoy(), costoBase: nuevoCB, origen: 'manual', ts: M.ahoraISO() };
      if (!existente) entrada.inicial = true;
      guardado.historialPrecios.push(entrada);
    }
    return guardado;
  }

  /** ¿Tiene historia? (usado en recetas, compras o movimientos). */
  function usoDeEntidad(doc, coleccion, id) {
    var d = doc.datos, uso = { recetas: [], documentos: 0 };
    if (coleccion === 'insumos') {
      uso.recetas = C.recetasQueUsan(doc, 'insumo', id);
      uso.documentos = d.compras.filter(function (c) { return c.lineas.some(function (l) { return l.insumoId === id; }); }).length +
        d.movInventario.filter(function (m) { return m.insumoId === id; }).length;
    } else if (coleccion === 'recetas') {
      uso.recetas = d.recetas.filter(function (r) { return !r.archivado && r.id !== id && r.lineas.some(function (l) { return l.refId === id && (l.refTipo === 'preparacion' || l.refTipo === 'producto'); }); });
      uso.documentos = d.pedidos.filter(function (p) { return p.lineas.some(function (l) { return l.productoId === id; }); }).length + d.lotes.filter(function (l) { return l.productoId === id; }).length;
    } else if (coleccion === 'canales') {
      uso.documentos = d.pedidos.filter(function (p) { return p.canalId === id; }).length;
    } else if (coleccion === 'clientes') {
      uso.documentos = d.pedidos.filter(function (p) { return p.clienteId === id; }).length;
    } else if (coleccion === 'proveedores') {
      uso.documentos = d.compras.filter(function (c) { return c.proveedorId === id; }).length + d.insumos.filter(function (i) { return i.proveedorIdPreferido === id; }).length;
    } else if (coleccion === 'cuentas') {
      uso.documentos = d.movimientosCaja.filter(function (m) { return m.cuentaId === id; }).length;
    }
    uso.tieneHistoria = uso.recetas.length + uso.documentos > 0;
    return uso;
  }

  function eliminarEntidad(doc, coleccion, id) {
    if (usoDeEntidad(doc, coleccion, id).tieneHistoria) return false;
    quitar(doc.datos[coleccion], id);
    return true;
  }

  // ---------------- Recetas ----------------
  function guardarReceta(doc, receta) {
    var copia = clonar(receta);
    (copia.lineas || []).forEach(function (l) { if (!l.id) l.id = M.crearId(); });
    (copia.costosAdicionales || []).forEach(function (c) { if (!c.id) c.id = M.crearId(); });
    return guardarEntidad(doc, 'recetas', copia);
  }

  function duplicarReceta(doc, id) {
    var o = buscar(doc.datos.recetas, id);
    if (!o) return null;
    var c = clonar(o);
    c.id = undefined; c.creadoEn = undefined; c.esDemo = false;
    c.nombre = o.nombre + ' (copia)';
    c.lineas.forEach(function (l) { l.id = M.crearId(); });
    (c.costosAdicionales || []).forEach(function (x) { x.id = M.crearId(); });
    delete c.archivado;
    c.archivado = false;
    return guardarEntidad(doc, 'recetas', c);
  }

  // ---------------- Pedidos ----------------
  function aplicarSnaps(ped, previo, ctx) {
    var congelado = !!(previo && previo.estado === 'entregado' && ped.estado === 'entregado');
    (ped.lineas || []).forEach(function (l) {
      if (!l.id) l.id = M.crearId();
      var r = ctx.recetas[l.productoId];
      if (r && !l.nombreSnap) l.nombreSnap = r.nombre;
      var pl = congelado ? (previo.lineas || []).filter(function (x) { return x.id === l.id && x.productoId === l.productoId && x.snap; })[0] : null;
      if (pl) {
        l.snap = clonar(pl.snap);
        if (previo.canalId !== ped.canalId) {
          var canal = ped.canalId ? ctx.canales[ped.canalId] : null;
          l.snap.comisionPct = canal ? C.num(canal.comisionPct) : 0;
        }
      } else {
        l.snap = C.crearSnap(ctx, l.productoId, ped.canalId);
      }
    });
    ped.snapCongelado = ped.estado === 'entregado';
  }

  function guardarPedido(doc, ped) {
    var d = doc.datos;
    var existente = ped.id ? buscar(d.pedidos, ped.id) : null;
    var previo = existente ? clonar(existente) : null;
    var copia = clonar(ped);
    if (!copia.numero) copia.numero = existente ? existente.numero : (doc.config.siguientePedido || 1);
    if (!existente) doc.config.siguientePedido = Math.max(doc.config.siguientePedido || 1, copia.numero) + 1;
    (copia.pagos || []).forEach(function (p) { if (!p.id) p.id = M.crearId(); });
    var ctx = C.crearContexto(doc);
    aplicarSnaps(copia, previo, ctx);
    var guardado = guardarEntidad(doc, 'pedidos', copia);
    D.regenerarOrigen(doc, 'pedido', guardado.id);
    return guardado;
  }

  function cambiarEstadoPedido(doc, id, estado) {
    var p = buscar(doc.datos.pedidos, id);
    if (!p) return null;
    var copia = clonar(p);
    copia.estado = estado;
    return guardarPedido(doc, copia);
  }

  function registrarPago(doc, pedidoId, pago) {
    var p = buscar(doc.datos.pedidos, pedidoId);
    if (!p) return null;
    p.pagos.push({ id: M.crearId(), fecha: pago.fecha || F.hoy(), cuentaId: pago.cuentaId, monto: pago.monto, medio: pago.medio || 'efectivo' });
    p.actualizadoEn = M.ahoraISO();
    D.regenerarOrigen(doc, 'pedido', p.id);
    return p;
  }

  function eliminarPago(doc, pedidoId, pagoId) {
    var p = buscar(doc.datos.pedidos, pedidoId);
    if (!p) return false;
    p.pagos = p.pagos.filter(function (x) { return x.id !== pagoId; });
    p.actualizadoEn = M.ahoraISO();
    D.regenerarOrigen(doc, 'pedido', p.id);
    return true;
  }

  /** Cancela el pedido. Si `devolver`, registra una devolución en caja por lo cobrado (editable). */
  function cancelarPedido(doc, id, opciones) {
    var o = opciones || {};
    var p = cambiarEstadoPedido(doc, id, 'cancelado');
    if (!p) return null;
    var pagado = C.totalPagado(p);
    var devuelto = 0;
    var yaDevuelto = doc.datos.movimientosCaja.some(function (m) { return m.tipo === 'devolucion' && m.refPedidoId === id; });
    if (o.devolver && pagado > 0 && !yaDevuelto) {
      var cuentaId = o.cuentaId || (p.pagos.length ? p.pagos[p.pagos.length - 1].cuentaId : null);
      if (cuentaId) {
        doc.datos.movimientosCaja.push(M.sellar({
          fecha: o.fecha || F.hoy(), cuentaId: cuentaId, tipo: 'devolucion', monto: -pagado, origen: null, manual: true,
          refPedidoId: id, descripcion: 'Devolución del pedido #' + p.numero + ' (cancelado)', esDemo: !!p.esDemo
        }, false));
        devuelto = pagado;
      }
    }
    return { pedido: p, devuelto: devuelto };
  }

  // ---------------- Gastos ----------------
  function guardarGasto(doc, g) {
    var copia = clonar(g);
    if (copia.estadoPago === 'pagado' && !copia.fechaPago) copia.fechaPago = copia.fecha;
    if (copia.estadoPago !== 'pagado') copia.fechaPago = null;
    var guardado = guardarEntidad(doc, 'gastos', copia);
    D.regenerarOrigen(doc, 'gasto', guardado.id);
    return guardado;
  }

  function pagarGasto(doc, id, cuentaId, fecha) {
    var g = buscar(doc.datos.gastos, id);
    if (!g) return null;
    var c = clonar(g);
    c.estadoPago = 'pagado'; c.cuentaId = cuentaId; c.fechaPago = fecha || F.hoy();
    return guardarGasto(doc, c);
  }

  /** Crea (a pedido del usuario) los gastos recurrentes de un mes. No duplica los ya creados. */
  function gastosRecurrentesPendientes(doc, mes) {
    return doc.datos.gastosRecurrentes.filter(function (r) {
      if (!r.activo || r.archivado) return false;
      return !doc.datos.gastos.some(function (g) { return g.recurrenteId === r.id && F.mesDe(g.fecha) === mes; });
    });
  }

  function generarGastosRecurrentes(doc, mes, ids) {
    var creados = [];
    gastosRecurrentesPendientes(doc, mes).forEach(function (r) {
      if (ids && ids.indexOf(r.id) < 0) return;
      var dia = Math.min(Math.max(r.diaDelMes || 1, 1), F.diasDelMes(mes + '-01'));
      var g = M.nuevoGasto({
        fecha: mes + '-' + (dia < 10 ? '0' : '') + dia, descripcion: r.descripcion, categoria: r.categoria, tipo: r.tipo || 'fijo',
        clasificacion: r.clasificacion || 'operativo', valor: r.valor, estadoPago: 'pendiente', recurrenteId: r.id
      });
      creados.push(guardarGasto(doc, g));
    });
    return creados;
  }

  // ---------------- Compras ----------------
  function guardarCompra(doc, c) {
    var copia = clonar(c);
    if (copia.estadoPago === 'pagado' && !copia.fechaPago) copia.fechaPago = copia.fecha;
    if (copia.estadoPago !== 'pagado') copia.fechaPago = null;
    var guardado = guardarEntidad(doc, 'compras', copia);
    D.regenerarOrigen(doc, 'compra', guardado.id);
    return guardado;
  }

  function pagarCompra(doc, id, cuentaId, fecha) {
    var c = buscar(doc.datos.compras, id);
    if (!c) return null;
    var x = clonar(c);
    x.estadoPago = 'pagado'; x.cuentaId = cuentaId; x.fechaPago = fecha || F.hoy();
    return guardarCompra(doc, x);
  }

  // ---------------- Lotes (modo conProduccion) ----------------
  function guardarLote(doc, l) {
    var guardado = guardarEntidad(doc, 'lotes', clonar(l));
    D.regenerarOrigen(doc, 'lote', guardado.id);
    return guardado;
  }

  // ---------------- Eliminación de documentos (con sus derivados) ----------------
  var TIPO_ORIGEN = { pedidos: 'pedido', compras: 'compra', gastos: 'gasto', lotes: 'lote' };
  function eliminarDocumento(doc, coleccion, id) {
    quitar(doc.datos[coleccion], id);
    var tipo = TIPO_ORIGEN[coleccion];
    if (tipo) D.regenerarOrigen(doc, tipo, id);
    else if (coleccion === 'movInventario' || coleccion === 'movimientosCaja') { /* ya quitado */ }
  }

  // ---------------- Movimientos manuales ----------------
  function movimientoInventarioManual(doc, o) {
    var m = M.sellar({
      fecha: o.fecha || F.hoy(), insumoId: o.insumoId || undefined, productoId: o.productoId || undefined,
      tipo: o.tipo === 'merma' ? 'merma' : 'ajuste', cantidadBase: o.cantidadBase, costoBase: o.costoBase || 0,
      origen: null, manual: true, motivo: o.motivo || ''
    }, false);
    doc.datos.movInventario.push(m);
    return m;
  }

  function movimientoCajaManual(doc, o) {
    var monto = o.monto;
    if (o.tipo === 'aporte') monto = Math.abs(monto);
    else if (o.tipo === 'retiro' || o.tipo === 'devolucion') monto = -Math.abs(monto);
    var m = M.sellar({
      fecha: o.fecha || F.hoy(), cuentaId: o.cuentaId, tipo: o.tipo, monto: monto, origen: null, manual: true,
      descripcion: o.descripcion || '', refPedidoId: o.refPedidoId
    }, false);
    doc.datos.movimientosCaja.push(m);
    return m;
  }

  function transferir(doc, o) {
    var tid = M.crearId(), monto = Math.abs(o.monto);
    var sal = movimientoCajaManual(doc, { fecha: o.fecha, cuentaId: o.desdeCuentaId, tipo: 'transferencia', monto: -monto, descripcion: o.descripcion || 'Transferencia entre cuentas' });
    var ent = movimientoCajaManual(doc, { fecha: o.fecha, cuentaId: o.haciaCuentaId, tipo: 'transferencia', monto: monto, descripcion: o.descripcion || 'Transferencia entre cuentas' });
    sal.transferId = tid; ent.transferId = tid;
    return [sal, ent];
  }

  function eliminarMovimientoCajaManual(doc, id) {
    var m = buscar(doc.datos.movimientosCaja, id);
    if (!m || m.origen) return false;
    var tid = m.transferId;
    doc.datos.movimientosCaja = doc.datos.movimientosCaja.filter(function (x) { return x.id !== id && !(tid && x.transferId === tid); });
    return true;
  }

  // ---------------- Configuración ----------------
  function cambiarModoInventario(doc, modo) {
    doc.config.modoInventario = modo;
    D.regenerarTodo(doc);
  }

  // ---------------- Datos de ejemplo ----------------
  var COLS_REF = {
    // coleccion → [ [campo, coleccionReferida] ]
    pedidos: [['canalId', 'canales'], ['clienteId', 'clientes']],
    compras: [['proveedorId', 'proveedores'], ['cuentaId', 'cuentas']],
    gastos: [['cuentaId', 'cuentas']],
    movimientosCaja: [['cuentaId', 'cuentas']],
    insumos: [['proveedorIdPreferido', 'proveedores']],
    lotes: [['productoId', 'recetas']]
  };

  function bloqueosQuitarDemo(doc) {
    var d = doc.datos, demoIds = {}, bloqueos = [];
    M.COLECCIONES.forEach(function (c) {
      demoIds[c] = {};
      d[c].forEach(function (x) { if (x.esDemo) demoIds[c][x.id] = true; });
    });
    function real(x) { return !x.esDemo; }
    Object.keys(COLS_REF).forEach(function (col) {
      d[col].filter(real).forEach(function (x) {
        COLS_REF[col].forEach(function (par) {
          if (x[par[0]] && demoIds[par[1]][x[par[0]]]) bloqueos.push('Un registro real de «' + col + '» usa un dato de ejemplo (' + par[0] + ').');
        });
      });
    });
    d.pedidos.filter(real).forEach(function (p) {
      p.lineas.forEach(function (l) { if (demoIds.recetas[l.productoId]) bloqueos.push('El pedido #' + p.numero + ' usa un producto de ejemplo.'); });
      p.pagos.forEach(function (pg) { if (demoIds.cuentas[pg.cuentaId]) bloqueos.push('El pedido #' + p.numero + ' tiene un pago en una cuenta de ejemplo.'); });
    });
    d.recetas.filter(real).forEach(function (r) {
      r.lineas.forEach(function (l) {
        var col = l.refTipo === 'insumo' ? 'insumos' : 'recetas';
        if (demoIds[col][l.refId]) bloqueos.push('La receta «' + r.nombre + '» usa «' + l.refTipo + '» de ejemplo.');
      });
    });
    d.compras.filter(real).forEach(function (c) { c.lineas.forEach(function (l) { if (demoIds.insumos[l.insumoId]) bloqueos.push('Una compra real usa un insumo de ejemplo.'); }); });
    d.movInventario.filter(function (m) { return !m.esDemo && m.manual; }).forEach(function (m) {
      if ((m.insumoId && demoIds.insumos[m.insumoId]) || (m.productoId && demoIds.recetas[m.productoId])) bloqueos.push('Un ajuste manual de inventario usa un dato de ejemplo.');
    });
    // sin repetidos
    return bloqueos.filter(function (b, i) { return bloqueos.indexOf(b) === i; });
  }

  function hayDemo(doc) {
    return M.COLECCIONES.some(function (c) { return doc.datos[c].some(function (x) { return x.esDemo; }); });
  }

  function quitarDemo(doc) {
    var bloqueos = bloqueosQuitarDemo(doc);
    if (bloqueos.length) return { ok: false, bloqueos: bloqueos };
    var quitados = 0;
    M.COLECCIONES.forEach(function (c) {
      var antes = doc.datos[c].length;
      doc.datos[c] = doc.datos[c].filter(function (x) { return !x.esDemo; });
      quitados += antes - doc.datos[c].length;
    });
    D.regenerarTodo(doc);
    return { ok: true, quitados: quitados };
  }

  return {
    clonar: clonar, buscar: buscar, guardarEntidad: guardarEntidad, archivar: archivar, guardarInsumo: guardarInsumo,
    usoDeEntidad: usoDeEntidad, eliminarEntidad: eliminarEntidad, guardarReceta: guardarReceta, duplicarReceta: duplicarReceta,
    guardarPedido: guardarPedido, cambiarEstadoPedido: cambiarEstadoPedido, registrarPago: registrarPago, eliminarPago: eliminarPago,
    cancelarPedido: cancelarPedido, guardarGasto: guardarGasto, pagarGasto: pagarGasto, gastosRecurrentesPendientes: gastosRecurrentesPendientes,
    generarGastosRecurrentes: generarGastosRecurrentes, guardarCompra: guardarCompra, pagarCompra: pagarCompra, guardarLote: guardarLote,
    eliminarDocumento: eliminarDocumento, movimientoInventarioManual: movimientoInventarioManual,
    movimientoCajaManual: movimientoCajaManual, transferir: transferir, eliminarMovimientoCajaManual: eliminarMovimientoCajaManual,
    cambiarModoInventario: cambiarModoInventario, bloqueosQuitarDemo: bloqueosQuitarDemo, hayDemo: hayDemo, quitarDemo: quitarDemo
  };
}));
