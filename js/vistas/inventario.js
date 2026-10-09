/* Inventario: cuánto tienes de cada insumo (y de producto terminado en modo por lotes), mermas y conteos físicos. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, U = App.Unidades, O = App.Operaciones, Form = App.Form, Comun = App.Comun;
  var pestana = 'insumos', filtroEstado = '', filtroCat = '', estIns = {}, estProd = {}, estMov = {}, filtroMov = '', estPeriodo = { modo: 'mes' };

  var ETIQUETA_MOV = {
    compra: 'Compra', consumoVenta: 'Consumo por venta', consumoProduccion: 'Consumo por producción', produccionTerminado: 'Producción terminada',
    ventaTerminado: 'Venta de terminado', merma: 'Merma / pérdida', ajuste: 'Ajuste por conteo'
  };

  /** Cantidad en unidad base con una unidad "grande" cuando conviene (1.500 g → 1,5 kg). */
  function verCant(v, ub) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    if (ub === 'g' && abs >= 1000) return F.cantidad(v / 1000) + ' kg';
    if (ub === 'ml' && abs >= 1000) return F.cantidad(v / 1000) + ' l';
    return F.cantidad(v) + ' ' + (ub || '');
  }

  function estadoStock(ins, s) {
    if (s < -1e-9) return { clave: 'negativo', texto: 'Negativo', clase: 'error', ayuda: 'La app tiene menos de lo que ya se gastó. Falta registrar una compra o hacer un conteo físico.' };
    if (s <= 1e-9) return { clave: 'sin', texto: 'Sin stock', clase: 'aviso', ayuda: 'No queda nada registrado.' };
    if (ins.stockMinimo > 0 && s <= ins.stockMinimo) return { clave: 'bajo', texto: 'Stock bajo', clase: 'aviso', ayuda: 'Está en o por debajo del mínimo que definiste.' };
    return { clave: 'ok', texto: 'Bien', clase: 'ok', ayuda: '' };
  }

  // ---------------- Merma / conteo ----------------
  /** modo: 'merma' | 'conteo'. sujeto: 'i:<id>' | 'p:<id>' (opcional). */
  function abrirMovimiento(modo, sujeto) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx();
    var conProd = doc.config.modoInventario === 'conProduccion';
    var opciones = Comun.opcionesDe('insumos').map(function (o) { return { valor: 'i:' + o.valor, texto: o.texto }; });
    if (conProd) opciones = opciones.concat(d.recetas.filter(function (r) { return !r.archivado && r.tipo !== 'preparacion'; }).map(function (r) { return { valor: 'p:' + r.id, texto: 'Producto terminado: ' + r.nombre }; }));
    if (!opciones.length) { App.Modal.aviso('Primero crea tus insumos', 'Para ajustar inventario necesitas tener insumos creados.').then(function () { App.Router.ir('insumos'); }); return; }
    var tipo = Form.seleccion({ etiqueta: '¿Qué quieres hacer?', valor: modo || 'conteo', vacio: false, opciones: [
      { valor: 'conteo', texto: 'Contar lo que hay (corregir el stock)' }, { valor: 'merma', texto: 'Registrar una pérdida (se dañó, venció, se cayó)' }] });
    var cual = Form.seleccion({ etiqueta: 'Insumo o producto', valor: sujeto || opciones[0].valor, vacio: false, opciones: opciones });
    var cant = Form.numero({ etiqueta: 'Cantidad', tipo: 'numero', valor: null, requerido: true });
    var unidad = Form.seleccion({ etiqueta: 'Unidad', valor: 'g', vacio: false, opciones: [{ valor: 'g', texto: 'g' }] });
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: F.hoy() });
    var motivo = Form.texto({ etiqueta: 'Motivo (opcional)', valor: '', maxlength: 80, placeholder: 'Ej. Se dañó la nevera' });
    var vista = h('div', { class: 'aviso info', 'aria-live': 'polite' });
    var textoPista = h('p', { class: 'explicacion' });
    function pista() { textoPista.textContent = tipo.get() === 'conteo' ? 'Escribe cuánto hay en realidad (lo que contaste). La app calcula la diferencia.' : 'Escribe cuánto se perdió. Se descuenta del inventario y queda como pérdida.'; }
    pista();
    var errores = h('div');
    var stock = A.stockInsumos(doc), stockP = A.stockProductos(doc);

    function sel() {
      var v = cual.get() || '';
      var esProd = v.indexOf('p:') === 0, id = v.slice(2);
      var obj = esProd ? d.recetas.filter(function (r) { return r.id === id; })[0] : d.insumos.filter(function (i) { return i.id === id; })[0];
      return { esProd: esProd, id: id, obj: obj };
    }
    function ub(s) { return s.esProd ? 'und' : (s.obj ? s.obj.unidadBase : 'g'); }
    function actualizarUnidades() {
      var s = sel(); if (!s.obj) return;
      var base = ub(s);
      var us = U.unidadesCompatibles(base);
      unidad.opciones(us.map(function (u) { return { valor: u, texto: u }; }), base);
      actualizarVista();
    }
    function cantidadBase() {
      var s = sel(), v = cant.get();
      if (!s.obj || v === null || isNaN(v)) return null;
      var r = U.intentarConvertir(v, unidad.get(), ub(s));
      return r.ok ? r.valor : null;
    }
    function actualizarVista() {
      App.Dom.limpiar(vista);
      var s = sel(); if (!s.obj) return;
      var base = ub(s), actual = (s.esProd ? stockP[s.id] : stock[s.id]) || 0, cb = cantidadBase();
      var costo = s.esProd ? (ctx.receta(s.id) || {}).costoProd : ctx.costoBase(s.id);
      vista.appendChild(h('div', null, 'La app tiene registrado: ', h('strong', null, verCant(actual, base))));
      if (cb === null) return;
      var delta = tipo.get() === 'merma' ? -Math.abs(cb) : cb - actual;
      if (Math.abs(delta) < 1e-9) { vista.appendChild(h('div', null, 'Sin diferencia: no hay nada que ajustar.')); return; }
      vista.appendChild(h('div', null, (delta < 0 ? 'Se descontarán ' : 'Se sumarán '), h('strong', null, verCant(Math.abs(delta), base)),
        costo !== null && costo !== undefined ? ' (valor aproximado ' + F.cop(Math.abs(delta) * costo) + ')' : '', '. Quedarían ', h('strong', null, verCant(actual + delta, base)), '.'));
    }
    cual.alCambiar(actualizarUnidades); unidad.alCambiar(actualizarVista); cant.alCambiar(actualizarVista); tipo.alCambiar(function () { pista(); actualizarVista(); });
    actualizarUnidades();

    function guardar() {
      var s = sel(), v = cant.get(), errs = {};
      if (!s.obj) errs.cant = 'Elige qué quieres ajustar.';
      if (v === null || isNaN(v) || v < 0) errs.cant = tipo.get() === 'conteo' ? 'Escribe cuánto hay en realidad (0 si no queda nada).' : 'Escribe la cantidad perdida (mayor que 0).';
      else if (tipo.get() === 'merma' && v === 0) errs.cant = 'La cantidad perdida debe ser mayor que 0.';
      var cb = cantidadBase();
      if (!errs.cant && cb === null) errs.cant = 'Esa unidad no es compatible.';
      if (!F.esFechaISO(fecha.get())) errs.fecha = 'Fecha inválida.';
      if (Comun.mostrarErroresForm({ cant: cant, fecha: fecha }, { errores: errs }, errores)) return;
      var actual = (s.esProd ? stockP[s.id] : stock[s.id]) || 0;
      var delta = tipo.get() === 'merma' ? -Math.abs(cb) : cb - actual;
      if (Math.abs(delta) < 1e-9) { App.Toast.ok('No había diferencia, no se cambió nada.'); m.cerrar(); return; }
      var costo = s.esProd ? (ctx.receta(s.id) || {}).costoProd : ctx.costoBase(s.id);
      E.mutar(function (dd) {
        var o = { fecha: fecha.get(), tipo: tipo.get() === 'merma' ? 'merma' : 'ajuste', cantidadBase: delta, costoBase: costo || 0, motivo: motivo.get() || (tipo.get() === 'conteo' ? 'Conteo físico' : '') };
        if (s.esProd) o.productoId = s.id; else o.insumoId = s.id;
        O.movimientoInventarioManual(dd, o);
      });
      App.Toast.ok(tipo.get() === 'merma' ? 'Pérdida registrada.' : 'Inventario corregido.');
      m.cerrar();
    }
    var m = App.Modal.abrir({
      titulo: 'Ajustar inventario', tamano: 'chico', contenido: h('div', { class: 'pila' }, tipo.el, cual.el, textoPista, Form.rejilla([cant, unidad, fecha]), motivo.el, vista, errores),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar')]
    });
  }

  /** Cargar el stock de varios insumos de una vez (útil al empezar). */
  function abrirConteoMasivo() {
    var doc = E.doc(), d = doc.datos, stock = A.stockInsumos(doc), ctx = E.ctx();
    var lista = d.insumos.filter(function (i) { return !i.archivado; }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    if (!lista.length) { App.Modal.aviso('Primero crea tus insumos', 'Para cargar tu inventario necesitas tener insumos creados.').then(function () { App.Router.ir('insumos'); }); return; }
    var fecha = Form.fecha({ etiqueta: 'Fecha del conteo', valor: F.hoy() });
    var campos = lista.map(function (i) {
      var c = Form.numero({ etiqueta: i.nombre + ' (' + i.unidadBase + ')', tipo: 'numero', valor: null, placeholder: 'Hay ' + F.cantidad(stock[i.id] || 0) });
      return { ins: i, campo: c };
    });
    var m = App.Modal.abrir({
      titulo: 'Conteo de inventario', tamano: 'ancho',
      contenido: h('div', { class: 'pila' },
        h('p', { class: 'explicacion' }, 'Escribe cuánto tienes de verdad de cada insumo, en su unidad base (g, ml o und). Deja en blanco los que no quieres tocar. La app calcula la diferencia contra lo registrado y la guarda como «ajuste por conteo».'),
        fecha.el, Form.rejilla(campos.map(function (x) { return x.campo; }))),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var cambios = [], hayError = false;
        campos.forEach(function (x) {
          var v = x.campo.get(); x.campo.error('');
          if (v === null) return;
          if (isNaN(v) || v < 0) { x.campo.error('Escribe un número igual o mayor que 0.'); hayError = true; return; }
          var delta = v - (stock[x.ins.id] || 0);
          if (Math.abs(delta) > 1e-9) cambios.push({ ins: x.ins, delta: delta });
        });
        if (hayError) return;
        if (!F.esFechaISO(fecha.get())) { fecha.error('Fecha inválida.'); return; }
        if (!cambios.length) { App.Toast.ok('No hay diferencias que guardar.'); m.cerrar(); return; }
        E.mutar(function (dd) {
          cambios.forEach(function (c) { O.movimientoInventarioManual(dd, { fecha: fecha.get(), insumoId: c.ins.id, tipo: 'ajuste', cantidadBase: c.delta, costoBase: ctx.costoBase(c.ins.id) || 0, motivo: 'Conteo físico' }); });
        });
        App.Toast.ok('Conteo guardado: ' + cambios.length + (cambios.length === 1 ? ' insumo ajustado.' : ' insumos ajustados.'));
        m.cerrar();
      } }, 'Guardar conteo')]
    });
  }

  // ---------------- Pestañas ----------------
  function renderInsumos(cont, stock, ctx, ult) {
    var doc = E.doc(), d = doc.datos;
    var lista = d.insumos.filter(function (i) { return !i.archivado; });
    if (!lista.length) {
      cont.appendChild(Comun.vacio({ emoji: '📦', titulo: 'Aún no tienes insumos', texto: 'Crea tus insumos y registra tus compras: el inventario se llena solo.', acciones: [Comun.boton('Ir a Insumos', { primario: true, onclick: function () { App.Router.ir('insumos'); } })] }));
      return;
    }
    var cats = {}; lista.forEach(function (i) { cats[i.categoria] = 1; });
    var est = Form.seleccion({ etiqueta: 'Estado', valor: filtroEstado, vacio: 'Todos', opciones: [{ valor: 'bajo', texto: 'Stock bajo' }, { valor: 'sin', texto: 'Sin stock' }, { valor: 'negativo', texto: 'Negativo' }, { valor: 'ok', texto: 'Bien' }] });
    var cat = Form.seleccion({ etiqueta: 'Categoría', valor: filtroCat, vacio: 'Todas', opciones: Object.keys(cats).sort().map(function (c) { return { valor: c, texto: c }; }) });
    est.alCambiar(function () { filtroEstado = est.get(); App.Router.refrescar(); });
    cat.alCambiar(function () { filtroCat = cat.get(); App.Router.refrescar(); });
    var prov = {}; d.proveedores.forEach(function (p) { prov[p.id] = p.nombre; });
    var filas = lista.filter(function (i) { return (!filtroCat || i.categoria === filtroCat) && (!filtroEstado || estadoStock(i, stock[i.id] || 0).clave === filtroEstado); });
    var tabla = App.Tabla.crear({
      etiqueta: 'Inventario de insumos', filas: filas, estado: estIns, orden: { col: 'nombre', dir: 1 }, placeholderBusqueda: 'Buscar insumo…', herramientas: h('div', { class: 'fila' }, est.el, cat.el),
      buscarEn: function (i) { return i.nombre + ' ' + i.categoria + ' ' + (prov[i.proveedorIdPreferido] || ''); },
      columnas: [
        { id: 'nombre', titulo: 'Insumo', valor: function (i) { return i.nombre; }, render: function (i) { return h('span', null, h('strong', null, i.nombre), ' ', Comun.ejemplo(i), h('div', { class: 'small muted' }, i.categoria)); } },
        { id: 'stock', titulo: 'Stock', clase: 'num', valor: function (i) { return stock[i.id] || 0; }, render: function (i) { return h('strong', null, verCant(stock[i.id] || 0, i.unidadBase)); } },
        { id: 'min', titulo: 'Mínimo', clase: 'num', valor: function (i) { return i.stockMinimo; }, render: function (i) { return i.stockMinimo > 0 ? verCant(i.stockMinimo, i.unidadBase) : '—'; } },
        { id: 'estado', titulo: 'Estado', valor: function (i) { return estadoStock(i, stock[i.id] || 0).texto; }, render: function (i) { var e = estadoStock(i, stock[i.id] || 0); return h('span', { class: 'insignia ' + e.clase, title: e.ayuda }, e.texto); } },
        { id: 'costo', titulo: 'Costo por unidad', clase: 'num', valor: function (i) { return ctx.costoBase(i.id) || 0; }, render: function (i) { var cb = ctx.costoBase(i.id); return cb === null ? '—' : Comun.costoUnidad(cb) + ' / ' + i.unidadBase; } },
        { id: 'valor', titulo: 'Valor', clase: 'num', valor: function (i) { var cb = ctx.costoBase(i.id); return cb !== null && (stock[i.id] || 0) > 0 ? stock[i.id] * cb : 0; }, render: function (i) { var cb = ctx.costoBase(i.id), s = stock[i.id] || 0; return cb !== null && s > 0 ? F.cop(s * cb) : '—'; } },
        { id: 'prov', titulo: 'Proveedor', valor: function (i) { return prov[i.proveedorIdPreferido] || ''; }, render: function (i) { return prov[i.proveedorIdPreferido] || '—'; } },
        { id: 'ult', titulo: 'Última compra', valor: function (i) { return ult[i.id] || ''; }, render: function (i) { return ult[i.id] ? F.fecha(ult[i.id]) : '—'; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (i) {
          return h('span', { class: 'grupo-botones derecha' }, Comun.boton('Contar', { chico: true, onclick: function () { abrirMovimiento('conteo', 'i:' + i.id); } }), Comun.boton('Pérdida', { chico: true, onclick: function () { abrirMovimiento('merma', 'i:' + i.id); } }));
        } }
      ],
      pie: function (f) { var t = 0; f.forEach(function (i) { var cb = ctx.costoBase(i.id), s = stock[i.id] || 0; if (cb !== null && s > 0) t += s * cb; }); return [h('td', { colspan: 5 }, h('strong', null, 'Valor de lo que se ve en la lista')), h('td', { class: 'num' }, h('strong', null, F.cop(t))), h('td', { colspan: 3 })]; }
    });
    cont.appendChild(tabla.el);
  }

  function renderTerminados(cont, ctx) {
    var doc = E.doc(), d = doc.datos, stockP = A.stockProductos(doc);
    var lista = d.recetas.filter(function (r) { return !r.archivado && r.tipo !== 'preparacion'; });
    if (!lista.length) { cont.appendChild(Comun.vacio({ emoji: '🍔', titulo: 'No tienes productos', texto: 'Crea un producto para poder registrar su producción.' })); return; }
    cont.appendChild(Comun.aviso('info', 'En el modo por lotes, producir un lote gasta insumos y suma producto terminado; entregar un pedido descuenta producto terminado. Registra los lotes en «Producción y compras».'));
    cont.appendChild(App.Tabla.crear({
      etiqueta: 'Producto terminado', filas: lista, estado: estProd, orden: { col: 'nombre', dir: 1 }, placeholderBusqueda: 'Buscar producto…', buscarEn: function (r) { return r.nombre; },
      columnas: [
        { id: 'nombre', titulo: 'Producto', valor: function (r) { return r.nombre; }, render: function (r) { return h('span', null, Comun.iconoProducto(r.emoji, r.color), ' ', h('strong', null, r.nombre), ' ', Comun.ejemplo(r)); } },
        { id: 'stock', titulo: 'Disponible', clase: 'num', valor: function (r) { return stockP[r.id] || 0; }, render: function (r) { var s = stockP[r.id] || 0; return h('strong', { class: s < 0 ? 'negativo' : '' }, F.cantidad(s) + ' und'); } },
        { id: 'costo', titulo: 'Costo de producción', clase: 'num', valor: function (r) { return (ctx.receta(r.id) || {}).costoProd || 0; }, render: function (r) { var x = ctx.receta(r.id); return x && x.costoProd !== null ? F.cop(x.costoProd) : '—'; } },
        { id: 'valor', titulo: 'Valor', clase: 'num', valor: function (r) { return Math.max(stockP[r.id] || 0, 0) * ((ctx.receta(r.id) || {}).costoProd || 0); }, render: function (r) { var s = stockP[r.id] || 0, x = ctx.receta(r.id); return s > 0 && x && x.costoProd !== null ? F.cop(s * x.costoProd) : '—'; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (r) { return h('span', { class: 'grupo-botones derecha' }, Comun.boton('Contar', { chico: true, onclick: function () { abrirMovimiento('conteo', 'p:' + r.id); } }), Comun.boton('Pérdida', { chico: true, onclick: function () { abrirMovimiento('merma', 'p:' + r.id); } })); } }
      ]
    }).el);
  }

  function renderMovimientos(cont) {
    var doc = E.doc(), d = doc.datos;
    var selP = Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['todo', 'Todo'], ['rango', 'Personalizado']] });
    var tipo = Form.seleccion({ etiqueta: 'Tipo', valor: filtroMov, vacio: 'Todos', opciones: Object.keys(ETIQUETA_MOV).map(function (k) { return { valor: k, texto: ETIQUETA_MOV[k] }; }) });
    tipo.alCambiar(function () { filtroMov = tipo.get(); App.Router.refrescar(); });
    var nom = {}; d.insumos.forEach(function (i) { nom[i.id] = i; }); d.recetas.forEach(function (r) { nom[r.id] = r; });
    var filas = d.movInventario.filter(function (m) { return m.fecha >= estPeriodo.desde && m.fecha <= estPeriodo.hasta && (!filtroMov || m.tipo === filtroMov); });
    cont.appendChild(h('div', { class: 'fila' }, selP, tipo.el));
    if (!d.movInventario.length) { cont.appendChild(Comun.vacio({ emoji: '🔁', titulo: 'Sin movimientos todavía', texto: 'Cada compra, venta entregada, pérdida o conteo aparece aquí.' })); return; }
    cont.appendChild(App.Tabla.crear({
      etiqueta: 'Movimientos de inventario', filas: filas, estado: estMov, orden: { col: 'fecha', dir: -1 }, placeholderBusqueda: 'Buscar movimiento…',
      buscarEn: function (m) { return ((nom[m.insumoId || m.productoId] || {}).nombre || '') + ' ' + (ETIQUETA_MOV[m.tipo] || '') + ' ' + (m.motivo || ''); },
      columnas: [
        { id: 'fecha', titulo: 'Fecha', valor: function (m) { return m.fecha; }, render: function (m) { return F.fecha(m.fecha); } },
        { id: 'item', titulo: 'Insumo / producto', valor: function (m) { return (nom[m.insumoId || m.productoId] || {}).nombre || ''; }, render: function (m) { return (nom[m.insumoId || m.productoId] || {}).nombre || h('span', { class: 'muted' }, '(eliminado)'); } },
        { id: 'tipo', titulo: 'Tipo', valor: function (m) { return ETIQUETA_MOV[m.tipo] || m.tipo; }, render: function (m) { return h('span', { class: 'insignia ' + (m.cantidadBase >= 0 ? 'ok' : '') }, ETIQUETA_MOV[m.tipo] || m.tipo); } },
        { id: 'cant', titulo: 'Cantidad', clase: 'num', valor: function (m) { return m.cantidadBase; }, render: function (m) {
          var o = nom[m.insumoId || m.productoId], ub = m.productoId ? 'und' : (o ? o.unidadBase : '');
          return h('strong', { class: m.cantidadBase < 0 ? 'negativo' : 'positivo' }, (m.cantidadBase > 0 ? '+' : '') + verCant(m.cantidadBase, ub));
        } },
        { id: 'val', titulo: 'Valor aprox.', clase: 'num', valor: function (m) { return Math.abs(m.cantidadBase * (m.costoBase || 0)); }, render: function (m) { return m.costoBase ? F.cop(Math.abs(m.cantidadBase * m.costoBase)) : '—'; } },
        { id: 'nota', titulo: 'Detalle', valor: function (m) { return m.motivo || ''; }, render: function (m) { return m.motivo || (m.manual ? '' : h('span', { class: 'small muted' }, 'Automático')); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (m) {
          if (!m.manual) return null;
          return Comun.botonIcono('trash', 'Eliminar este ajuste', function () {
            App.Modal.confirmar({ titulo: 'Eliminar ajuste', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar este ajuste? El stock vuelve a lo que había antes de registrarlo.' }).then(function (ok) { if (ok) E.mutar(function (dd) { O.eliminarDocumento(dd, 'movInventario', m.id); }, { deshacer: 'Ajuste eliminado.' }); });
          });
        } }
      ]
    }).el);
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx(), stock = A.stockInsumos(doc), ult = A.ultimaCompraPorInsumo(doc);
    var conProd = doc.config.modoInventario === 'conProduccion';
    if (!conProd && pestana === 'terminados') pestana = 'insumos';
    var valorInsumos = A.valorInventario(doc, ctx, stock), valorTerminados = 0;
    if (conProd) {
      var stockPT = A.stockProductos(doc);
      d.recetas.forEach(function (r) { var rc = ctx.receta(r.id), s = stockPT[r.id] || 0; if (r.tipo !== 'preparacion' && s > 0 && rc && rc.costoProd !== null) valorTerminados += s * rc.costoProd; });
    }
    var valor = valorInsumos + valorTerminados;
    var activos = d.insumos.filter(function (i) { return !i.archivado; });
    var bajos = A.insumosStockBajo(doc, stock).filter(function (i) { return (stock[i.id] || 0) > 1e-9; });
    var sin = activos.filter(function (i) { return (stock[i.id] || 0) <= 1e-9; });
    var negativos = activos.filter(function (i) { return (stock[i.id] || 0) < -1e-9; });
    cont.appendChild(Comun.cabecera({
      titulo: 'Inventario', descripcion: conProd ? 'Modo por lotes: producir gasta insumos, vender descuenta producto terminado.' : 'Modo sencillo: al entregar un pedido se descuentan los insumos usados. Las compras los suman.',
      acciones: [Comun.boton('Conteo de inventario', { icono: 'clipboard', primario: true, onclick: abrirConteoMasivo }), Comun.boton('Registrar pérdida', { onclick: function () { abrirMovimiento('merma'); } }),
        Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.inventario(); } })]
    }));
    cont.appendChild(h('div', { class: 'rejilla kpis' },
      Comun.kpi({ titulo: 'Valor del inventario', valor: F.cop(valor), nota: conProd ? 'Insumos ' + F.cop(valorInsumos) + ' + terminados ' + F.cop(valorTerminados) : null, ayuda: 'Cantidad en stock × costo actual por unidad. Solo cuenta lo que tiene stock positivo.' }),
      Comun.kpi({ titulo: 'Stock bajo', valor: String(bajos.length), clase: bajos.length ? 'aviso' : '', nota: 'En o bajo el mínimo' }),
      Comun.kpi({ titulo: 'Sin stock', valor: String(sin.length), clase: sin.length ? 'aviso' : '', nota: 'de ' + activos.length + ' insumos' })));
    if (negativos.length) cont.appendChild(Comun.aviso('warn', negativos.length + (negativos.length === 1 ? ' insumo tiene' : ' insumos tienen') + ' stock negativo (' + negativos.slice(0, 4).map(function (i) { return i.nombre; }).join(', ') + (negativos.length > 4 ? '…' : '') + '). Significa que se descontó más de lo registrado: falta una compra o un conteo. Usa «Conteo de inventario» para corregirlo.'));
    else if (activos.length && !d.movInventario.length) cont.appendChild(Comun.aviso('info', '¿Ya tenías insumos antes de usar la app? Usa «Conteo de inventario» para cargar lo que tienes hoy. Desde ahí, las compras suman y las ventas entregadas descuentan.'));
    var tabs = [['insumos', 'Insumos']].concat(conProd ? [['terminados', 'Producto terminado']] : [], [['movimientos', 'Movimientos']]);
    cont.appendChild(h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Secciones del inventario' }, tabs.map(function (t) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(pestana === t[0]), onclick: function () { pestana = t[0]; App.Router.refrescar(); } }, t[1]);
    })));
    if (pestana === 'insumos') renderInsumos(cont, stock, ctx, ult);
    else if (pestana === 'terminados') renderTerminados(cont, ctx);
    else renderMovimientos(cont);
  }

  App.InventarioVista = { abrirMovimiento: abrirMovimiento, abrirConteoMasivo: abrirConteoMasivo, verCant: verCant };
  App.registrarVista('inventario', { titulo: 'Inventario', render: render });
})(typeof self !== 'undefined' ? self : this);
