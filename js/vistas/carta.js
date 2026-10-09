/* Carta: lista de precios lista para imprimir o compartir por WhatsApp, con los precios del canal elegido. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, Form = App.Form, Comun = App.Comun;
  var op = { canalId: '', combos: true, descripciones: true, emojis: true, titulo: null, pie: '' };

  function grupos(doc, ctx) {
    var productos = doc.datos.recetas.filter(function (r) { return !r.archivado && r.tipo !== 'preparacion' && (op.combos || r.tipo !== 'combo'); });
    var items = [], sinPrecio = [];
    productos.forEach(function (r) {
      var res = C.resultadoProducto(ctx, r.id, op.canalId || null);
      if (res.precioPublico > 0) items.push({ r: r, precio: res.precioPublico }); else sinPrecio.push(r);
    });
    var porCat = {};
    items.forEach(function (x) { var k = x.r.categoria || (x.r.tipo === 'combo' ? 'Combos' : 'Menú'); (porCat[k] = porCat[k] || []).push(x); });
    var cats = Object.keys(porCat).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    cats.forEach(function (k) { porCat[k].sort(function (a, b) { return a.r.nombre.localeCompare(b.r.nombre, 'es'); }); });
    return { cats: cats, porCat: porCat, sinPrecio: sinPrecio, total: items.length };
  }

  function textoWhatsApp(titulo, g) {
    var out = ['*' + titulo + '*'];
    g.cats.forEach(function (k) {
      out.push('', '*' + k + '*');
      g.porCat[k].forEach(function (x) { out.push('• ' + (op.emojis ? x.r.emoji + ' ' : '') + x.r.nombre + ' — ' + F.cop(x.precio) + (op.descripciones && x.r.descripcion ? '\n   ' + x.r.descripcion : '')); });
    });
    if (op.pie) out.push('', op.pie);
    return out.join('\n');
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx();
    var canales = d.canales.filter(function (c) { return !c.archivado; });
    if (op.canalId && !canales.some(function (c) { return c.id === op.canalId; })) op.canalId = '';
    if (!op.canalId) { var def = A.canalPorDefecto(doc); op.canalId = def ? def.id : ''; }
    var titulo = op.titulo === null ? doc.config.nombreNegocio : op.titulo;
    var g = grupos(doc, ctx);

    cont.appendChild(Comun.cabecera({
      titulo: 'Carta', descripcion: 'Tu lista de precios, lista para imprimir o enviar. Los precios salen de cada producto según el canal que elijas.',
      acciones: [Comun.boton('Copiar para WhatsApp', { icono: 'whatsapp', disabled: !g.total, onclick: function () { Comun.copiarWhatsApp(textoWhatsApp(titulo, g)); } }),
        Comun.boton('Imprimir', { icono: 'print', primario: true, disabled: !g.total, onclick: function () { App.Exportar.imprimir(); } })]
    }));

    if (!d.recetas.some(function (r) { return !r.archivado && r.tipo !== 'preparacion'; })) {
      cont.appendChild(Comun.vacio({ emoji: '📖', titulo: 'Tu carta está vacía', texto: 'Crea tus productos y ponles precio para armar la carta.', acciones: [Comun.boton('Crear un producto', { primario: true, onclick: function () { App.Router.ir('productos'); } })] }));
      return;
    }

    var canal = Form.seleccion({ etiqueta: 'Precios del canal', valor: op.canalId, vacio: canales.length ? false : 'Precio base', opciones: canales.map(function (c) { return { valor: c.id, texto: c.nombre }; }) });
    var tit = Form.texto({ etiqueta: 'Título', valor: titulo, maxlength: 60 });
    var pie = Form.texto({ etiqueta: 'Mensaje al final (opcional)', valor: op.pie, maxlength: 120, placeholder: 'Ej. Pedidos por WhatsApp al 300 000 0000' });
    var combos = Form.casilla({ etiqueta: 'Incluir combos', valor: op.combos });
    var desc = Form.casilla({ etiqueta: 'Mostrar descripciones', valor: op.descripciones });
    var emo = Form.casilla({ etiqueta: 'Mostrar emojis', valor: op.emojis });
    canal.alCambiar(function () { op.canalId = canal.get(); App.Router.refrescar(); });
    combos.alCambiar(function () { op.combos = combos.get(); App.Router.refrescar(); });
    desc.alCambiar(function () { op.descripciones = desc.get(); App.Router.refrescar(); });
    emo.alCambiar(function () { op.emojis = emo.get(); App.Router.refrescar(); });
    tit.alCambiar(App.Dom.debounce(function () { op.titulo = tit.get(); pintarVista(); }, 200));
    pie.alCambiar(App.Dom.debounce(function () { op.pie = pie.get(); pintarVista(); }, 200));

    cont.appendChild(h('div', { class: 'tarjeta pila no-imprimir' }, Form.rejilla([canal, tit, pie]), h('div', { class: 'fila' }, combos.el, desc.el, emo.el)));
    if (g.sinPrecio.length) cont.appendChild(h('div', { class: 'no-imprimir' }, Comun.aviso('warn', ['No aparecen porque no tienen precio en este canal: ', g.sinPrecio.map(function (r, i) { return [i ? ', ' : '', h('a', { href: '#/productos/' + r.id }, r.nombre)]; }), '.'])));

    var vista = h('div', { class: 'carta', 'aria-label': 'Vista previa de la carta' });
    cont.appendChild(vista);
    function pintarVista() {
      App.Dom.limpiar(vista);
      var t = op.titulo === null ? doc.config.nombreNegocio : op.titulo;
      vista.appendChild(h('h2', { class: 'carta-titulo' }, t || 'Carta'));
      if (!g.total) { vista.appendChild(h('p', { class: 'muted' }, 'Ningún producto tiene precio todavía.')); return; }
      g.cats.forEach(function (k) {
        vista.appendChild(h('section', { class: 'carta-seccion' },
          h('h3', null, k),
          g.porCat[k].map(function (x) {
            return h('div', { class: 'carta-item' },
              h('div', { class: 'carta-linea' }, h('span', { class: 'carta-nombre' }, (op.emojis ? x.r.emoji + ' ' : '') + x.r.nombre), h('span', { class: 'carta-punteado', 'aria-hidden': 'true' }), h('span', { class: 'carta-precio' }, F.cop(x.precio))),
              op.descripciones && x.r.descripcion ? h('div', { class: 'carta-desc' }, x.r.descripcion) : null);
          })));
      });
      if (op.pie) vista.appendChild(h('p', { class: 'carta-pie' }, op.pie));
    }
    pintarVista();
  }

  App.registrarVista('carta', { titulo: 'Carta', render: render });
})(typeof self !== 'undefined' ? self : this);
