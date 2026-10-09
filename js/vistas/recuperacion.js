/* Pantalla de recuperación cuando los datos guardados no se pueden leer. Nunca borra nada sin que la persona lo pida. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, E = App.Estado, F = App.Formato;

  function mostrar(info, alResolver) {
    var resuelto = false;
    var m;
    var mensajeError = h('div');

    function resolver() {
      resuelto = true;
      m.cerrar();
      alResolver();
    }

    var razon = info.estado === 'corrupto'
      ? 'Los datos guardados en este navegador están dañados y no se pueden leer.'
      : 'Los datos guardados no pasaron la revisión de seguridad:';
    var detalle = info.estado === 'invalido' && info.errores
      ? h('ul', null, info.errores.slice(0, 6).map(function (e) { return h('li', null, e); })) : null;

    var opciones = h('div', { class: 'pila' });

    if (info.hayBak) {
      opciones.appendChild(h('div', { class: 'tarjeta' },
        h('h3', null, '1. Restaurar la última copia automática'),
        h('p', { class: 'explicacion' }, 'La app guarda una copia del estado anterior cada vez que guardas. Es lo más rápido; puede faltar lo último que hiciste.'),
        h('button', {
          type: 'button', class: 'btn btn-primario', onclick: function () {
            var r = E.restaurarBak();
            if (r.ok) { App.Toast.ok('Copia restaurada.'); resolver(); }
            else { App.Dom.limpiar(mensajeError); mensajeError.appendChild(App.Comun.aviso('error', ['La copia tampoco se puede usar: ', r.errores.join(' ')], 'alert')); }
          }
        }, 'Restaurar la copia')));
    }

    var cajaImportar = h('details', { class: 'tarjeta' },
      h('summary', null, h('strong', null, (info.hayBak ? '2' : '1') + '. Importar un respaldo (.json) que hayas descargado')),
      h('div', { style: { marginTop: '.75rem' } }, App.Importar.panel({ alAplicar: function () { resolver(); } })));
    opciones.appendChild(cajaImportar);

    if (info.textoOriginal) {
      opciones.appendChild(h('div', { class: 'tarjeta' },
        h('h3', null, (info.hayBak ? '3' : '2') + '. Descargar los datos dañados'),
        h('p', { class: 'explicacion' }, 'Guarda una copia tal cual está, por si alguien la puede reparar. No cambia nada.'),
        h('button', {
          type: 'button', class: 'btn', onclick: function () {
            App.Dom.descargar('datos-danados-' + F.hoy() + '.json', info.textoOriginal, 'application/json;charset=utf-8');
          }
        }, 'Descargar copia de los datos dañados')));
    }

    opciones.appendChild(h('div', { class: 'tarjeta' },
      h('h3', null, 'Empezar de cero'),
      h('p', { class: 'explicacion' }, 'Borra lo que hay guardado y arranca con una app vacía. Hazlo solo si ya descargaste los datos dañados o no los necesitas.'),
      h('button', {
        type: 'button', class: 'btn btn-peligro', onclick: function () {
          App.Modal.confirmar({
            titulo: 'Empezar de cero', peligro: true, palabra: 'BORRAR', textoConfirmar: 'Borrar y empezar de cero',
            mensaje: 'Se perderán los datos guardados en este navegador (los dañados). Esta acción no se puede deshacer.'
          }).then(function (ok) { if (ok) { E.empezarDeCero(); resolver(); } });
        }
      }, 'Empezar de cero')));

    m = App.Modal.abrir({
      titulo: 'No pude leer tus datos', tamano: 'ancho', bloquearEsc: true,
      contenido: h('div', { class: 'pila' }, App.Comun.aviso('error', [h('strong', null, razon), detalle, 'No he borrado ni cambiado nada.'], 'alert'), mensajeError, opciones),
      alCerrar: function () {
        if (resuelto) return;
        // Si la persona cierra el diálogo sin elegir, dejamos un acceso visible para volver.
        var cont = document.getElementById('contenido');
        if (cont) {
          App.Dom.limpiar(cont);
          cont.appendChild(App.Comun.vacio({
            emoji: '🛟', titulo: 'Tus datos no se cargaron', texto: 'Tus datos guardados siguen intactos. Elige cómo recuperarlos.',
            acciones: [h('button', { type: 'button', class: 'btn btn-primario', onclick: function () { mostrar(info, alResolver); } }, 'Ver opciones de recuperación')]
          }));
        }
      }
    });
  }

  App.Recuperacion = { mostrar: mostrar };
})(typeof self !== 'undefined' ? self : this);
