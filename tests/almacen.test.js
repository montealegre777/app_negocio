'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Almacen = require('../js/almacen.js');
const M = require('../js/nucleo/modelo.js');

function storageFalso(limite) {
  const datos = new Map();
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => {
      const total = [...datos.entries()].filter(([kk]) => kk !== k).reduce((s, [, vv]) => s + vv.length, 0) + v.length;
      if (limite && total > limite) { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; }
      datos.set(k, String(v));
    },
    removeItem: (k) => datos.delete(k)
  };
}

test('cargar con almacén vacío', () => {
  const a = Almacen.crear(storageFalso());
  assert.equal(a.cargar().estado, 'vacio');
});

test('guardar y cargar; el estado anterior pasa a .bak', () => {
  const st = storageFalso();
  const a = Almacen.crear(st);
  const d1 = M.docNuevo(); d1.config.nombreNegocio = 'Uno';
  assert.equal(a.guardar(d1).ok, true);
  const d2 = M.docNuevo(); d2.config.nombreNegocio = 'Dos';
  assert.equal(a.guardar(d2).ok, true);
  assert.equal(a.cargar().doc.config.nombreNegocio, 'Dos');
  assert.equal(a.leerBak().config.nombreNegocio, 'Uno');
});

test('dato corrupto: se detecta, no se pierde el texto original y se ofrece el .bak', () => {
  const st = storageFalso();
  const a = Almacen.crear(st);
  const d1 = M.docNuevo(); d1.config.nombreNegocio = 'Bueno';
  a.guardar(d1); a.guardar(d1);
  st.setItem(M.CLAVE, '{"esto está roto');
  const r = a.cargar();
  assert.equal(r.estado, 'corrupto');
  assert.equal(r.textoOriginal, '{"esto está roto');
  assert.equal(r.hayBak, true);
  assert.equal(a.leerBak().config.nombreNegocio, 'Bueno');
  // guardar sobre un dato corrupto NO sobreescribe el .bak bueno con basura
  a.guardar(d1);
  assert.equal(a.leerBak().config.nombreNegocio, 'Bueno');
});

test('cuota llena: error legible y el dato anterior sigue intacto', () => {
  const st = storageFalso(3000);
  const a = Almacen.crear(st);
  const chico = M.docNuevo();
  assert.equal(a.guardar(chico).ok, true);
  const grande = M.docNuevo();
  for (let i = 0; i < 200; i++) grande.datos.clientes.push({ id: 'c' + i, nombre: 'Cliente ' + i + ' con un nombre largo para ocupar espacio' });
  const r = a.guardar(grande);
  assert.equal(r.ok, false);
  assert.match(r.error, /lleno/);
  assert.equal(a.cargar().estado, 'ok');
  assert.equal(a.cargar().doc.datos.clientes.length, 0);
});

test('sin almacenamiento (modo privado): avisa en vez de fallar', () => {
  const a = Almacen.crear(null);
  assert.equal(a.cargar().estado, 'sinAcceso');
  const r = a.guardar(M.docNuevo());
  assert.equal(r.ok, false);
  assert.match(r.error, /respaldo/);
});

test('uso de cuota', () => {
  const st = storageFalso();
  const a = Almacen.crear(st);
  a.guardar(M.docNuevo());
  const u = a.uso();
  assert.ok(u.caracteres > 0 && u.pct > 0 && u.pct < 1);
});
