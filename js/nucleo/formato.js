/* Formato COP, porcentajes, fechas (dd/mm/aaaa, semana desde lunes, America/Bogota) y parseNumeroCO(). UMD. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Formato = mod; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ZONA = 'America/Bogota';
  var nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var nfCant = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

  function esNumero(n) { return typeof n === 'number' && isFinite(n); }

  /** `$ 12.500`. Los valores absolutos menores de 100 muestran hasta 2 decimales. */
  function cop(n, opciones) {
    if (!esNumero(n)) return '—';
    var o = opciones || {};
    var abs = Math.abs(n);
    var dec = o.decimales;
    var texto;
    if (dec === 0) texto = nf0.format(abs);
    else if (typeof dec === 'number') texto = new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(abs);
    else texto = abs < 100 && abs !== 0 ? nf2.format(abs) : nf0.format(abs);
    // evitar "-$ 0"
    var negativo = n < 0 && texto.replace(/[^1-9]/g, '') !== '';
    return (negativo ? '-' : '') + '$ ' + texto;
  }

  /** Cantidad con hasta 3 decimales, estilo es-CO. */
  function cantidad(n) { return esNumero(n) ? nfCant.format(n) : '—'; }

  /** Fracción → porcentaje. pct(0.4329) → "43,3 %". */
  function pct(f, decimales) {
    if (!esNumero(f)) return '—';
    var d = typeof decimales === 'number' ? decimales : 1;
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(f * 100) + ' %';
  }

  /** Número simple para campos de entrada (sin símbolo, con coma decimal). */
  function numeroEditable(n, maxDec, agrupar) {
    if (!esNumero(n)) return '';
    var d = typeof maxDec === 'number' ? maxDec : 4;
    return new Intl.NumberFormat('es-CO', { useGrouping: !!agrupar, maximumFractionDigits: d }).format(n);
  }

  /**
   * Interpreta lo que escribe el usuario (formato es-CO).
   * Si hay coma: la coma es decimal y los puntos son miles.
   * Solo puntos y cumple ^\d{1,3}(\.\d{3})+$ → miles. Otro caso: el punto es decimal.
   * Devuelve un número o null si es inválido.
   */
  function parseNumeroCO(texto) {
    if (typeof texto === 'number') return isFinite(texto) ? texto : null;
    if (typeof texto !== 'string') return null;
    var t = texto.trim().replace(/\s+/g, '').replace(/^\$/, '').replace(/%$/, '');
    if (t === '') return null;
    var signo = 1;
    if (t[0] === '-') { signo = -1; t = t.slice(1); }
    else if (t[0] === '+') { t = t.slice(1); }
    if (t === '') return null;
    var normal;
    if (t.indexOf(',') !== -1) {
      if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$|^\d*,\d+$/.test(t)) return null;
      normal = t.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
      normal = t.replace(/\./g, '');
    } else if (/^\d+(\.\d+)?$/.test(t) || /^\.\d+$/.test(t)) {
      normal = t;
    } else {
      return null;
    }
    var n = parseFloat(normal);
    return isFinite(n) ? signo * n : null;
  }

  /** Porcentaje escrito como "20" o "20 %" → 0.20. Devuelve null si es inválido. */
  function parsePorcentaje(texto) {
    var n = parseNumeroCO(texto);
    return n === null ? null : n / 100;
  }

  // ---------- Fechas (texto AAAA-MM-DD, sin hora) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function hoy(ahora) {
    var d = ahora instanceof Date ? ahora : new Date();
    var partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return partes; // AAAA-MM-DD
  }

  function esFechaISO(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }

  function aUTC(iso) { var p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function deUTC(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  function sumarDias(iso, n) { return deUTC(aUTC(iso) + n * 86400000); }
  function diasEntre(desde, hasta) { return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000); }
  function diaSemana(iso) { var d = new Date(aUTC(iso)).getUTCDay(); return (d + 6) % 7; } // 0 = lunes
  function inicioSemana(iso) { return sumarDias(iso, -diaSemana(iso)); }
  function finSemana(iso) { return sumarDias(inicioSemana(iso), 6); }
  function inicioMes(iso) { return iso.slice(0, 8) + '01'; }
  function mesDe(iso) { return iso.slice(0, 7); }
  function finMes(iso) {
    var p = iso.split('-').map(Number);
    return deUTC(Date.UTC(p[0], p[1], 0));
  }
  function diasDelMes(iso) { return Number(finMes(iso).slice(8)); }
  function sumarMeses(mes, n) { // mes: AAAA-MM
    var p = mes.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
  }

  /** dd/mm/aaaa */
  function fecha(iso) {
    if (!esFechaISO(iso)) return '—';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }
  var NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  function nombreMes(mes) { // AAAA-MM → "octubre 2026"
    var p = mes.split('-').map(Number);
    return NOMBRES_MES[p[1] - 1] + ' ' + p[0];
  }
  function fechaCorta(iso) { // "vie 09/10"
    if (!esFechaISO(iso)) return '—';
    return DIAS_SEMANA[diaSemana(iso)] + ' ' + iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }
  function fechaHora(isoUTC) {
    if (!isoUTC) return '—';
    try {
      return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(isoUTC));
    } catch (e) { return '—'; }
  }

  function redondearArriba(valor, multiplo) {
    var m = multiplo > 0 ? multiplo : 1;
    return Math.ceil(valor / m - 1e-9) * m;
  }

  return {
    ZONA: ZONA, NOMBRES_MES: NOMBRES_MES, DIAS_SEMANA: DIAS_SEMANA,
    esNumero: esNumero, cop: cop, cantidad: cantidad, pct: pct, numeroEditable: numeroEditable,
    parseNumeroCO: parseNumeroCO, parsePorcentaje: parsePorcentaje,
    hoy: hoy, esFechaISO: esFechaISO, sumarDias: sumarDias, diasEntre: diasEntre, diaSemana: diaSemana,
    inicioSemana: inicioSemana, finSemana: finSemana, inicioMes: inicioMes, finMes: finMes, mesDe: mesDe,
    diasDelMes: diasDelMes, sumarMeses: sumarMeses, fecha: fecha, fechaCorta: fechaCorta, fechaHora: fechaHora,
    nombreMes: nombreMes, redondearArriba: redondearArriba
  };
}));
