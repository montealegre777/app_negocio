/* Campos de formulario accesibles: etiqueta, ayuda, error en línea (aria-invalid / aria-describedby). */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato;
  var uid = 0;

  function base(op, crear) {
    var id = 'f' + (++uid);
    var ayudaEl = op.ayuda ? h('div', { class: 'ayuda', id: id + '-ayuda' }, op.ayuda) : null;
    var errorEl = h('div', { class: 'error-texto', id: id + '-error', role: 'alert', hidden: true });
    var c = crear(id);
    var el = h('div', { class: 'campo' + (op.clase ? ' ' + op.clase : '') },
      op.etiqueta ? h('label', { for: id }, op.etiqueta, op.requerido ? h('span', { 'aria-hidden': 'true', class: 'muted' }, ' *') : null) : null,
      c.nodo, ayudaEl, errorEl);
    function error(msg) {
      if (msg) {
        errorEl.hidden = false; errorEl.textContent = msg; el.classList.add('con-error');
        c.input.setAttribute('aria-invalid', 'true');
        c.input.setAttribute('aria-describedby', id + '-error' + (ayudaEl ? ' ' + id + '-ayuda' : ''));
      } else {
        errorEl.hidden = true; errorEl.textContent = ''; el.classList.remove('con-error');
        c.input.removeAttribute('aria-invalid');
        if (ayudaEl) c.input.setAttribute('aria-describedby', id + '-ayuda'); else c.input.removeAttribute('aria-describedby');
      }
    }
    var campo = { el: el, input: c.input, error: error, id: id, focus: function () { c.input.focus(); } };
    Object.keys(c.api).forEach(function (k) { campo[k] = c.api[k]; });
    campo.alCambiar = function (fn) { c.input.addEventListener('input', fn); c.input.addEventListener('change', fn); return campo; };
    if (op.deshabilitado) c.input.disabled = true;
    return campo;
  }

  function texto(op) {
    op = op || {};
    return base(op, function (id) {
      var input = h('input', {
        type: op.tipo || 'text', id: id, placeholder: op.placeholder || '', maxlength: op.maxlength || 120,
        autocomplete: op.autocompletar || 'off', inputmode: op.modo
      });
      input.value = op.valor == null ? '' : op.valor;
      return { nodo: input, input: input, api: { get: function () { return input.value.trim(); }, set: function (v) { input.value = v == null ? '' : v; } } };
    });
  }

  function area(op) {
    op = op || {};
    return base(op, function (id) {
      var input = h('textarea', { id: id, rows: op.filas || 3, placeholder: op.placeholder || '', maxlength: op.maxlength || 600 });
      input.value = op.valor == null ? '' : op.valor;
      return { nodo: input, input: input, api: { get: function () { return input.value.trim(); }, set: function (v) { input.value = v == null ? '' : v; } } };
    });
  }

  /**
   * numero({etiqueta, valor, tipo: 'moneda'|'numero'|'porcentaje'|'entero', decimales, sufijo})
   * get() → número, null si está vacío, NaN si no se entiende. Los porcentajes se leen como 20 o 20 % y se devuelven como 0.20.
   */
  function numero(op) {
    op = op || {};
    var tipo = op.tipo || 'numero';
    var esPct = tipo === 'porcentaje';
    var decimales = op.decimales != null ? op.decimales : (esPct ? 3 : tipo === 'moneda' ? 4 : tipo === 'entero' ? 0 : 4);
    function fmt(n) {
      if (n === null || n === undefined || !isFinite(n)) return '';
      return F.numeroEditable(esPct ? n * 100 : n, esPct ? Math.max(decimales - 0, 1) : decimales, tipo === 'moneda');
    }
    return base(op, function (id) {
      var input = h('input', { type: 'text', id: id, inputmode: tipo === 'entero' ? 'numeric' : 'decimal', autocomplete: 'off', placeholder: op.placeholder || '', 'aria-label': op.etiqueta ? undefined : op.ariaLabel });
      input.value = fmt(op.valor);
      function leer() {
        var t = input.value.trim();
        if (t === '') return null;
        var n = F.parseNumeroCO(t);
        if (n === null) return NaN;
        return esPct ? n / 100 : n;
      }
      input.addEventListener('blur', function () { var v = leer(); if (v !== null && !isNaN(v)) input.value = fmt(v); });
      var nodo = input;
      if (tipo === 'moneda' || esPct || op.sufijo || op.prefijo) {
        nodo = h('div', { class: 'entrada-grupo' },
          tipo === 'moneda' ? h('span', { class: 'prefijo', 'aria-hidden': 'true' }, '$') : (op.prefijo ? h('span', { class: 'prefijo', 'aria-hidden': 'true' }, op.prefijo) : null),
          input,
          esPct ? h('span', { class: 'sufijo', 'aria-hidden': 'true' }, '%') : (op.sufijo ? h('span', { class: 'sufijo' }, op.sufijo) : null));
      }
      return {
        nodo: nodo, input: input,
        api: {
          get: leer,
          set: function (v) { input.value = fmt(v); },
          /** Valida y devuelve {ok, valor, mensaje}. `requerido` exige un valor. */
          leer: function (req) {
            var v = leer();
            if (v === null) return req ? { ok: false, mensaje: 'Escribe un número.' } : { ok: true, valor: null };
            if (isNaN(v)) return { ok: false, mensaje: 'No entiendo ese número. Escríbelo así: 12.500 o 12,5.' };
            return { ok: true, valor: v };
          }
        }
      };
    });
  }

  function seleccion(op) {
    op = op || {};
    return base(op, function (id) {
      var input = h('select', { id: id });
      if (op.vacio !== false && op.vacio !== undefined) input.appendChild(h('option', { value: '' }, op.vacio));
      (op.opciones || []).forEach(function (o) {
        var opt = h('option', { value: o.valor }, o.texto);
        if (o.desactivada) opt.disabled = true;
        input.appendChild(opt);
      });
      input.value = op.valor == null ? '' : op.valor;
      if (input.value !== (op.valor == null ? '' : String(op.valor)) && op.vacio === undefined && input.options.length) input.selectedIndex = 0;
      return {
        nodo: input, input: input,
        api: {
          get: function () { return input.value; },
          set: function (v) { input.value = v == null ? '' : v; },
          opciones: function (nuevas, valor) {
            while (input.firstChild) input.removeChild(input.firstChild);
            if (op.vacio !== false && op.vacio !== undefined) input.appendChild(h('option', { value: '' }, op.vacio));
            nuevas.forEach(function (o) { input.appendChild(h('option', { value: o.valor }, o.texto)); });
            input.value = valor == null ? '' : valor;
          }
        }
      };
    });
  }

  function fecha(op) {
    op = op || {};
    return base(op, function (id) {
      var input = h('input', { type: 'date', id: id });
      input.value = op.valor || '';
      return { nodo: input, input: input, api: { get: function () { return input.value; }, set: function (v) { input.value = v || ''; } } };
    });
  }

  function casilla(op) {
    op = op || {};
    var id = 'f' + (++uid);
    var input = h('input', { type: 'checkbox', id: id });
    input.checked = !!op.valor;
    var ayudaEl = op.ayuda ? h('div', { class: 'ayuda', id: id + '-ayuda' }, op.ayuda) : null;
    if (ayudaEl) input.setAttribute('aria-describedby', id + '-ayuda');
    var el = h('div', { class: 'campo' }, h('label', { class: 'casilla', for: id }, input, h('span', null, op.etiqueta)), ayudaEl);
    return {
      el: el, input: input, id: id, get: function () { return input.checked; }, set: function (v) { input.checked = !!v; },
      error: function () {}, focus: function () { input.focus(); },
      alCambiar: function (fn) { input.addEventListener('change', fn); return this; }
    };
  }

  function rejilla(campos, clase) {
    return h('div', { class: 'form-rejilla' + (clase ? ' ' + clase : '') }, campos.map(function (c) { return c.el || c; }));
  }

  /** Muestra errores {clave: mensaje} sobre un mapa {clave: campo}. Devuelve true si hay errores y enfoca el primero. */
  function mostrarErrores(mapa, errores) {
    var primero = null;
    Object.keys(mapa).forEach(function (k) {
      var msg = errores && errores[k];
      mapa[k].error(msg || '');
      if (msg && !primero) primero = mapa[k];
    });
    var extra = Object.keys(errores || {}).filter(function (k) { return !mapa[k]; });
    if (primero) primero.focus();
    return { hay: !!primero || extra.length > 0, sinCampo: extra.map(function (k) { return errores[k]; }) };
  }

  function ayudaPop(texto) {
    return h('button', { type: 'button', class: 'ayuda-pop', title: texto, 'aria-label': 'Ayuda: ' + texto, onclick: function (e) { e.preventDefault(); App.Modal.aviso('Ayuda', texto); } }, '?');
  }

  App.Form = { texto: texto, area: area, numero: numero, seleccion: seleccion, fecha: fecha, casilla: casilla, rejilla: rejilla, mostrarErrores: mostrarErrores, ayudaPop: ayudaPop };
})(typeof self !== 'undefined' ? self : this);
