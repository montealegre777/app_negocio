/* Producción y compras: planifica qué vas a producir, ve qué insumos te faltan y genera la lista de compras por proveedor. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, O = App.Operaciones, Form = App.Form, Comun = App.Comun;
  var plan = {}, estLotes = {}, estLista = {};

  function verCant(v, ub) { return App.InventarioVista ? App.InventarioVista.verCant(v, ub) : F.cantidad(v) + ' ' + ub; }
  function textoPresentacion(f) {
    if (!f.presentacion || !f.presentaciones) return '—';
    return f.presentaciones + ' × ' + F.cantidad(f.presentacion.cantidad) + ' ' + f.presentacion.unidad;
  }

  function planComoLista() {
    return Object.keys(plan).filter(function (k) { return plan[k] > 0; }).map(function (k) { return { productoId: k, cantidad: plan[k] }; });
  }

  function textoProveedor(doc, provId, filas) {
    var cfg = doc.config, prov = provId && provId !== '_sin' ? doc.datos.proveedores.filter(function (p) { return p.id === provId; })[0] : null;
    return ['Hola' + (prov ? ' ' + prov.nombre : '') + ', te escribe ' + cfg.nombreNegocio + '. Quiero pedirte:']
      .concat(filas.map(function (f) { return '• ' + f.nombre + ': ' + (f.presentaciones ? textoPresentacion(f) : verCant(f.faltante, f.unidadBase)); }),
        ['¿Me confirmas disponibilidad y valor? ¡Gracias!']).join('\n');
  }

  // ---------------- Lote ----------------
  function abrirLote(productoId, unidades) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx(), stock = A.stockInsumos(doc);
    var productos = Comun.opcionesDe('recetas', { filtro: function (r) { return r.tipo !== 'preparacion'; } });
    if (!productos.length) { App.Modal.aviso('Primero crea un producto', 'Para registrar producción necesitas tener productos con receta.').then(function () { App.Router.ir('productos'); }); return; }
    var prod = Form.seleccion({ etiqueta: 'Producto', valor: productoId || productos[0].valor, vacio: false, opciones: productos });
    var cant = Form.numero({ etiqueta: 'Unidades producidas', tipo: 'numero', valor: unidades || null, requerido: true });
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: F.hoy() });
    var notas = Form.texto({ etiqueta: 'Notas (opcional)', maxlength: 80 });
    var vista = h('div', { 'aria-live': 'polite' });
    var errores = h('div');
    function pintar() {
      App.Dom.limpiar(vista);
      var q = cant.get();
      if (q === null || isNaN(q) || q <= 0) return;
      var acc = C.consumoReceta(ctx, prod.get(), q, {});
      var filas = Object.keys(acc).map(function (id) {
        var ins = ctx.insumos[id], hay = stock[id] || 0;
        return { nombre: ins ? ins.nombre : '(eliminado)', ub: ins ? ins.unidadBase : '', gasta: acc[id], hay: hay, falta: acc[id] - hay > 1e-9 };
      }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
      var rc = ctx.receta(prod.get());
      vista.appendChild(h('div', { class: 'tarjeta' },
        h('strong', null, 'Se gastarían estos insumos'),
        rc && rc.costoProd !== null ? h('p', { class: 'explicacion' }, 'Costo de este lote: ' + F.cop(rc.costoProd * q) + ' (' + F.cop(rc.costoProd) + ' por unidad).') : null,
        h('ul', { class: 'lista-simple' }, filas.map(function (f) {
          return h('li', null, h('span', null, f.nombre), h('span', { class: f.falta ? 'negativo' : '' }, verCant(f.gasta, f.ub) + ' · hay ' + verCant(f.hay, f.ub)));
        }))));
      if (filas.some(function (f) { return f.falta; })) vista.appendChild(Comun.aviso('warn', 'Alcanza menos stock del registrado para algún insumo. Puedes registrar la producción igual, pero el stock quedará negativo hasta que registres la compra o hagas un conteo.'));
    }
    prod.alCambiar(pintar); cant.alCambiar(pintar); pintar();
    var m = App.Modal.abrir({
      titulo: 'Registrar producción', tamano: 'normal',
      contenido: h('div', { class: 'pila' }, h('p', { class: 'explicacion' }, 'Descuenta los insumos del inventario y suma producto terminado.'), Form.rejilla([prod, cant, fecha, notas]), vista, errores),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var q = cant.get(), errs = {};
        if (q === null || isNaN(q) || q <= 0) errs.cant = 'Escribe una cantidad mayor que 0.';
        if (!F.esFechaISO(fecha.get())) errs.fecha = 'Fecha inválida.';
        if (Comun.mostrarErroresForm({ cant: cant, fecha: fecha }, { errores: errs }, errores)) return;
        E.mutar(function (dd) { O.guardarLote(dd, { fecha: fecha.get(), productoId: prod.get(), cantidad: q, notas: notas.get() }); });
        App.Toast.ok('Producción registrada.'); m.cerrar();
      } }, 'Registrar')]
    });
  }

  // ---------------- Vista ----------------
  function renderPlan(cont) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx(), stock = A.stockInsumos(doc);
    var productos = d.recetas.filter(function (r) { return !r.archivado && r.tipo !== 'preparacion'; }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    if (!productos.length) { cont.appendChild(Comun.vacio({ emoji: '🍳', titulo: 'Aún no tienes productos', texto: 'Crea un producto con su receta y aquí podrás planear la producción y la lista de compras.', acciones: [Comun.boton('Crear un producto', { primario: true, onclick: function () { App.Router.ir('productos'); } })] })); return; }
    var abiertos = A.planDesdePedidosAbiertos(doc), nAbiertos = A.pedidosAbiertos(doc).length;
    var resultado = h('div', { class: 'pila', 'aria-live': 'polite' });
    var campos = productos.map(function (r) {
      var f = Form.numero({ etiqueta: r.nombre, tipo: 'numero', valor: plan[r.id] || null, placeholder: '0' });
      f.alCambiar(function () { var v = f.get(); plan[r.id] = v === null || isNaN(v) || v < 0 ? 0 : v; pintarResultado(); });
      return { prod: r, campo: f };
    });

    function pintarResultado() {
      App.Dom.limpiar(resultado);
      var lista = planComoLista();
      if (!lista.length) { resultado.appendChild(h('p', { class: 'explicacion' }, 'Escribe cuántas unidades de cada producto vas a hacer y verás aquí qué te falta comprar.')); return; }
      var res = A.listaCompras(doc, ctx, lista, stock);
      var costoPlan = 0, sinCosto = false;
      lista.forEach(function (x) { var rc = ctx.receta(x.productoId); if (rc && rc.costoProd !== null && rc.costoProd !== undefined) costoPlan += rc.costoProd * x.cantidad; else sinCosto = true; });
      var faltan = res.filas.filter(function (f) { return f.faltante > 1e-9; });
      resultado.appendChild(h('div', { class: 'rejilla kpis' },
        Comun.kpi({ titulo: 'Costo de producir este plan', valor: F.cop(costoPlan), nota: sinCosto ? 'Algún producto no tiene costo calculable' : 'A costos actuales' }),
        Comun.kpi({ titulo: 'Te falta comprar', valor: F.cop(res.totalEstimado), nota: faltan.length + (faltan.length === 1 ? ' insumo' : ' insumos') + ' · costo exacto de lo que falta', clase: faltan.length ? 'aviso' : 'bueno' }),
        Comun.kpi({ titulo: 'Compra en presentaciones completas', valor: F.cop(res.totalCompra), nota: 'Lo que pagarías en el mercado', ayuda: 'No puedes comprar medio paquete: aquí se redondea hacia arriba a presentaciones completas.' })));
      if (!faltan.length) resultado.appendChild(Comun.aviso('ok', 'Con tu inventario actual alcanza para este plan. No necesitas comprar nada.', 'check'));
      resultado.appendChild(App.Tabla.crear({
        etiqueta: 'Lista de compras', filas: res.filas, estado: estLista, orden: { col: 'falta', dir: -1 }, porPagina: 50,
        columnas: [
          { id: 'nombre', titulo: 'Insumo', valor: function (f) { return f.nombre; }, render: function (f) { return h('strong', null, f.nombre); } },
          { id: 'req', titulo: 'Necesitas', clase: 'num', valor: function (f) { return f.requerido; }, render: function (f) { return verCant(f.requerido, f.unidadBase); } },
          { id: 'hay', titulo: 'Tienes', clase: 'num', valor: function (f) { return f.enStock; }, render: function (f) { return verCant(f.enStock, f.unidadBase); } },
          { id: 'falta', titulo: 'Te falta', clase: 'num', valor: function (f) { return f.faltante; }, render: function (f) { return f.faltante > 1e-9 ? h('strong', { class: 'negativo' }, verCant(f.faltante, f.unidadBase)) : h('span', { class: 'insignia ok' }, 'Alcanza'); } },
          { id: 'comprar', titulo: 'Comprar', clase: 'num', valor: function (f) { return f.presentaciones; }, render: function (f) { return textoPresentacion(f); } },
          { id: 'costo', titulo: 'Costo', clase: 'num', valor: function (f) { return f.costoCompra; }, render: function (f) { return f.costoCompra ? F.cop(f.costoCompra) : '—'; } },
          { id: 'prov', titulo: 'Proveedor', valor: function (f) { return Comun.nombreDe('proveedores', f.proveedorId); }, render: function (f) { return Comun.nombreDe('proveedores', f.proveedorId) || h('span', { class: 'muted' }, 'Sin proveedor'); } }
        ],
        pie: function () { return [h('td', { colspan: 5 }, h('strong', null, 'Total de la compra')), h('td', { class: 'num' }, h('strong', null, F.cop(res.totalCompra))), h('td')]; }
      }).el);
      if (faltan.length) {
        var grupos = Object.keys(res.porProveedor).sort();
        resultado.appendChild(h('div', { class: 'tarjeta pila' },
          h('h3', { style: { margin: 0 } }, 'Pedir por proveedor'),
          h('p', { class: 'explicacion' }, 'Copia el mensaje y pégalo en WhatsApp. Después de comprar, registra la compra en «Compras y proveedores» para que el inventario y los costos se actualicen.'),
          grupos.map(function (k) {
            var filas = res.porProveedor[k], nombre = k === '_sin' ? 'Sin proveedor asignado' : Comun.nombreDe('proveedores', k) || 'Proveedor';
            var totalK = filas.reduce(function (s, f) { return s + f.costoCompra; }, 0);
            return h('div', { class: 'fila entre' }, h('span', null, h('strong', null, nombre), h('span', { class: 'muted' }, ' · ' + filas.length + (filas.length === 1 ? ' insumo' : ' insumos') + ' · ' + F.cop(totalK))),
              Comun.boton('Copiar mensaje', { chico: true, icono: 'whatsapp', onclick: function () { Comun.copiarWhatsApp(textoProveedor(doc, k, filas)); } }));
          }),
          h('div', { class: 'grupo-botones' }, Comun.boton('Descargar CSV', { chico: true, icono: 'download', onclick: function () { App.Exportar.listaCompras(res); } }), Comun.boton('Imprimir', { chico: true, icono: 'print', onclick: function () { App.Exportar.imprimir(); } }),
            Comun.boton('Registrar la compra', { chico: true, onclick: function () { App.Router.ir('compras'); } }))));
      }
    }

    cont.appendChild(h('div', { class: 'tarjeta pila' },
      h('div', { class: 'tarjeta-cabecera' },
        h('div', null, h('h3', null, '¿Qué vas a producir?'), h('p', { class: 'explicacion' }, 'Escribe cuántas unidades de cada producto. La app suma lo que necesitas de cada insumo (con la merma) y lo compara con tu inventario.')),
        h('div', { class: 'grupo-botones' },
          Comun.boton('Usar pedidos abiertos (' + nAbiertos + ')', { chico: true, disabled: !abiertos.length, titulo: abiertos.length ? 'Carga las cantidades de los pedidos pendientes o en preparación' : 'No hay pedidos pendientes', onclick: function () {
            plan = {}; abiertos.forEach(function (x) { plan[x.productoId] = x.cantidad; }); App.Router.refrescar();
          } }),
          Comun.boton('Borrar plan', { chico: true, fantasma: true, disabled: !planComoLista().length, onclick: function () { plan = {}; App.Router.refrescar(); } }))),
      Form.rejilla(campos.map(function (x) { return x.campo; }))));
    cont.appendChild(resultado);
    pintarResultado();
  }

  function renderLotes(cont) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx();
    var conProd = doc.config.modoInventario === 'conProduccion';
    var tarjeta = h('div', { class: 'pila' }, h('div', { class: 'tarjeta-cabecera' },
      h('div', null, h('h3', null, 'Lotes producidos'), h('p', { class: 'explicacion' }, conProd ? 'Cada lote gasta insumos y suma producto terminado.' : 'Estás en el modo sencillo: los insumos se descuentan al entregar el pedido, no por lote. Si quieres controlar lo que cocinas por adelantado, cambia el modo en Configuración.')),
      conProd ? Comun.boton('Registrar producción', { primario: true, icono: 'plus', onclick: function () { abrirLote(null); } }) : null));
    cont.appendChild(h('div', { class: 'tarjeta' }, tarjeta));
    if (!conProd) return;
    if (!d.lotes.length) { tarjeta.appendChild(h('p', { class: 'muted' }, 'Aún no has registrado lotes.')); return; }
    var nom = {}; d.recetas.forEach(function (r) { nom[r.id] = r; });
    tarjeta.appendChild(App.Tabla.crear({
      etiqueta: 'Lotes', filas: d.lotes, estado: estLotes, orden: { col: 'fecha', dir: -1 }, buscarEn: function (l) { return (nom[l.productoId] || {}).nombre + ' ' + (l.notas || ''); }, placeholderBusqueda: 'Buscar lote…',
      columnas: [
        { id: 'fecha', titulo: 'Fecha', valor: function (l) { return l.fecha; }, render: function (l) { return F.fecha(l.fecha); } },
        { id: 'prod', titulo: 'Producto', valor: function (l) { return (nom[l.productoId] || {}).nombre || ''; }, render: function (l) { return (nom[l.productoId] || {}).nombre || h('span', { class: 'muted' }, '(eliminado)'); } },
        { id: 'cant', titulo: 'Unidades', clase: 'num', valor: function (l) { return l.cantidad; }, render: function (l) { return F.cantidad(l.cantidad); } },
        { id: 'costo', titulo: 'Costo del lote', clase: 'num', valor: function (l) { return ((ctx.receta(l.productoId) || {}).costoProd || 0) * l.cantidad; }, render: function (l) { var rc = ctx.receta(l.productoId); return rc && rc.costoProd !== null ? F.cop(rc.costoProd * l.cantidad) : '—'; } },
        { id: 'notas', titulo: 'Notas', valor: function (l) { return l.notas || ''; }, render: function (l) { return l.notas || '—'; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (l) {
          return Comun.botonIcono('trash', 'Eliminar lote', function () {
            App.Modal.confirmar({ titulo: 'Eliminar lote', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar este lote? Los insumos vuelven al inventario y el producto terminado baja.' }).then(function (ok) { if (ok) E.mutar(function (dd) { O.eliminarDocumento(dd, 'lotes', l.id); }, { deshacer: 'Lote eliminado.' }); });
          });
        } }
      ]
    }).el);
  }

  function render(cont) {
    cont.appendChild(Comun.cabecera({ titulo: 'Producción y compras', descripcion: 'Planea lo que vas a cocinar, mira qué insumos te faltan y arma la lista de compras por proveedor.' }));
    var d = E.datos();
    plan = Object.keys(plan).reduce(function (acc, k) { if (d.recetas.some(function (r) { return r.id === k && !r.archivado; })) acc[k] = plan[k]; return acc; }, {});
    renderPlan(cont);
    renderLotes(cont);
  }

  App.ProduccionVista = { abrirLote: abrirLote };
  App.registrarVista('produccion', { titulo: 'Producción y compras', render: render });
})(typeof self !== 'undefined' ? self : this);
