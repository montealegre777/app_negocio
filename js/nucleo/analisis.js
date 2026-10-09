/* Agregaciones por periodo, caja, inventario, alertas y listas de compras. Solo lectura sobre el documento. UMD. */
(function (root, factory) {
  var C, F, D;
  if (typeof module === 'object' && module.exports) { C = require('./calculos.js'); F = require('./formato.js'); D = require('./derivados.js'); }
  else { C = root.App.Calculos; F = root.App.Formato; D = root.App.Derivados; }
  var mod = factory(C, F, D);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Analisis = mod; }
}(typeof self !== 'undefined' ? self : this, function (C, F, D) {
  'use strict';

  var num = C.num;

  function enRango(fecha, desde, hasta) { return fecha >= desde && fecha <= hasta; }

  // ============================================================
  // 5.11 Resultados del periodo
  // ============================================================
  function resumenPeriodo(doc, desde, hasta) {
    var r = {
      desde: desde, hasta: hasta, nVentas: 0, unidades: 0, totalCobrable: 0, ingresosNetos: 0, impuestos: 0, costoProd: 0, otrosCostos: 0,
      comisiones: 0, costoEnvio: 0, costosVariables: 0, contribucion: 0, gastosOperativos: 0, gastosPorCategoria: {},
      porProducto: {}, porCanal: {}, porDia: {}
    };
    doc.datos.pedidos.forEach(function (p) {
      if (!C.esVentaRealizada(p) || !enRango(p.fecha, desde, hasta)) return;
      var c = C.calcularPedido(p);
      r.nVentas++; r.unidades += c.unidades; r.totalCobrable += c.totalPedido; r.ingresosNetos += c.ingresoNeto; r.impuestos += c.impuesto;
      r.costoProd += c.costoProd; r.otrosCostos += c.otrosCostos; r.comisiones += c.comisiones; r.costoEnvio += c.costoEnvio;
      r.costosVariables += c.costosVariables; r.contribucion += c.contribucion;
      var dia = r.porDia[p.fecha] || (r.porDia[p.fecha] = { ventas: 0, costos: 0, contribucion: 0, pedidos: 0 });
      dia.ventas += c.ingresoNeto; dia.costos += c.costosVariables; dia.contribucion += c.contribucion; dia.pedidos++;
      var ch = r.porCanal[p.canalId || '_'] || (r.porCanal[p.canalId || '_'] = { canalId: p.canalId, pedidos: 0, ingresos: 0, contribucion: 0 });
      ch.pedidos++; ch.ingresos += c.ingresoNeto; ch.contribucion += c.contribucion;
      c.lineas.forEach(function (l) {
        var pr = r.porProducto[l.productoId] || (r.porProducto[l.productoId] = { id: l.productoId, nombre: l.nombre, unidades: 0, ingresos: 0, costos: 0, contribucion: 0 });
        pr.unidades += l.cantidad; pr.ingresos += l.base; pr.costos += l.costoProd + l.otros + l.comision; pr.contribucion += l.contribucion;
      });
    });
    doc.datos.gastos.forEach(function (g) {
      if (g.clasificacion !== 'operativo' || !enRango(g.fecha, desde, hasta)) return;
      r.gastosOperativos += num(g.valor);
      r.gastosPorCategoria[g.categoria || 'Otros'] = (r.gastosPorCategoria[g.categoria || 'Otros'] || 0) + num(g.valor);
    });
    r.utilidadOperativa = r.contribucion - r.gastosOperativos;
    r.margenContribucion = r.ingresosNetos > 0 ? r.contribucion / r.ingresosNetos : null;
    r.ticketPromedio = r.nVentas > 0 ? r.ingresosNetos / r.nVentas : null;
    return r;
  }

  /** Periodo anterior de igual duración. */
  function periodoAnterior(desde, hasta) {
    var dias = F.diasEntre(desde, hasta) + 1;
    return { desde: F.sumarDias(desde, -dias), hasta: F.sumarDias(desde, -1) };
  }

  function pedidosAbiertos(doc) {
    return doc.datos.pedidos.filter(function (p) { return p.estado === 'pendiente' || p.estado === 'enPreparacion'; });
  }

  // ============================================================
  // Productos: ranking
  // ============================================================
  function canalPorDefecto(doc) {
    var cs = doc.datos.canales.filter(function (c) { return !c.archivado; });
    return cs.filter(function (c) { return c.tipo === 'directo'; })[0] || cs[0] || null;
  }

  function rankingProductos(doc, ctx, resumen) {
    var canal = canalPorDefecto(doc);
    var out = [];
    doc.datos.recetas.forEach(function (r) {
      if (r.archivado || r.tipo === 'preparacion') return;
      var res = C.resultadoProducto(ctx, r.id, canal ? canal.id : null);
      var v = resumen && resumen.porProducto[r.id];
      out.push({
        id: r.id, nombre: r.nombre, emoji: r.emoji, tipo: r.tipo, canal: canal, res: res,
        unidades: v ? v.unidades : 0, contribucionTotal: v ? v.contribucion : 0, ingresos: v ? v.ingresos : 0
      });
    });
    return out;
  }

  // ============================================================
  // Inventario
  // ============================================================
  function stockInsumos(doc) {
    var s = {};
    doc.datos.movInventario.forEach(function (m) { if (m.insumoId) s[m.insumoId] = (s[m.insumoId] || 0) + num(m.cantidadBase); });
    return s;
  }
  function stockProductos(doc) {
    var s = {};
    doc.datos.movInventario.forEach(function (m) { if (m.productoId) s[m.productoId] = (s[m.productoId] || 0) + num(m.cantidadBase); });
    return s;
  }
  function valorInventario(doc, ctx, stock) {
    var total = 0;
    doc.datos.insumos.forEach(function (i) {
      if (i.archivado) return;
      var cb = ctx.costoBase(i.id), s = stock[i.id] || 0;
      if (cb !== null && s > 0) total += s * cb;
    });
    return total;
  }
  function ultimaCompraPorInsumo(doc) {
    var u = {};
    doc.datos.compras.forEach(function (c) {
      c.lineas.forEach(function (l) { if (!u[l.insumoId] || c.fecha > u[l.insumoId]) u[l.insumoId] = c.fecha; });
    });
    return u;
  }
  function insumosStockBajo(doc, stock) {
    return doc.datos.insumos.filter(function (i) { return !i.archivado && i.stockMinimo > 0 && (stock[i.id] || 0) <= i.stockMinimo; });
  }

  /**
   * Plan = [{productoId, cantidad}]. Devuelve lo que se necesita (con merma), lo que hay y lo que falta,
   * con la compra sugerida en presentaciones completas.
   */
  function listaCompras(doc, ctx, plan, stock) {
    var acc = {};
    (plan || []).forEach(function (x) { if (x.cantidad > 0) C.consumoReceta(ctx, x.productoId, x.cantidad, acc); });
    var filas = Object.keys(acc).map(function (insId) {
      var ins = ctx.insumos[insId], cb = ctx.costoBase(insId);
      var req = acc[insId], hay = Math.max(stock[insId] || 0, 0), falta = Math.max(req - hay, 0);
      var presBase = ins ? (C.costoBasePresentacion(ins) !== null ? ins.presentacion.precio / C.costoBasePresentacion(ins) : 0) : 0; // unidades base por presentación
      var presentaciones = falta > 0 && presBase > 0 ? Math.ceil(falta / presBase - 1e-9) : 0;
      return {
        insumoId: insId, nombre: ins ? ins.nombre : '(eliminado)', unidadBase: ins ? ins.unidadBase : '', requerido: req, enStock: hay, faltante: falta,
        costoFaltante: cb !== null ? falta * cb : null, presentaciones: presentaciones,
        presentacion: ins ? ins.presentacion : null, costoCompra: ins && presentaciones > 0 ? presentaciones * ins.presentacion.precio : 0,
        proveedorId: ins ? ins.proveedorIdPreferido : null, categoria: ins ? ins.categoria : ''
      };
    });
    filas.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    var total = filas.reduce(function (s, f) { return s + (f.costoFaltante || 0); }, 0);
    var totalCompra = filas.reduce(function (s, f) { return s + f.costoCompra; }, 0);
    var porProveedor = {};
    filas.filter(function (f) { return f.faltante > 0; }).forEach(function (f) {
      var k = f.proveedorId || '_sin';
      (porProveedor[k] = porProveedor[k] || []).push(f);
    });
    return { filas: filas, totalEstimado: total, totalCompra: totalCompra, porProveedor: porProveedor };
  }

  function planDesdePedidosAbiertos(doc) {
    var acc = {};
    pedidosAbiertos(doc).forEach(function (p) { p.lineas.forEach(function (l) { acc[l.productoId] = (acc[l.productoId] || 0) + num(l.cantidad); }); });
    return Object.keys(acc).map(function (id) { return { productoId: id, cantidad: acc[id] }; });
  }

  // ============================================================
  // Caja, cuentas por cobrar y por pagar
  // ============================================================
  function saldoCuenta(doc, cuentaId, hasta) {
    var c = doc.datos.cuentas.filter(function (x) { return x.id === cuentaId; })[0];
    if (!c) return 0;
    var s = num(c.saldoInicial);
    doc.datos.movimientosCaja.forEach(function (m) { if (m.cuentaId === cuentaId && (!hasta || m.fecha <= hasta)) s += num(m.monto); });
    return s;
  }
  function saldosCaja(doc, hasta) {
    var filas = doc.datos.cuentas.filter(function (c) { return !c.archivado; }).map(function (c) { return { cuenta: c, saldo: saldoCuenta(doc, c.id, hasta) }; });
    return { filas: filas, total: filas.reduce(function (s, f) { return s + f.saldo; }, 0) };
  }

  function cuentasPorCobrar(doc, hoy) {
    var dv = num(doc.config.diasCobroVencido, 15);
    var out = [];
    doc.datos.pedidos.forEach(function (p) {
      if (p.estado !== 'entregado') return;
      var c = C.calcularPedido(p);
      if (c.saldoPorCobrar <= 0) return;
      var dias = F.diasEntre(p.fecha, hoy);
      out.push({ pedido: p, calculo: c, saldo: c.saldoPorCobrar, dias: dias, vencida: dias > dv });
    });
    out.sort(function (a, b) { return b.dias - a.dias; });
    return out;
  }
  function cuentasPorPagar(doc, hoy) {
    var out = [];
    doc.datos.gastos.forEach(function (g) {
      if (g.estadoPago === 'pendiente') out.push({ tipo: 'gasto', id: g.id, descripcion: g.descripcion, valor: num(g.valor), fecha: g.fecha, dias: F.diasEntre(g.fecha, hoy) });
    });
    doc.datos.compras.forEach(function (c) {
      if (c.estadoPago === 'pendiente') out.push({ tipo: 'compra', id: c.id, descripcion: 'Compra a ' + (nombreDe(doc.datos.proveedores, c.proveedorId) || 'proveedor'), valor: D.totalCompra(c), fecha: c.fecha, dias: F.diasEntre(c.fecha, hoy) });
    });
    out.sort(function (a, b) { return b.dias - a.dias; });
    return out;
  }
  function nombreDe(arr, id) { var o = arr.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : null; }

  /** Puente aproximado de la utilidad a la variación de caja del periodo (marcado como estimación en la interfaz). */
  function puenteUtilidadCaja(doc, desde, hasta, resumen) {
    var res = resumen || resumenPeriodo(doc, desde, hasta);
    var gastosPorId = C.mapaPorId(doc.datos.gastos);
    var pagos = 0, comprasPag = 0, gOpPag = 0, invPag = 0, aportes = 0, retiros = 0, otros = 0, delta = 0;
    doc.datos.movimientosCaja.forEach(function (m) {
      if (!enRango(m.fecha, desde, hasta)) return;
      var v = num(m.monto);
      if (m.tipo === 'transferencia') return;
      delta += v;
      if (m.tipo === 'venta') pagos += v;
      else if (m.tipo === 'compra') comprasPag += -v;
      else if (m.tipo === 'gasto') {
        var g = m.origen && gastosPorId[m.origen.id];
        if (g && g.clasificacion === 'inversion') invPag += -v; else gOpPag += -v;
      }
      else if (m.tipo === 'aporte') aportes += v;
      else if (m.tipo === 'retiro') retiros += -v;
      else otros += v;
    });
    var comp = [
      { id: 'cobros', texto: 'Cobros recibidos frente a lo vendido (ventas sin cobrar, anticipos y cobros de otros periodos)', valor: pagos - res.ingresosNetos },
      { id: 'compras', texto: 'Compras de inventario pagadas', valor: -comprasPag },
      { id: 'consumo', texto: 'Costos variables ya descontados en la utilidad (insumos consumidos, comisiones y otros)', valor: res.costosVariables },
      { id: 'gastosPend', texto: 'Gastos operativos del periodo que aún no se han pagado (o pagados de otro periodo)', valor: res.gastosOperativos - gOpPag },
      { id: 'inversiones', texto: 'Inversiones pagadas (utensilios, equipos)', valor: -invPag },
      { id: 'aportes', texto: 'Aportes del dueño', valor: aportes },
      { id: 'retiros', texto: 'Retiros del dueño', valor: -retiros }
    ];
    var suma = res.utilidadOperativa;
    comp.forEach(function (c) { suma += c.valor; });
    comp.push({ id: 'otros', texto: 'Otros (ajustes y devoluciones)', valor: delta - suma });
    return { utilidad: res.utilidadOperativa, componentes: comp, variacionCaja: delta };
  }

  // ============================================================
  // Punto de equilibrio
  // ============================================================
  function gastosFijosMensuales(doc, hoy) {
    var estimados = doc.datos.gastosFijosEstimados.filter(function (x) { return !x.archivado; });
    var totalEst = estimados.reduce(function (s, x) { return s + num(x.valorMensual); }, 0);
    var n = Math.max(1, num(doc.config.mesesPromedioFijos, 3));
    var mesActual = F.mesDe(hoy), suma = 0, mesesConDatos = 0;
    for (var i = 1; i <= n; i++) {
      var mes = F.sumarMeses(mesActual, -i), t = 0;
      doc.datos.gastos.forEach(function (g) { if (g.tipo === 'fijo' && g.clasificacion === 'operativo' && F.mesDe(g.fecha) === mes) t += num(g.valor); });
      if (t > 0) mesesConDatos++;
      suma += t;
    }
    // «reales» = promedio de los meses que SÍ tienen gastos fijos registrados (un mes sin registros no cuenta como $ 0)
    return { estimados: totalEst, reales: mesesConDatos > 0 ? suma / mesesConDatos : 0,  mesesConDatos: mesesConDatos, n: n };
  }

  // ============================================================
  // Variación de precios de insumos y alertas
  // ============================================================
  function variacionInsumo(ins) {
    var h = (ins.historialPrecios || []).filter(function (x) { return typeof x.costoBase === 'number'; }).slice().sort(C.compararHistorial);
    if (h.length < 2) return null;
    var ult = h[h.length - 1];
    // Se compara contra el último precio DISTINTO (varias compras al mismo precio no son una variación).
    var j = h.length - 2;
    while (j >= 0 && Math.abs(h[j].costoBase - ult.costoBase) < 1e-9) j--;
    if (j < 0 || !(h[j].costoBase > 0)) return null;
    return { antes: h[j].costoBase, despues: ult.costoBase, pct: ult.costoBase / h[j].costoBase - 1, fecha: h[j + 1].fecha };
  }

  function alertas(doc, ctx, hoy) {
    var out = [];
    var cfg = doc.config, canales = doc.datos.canales.filter(function (c) { return !c.archivado; });
    if (!canales.length) canales = [null];
    // Productos
    doc.datos.recetas.forEach(function (r) {
      if (r.archivado || r.tipo === 'preparacion') return;
      var rc = ctx.receta(r.id);
      if (rc && rc.errores && rc.errores.length) {
        out.push({ id: 'err-' + r.id, nivel: 'alta', titulo: r.nombre + ': la receta tiene errores', detalle: rc.errores[0], ruta: '#/productos/' + r.id });
        return;
      }
      var problemas = [];
      canales.forEach(function (c) {
        var res = C.resultadoProducto(ctx, r.id, c ? c.id : null);
        if (!res || !(res.precioPublico > 0)) return;
        var ids = res.indicadores.map(function (i) { return i.id; });
        var nom = c ? c.nombre : 'sin canal';
        if (ids.indexOf('contribNegativa') >= 0) problemas.push({ n: 3, t: 'pierde ' + F.cop(-res.ganancia) + ' por unidad en ' + nom });
        else if (ids.indexOf('margenBajo') >= 0) problemas.push({ n: 2, t: 'margen de ' + F.pct(res.margen, 1) + ' en ' + nom });
        else if (ids.indexOf('precioBajo') >= 0) problemas.push({ n: 1, t: 'precio por debajo del recomendado en ' + nom });
      });
      if (problemas.length) {
        problemas.sort(function (a, b) { return b.n - a.n; });
        out.push({ id: 'prod-' + r.id, nivel: problemas[0].n >= 3 ? 'alta' : 'media', titulo: r.nombre, detalle: problemas[0].t.charAt(0).toUpperCase() + problemas[0].t.slice(1), ruta: '#/productos/' + r.id });
      }
    });
    // Insumos que subieron
    var umbral = num(cfg.alertaVariacionInsumoPct, 0.1);
    doc.datos.insumos.forEach(function (i) {
      if (i.archivado) return;
      var v = variacionInsumo(i);
      if (v && v.pct >= umbral && F.diasEntre(v.fecha, hoy) <= 45) {
        out.push({ id: 'ins-' + i.id, nivel: 'media', titulo: i.nombre + ' subió ' + F.pct(v.pct, 1), detalle: 'De ' + F.cop(v.antes) + ' a ' + F.cop(v.despues) + ' por ' + i.unidadBase + '.', ruta: '#/insumos' });
      }
    });
    // Stock bajo
    var stock = stockInsumos(doc);
    insumosStockBajo(doc, stock).forEach(function (i) {
      out.push({ id: 'stock-' + i.id, nivel: 'media', titulo: 'Stock bajo: ' + i.nombre, detalle: 'Quedan ' + F.cantidad(Math.max(stock[i.id] || 0, 0)) + ' ' + i.unidadBase + ' (mínimo ' + F.cantidad(i.stockMinimo) + ').', ruta: '#/inventario' });
    });
    // Cuentas por cobrar vencidas
    var cobrar = cuentasPorCobrar(doc, hoy).filter(function (x) { return x.vencida; });
    if (cobrar.length) {
      var tot = cobrar.reduce(function (s, x) { return s + x.saldo; }, 0);
      out.push({ id: 'cobrar', nivel: 'alta', titulo: cobrar.length + (cobrar.length === 1 ? ' cuenta por cobrar vencida' : ' cuentas por cobrar vencidas'), detalle: 'Suman ' + F.cop(tot) + ' con más de ' + cfg.diasCobroVencido + ' días.', ruta: '#/caja' });
    }
    // Pedidos abiertos de días anteriores
    var viejos = pedidosAbiertos(doc).filter(function (p) { return p.fecha < hoy; });
    if (viejos.length) out.push({ id: 'abiertos', nivel: 'media', titulo: viejos.length + (viejos.length === 1 ? ' pedido abierto de días anteriores' : ' pedidos abiertos de días anteriores'), detalle: 'Entrégalos o cancélalos para que cuenten bien en tus resultados.', ruta: '#/ventas' });
    // Respaldo
    if (cfg.ultimoRespaldo === null || F.diasEntre(F.hoy(new Date(cfg.ultimoRespaldo)), hoy) > 7) {
      var hayDatos = doc.datos.pedidos.length + doc.datos.recetas.length + doc.datos.insumos.length > 0;
      if (hayDatos) out.push({ id: 'respaldo', nivel: 'info', titulo: 'Haz un respaldo de tus datos', detalle: 'Tus datos viven solo en este navegador. Descarga una copia JSON.', ruta: '#/configuracion' });
    }
    var orden = { alta: 0, media: 1, info: 2 };
    out.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
    return out;
  }

  return {
    resumenPeriodo: resumenPeriodo, periodoAnterior: periodoAnterior, pedidosAbiertos: pedidosAbiertos, canalPorDefecto: canalPorDefecto,
    rankingProductos: rankingProductos, stockInsumos: stockInsumos, stockProductos: stockProductos, valorInventario: valorInventario,
    ultimaCompraPorInsumo: ultimaCompraPorInsumo, insumosStockBajo: insumosStockBajo, listaCompras: listaCompras,
    planDesdePedidosAbiertos: planDesdePedidosAbiertos, saldoCuenta: saldoCuenta, saldosCaja: saldosCaja, cuentasPorCobrar: cuentasPorCobrar,
    cuentasPorPagar: cuentasPorPagar, puenteUtilidadCaja: puenteUtilidadCaja, gastosFijosMensuales: gastosFijosMensuales,
    variacionInsumo: variacionInsumo, alertas: alertas, nombreDe: nombreDe
  };
}));
