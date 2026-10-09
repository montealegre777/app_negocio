'use strict';
const M = require('../js/nucleo/modelo.js');
const F = require('../js/nucleo/formato.js');
const C = require('../js/nucleo/calculos.js');
const D = require('../js/nucleo/derivados.js');
const O = require('../js/nucleo/operaciones.js');
const A = require('../js/nucleo/analisis.js');
const Demo = require('../js/demo.js');

const HOY = '2026-10-09';

function docDemo() {
  const doc = M.docNuevo();
  Demo.generar(doc, { hoy: HOY });
  return doc;
}
function porNombre(arr, nombre) { return arr.find((x) => x.nombre === nombre); }
function cerca(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }

/** Documento mínimo con un insumo y una receta de una línea. */
function docSimple() {
  const doc = M.docNuevo();
  return doc;
}
function agregarInsumo(doc, nombre, unidadBase, precio, cantidad, unidad, extra) {
  return O.guardarInsumo(doc, M.nuevoInsumo(Object.assign({ nombre, unidadBase, presentacion: { precio, cantidad, unidad } }, extra || {})));
}

module.exports = { M, F, C, D, O, A, Demo, HOY, docDemo, porNombre, cerca, docSimple, agregarInsumo };
