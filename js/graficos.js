/* Configuración común de Chart.js: colores del tema, tooltips en COP, alternativa en tabla y limpieza de instancias. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato;
  var instancias = [];

  function css(nombre, defecto) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return v || defecto;
  }
  function paleta() { return [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return css('--c' + i, '#888'); }); }

  function formatear(tipo, v) {
    if (tipo === 'cop') return F.cop(v, { decimales: 0 });
    if (tipo === 'pct') return F.pct(v, 1);
    return F.cantidad(v);
  }

  function limpiar() {
    instancias.forEach(function (c) { try { c.destroy(); } catch (e) { /* nada */ } });
    instancias = [];
  }

  /**
   * dibujar(contenedor, {tipo:'bar'|'line'|'doughnut', etiquetas:[], series:[{nombre, datos, color?}],
   *   formato:'cop'|'num'|'pct', apilado, horizontal, ariaLabel, titulo, alto})
   * Crea el canvas, el gráfico y una tabla alternativa (para lectores de pantalla).
   */
  function dibujar(contenedor, op) {
    var colores = paleta();
    var formato = op.formato || 'cop';
    var envoltura = h('div', { class: 'grafico' + (op.alto ? ' alto' : '') });
    var canvas = h('canvas', { role: 'img', 'aria-label': op.ariaLabel || op.titulo || 'Gráfico' });
    envoltura.appendChild(canvas);
    contenedor.appendChild(envoltura);

    var hayDatos = op.series.some(function (s) { return s.datos.some(function (v) { return v !== 0 && v !== null; }); });
    if (!hayDatos) {
      envoltura.replaceWith(h('div', { class: 'estado-vacio' }, h('p', null, 'Aún no hay datos para mostrar en este gráfico.')));
      return null;
    }

    // Alternativa en tabla
    var filas = op.etiquetas.map(function (et, i) {
      return h('tr', null, h('th', { scope: 'row' }, et), op.series.map(function (s) { return h('td', { class: 'num' }, formatear(formato, s.datos[i])); }));
    });
    contenedor.appendChild(h('details', { class: 'alt-tabla' },
      h('summary', null, 'Ver los datos de este gráfico en una tabla'),
      h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla', 'aria-label': op.ariaLabel || op.titulo || 'Datos del gráfico' },
        h('thead', null, h('tr', null, h('th', null, ''), op.series.map(function (s) { return h('th', { class: 'num' }, s.nombre || 'Valor'); }))),
        h('tbody', null, filas)))));

    if (typeof root.Chart === 'undefined') return null;
    var texto = css('--muted', '#555'), borde = css('--border', '#ddd');
    var esDona = op.tipo === 'doughnut';
    var datasets = op.series.map(function (s, i) {
      var c = s.color || colores[i % colores.length];
      if (esDona) return { label: s.nombre, data: s.datos, backgroundColor: op.etiquetas.map(function (_, k) { return colores[k % colores.length]; }), borderColor: css('--surface', '#fff'), borderWidth: 2 };
      return {
        label: s.nombre, data: s.datos, backgroundColor: op.tipo === 'line' ? c + '33' : c, borderColor: c, borderWidth: op.tipo === 'line' ? 2.5 : 0,
        borderRadius: op.tipo === 'bar' ? 4 : 0, tension: .25, pointRadius: op.tipo === 'line' ? 3 : 0, fill: false, maxBarThickness: 46
      };
    });
    var opciones = {
      responsive: true, maintainAspectRatio: false, indexAxis: op.horizontal ? 'y' : 'x',
      animation: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
      plugins: {
        legend: { display: op.series.length > 1 || esDona, position: 'bottom', labels: { color: texto, boxWidth: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var v = esDona ? ctx.parsed : (op.horizontal ? ctx.parsed.x : ctx.parsed.y);
              var total = esDona ? ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0) : 0;
              return ' ' + (ctx.dataset.label && !esDona ? ctx.dataset.label + ': ' : ctx.label + ': ') + formatear(formato, v) + (esDona && total ? ' (' + F.pct(v / total, 0) + ')' : '');
            }
          }
        }
      }
    };
    if (!esDona) {
      var eje = { ticks: { color: texto, callback: function (v) { return formatear(formato, v); } }, grid: { color: borde }, beginAtZero: true, stacked: !!op.apilado };
      var cat = { ticks: { color: texto, maxRotation: 45, autoSkip: true }, grid: { display: false }, stacked: !!op.apilado };
      opciones.scales = op.horizontal ? { x: eje, y: cat } : { x: cat, y: eje };
    }
    var chart = new root.Chart(canvas, { type: op.tipo, data: { labels: op.etiquetas, datasets: datasets }, options: opciones });
    instancias.push(chart);
    return chart;
  }

  App.Graficos = { dibujar: dibujar, limpiar: limpiar, paleta: paleta };
})(typeof self !== 'undefined' ? self : this);
