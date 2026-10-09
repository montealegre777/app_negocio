/* Exportación: respaldo JSON, CSV (UTF-8 con BOM, separador ';', números sin formato de moneda) e impresión. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, M = App.Modelo, D = App.Dom;

  function celda(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : '';
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    var s = String(v);
    if (/^[=+@]/.test(s) || /^-[^\d\s]/.test(s)) s = "'" + s; // evita fórmulas inyectadas al abrir en Excel
    if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvTexto(encabezados, filas) {
    var lineas = [encabezados.map(celda).join(';')];
    filas.forEach(function (f) { lineas.push(f.map(celda).join(';')); });
    return '﻿' + lineas.join('\r\n');
  }

  function csv(nombre, encabezados, filas) {
    D.descargar(nombre + '-' + F.hoy() + '.csv', csvTexto(encabezados, filas), 'text/csv;charset=utf-8');
    if (App.Toast) App.Toast.ok('Archivo «' + nombre + '.csv» descargado (se abre en Excel o Google Sheets).');
  }

  function respaldoJSON() {
    var doc = E.doc();
    E.mutarSilencioso(function (d) { d.config.ultimoRespaldo = M.ahoraISO(); });
    E.guardarYa();
    var resumen = {};
    M.COLECCIONES.forEach(function (c) { resumen[c] = doc.datos[c].length; });
    var salida = Object.assign({}, doc, { exportadoEn: M.ahoraISO(), conteo: resumen });
    D.descargar('respaldo-' + (doc.config.nombreNegocio || 'negocio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + F.hoy() + '.json', JSON.stringify(salida, null, 2), 'application/json;charset=utf-8');
    if (App.Toast) App.Toast.ok('Respaldo descargado. Guárdalo en un lugar seguro (Drive, correo o tu computador).');
  }

  var nombre = {
    canal: function (id) { var o = E.datos().canales.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : ''; },
    cliente: function (id) { var o = E.datos().clientes.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : ''; },
    cuenta: function (id) { var o = E.datos().cuentas.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : ''; },
    proveedor: function (id) { var o = E.datos().proveedores.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : ''; },
    insumo: function (id) { var o = E.datos().insumos.filter(function (x) { return x.id === id; })[0]; return o ? o.nombre : ''; }
  };

  function productos() {
    var ctx = E.ctx(), filas = [];
    E.datos().recetas.filter(function (r) { return r.tipo !== 'preparacion' && !r.archivado; }).forEach(function (r) {
      C.tablaPorCanal(ctx, r.id).forEach(function (t) {
        var x = t.resultado, rc = ctx.receta(r.id);
        filas.push([r.nombre, r.tipo, t.canal ? t.canal.nombre : '', x.precioPublico, rc.costoProd, x.otrosCostos, x.comision, x.costosVariables, x.ganancia,
          x.margen === null ? '' : x.margen * 100, x.pctSobreCosto === null ? '' : x.pctSobreCosto * 100, x.recomendado.ok ? x.recomendado.precio : '']);
      });
    });
    csv('productos-rentabilidad', ['Producto', 'Tipo', 'Canal', 'Precio', 'Costo de producción', 'Otros costos', 'Comisión', 'Costos variables', 'Ganancia por unidad', 'Margen de contribución %', '% de ganancia sobre el costo', 'Precio recomendado'], filas);
  }

  function recetas() {
    var ctx = E.ctx(), filas = [];
    E.datos().recetas.filter(function (r) { return !r.archivado; }).forEach(function (r) {
      var rc = ctx.receta(r.id);
      rc.lineas.forEach(function (l) {
        filas.push([r.nombre, r.tipo, l.refTipo, l.nombre, l.cantidad, l.unidad, l.mermaPct * 100, l.cantidadBruta, l.unidadBruta, l.costo, l.pct === null ? '' : l.pct * 100, l.error || '']);
      });
    });
    csv('recetas-desglose', ['Receta', 'Tipo', 'Tipo de línea', 'Ingrediente', 'Cantidad neta', 'Unidad', 'Merma %', 'Cantidad bruta', 'Unidad base', 'Costo', '% del costo', 'Error'], filas);
  }

  function insumos() {
    var ctx = E.ctx(), stock = A.stockInsumos(E.doc());
    csv('insumos', ['Insumo', 'Categoría', 'Unidad base', 'Presentación: cantidad', 'Presentación: unidad', 'Presentación: precio', 'Costo por unidad base', 'Merma %', 'Stock', 'Stock mínimo', 'Proveedor preferido', 'Archivado'],
      E.datos().insumos.map(function (i) {
        return [i.nombre, i.categoria, i.unidadBase, i.presentacion.cantidad, i.presentacion.unidad, i.presentacion.precio, ctx.costoBase(i.id), i.mermaPct * 100, stock[i.id] || 0, i.stockMinimo, nombre.proveedor(i.proveedorIdPreferido), i.archivado];
      }));
  }

  function ventas(desde, hasta) {
    var filas = [];
    E.datos().pedidos.filter(function (p) { return (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta); })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero - b.numero; })
      .forEach(function (p) {
        var c = C.calcularPedido(p);
        filas.push([p.numero, p.fecha, M.ETIQUETA_ESTADO[p.estado], nombre.canal(p.canalId), nombre.cliente(p.clienteId), c.unidades, c.bruto, c.descuentoLineas + c.descuentoPedido, c.envioCobrado, c.impuesto, c.totalPedido,
          c.costoProd, c.otrosCostos, c.comisiones, c.costoEnvio, c.contribucion, c.pagado, c.saldoPorCobrar, c.estadoPago]);
      });
    csv('ventas', ['N.º', 'Fecha', 'Estado', 'Canal', 'Cliente', 'Unidades', 'Valor bruto', 'Descuentos', 'Envío cobrado', 'Impuesto', 'Total', 'Costo de producción', 'Otros costos', 'Comisión', 'Costo de envío', 'Contribución', 'Pagado', 'Saldo por cobrar', 'Estado de pago'], filas);
  }

  function gastos(desde, hasta) {
    csv('gastos', ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Clasificación', 'Valor', 'Estado de pago', 'Cuenta', 'Fecha de pago'],
      E.datos().gastos.filter(function (g) { return (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta); })
        .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; })
        .map(function (g) { return [g.fecha, g.descripcion, g.categoria, g.tipo, g.clasificacion, g.valor, g.estadoPago, nombre.cuenta(g.cuentaId), g.fechaPago || '']; }));
  }

  function compras() {
    var filas = [];
    E.datos().compras.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).forEach(function (c) {
      c.lineas.forEach(function (l) { filas.push([c.fecha, nombre.proveedor(c.proveedorId), nombre.insumo(l.insumoId), l.cantidad, l.unidad, l.precioTotal, c.flete, c.estadoPago, nombre.cuenta(c.cuentaId)]); });
    });
    csv('compras', ['Fecha', 'Proveedor', 'Insumo', 'Cantidad', 'Unidad', 'Precio total de la línea', 'Flete de la compra', 'Estado de pago', 'Cuenta'], filas);
  }

  function inventario() {
    var ctx = E.ctx(), stock = A.stockInsumos(E.doc()), ult = A.ultimaCompraPorInsumo(E.doc());
    csv('inventario', ['Insumo', 'Unidad', 'Stock', 'Stock mínimo', 'Costo por unidad', 'Valor', 'Proveedor', 'Última compra'],
      E.datos().insumos.filter(function (i) { return !i.archivado; }).map(function (i) {
        var s = stock[i.id] || 0, cb = ctx.costoBase(i.id);
        return [i.nombre, i.unidadBase, s, i.stockMinimo, cb, cb !== null && s > 0 ? s * cb : 0, nombre.proveedor(i.proveedorIdPreferido), ult[i.id] || ''];
      }));
  }

  function movimientosInventario() {
    csv('movimientos-inventario', ['Fecha', 'Insumo / producto', 'Tipo', 'Cantidad (unidad base)', 'Costo por unidad', 'Origen', 'Motivo'],
      E.datos().movInventario.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).map(function (m) {
        var nom = m.insumoId ? nombre.insumo(m.insumoId) : ((E.datos().recetas.filter(function (r) { return r.id === m.productoId; })[0] || {}).nombre || '');
        return [m.fecha, nom, m.tipo, m.cantidadBase, m.costoBase, m.origen ? m.origen.tipo : 'manual', m.motivo || ''];
      }));
  }

  function caja() {
    csv('caja', ['Fecha', 'Cuenta', 'Tipo', 'Monto', 'Descripción', 'Origen'],
      E.datos().movimientosCaja.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; })
        .map(function (m) { return [m.fecha, nombre.cuenta(m.cuentaId), m.tipo, m.monto, m.descripcion || '', m.origen ? m.origen.tipo : 'manual']; }));
  }

  function resumenMensual(desde, hasta) {
    var r = A.resumenPeriodo(E.doc(), desde, hasta);
    var filas = [
      ['Ventas realizadas (n.º de pedidos)', r.nVentas], ['Unidades vendidas', r.unidades], ['Ingresos netos', r.ingresosNetos], ['Costo de producción', r.costoProd],
      ['Otros costos por unidad', r.otrosCostos], ['Comisiones', r.comisiones], ['Costo de envío', r.costoEnvio], ['Costos variables', r.costosVariables],
      ['Ganancia de contribución', r.contribucion], ['Gastos operativos', r.gastosOperativos], ['Utilidad operativa estimada', r.utilidadOperativa]
    ];
    Object.keys(r.gastosPorCategoria).forEach(function (k) { filas.push(['Gastos: ' + k, r.gastosPorCategoria[k]]); });
    csv('resumen-' + desde + '-a-' + hasta, ['Concepto', 'Valor (' + desde + ' a ' + hasta + ')'], filas);
  }

  function listaCompras(lista) {
    csv('lista-de-compras', ['Insumo', 'Unidad base', 'Necesario', 'En stock', 'Falta', 'Presentaciones a comprar', 'Costo estimado de la compra', 'Proveedor'],
      lista.filas.filter(function (f) { return f.faltante > 0; }).map(function (f) { return [f.nombre, f.unidadBase, f.requerido, f.enStock, f.faltante, f.presentaciones, f.costoCompra, nombre.proveedor(f.proveedorId)]; }));
  }

  App.Exportar = {
    csv: csv, csvTexto: csvTexto, celda: celda, respaldoJSON: respaldoJSON, productos: productos, recetas: recetas, insumos: insumos, ventas: ventas,
    gastos: gastos, compras: compras, inventario: inventario, movimientosInventario: movimientosInventario, caja: caja, resumenMensual: resumenMensual,
    listaCompras: listaCompras, imprimir: function () { root.print(); }
  };
})(typeof self !== 'undefined' ? self : this);
