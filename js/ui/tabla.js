/* Tabla con búsqueda, orden por columna, paginación (más de 50 filas), totales y vista de tarjetas en pantallas angostas. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono;

  function normalizar(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /**
   * crear({columnas, filas, buscarEn, orden:{col,dir}, porPagina, vacio:Node, onFila, clasesFila, pie, placeholderBusqueda, herramientas, etiqueta, estado})
   * columna: {id, titulo, valor(fila) → para ordenar, render(fila) → Node|string, clase, ordenable (def. true), sinEtiqueta}
   * `estado` (objeto opcional) conserva búsqueda/orden/página entre renders de la vista.
   */
  function crear(op) {
    var est = op.estado || {};
    if (!est.orden) est.orden = op.orden || null;
    if (est.texto === undefined) est.texto = '';
    if (!est.pagina) est.pagina = 0;
    var todas = op.filas || [];
    var predicado = null;
    var porPagina = op.porPagina || 50;

    var inputBusca = op.buscarEn ? h('input', { type: 'search', 'aria-label': op.placeholderBusqueda || 'Buscar', placeholder: op.placeholderBusqueda || 'Buscar…', value: est.texto }) : null;
    var herramientas = h('div', { class: 'tabla-herramientas' },
      inputBusca ? h('div', { class: 'buscador' }, icono('search'), inputBusca) : null,
      op.herramientas || null);
    var contTabla = h('div');
    var contPag = h('div');
    var el = h('div', null, (inputBusca || op.herramientas) ? herramientas : null, contTabla, contPag);

    function filtradas() {
      var f = todas;
      if (predicado) f = f.filter(predicado);
      if (op.buscarEn && est.texto) {
        var q = normalizar(est.texto).split(/\s+/).filter(Boolean);
        f = f.filter(function (fila) { var t = normalizar(op.buscarEn(fila)); return q.every(function (w) { return t.indexOf(w) >= 0; }); });
      }
      if (est.orden) {
        var col = op.columnas.filter(function (c) { return c.id === est.orden.col; })[0];
        if (col && col.valor) {
          var dir = est.orden.dir;
          f = f.slice().sort(function (a, b) {
            var x = col.valor(a), y = col.valor(b);
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' }) * dir;
            return (x - y) * dir;
          });
        }
      }
      return f;
    }

    function dibujar() {
      var f = filtradas();
      var paginas = Math.max(1, Math.ceil(f.length / porPagina));
      if (est.pagina >= paginas) est.pagina = paginas - 1;
      var visibles = f.length > porPagina ? f.slice(est.pagina * porPagina, (est.pagina + 1) * porPagina) : f;
      App.Dom.limpiar(contTabla); App.Dom.limpiar(contPag);

      if (!f.length) {
        contTabla.appendChild(todas.length || !op.vacio ? h('div', { class: 'estado-vacio' }, h('p', null, todas.length ? 'No hay resultados con esos filtros.' : 'No hay registros todavía.')) : op.vacio);
        return;
      }
      var thead = h('tr', null, op.columnas.map(function (c) {
        var ordenable = c.ordenable !== false && c.valor;
        var activo = est.orden && est.orden.col === c.id;
        var th = h('th', { scope: 'col', class: c.clase || '', 'aria-sort': activo ? (est.orden.dir > 0 ? 'ascending' : 'descending') : null });
        if (ordenable) {
          th.appendChild(h('button', {
            type: 'button', 'aria-label': 'Ordenar por ' + c.titulo,
            onclick: function () {
              est.orden = activo ? { col: c.id, dir: -est.orden.dir } : { col: c.id, dir: 1 };
              est.pagina = 0; dibujar();
            }
          }, c.titulo, activo ? icono(est.orden.dir > 0 ? 'arriba' : 'abajo') : null));
        } else th.appendChild(document.createTextNode(c.titulo));
        return th;
      }));
      var cuerpo = visibles.map(function (fila) {
        var tr = h('tr', { class: (op.onFila ? 'fila-clic ' : '') + (op.clasesFila ? (op.clasesFila(fila) || '') : ''), tabindex: op.onFila ? '0' : null });
        op.columnas.forEach(function (c) {
          var contenido = c.render ? c.render(fila) : (c.valor ? c.valor(fila) : '');
          tr.appendChild(h('td', { class: (c.clase || '') + (c.sinEtiqueta ? ' sin-etiqueta' : ''), 'data-label': c.sinEtiqueta ? null : c.titulo }, contenido));
        });
        if (op.onFila) {
          tr.addEventListener('click', function (e) { if (e.target.closest('button, a, input, select, label')) return; op.onFila(fila); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === tr) op.onFila(fila); });
        }
        return tr;
      });
      var tfoot = null;
      if (op.pie) {
        var celdas = op.pie(f);
        if (celdas) tfoot = h('tfoot', null, h('tr', null, celdas));
      }
      var tabla = h('table', { class: 'tabla tabla-tarjetas', 'aria-label': op.etiqueta || null }, h('thead', null, thead), h('tbody', null, cuerpo), tfoot);
      contTabla.appendChild(h('div', { class: 'tabla-contenedor' }, tabla));
      contTabla.appendChild(h('div', { class: 'solo-lector', role: 'status', 'aria-live': 'polite' }, f.length + ' resultados'));
      if (f.length > porPagina) {
        contPag.appendChild(h('div', { class: 'paginacion' },
          h('span', { class: 'muted small' }, 'Mostrando ' + (est.pagina * porPagina + 1) + '–' + Math.min((est.pagina + 1) * porPagina, f.length) + ' de ' + f.length),
          h('div', { class: 'grupo-botones' },
            h('button', { type: 'button', class: 'btn btn-chico', disabled: est.pagina === 0, onclick: function () { est.pagina--; dibujar(); } }, icono('izq'), 'Anterior'),
            h('span', { class: 'small' }, 'Página ' + (est.pagina + 1) + ' de ' + paginas),
            h('button', { type: 'button', class: 'btn btn-chico', disabled: est.pagina >= paginas - 1, onclick: function () { est.pagina++; dibujar(); } }, 'Siguiente', icono('der')))));
      }
    }

    if (inputBusca) {
      inputBusca.addEventListener('input', App.Dom.debounce(function () { est.texto = inputBusca.value; est.pagina = 0; dibujar(); }, 120));
    }
    dibujar();

    return {
      el: el,
      actualizar: function (filas) { todas = filas; dibujar(); },
      filtrar: function (fn) { predicado = fn; est.pagina = 0; dibujar(); },
      visibles: filtradas
    };
  }

  App.Tabla = { crear: crear, normalizar: normalizar };
})(typeof self !== 'undefined' ? self : this);
