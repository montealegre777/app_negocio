/* Resultados: estado de resultados del periodo, comparación con el periodo anterior y puente de la utilidad a la caja. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, A = App.Analisis, E = App.Estado, Comun = App.Comun;
  var estPeriodo = { modo: 'mes' }, estProd = {}, estCanal = {};

  /** Texto de comparación: ▲ +12,3 % frente al periodo anterior. `masEsBueno=false` pinta el aumento en rojo (costos, gastos). */
  function delta(actual, anterior, masEsBueno) {
    if (anterior === null || anterior === undefined || Math.abs(anterior) < 0.5) return h('span', { class: 'small muted' }, anterior === undefined ? '' : 'Sin dato del periodo anterior');
    var pct = (actual - anterior) / Math.abs(anterior);
    if (Math.abs(pct) < 0.0005) return h('span', { class: 'small muted' }, 'Igual que el periodo anterior');
    var sube = pct > 0, bueno = masEsBueno === false ? !sube : sube;
    return h('span', { class: 'small ' + (bueno ? 'positivo' : 'negativo') }, (sube ? '▲ +' : '▼ ') + F.pct(pct, 1) + ' vs. periodo anterior (' + F.cop(anterior) + ')');
  }

  function kpi(titulo, valor, actual, anterior, masEsBueno, extra) {
    var nota = anterior === undefined ? (extra || null) : h('span', null, extra ? h('span', { class: 'small muted' }, extra) : null, extra ? h('br') : null, delta(actual, anterior, masEsBueno));
    return Comun.kpi({ titulo: titulo, valor: valor, nota: nota, clase: actual < 0 && masEsBueno !== false ? 'malo' : '' });
  }

  function filaEstado(texto, valor, op) {
    op = op || {};
    return h('tr', { class: op.total ? 'fila-total' : '' },
      h('td', { style: { paddingLeft: op.sangria ? '1.5rem' : null } }, op.total ? h('strong', null, texto) : texto, op.nota ? h('div', { class: 'small muted' }, op.nota) : null),
      h('td', { class: 'num' }, op.total ? h('strong', { class: valor < 0 ? 'negativo' : '' }, F.cop(valor)) : F.cop(valor)),
      h('td', { class: 'num muted small' }, op.pct !== undefined && op.pct !== null ? F.pct(op.pct, 1) : ''));
  }

  function etiquetasEntre(desde, hasta) {
    var out = [], d = desde, guardia = 0;
    while (d <= hasta && guardia++ < 400) { out.push(d); d = F.sumarDias(d, 1); }
    return out;
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, hoy = F.hoy();
    var selP = Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['todo', 'Todo'], ['rango', 'Personalizado']] });
    var desde = estPeriodo.desde, hastaEf = estPeriodo.hasta > hoy ? hoy : estPeriodo.hasta;
    if (estPeriodo.modo === 'todo') {
      var fechas = d.pedidos.map(function (p) { return p.fecha; }).concat(d.gastos.map(function (g) { return g.fecha; })).sort();
      desde = fechas.length ? fechas[0] : hoy;
    }
    if (desde > hastaEf) hastaEf = desde;
    var comparar = estPeriodo.modo !== 'todo';
    var res = A.resumenPeriodo(doc, desde, hastaEf);
    var ant = null;
    if (comparar) { var pa = A.periodoAnterior(desde, hastaEf); ant = A.resumenPeriodo(doc, pa.desde, pa.hasta); }
    var parcial = estPeriodo.hasta > hoy;

    cont.appendChild(Comun.cabecera({
      titulo: 'Resultados', descripcion: 'Cuánto vendiste, cuánto te costó y cuánto ganaste. Cuenta las ventas entregadas, no las pendientes ni las canceladas.',
      acciones: [Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.resumenMensual(desde, hastaEf); } }), Comun.boton('Imprimir', { icono: 'print', onclick: function () { App.Exportar.imprimir(); } })]
    }));
    cont.appendChild(h('div', { class: 'fila no-imprimir' }, selP));
    cont.appendChild(h('p', { class: 'imprimir-solo' }, (doc.config.nombreNegocio || 'Mi negocio') + ' · ' + F.fecha(desde) + ' al ' + F.fecha(hastaEf)));
    if (parcial) cont.appendChild(h('p', { class: 'explicacion' }, 'Mostrando del ' + F.fecha(desde) + ' al día de hoy (' + F.fecha(hastaEf) + '). El periodo anterior tiene la misma cantidad de días.'));

    if (!res.nVentas && !res.gastosOperativos && (!ant || (!ant.nVentas && !ant.gastosOperativos))) {
      cont.appendChild(Comun.vacio({ emoji: '📊', titulo: 'Aún no hay resultados en este periodo', texto: 'Cuando registres ventas entregadas y gastos verás aquí tu estado de resultados.', acciones: [Comun.boton('Registrar una venta', { primario: true, icono: 'plus', onclick: function () { if (App.Acciones.nuevaVenta) App.Acciones.nuevaVenta(); } })] }));
      return;
    }

    var a = ant;
    cont.appendChild(h('div', { class: 'rejilla kpis' },
      kpi('Ventas', F.cop(res.ingresosNetos), res.ingresosNetos, a ? a.ingresosNetos : undefined, true, res.nVentas + (res.nVentas === 1 ? ' venta' : ' ventas')),
      kpi('Costos variables', F.cop(res.costosVariables), res.costosVariables, a ? a.costosVariables : undefined, false, 'Insumos, comisiones y otros'),
      kpi('Ganancia de contribución', F.cop(res.contribucion), res.contribucion, a ? a.contribucion : undefined, true, res.margenContribucion === null ? '' : F.pct(res.margenContribucion, 1) + ' de las ventas'),
      kpi('Gastos operativos', F.cop(res.gastosOperativos), res.gastosOperativos, a ? a.gastosOperativos : undefined, false, 'Arriendo, servicios, sueldos…'),
      Comun.kpi({ titulo: 'Utilidad operativa (estimada)', valor: F.cop(res.utilidadOperativa), clase: res.utilidadOperativa < 0 ? 'malo' : 'destacado bueno', nota: a ? delta(res.utilidadOperativa, a.utilidadOperativa, true) : null,
        ayuda: 'Ganancia de contribución menos gastos operativos. No es el dinero en tu bolsillo: mira el puente a caja más abajo.' })));

    // Estado de resultados
    var base = res.ingresosNetos > 0 ? res.ingresosNetos : null;
    function p(v) { return base ? v / base : null; }
    var filas = [
      filaEstado('Ventas (sin impuestos)', res.ingresosNetos, { total: true, pct: base ? 1 : null }),
      filaEstado('Costo de producción (insumos)', -res.costoProd, { sangria: true, pct: p(res.costoProd) }),
      filaEstado('Otros costos por unidad (empaque, etc.)', -res.otrosCostos, { sangria: true, pct: p(res.otrosCostos) }),
      filaEstado('Comisiones de plataformas', -res.comisiones, { sangria: true, pct: p(res.comisiones) }),
      filaEstado('Costo de envío pagado', -res.costoEnvio, { sangria: true, pct: p(res.costoEnvio) }),
      filaEstado('Ganancia de contribución', res.contribucion, { total: true, pct: p(res.contribucion), nota: 'Lo que deja cada venta para pagar tus gastos' })
    ];
    Object.keys(res.gastosPorCategoria).sort(function (x, y) { return res.gastosPorCategoria[y] - res.gastosPorCategoria[x]; }).forEach(function (k) {
      filas.push(filaEstado('Gastos: ' + k, -res.gastosPorCategoria[k], { sangria: true, pct: p(res.gastosPorCategoria[k]) }));
    });
    filas.push(filaEstado('Gastos operativos', -res.gastosOperativos, { total: true, pct: p(res.gastosOperativos) }));
    filas.push(filaEstado('Utilidad operativa estimada', res.utilidadOperativa, { total: true, pct: p(res.utilidadOperativa), nota: 'Antes de impuestos de renta y de lo que te pagas tú' }));
    var tarjetaEstado = h('div', { class: 'tarjeta pila' },
      h('h3', { style: { margin: 0 } }, 'Estado de resultados'),
      h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla', 'aria-label': 'Estado de resultados' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Concepto'), h('th', { scope: 'col', class: 'num' }, 'Valor'), h('th', { scope: 'col', class: 'num' }, '% de ventas'))), h('tbody', null, filas))),
      res.impuestos > 0 ? h('p', { class: 'explicacion' }, 'Además cobraste ' + F.cop(res.impuestos) + ' de impuestos a tus clientes. No son ingreso tuyo y no están incluidos arriba.') : null,
      h('p', { class: 'explicacion' }, 'Los costos de cada venta quedan fijos el día que se entrega el pedido: si luego sube el precio de un insumo, las ventas pasadas no cambian. Las inversiones (equipos, utensilios) no bajan la utilidad; salen de tu caja.'));
    cont.appendChild(tarjetaEstado);

    // Puente utilidad → caja
    var puente = A.puenteUtilidadCaja(doc, desde, hastaEf, res);
    cont.appendChild(h('div', { class: 'tarjeta pila' },
      h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'De la utilidad a tu caja'), h('span', { class: 'insignia aviso' }, 'Estimación')),
      h('p', { class: 'explicacion' }, 'Utilidad y caja casi nunca coinciden: puedes vender y aún no cobrar, comprar inventario que todavía no usaste o pagar un equipo. Este cuadro explica la diferencia en el periodo.'),
      h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla', 'aria-label': 'Puente de utilidad a caja' },
        h('tbody', null,
          h('tr', null, h('td', null, h('strong', null, 'Utilidad operativa estimada')), h('td', { class: 'num' }, h('strong', null, F.cop(puente.utilidad)))),
          puente.componentes.filter(function (c) { return Math.abs(c.valor) >= 0.5; }).map(function (c) { return h('tr', null, h('td', { style: { paddingLeft: '1.5rem' } }, c.texto), h('td', { class: 'num' }, (c.valor > 0 ? '+' : '') + F.cop(c.valor))); }),
          h('tr', { class: 'fila-total' }, h('td', null, h('strong', null, 'Variación real de tu caja en el periodo')), h('td', { class: 'num' }, h('strong', { class: puente.variacionCaja < 0 ? 'negativo' : '' }, F.cop(puente.variacionCaja))))))),
      h('p', { class: 'explicacion' }, 'Las transferencias entre tus propias cuentas no cuentan. La línea «Otros» absorbe ajustes y devoluciones para que el cuadro cuadre.')));

    // Gráficos
    var etiquetas, ventas, contrib;
    var dias = etiquetasEntre(desde, hastaEf);
    if (dias.length <= 45) {
      etiquetas = dias.map(function (x) { return dias.length <= 10 ? F.fechaCorta(x) : x.slice(8, 10) + '/' + x.slice(5, 7); });
      ventas = dias.map(function (x) { return res.porDia[x] ? res.porDia[x].ventas : 0; });
      contrib = dias.map(function (x) { return res.porDia[x] ? res.porDia[x].contribucion : 0; });
    } else {
      var meses = {};
      dias.forEach(function (x) { var k = F.mesDe(x); if (!meses[k]) meses[k] = { v: 0, c: 0 }; if (res.porDia[x]) { meses[k].v += res.porDia[x].ventas; meses[k].c += res.porDia[x].contribucion; } });
      var ks = Object.keys(meses).sort();
      etiquetas = ks.map(function (k) { return F.nombreMes(k); }); ventas = ks.map(function (k) { return meses[k].v; }); contrib = ks.map(function (k) { return meses[k].c; });
    }
    var cajaDia = h('div'), cajaCat = h('div'), cajaCanal = h('div'), cajaProd = h('div');
    var canales = {}; d.canales.forEach(function (c) { canales[c.id] = c.nombre; });
    var catKeys = Object.keys(res.gastosPorCategoria);
    var canKeys = Object.keys(res.porCanal);
    var prodList = Object.keys(res.porProducto).map(function (k) { return res.porProducto[k]; }).sort(function (x, y) { return y.contribucion - x.contribucion; });
    cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Ventas y ganancia' + (dias.length <= 45 ? ' por día' : ' por mes')), cajaDia));
    cont.appendChild(h('div', { class: 'rejilla c2' },
      h('div', { class: 'tarjeta' }, h('h3', null, 'En qué gastas'), cajaCat),
      h('div', { class: 'tarjeta' }, h('h3', null, 'Ventas por canal'), cajaCanal)));
    cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Qué productos te dejan más ganancia'), cajaProd));

    // Tablas por producto y canal
    var tablaProd = prodList.length ? App.Tabla.crear({
      etiqueta: 'Resultados por producto', filas: prodList, estado: estProd, orden: { col: 'contribucion', dir: -1 }, placeholderBusqueda: 'Buscar producto…', buscarEn: function (x) { return x.nombre; },
      columnas: [
        { id: 'nombre', titulo: 'Producto', valor: function (x) { return x.nombre; }, render: function (x) { return h('strong', null, x.nombre); } },
        { id: 'unidades', titulo: 'Unidades', clase: 'num', valor: function (x) { return x.unidades; }, render: function (x) { return F.cantidad(x.unidades); } },
        { id: 'ingresos', titulo: 'Ventas', clase: 'num', valor: function (x) { return x.ingresos; }, render: function (x) { return F.cop(x.ingresos); } },
        { id: 'costos', titulo: 'Costos', clase: 'num', valor: function (x) { return x.costos; }, render: function (x) { return F.cop(x.costos); } },
        { id: 'contribucion', titulo: 'Ganancia', clase: 'num', valor: function (x) { return x.contribucion; }, render: function (x) { return h('strong', { class: x.contribucion < 0 ? 'negativo' : '' }, F.cop(x.contribucion)); } },
        { id: 'margen', titulo: 'Margen', clase: 'num', valor: function (x) { return x.ingresos > 0 ? x.contribucion / x.ingresos : 0; }, render: function (x) { return x.ingresos > 0 ? F.pct(x.contribucion / x.ingresos, 1) : '—'; } }
      ]
    }).el : null;
    var canList = canKeys.map(function (k) { var x = res.porCanal[k]; return { nombre: canales[x.canalId] || 'Sin canal', pedidos: x.pedidos, ingresos: x.ingresos, contribucion: x.contribucion }; }).sort(function (x, y) { return y.ingresos - x.ingresos; });
    var tablaCanal = canList.length ? App.Tabla.crear({
      etiqueta: 'Resultados por canal', filas: canList, estado: estCanal, orden: { col: 'ingresos', dir: -1 },
      columnas: [
        { id: 'nombre', titulo: 'Canal', valor: function (x) { return x.nombre; }, render: function (x) { return h('strong', null, x.nombre); } },
        { id: 'pedidos', titulo: 'Pedidos', clase: 'num', valor: function (x) { return x.pedidos; }, render: function (x) { return String(x.pedidos); } },
        { id: 'ingresos', titulo: 'Ventas', clase: 'num', valor: function (x) { return x.ingresos; }, render: function (x) { return F.cop(x.ingresos); } },
        { id: 'contribucion', titulo: 'Ganancia', clase: 'num', valor: function (x) { return x.contribucion; }, render: function (x) { return F.cop(x.contribucion); } },
        { id: 'margen', titulo: 'Margen', clase: 'num', valor: function (x) { return x.ingresos > 0 ? x.contribucion / x.ingresos : 0; }, render: function (x) { return x.ingresos > 0 ? F.pct(x.contribucion / x.ingresos, 1) : '—'; } }
      ]
    }).el : null;
    if (tablaProd) cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', { style: { margin: 0 } }, 'Por producto'), tablaProd));
    if (tablaCanal) cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', { style: { margin: 0 } }, 'Por canal'), tablaCanal));

    // los gráficos se dibujan al final, con el DOM ya montado
    App.Graficos.dibujar(cajaDia, { tipo: 'bar', etiquetas: etiquetas, formato: 'cop', alto: true, ariaLabel: 'Ventas y ganancia de contribución del periodo',
      series: [{ nombre: 'Ventas', datos: ventas }, { nombre: 'Ganancia de contribución', datos: contrib }] });
    if (catKeys.length) App.Graficos.dibujar(cajaCat, { tipo: 'doughnut', etiquetas: catKeys, formato: 'cop', ariaLabel: 'Gastos operativos por categoría', series: [{ nombre: 'Gastos', datos: catKeys.map(function (k) { return res.gastosPorCategoria[k]; }) }] });
    else cajaCat.appendChild(h('p', { class: 'muted' }, 'No registraste gastos operativos en este periodo.'));
    if (canList.length) App.Graficos.dibujar(cajaCanal, { tipo: 'doughnut', etiquetas: canList.map(function (x) { return x.nombre; }), formato: 'cop', ariaLabel: 'Ventas por canal', series: [{ nombre: 'Ventas', datos: canList.map(function (x) { return x.ingresos; }) }] });
    else cajaCanal.appendChild(h('p', { class: 'muted' }, 'Aún no hay ventas en este periodo.'));
    if (prodList.length) App.Graficos.dibujar(cajaProd, { tipo: 'bar', horizontal: true, etiquetas: prodList.slice(0, 8).map(function (x) { return x.nombre; }), formato: 'cop', ariaLabel: 'Ganancia de contribución por producto', series: [{ nombre: 'Ganancia', datos: prodList.slice(0, 8).map(function (x) { return x.contribucion; }) }] });
    else cajaProd.appendChild(h('p', { class: 'muted' }, 'Aún no hay ventas en este periodo.'));
  }

  App.registrarVista('resultados', { titulo: 'Resultados', render: render });
})(typeof self !== 'undefined' ? self : this);
