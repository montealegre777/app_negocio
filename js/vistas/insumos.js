/* Insumos: catálogo, costo por unidad, historial de precios, comparación entre proveedores y efecto de cambiar un precio. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, M = App.Modelo, U = App.Unidades, O = App.Operaciones;
  var Form = App.Form, Comun = App.Comun;
  var estTabla = {}, filtros = { categoria: '', archivados: false };

  function unidadesOpciones() {
    return Object.keys(U.UNIDADES).map(function (u) { return { valor: u, texto: U.UNIDADES[u].nombre }; });
  }

  /** Comparación por proveedor a partir de las compras registradas. */
  function comparacionProveedores(doc, insumoId) {
    var porId = C.mapaPorId(doc.datos.insumos), porProv = {};
    doc.datos.compras.forEach(function (c) {
      var lin = C.lineasCompraPorInsumo([c], porId)[insumoId];
      if (!lin) return;
      var k = c.proveedorId || '_sin';
      var o = porProv[k] || (porProv[k] = { proveedorId: c.proveedorId, q: 0, costo: 0, ultima: '', ultimoCosto: null });
      lin.forEach(function (x) {
        o.q += x.cantidadBase; o.costo += x.costoTotal;
        if (x.fecha >= o.ultima) { o.ultima = x.fecha; o.ultimoCosto = x.costoTotal / x.cantidadBase; }
      });
    });
    return Object.keys(porProv).map(function (k) { var o = porProv[k]; o.promedio = o.q > 0 ? o.costo / o.q : null; return o; })
      .sort(function (a, b) { return (a.ultimoCosto || 0) - (b.ultimoCosto || 0); });
  }

  function etiquetaOrigen(o) {
    if (o === 'manual') return 'Edición del precio';
    if (typeof o === 'string' && o.indexOf('compra:') === 0) return 'Compra registrada';
    return o || '—';
  }

  function abrirEditor(id, alGuardar) {
    var doc = E.doc(), d = doc.datos;
    var ex = id ? O.buscar(d.insumos, id) : null;
    if (id && !ex) return;
    var base = ex || M.nuevoInsumo({});
    var equivalencias = (base.equivalencias || []).map(function (q) { return { de: q.de, a: q.a, factor: q.factor }; });

    var nombre = Form.texto({ etiqueta: 'Nombre del insumo', valor: base.nombre, requerido: true, placeholder: 'Ej. Lentejas secas', maxlength: 60 });
    var categoria = Form.seleccion({ etiqueta: 'Categoría', valor: base.categoria, vacio: false, opciones: M.CATEGORIAS_INSUMO.map(function (c) { return { valor: c, texto: c }; }) });
    var unidadBase = Form.seleccion({
      etiqueta: 'Unidad en la que lo usas en tus recetas', valor: base.unidadBase, vacio: false, ayuda: 'g para sólidos, ml para líquidos, und para cosas que cuentas.',
      opciones: U.UNIDADES_BASE.map(function (u) { return { valor: u, texto: U.UNIDADES[u].nombre }; })
    });
    var pCant = Form.numero({ etiqueta: 'Cuánto trae lo que compras', tipo: 'numero', valor: base.presentacion.cantidad, requerido: true, ayuda: 'Ej. un paquete de 500 g → escribe 500.' });
    var pUnidad = Form.seleccion({ etiqueta: 'Unidad de lo que compras', valor: base.presentacion.unidad, vacio: false, opciones: unidadesOpciones() });
    var pPrecio = Form.numero({ etiqueta: 'Precio que pagas por esa presentación', tipo: 'moneda', valor: base.presentacion.precio, requerido: true });
    var merma = Form.numero({ etiqueta: 'Merma habitual', tipo: 'porcentaje', valor: base.mermaPct, ayuda: 'Lo que se pierde al limpiar o cocinar (cáscaras, huesos…). Si usas 100 g netos con 20 % de merma, la receta descuenta 125 g.' });
    var stockMin = Form.numero({ etiqueta: 'Avísame cuando queden menos de', tipo: 'numero', valor: base.stockMinimo || 0, sufijo: base.unidadBase });
    var proveedor = Form.seleccion({ etiqueta: 'Proveedor preferido', valor: base.proveedorIdPreferido || '', vacio: 'Sin proveedor', opciones: Comun.opcionesDe('proveedores', { incluirId: base.proveedorIdPreferido }) });

    var cajaEq = h('div', { class: 'pila' });
    var cajaPrevio = h('div', { class: 'pila', 'aria-live': 'polite' });
    var cajaErrores = h('div');
    var mapa = { nombre: nombre, categoria: categoria, unidadBase: unidadBase, cantidad: pCant, unidad: pUnidad, precio: pPrecio, mermaPct: merma, stockMinimo: stockMin };

    function pintarEq() {
      App.Dom.limpiar(cajaEq);
      equivalencias.forEach(function (q, i) {
        var de = Form.seleccion({ etiqueta: i === 0 ? '1' : null, valor: q.de, vacio: false, opciones: unidadesOpciones() });
        var factor = Form.numero({ etiqueta: i === 0 ? 'equivale a' : null, tipo: 'numero', valor: q.factor, ariaLabel: 'Cantidad equivalente' });
        var a = Form.seleccion({ etiqueta: i === 0 ? 'de' : null, valor: q.a, vacio: false, opciones: unidadesOpciones() });
        de.alCambiar(function () { q.de = de.get(); previo(); }); a.alCambiar(function () { q.a = a.get(); previo(); });
        factor.alCambiar(function () { var v = factor.get(); q.factor = v === null || isNaN(v) ? 0 : v; previo(); });
        var quitar = Comun.botonIcono('trash', 'Quitar equivalencia', function () { equivalencias.splice(i, 1); pintarEq(); previo(); });
        cajaEq.appendChild(h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, de.el, factor.el, a.el, quitar));
      });
      cajaEq.appendChild(h('div', null, Comun.boton('Agregar equivalencia', {
        chico: true, icono: 'plus', onclick: function () { equivalencias.push({ de: 'und', a: unidadBase.get() === 'und' ? 'g' : unidadBase.get(), factor: 1 }); pintarEq(); previo(); }
      })));
    }

    function borrador() {
      var c = pCant.get(), p = pPrecio.get(), mm = merma.get(), sm = stockMin.get();
      return {
        id: ex ? ex.id : undefined, nombre: nombre.get(), categoria: categoria.get(), unidadBase: unidadBase.get(),
        presentacion: { cantidad: c === null ? NaN : c, unidad: pUnidad.get(), precio: p === null ? NaN : p },
        mermaPct: mm === null ? 0 : mm, equivalencias: equivalencias.filter(function (q) { return q.factor > 0 || true; }), stockMinimo: sm === null ? 0 : sm,
        proveedorIdPreferido: proveedor.get() || null
      };
    }

    function previo() {
      App.Dom.limpiar(cajaPrevio);
      var b = borrador();
      var cb = Number.isFinite(b.presentacion.cantidad) && Number.isFinite(b.presentacion.precio) ? C.costoBasePresentacion(b) : null;
      if (cb === null) {
        cajaPrevio.appendChild(h('p', { class: 'explicacion' }, 'Completa la cantidad, la unidad y el precio para ver cuánto cuesta cada ' + (b.unidadBase || 'unidad') + '.'));
        return;
      }
      cajaPrevio.appendChild(h('div', { class: 'medida' }, h('span', { class: 'small muted' }, 'Cuesta cada ' + b.unidadBase),
        h('b', null, Comun.costoUnidad(cb)),
        h('span', { class: 'explicacion' }, F.cop(b.presentacion.precio) + ' ÷ ' + F.cantidad(b.presentacion.cantidad) + ' ' + b.presentacion.unidad + (b.mermaPct > 0 ? '. Con ' + F.pct(b.mermaPct, 1) + ' de merma, cada ' + b.unidadBase + ' realmente aprovechable cuesta ' + Comun.costoUnidad(C.cantidadBruta(1, b.mermaPct) * cb) + '.' : '.'))));
      if (ex) {
        var antes = C.costoBasePresentacion(ex);
        if (antes !== null && Math.abs(cb - antes) > 1e-9) {
          var imp = C.impactoCambioInsumo(doc, ex.id, cb);
          var pct = antes > 0 ? cb / antes - 1 : null;
          cajaPrevio.appendChild(Comun.aviso(cb > antes ? 'warn' : 'info', [h('strong', null, 'El precio de este insumo cambia ' + (pct === null ? '' : (pct > 0 ? '+' : '') + F.pct(pct, 1)) + '. '),
            imp.length ? 'Cambiará el costo de:' : 'Ninguna receta cambia de costo.',
            imp.length ? h('ul', null, imp.slice(0, 8).map(function (x) { return h('li', null, x.nombre + ': ' + F.cop(x.antes) + ' → ' + F.cop(x.despues) + ' (' + (x.delta > 0 ? '+' : '') + F.cop(x.delta, { decimales: 0 }) + ')'); })) : null,
            h('span', { class: 'explicacion' }, 'Las ventas ya entregadas conservan el costo que tenían.')]));
        }
      }
    }
    [nombre, categoria, pCant, pUnidad, pPrecio, merma, proveedor].forEach(function (c) { c.alCambiar(previo); });
    unidadBase.alCambiar(function () { previo(); });

    function guardar() {
      var b = borrador();
      var res = App.Validacion.validarInsumo(b, doc);
      var campoErr = {};
      Object.keys(mapa).forEach(function (k) { campoErr[k] = mapa[k]; });
      // números mal escritos
      var extra = {};
      [['cantidad', pCant], ['precio', pPrecio], ['mermaPct', merma], ['stockMinimo', stockMin]].forEach(function (par) {
        var v = par[1].get();
        if (v !== null && isNaN(v)) extra[par[0]] = 'No entiendo ese número. Escríbelo así: 12.500 o 12,5.';
        if (par[0] === 'cantidad' && v === null) extra.cantidad = 'Escribe la cantidad.';
        if (par[0] === 'precio' && v === null) extra.precio = 'Escribe el precio (puede ser 0).';
      });
      var errores = Object.assign({}, res.errores, extra);
      if (Comun.mostrarErroresForm(mapa, { errores: errores }, cajaErrores)) return;
      var obj = M.nuevoInsumo(Object.assign({}, ex || {}, b, { id: ex ? ex.id : undefined, historialPrecios: ex ? ex.historialPrecios : [] }));
      var guardadoId;
      E.mutar(function (dd) { guardadoId = O.guardarInsumo(dd, obj).id; });
      App.Toast.ok(ex ? 'Insumo actualizado.' : 'Insumo creado.');
      m.cerrar();
      if (alGuardar) alGuardar(guardadoId);
    }

    var cuerpo = h('div', { class: 'pila' },
      Form.rejilla([nombre, categoria]),
      h('fieldset', null, h('legend', null, 'Cómo lo compras'),
        h('div', { class: 'pila' }, Form.rejilla([unidadBase]), Form.rejilla([pCant, pUnidad, pPrecio]), cajaPrevio)),
      Form.rejilla([merma, stockMin, proveedor]),
      h('details', { open: equivalencias.length > 0 },
        h('summary', null, 'Equivalencias entre unidades (opcional)'),
        h('p', { class: 'explicacion' }, 'Úsalo cuando compras en una unidad y cocinas en otra de distinta familia, por ejemplo: 1 und (un aguacate) = 200 g.'),
        cajaEq),
      cajaErrores);

    if (ex) {
      // historial
      var hist = (ex.historialPrecios || []).slice().sort(C.compararHistorial).reverse();
      if (hist.length) {
        cuerpo.appendChild(h('details', null, h('summary', null, 'Historial de precios (' + hist.length + ')'),
          h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla', 'aria-label': 'Historial de precios' },
            h('thead', null, h('tr', null, h('th', null, 'Fecha'), h('th', { class: 'num' }, 'Costo por ' + ex.unidadBase), h('th', null, 'Origen'))),
            h('tbody', null, hist.slice(0, 30).map(function (x) {
              return h('tr', null, h('td', null, F.fecha(x.fecha)), h('td', { class: 'num' }, Comun.costoUnidad(x.costoBase)), h('td', null, etiquetaOrigen(x.origen), x.inicial ? ' (precio inicial)' : ''));
            }))))));
      }
      var comp = comparacionProveedores(doc, ex.id);
      if (comp.length) {
        var mejor = comp[0].ultimoCosto;
        cuerpo.appendChild(h('details', { open: comp.length > 1 }, h('summary', null, 'Comparación entre proveedores'),
          h('p', { class: 'explicacion' }, 'Según tus compras registradas (incluye el flete repartido). El más barato por ' + ex.unidadBase + ' va marcado.'),
          h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla', 'aria-label': 'Comparación entre proveedores' },
            h('thead', null, h('tr', null, h('th', null, 'Proveedor'), h('th', null, 'Última compra'), h('th', { class: 'num' }, 'Último costo'), h('th', { class: 'num' }, 'Promedio'))),
            h('tbody', null, comp.map(function (x) {
              return h('tr', null,
                h('td', null, x.proveedorId ? Comun.nombreDe('proveedores', x.proveedorId) || '(eliminado)' : 'Sin proveedor', x.ultimoCosto === mejor && comp.length > 1 ? h('span', { class: 'insignia ok', style: { marginLeft: '.4rem' } }, 'Más barato') : null),
                h('td', null, F.fecha(x.ultima)), h('td', { class: 'num' }, Comun.costoUnidad(x.ultimoCosto)), h('td', { class: 'num' }, Comun.costoUnidad(x.promedio)));
            }))))));
      }
      var uso = O.usoDeEntidad(doc, 'insumos', ex.id);
      if (uso.recetas.length) cuerpo.appendChild(h('p', { class: 'explicacion' }, 'Se usa en: ' + uso.recetas.map(function (r) { return r.nombre; }).join(', ') + '.'));
    }

    var pie = [];
    if (ex) {
      pie.push(h('button', {
        type: 'button', class: 'btn btn-fantasma', onclick: function () {
          var uso = O.usoDeEntidad(doc, 'insumos', ex.id);
          if (!uso.tieneHistoria) {
            App.Modal.confirmar({ titulo: 'Eliminar insumo', peligro: true, mensaje: '«' + ex.nombre + '» no se usa en ninguna receta ni tiene movimientos. ¿Eliminarlo del todo?', textoConfirmar: 'Eliminar' }).then(function (ok) {
              if (!ok) return;
              E.mutar(function (dd) { O.eliminarEntidad(dd, 'insumos', ex.id); }, { deshacer: 'Insumo «' + ex.nombre + '» eliminado.' });
              m.cerrar();
            });
          } else {
            Comun.archivarEntidad('insumos', ex.id, 'insumo').then(function (ok) { if (ok) m.cerrar(); });
          }
        }
      }, 'Eliminar o archivar'));
    }
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));

    var m = App.Modal.abrir({ titulo: ex ? 'Editar insumo' : 'Nuevo insumo', tamano: 'ancho', contenido: cuerpo, pie: pie });
    pintarEq(); previo();
    cuerpo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); } });
  }

  function render(cont) {
    var doc = E.doc(), ctx = E.ctx();
    var stock = A.stockInsumos(doc);
    var todos = doc.datos.insumos;
    var visibles = todos.filter(function (i) { return (filtros.archivados || !i.archivado) && (!filtros.categoria || i.categoria === filtros.categoria); });

    cont.appendChild(Comun.cabecera({
      titulo: 'Insumos', descripcion: 'Todo lo que compras para producir: ingredientes y empaques. Aquí defines cuánto cuesta cada gramo, mililitro o unidad.',
      acciones: [Comun.boton('Descargar CSV', { icono: 'download', onclick: App.Exportar.insumos }), Comun.boton('Nuevo insumo', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
    }));

    if (!todos.length) {
      cont.appendChild(Comun.vacio({
        emoji: '🧺', titulo: 'Aún no tienes insumos', texto: 'Empieza por los ingredientes de tu producto más vendido. Escribe lo que pagas por la presentación (ej. $ 4.500 por 500 g) y la app calcula el costo por gramo.',
        acciones: [Comun.boton('Crear mi primer insumo', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
      }));
      return;
    }

    var seg = h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Categoría' }, [['', 'Todos']].concat(M.CATEGORIAS_INSUMO.map(function (c) { return [c, c]; })).map(function (par) {
      return h('button', { type: 'button', 'aria-pressed': String(filtros.categoria === par[0]), onclick: function () { filtros.categoria = par[0]; App.Router.refrescar(); } }, par[1]);
    }));
    var arch = Form.casilla({ etiqueta: 'Mostrar archivados', valor: filtros.archivados });
    arch.alCambiar(function () { filtros.archivados = arch.get(); App.Router.refrescar(); });

    var tabla = App.Tabla.crear({
      etiqueta: 'Insumos', filas: visibles, estado: estTabla, buscarEn: function (i) { return i.nombre + ' ' + i.categoria; }, placeholderBusqueda: 'Buscar insumo…',
      orden: { col: 'nombre', dir: 1 }, clasesFila: function (i) { return i.archivado ? 'archivada' : ''; },
      herramientas: h('div', { class: 'fila' }, seg, arch.el), onFila: function (i) { abrirEditor(i.id); },
      columnas: [
        { id: 'nombre', titulo: 'Insumo', valor: function (i) { return i.nombre; }, render: function (i) { return h('span', null, h('strong', null, i.nombre), ' ', Comun.ejemplo(i), i.archivado ? h('span', { class: 'insignia' }, 'Archivado') : null); } },
        { id: 'cat', titulo: 'Categoría', valor: function (i) { return i.categoria; } },
        { id: 'pres', titulo: 'Compras', ordenable: false, render: function (i) { return F.cantidad(i.presentacion.cantidad) + ' ' + i.presentacion.unidad + ' · ' + F.cop(i.presentacion.precio); } },
        { id: 'costo', titulo: 'Costo por unidad', clase: 'num', valor: function (i) { return ctx.costoBase(i.id); }, render: function (i) { return Comun.costoUnidad(ctx.costoBase(i.id)) + ' / ' + i.unidadBase; } },
        { id: 'var', titulo: 'Variación', ordenable: false, render: function (i) { return Comun.insigniaVariacion(A.variacionInsumo(i)) || ''; } },
        {
          id: 'stock', titulo: 'En stock', clase: 'num', valor: function (i) { return stock[i.id] || 0; },
          render: function (i) {
            var s = stock[i.id] || 0, bajo = i.stockMinimo > 0 && s <= i.stockMinimo;
            return h('span', null, F.cantidad(s) + ' ' + i.unidadBase, bajo ? h('span', { class: 'insignia aviso', style: { marginLeft: '.4rem' } }, 'Bajo') : null);
          }
        },
        {
          id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num',
          render: function (i) {
            return h('span', { class: 'grupo-botones derecha' }, Comun.botonIcono('edit', 'Editar ' + i.nombre, function () { abrirEditor(i.id); }),
              i.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + i.nombre, function () { Comun.restaurarEntidad('insumos', i.id); })
                : Comun.botonIcono('archive', 'Archivar ' + i.nombre, function () { Comun.archivarEntidad('insumos', i.id, 'insumo'); }));
          }
        }
      ]
    });
    cont.appendChild(tabla.el);
  }

  App.InsumosVista = { abrirEditor: abrirEditor, comparacionProveedores: comparacionProveedores };
  App.registrarVista('insumos', { titulo: 'Insumos', render: render });
})(typeof self !== 'undefined' ? self : this);
