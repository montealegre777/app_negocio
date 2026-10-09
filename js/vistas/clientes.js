/* Clientes: directorio, historial de compras y saldo por cobrar. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var estTabla = {}, verArchivados = false;

  function estadisticas(doc) {
    var s = {}, hoy = F.hoy();
    doc.datos.pedidos.forEach(function (p) {
      if (!p.clienteId) return;
      var x = s[p.clienteId] || (s[p.clienteId] = { pedidos: 0, total: 0, ultimo: '', saldo: 0 });
      if (p.estado === 'cancelado') return;
      x.pedidos++;
      var c = C.calcularPedido(p);
      if (p.estado === 'entregado') { x.total += c.totalPedido; x.saldo += c.saldoPorCobrar; }
      if (p.fecha > x.ultimo) x.ultimo = p.fecha;
    });
    return s;
  }

  function textoCobro(cliente, saldo) {
    var cfg = E.config();
    return 'Hola ' + cliente.nombre.split(' ')[0] + ', te escribe ' + cfg.nombreNegocio + '. Te recuerdo que tienes un saldo pendiente de ' + F.cop(saldo) + '. ¡Gracias por tu compra!';
  }

  function abrirEditor(id, alGuardar) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.clientes, id) : null;
    if (id && !ex) return;
    var base = ex || M.nuevoCliente({});
    var nombre = Form.texto({ etiqueta: 'Nombre', valor: base.nombre, requerido: true, maxlength: 60 });
    var telefono = Form.texto({ etiqueta: 'Teléfono / WhatsApp', valor: base.telefono, maxlength: 20, tipo: 'tel', modo: 'tel', autocompletar: 'off' });
    var direccion = Form.texto({ etiqueta: 'Dirección', valor: base.direccion, maxlength: 120 });
    var notas = Form.area({ etiqueta: 'Notas (gustos, alergias, horarios…)', valor: base.notas, filas: 2, maxlength: 300 });
    var errores = h('div');
    function guardar() {
      var obj = M.nuevoCliente(Object.assign({}, ex || {}, { nombre: nombre.get(), telefono: telefono.get(), direccion: direccion.get(), notas: notas.get() }));
      var res = V.validarCliente(obj);
      if (Comun.mostrarErroresForm({ nombre: nombre }, res, errores)) return;
      var nid;
      E.mutar(function (d) { nid = O.guardarEntidad(d, 'clientes', obj).id; });
      App.Toast.ok(ex ? 'Cliente actualizado.' : 'Cliente creado.');
      m.cerrar();
      if (alGuardar) alGuardar(nid);
    }
    var cuerpo = h('div', { class: 'pila' }, Form.rejilla([nombre, telefono]), direccion.el, notas.el, errores);
    if (ex) {
      var est = estadisticas(doc)[ex.id];
      var pedidos = doc.datos.pedidos.filter(function (p) { return p.clienteId === ex.id; }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
      if (est) {
        cuerpo.appendChild(h('div', { class: 'rejilla kpis' }, Comun.kpi({ titulo: 'Pedidos', valor: String(est.pedidos) }), Comun.kpi({ titulo: 'Ha comprado', valor: F.cop(est.total) }),
          Comun.kpi({ titulo: 'Último pedido', valor: est.ultimo ? F.fecha(est.ultimo) : '—' }), Comun.kpi({ titulo: 'Debe', valor: F.cop(est.saldo), clase: est.saldo > 0 ? 'malo' : '' })));
        if (est.saldo > 0) cuerpo.appendChild(h('div', null, Comun.boton('Copiar recordatorio de cobro (WhatsApp)', { icono: 'whatsapp', onclick: function () { Comun.copiarWhatsApp(textoCobro(ex, est.saldo)); } })));
      }
      if (pedidos.length) cuerpo.appendChild(h('details', null, h('summary', null, 'Últimos pedidos'), h('ul', { class: 'lista-simple' }, pedidos.slice(0, 10).map(function (p) {
        var c = C.calcularPedido(p);
        return h('li', null, h('a', { href: '#/ventas/' + p.id, onclick: function () { m.cerrar(); } }, '#' + p.numero + ' · ' + F.fecha(p.fecha)), h('span', null, F.cop(c.totalPedido) + ' · ' + M.ETIQUETA_ESTADO[p.estado]));
      }))));
    }
    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () {
      var uso = O.usoDeEntidad(doc, 'clientes', ex.id);
      if (!uso.tieneHistoria) App.Modal.confirmar({ titulo: 'Eliminar cliente', peligro: true, mensaje: '¿Eliminar a «' + ex.nombre + '»? No tiene pedidos.', textoConfirmar: 'Eliminar' }).then(function (ok) { if (ok) { E.mutar(function (d) { O.eliminarEntidad(d, 'clientes', ex.id); }, { deshacer: 'Cliente eliminado.' }); m.cerrar(); } });
      else Comun.archivarEntidad('clientes', ex.id, 'cliente').then(function (ok) { if (ok) m.cerrar(); });
    } }, 'Eliminar o archivar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));
    var m = App.Modal.abrir({ titulo: ex ? 'Cliente' : 'Nuevo cliente', contenido: cuerpo, pie: pie });
    cuerpo.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); } });
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, est = estadisticas(doc);
    cont.appendChild(Comun.cabecera({
      titulo: 'Clientes', descripcion: 'Quién te compra, cuánto y quién te debe. Es opcional: puedes vender sin registrar al cliente.',
      acciones: [Comun.boton('Nuevo cliente', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
    }));
    if (!d.clientes.length) {
      cont.appendChild(Comun.vacio({ emoji: '👥', titulo: 'Aún no tienes clientes', texto: 'Guárdalos para ver quién compra más y controlar a quién le fías.', acciones: [Comun.boton('Crear un cliente', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })] }));
      return;
    }
    var arch = Form.casilla({ etiqueta: 'Mostrar archivados', valor: verArchivados });
    arch.alCambiar(function () { verArchivados = arch.get(); App.Router.refrescar(); });
    var tabla = App.Tabla.crear({
      etiqueta: 'Clientes', filas: d.clientes.filter(function (c) { return verArchivados || !c.archivado; }), estado: estTabla, orden: { col: 'nombre', dir: 1 }, herramientas: arch.el,
      buscarEn: function (c) { return c.nombre + ' ' + c.telefono + ' ' + c.direccion; }, placeholderBusqueda: 'Buscar cliente…', onFila: function (c) { abrirEditor(c.id); }, clasesFila: function (c) { return c.archivado ? 'archivada' : ''; },
      columnas: [
        { id: 'nombre', titulo: 'Cliente', valor: function (c) { return c.nombre; }, render: function (c) { return h('span', null, h('strong', null, c.nombre), ' ', Comun.ejemplo(c), c.archivado ? h('span', { class: 'insignia' }, 'Archivado') : null, c.telefono ? h('div', { class: 'small muted' }, c.telefono) : null); } },
        { id: 'ped', titulo: 'Pedidos', clase: 'num', valor: function (c) { return (est[c.id] || {}).pedidos || 0; }, render: function (c) { return String((est[c.id] || {}).pedidos || 0); } },
        { id: 'tot', titulo: 'Ha comprado', clase: 'num', valor: function (c) { return (est[c.id] || {}).total || 0; }, render: function (c) { return F.cop((est[c.id] || {}).total || 0); } },
        { id: 'ult', titulo: 'Último pedido', valor: function (c) { return (est[c.id] || {}).ultimo || ''; }, render: function (c) { var u = (est[c.id] || {}).ultimo; return u ? F.fecha(u) : '—'; } },
        { id: 'debe', titulo: 'Debe', clase: 'num', valor: function (c) { return (est[c.id] || {}).saldo || 0; }, render: function (c) { var s = (est[c.id] || {}).saldo || 0; return s > 0 ? h('strong', { class: 'negativo' }, F.cop(s)) : '—'; } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (c) {
          return h('span', { class: 'grupo-botones derecha' }, Comun.botonIcono('edit', 'Editar ' + c.nombre, function () { abrirEditor(c.id); }),
            c.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + c.nombre, function () { Comun.restaurarEntidad('clientes', c.id); }) : Comun.botonIcono('archive', 'Archivar ' + c.nombre, function () { Comun.archivarEntidad('clientes', c.id, 'cliente'); }));
        } }
      ]
    });
    cont.appendChild(tabla.el);
  }

  App.ClientesVista = { abrirEditor: abrirEditor, textoCobro: textoCobro };
  App.registrarVista('clientes', { titulo: 'Clientes', render: render });
})(typeof self !== 'undefined' ? self : this);
