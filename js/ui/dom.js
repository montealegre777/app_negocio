/* Utilidades de DOM. Los datos del usuario se insertan SIEMPRE como texto (nunca con innerHTML). */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};

  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, readOnly: 1, hidden: 1, indeterminate: 1, required: 1, multiple: 1 };

  function aplicarHijos(el, hijos) {
    for (var i = 0; i < hijos.length; i++) {
      var c = hijos[i];
      if (c === null || c === undefined || c === false || c === true) continue;
      if (Array.isArray(c)) aplicarHijos(el, c);
      else if (c.nodeType) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
  }

  /** h('div', {class:'x', onclick: fn}, hijos...) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs && typeof attrs === 'object' && !attrs.nodeType && !Array.isArray(attrs)) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROPS[k]) el[k] = v;
        else if (k === 'for') el.htmlFor = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
      aplicarHijos(el, Array.prototype.slice.call(arguments, 2));
    } else {
      aplicarHijos(el, Array.prototype.slice.call(arguments, 1));
    }
    return el;
  }

  function limpiar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icono(nombre, clase) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icono' + (clase ? ' ' + clase : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + nombre);
    svg.appendChild(use);
    return svg;
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function descargar(nombre, contenido, mime) {
    var blob = new Blob([contenido], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function copiar(texto) {
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText && root.isSecureContext) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return copiarRespaldo(texto); });
    }
    return Promise.resolve(copiarRespaldo(texto));
  }
  function copiarRespaldo(texto) {
    var ta = h('textarea', { 'aria-hidden': 'true', style: { position: 'fixed', top: '-1000px', opacity: '0' } });
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  App.Dom = { h: h, limpiar: limpiar, esc: esc, icono: icono, $: $, $$: $$, descargar: descargar, copiar: copiar, debounce: debounce };
})(typeof self !== 'undefined' ? self : this);
