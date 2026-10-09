/* Calculadora rápida: costo y precio sueltos → ganancia, margen y % sobre el costo; y precio sugerido para un margen. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, E = App.Estado, Form = App.Form;

  function abrir() {
    var cfg = E.doc() ? E.config() : { baseMarkup: 'produccion', margenObjetivo: 0.3, redondeoPrecio: 100 };
    var costo = Form.numero({ etiqueta: 'Lo que te cuesta producir una unidad', tipo: 'moneda', valor: 1000 });
    var precio = Form.numero({ etiqueta: 'Precio al que la vendes', tipo: 'moneda', valor: 2000 });
    var comision = Form.numero({ etiqueta: 'Comisión del canal (opcional)', tipo: 'porcentaje', valor: 0, ayuda: 'Solo si vendes por una plataforma que cobra un porcentaje.' });
    var margen = Form.numero({ etiqueta: 'Margen que quieres ganar', tipo: 'porcentaje', valor: cfg.margenObjetivo, ayuda: 'Valor sugerido, ajústalo a tu negocio.' });
    var salida = h('div', { class: 'pila', 'aria-live': 'polite' });
    var sugerido = h('div', { class: 'pila', 'aria-live': 'polite' });

    function leer(c) { var v = c.get(); return v === null ? 0 : v; }

    function recalcular() {
      App.Dom.limpiar(salida); App.Dom.limpiar(sugerido);
      [costo, precio, comision, margen].forEach(function (c) { c.error(''); });
      var vc = leer(costo), vp = leer(precio), vm = leer(comision), vg = leer(margen);
      var hayError = false;
      [[costo, vc], [precio, vp], [comision, vm], [margen, vg]].forEach(function (par) {
        if (isNaN(par[1])) { par[0].error('No entiendo ese número. Escríbelo así: 12.500 o 12,5.'); hayError = true; }
      });
      if (hayError) return;
      if (vm < 0 || vm >= 1) { comision.error('La comisión debe estar entre 0 % y menos de 100 %.'); return; }
      if (vc < 0 || vp < 0) { (vc < 0 ? costo : precio).error('No puede ser negativo.'); return; }
      var res = C.resultadoUnitario({ precio: vp, costoProd: vc, fijosAdic: 0, pctAdic: 0, comisionPct: vm }, cfg.baseMarkup);
      salida.appendChild(App.Comun.medidas(res, cfg));
      var rec = C.precioRecomendado({ costoProd: vc, fijosAdic: 0, pctAdic: 0, comisionPct: vm, margenObjetivo: vg, redondeo: cfg.redondeoPrecio });
      if (rec.ok) {
        sugerido.appendChild(h('div', { class: 'medida' },
          h('span', { class: 'small muted' }, 'Precio sugerido para ganar ' + F.pct(vg, 1)),
          h('b', null, F.cop(rec.precio)),
          h('span', { class: 'explicacion' }, 'Redondeado hacia arriba a ' + F.cop(cfg.redondeoPrecio) + '. Con ese precio el margen real es ' + F.pct(rec.margenReal, 1) + '.')));
      } else {
        sugerido.appendChild(App.Comun.aviso('warn', rec.mensaje));
      }
    }
    [costo, precio, comision, margen].forEach(function (c) { c.alCambiar(recalcular); });
    recalcular();

    var m = App.Modal.abrir({
      titulo: 'Calculadora rápida',
      contenido: h('div', { class: 'pila' },
        h('p', { class: 'explicacion' }, 'Sirve para pruebas sueltas: no guarda nada. Empieza con un ejemplo de $ 1.000 de costo y $ 2.000 de precio.'),
        Form.rejilla([costo, precio, comision, margen]), salida, sugerido),
      pie: [h('button', { type: 'button', class: 'btn btn-primario', onclick: function () { m.cerrar(); } }, 'Cerrar')]
    });
  }

  App.Acciones = App.Acciones || {};
  App.Acciones.calculadora = abrir;
})(typeof self !== 'undefined' ? self : this);
