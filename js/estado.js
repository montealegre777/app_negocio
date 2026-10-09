/* Estado en memoria: documento, mutaciones centralizadas, guardado con retardo, suscripciones y contexto de cálculo memorizado. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var M = App.Modelo, C = App.Calculos, Mig = App.Migraciones, V = App.Validacion;

  var alm = App.Almacen.crear();
  var doc = null;
  var version = 0;
  var ctxMem = null, ctxVer = -1;
  var ultimoTexto = null;
  var subs = [], subsGuardado = [], subsExterno = [];
  var timer = null;
  var guardado = { estado: 'guardado', mensaje: '' };
  var avisoCuota = false;
  var sinAlmacen = false;

  function notificar() { subs.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function notificarGuardado() { subsGuardado.slice().forEach(function (fn) { try { fn(guardado); } catch (e) { console.error(e); } }); }

  function guardarYa() {
    clearTimeout(timer); timer = null;
    if (!doc) return;
    doc.actualizadoEn = M.ahoraISO();
    var r = alm.guardar(doc);
    if (r.ok) {
      try { ultimoTexto = JSON.stringify(doc); } catch (e) { ultimoTexto = null; }
      guardado = { estado: 'guardado', mensaje: 'Guardado', hora: Date.now() };
      var u = alm.uso();
      if (u.pct > 0.7 && !avisoCuota) {
        avisoCuota = true;
        if (App.Toast) App.Toast.mostrar('Tu almacenamiento va en ' + Math.round(u.pct * 100) + ' %. Descarga un respaldo y considera archivar datos viejos.', { tipo: 'error', duracion: 10000 });
      }
    } else {
      guardado = { estado: 'error', mensaje: r.error || 'No se pudo guardar' };
      if (App.Toast) App.Toast.error(guardado.mensaje, { duracion: 10000 });
    }
    notificarGuardado();
  }

  function programarGuardado() {
    guardado = { estado: 'pendiente', mensaje: 'Guardando…' };
    notificarGuardado();
    clearTimeout(timer);
    timer = setTimeout(guardarYa, 350);
  }

  /**
   * Carga los datos al arrancar. Devuelve {estado: 'nuevo'|'ok'|'migrado'|'invalido'|'corrupto'|'sinAcceso', ...}.
   * En 'invalido' y 'corrupto' NO se modifica nada: la interfaz ofrece restaurar la copia o importar.
   */
  function iniciar() {
    var r = alm.cargar();
    if (r.estado === 'sinAcceso') {
      sinAlmacen = true; doc = M.docNuevo(); version++;
      return { estado: 'sinAcceso', mensaje: r.error };
    }
    if (r.estado === 'vacio') {
      doc = M.docNuevo(); version++;
      guardarYa();
      return { estado: 'nuevo', hayBak: r.hayBak };
    }
    if (r.estado === 'corrupto') return { estado: 'corrupto', textoOriginal: r.textoOriginal, hayBak: r.hayBak, error: r.error };
    var mig = Mig.migrar(r.doc);
    if (!mig.doc) return { estado: 'invalido', errores: [mig.error], textoOriginal: JSON.stringify(r.doc), hayBak: !!alm.leerBak() };
    var val = V.validarDocumento(mig.doc);
    if (!val.ok) return { estado: 'invalido', errores: val.errores, textoOriginal: JSON.stringify(r.doc), hayBak: !!alm.leerBak() };
    doc = mig.doc; version++;
    try { ultimoTexto = JSON.stringify(doc); } catch (e) { ultimoTexto = null; }
    if (mig.migrado) { guardarYa(); return { estado: 'migrado', desde: mig.desde }; }
    return { estado: 'ok' };
  }

  function usarDocumento(nuevo) { doc = nuevo; version++; ctxMem = null; guardarYa(); notificar(); }

  /** Intenta restaurar desde la copia .bak. Devuelve {ok, errores?}. */
  function restaurarBak() {
    var b = alm.leerBak();
    if (!b) return { ok: false, errores: ['No hay copia de respaldo disponible.'] };
    var mig = Mig.migrar(b);
    if (!mig.doc) return { ok: false, errores: [mig.error] };
    var val = V.validarDocumento(mig.doc);
    if (!val.ok) return { ok: false, errores: val.errores };
    usarDocumento(mig.doc);
    return { ok: true };
  }

  function empezarDeCero() { usarDocumento(M.docNuevo()); }

  /**
   * Única puerta de escritura. fn(doc) modifica el documento (usando Operaciones).
   * opciones: {deshacer: 'Texto del aviso'} muestra «Deshacer» durante 8 s.
   */
  function mutar(fn, opciones) {
    var op = opciones || {};
    var antes = null;
    if (op.deshacer) { try { antes = JSON.stringify(doc); } catch (e) { antes = null; } }
    var resultado;
    try {
      resultado = fn(doc);
    } catch (e) {
      console.error(e);
      if (ultimoTexto) { try { doc = JSON.parse(ultimoTexto); } catch (e2) { /* nada */ } }
      version++; ctxMem = null;
      if (App.Toast) App.Toast.error('No se pudo completar la acción: ' + (e && e.message ? e.message : 'error inesperado') + '. Tus datos quedaron como estaban.');
      notificar();
      return undefined;
    }
    version++; ctxMem = null;
    programarGuardado();
    notificar();
    if (op.deshacer && antes && App.Toast) {
      App.Toast.mostrar(op.deshacer, {
        accion: 'Deshacer', duracion: 8000,
        onAccion: function () { try { usarDocumento(JSON.parse(antes)); App.Toast.ok('Acción deshecha.'); } catch (e) { App.Toast.error('No se pudo deshacer.'); } }
      });
    }
    return resultado;
  }

  /** Cambia algo sin disparar re-render (p. ej. fecha del último respaldo). */
  function mutarSilencioso(fn) {
    fn(doc); version++; ctxMem = null; programarGuardado();
  }

  function ctx() {
    if (!ctxMem || ctxVer !== version) { ctxMem = C.crearContexto(doc); ctxVer = version; }
    return ctxMem;
  }

  function recargarDesdeAlmacen() {
    var r = alm.cargar();
    if (r.estado !== 'ok') return false;
    var mig = Mig.migrar(r.doc);
    if (!mig.doc || !V.validarDocumento(mig.doc).ok) return false;
    doc = mig.doc; version++; ctxMem = null;
    try { ultimoTexto = JSON.stringify(doc); } catch (e) { /* nada */ }
    notificar();
    return true;
  }

  function vigilarOtraPestana() {
    alm.escuchar(root, function () { subsExterno.slice().forEach(function (fn) { fn(); }); });
  }

  window.addEventListener('beforeunload', function () { if (timer) guardarYa(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && timer) guardarYa(); });

  App.Estado = {
    iniciar: iniciar, doc: function () { return doc; }, datos: function () { return doc.datos; }, config: function () { return doc.config; },
    mutar: mutar, mutarSilencioso: mutarSilencioso, ctx: ctx, guardarYa: guardarYa,
    suscribir: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
    suscribirGuardado: function (fn) { subsGuardado.push(fn); return function () { subsGuardado = subsGuardado.filter(function (x) { return x !== fn; }); }; },
    alCambioExterno: function (fn) { subsExterno.push(fn); },
    vigilarOtraPestana: vigilarOtraPestana, recargarDesdeAlmacen: recargarDesdeAlmacen,
    estadoGuardado: function () { return guardado; }, uso: function () { return alm.uso(); }, almacen: alm,
    sinAlmacenamiento: function () { return sinAlmacen; },
    restaurarBak: restaurarBak, empezarDeCero: empezarDeCero, usarDocumento: usarDocumento,
    borrarTodo: function () { alm.borrarTodo(); usarDocumento(M.docNuevo()); },
    hoy: function () { return App.Formato.hoy(); }
  };
})(typeof self !== 'undefined' ? self : this);
