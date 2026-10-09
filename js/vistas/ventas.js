/* Ventas y pedidos: lista con filtros, venta rápida, detalle con pagos, cancelación con devolución y recibo. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, M = App.Modelo, O = App.Operaciones;
  var Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var estTabla = {}, estPeriodo = { modo: 'mes' }, filtroEstado = '';

  var CLASE_ESTADO = { pendiente: 'aviso', enPreparacion: 'info', entregado: 'ok', cancelado: 'error' };
  function insigniaEstado(p) { return h('span', { class: 'insignia ' + (CLASE_ESTADO[p.estado] || '') }, M.ETIQUETA_ESTADO[p.estado] || p.estado); }
  function insigniaPago(p, c) {
    if (p.estado === 'cancelado') return null;
    return c.estadoPago === 'pagado' ? h('span', { class: 'insignia ok' }, 'Pagado') : c.estadoPago === 'parcial' ? h('span', { class: 'insignia aviso' }, 'Pago parcial') : h('span', { class: 'insignia' }, 'Sin pagar');
  }
  function resumenLineas(c) { return c.lineas.map(function (l) { return F.cantidad(l.cantidad) + ' × ' + l.nombre; }).join(', '); }

  // ======================================================================
  // Faltantes de inventario al entregar
  // ======================================================================
  function faltantesAlEntregar(doc, pedido) {
    var d = doc.datos;
    if (!d.movInventario.length) return []; // no lleva inventario
    var ctx = C.crearContexto(doc), stock = A.stockInsumos(doc), acc = {}, out = [];
    if (doc.config.modoInventario === 'conProduccion') {
      var sp = A.stockProductos(doc), porProd = {};
      pedido.lineas.forEach(function (l) { porProd[l.productoId] = (porProd[l.productoId] || 0) + C.num(l.cantidad); });
      Object.keys(porProd).forEach(function (pid) {
        var yaConsumido = pedido.estado === 'entregado' ? porProd[pid] : 0; // si ya estaba entregado, ya está descontado
        if ((sp[pid] || 0) + yaConsumido < porProd[pid]) { var r = ctx.recetas[pid]; out.push((r ? r.nombre : 'Producto') + ': tienes ' + F.cantidad(Math.max(sp[pid] || 0, 0)) + ' y necesitas ' + F.cantidad(porProd[pid])); }
      });
      return out;
    }
    pedido.lineas.forEach(function (l) { C.consumoReceta(ctx, l.productoId, C.num(l.cantidad), acc); });
    Object.keys(acc).forEach(function (id) {
      var ins = ctx.insumos[id], tiene = stock[id] || 0;
      if (ins && tiene < acc[id] - 1e-9) out.push(ins.nombre + ': tienes ' + F.cantidad(Math.max(tiene, 0)) + ' ' + ins.unidadBase + ' y necesitas ' + F.cantidad(acc[id]) + ' ' + ins.unidadBase);
    });
    return out;
  }

  function entregar(id) {
    var doc = E.doc(), p = O.buscar(doc.datos.pedidos, id);
    if (!p) return;
    var faltan = faltantesAlEntregar(doc, p);
    function hacer() {
      E.mutar(function (d) { O.cambiarEstadoPedido(d, id, 'entregado'); });
      App.Toast.ok('Pedido #' + p.numero + ' entregado.');
    }
    if (!faltan.length) { hacer(); return; }
    App.Modal.confirmar({
      titulo: 'Inventario insuficiente', textoConfirmar: 'Entregar de todos modos',
      mensaje: h('div', null, h('p', null, 'Según tu inventario no alcanzan estos insumos:'), h('ul', null, faltan.slice(0, 8).map(function (t) { return h('li', null, t); })),
        h('p', { class: 'explicacion' }, 'Puede que no hayas registrado alguna compra. Si entregas, el inventario quedará en negativo hasta que la registres.'))
    }).then(function (ok) { if (ok) hacer(); });
  }

  // ======================================================================
  // Editor de pedido (modal)
  // ======================================================================
  var TIPOS_DESC = [{ valor: '$', texto: '$' }, { valor: '%', texto: '%' }];

  function descuentoCampo(inicial, etq) {
    var tipo = Form.seleccion({ valor: inicial.tipo, vacio: false, opciones: TIPOS_DESC });
    tipo.input.setAttribute('aria-label', 'Tipo de descuento ' + etq);
    var valor = Form.numero({ tipo: 'numero', valor: inicial.valor || null, placeholder: '0', ariaLabel: 'Descuento ' + etq });
    return { tipo: tipo, valor: valor, get: function () { var v = valor.get(); return { tipo: tipo.get(), valor: v === null ? 0 : v, invalido: v !== null && isNaN(v) }; } };
  }
  function normalizarDesc(d) { return { tipo: d.tipo, valor: d.tipo === '%' ? d.valor / 100 : d.valor }; }
  function mostrarDesc(d) { return { tipo: d.tipo, valor: d.tipo === '%' ? (d.valor || 0) * 100 : d.valor }; }

  function abrirEditor(id, opciones) {
    opciones = opciones || {};
    var doc = E.doc(), d = doc.datos;
    var ex = id ? O.buscar(d.pedidos, id) : null;
    if (id && !ex) return;
    if (!d.recetas.some(function (r) { return r.tipo !== 'preparacion' && !r.archivado; })) {
      App.Modal.aviso('Primero crea un producto', 'Para registrar una venta necesitas al menos un producto con precio. Créalo en «Productos y preparaciones».').then(function () { App.Router.ir('productos'); });
      return;
    }
    var canalDef = A.canalPorDefecto(doc);
    var cuentas = d.cuentas.filter(function (c) { return !c.archivado; });
    var estadoInicial = ex ? ex.estado : 'entregado';

    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: ex ? ex.fecha : F.hoy() });
    var estado = Form.seleccion({ etiqueta: 'Estado', valor: estadoInicial, vacio: false, opciones: M.ESTADOS_PEDIDO.filter(function (e) { return e !== 'cancelado' || (ex && ex.estado === 'cancelado'); }).map(function (e) { return { valor: e, texto: M.ETIQUETA_ESTADO[e] }; }) });
    var cliente = Form.seleccion({ etiqueta: 'Cliente (opcional)', valor: ex ? ex.clienteId || '' : '', vacio: 'Sin cliente', opciones: Comun.opcionesDe('clientes', { incluirId: ex && ex.clienteId }) });
    var canal = Form.seleccion({ etiqueta: 'Canal de venta', valor: ex ? ex.canalId || '' : (canalDef ? canalDef.id : ''), vacio: d.canales.length ? 'Sin canal' : 'Sin canal', opciones: Comun.opcionesDe('canales', { incluirId: ex && ex.canalId }) });
    var nuevoCliente = Comun.boton('Nuevo cliente', { chico: true, icono: 'plus', onclick: function () {
      App.ClientesVista.abrirEditor(null, function (nid) { cliente.opciones(Comun.opcionesDe('clientes'), nid); });
    } });

    var lineas = ex ? O.clonar(ex.lineas).map(function (l) { l.manual = true; return l; }) : [];
    var descPedido = descuentoCampo(ex ? mostrarDesc(ex.descuentoPedido || { tipo: '$', valor: 0 }) : { tipo: '$', valor: 0 }, 'del pedido');
    var envio = Form.numero({ etiqueta: 'Envío que le cobras al cliente', tipo: 'moneda', valor: ex ? ex.envioCobrado || null : null, placeholder: '0' });
    var costoEnvio = Form.numero({ etiqueta: 'Lo que te cuesta el domicilio', tipo: 'moneda', valor: ex ? ex.costoEnvio || null : null, placeholder: '0', ayuda: 'Si pagas a un mensajero. Resta de tu ganancia.' });
    var obs = Form.area({ etiqueta: 'Observaciones (opcional)', valor: ex ? ex.observaciones : '', filas: 2, maxlength: 300 });

    var cajaLineas = h('div', { class: 'lineas-receta' }), cajaTotales = h('div', { class: 'pila', 'aria-live': 'polite' }), cajaErrores = h('div');
    var filasUI = [];

    function productoOpciones(actual) { return Comun.opcionesDe('recetas', { incluirId: actual, filtro: function (r) { return r.tipo !== 'preparacion'; } }); }
    function precioDe(prodId) { var r = O.buscar(d.recetas, prodId); return r ? C.precioParaCanal(r, canal.get() || null) : 0; }

    function filaLinea(l, i) {
      var prod = Form.seleccion({ valor: l.productoId || '', vacio: 'Elige un producto…', opciones: productoOpciones(l.productoId) });
      prod.input.setAttribute('aria-label', 'Producto de la línea ' + (i + 1));
      var cant = Form.numero({ tipo: 'numero', valor: l.cantidad || null, ariaLabel: 'Cantidad de la línea ' + (i + 1), placeholder: '1' });
      var precio = Form.numero({ tipo: 'moneda', valor: l.precioUnit || null, ariaLabel: 'Precio unitario de la línea ' + (i + 1) });
      var desc = descuentoCampo(mostrarDesc(l.descuentoLinea || { tipo: '$', valor: 0 }), 'de la línea ' + (i + 1));
      var total = h('div', { class: 'costo-linea' }, '—');
      var msg = h('div', { class: 'error-texto', role: 'alert', hidden: true, style: { gridColumn: '1 / -1' } });
      var quitar = Comun.botonIcono('trash', 'Quitar la línea ' + (i + 1), function () { lineas.splice(i, 1); pintarLineas(); recalcular(); });
      var fila = h('div', { class: 'linea-receta', style: { gridTemplateColumns: 'minmax(170px,2.2fr) minmax(80px,.8fr) minmax(110px,1fr) minmax(130px,1.1fr) minmax(95px,.9fr) auto' } },
        h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, 'Producto'), prod.el), h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, 'Cantidad'), cant.el),
        h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, 'Precio'), precio.el), h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, 'Descuento'), h('div', { class: 'fila', style: { flexWrap: 'nowrap', gap: '.25rem' } }, desc.valor.el, desc.tipo.el)),
        h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, 'Total'), total), h('div', { class: 'celda' }, quitar), msg);
      prod.alCambiar(function () {
        l.productoId = prod.get();
        var r = O.buscar(d.recetas, l.productoId);
        l.nombreSnap = r ? r.nombre : '';
        if (!l.manual) { l.precioUnit = precioDe(l.productoId); precio.set(l.precioUnit); }
        recalcular();
      });
      cant.alCambiar(function () { var v = cant.get(); cant.error(v !== null && isNaN(v) ? 'Número inválido.' : ''); l.cantidad = v === null || isNaN(v) ? 0 : v; recalcular(); });
      precio.alCambiar(function () { var v = precio.get(); precio.error(v !== null && isNaN(v) ? 'Número inválido.' : ''); l.precioUnit = v === null || isNaN(v) ? 0 : v; l.manual = true; recalcular(); });
      function leerDesc() { var x = desc.get(); l.descuentoLinea = normalizarDesc(x); desc.valor.error(x.invalido ? 'Número inválido.' : ''); recalcular(); }
      desc.valor.alCambiar(leerDesc); desc.tipo.alCambiar(leerDesc);
      filasUI[i] = { el: fila, msg: msg, total: total, prod: prod, precio: precio, cant: cant };
      return fila;
    }

    function pintarLineas() {
      App.Dom.limpiar(cajaLineas); filasUI = [];
      if (!lineas.length) { cajaLineas.appendChild(h('p', { class: 'explicacion' }, 'Agrega los productos de esta venta.')); return; }
      lineas.forEach(function (l, i) { cajaLineas.appendChild(filaLinea(l, i)); });
    }
    function agregarLinea() {
      var l = { id: M.crearId(), productoId: '', nombreSnap: '', cantidad: 1, precioUnit: 0, descuentoLinea: { tipo: '$', valor: 0 }, manual: false };
      lineas.push(l); pintarLineas(); recalcular();
      if (filasUI[lineas.length - 1]) filasUI[lineas.length - 1].prod.focus();
    }

    // ---- pago (solo al crear) ----
    var modoPago = 'completo', pagoUI = null;
    var cajaPago = h('div', { class: 'pila' });
    if (!ex) {
      var cuentaSel = Form.seleccion({ etiqueta: 'Cuenta donde entra el dinero', valor: cuentas[0] ? cuentas[0].id : '', vacio: cuentas.length ? false : 'No tienes cuentas', opciones: cuentas.map(function (c) { return { valor: c.id, texto: c.nombre }; }) });
      var medioSel = Form.seleccion({ etiqueta: 'Medio de pago', valor: 'efectivo', vacio: false, opciones: M.MEDIOS_PAGO.map(function (x) { return { valor: x, texto: x.charAt(0).toUpperCase() + x.slice(1) }; }) });
      var montoPago = Form.numero({ etiqueta: 'Cuánto pagó', tipo: 'moneda' });
      var fechaPago = Form.fecha({ etiqueta: 'Fecha del pago', valor: F.hoy() });
      pagoUI = { cuenta: cuentaSel, medio: medioSel, monto: montoPago, fecha: fechaPago };
      var radios = h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Pago' }, [['completo', 'Pagó todo'], ['parcial', 'Pagó una parte'], ['ninguno', 'Aún no paga']].map(function (p) {
        return h('button', { type: 'button', 'aria-pressed': String(modoPago === p[0]), onclick: function () { modoPago = p[0]; pintarPago(); } }, p[1]);
      }));
      var pintarPago = function () {
        App.Dom.limpiar(cajaPago);
        cajaPago.appendChild(h('h4', { style: { margin: 0 } }, 'Pago'));
        App.Dom.$$('button', radios).forEach(function (b, i) { b.setAttribute('aria-pressed', String(['completo', 'parcial', 'ninguno'][i] === modoPago)); });
        cajaPago.appendChild(radios);
        if (modoPago === 'ninguno') { cajaPago.appendChild(h('p', { class: 'explicacion' }, 'Quedará como cuenta por cobrar. Podrás registrar el pago después desde el detalle del pedido.')); return; }
        if (!cuentas.length) {
          cajaPago.appendChild(Comun.aviso('warn', ['Para registrar el pago necesitas una cuenta de dinero. ', Comun.boton('Crear cuenta «Efectivo»', { chico: true, onclick: function () {
            E.mutar(function (dd) { O.guardarEntidad(dd, 'cuentas', M.nuevaCuenta({ nombre: 'Efectivo', saldoInicial: 0 })); });
            cuentas = E.datos().cuentas.filter(function (c) { return !c.archivado; });
            pagoUI.cuenta.opciones(cuentas.map(function (c) { return { valor: c.id, texto: c.nombre }; }), cuentas[0].id);
            pintarPago();
          } })]));
          return;
        }
        cajaPago.appendChild(Form.rejilla(modoPago === 'parcial' ? [cuentaSel, medioSel, montoPago, fechaPago] : [cuentaSel, medioSel, fechaPago]));
      };
      pagoUI.pintar = pintarPago;
    }

    function snapDe(l, estadoAct) {
      if (ex && ex.estado === 'entregado' && estadoAct === 'entregado') {
        var pl = ex.lineas.filter(function (x) { return x.id === l.id && x.productoId === l.productoId && x.snap; })[0];
        if (pl) return pl.snap;
      }
      return C.crearSnap(ctxVivo, l.productoId, canal.get() || null);
    }
    var ctxVivo = C.crearContexto(doc);
    function borrador() {
      var st = estado.get();
      return {
        id: ex ? ex.id : undefined, numero: ex ? ex.numero : undefined, fecha: fecha.get(), clienteId: cliente.get() || null, canalId: canal.get() || null, estado: st,
        lineas: lineas.filter(function (l) { return l.productoId; }).map(function (l) { return { id: l.id, productoId: l.productoId, nombreSnap: l.nombreSnap, cantidad: l.cantidad, precioUnit: l.precioUnit, descuentoLinea: l.descuentoLinea || { tipo: '$', valor: 0 }, snap: snapDe(l, st) }; }),
        descuentoPedido: normalizarDesc(descPedido.get()), envioCobrado: nz(envio.get()), costoEnvio: nz(costoEnvio.get()), pagos: ex ? O.clonar(ex.pagos) : [], observaciones: obs.get()
      };
    }
    function nz(v) { return v === null ? 0 : v; }

    var ultimoCalculo = null;
    function recalcular() {
      var b = borrador(), c = C.calcularPedido(b);
      ultimoCalculo = c;
      var porId = {}; c.lineas.forEach(function (x) { porId[x.id] = x; });
      lineas.forEach(function (l, i) {
        var f = filasUI[i]; if (!f) return;
        var x = porId[l.id];
        App.Dom.limpiar(f.total); f.total.appendChild(document.createTextNode(x ? F.cop(x.bruto - x.descLinea) : '—'));
      });
      App.Dom.limpiar(cajaTotales);
      if (!b.lineas.length) { cajaTotales.appendChild(h('p', { class: 'explicacion' }, 'Aquí verás el total de la venta.')); return; }
      var filas = [['Productos', F.cop(c.bruto)]];
      if (c.descuentoLineas + c.descuentoPedido > 0) filas.push(['Descuentos', '−' + F.cop(c.descuentoLineas + c.descuentoPedido)]);
      if (c.envioCobrado > 0) filas.push(['Envío', F.cop(c.envioCobrado)]);
      if (c.impuesto > 0) filas.push(['Impuesto', F.cop(c.impuesto)]);
      filas.push(['Total a cobrar', F.cop(c.totalPedido)]);
      cajaTotales.appendChild(h('dl', { class: 'desglose-linea' }, filas.map(function (f, i) { return [h('dt', null, f[0]), h('dd', { class: i === filas.length - 1 ? 'total' : '' }, f[1])]; })));
      if (c.liquidaNeto) cajaTotales.appendChild(h('p', { class: 'explicacion' }, 'Este canal te paga menos su comisión: recibirás ' + F.cop(c.totalEsperado) + '.'));
      var neg = c.contribucion < 0;
      cajaTotales.appendChild(h('p', { class: 'explicacion' }, 'Ganancia estimada de esta venta: ', h('strong', { class: neg ? 'negativo' : 'positivo' }, F.cop(c.contribucion)),
        c.ingresoNeto > 0 ? ' (' + F.pct(c.contribucion / c.ingresoNeto, 1) + ' de lo vendido)' : '', neg ? ' — estás perdiendo dinero con esta venta.' : ''));
    }
    [fecha, estado, cliente, envio, costoEnvio].forEach(function (c) { c.alCambiar(recalcular); });
    descPedido.valor.alCambiar(recalcular); descPedido.tipo.alCambiar(recalcular);
    canal.alCambiar(function () {
      lineas.forEach(function (l, i) { if (!l.manual && l.productoId) { l.precioUnit = precioDe(l.productoId); if (filasUI[i]) filasUI[i].precio.set(l.precioUnit); } });
      recalcular();
    });

    function guardar() {
      App.Dom.limpiar(cajaErrores);
      var b = borrador();
      var errs = {};
      var hayNumeroMalo = false;
      [[envio, 'envioCobrado'], [costoEnvio, 'costoEnvio']].forEach(function (p) { var v = p[0].get(); if (v !== null && isNaN(v)) { errs[p[1]] = 'No entiendo ese número.'; hayNumeroMalo = true; } });
      if (descPedido.get().invalido) { errs.descuentoPedido = 'Número inválido.'; hayNumeroMalo = true; }
      // las líneas sin producto se ignoran al calcular, pero se avisan
      var sinProducto = lineas.filter(function (l) { return !l.productoId; }).length;
      var pago = null;
      if (!ex && modoPago !== 'ninguno') {
        var c = C.calcularPedido(b);
        var monto = modoPago === 'completo' ? Math.round(c.totalEsperado) : pagoUI.monto.get();
        var cuentaId = pagoUI.cuenta.get();
        if (modoPago === 'parcial' && (monto === null || isNaN(monto))) errs.pagoMonto = 'Escribe cuánto pagó.';
        else if (monto > 0) pago = { id: M.crearId(), fecha: pagoUI.fecha.get() || b.fecha, cuentaId: cuentaId, monto: monto, medio: pagoUI.medio.get() };
        if (modoPago === 'parcial' && monto > Math.round(c.totalEsperado)) errs.pagoMonto = 'El pago no puede ser mayor que el total (' + F.cop(c.totalEsperado) + ').';
        if (pago && !cuentaId) errs.pagoCuenta = 'Elige la cuenta donde entra el dinero.';
      }
      if (pago) b.pagos = [pago];
      var res = V.validarPedido(b, doc);
      Object.keys(res.errores).forEach(function (k) { errs[k] = res.errores[k]; });
      if (sinProducto) errs.lineas = errs.lineas || 'Elige el producto en todas las líneas (o quita las que sobran).';
      var mapa = { fecha: fecha, envioCobrado: envio, costoEnvio: costoEnvio };
      var primero = null, extras = [];
      Object.keys(mapa).forEach(function (k) { mapa[k].error(errs[k] || ''); if (errs[k] && !primero) primero = mapa[k]; });
      filasUI.forEach(function (f) { if (f) { f.msg.hidden = true; f.el.classList.remove('error'); } });
      lineas.forEach(function (l, i) {
        var f = filasUI[i]; if (!f) return;
        var kb = b.lineas.findIndex(function (x) { return x.id === l.id; });
        var msg = !l.productoId ? 'Elige el producto.' : (kb >= 0 ? errs['linea' + kb] : null);
        if (msg) { f.msg.hidden = false; f.msg.textContent = msg; f.el.classList.add('error'); if (!primero) primero = f.prod; }
      });
      ['lineas', 'descuentoPedido', 'estado', 'pagoMonto', 'pagoCuenta'].concat(Object.keys(errs).filter(function (k) { return /^pago\d+$/.test(k); })).forEach(function (k) { if (errs[k]) extras.push(errs[k]); });
      if (extras.length || primero || hayNumeroMalo) {
        App.Dom.limpiar(cajaErrores);
        extras.forEach(function (t) { cajaErrores.appendChild(Comun.aviso('error', t, 'alert')); });
        if (primero) primero.focus();
        return;
      }
      var limpio = O.clonar(b);
      limpio.lineas.forEach(function (l) { delete l.snap; if (l.snap === undefined) { /* se recalcula al guardar */ } });
      if (ex) { limpio.creadoEn = ex.creadoEn; }
      var guardado;
      E.mutar(function (dd) { guardado = O.guardarPedido(dd, limpio); });
      var ct = C.calcularPedido(guardado);
      App.Toast.ok(ex ? 'Pedido #' + guardado.numero + ' actualizado.' : 'Venta #' + guardado.numero + ' registrada por ' + F.cop(ct.totalPedido) + '.');
      m.cerrar();
      if (opciones.alGuardar) opciones.alGuardar(guardado);
    }

    var cuerpo = h('div', { class: 'pila' },
      ex && ex.estado === 'entregado' ? Comun.aviso('info', 'Este pedido ya fue entregado: los costos y la comisión con los que se vendió quedan congelados, aunque hoy hayan cambiado.') : null,
      Form.rejilla([fecha, estado, canal]),
      h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, h('div', { style: { flex: '1 1 240px' } }, cliente.el), nuevoCliente),
      h('div', { class: 'pila' }, h('h4', { style: { margin: 0 } }, 'Productos'), cajaLineas, h('div', null, Comun.boton('Agregar producto', { icono: 'plus', onclick: agregarLinea }))),
      h('div', { class: 'form-rejilla' }, h('div', { class: 'campo' }, h('label', null, 'Descuento al pedido'), h('div', { class: 'fila', style: { flexWrap: 'nowrap', gap: '.25rem' } }, descPedido.valor.el, descPedido.tipo.el)), envio.el, costoEnvio.el),
      obs.el,
      h('div', { class: 'tarjeta' }, cajaTotales),
      cajaPago, cajaErrores);

    var m = App.Modal.abrir({
      titulo: ex ? 'Editar pedido #' + ex.numero : 'Nueva venta', tamano: 'ancho', contenido: cuerpo,
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, icono('check'), ex ? 'Guardar cambios' : 'Registrar venta')]
    });
    if (!ex && !lineas.length) {
      if (opciones.productoId) { var pl = { id: M.crearId(), productoId: opciones.productoId, nombreSnap: '', cantidad: 1, precioUnit: 0, descuentoLinea: { tipo: '$', valor: 0 }, manual: false }; var rr = O.buscar(d.recetas, opciones.productoId); pl.nombreSnap = rr ? rr.nombre : ''; pl.precioUnit = precioDe(opciones.productoId); lineas.push(pl); }
      else lineas.push({ id: M.crearId(), productoId: '', nombreSnap: '', cantidad: 1, precioUnit: 0, descuentoLinea: { tipo: '$', valor: 0 }, manual: false });
    }
    pintarLineas();
    if (pagoUI) pagoUI.pintar();
    recalcular();
    if (!ex && filasUI[0]) setTimeout(function () { filasUI[0].prod.focus(); }, 30);
  }

  // ======================================================================
  // Pago y cancelación
  // ======================================================================
  function abrirPago(pedidoId) {
    var doc = E.doc(), p = O.buscar(doc.datos.pedidos, pedidoId), c = C.calcularPedido(p);
    var cuentas = doc.datos.cuentas.filter(function (x) { return !x.archivado; });
    if (!cuentas.length) { App.Modal.aviso('Primero crea una cuenta', 'Para registrar un pago necesitas una cuenta de dinero (Efectivo, Nequi…). Créala en «Caja».').then(function () { App.Router.ir('caja'); }); return; }
    var monto = Form.numero({ etiqueta: 'Monto', tipo: 'moneda', valor: Math.max(Math.round(c.saldoPorCobrar), 0) || null, requerido: true, ayuda: 'Saldo pendiente: ' + F.cop(c.saldoPorCobrar) });
    var cuenta = Form.seleccion({ etiqueta: 'Cuenta donde entra el dinero', valor: cuentas[0].id, vacio: false, opciones: cuentas.map(function (x) { return { valor: x.id, texto: x.nombre }; }) });
    var medio = Form.seleccion({ etiqueta: 'Medio de pago', valor: 'efectivo', vacio: false, opciones: M.MEDIOS_PAGO.map(function (x) { return { valor: x, texto: x.charAt(0).toUpperCase() + x.slice(1) }; }) });
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: F.hoy() });
    var m = App.Modal.abrir({
      titulo: 'Registrar pago · Pedido #' + p.numero, tamano: 'chico', contenido: h('div', { class: 'pila' }, Form.rejilla([monto, cuenta, medio, fecha])),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var v = monto.get();
        var res = V.validarPago({ monto: v === null || isNaN(v) ? NaN : v, cuentaId: cuenta.get(), fecha: fecha.get() });
        var errs = Object.assign({}, res.errores);
        if (!errs.monto && v > Math.round(c.saldoPorCobrar)) errs.monto = 'El pago es mayor que el saldo pendiente (' + F.cop(c.saldoPorCobrar) + ').';
        if (Comun.mostrarErroresForm({ monto: monto, cuentaId: cuenta, fecha: fecha }, { errores: errs })) return;
        E.mutar(function (d) { O.registrarPago(d, pedidoId, { fecha: fecha.get(), cuentaId: cuenta.get(), monto: v, medio: medio.get() }); });
        App.Toast.ok('Pago de ' + F.cop(v) + ' registrado.'); m.cerrar();
      } }, 'Registrar pago')]
    });
  }

  function abrirCancelar(pedidoId) {
    var doc = E.doc(), p = O.buscar(doc.datos.pedidos, pedidoId), pagado = C.totalPagado(p);
    var cuentas = doc.datos.cuentas.filter(function (x) { return !x.archivado; });
    var devolver = Form.casilla({ etiqueta: 'Devolver ' + F.cop(pagado) + ' al cliente (sale de la caja)', valor: true });
    var ultimaCuenta = p.pagos.length ? p.pagos[p.pagos.length - 1].cuentaId : (cuentas[0] ? cuentas[0].id : '');
    var cuenta = Form.seleccion({ etiqueta: 'De qué cuenta sale', valor: ultimaCuenta, vacio: false, opciones: cuentas.map(function (x) { return { valor: x.id, texto: x.nombre }; }) });
    var fecha = Form.fecha({ etiqueta: 'Fecha de la devolución', valor: F.hoy() });
    var cuerpo = h('div', { class: 'pila' },
      h('p', null, 'El pedido #' + p.numero + ' quedará como cancelado y dejará de contar en tus ventas. No se borra: queda en el historial.'),
      pagado > 0 ? h('div', { class: 'pila' }, Comun.aviso('info', 'Este pedido tiene pagos por ' + F.cop(pagado) + '. Si ya devolviste el dinero, déjalo marcado para que tu caja cuadre.'), devolver.el, Form.rejilla([cuenta, fecha])) : null);
    var m = App.Modal.abrir({
      titulo: 'Cancelar pedido #' + p.numero, tamano: 'chico', contenido: cuerpo,
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'No cancelar'), h('button', { type: 'button', class: 'btn btn-peligro', onclick: function () {
        E.mutar(function (d) { O.cancelarPedido(d, pedidoId, { devolver: pagado > 0 && devolver.get(), cuentaId: cuenta.get(), fecha: fecha.get() }); }, { deshacer: 'Pedido #' + p.numero + ' cancelado.' });
        m.cerrar();
      } }, 'Cancelar el pedido')]
    });
  }

  function eliminarPedido(p) {
    App.Modal.confirmar({
      titulo: 'Eliminar pedido', peligro: true, palabra: 'ELIMINAR', textoConfirmar: 'Eliminar pedido',
      mensaje: 'Se borra el pedido #' + p.numero + ' junto con sus pagos y movimientos de inventario. No se puede deshacer (salvo con el aviso «Deshacer» que aparece enseguida). Si solo fue un error de venta, normalmente es mejor cancelarlo.'
    }).then(function (ok) {
      if (!ok) return;
      E.mutar(function (d) { O.eliminarDocumento(d, 'pedidos', p.id); }, { deshacer: 'Pedido #' + p.numero + ' eliminado.' });
      root.location.hash = '#/ventas';
    });
  }

  // ======================================================================
  // Detalle
  // ======================================================================
  function renderDetalle(cont, params) {
    var doc = E.doc(), d = doc.datos, p = O.buscar(d.pedidos, params.id);
    if (!p) { cont.appendChild(Comun.vacio({ emoji: '🔎', titulo: 'No encontré este pedido', acciones: [Comun.boton('Volver a ventas', { primario: true, onclick: function () { App.Router.ir('ventas'); } })] })); return; }
    var c = C.calcularPedido(p);
    var cliente = p.clienteId ? O.buscar(d.clientes, p.clienteId) : null, canal = p.canalId ? O.buscar(d.canales, p.canalId) : null;
    cont.appendChild(h('div', { class: 'no-imprimir', style: { marginBottom: '.5rem' } }, h('a', { href: '#/ventas' }, '← Volver a ventas')));
    var acciones = [];
    if (p.estado === 'pendiente') acciones.push(Comun.boton('En preparación', { onclick: function () { E.mutar(function (x) { O.cambiarEstadoPedido(x, p.id, 'enPreparacion'); }); } }));
    if (p.estado === 'pendiente' || p.estado === 'enPreparacion') acciones.push(Comun.boton('Marcar entregado', { primario: true, icono: 'check', onclick: function () { entregar(p.id); } }));
    if (p.estado !== 'cancelado') acciones.push(Comun.boton('Editar', { icono: 'edit', onclick: function () { abrirEditor(p.id); } }));
    acciones.push(Comun.boton('Copiar para WhatsApp', { icono: 'whatsapp', onclick: function () { Comun.copiarWhatsApp(Comun.resumenPedidoTexto(p)); } }));
    acciones.push(Comun.boton('Imprimir', { icono: 'print', onclick: App.Exportar.imprimir }));
    cont.appendChild(Comun.cabecera({ titulo: 'Pedido #' + p.numero, descripcion: F.fecha(p.fecha) + (cliente ? ' · ' + cliente.nombre : ''), acciones: acciones }));
    cont.appendChild(h('div', { class: 'fila', style: { marginBottom: '1rem' } }, insigniaEstado(p), insigniaPago(p, c), Comun.ejemplo(p)));
    if (p.estado === 'cancelado') cont.appendChild(Comun.aviso('error', 'Este pedido está cancelado y no cuenta en tus ventas.', 'alert'));
    if (p.estado === 'entregado' && p.snapCongelado) cont.appendChild(h('p', { class: 'explicacion' }, 'Entregado: los costos y la comisión quedaron congelados con los valores de ese momento.'));

    var info = h('div', { class: 'tarjeta pila' }, h('h3', null, 'Datos del pedido'),
      h('dl', { class: 'desglose-linea' },
        h('dt', null, 'Cliente'), h('dd', null, cliente ? [cliente.nombre, cliente.telefono ? h('div', { class: 'small' }, h('a', { href: 'https://wa.me/57' + cliente.telefono.replace(/\D/g, ''), target: '_blank', rel: 'noopener' }, cliente.telefono)) : null] : 'Sin cliente'),
        h('dt', null, 'Canal'), h('dd', null, canal ? canal.nombre + (canal.comisionPct > 0 ? ' (' + F.pct(canal.comisionPct, 1) + ')' : '') : 'Sin canal'),
        h('dt', null, 'Fecha'), h('dd', null, F.fecha(p.fecha)),
        p.observaciones ? [h('dt', null, 'Observaciones'), h('dd', null, p.observaciones)] : null));

    var tablaLineas = h('div', { class: 'tarjeta' }, h('h3', null, 'Productos'), h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla-tarjetas', 'aria-label': 'Productos del pedido' },
      h('thead', null, h('tr', null, ['Producto', 'Cantidad', 'Precio', 'Descuento', 'Total'].map(function (t, i) { return h('th', { class: i ? 'num' : '' }, t); }))),
      h('tbody', null, c.lineas.map(function (l) {
        return h('tr', null, h('th', { scope: 'row', 'data-label': 'Producto' }, l.nombre), h('td', { class: 'num', 'data-label': 'Cantidad' }, F.cantidad(l.cantidad)), h('td', { class: 'num', 'data-label': 'Precio' }, F.cop(l.precioUnit)),
          h('td', { class: 'num', 'data-label': 'Descuento' }, l.descLinea + l.descPedidoLinea > 0 ? '−' + F.cop(l.descLinea + l.descPedidoLinea) : '—'), h('td', { class: 'num', 'data-label': 'Total' }, F.cop(l.ingresoNeto)));
      })))));

    var filasTot = [['Valor de los productos', F.cop(c.bruto)]];
    if (c.descuentoLineas + c.descuentoPedido > 0) filasTot.push(['Descuentos', '−' + F.cop(c.descuentoLineas + c.descuentoPedido)]);
    if (c.envioCobrado > 0) filasTot.push(['Envío cobrado', F.cop(c.envioCobrado)]);
    if (c.impuesto > 0) filasTot.push(['Impuesto', F.cop(c.impuesto)]);
    filasTot.push(['Total del pedido', F.cop(c.totalPedido)]);
    var totales = h('div', { class: 'tarjeta pila' }, h('h3', null, 'Totales'),
      h('dl', { class: 'desglose-linea' }, filasTot.map(function (f, i) { return [h('dt', null, f[0]), h('dd', { class: i === filasTot.length - 1 ? 'total' : '' }, f[1])]; })),
      c.liquidaNeto ? h('p', { class: 'explicacion' }, 'Este canal te paga menos su comisión (' + F.cop(c.comisiones) + '): recibes ' + F.cop(c.totalEsperado) + '.') : null);

    var rentab = null;
    if (p.estado !== 'cancelado') {
      var neg = c.contribucion < 0;
      rentab = h('details', { class: 'tarjeta' }, h('summary', null, h('strong', null, 'Cuánto ganaste con este pedido: '), h('span', { class: neg ? 'negativo' : 'positivo' }, F.cop(c.contribucion))),
        h('dl', { class: 'desglose-linea', style: { marginTop: '.6rem' } },
          h('dt', null, 'Lo vendido (sin impuesto)'), h('dd', null, F.cop(c.ingresoNeto)),
          h('dt', null, 'Costo de producción'), h('dd', null, '−' + F.cop(c.costoProd)),
          h('dt', null, 'Otros costos por unidad'), h('dd', null, '−' + F.cop(c.otrosCostos)),
          h('dt', null, 'Comisión del canal'), h('dd', null, '−' + F.cop(c.comisiones)),
          h('dt', null, 'Costo del domicilio'), h('dd', null, '−' + F.cop(c.costoEnvio)),
          h('dt', { class: 'total' }, 'Ganancia (contribución)'), h('dd', { class: 'total' }, F.cop(c.contribucion))),
        c.ingresoNeto > 0 ? h('p', { class: 'explicacion' }, 'Margen de este pedido: ' + F.pct(c.contribucion / c.ingresoNeto, 1) + '. Es antes de gastos fijos.') : null);
    }

    var pagos = h('div', { class: 'tarjeta pila' }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Pagos'),
      p.estado !== 'cancelado' && c.saldoPorCobrar > 0 ? Comun.boton('Registrar pago', { primario: true, chico: true, icono: 'plus', onclick: function () { abrirPago(p.id); } }) : null),
      p.pagos.length ? h('ul', { class: 'lista-simple' }, p.pagos.map(function (pg) {
        return h('li', null, h('span', null, h('strong', null, F.cop(pg.monto)), ' · ' + F.fecha(pg.fecha), h('div', { class: 'explicacion' }, (Comun.nombreDe('cuentas', pg.cuentaId) || 'Cuenta eliminada') + ' · ' + (pg.medio || ''))),
          Comun.botonIcono('trash', 'Eliminar pago de ' + F.cop(pg.monto), function () {
            App.Modal.confirmar({ titulo: 'Eliminar pago', peligro: true, textoConfirmar: 'Eliminar pago', mensaje: '¿Eliminar el pago de ' + F.cop(pg.monto) + '? Se quita también de tu caja.' }).then(function (ok) {
              if (ok) E.mutar(function (x) { O.eliminarPago(x, p.id, pg.id); }, { deshacer: 'Pago eliminado.' });
            });
          }));
      })) : h('p', { class: 'muted' }, 'Todavía no hay pagos.'),
      h('dl', { class: 'desglose-linea' }, h('dt', null, 'Pagado'), h('dd', null, F.cop(c.pagado)), h('dt', { class: 'total' }, c.saldoPorCobrar > 0 ? 'Saldo por cobrar' : 'Saldo'), h('dd', { class: 'total ' + (c.saldoPorCobrar > 0 ? 'negativo' : 'positivo') }, c.saldoPorCobrar > 0 ? F.cop(c.saldoPorCobrar) : 'Al día')),
      p.estado !== 'entregado' && p.estado !== 'cancelado' && c.saldoPorCobrar > 0 ? h('p', { class: 'explicacion' }, 'Mientras no esté entregado, lo cobrado es un anticipo: no cuenta como cuenta por cobrar.') : null);

    cont.appendChild(h('div', { class: 'rejilla c2' }, h('div', { class: 'pila' }, info, tablaLineas), h('div', { class: 'pila' }, totales, pagos)));
    if (rentab) cont.appendChild(h('div', { style: { marginTop: '1rem' } }, rentab));

    var peligro = h('div', { class: 'grupo-botones no-imprimir', style: { marginTop: '1rem' } });
    if (p.estado !== 'cancelado') peligro.appendChild(Comun.boton('Cancelar pedido', { icono: 'x', onclick: function () { abrirCancelar(p.id); } }));
    else peligro.appendChild(Comun.boton('Reabrir como pendiente', { onclick: function () { E.mutar(function (x) { O.cambiarEstadoPedido(x, p.id, 'pendiente'); }); } }));
    peligro.appendChild(Comun.boton('Eliminar pedido', { peligro: true, fantasma: true, icono: 'trash', onclick: function () { eliminarPedido(p); } }));
    cont.appendChild(peligro);
  }

  // ======================================================================
  // Lista
  // ======================================================================
  function renderLista(cont) {
    var doc = E.doc(), d = doc.datos, hoy = F.hoy();
    cont.appendChild(Comun.cabecera({
      titulo: 'Ventas y pedidos', descripcion: 'Registra cada venta y mira cuánto dejó. Un pedido cuenta como venta cuando lo marcas como entregado.',
      acciones: [Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.ventas(estPeriodo.modo === 'todo' ? null : estPeriodo.desde, estPeriodo.modo === 'todo' ? null : estPeriodo.hasta); } }),
        Comun.boton('Nueva venta', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
    }));
    if (!d.pedidos.length) {
      cont.appendChild(Comun.vacio({ emoji: '🧾', titulo: 'Aún no has registrado ventas', texto: 'Cuando vendas, regístralo aquí: la app calcula cuánto ganaste, descuenta los insumos y suma el dinero a tu caja.',
        acciones: [Comun.boton('Registrar mi primera venta', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })] }));
      return;
    }
    var cuerpo = h('div', { class: 'pila' });
    var contResumen = h('div');
    var periodo = Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['rango', 'Personalizado'], ['todo', 'Todo']] });
    cont.appendChild(h('div', { class: 'fila entre', style: { marginBottom: '.75rem' } }, periodo));
    cont.appendChild(contResumen);

    var desde = estPeriodo.desde, hasta = estPeriodo.hasta;
    var enPeriodo = d.pedidos.filter(function (p) { return p.fecha >= desde && p.fecha <= hasta; });
    var res = A.resumenPeriodo(doc, desde, hasta);
    var cobrar = A.cuentasPorCobrar(doc, hoy).reduce(function (s, x) { return s + x.saldo; }, 0);
    var abiertos = enPeriodo.filter(function (p) { return p.estado === 'pendiente' || p.estado === 'enPreparacion'; }).length;
    contResumen.appendChild(h('div', { class: 'rejilla kpis', style: { marginBottom: '1rem' } },
      Comun.kpi({ titulo: 'Ventas entregadas', valor: F.cop(res.ingresosNetos), nota: res.nVentas + (res.nVentas === 1 ? ' pedido' : ' pedidos') }),
      Comun.kpi({ titulo: 'Ganancia', valor: F.cop(res.contribucion), clase: res.contribucion < 0 ? 'malo' : '', nota: res.margenContribucion === null ? 'Antes de gastos' : 'Margen ' + F.pct(res.margenContribucion, 1) + ' · antes de gastos' }),
      Comun.kpi({ titulo: 'Por entregar', valor: String(abiertos), nota: 'Pendientes o en preparación' }),
      Comun.kpi({ titulo: 'Por cobrar (total)', valor: F.cop(cobrar), nota: 'Pedidos entregados sin pagar completo', enlace: '#/caja' })));

    var seg = h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Estado' }, [['', 'Todos'], ['abiertos', 'Por entregar'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados']].map(function (par) {
      return h('button', { type: 'button', 'aria-pressed': String(filtroEstado === par[0]), onclick: function () { filtroEstado = par[0]; App.Router.refrescar(); } }, par[1]);
    }));
    var filas = enPeriodo.filter(function (p) {
      if (!filtroEstado) return true;
      if (filtroEstado === 'abiertos') return p.estado === 'pendiente' || p.estado === 'enPreparacion';
      return p.estado === filtroEstado;
    });
    var calc = {};
    filas.forEach(function (p) { calc[p.id] = C.calcularPedido(p); });

    var tabla = App.Tabla.crear({
      etiqueta: 'Pedidos', filas: filas, estado: estTabla, orden: { col: 'fecha', dir: -1 }, herramientas: seg, placeholderBusqueda: 'Buscar por cliente, número o producto…',
      buscarEn: function (p) { return '#' + p.numero + ' ' + p.numero + ' ' + (p.clienteId ? Comun.nombreDe('clientes', p.clienteId) : '') + ' ' + resumenLineas(calc[p.id]); },
      onFila: function (p) { root.location.hash = '#/ventas/' + p.id; }, clasesFila: function (p) { return p.estado === 'cancelado' ? 'archivada' : ''; },
      vacio: h('div', { class: 'estado-vacio' }, h('p', null, 'No hay pedidos en este periodo.')),
      columnas: [
        { id: 'num', titulo: 'N.º', clase: 'num', valor: function (p) { return p.numero; }, render: function (p) { return h('strong', null, '#' + p.numero); } },
        { id: 'fecha', titulo: 'Fecha', valor: function (p) { return p.fecha + String(p.numero).padStart(6, '0'); }, render: function (p) { return F.fechaCorta(p.fecha); } },
        { id: 'cli', titulo: 'Cliente', valor: function (p) { return p.clienteId ? Comun.nombreDe('clientes', p.clienteId) : ''; }, render: function (p) { return p.clienteId ? Comun.nombreDe('clientes', p.clienteId) : h('span', { class: 'muted' }, 'Sin cliente'); } },
        { id: 'prod', titulo: 'Productos', ordenable: false, render: function (p) { return h('span', { class: 'small' }, resumenLineas(calc[p.id])); } },
        { id: 'canal', titulo: 'Canal', valor: function (p) { return p.canalId ? Comun.nombreDe('canales', p.canalId) : ''; }, render: function (p) { return p.canalId ? Comun.nombreDe('canales', p.canalId) : '—'; } },
        { id: 'total', titulo: 'Total', clase: 'num', valor: function (p) { return calc[p.id].totalPedido; }, render: function (p) { return F.cop(calc[p.id].totalPedido); } },
        { id: 'est', titulo: 'Estado', valor: function (p) { return p.estado; }, render: function (p) { return h('span', { class: 'fila', style: { gap: '.3rem' } }, insigniaEstado(p), insigniaPago(p, calc[p.id]), Comun.ejemplo(p)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (p) {
          return h('span', { class: 'grupo-botones derecha' }, p.estado === 'pendiente' || p.estado === 'enPreparacion' ? Comun.boton('Entregar', { chico: true, onclick: function () { entregar(p.id); } }) : null,
            Comun.botonIcono('der', 'Ver pedido #' + p.numero, function () { root.location.hash = '#/ventas/' + p.id; }));
        } }
      ],
      pie: function (f) {
        var tot = f.filter(function (p) { return p.estado !== 'cancelado'; }).reduce(function (s, p) { return s + calc[p.id].totalPedido; }, 0);
        return [h('td', { colspan: 5 }, 'Total de ' + f.filter(function (p) { return p.estado !== 'cancelado'; }).length + ' pedidos (sin cancelados)'), h('td', { class: 'num' }, F.cop(tot)), h('td', { colspan: 2 })];
      }
    });
    cont.appendChild(tabla.el);
  }

  App.VentasVista = { abrirEditor: abrirEditor, abrirPago: abrirPago, entregar: entregar };
  App.Acciones = App.Acciones || {};
  App.Acciones.nuevaVenta = function () { abrirEditor(null); };
  App.registrarVista('ventas', { titulo: function (p) { if (!p.id) return 'Ventas y pedidos'; var x = O.buscar(E.datos().pedidos, p.id); return x ? 'Pedido #' + x.numero : 'Pedido'; }, render: function (cont, params) { if (params.id) renderDetalle(cont, params); else renderLista(cont); } });
})(typeof self !== 'undefined' ? self : this);
