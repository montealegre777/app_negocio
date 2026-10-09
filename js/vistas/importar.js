/* Importar un respaldo JSON: lectura segura, vista previa, confirmación escrita y respaldo automático previo. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, E = App.Estado, V = App.Validacion;

  var ETIQUETAS = {
    insumos: 'Insumos', proveedores: 'Proveedores', recetas: 'Productos y preparaciones', canales: 'Canales de venta', clientes: 'Clientes',
    pedidos: 'Pedidos', cuentas: 'Cuentas de dinero', movimientosCaja: 'Movimientos de caja', gastos: 'Gastos', gastosRecurrentes: 'Gastos recurrentes',
    compras: 'Compras', movInventario: 'Movimientos de inventario', lotes: 'Lotes de producción', metas: 'Metas', gastosFijosEstimados: 'Gastos fijos estimados'
  };

  function leerArchivo(archivo) {
    return new Promise(function (ok, fallo) {
      if (!archivo) return fallo(new Error('No elegiste ningún archivo.'));
      if (archivo.size > 20 * 1024 * 1024) return fallo(new Error('El archivo es demasiado grande (máximo 20 MB).'));
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result)); };
      fr.onerror = function () { fallo(new Error('No pude leer el archivo.')); };
      fr.readAsText(archivo, 'utf-8');
    });
  }

  function total(resumen) { return Object.keys(resumen).reduce(function (s, k) { return s + resumen[k]; }, 0); }

  function vistaPrevia(res) {
    var filas = Object.keys(res.resumen).filter(function (k) { return res.resumen[k] > 0; }).map(function (k) {
      return h('li', null, h('span', null, ETIQUETAS[k] || k), h('strong', null, String(res.resumen[k])));
    });
    return h('div', { class: 'pila' },
      App.Comun.aviso('ok', [h('strong', null, 'El archivo es válido. '), 'Esto es lo que contiene:'], 'check'),
      filas.length ? h('ul', { class: 'lista-simple' }, filas) : h('p', { class: 'muted' }, 'El archivo no tiene registros (está vacío).'),
      res.migrado ? h('p', { class: 'explicacion' }, 'Es un respaldo de una versión anterior de la app; se actualizará automáticamente al importarlo.') : null);
  }

  /**
   * panel({alAplicar, pedirPalabra}) → Node. Incluye selector de archivo, vista previa y botón para reemplazar los datos.
   * Si hay datos actuales se descarga primero un respaldo automático.
   */
  function panel(op) {
    op = op || {};
    var entrada = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Archivo de respaldo (.json)' });
    var zona = h('div', { class: 'pila', 'aria-live': 'polite' });
    var cont = h('div', { class: 'pila' },
      h('div', { class: 'campo' }, h('label', null, 'Archivo de respaldo (.json)'), entrada), zona);

    entrada.addEventListener('change', function () {
      App.Dom.limpiar(zona);
      var archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      zona.appendChild(h('p', { class: 'muted' }, 'Revisando el archivo…'));
      leerArchivo(archivo).then(function (texto) {
        var res = V.importarTexto(texto);
        App.Dom.limpiar(zona);
        if (!res.ok) {
          zona.appendChild(App.Comun.aviso('error', [h('strong', null, 'No puedo importar este archivo.'), h('ul', null, res.errores.slice(0, 8).map(function (e) { return h('li', null, e); })),
            'No se cambió nada de tus datos.'], 'alert'));
          return;
        }
        zona.appendChild(vistaPrevia(res));
        var hayActuales = E.doc() && total(V.resumenDocumento(E.doc())) > 0;
        var btn = h('button', { type: 'button', class: 'btn btn-primario' }, hayActuales ? 'Reemplazar mis datos por este respaldo' : 'Importar este respaldo');
        btn.addEventListener('click', function () {
          if (!hayActuales) { aplicar(res); return; }
          App.Modal.confirmar({
            titulo: 'Reemplazar tus datos', peligro: true, palabra: 'REEMPLAZAR', textoConfirmar: 'Reemplazar',
            mensaje: h('div', null, h('p', null, 'Vas a reemplazar TODOS tus datos actuales por los del archivo. Antes se descargará una copia de lo que tienes ahora, por si te arrepientes.'))
          }).then(function (ok) { if (ok) aplicar(res); });
        });
        zona.appendChild(h('div', { class: 'grupo-botones' }, btn));
        if (hayActuales) zona.appendChild(h('p', { class: 'explicacion' }, 'Se descargará un respaldo automático de tus datos actuales antes de reemplazarlos.'));
      }, function (err) {
        App.Dom.limpiar(zona);
        zona.appendChild(App.Comun.aviso('error', err.message, 'alert'));
      });
    });

    function aplicar(res) {
      if (E.doc() && total(V.resumenDocumento(E.doc())) > 0) App.Exportar.respaldoJSON();
      E.usarDocumento(res.doc);
      App.Toast.ok('Datos importados correctamente.');
      if (op.alAplicar) op.alAplicar();
    }
    return cont;
  }

  function abrir() {
    var m = App.Modal.abrir({
      titulo: 'Importar un respaldo', tamano: 'ancho',
      contenido: h('div', { class: 'pila' },
        h('p', null, 'Elige un archivo de respaldo que hayas descargado antes desde esta app. Lo reviso por completo antes de tocar nada.'),
        panel({ alAplicar: function () { m.cerrar(); } })),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar')]
    });
  }

  App.Importar = { abrir: abrir, panel: panel, leerArchivo: leerArchivo, ETIQUETAS: ETIQUETAS };
})(typeof self !== 'undefined' ? self : this);
