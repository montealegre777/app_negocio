/* Compras de insumos y proveedores. Cada compra actualiza el inventario, el historial de precios y la caja. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono, F = App.Formato, C = App.Calculos, E = App.Estado, M = App.Modelo, U = App.Unidades, O = App.Operaciones, D = App.Derivados;
  var Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var estCompras = {}, estProv = {}, pestana = 'compras', estPeriodo = { modo: 'mes' }, verArchProv = false;

  function cuentasOpc() { return E.datos().cuentas.filter(function (c) { return !c.archivado; }).map(function (c) { return { valor: c.id, texto: c.nombre }; }); }

  // ======================================================================
  // Proveedores
  // ======================================================================
  function abrirProveedor(id, alGuardar) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.proveedores, id) : null;
    var base = ex || M.nuevoProveedor({});
    var nombre = Form.texto({ etiqueta: 'Nombre del proveedor', valor: base.nombre, requerido: true, maxlength: 60 });
    var tel = Form.texto({ etiqueta: 'Teléfono / WhatsApp', valor: base.telefono, maxlength: 20, tipo: 'tel', modo: 'tel' });
    var notas = Form.area({ etiqueta: 'Notas (días de entrega, condiciones…)', valor: base.notas, filas: 2, maxlength: 300 });
    var errores = h('div');
    function guardar() {
      var obj = M.nuevoProveedor(Object.assign({}, ex || {}, { nombre: nombre.get(), telefono: tel.get(), notas: notas.get() }));
      if (Comun.mostrarErroresForm({ nombre: nombre }, V.validarProveedor(obj), errores)) return;
      var nid; E.mutar(function (d) { nid = O.guardarEntidad(d, 'proveedores', obj).id; });
      App.Toast.ok(ex ? 'Proveedor actualizado.' : 'Proveedor creado.'); m.cerrar(); if (alGuardar) alGuardar(nid);
    }
    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () {
      var uso = O.usoDeEntidad(doc, 'proveedores', ex.id);
      if (!uso.tieneHistoria) App.Modal.confirmar({ titulo: 'Eliminar proveedor', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar a «' + ex.nombre + '»?' }).then(function (ok) { if (ok) { E.mutar(function (d) { O.eliminarEntidad(d, 'proveedores', ex.id); }, { deshacer: 'Proveedor eliminado.' }); m.cerrar(); } });
      else Comun.archivarEntidad('proveedores', ex.id, 'proveedor').then(function (ok) { if (ok) m.cerrar(); });
    } }, 'Eliminar o archivar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));
    var m = App.Modal.abrir({ titulo: ex ? 'Proveedor' : 'Nuevo proveedor', contenido: h('div', { class: 'pila' }, Form.rejilla([nombre, tel]), notas.el, errores), pie: pie });
    m.el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); } });
  }

  // ======================================================================
  // Compra
  // ======================================================================
  function totalLinea(l) { return C.num(l.precioTotal); }

  function abrirCompra(id, alGuardar) {
    var doc = E.doc(), d = doc.datos, ex = id ? O.buscar(d.compras, id) : null;
    if (id && !ex) return;
    if (!d.insumos.length) {
      App.Modal.aviso('Primero crea tus insumos', 'Para registrar una compra necesitas tener creados los insumos que compraste.').then(function () { App.Router.ir('insumos'); });
      return;
    }
    var cuentas = cuentasOpc();
    var fecha = Form.fecha({ etiqueta: 'Fecha de la compra', valor: ex ? ex.fecha : F.hoy() });
    var proveedor = Form.seleccion({ etiqueta: 'Proveedor (opcional)', valor: ex ? ex.proveedorId || '' : '', vacio: 'Sin proveedor', opciones: Comun.opcionesDe('proveedores', { incluirId: ex && ex.proveedorId }) });
    var nuevoProv = Comun.boton('Nuevo proveedor', { chico: true, icono: 'plus', onclick: function () { abrirProveedor(null, function (nid) { proveedor.opciones(Comun.opcionesDe('proveedores'), nid); }); } });
    var flete = Form.numero({ etiqueta: 'Flete o domicilio (opcional)', tipo: 'moneda', valor: ex ? ex.flete || null : null, placeholder: '0', ayuda: 'Se reparte entre los insumos según lo que costó cada uno.' });
    var estadoPago = Form.seleccion({ etiqueta: 'Estado', valor: ex ? ex.estadoPago : 'pagado', vacio: false, opciones: [{ valor: 'pagado', texto: 'Ya la pagué' }, { valor: 'pendiente', texto: 'Falta pagarla (a crédito)' }] });
    var cuenta = Form.seleccion({ etiqueta: 'Pagada desde la cuenta', valor: ex && ex.cuentaId ? ex.cuentaId : (cuentas[0] ? cuentas[0].valor : ''), vacio: cuentas.length ? false : 'No tienes cuentas', opciones: cuentas });
    var obs = Form.area({ etiqueta: 'Observaciones (opcional)', valor: ex ? ex.observaciones : '', filas: 2, maxlength: 300 });
    var lineas = ex ? O.clonar(ex.lineas).map(function (l) { l.id = l.id || M.crearId(); return l; }) : [{ id: M.crearId(), insumoId: '', cantidad: 0, unidad: 'g', precioTotal: 0 }];
    var cajaLineas = h('div', { class: 'lineas-receta' }), cajaResumen = h('div', { class: 'pila', 'aria-live': 'polite' }), cajaErrores = h('div');
    var filasUI = [];

    function visibilidadCuenta() { cuenta.el.hidden = estadoPago.get() !== 'pagado'; }
    estadoPago.alCambiar(visibilidadCuenta); visibilidadCuenta();

    function unidadesPara(insId) {
      var ins = O.buscar(d.insumos, insId), todas = Object.keys(U.UNIDADES);
      if (!ins) return todas;
      var ok = todas.filter(function (u) { return U.sePuedeConvertir(u, ins.unidadBase, ins.equivalencias); });
      return ok.length ? ok : todas;
    }

    function filaLinea(l, i) {
      var ins = etiq(Form.seleccion({ valor: l.insumoId || '', vacio: 'Elige un insumo…', opciones: Comun.opcionesDe('insumos', { incluirId: l.insumoId }) }), 'Insumo de la línea ' + (i + 1));
      var cant = Form.numero({ tipo: 'numero', valor: l.cantidad || null, ariaLabel: 'Cantidad de la línea ' + (i + 1) });
      var uni = etiq(Form.seleccion({ valor: l.unidad, vacio: false, opciones: unidadesPara(l.insumoId).map(function (u) { return { valor: u, texto: u }; }) }), 'Unidad de la línea ' + (i + 1));
      var precio = Form.numero({ tipo: 'moneda', valor: l.precioTotal || null, ariaLabel: 'Precio total de la línea ' + (i + 1) });
      var info = h('div', { class: 'costo-linea', style: { textAlign: 'left', fontWeight: 400, fontSize: '.85rem' } }, '—');
      var msg = h('div', { class: 'error-texto', role: 'alert', hidden: true, style: { gridColumn: '1 / -1' } });
      var quitar = Comun.botonIcono('trash', 'Quitar la línea ' + (i + 1), function () { lineas.splice(i, 1); pintarLineas(); recalcular(); });
      function celda(t, n) { return h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, t), n); }
      var fila = h('div', { class: 'linea-receta', style: { gridTemplateColumns: 'minmax(170px,2fr) minmax(90px,.8fr) minmax(100px,.9fr) minmax(120px,1fr) minmax(150px,1.3fr) auto' } },
        celda('Insumo', ins.el), celda('Cantidad', cant.el), celda('Unidad', uni.el), celda('Precio total pagado', precio.el), celda('Costo por unidad', info), h('div', { class: 'celda' }, quitar), msg);
      ins.alCambiar(function () {
        l.insumoId = ins.get(); var ok = unidadesPara(l.insumoId), x = O.buscar(d.insumos, l.insumoId);
        if (ok.indexOf(l.unidad) < 0 || (x && l.unidad !== x.presentacion.unidad && ok.indexOf(x.presentacion.unidad) >= 0 && !l.tocoUnidad)) l.unidad = x && ok.indexOf(x.presentacion.unidad) >= 0 ? x.presentacion.unidad : (x ? x.unidadBase : 'g');
        uni.opciones(ok.map(function (u) { return { valor: u, texto: u }; }), l.unidad);
        recalcular();
      });
      cant.alCambiar(function () { var v = cant.get(); cant.error(v !== null && isNaN(v) ? 'Número inválido.' : ''); l.cantidad = v === null || isNaN(v) ? 0 : v; recalcular(); });
      uni.alCambiar(function () { l.unidad = uni.get(); l.tocoUnidad = true; recalcular(); });
      precio.alCambiar(function () { var v = precio.get(); precio.error(v !== null && isNaN(v) ? 'Número inválido.' : ''); l.precioTotal = v === null || isNaN(v) ? 0 : v; recalcular(); });
      filasUI[i] = { el: fila, msg: msg, info: info, ins: ins };
      return fila;
    }
    function etiq(c, t) { c.input.setAttribute('aria-label', t); return c; }
    function pintarLineas() {
      App.Dom.limpiar(cajaLineas); filasUI = [];
      lineas.forEach(function (l, i) { cajaLineas.appendChild(filaLinea(l, i)); });
      if (!lineas.length) cajaLineas.appendChild(h('p', { class: 'explicacion' }, 'Agrega los insumos que compraste.'));
    }

    function borrador() {
      var f = flete.get();
      return { id: ex ? ex.id : undefined, fecha: fecha.get(), proveedorId: proveedor.get() || null, flete: f === null || isNaN(f) ? (isNaN(f) ? NaN : 0) : f,
        lineas: lineas.map(function (l) { return { id: l.id, insumoId: l.insumoId, cantidad: l.cantidad, unidad: l.unidad, precioTotal: l.precioTotal }; }), estadoPago: estadoPago.get(), cuentaId: estadoPago.get() === 'pagado' ? (cuenta.get() || null) : null, observaciones: obs.get() };
    }

    function recalcular() {
      var b = borrador(), ctx = C.crearContexto(doc), porId = C.mapaPorId(d.insumos);
      var lin = C.lineasCompraPorInsumo([b], porId);
      var idxPorInsumo = {};
      lineas.forEach(function (l, i) {
        var f = filasUI[i]; if (!f) return;
        App.Dom.limpiar(f.info);
        if (!l.insumoId || !(l.cantidad > 0)) { f.info.appendChild(document.createTextNode('—')); return; }
        var ins = porId[l.insumoId], conv = U.intentarConvertir(l.cantidad, l.unidad, ins.unidadBase, ins.equivalencias);
        if (!conv.ok) { f.info.appendChild(h('span', { class: 'negativo' }, 'Unidades incompatibles')); return; }
        var cu = (C.num(l.precioTotal) + (b.flete > 0 && b.lineas.length ? b.flete * C.num(l.precioTotal) / b.lineas.reduce(function (s, x) { return s + C.num(x.precioTotal); }, 0) : 0)) / conv.valor;
        var actual = ctx.costoBase(ins.id);
        var v = actual > 0 ? cu / actual - 1 : null;
        f.info.appendChild(h('span', null, Comun.costoUnidad(cu) + ' / ' + ins.unidadBase));
        if (v !== null && Math.abs(v) >= 0.005) f.info.appendChild(h('div', null, Comun.insigniaVariacion({ pct: v, antes: actual, despues: cu })));
      });
      var total = D.totalCompra(b);
      App.Dom.limpiar(cajaResumen);
      var filas = [['Insumos', F.cop(lineas.reduce(function (s, l) { return s + C.num(l.precioTotal); }, 0))]];
      if (b.flete > 0) filas.push(['Flete', F.cop(b.flete)]);
      filas.push(['Total de la compra', F.cop(total)]);
      cajaResumen.appendChild(h('dl', { class: 'desglose-linea' }, filas.map(function (x, i) { return [h('dt', null, x[0]), h('dd', { class: i === filas.length - 1 ? 'total' : '' }, x[1])]; })));
      cajaResumen.appendChild(h('p', { class: 'explicacion' }, 'Al guardar, el inventario sube y el costo de cada insumo se actualiza con lo que pagaste' + (doc.config.politicaCosto === 'promedio' ? ' (promediado con tus compras anteriores).' : '. Las ventas ya entregadas no cambian.')));
    }
    [fecha, proveedor, flete, estadoPago, cuenta].forEach(function (c) { c.alCambiar(recalcular); });

    function guardar() {
      App.Dom.limpiar(cajaErrores);
      var b = borrador();
      var res = V.validarCompra(b, doc), errs = Object.assign({}, res.errores);
      var f = flete.get(); if (f !== null && isNaN(f)) errs.flete = 'No entiendo ese número.';
      var mapa = { fecha: fecha, flete: flete, cuentaId: cuenta }, primero = null, extras = [];
      Object.keys(mapa).forEach(function (k) { mapa[k].error(errs[k] || ''); if (errs[k] && !primero) primero = mapa[k]; });
      filasUI.forEach(function (x) { if (x) { x.msg.hidden = true; x.el.classList.remove('error'); } });
      lineas.forEach(function (l, i) { var x = filasUI[i]; if (x && errs['linea' + i]) { x.msg.hidden = false; x.msg.textContent = errs['linea' + i]; x.el.classList.add('error'); if (!primero) primero = x.ins; } });
      if (errs.lineas) extras.push(errs.lineas);
      if (extras.length || primero) { extras.forEach(function (t) { cajaErrores.appendChild(Comun.aviso('error', t, 'alert')); }); if (primero) primero.focus(); return; }
      var obj = M.nuevaCompra(Object.assign({}, ex || {}, b));
      obj.lineas = b.lineas;
      E.mutar(function (dd) { O.guardarCompra(dd, obj); });
      App.Toast.ok(ex ? 'Compra actualizada.' : 'Compra registrada por ' + F.cop(D.totalCompra(b)) + '.');
      m.cerrar(); if (alGuardar) alGuardar();
    }

    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () {
      App.Modal.confirmar({ titulo: 'Eliminar compra', peligro: true, textoConfirmar: 'Eliminar compra', mensaje: '¿Eliminar esta compra? El inventario baja y, si estaba pagada, el dinero vuelve a tu caja.' }).then(function (ok) {
        if (ok) { E.mutar(function (dd) { O.eliminarDocumento(dd, 'compras', ex.id); }, { deshacer: 'Compra eliminada.' }); m.cerrar(); }
      });
    } }, 'Eliminar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, icono('check'), ex ? 'Guardar cambios' : 'Registrar compra'));

    var m = App.Modal.abrir({
      titulo: ex ? 'Editar compra' : 'Nueva compra', tamano: 'ancho',
      contenido: h('div', { class: 'pila' }, Form.rejilla([fecha]), h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, h('div', { style: { flex: '1 1 240px' } }, proveedor.el), nuevoProv),
        h('div', { class: 'pila' }, h('h4', { style: { margin: 0 } }, 'Insumos comprados'), cajaLineas, h('div', null, Comun.boton('Agregar insumo', { icono: 'plus', onclick: function () { lineas.push({ id: M.crearId(), insumoId: '', cantidad: 0, unidad: 'g', precioTotal: 0 }); pintarLineas(); recalcular(); if (filasUI[lineas.length - 1]) filasUI[lineas.length - 1].ins.focus(); } }))),
        Form.rejilla([flete, estadoPago, cuenta]), obs.el, h('div', { class: 'tarjeta' }, cajaResumen), cajaErrores), pie: pie
    });
    pintarLineas(); recalcular();
  }

  function abrirPagarCompra(id) {
    var c = O.buscar(E.datos().compras, id), cuentas = cuentasOpc();
    if (!cuentas.length) { App.Modal.aviso('Primero crea una cuenta', 'Para pagar necesitas una cuenta de dinero. Créala en «Caja».').then(function () { App.Router.ir('caja'); }); return; }
    var cuenta = Form.seleccion({ etiqueta: 'Pagar desde', valor: cuentas[0].valor, vacio: false, opciones: cuentas });
    var fecha = Form.fecha({ etiqueta: 'Fecha del pago', valor: F.hoy() });
    var m = App.Modal.abrir({
      titulo: 'Pagar compra', tamano: 'chico', contenido: h('div', { class: 'pila' }, h('p', null, 'Total: ', h('strong', null, F.cop(D.totalCompra(c)))), Form.rejilla([cuenta, fecha])),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        if (!F.esFechaISO(fecha.get())) { fecha.error('Fecha inválida.'); return; }
        E.mutar(function (d) { O.pagarCompra(d, id, cuenta.get(), fecha.get()); }); App.Toast.ok('Compra pagada.'); m.cerrar();
      } }, 'Registrar pago')]
    });
  }

  // ======================================================================
  // Vista
  // ======================================================================
  function renderCompras(cont) {
    var doc = E.doc(), d = doc.datos;
    cont.appendChild(h('div', { class: 'fila entre', style: { marginBottom: '.75rem' } }, Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['rango', 'Personalizado'], ['todo', 'Todo']] }),
      Comun.boton('Descargar CSV', { icono: 'download', onclick: App.Exportar.compras })));
    var filas = d.compras.filter(function (c) { return c.fecha >= estPeriodo.desde && c.fecha <= estPeriodo.hasta; });
    var tot = filas.reduce(function (s, c) { return s + D.totalCompra(c); }, 0), pend = d.compras.filter(function (c) { return c.estadoPago === 'pendiente'; });
    cont.appendChild(h('div', { class: 'rejilla kpis', style: { marginBottom: '1rem' } }, Comun.kpi({ titulo: 'Comprado en el periodo', valor: F.cop(tot), nota: filas.length + ' compras' }),
      Comun.kpi({ titulo: 'Por pagar a proveedores', valor: F.cop(pend.reduce(function (s, c) { return s + D.totalCompra(c); }, 0)), clase: pend.length ? 'malo' : '', nota: pend.length + ' compras pendientes' })));
    if (!d.compras.length) {
      cont.appendChild(Comun.vacio({ emoji: '🛒', titulo: 'Aún no has registrado compras', texto: 'Cada compra sube tu inventario, actualiza el costo de tus insumos y descuenta el dinero de tu caja.', acciones: [Comun.boton('Registrar mi primera compra', { primario: true, icono: 'plus', onclick: function () { abrirCompra(null); } })] }));
      return;
    }
    cont.appendChild(App.Tabla.crear({
      etiqueta: 'Compras', filas: filas, estado: estCompras, orden: { col: 'fecha', dir: -1 }, onFila: function (c) { abrirCompra(c.id); }, placeholderBusqueda: 'Buscar compra…',
      buscarEn: function (c) { return Comun.nombreDe('proveedores', c.proveedorId) + ' ' + c.lineas.map(function (l) { return Comun.nombreDe('insumos', l.insumoId); }).join(' '); },
      vacio: h('div', { class: 'estado-vacio' }, h('p', null, 'No hay compras en este periodo.')),
      columnas: [
        { id: 'fecha', titulo: 'Fecha', valor: function (c) { return c.fecha; }, render: function (c) { return F.fechaCorta(c.fecha); } },
        { id: 'prov', titulo: 'Proveedor', valor: function (c) { return Comun.nombreDe('proveedores', c.proveedorId); }, render: function (c) { return c.proveedorId ? Comun.nombreDe('proveedores', c.proveedorId) || '(eliminado)' : h('span', { class: 'muted' }, 'Sin proveedor'); } },
        { id: 'items', titulo: 'Insumos', ordenable: false, render: function (c) { var n = c.lineas.map(function (l) { return Comun.nombreDe('insumos', l.insumoId); }); return h('span', { class: 'small' }, n.slice(0, 4).join(', ') + (n.length > 4 ? ' y ' + (n.length - 4) + ' más' : '')); } },
        { id: 'total', titulo: 'Total', clase: 'num', valor: function (c) { return D.totalCompra(c); }, render: function (c) { return F.cop(D.totalCompra(c)); } },
        { id: 'est', titulo: 'Estado', valor: function (c) { return c.estadoPago; }, render: function (c) { return h('span', { class: 'fila', style: { gap: '.3rem' } }, c.estadoPago === 'pagado' ? h('span', { class: 'insignia ok' }, 'Pagada') : h('span', { class: 'insignia aviso' }, 'Por pagar'), Comun.ejemplo(c)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (c) { return h('span', { class: 'grupo-botones derecha' }, c.estadoPago === 'pendiente' ? Comun.boton('Pagar', { chico: true, onclick: function () { abrirPagarCompra(c.id); } }) : null, Comun.botonIcono('edit', 'Editar compra', function () { abrirCompra(c.id); })); } }
      ],
      pie: function (f) { return [h('td', { colspan: 3 }, 'Total (' + f.length + ')'), h('td', { class: 'num' }, F.cop(f.reduce(function (s, c) { return s + D.totalCompra(c); }, 0))), h('td', { colspan: 2 })]; }
    }).el);
  }

  function renderProveedores(cont) {
    var d = E.datos();
    var stats = {};
    d.compras.forEach(function (c) { if (!c.proveedorId) return; var s = stats[c.proveedorId] || (stats[c.proveedorId] = { n: 0, total: 0, ultima: '' }); s.n++; s.total += D.totalCompra(c); if (c.fecha > s.ultima) s.ultima = c.fecha; });
    if (!d.proveedores.length) {
      cont.appendChild(Comun.vacio({ emoji: '🚚', titulo: 'Aún no tienes proveedores', texto: 'Guárdalos para comparar precios y armar listas de compra por proveedor.', acciones: [Comun.boton('Crear un proveedor', { primario: true, icono: 'plus', onclick: function () { abrirProveedor(null); } })] }));
      return;
    }
    var arch = Form.casilla({ etiqueta: 'Mostrar archivados', valor: verArchProv });
    arch.alCambiar(function () { verArchProv = arch.get(); App.Router.refrescar(); });
    cont.appendChild(App.Tabla.crear({
      etiqueta: 'Proveedores', filas: d.proveedores.filter(function (p) { return verArchProv || !p.archivado; }), estado: estProv, orden: { col: 'nombre', dir: 1 }, herramientas: arch.el, onFila: function (p) { abrirProveedor(p.id); },
      buscarEn: function (p) { return p.nombre + ' ' + p.telefono; }, placeholderBusqueda: 'Buscar proveedor…', clasesFila: function (p) { return p.archivado ? 'archivada' : ''; },
      columnas: [
        { id: 'nombre', titulo: 'Proveedor', valor: function (p) { return p.nombre; }, render: function (p) { return h('span', null, h('strong', null, p.nombre), ' ', Comun.ejemplo(p), p.archivado ? h('span', { class: 'insignia' }, 'Archivado') : null, p.telefono ? h('div', { class: 'small muted' }, p.telefono) : null); } },
        { id: 'n', titulo: 'Compras', clase: 'num', valor: function (p) { return (stats[p.id] || {}).n || 0; }, render: function (p) { return String((stats[p.id] || {}).n || 0); } },
        { id: 'tot', titulo: 'Total comprado', clase: 'num', valor: function (p) { return (stats[p.id] || {}).total || 0; }, render: function (p) { return F.cop((stats[p.id] || {}).total || 0); } },
        { id: 'ult', titulo: 'Última compra', valor: function (p) { return (stats[p.id] || {}).ultima || ''; }, render: function (p) { var u = (stats[p.id] || {}).ultima; return u ? F.fecha(u) : '—'; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (p) {
          return h('span', { class: 'grupo-botones derecha' }, Comun.botonIcono('edit', 'Editar ' + p.nombre, function () { abrirProveedor(p.id); }),
            p.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + p.nombre, function () { Comun.restaurarEntidad('proveedores', p.id); }) : Comun.botonIcono('archive', 'Archivar ' + p.nombre, function () { Comun.archivarEntidad('proveedores', p.id, 'proveedor'); }));
        } }
      ]
    }).el);
  }

  function render(cont) {
    cont.appendChild(Comun.cabecera({
      titulo: 'Compras y proveedores', descripcion: 'Registra lo que compras: sube tu inventario, actualiza el costo de tus insumos y descuenta tu caja.',
      acciones: [pestana === 'compras' ? Comun.boton('Nueva compra', { primario: true, icono: 'plus', onclick: function () { abrirCompra(null); } }) : Comun.boton('Nuevo proveedor', { primario: true, icono: 'plus', onclick: function () { abrirProveedor(null); } })]
    }));
    cont.appendChild(h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Secciones' }, [['compras', 'Compras'], ['proveedores', 'Proveedores']].map(function (t) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(pestana === t[0]), onclick: function () { pestana = t[0]; App.Router.refrescar(); } }, t[1]);
    })));
    if (pestana === 'compras') renderCompras(cont); else renderProveedores(cont);
  }

  App.ComprasVista = { abrirCompra: abrirCompra, abrirProveedor: abrirProveedor, abrirPagarCompra: abrirPagarCompra };
  App.registrarVista('compras', { titulo: 'Compras y proveedores', render: render });
})(typeof self !== 'undefined' ? self : this);
