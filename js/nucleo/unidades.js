/* Conversión de unidades y equivalencias. Lógica pura (UMD): corre en el navegador y en Node. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Unidades = mod; }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Cada unidad: familia y factor hacia la unidad base de su familia.
  var UNIDADES = {
    g:      { familia: 'masa',     factor: 1,    nombre: 'g (gramo)' },
    kg:     { familia: 'masa',     factor: 1000, nombre: 'kg (kilogramo)' },
    ml:     { familia: 'volumen',  factor: 1,    nombre: 'ml (mililitro)' },
    l:      { familia: 'volumen',  factor: 1000, nombre: 'l (litro)' },
    und:    { familia: 'conteo',   factor: 1,    nombre: 'und (unidad)' },
    docena: { familia: 'conteo',   factor: 12,   nombre: 'docena (12 und)' }
  };
  var BASE_POR_FAMILIA = { masa: 'g', volumen: 'ml', conteo: 'und' };
  var UNIDADES_BASE = ['g', 'ml', 'und'];

  function ErrorUnidades(mensaje) {
    this.name = 'ErrorUnidades';
    this.message = mensaje || 'Unidades incompatibles';
  }
  ErrorUnidades.prototype = Object.create(Error.prototype);
  ErrorUnidades.prototype.constructor = ErrorUnidades;

  function familia(u) { return UNIDADES[u] ? UNIDADES[u].familia : null; }
  function esUnidad(u) { return Object.prototype.hasOwnProperty.call(UNIDADES, u); }
  function unidadesDeFamilia(f) {
    return Object.keys(UNIDADES).filter(function (u) { return UNIDADES[u].familia === f; });
  }
  function unidadesCompatibles(unidadBase) {
    var f = familia(unidadBase);
    return f ? unidadesDeFamilia(f) : [];
  }

  /**
   * Convierte `cantidad` de la unidad `de` a la unidad `a`.
   * Solo dentro de la misma familia, salvo que exista una equivalencia
   * (p. ej. {de:'und', a:'g', factor:50} significa 1 und = 50 g).
   * Lanza ErrorUnidades('Unidades incompatibles') si no se puede.
   */
  function convertir(cantidad, de, a, equivalencias) {
    if (!esUnidad(de) || !esUnidad(a)) throw new ErrorUnidades('Unidad desconocida');
    if (de === a) return cantidad;
    var uDe = UNIDADES[de], uA = UNIDADES[a];
    if (uDe.familia === uA.familia) return cantidad * uDe.factor / uA.factor;
    var eqs = equivalencias || [];
    for (var i = 0; i < eqs.length; i++) {
      var e = eqs[i];
      if (!e || !esUnidad(e.de) || !esUnidad(e.a) || !(e.factor > 0)) continue;
      var fDe = UNIDADES[e.de], fA = UNIDADES[e.a];
      // 1 e.de = e.factor e.a  →  en unidades base de cada familia
      if (fDe.familia === uDe.familia && fA.familia === uA.familia) {
        var base1 = cantidad * uDe.factor;                    // en base de la familia origen
        var base2 = base1 * (e.factor * fA.factor) / fDe.factor; // en base de la familia destino
        return base2 / uA.factor;
      }
      if (fA.familia === uDe.familia && fDe.familia === uA.familia) {
        var b1 = cantidad * uDe.factor;
        var b2 = b1 * fDe.factor / (e.factor * fA.factor);
        return b2 / uA.factor;
      }
    }
    throw new ErrorUnidades('Unidades incompatibles');
  }

  /** Igual que convertir, pero devuelve {ok, valor} o {ok:false, error} sin lanzar. */
  function intentarConvertir(cantidad, de, a, equivalencias) {
    try { return { ok: true, valor: convertir(cantidad, de, a, equivalencias) }; }
    catch (e) { return { ok: false, error: e.message || 'Unidades incompatibles' }; }
  }

  function sePuedeConvertir(de, a, equivalencias) {
    return intentarConvertir(1, de, a, equivalencias).ok;
  }

  return {
    UNIDADES: UNIDADES,
    UNIDADES_BASE: UNIDADES_BASE,
    BASE_POR_FAMILIA: BASE_POR_FAMILIA,
    ErrorUnidades: ErrorUnidades,
    familia: familia,
    esUnidad: esUnidad,
    unidadesDeFamilia: unidadesDeFamilia,
    unidadesCompatibles: unidadesCompatibles,
    convertir: convertir,
    intentarConvertir: intentarConvertir,
    sePuedeConvertir: sePuedeConvertir
  };
}));
