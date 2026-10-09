/* Avisos emergentes con botón opcional (p. ej. "Deshacer" durante 8 segundos). Región aria-live. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h;
  var region = null;

  function asegurarRegion() {
    if (region && document.body.contains(region)) return region;
    region = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.appendChild(region);
    return region;
  }

  /**
   * mostrar('Texto', {tipo:'ok'|'error'|'info', accion:'Deshacer', onAccion: fn, duracion: ms})
   */
  function mostrar(mensaje, op) {
    op = op || {};
    var cont = asegurarRegion();
    var cerrado = false;
    var el = h('div', { class: 'toast' + (op.tipo === 'ok' ? ' ok' : op.tipo === 'error' ? ' error' : '') });
    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(timer);
      el.remove();
    }
    el.appendChild(h('span', null, mensaje));
    if (op.accion) {
      el.appendChild(h('button', { type: 'button', class: 'btn', onclick: function () { cerrar(); if (op.onAccion) op.onAccion(); } }, op.accion));
    }
    el.appendChild(h('button', { type: 'button', class: 'btn btn-icono', 'aria-label': 'Cerrar aviso', onclick: cerrar }, App.Dom.icono('x')));
    cont.appendChild(el);
    while (cont.children.length > 4) cont.removeChild(cont.firstChild);
    var dur = op.duracion || (op.accion ? 8000 : op.tipo === 'error' ? 8000 : 3800);
    var timer = setTimeout(cerrar, dur);
    return { cerrar: cerrar };
  }

  App.Toast = {
    mostrar: mostrar,
    ok: function (m, op) { return mostrar(m, Object.assign({ tipo: 'ok' }, op || {})); },
    error: function (m, op) { return mostrar(m, Object.assign({ tipo: 'error' }, op || {})); }
  };
})(typeof self !== 'undefined' ? self : this);
