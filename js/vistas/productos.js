/* Productos, preparaciones y combos: lista, editor de recetas con costo en vivo, ficha de rentabilidad por canal,
   simulador «¿y si?» y calculadora de lote. Todas las cuentas salen de App.Calculos; aquí solo se dibuja. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, M = App.Modelo, U = App.Unidades, O = App.Operaciones;
  var Form = App.Form, Comun = App.Comun, V = App.Validacion;

  var estLista = {}, tipoLista = 'producto', canalLista = '', verArchivados = false;
  var borradores = {}; // sesiones de edición sin guardar, por clave
  var EMOJIS = ['🍔', '🥪', '🌮', '🍕', '🍟', '🥗', '🍝', '🍰', '🧁', '🍪', '🥤', '🍗', '🥟', '🍜', '🥘', '🍩'];
  var NOMBRE_TIPO = { producto: 'Producto', preparacion: 'Preparación', combo: 'Combo' };

  root.addEventListener('hashchange', function () {
    var hash = root.location.hash;
    Object.keys(borradores).forEach(function (k) {
      var dest = k.indexOf('nuevo:') === 0 ? '#/productos/nuevo/' + k.slice(6) : '#/productos/' + k;
      if (hash !== dest && hash.indexOf(dest + '/') !== 0) delete borradores[k];
    });
  });

  var CLASE_IND = { costoError: 'error', contribNegativa: 'error', margenBajo: 'aviso', precioBajo: 'aviso', sinPrecio: 'info' };
  var CORTO_IND = { costoError: 'Receta con errores', contribNegativa: 'Pierdes dinero', margenBajo: 'Margen bajo', precioBajo: 'Precio bajo el recomendado', sinPrecio: 'Sin precio' };
  function insigniasInd(res) {
    if (!res) return null;
    if (!res.indicadores.length) return h('span', { class: 'insignia ok' }, 'Saludable');
    return h('span', { class: 'fila', style: { gap: '.3rem' } }, res.indicadores.map(function (i) {
      return h('span', { class: 'insignia ' + (CLASE_IND[i.id] || ''), title: i.texto }, CORTO_IND[i.id] || i.texto);
    }));
  }

  function irAEditor(id) { root.location.hash = '#/productos/' + id; }
  function nuevo(tipo) { root.location.hash = '#/productos/nuevo/' + tipo; }

  // ======================================================================
  // LISTA
  // ======================================================================
  function renderLista(cont) {
    var doc = E.doc(), ctx = E.ctx(), d = doc.datos;
    var esPrep = tipoLista === 'preparacion';
    var singular = { producto: 'producto', preparacion: 'preparación', combo: 'combo' }[tipoLista];

    cont.appendChild(Comun.cabecera({
      titulo: 'Productos y preparaciones', descripcion: 'Aquí armas tus recetas y ves cuánto ganas con cada producto. Una preparación (salsa, masa…) se puede usar dentro de varios productos.',
      acciones: [
        Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { if (esPrep) App.Exportar.recetas(); else App.Exportar.productos(); } }),
        Comun.boton('Nuevo ' + singular, { primario: true, icono: 'plus', onclick: function () { nuevo(tipoLista); } })]
    }));

    var seg = h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Tipo' }, [['producto', 'Productos'], ['preparacion', 'Preparaciones'], ['combo', 'Combos']].map(function (par) {
      var n = d.recetas.filter(function (r) { return r.tipo === par[0] && !r.archivado; }).length;
      return h('button', { type: 'button', 'aria-pressed': String(tipoLista === par[0]), onclick: function () { tipoLista = par[0]; estLista = {}; App.Router.refrescar(); } }, par[1] + ' (' + n + ')');
    }));
    cont.appendChild(h('div', { class: 'fila', style: { marginBottom: '.75rem' } }, seg));

    var todas = d.recetas.filter(function (r) { return r.tipo === tipoLista; });
    var filas = todas.filter(function (r) { return verArchivados || !r.archivado; });

    if (!todas.length) {
      var textos = {
        producto: ['🍔', 'Crea tu primer producto', 'Un producto es lo que vendes (una hamburguesa, un almuerzo). Agrega sus ingredientes y la app calcula cuánto te cuesta y cuánto ganas.'],
        preparacion: ['🥣', 'Aún no tienes preparaciones', 'Úsalas para lo que haces en tandas y reutilizas: una salsa, una masa, un sofrito. Su costo se reparte en los productos que la usan.'],
        combo: ['🍱', 'Aún no tienes combos', 'Un combo junta varios de tus productos con un solo precio.']
      }[tipoLista];
      var sinInsumos = tipoLista !== 'combo' && !d.insumos.length;
      cont.appendChild(Comun.vacio({
        emoji: textos[0], titulo: textos[1], texto: textos[2] + (sinInsumos ? ' Primero crea los insumos que usas.' : ''),
        acciones: sinInsumos ? [Comun.boton('Crear mis insumos', { primario: true, icono: 'box', onclick: function () { App.Router.ir('insumos'); } })]
          : [Comun.boton('Crear ' + singular, { primario: true, icono: 'plus', onclick: function () { nuevo(tipoLista); } })]
      }));
      return;
    }

    var arch = Form.casilla({ etiqueta: 'Mostrar archivados', valor: verArchivados });
    arch.alCambiar(function () { verArchivados = arch.get(); App.Router.refrescar(); });
    var herr = [arch.el];
    var canal = null;

    var columnas;
    if (esPrep) {
      columnas = [
        { id: 'nombre', titulo: 'Preparación', valor: function (r) { return r.nombre; }, render: function (r) { return nombreCelda(r); } },
        { id: 'rinde', titulo: 'Rinde', ordenable: false, render: function (r) { return F.cantidad(r.rinde) + ' ' + r.unidadRinde; } },
        { id: 'total', titulo: 'Costo total', clase: 'num', valor: function (r) { return ctx.receta(r.id).costoTotal; }, render: function (r) { var rc = ctx.receta(r.id); return rc.costoTotal === null ? errorCosto(rc) : F.cop(rc.costoTotal); } },
        { id: 'unit', titulo: 'Costo por unidad', clase: 'num', valor: function (r) { return ctx.receta(r.id).costoProd; }, render: function (r) { var rc = ctx.receta(r.id); return rc.costoProd === null ? '—' : Comun.costoUnidad(rc.costoProd) + ' / ' + r.unidadRinde; } },
        { id: 'uso', titulo: 'Usada en', ordenable: false, render: function (r) { var u = O.usoDeEntidad(doc, 'recetas', r.id).recetas; return u.length ? u.map(function (x) { return x.nombre; }).join(', ') : h('span', { class: 'muted' }, 'Ninguno todavía'); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: accionesFila }
      ];
    } else {
      var canales = d.canales.filter(function (c) { return !c.archivado; });
      canal = canales.filter(function (c) { return c.id === canalLista; })[0] || A.canalPorDefecto(doc);
      if (canales.length) {
        var selCanal = Form.seleccion({ etiqueta: 'Ver rentabilidad en el canal', valor: canal ? canal.id : '', vacio: false, opciones: canales.map(function (c) { return { valor: c.id, texto: c.nombre + (c.comisionPct > 0 ? ' (' + F.pct(c.comisionPct, 1) + ' comisión)' : '') }; }) });
        selCanal.alCambiar(function () { canalLista = selCanal.get(); App.Router.refrescar(); });
        herr.push(selCanal.el);
      }
      var res = function (r) { return C.resultadoProducto(ctx, r.id, canal ? canal.id : null); };
      columnas = [
        { id: 'nombre', titulo: 'Producto', valor: function (r) { return r.nombre; }, render: function (r) { return nombreCelda(r); } },
        { id: 'costo', titulo: 'Costo', clase: 'num', valor: function (r) { return ctx.receta(r.id).costoProd; }, render: function (r) { var rc = ctx.receta(r.id); return rc.costoProd === null ? errorCosto(rc) : F.cop(rc.costoProd + rc.fijosAdic); } },
        { id: 'precio', titulo: 'Precio', clase: 'num', valor: function (r) { return res(r).precioPublico; }, render: function (r) { var x = res(r); return x.precioPublico > 0 ? F.cop(x.precioPublico) : h('span', { class: 'muted' }, 'Sin precio'); } },
        { id: 'gan', titulo: 'Ganancia', clase: 'num', valor: function (r) { return res(r).ganancia; }, render: function (r) { var x = res(r); return h('span', { class: x.ganancia < 0 ? 'negativo' : 'positivo' }, F.cop(x.ganancia, { decimales: Math.abs(x.ganancia) < 100 && x.ganancia !== 0 ? 2 : 0 })); } },
        { id: 'margen', titulo: 'Margen', clase: 'num', valor: function (r) { return res(r).margen; }, render: function (r) { var x = res(r); return x.margen === null ? '—' : F.pct(x.margen, 1); } },
        { id: 'sobre', titulo: '% sobre el costo', clase: 'num', valor: function (r) { return res(r).pctSobreCosto; }, render: function (r) { var x = res(r); return x.pctSobreCosto === null ? '—' : F.pct(x.pctSobreCosto, 1); } },
        { id: 'rec', titulo: 'Precio recomendado', clase: 'num', ordenable: false, render: function (r) { var x = res(r); return x.recomendado.ok ? F.cop(x.recomendado.precioPublico || x.recomendado.precio) : h('span', { class: 'muted', title: x.recomendado.mensaje }, 'No hay'); } },
        { id: 'est', titulo: 'Estado', ordenable: false, render: function (r) { return insigniasInd(res(r)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: accionesFila }
      ];
    }

    function nombreCelda(r) {
      return h('span', { class: 'fila', style: { flexWrap: 'nowrap' } }, Comun.iconoProducto(r.emoji, r.color),
        h('span', null, h('strong', null, r.nombre), ' ', Comun.ejemplo(r), r.archivado ? h('span', { class: 'insignia' }, 'Archivado') : null, r.categoria ? h('div', { class: 'small muted' }, r.categoria) : null));
    }
    function errorCosto(rc) { return h('span', { class: 'insignia error', title: (rc.errores || []).join('. ') }, 'Revisar'); }
    function accionesFila(r) {
      return h('span', { class: 'grupo-botones derecha' },
        Comun.botonIcono('edit', 'Editar ' + r.nombre, function () { irAEditor(r.id); }),
        Comun.botonIcono('copy', 'Duplicar ' + r.nombre, function () { E.mutar(function (dd) { O.duplicarReceta(dd, r.id); }); App.Toast.ok('Copia creada.'); }),
        r.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + r.nombre, function () { Comun.restaurarEntidad('recetas', r.id); })
          : Comun.botonIcono('archive', 'Archivar ' + r.nombre, function () { Comun.archivarEntidad('recetas', r.id, singular); }));
    }

    var tabla = App.Tabla.crear({
      etiqueta: 'Lista de ' + singular + 's', columnas: columnas, filas: filas, estado: estLista, buscarEn: function (r) { return r.nombre + ' ' + (r.categoria || ''); },
      placeholderBusqueda: 'Buscar…', orden: { col: 'nombre', dir: 1 }, onFila: function (r) { irAEditor(r.id); },
      clasesFila: function (r) { return r.archivado ? 'archivada' : ''; }, herramientas: h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, herr)
    });
    cont.appendChild(tabla.el);
    if (!esPrep) cont.appendChild(h('p', { class: 'explicacion', style: { marginTop: '.75rem' } },
      'La ganancia y el margen incluyen el costo de los ingredientes, los costos adicionales y la comisión del canal elegido. «Margen» es lo que te queda de cada $ 100 cobrados; «% sobre el costo» es cuánto ganas por cada peso que te cuesta.'));
  }

  // ======================================================================
  // EDITOR
  // ======================================================================
  function docBorrador(doc, d) {
    var idB = d.id || '__nuevo__';
    var copia = Object.assign({}, d, { id: idB });
    var recetas = doc.datos.recetas.filter(function (r) { return r.id !== idB; }).concat([copia]);
    return { doc: { config: doc.config, datos: Object.assign({}, doc.datos, { recetas: recetas }) }, id: idB };
  }

  function etiquetar(campo, texto) { campo.input.setAttribute('aria-label', texto); return campo; }
  function celda(etq, nodo) { return h('div', { class: 'celda' }, h('span', { class: 'etq-movil' }, etq), nodo); }

  function renderEditor(cont, params) {
    var doc = E.doc(), dd0 = doc.datos;
    var esNuevo = params.id === 'nuevo';
    var tipoNuevo = ['producto', 'preparacion', 'combo'].indexOf(params.resto[0]) >= 0 ? params.resto[0] : 'producto';
    var key = esNuevo ? 'nuevo:' + tipoNuevo : params.id;
    var existente = esNuevo ? null : O.buscar(dd0.recetas, params.id);
    if (!esNuevo && !existente) {
      cont.appendChild(Comun.vacio({ emoji: '🔎', titulo: 'No encontré este producto', texto: 'Puede que lo hayas eliminado.', acciones: [Comun.boton('Volver a la lista', { primario: true, onclick: function () { App.Router.ir('productos'); } })] }));
      return;
    }
    var sesion = borradores[key];
    if (!sesion) {
      var inicial = existente ? O.clonar(existente) : M.nuevaReceta({ tipo: tipoNuevo });
      sesion = borradores[key] = { d: inicial, dirty: false, tab: existente && inicial.tipo !== 'preparacion' ? 'rentabilidad' : 'receta' };
    }
    var d = sesion.d, tipo = d.tipo, esPrep = tipo === 'preparacion', esCombo = tipo === 'combo';
    var cfg = doc.config;

    var ui = { filas: [], costoCeldas: [], adic: [] };
    var ultimo = { ctx: null, rc: null, b: null };
    var chart = null;

    // ---------- barra de guardado ----------
    var estadoGuardar = h('span', { class: 'estado', role: 'status' });
    function marcarSucio() { sesion.dirty = true; estadoGuardar.textContent = 'Cambios sin guardar'; recalcularPronto(); }
    estadoGuardar.textContent = sesion.dirty ? 'Cambios sin guardar' : (existente ? 'Todo guardado' : 'Aún no se ha guardado');

    // ---------- datos básicos ----------
    var nombre = Form.texto({ etiqueta: esPrep ? 'Nombre de la preparación' : esCombo ? 'Nombre del combo' : 'Nombre del producto', valor: d.nombre, requerido: true, maxlength: 60, placeholder: esPrep ? 'Ej. Salsa de la casa' : 'Ej. Hamburguesa de lentejas' });
    var categoria = Form.texto({ etiqueta: 'Categoría (opcional)', valor: d.categoria, maxlength: 40, placeholder: 'Ej. Hamburguesas' });
    var listaCats = h('datalist', { id: 'lista-categorias' }, Object.keys(dd0.recetas.reduce(function (a, r) { if (r.categoria) a[r.categoria] = 1; return a; }, {})).map(function (c) { return h('option', { value: c }); }));
    categoria.input.setAttribute('list', 'lista-categorias');
    var emoji = Form.texto({ etiqueta: 'Ícono', valor: d.emoji, maxlength: 8 });
    var color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#e07a1f', 'aria-label': 'Color del producto' });
    var descripcion = Form.area({ etiqueta: 'Descripción (opcional)', valor: d.descripcion, filas: 2, maxlength: 400 });
    var rinde = esCombo ? null : Form.numero({
      etiqueta: esPrep ? '¿Cuánto rinde toda la preparación?' : '¿Cuántas unidades salen con estos ingredientes?', tipo: 'numero', valor: d.rinde, requerido: true,
      ayuda: esPrep ? 'Ej. 250 g de salsa. El costo por gramo sale de dividir el costo total entre este rendimiento.' : 'Si la receta es para 1 unidad, deja 1. Si es una tanda de 10, escribe 10 y pon los ingredientes de toda la tanda.'
    });
    var unidadRinde = esPrep ? Form.seleccion({ etiqueta: 'Unidad del rendimiento', valor: d.unidadRinde, vacio: false, opciones: Object.keys(U.UNIDADES).map(function (u) { return { valor: u, texto: U.UNIDADES[u].nombre }; }) }) : null;

    nombre.alCambiar(function () { d.nombre = nombre.get(); marcarSucio(); });
    categoria.alCambiar(function () { d.categoria = categoria.get(); marcarSucio(); });
    emoji.alCambiar(function () { d.emoji = emoji.get() || '🍽️'; marcarSucio(); });
    color.addEventListener('input', function () { d.color = color.value; marcarSucio(); });
    descripcion.alCambiar(function () { d.descripcion = descripcion.get(); marcarSucio(); });
    if (rinde) rinde.alCambiar(function () { var v = rinde.get(); d.rinde = v === null ? NaN : v; marcarSucio(); });
    if (unidadRinde) unidadRinde.alCambiar(function () { d.unidadRinde = unidadRinde.get(); pintarLineas(); marcarSucio(); });

    var picks = h('div', { class: 'emoji-opciones', role: 'group', 'aria-label': 'Íconos sugeridos' }, EMOJIS.map(function (e) {
      return h('button', { type: 'button', 'aria-label': 'Usar ' + e, onclick: function () { emoji.set(e); d.emoji = e; marcarSucio(); } }, e);
    }));

    // ---------- líneas ----------
    var cajaLineas = h('div', { class: 'lineas-receta' });
    var erroresLinea = {}; // índice → mensaje

    function opcionesItem(refTipo, actualId) {
      if (refTipo === 'insumo') return Comun.opcionesDe('insumos', { incluirId: actualId });
      if (refTipo === 'preparacion') return Comun.opcionesDe('recetas', { incluirId: actualId, filtro: function (r) { return r.tipo === 'preparacion' && r.id !== d.id; } });
      return Comun.opcionesDe('recetas', { incluirId: actualId, filtro: function (r) { return r.tipo === 'producto' && r.id !== d.id; } });
    }
    function unidadesDeLinea(l) {
      var todas = Object.keys(U.UNIDADES);
      if (l.refTipo === 'producto') return ['und'];
      var ref = l.refTipo === 'insumo' ? O.buscar(dd0.insumos, l.refId) : O.buscar(dd0.recetas, l.refId);
      if (!ref) return todas;
      var baseU = l.refTipo === 'insumo' ? ref.unidadBase : (ref.unidadRinde || 'g');
      var eqs = l.refTipo === 'insumo' ? ref.equivalencias : [];
      var ok = todas.filter(function (u) { return U.sePuedeConvertir(u, baseU, eqs); });
      return ok.length ? ok : todas;
    }
    function unidadPorDefecto(l) {
      if (l.refTipo === 'producto') return 'und';
      var ref = l.refTipo === 'insumo' ? O.buscar(dd0.insumos, l.refId) : O.buscar(dd0.recetas, l.refId);
      return ref ? (l.refTipo === 'insumo' ? ref.unidadBase : (ref.unidadRinde || 'g')) : 'g';
    }
    function placeholderMerma(l) {
      if (l.refTipo === 'insumo') { var ins = O.buscar(dd0.insumos, l.refId); return ins ? 'del insumo: ' + F.pct(ins.mermaPct, 1) : '0 %'; }
      return '0 %';
    }

    function filaLinea(l, i) {
      var etiquetaItem = l.refTipo === 'insumo' ? 'Insumo' : l.refTipo === 'preparacion' ? 'Preparación' : 'Producto';
      var item = etiquetar(Form.seleccion({ valor: l.refId || '', vacio: 'Elige…', opciones: opcionesItem(l.refTipo, l.refId) }), etiquetaItem + ' de la línea ' + (i + 1));
      var cant = Form.numero({ tipo: 'numero', valor: l.cantidad || null, ariaLabel: 'Cantidad de la línea ' + (i + 1) });
      var uni = etiquetar(Form.seleccion({ valor: l.unidad, vacio: false, opciones: unidadesDeLinea(l).map(function (u) { return { valor: u, texto: u }; }) }), 'Unidad de la línea ' + (i + 1));
      var merma = Form.numero({ tipo: 'porcentaje', valor: typeof l.mermaPct === 'number' ? l.mermaPct : null, placeholder: placeholderMerma(l), ariaLabel: 'Merma de la línea ' + (i + 1) });
      var costo = h('div', { class: 'costo-linea' }, '—');
      var msg = h('div', { class: 'error-texto', role: 'alert', hidden: true, style: { gridColumn: '1 / -1' } });
      var quitar = Comun.botonIcono('trash', 'Quitar la línea ' + (i + 1), function () { d.lineas.splice(i, 1); pintarLineas(); marcarSucio(); });
      var fila = h('div', { class: 'linea-receta' },
        celda(etiquetaItem, item.el), celda('Cantidad', cant.el), celda('Unidad', uni.el),
        l.refTipo === 'producto' ? celda('Merma', h('span', { class: 'muted small' }, '—')) : celda('Merma', merma.el),
        celda('Costo', costo), h('div', { class: 'celda' }, quitar), msg);

      item.alCambiar(function () {
        l.refId = item.get();
        var permitidas = unidadesDeLinea(l);
        if (permitidas.indexOf(l.unidad) < 0) l.unidad = unidadPorDefecto(l);
        uni.opciones(permitidas.map(function (u) { return { valor: u, texto: u }; }), l.unidad);
        merma.input.setAttribute('placeholder', placeholderMerma(l));
        marcarSucio();
      });
      cant.alCambiar(function () { var v = cant.get(); cant.error(v !== null && isNaN(v) ? 'No entiendo ese número.' : ''); l.cantidad = v === null || isNaN(v) ? 0 : v; marcarSucio(); });
      uni.alCambiar(function () { l.unidad = uni.get(); marcarSucio(); });
      merma.alCambiar(function () { var v = merma.get(); if (v === null) delete l.mermaPct; else l.mermaPct = isNaN(v) ? 0 : v; merma.error(v !== null && isNaN(v) ? 'No entiendo ese número.' : ''); marcarSucio(); });
      ui.filas[i] = { el: fila, msg: msg, item: item, cant: cant, merma: merma };
      ui.costoCeldas[i] = costo;
      return fila;
    }

    function pintarLineas() {
      App.Dom.limpiar(cajaLineas); ui.filas = []; ui.costoCeldas = [];
      if (!d.lineas.length) {
        cajaLineas.appendChild(h('p', { class: 'explicacion' }, esCombo ? 'Un combo se arma con productos que ya creaste. Agrega el primero.' : 'Todavía no hay ingredientes. Agrega el primero con los botones de abajo.'));
        return;
      }
      cajaLineas.appendChild(h('div', { class: 'cabecera-lineas', 'aria-hidden': 'true' }, [esCombo ? 'Producto' : 'Ingrediente', 'Cantidad', 'Unidad', 'Merma', 'Costo', ''].map(function (t) { return h('span', null, t); })));
      d.lineas.forEach(function (l, i) { cajaLineas.appendChild(filaLinea(l, i)); });
    }

    function agregarLinea(refTipo) {
      var l = M.nuevaLinea(refTipo, '', 0, refTipo === 'producto' ? 'und' : 'g');
      d.lineas.push(l);
      pintarLineas(); marcarSucio();
      var f = ui.filas[d.lineas.length - 1];
      if (f) f.item.focus();
    }

    var botonesAgregar = h('div', { class: 'grupo-botones' });
    if (esCombo) {
      botonesAgregar.appendChild(Comun.boton('Agregar producto', { icono: 'plus', onclick: function () { agregarLinea('producto'); } }));
    } else {
      botonesAgregar.appendChild(Comun.boton('Agregar insumo', { icono: 'plus', primario: !d.lineas.length, onclick: function () { agregarLinea('insumo'); } }));
      botonesAgregar.appendChild(Comun.boton('Agregar preparación', { icono: 'plus', onclick: function () { agregarLinea('preparacion'); }, disabled: !dd0.recetas.some(function (r) { return r.tipo === 'preparacion' && !r.archivado && r.id !== d.id; }), titulo: 'Una preparación es una salsa, masa u otra receta base' }));
      botonesAgregar.appendChild(Comun.boton('Crear insumo nuevo', { icono: 'box', fantasma: true, onclick: function () {
        App.InsumosVista.abrirEditor(null, function (nid) { var l = M.nuevaLinea('insumo', nid, 0, O.buscar(E.datos().insumos, nid).unidadBase); sesion.d.lineas.push(l); sesion.dirty = true; });
      } }));
    }

    // ---------- costos adicionales ----------
    var cajaAdic = h('div', { class: 'pila' });
    function pintarAdic() {
      App.Dom.limpiar(cajaAdic); ui.adic = [];
      (d.costosAdicionales || []).forEach(function (c, i) {
        var concepto = etiquetar(Form.texto({ valor: c.concepto, placeholder: 'Ej. Gas y mano de obra', maxlength: 60 }), 'Concepto del costo adicional ' + (i + 1));
        var tipoSel = etiquetar(Form.seleccion({ valor: c.tipo, vacio: false, opciones: [{ valor: 'monto', texto: '$ por unidad' }, { valor: 'porcentaje', texto: '% del precio' }] }), 'Tipo del costo adicional ' + (i + 1));
        var valor = Form.numero({ tipo: c.tipo === 'porcentaje' ? 'porcentaje' : 'moneda', valor: c.valor, ariaLabel: 'Valor del costo adicional ' + (i + 1) });
        var msg = h('div', { class: 'error-texto', role: 'alert', hidden: true });
        concepto.alCambiar(function () { c.concepto = concepto.get(); marcarSucio(); });
        tipoSel.alCambiar(function () { c.tipo = tipoSel.get(); c.valor = 0; pintarAdic(); marcarSucio(); });
        valor.alCambiar(function () { var v = valor.get(); valor.error(v !== null && isNaN(v) ? 'No entiendo ese número.' : ''); c.valor = v === null || isNaN(v) ? 0 : v; marcarSucio(); });
        var quitar = Comun.botonIcono('trash', 'Quitar costo adicional ' + (i + 1), function () { d.costosAdicionales.splice(i, 1); pintarAdic(); marcarSucio(); });
        ui.adic[i] = { msg: msg };
        cajaAdic.appendChild(h('div', null, h('div', { class: 'fila', style: { alignItems: 'flex-start', flexWrap: 'wrap' } }, h('div', { style: { flex: '2 1 200px' } }, concepto.el), h('div', { style: { flex: '1 1 140px' } }, tipoSel.el), h('div', { style: { flex: '1 1 140px' } }, valor.el), quitar), msg));
      });
      cajaAdic.appendChild(h('div', null, Comun.boton('Agregar costo adicional', { icono: 'plus', chico: true, onclick: function () { d.costosAdicionales = d.costosAdicionales || []; d.costosAdicionales.push({ id: M.crearId(), concepto: '', tipo: 'monto', valor: 0 }); pintarAdic(); marcarSucio(); } })));
    }

    // ---------- resumen de costo y gráfico ----------
    var cajaResumen = h('div', { class: 'pila', 'aria-live': 'polite' });
    var cajaGrafico = h('div');

    // ---------- panel de precio y rentabilidad ----------
    var precioBase = esPrep ? null : Form.numero({ etiqueta: 'Precio de venta', tipo: 'moneda', valor: d.precioBase || null, requerido: true, ayuda: 'El precio que ve tu cliente. Si cobras distinto en algún canal, ponlo abajo.' });
    var margenProp = esPrep ? null : Form.numero({ etiqueta: 'Margen objetivo de este producto (opcional)', tipo: 'porcentaje', valor: typeof d.margenObjetivo === 'number' ? d.margenObjetivo : null, placeholder: F.pct(cfg.margenObjetivo, 1) + ' (el general)', ayuda: 'Déjalo vacío para usar el margen general de ' + F.pct(cfg.margenObjetivo, 1) + '.' });
    var tarifa = !esPrep && cfg.impuestos && cfg.impuestos.activo ? Form.numero({ etiqueta: 'Impuesto de este producto (ej. IVA, INC)', tipo: 'porcentaje', valor: d.tarifaImpuesto || 0 }) : null;
    var camposCanal = {};
    if (precioBase) precioBase.alCambiar(function () { var v = precioBase.get(); d.precioBase = v === null ? 0 : v; marcarSucio(); });
    if (margenProp) margenProp.alCambiar(function () { var v = margenProp.get(); if (v === null) delete d.margenObjetivo; else d.margenObjetivo = v; marcarSucio(); });
    if (tarifa) tarifa.alCambiar(function () { var v = tarifa.get(); d.tarifaImpuesto = v === null || isNaN(v) ? 0 : v; marcarSucio(); });
    var canalesActivos = dd0.canales.filter(function (c) { return !c.archivado; });
    var cajaPreciosCanal = h('div', { class: 'pila' });
    if (!esPrep && canalesActivos.length > 1) {
      cajaPreciosCanal.appendChild(h('p', { class: 'explicacion' }, 'Precio distinto por canal (opcional). Si lo dejas vacío se usa el precio de venta de arriba. Útil cuando una plataforma te cobra comisión y subes el precio para compensar.'));
      var cps = canalesActivos.map(function (c) {
        var f = Form.numero({ etiqueta: 'Precio en ' + c.nombre, tipo: 'moneda', valor: (d.preciosPorCanal && d.preciosPorCanal[c.id]) || null, placeholder: 'Igual al precio de venta' });
        camposCanal[c.id] = f;
        f.alCambiar(function () {
          var v = f.get(); d.preciosPorCanal = d.preciosPorCanal || {};
          if (v === null || isNaN(v) || v <= 0) delete d.preciosPorCanal[c.id]; else d.preciosPorCanal[c.id] = v;
          marcarSucio();
        });
        return f;
      });
      cajaPreciosCanal.appendChild(Form.rejilla(cps));
    }
    var cajaMedidas = h('div', { class: 'pila', 'aria-live': 'polite' });
    var tablaCanales = App.Tabla.crear({
      etiqueta: 'Rentabilidad por canal', filas: [], vacio: h('p', { class: 'muted' }, 'Agrega ingredientes y un precio para ver la rentabilidad.'),
      columnas: [
        { id: 'canal', titulo: 'Canal', ordenable: false, render: function (t) { return t.canal ? t.canal.nombre + (t.canal.comisionPct > 0 ? ' (' + F.pct(t.canal.comisionPct, 1) + ')' : '') : 'Sin canal'; } },
        { id: 'precio', titulo: 'Precio', clase: 'num', ordenable: false, render: function (t) { return F.cop(t.resultado.precioPublico); } },
        { id: 'com', titulo: 'Comisión', clase: 'num', ordenable: false, render: function (t) { return F.cop(t.resultado.comision); } },
        { id: 'var', titulo: 'Costos variables', clase: 'num', ordenable: false, render: function (t) { return F.cop(t.resultado.costosVariables); } },
        { id: 'gan', titulo: 'Ganancia', clase: 'num', ordenable: false, render: function (t) { return h('strong', { class: t.resultado.ganancia < 0 ? 'negativo' : 'positivo' }, F.cop(t.resultado.ganancia)); } },
        { id: 'mar', titulo: 'Margen', clase: 'num', ordenable: false, render: function (t) { return t.resultado.margen === null ? '—' : F.pct(t.resultado.margen, 1); } },
        { id: 'sob', titulo: '% sobre el costo', clase: 'num', ordenable: false, render: function (t) { return t.resultado.pctSobreCosto === null ? '—' : F.pct(t.resultado.pctSobreCosto, 1); } },
        { id: 'rec', titulo: 'Precio recomendado', clase: 'num', ordenable: false, render: function (t) { var r = t.resultado.recomendado; return r.ok ? F.cop(r.precioPublico || r.precio) : h('span', { class: 'muted', title: r.mensaje }, 'No hay'); } },
        { id: 'est', titulo: 'Estado', ordenable: false, render: function (t) { return insigniasInd(t.resultado); } }
      ]
    });
    var cajaRecomendado = h('div', { class: 'pila' });

    // ---------- simulador ----------
    var simCanal = Form.seleccion({ etiqueta: 'Canal', valor: '', vacio: canalesActivos.length ? false : 'Sin canal', opciones: canalesActivos.map(function (c) { return { valor: c.id, texto: c.nombre }; }) });
    var simPrecio = Form.numero({ etiqueta: '¿Y si vendo a…?', tipo: 'moneda', placeholder: 'Sin cambio', ayuda: 'Déjalo vacío para no cambiar el precio.' });
    var simComision = Form.numero({ etiqueta: '¿Y si la comisión fuera…?', tipo: 'porcentaje', placeholder: 'Sin cambio' });
    var simInsumos = Form.numero({ etiqueta: '¿Y si los insumos suben (o bajan) un…?', tipo: 'porcentaje', placeholder: '0 %', ayuda: 'Ej. 10 si suben 10 %; −5 si bajan 5 %.' });
    var simMerma = Form.numero({ etiqueta: '¿Y si la merma aumenta en…? (puntos)', tipo: 'porcentaje', placeholder: '0 %', ayuda: 'Ej. 5 suma 5 puntos de merma a todos los ingredientes.' });
    var cajaSim = h('div', { class: 'pila', 'aria-live': 'polite' });
    var btnAplicarPrecio = Comun.boton('Usar este precio en el producto', { chico: true, onclick: function () {
      var v = simPrecio.get();
      if (v === null || isNaN(v)) return;
      d.precioBase = v; precioBase.set(v); marcarSucio(); App.Toast.ok('Precio actualizado en el borrador. Recuerda guardar.');
    } });

    // ---------- lote ----------
    var loteUnidades = Form.numero({ etiqueta: esPrep ? '¿Cuánto quieres preparar?' : '¿Cuántas unidades quieres producir?', tipo: 'numero', valor: d.rinde > 0 ? (esPrep ? d.rinde : Math.max(d.rinde, 10)) : 10, sufijo: esPrep ? d.unidadRinde : 'und' });
    var loteCanal = Form.seleccion({ etiqueta: 'Canal para estimar la ganancia', valor: '', vacio: canalesActivos.length ? false : 'Sin canal', opciones: canalesActivos.map(function (c) { return { valor: c.id, texto: c.nombre }; }) });
    var cajaLote = h('div', { class: 'pila', 'aria-live': 'polite' });

    // ---------- cálculo en vivo ----------
    function leerNumeroInvalido() { return null; }
    var tCalc = null;
    function recalcularPronto() { clearTimeout(tCalc); tCalc = setTimeout(recalcular, 60); }

    function recalcular() {
      var b = docBorrador(doc, d), ctx = C.crearContexto(b.doc), rc = ctx.receta(b.id);
      ultimo = { ctx: ctx, rc: rc, b: b };
      // líneas
      rc.lineas.forEach(function (l, i) {
        var celdaCosto = ui.costoCeldas[i], fila = ui.filas[i];
        if (!celdaCosto) return;
        App.Dom.limpiar(celdaCosto);
        if (l.error) {
          celdaCosto.appendChild(h('span', { class: 'negativo small', title: l.error }, 'Revisar'));
          if (fila && !erroresLinea[i]) { fila.msg.hidden = false; fila.msg.textContent = l.error; fila.el.classList.add('error'); }
        } else {
          celdaCosto.appendChild(document.createTextNode(F.cop(l.costo)));
          if (l.pct !== null) celdaCosto.appendChild(h('div', { class: 'small muted', style: { fontWeight: 400 } }, F.pct(l.pct, 0) + ' del total'));
          if (fila && !erroresLinea[i]) { fila.msg.hidden = true; fila.msg.textContent = ''; fila.el.classList.remove('error'); }
        }
      });
      pintarResumen(rc, ctx);
      if (!esPrep) pintarRentabilidad(ctx, b);
      pintarSim(b);
      pintarLote(ctx, b, rc);
      redibujarGrafico();
    }

    function pintarResumen(rc, ctx) {
      App.Dom.limpiar(cajaResumen);
      var rinde_ = d.rinde > 0 ? d.rinde : 1;
      cajaResumen.appendChild(h('h3', null, 'Resumen del costo'));
      if (rc.errores.length) {
        cajaResumen.appendChild(Comun.aviso('error', [h('strong', null, 'Revisa la receta:'), h('ul', null, rc.errores.slice(0, 5).map(function (e) { return h('li', null, e); }))], 'alert'));
      }
      if (rc.costoTotal === null) return;
      var filas = [];
      filas.push(['Costo de los ingredientes (toda la receta)', F.cop(rc.costoTotal)]);
      if (esPrep) {
        filas.push(['Rinde', F.cantidad(rinde_) + ' ' + d.unidadRinde]);
        filas.push(['Cuesta cada ' + d.unidadRinde, Comun.costoUnidad(rc.costoProd)]);
      } else {
        filas.push(['Rinde', F.cantidad(rinde_) + (esCombo ? ' combo' : ' und')]);
        filas.push(['Costo de producción por unidad', F.cop(rc.costoProd)]);
        if (rc.fijosAdic > 0) filas.push(['Costos adicionales por unidad', F.cop(rc.fijosAdic)]);
        if (rc.pctAdic > 0) filas.push(['Costos adicionales (% del precio)', F.pct(rc.pctAdic, 1)]);
      }
      cajaResumen.appendChild(h('dl', { class: 'desglose-linea' }, filas.map(function (f, i) {
        var ult = i === filas.length - 1 || /Cuesta cada|Costo de producción/.test(f[0]);
        return [h('dt', null, f[0]), h('dd', { class: ult ? 'total' : '' }, f[1])];
      })));
    }

    function pintarRentabilidad(ctx, b) {
      var filas = C.tablaPorCanal(ctx, b.id);
      tablaCanales.actualizar(filas);
      App.Dom.limpiar(cajaMedidas); App.Dom.limpiar(cajaRecomendado);
      if (!filas.length) return;
      var canalDef = A.canalPorDefecto(b.doc);
      var principal = filas.filter(function (t) { return t.canal && canalDef && t.canal.id === canalDef.id; })[0] || filas[0];
      var res = principal.resultado;
      if (ctx.receta(b.id).costoProd === null) { cajaMedidas.appendChild(Comun.aviso('error', 'No puedo calcular la rentabilidad hasta que arregles los errores de la receta.', 'alert')); return; }
      if (!(res.precioPublico > 0)) cajaMedidas.appendChild(Comun.aviso('info', 'Escribe el precio de venta para ver cuánto ganas.'));
      cajaMedidas.appendChild(h('h3', null, 'Cuánto ganas por unidad' + (principal.canal ? ' · ' + principal.canal.nombre : '')));
      cajaMedidas.appendChild(Comun.medidas(res, cfg));
      var rec = res.recomendado;
      if (rec.ok) {
        var pr = rec.precioPublico || rec.precio;
        cajaRecomendado.appendChild(h('div', { class: 'tarjeta' },
          h('div', { class: 'tarjeta-cabecera' }, h('div', null, h('h3', null, 'Precio recomendado: ' + F.cop(pr)),
            h('p', { class: 'explicacion' }, 'Para ganar ' + F.pct(C.margenObjetivoDe(d, cfg), 1) + ' de cada venta' + (principal.canal && principal.canal.comisionPct > 0 ? ' después de la comisión de ' + principal.canal.nombre : '') +
              ', redondeado hacia arriba a ' + F.cop(cfg.redondeoPrecio) + '. Con ese precio el margen real queda en ' + F.pct(rec.margenReal, 1) + '.')),
            Comun.boton('Usar este precio', { chico: true, onclick: function () { d.precioBase = pr; precioBase.set(pr); marcarSucio(); App.Toast.ok('Precio actualizado en el borrador. Recuerda guardar.'); } }))));
      } else {
        cajaRecomendado.appendChild(Comun.aviso('warn', rec.mensaje));
      }
    }

    function filaSim(titulo, a, dsp, fmt, bueno) {
      var delta = dsp - a, cls = Math.abs(delta) < 1e-9 ? '' : ((bueno === 'sube' ? delta > 0 : delta < 0) ? 'delta-baja' : 'delta-sube');
      var txtDelta = Math.abs(delta) < 1e-9 ? '—' : (delta > 0 ? '+' : '−') + fmt(Math.abs(delta));
      return h('tr', null, h('th', { scope: 'row' }, titulo), h('td', { class: 'num', 'data-label': 'Ahora' }, fmt(a)), h('td', { class: 'num', 'data-label': 'Con el cambio' }, fmt(dsp)), h('td', { class: 'num ' + cls, 'data-label': 'Diferencia' }, txtDelta));
    }
    function pintarSim(b) {
      if (esPrep) return;
      App.Dom.limpiar(cajaSim);
      var vals = { p: simPrecio.get(), c: simComision.get(), i: simInsumos.get(), m: simMerma.get() };
      var malo = Object.keys(vals).some(function (k) { return vals[k] !== null && isNaN(vals[k]); });
      if (malo) { cajaSim.appendChild(Comun.aviso('error', 'Alguno de los números no se entiende. Escríbelos así: 12.500 o 12,5.', 'alert')); return; }
      var aj = {};
      if (vals.p !== null) aj.precio = vals.p;
      if (vals.c !== null) aj.comisionPct = vals.c;
      if (vals.i !== null) aj.factorInsumos = 1 + vals.i;
      if (vals.m !== null) aj.mermaDelta = vals.m;
      if (typeof aj.factorInsumos === 'number' && aj.factorInsumos < 0) { cajaSim.appendChild(Comun.aviso('error', 'Los insumos no pueden bajar más de 100 %.', 'alert')); return; }
      var s = C.simular(b.doc, b.id, simCanal.get() || null, aj);
      if (!s.antes || !s.despues) return;
      if (ultimo.rc && ultimo.rc.costoProd === null) { cajaSim.appendChild(Comun.aviso('error', 'Arregla primero los errores de la receta.', 'alert')); return; }
      var a = s.antes, dsp = s.despues;
      var hayCambio = Object.keys(aj).length > 0;
      if (!hayCambio) cajaSim.appendChild(Comun.aviso('info', 'Cambia alguno de los datos de arriba para ver el efecto. Nada de esto se guarda.'));
      cajaSim.appendChild(h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla-tarjetas', 'aria-label': 'Resultado de la simulación' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'Ahora'), h('th', { class: 'num' }, 'Con el cambio'), h('th', { class: 'num' }, 'Diferencia'))),
        h('tbody', null,
          filaSim('Precio de venta', a.precioPublico, dsp.precioPublico, F.cop, 'sube'),
          filaSim('Costo de producción', a.costoProd, dsp.costoProd, F.cop, 'baja'),
          filaSim('Comisión', a.comision, dsp.comision, F.cop, 'baja'),
          filaSim('Ganancia por unidad', a.ganancia, dsp.ganancia, F.cop, 'sube'),
          a.margen !== null && dsp.margen !== null ? filaSim('Margen de contribución', a.margen, dsp.margen, function (x) { return F.pct(x, 1); }, 'sube') : null,
          a.pctSobreCosto !== null && dsp.pctSobreCosto !== null ? filaSim('% de ganancia sobre el costo', a.pctSobreCosto, dsp.pctSobreCosto, function (x) { return F.pct(x, 1); }, 'sube') : null))));
      if (dsp.ganancia < 0) cajaSim.appendChild(Comun.aviso('error', 'Con ese cambio perderías ' + F.cop(-dsp.ganancia) + ' por cada unidad vendida.', 'alert'));
      else if (hayCambio && dsp.recomendado.ok && dsp.precioPublico < (dsp.recomendado.precioPublico || dsp.recomendado.precio)) {
        cajaSim.appendChild(Comun.aviso('warn', 'Para mantener tu margen objetivo, el precio tendría que ser de ' + F.cop(dsp.recomendado.precioPublico || dsp.recomendado.precio) + '.'));
      }
      btnAplicarPrecio.hidden = vals.p === null;
    }

    function pintarLote(ctx, b, rc) {
      App.Dom.limpiar(cajaLote);
      var u = loteUnidades.get();
      if (u === null || isNaN(u) || u <= 0) { cajaLote.appendChild(Comun.aviso('info', 'Escribe cuántas unidades quieres producir.')); return; }
      if (rc.costoProd === null) { cajaLote.appendChild(Comun.aviso('error', 'Arregla primero los errores de la receta.', 'alert')); return; }
      var lote = C.calcularLote(ctx, b.id, u, loteCanal.get() || null);
      if (!lote) return;
      var lista = A.listaCompras(b.doc, ctx, [{ productoId: b.id, cantidad: u }], A.stockInsumos(doc));
      cajaLote.appendChild(h('div', { class: 'rejilla kpis' },
        Comun.kpi({ titulo: 'Costo del lote', valor: F.cop(lote.costoProduccion), nota: 'Ingredientes de ' + F.cantidad(u) + (esPrep ? ' ' + d.unidadRinde : ' und') }),
        esPrep ? null : Comun.kpi({ titulo: 'Ingreso estimado', valor: F.cop(lote.ingresoEstimado), nota: 'Si vendes todo' }),
        esPrep ? null : Comun.kpi({ titulo: 'Ganancia estimada', valor: F.cop(lote.gananciaEstimada), clase: lote.gananciaEstimada < 0 ? 'malo' : 'bueno', nota: 'Después de costos y comisión' }),
        Comun.kpi({ titulo: 'Por comprar', valor: F.cop(lista.totalCompra), nota: 'Lo que te falta, en presentaciones completas' })));
      if (!lista.filas.length) { cajaLote.appendChild(h('p', { class: 'muted' }, 'Agrega ingredientes para ver la lista de compras.')); return; }
      cajaLote.appendChild(h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla-tarjetas', 'aria-label': 'Ingredientes del lote' },
        h('thead', null, h('tr', null, ['Ingrediente', 'Necesitas', 'Tienes', 'Te falta', 'Comprar', 'Costo'].map(function (t, i) { return h('th', { class: i ? 'num' : '' }, t); }))),
        h('tbody', null, lista.filas.map(function (f) {
          return h('tr', null,
            h('th', { scope: 'row', 'data-label': 'Ingrediente' }, f.nombre),
            h('td', { class: 'num', 'data-label': 'Necesitas' }, F.cantidad(f.requerido) + ' ' + f.unidadBase),
            h('td', { class: 'num', 'data-label': 'Tienes' }, F.cantidad(f.enStock) + ' ' + f.unidadBase),
            h('td', { class: 'num ' + (f.faltante > 0 ? 'negativo' : 'positivo'), 'data-label': 'Te falta' }, f.faltante > 0 ? F.cantidad(f.faltante) + ' ' + f.unidadBase : 'Nada'),
            h('td', { class: 'num', 'data-label': 'Comprar' }, f.presentaciones > 0 && f.presentacion ? f.presentaciones + ' × ' + F.cantidad(f.presentacion.cantidad) + ' ' + f.presentacion.unidad : '—'),
            h('td', { class: 'num', 'data-label': 'Costo' }, f.costoCompra > 0 ? F.cop(f.costoCompra) : '—'));
        })))));
      var acciones = h('div', { class: 'grupo-botones' },
        Comun.boton('Copiar lista para WhatsApp', { icono: 'whatsapp', onclick: function () {
          var faltan = lista.filas.filter(function (f) { return f.faltante > 0; });
          var txt = ['Lista de compras para ' + F.cantidad(u) + ' × ' + (d.nombre || 'receta')].concat(faltan.length ? faltan.map(function (f) {
            return '• ' + f.nombre + ': ' + (f.presentaciones > 0 && f.presentacion ? f.presentaciones + ' × ' + F.cantidad(f.presentacion.cantidad) + ' ' + f.presentacion.unidad : F.cantidad(f.faltante) + ' ' + f.unidadBase);
          }) : ['Ya tienes todo lo necesario.']).join('\n');
          Comun.copiarWhatsApp(txt);
        } }),
        Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.listaCompras(lista); } }));
      if (cfg.modoInventario === 'conProduccion' && tipo === 'producto') {
        acciones.appendChild(Comun.boton('Registrar esta producción', { icono: 'clipboard', disabled: !existente || sesion.dirty, titulo: !existente || sesion.dirty ? 'Guarda el producto antes de registrar la producción' : '', onclick: function () { registrarProduccion(existente.id, u); } }));
      }
      cajaLote.appendChild(acciones);
    }

    function registrarProduccion(productoId, unidades) { App.ProduccionVista.abrirLote(productoId, unidades); }

    var redibujarGrafico = App.Dom.debounce(function () {
      if (sesion.tab !== 'receta' || !ultimo.rc) return;
      if (chart) { try { chart.destroy(); } catch (e) { /* nada */ } chart = null; }
      App.Dom.limpiar(cajaGrafico);
      var ls = ultimo.rc.lineas.filter(function (l) { return l.costo > 0; });
      cajaGrafico.appendChild(h('h3', null, 'En qué se va el costo'));
      if (!ls.length) { cajaGrafico.appendChild(h('p', { class: 'explicacion' }, 'Cuando agregues ingredientes verás aquí cuáles pesan más en el costo.')); return; }
      chart = App.Graficos.dibujar(cajaGrafico, { tipo: 'doughnut', etiquetas: ls.map(function (l) { return l.nombre; }), series: [{ nombre: 'Costo', datos: ls.map(function (l) { return l.costo; }) }], formato: 'cop', ariaLabel: 'Composición del costo por ingrediente' });
    }, 250);

    [simCanal, simPrecio, simComision, simInsumos, simMerma].forEach(function (c) { c.alCambiar(function () { pintarSim(ultimo.b); }); });
    [loteUnidades, loteCanal].forEach(function (c) { c.alCambiar(function () { pintarLote(ultimo.ctx, ultimo.b, ultimo.rc); }); });

    // ---------- guardar ----------
    function limpiarErrores() {
      [nombre, rinde, unidadRinde, precioBase, margenProp, tarifa].forEach(function (c) { if (c) c.error(''); });
      erroresLinea = {};
      ui.filas.forEach(function (f) { if (f) { f.msg.hidden = true; f.msg.textContent = ''; f.el.classList.remove('error'); } });
      ui.adic.forEach(function (a) { if (a) { a.msg.hidden = true; a.msg.textContent = ''; } });
    }

    function guardar() {
      limpiarErrores();
      var res = V.validarReceta(d, doc);
      var errores = Object.assign({}, res.errores);
      var tabError = null;
      function falla(tab) { if (!tabError) tabError = tab; }
      var campoDe = { nombre: nombre, rinde: rinde, unidadRinde: unidadRinde, precioBase: precioBase, margenObjetivo: margenProp };
      var primero = null;
      Object.keys(errores).forEach(function (k) {
        var m = /^linea(\d+)$/.exec(k), a = /^adic(\d+)$/.exec(k);
        if (m) { var f = ui.filas[+m[1]]; erroresLinea[+m[1]] = errores[k]; if (f) { f.msg.hidden = false; f.msg.textContent = errores[k]; f.el.classList.add('error'); } falla('receta'); }
        else if (a) { var x = ui.adic[+a[1]]; if (x) { x.msg.hidden = false; x.msg.textContent = errores[k]; } falla('receta'); }
        else if (campoDe[k]) { campoDe[k].error(errores[k]); if (!primero) primero = campoDe[k]; falla(k === 'precioBase' || k === 'margenObjetivo' ? 'rentabilidad' : 'receta'); }
        else if (k === 'lineas') { falla('receta'); }
      });
      if (tarifa && tarifa.get() !== null && isNaN(tarifa.get())) { tarifa.error('No entiendo ese número.'); falla('rentabilidad'); errores.tarifa = 1; }
      if (!d.lineas.length && !errores.lineas) { errores.lineas = 'Agrega al menos un ingrediente.'; falla('receta'); }
      if (!d.lineas.length) App.Toast.error(esCombo ? 'Agrega al menos un producto al combo.' : 'Agrega al menos un ingrediente.');
      if (Object.keys(errores).length) {
        if (tabError) seleccionarTab(tabError);
        if (primero) primero.focus();
        else { var fe = cont.querySelector('.linea-receta.error input, .linea-receta.error select'); if (fe) fe.focus(); }
        if (d.lineas.length) App.Toast.error('Revisa los campos marcados en rojo.');
        return;
      }
      var copia = O.clonar(d);
      copia.nombre = copia.nombre.trim();
      if (esCombo) { copia.rinde = 1; copia.unidadRinde = 'und'; }
      var guardadoId;
      E.mutar(function (dd) { guardadoId = O.guardarReceta(dd, copia).id; });
      delete borradores[key];
      tipoLista = tipo;
      App.Toast.ok((NOMBRE_TIPO[tipo]) + ' guardado.');
      root.location.hash = '#/productos';
    }

    function cancelar() {
      function salir() { delete borradores[key]; root.location.hash = '#/productos'; }
      if (!sesion.dirty) { salir(); return; }
      App.Modal.confirmar({ titulo: 'Descartar cambios', mensaje: 'Tienes cambios sin guardar. ¿Salir sin guardarlos?', textoConfirmar: 'Descartar cambios', peligro: true }).then(function (ok) { if (ok) salir(); });
    }

    // ---------- montaje ----------
    var titulo = existente ? existente.nombre : 'Nuevo ' + NOMBRE_TIPO[tipo].toLowerCase();
    var acciones = [];
    if (existente) {
      acciones.push(Comun.boton('Duplicar', { icono: 'copy', onclick: function () { E.mutar(function (dd) { O.duplicarReceta(dd, existente.id); }); delete borradores[key]; App.Toast.ok('Copia creada.'); root.location.hash = '#/productos'; } }));
      acciones.push(existente.archivado ? Comun.boton('Restaurar', { icono: 'archivo', onclick: function () { Comun.restaurarEntidad('recetas', existente.id); delete borradores[key]; } })
        : Comun.boton('Archivar', { icono: 'archive', onclick: function () { Comun.archivarEntidad('recetas', existente.id, NOMBRE_TIPO[tipo].toLowerCase()).then(function (ok) { if (ok) { delete borradores[key]; root.location.hash = '#/productos'; } }); } }));
    }
    cont.appendChild(h('div', { class: 'no-imprimir', style: { marginBottom: '.5rem' } }, h('a', { href: '#/productos', onclick: function (e) { e.preventDefault(); cancelar(); } }, '← Volver a la lista')));
    cont.appendChild(Comun.cabecera({ titulo: titulo, descripcion: esPrep ? 'Una receta base que usas dentro de otros productos.' : esCombo ? 'Varios productos con un solo precio.' : null, acciones: acciones }));

    var tabs = [['receta', esCombo ? 'Productos del combo' : 'Receta e ingredientes']];
    if (!esPrep) { tabs.push(['rentabilidad', 'Precio y rentabilidad']); tabs.push(['simulador', 'Simulador «¿y si?»']); }
    tabs.push(['lote', 'Calculadora de lote']);
    if (!tabs.some(function (t) { return t[0] === sesion.tab; })) sesion.tab = 'receta';

    var paneles = {};
    function seleccionarTab(id) {
      sesion.tab = id;
      tabs.forEach(function (t) {
        var btn = document.getElementById('tab-' + t[0]);
        if (btn) btn.setAttribute('aria-selected', String(t[0] === id));
        paneles[t[0]].hidden = t[0] !== id;
      });
      if (id === 'receta') redibujarGrafico();
    }
    cont.appendChild(h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Secciones' }, tabs.map(function (t) {
      return h('button', { type: 'button', role: 'tab', id: 'tab-' + t[0], 'aria-selected': String(t[0] === sesion.tab), 'aria-controls': 'panel-' + t[0], onclick: function () { seleccionarTab(t[0]); } }, t[1]);
    })));

    // Panel receta
    var basicos = h('div', { class: 'tarjeta pila' },
      h('div', { class: 'form-rejilla' }, nombre.el, categoria.el), listaCats,
      esCombo ? null : Form.rejilla(unidadRinde ? [rinde, unidadRinde] : [rinde]),
      h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, h('div', { style: { flex: '0 0 120px' } }, emoji.el), h('div', { class: 'campo' }, h('label', null, 'Color'), color), picks),
      descripcion.el);
    paneles.receta = h('section', { id: 'panel-receta', role: 'tabpanel', 'aria-labelledby': 'tab-receta', class: 'pila', hidden: sesion.tab !== 'receta' },
      basicos,
      h('div', { class: 'tarjeta pila' }, h('h3', null, esCombo ? 'Productos que incluye' : 'Ingredientes'),
        esCombo ? null : h('p', { class: 'explicacion' }, 'Escribe la cantidad NETA que lleva el producto terminado. Si el ingrediente tiene merma (cáscaras, pérdida al cocinar), la app compra de más y lo suma al costo.'),
        cajaLineas, botonesAgregar),
      esPrep ? null : h('div', { class: 'tarjeta pila' }, h('h3', null, 'Costos adicionales por unidad'),
        h('p', { class: 'explicacion' }, 'Lo que gastas en cada unidad además de los ingredientes: gas, mano de obra, empaque suelto… Puede ser un valor fijo o un porcentaje del precio.'), cajaAdic),
      h('div', { class: 'rejilla c2' }, h('div', { class: 'tarjeta' }, cajaResumen), h('div', { class: 'tarjeta' }, cajaGrafico)));

    if (!esPrep) {
      paneles.rentabilidad = h('section', { id: 'panel-rentabilidad', role: 'tabpanel', 'aria-labelledby': 'tab-rentabilidad', class: 'pila', hidden: sesion.tab !== 'rentabilidad' },
        h('div', { class: 'tarjeta pila' }, h('h3', null, 'Precio'), Form.rejilla([precioBase, margenProp].concat(tarifa ? [tarifa] : [])), cajaPreciosCanal),
        cajaMedidas, cajaRecomendado,
        h('div', { class: 'tarjeta' }, h('h3', null, 'Rentabilidad por canal de venta'), tablaCanales.el,
          h('p', { class: 'explicacion', style: { marginTop: '.5rem' } }, 'Ganancia = precio − costo de producción − costos adicionales − comisión del canal. El «precio recomendado» alcanza tu margen objetivo en ese canal.')));
      paneles.simulador = h('section', { id: 'panel-simulador', role: 'tabpanel', 'aria-labelledby': 'tab-simulador', class: 'pila', hidden: sesion.tab !== 'simulador' },
        h('div', { class: 'tarjeta pila' }, h('h3', null, '¿Y si…?'), h('p', { class: 'explicacion' }, 'Prueba cambios sin tocar tus datos. Lo que escribas aquí no se guarda.'),
          Form.rejilla([simCanal, simPrecio, simComision, simInsumos, simMerma]), h('div', null, btnAplicarPrecio)),
        h('div', { class: 'tarjeta' }, cajaSim));
      btnAplicarPrecio.hidden = true;
    }
    paneles.lote = h('section', { id: 'panel-lote', role: 'tabpanel', 'aria-labelledby': 'tab-lote', class: 'pila', hidden: sesion.tab !== 'lote' },
      h('div', { class: 'tarjeta pila' }, h('h3', null, 'Calculadora de lote'), h('p', { class: 'explicacion' }, 'Dime cuánto vas a producir y te digo cuánto cuesta, qué tienes que comprar y cuánto ganarías.'),
        Form.rejilla(esPrep ? [loteUnidades] : [loteUnidades, loteCanal])),
      h('div', { class: 'tarjeta pila' }, cajaLote));
    tabs.forEach(function (t) { cont.appendChild(paneles[t[0]]); });

    cont.appendChild(h('div', { class: 'barra-guardar no-imprimir' }, estadoGuardar,
      h('button', { type: 'button', class: 'btn', onclick: cancelar }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, icono_('check'), 'Guardar ' + NOMBRE_TIPO[tipo].toLowerCase())));
    function icono_(n) { return App.Dom.icono(n); }

    pintarLineas(); pintarAdic();
    recalcular();
  }

  function titulo(params) {
    if (!params.id) return 'Productos y preparaciones';
    if (params.id === 'nuevo') return 'Nuevo ' + (NOMBRE_TIPO[params.resto[0]] || 'producto').toLowerCase();
    var r = O.buscar(E.datos().recetas, params.id);
    return r ? r.nombre : 'Producto';
  }

  App.ProductosVista = { nuevo: nuevo, irAEditor: irAEditor };
  App.registrarVista('productos', { titulo: titulo, render: function (cont, params) { if (params.id) renderEditor(cont, params); else renderLista(cont); } });
})(typeof self !== 'undefined' ? self : this);
