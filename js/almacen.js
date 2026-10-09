/* Persistencia. Hoy usa localStorage, pero toda la app habla con esta interfaz (cargar, guardar, uso):
   migrar a IndexedDB significa reemplazar solo este archivo. UMD con almacenamiento inyectable (pruebas). */
(function (root, factory) {
  var M;
  if (typeof module === 'object' && module.exports) M = require('./nucleo/modelo.js'); else M = root.App.Modelo;
  var mod = factory(M, root);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Almacen = mod; }
}(typeof self !== 'undefined' ? self : this, function (M, root) {
  'use strict';

  var LIMITE_CARACTERES = 5000000; // estimación conservadora de la cuota de localStorage (~5 MB)

  function almacenamientoPorDefecto() {
    try {
      var ls = root.localStorage;
      var k = '__prueba__';
      ls.setItem(k, '1'); ls.removeItem(k);
      return ls;
    } catch (e) { return null; }
  }

  function crear(storage) {
    var st = storage === undefined ? almacenamientoPorDefecto() : storage;
    var CLAVE = M.CLAVE, BAK = M.CLAVE + '.bak';
    var memoria = null; // respaldo en memoria si no hay localStorage (modo privado)

    function leer(k) { try { return st ? st.getItem(k) : null; } catch (e) { return null; } }

    return {
      disponible: function () { return !!st; },

      /** Devuelve {estado:'vacio'|'ok'|'corrupto'|'sinAcceso', doc?, error?, hayBak?}. No modifica nada. */
      cargar: function () {
        if (!st) return { estado: 'sinAcceso', doc: null, error: 'Este navegador no permite guardar datos (¿modo privado?).' };
        var txt = leer(CLAVE);
        if (txt === null || txt === '') return { estado: 'vacio', doc: null, hayBak: leer(BAK) !== null };
        try {
          var doc = JSON.parse(txt);
          if (!doc || typeof doc !== 'object') throw new Error('Formato inesperado');
          return { estado: 'ok', doc: doc };
        } catch (e) {
          return { estado: 'corrupto', doc: null, error: e.message, textoOriginal: txt, hayBak: leer(BAK) !== null };
        }
      },

      /** Lee la copia .bak (último estado válido anterior). */
      leerBak: function () {
        var txt = leer(BAK);
        if (!txt) return null;
        try { return JSON.parse(txt); } catch (e) { return null; }
      },

      /** Guarda el documento. Antes copia el último estado válido a .bak. Devuelve {ok, error?}. */
      guardar: function (doc) {
        var texto;
        try { texto = JSON.stringify(doc); } catch (e) { return { ok: false, error: 'No se pudo preparar el guardado: ' + e.message }; }
        if (!st) { memoria = texto; return { ok: false, error: 'Este navegador no permite guardar datos (¿modo privado?). Descarga un respaldo para no perder tu trabajo.' }; }
        var previo = leer(CLAVE), bakOmitido = false;
        if (previo) {
          try { JSON.parse(previo); st.setItem(BAK, previo); }
          catch (e) {
            // sin espacio para el respaldo (o el previo estaba dañado): se intenta guardar igual
            if (e && e.name === 'SyntaxError') { /* el previo no era válido: no lo copiamos */ } else { bakOmitido = true; try { st.removeItem(BAK); } catch (e2) { /* nada */ } }
          }
        }
        try {
          st.setItem(CLAVE, texto);
          return { ok: true, bakOmitido: bakOmitido };
        } catch (e) {
          var lleno = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
          return { ok: false, error: lleno ? 'El almacenamiento del navegador está lleno. Descarga un respaldo y libera espacio.' : 'No se pudo guardar: ' + (e && e.message) };
        }
      },

      /** Uso aproximado de la cuota: {caracteres, limite, pct}. */
      uso: function () {
        var n = 0;
        if (st) {
          [CLAVE, BAK].forEach(function (k) { var v = leer(k); if (v) n += v.length + k.length; });
        }
        return { caracteres: n, limite: LIMITE_CARACTERES, pct: n / LIMITE_CARACTERES };
      },

      borrarTodo: function () { try { if (st) { st.removeItem(CLAVE); st.removeItem(BAK); } } catch (e) { /* nada */ } },

      /** Escucha cambios hechos desde otra pestaña. `ventana` debe tener addEventListener. */
      escuchar: function (ventana, callback) {
        if (!ventana || !ventana.addEventListener) return function () {};
        function fn(ev) { if (ev.key === CLAVE) callback(ev); }
        ventana.addEventListener('storage', fn);
        return function () { ventana.removeEventListener('storage', fn); };
      },

      CLAVE: CLAVE, BAK: BAK
    };
  }

  return { crear: crear, LIMITE_CARACTERES: LIMITE_CARACTERES };
}));
