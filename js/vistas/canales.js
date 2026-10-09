/* Canales de venta: dónde vendes y cuánto te cobran. La comisión entra en el precio recomendado y en la ganancia de cada venta. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var estTabla = {}, verArchivados = false;

  function abrirEditor(id, alGuardar) {
    var doc = E.doc();
    var ex = id ? O.buscar(doc.datos.canales, id) : null;
    var base = ex || M.nuevoCanal({});
    var nombre = Form.texto({ etiqueta: 'Nombre del canal', valor: base.nombre, requerido: true, maxlength: 40, placeholder: 'Ej. Venta directa, Rappi, WhatsApp' });
    var tipo = Form.seleccion({ etiqueta: 'Tipo de canal', valor: base.tipo, vacio: false, opciones: Object.keys(M.TIPOS_CANAL).map(function (k) { return { valor: k, texto: M.TIPOS_CANAL[k] }; }) });
    var comision = Form.numero({ etiqueta: 'Comisión que te cobra', tipo: 'porcentaje', valor: base.comisionPct, ayuda: 'Porcentaje del precio de venta que se queda el canal. En venta directa es 0 %.' });
    var neto = Form.casilla({ etiqueta: 'El canal me paga el valor menos su comisión', valor: base.liquidaNeto, ayuda: 'Actívalo si la plataforma te consigna ya descontada la comisión. Así tu caja y tus «cuentas por cobrar» cuadran con lo que realmente recibes.' });
    var errores = h('div');
    if (!ex) tipo.alCambiar(function () { neto.set(tipo.get() === 'plataforma'); });

    function guardar() {
      var c = comision.get();
      var borr = { id: ex ? ex.id : undefined, nombre: nombre.get(), comisionPct: c === null ? 0 : c };
      var res = V.validarCanal(borr, doc);
      var errs = Object.assign({}, res.errores);
      if (c !== null && isNaN(c)) errs.comisionPct = 'No entiendo ese número. Escríbelo así: 20 o 12,5.';
      if (Comun.mostrarErroresForm({ nombre: nombre, comisionPct: comision }, { errores: errs }, errores)) return;
      var obj = M.nuevoCanal(Object.assign({}, ex || {}, { nombre: borr.nombre, tipo: tipo.get(), comisionPct: borr.comisionPct, liquidaNeto: neto.get() }));
      var nid;
      E.mutar(function (d) { nid = O.guardarEntidad(d, 'canales', obj).id; });
      App.Toast.ok(ex ? 'Canal actualizado.' : 'Canal creado.');
      m.cerrar();
      if (alGuardar) alGuardar(nid);
    }
    var cuerpo = h('div', { class: 'pila' }, Form.rejilla([nombre, tipo, comision]), neto.el,
      ex ? h('p', { class: 'explicacion' }, 'Si cambias la comisión: los precios recomendados y las próximas ventas usan el valor nuevo. Las ventas ya entregadas conservan la comisión que tenían.') : null, errores);
    var m = App.Modal.abrir({
      titulo: ex ? 'Editar canal' : 'Nuevo canal de venta', contenido: cuerpo,
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar')]
    });
    cuerpo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); guardar(); } });
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos;
    cont.appendChild(Comun.cabecera({
      titulo: 'Canales de venta', descripcion: 'Dónde vendes: tu local, WhatsApp, una plataforma de domicilios… Cada canal puede tener una comisión distinta, y eso cambia cuánto ganas.',
      acciones: [Comun.boton('Nuevo canal', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
    }));
    if (!d.canales.length) {
      cont.appendChild(Comun.vacio({ emoji: '🛵', titulo: 'Aún no tienes canales de venta', texto: 'Crea al menos «Venta directa». Si vendes por una plataforma que cobra comisión, créala también para ver cuánto realmente ganas ahí.',
        acciones: [Comun.boton('Crear un canal', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })] }));
      return;
    }
    var arch = Form.casilla({ etiqueta: 'Mostrar archivados', valor: verArchivados });
    arch.alCambiar(function () { verArchivados = arch.get(); App.Router.refrescar(); });
    var tabla = App.Tabla.crear({
      etiqueta: 'Canales de venta', filas: d.canales.filter(function (c) { return verArchivados || !c.archivado; }), estado: estTabla, orden: { col: 'nombre', dir: 1 },
      herramientas: arch.el, onFila: function (c) { abrirEditor(c.id); }, clasesFila: function (c) { return c.archivado ? 'archivada' : ''; },
      columnas: [
        { id: 'nombre', titulo: 'Canal', valor: function (c) { return c.nombre; }, render: function (c) { return h('span', null, h('strong', null, c.nombre), ' ', Comun.ejemplo(c), c.archivado ? h('span', { class: 'insignia' }, 'Archivado') : null); } },
        { id: 'tipo', titulo: 'Tipo', valor: function (c) { return M.TIPOS_CANAL[c.tipo]; } },
        { id: 'com', titulo: 'Comisión', clase: 'num', valor: function (c) { return c.comisionPct; }, render: function (c) { return F.pct(c.comisionPct, 1); } },
        { id: 'neto', titulo: 'Pago', ordenable: false, render: function (c) { return c.liquidaNeto ? 'Te paga menos la comisión' : 'Te paga el valor completo'; } },
        { id: 'uso', titulo: 'Pedidos', clase: 'num', valor: function (c) { return d.pedidos.filter(function (p) { return p.canalId === c.id; }).length; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (c) {
          return h('span', { class: 'grupo-botones derecha' }, Comun.botonIcono('edit', 'Editar ' + c.nombre, function () { abrirEditor(c.id); }),
            c.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + c.nombre, function () { Comun.restaurarEntidad('canales', c.id); }) : Comun.botonIcono('archive', 'Archivar ' + c.nombre, function () { Comun.archivarEntidad('canales', c.id, 'canal'); }));
        } }
      ]
    });
    cont.appendChild(tabla.el);
    cont.appendChild(h('div', { class: 'aviso info', style: { marginTop: '1rem' } }, App.Dom.icono('info'), h('div', null,
      'La comisión se descuenta de tu ganancia, no del costo de los ingredientes. Por eso el mismo producto puede ser muy rentable en tu local y apenas rentable en una plataforma. Mira la pestaña «Precio y rentabilidad» de cada producto para comparar.')));
  }

  App.CanalesVista = { abrirEditor: abrirEditor };
  App.registrarVista('canales', { titulo: 'Canales de venta', render: render });
})(typeof self !== 'undefined' ? self : this);
