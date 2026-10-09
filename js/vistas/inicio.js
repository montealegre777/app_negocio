/* Inicio: resumen del periodo, alertas, pedidos abiertos, meta del mes y ranking de productos. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, O = App.Operaciones, Comun = App.Comun;
  var estPeriodo = { modo: 'mes' };

  function tendencia(actual, previo, etiqueta) {
    if (!(previo > 0)) return 'Sin datos del periodo anterior';
    var p = actual / previo - 1;
    if (Math.abs(p) < 0.005) return 'Igual que ' + etiqueta;
    return (p > 0 ? '▲ ' : '▼ ') + F.pct(Math.abs(p), 0) + ' ' + (p > 0 ? 'más' : 'menos') + ' que ' + etiqueta;
  }

  function primerosPasos(doc) {
    var d = doc.datos, cfg = doc.config;
    var pasos = [
      { t: 'Crea tus insumos', s: 'Lo que compras: ingredientes y empaques, con su precio.', ok: d.insumos.length > 0, ruta: '#/insumos' },
      { t: 'Arma tu primer producto', s: 'Agrega sus ingredientes y mira cuánto te cuesta.', ok: d.recetas.some(function (r) { return r.tipo === 'producto'; }), ruta: '#/productos/nuevo/producto' },
      { t: 'Ponle precio y revisa tu ganancia', s: 'La app te sugiere un precio según el margen que quieres.', ok: d.recetas.some(function (r) { return r.tipo !== 'preparacion' && r.precioBase > 0; }), ruta: '#/productos' },
      { t: 'Registra tu primera venta', s: 'Así empiezas a ver resultados reales.', ok: d.pedidos.length > 0, accion: 'nuevaVenta' },
      { t: 'Descarga tu primer respaldo', s: 'Tus datos viven en este navegador: guarda una copia.', ok: !!cfg.ultimoRespaldo, ruta: '#/configuracion' }
    ];
    if (pasos.every(function (p) { return p.ok; })) return null;
    var hechos = pasos.filter(function (p) { return p.ok; }).length;
    return h('div', { class: 'tarjeta pila' },
      h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Primeros pasos'), h('span', { class: 'insignia info' }, hechos + ' de ' + pasos.length)),
      h('div', { class: 'barra' }, h('span', { style: { width: (hechos / pasos.length * 100) + '%' } })),
      h('ol', { class: 'lista-simple', style: { listStyle: 'none' } }, pasos.map(function (p) {
        var enlace = p.accion ? h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { if (App.Acciones[p.accion]) App.Acciones[p.accion](); } }, 'Ir')
          : h('a', { class: 'btn btn-chico', href: p.ruta }, 'Ir');
        return h('li', null, h('span', { style: { display: 'flex', gap: '.6rem', alignItems: 'flex-start' } },
          h('span', { class: p.ok ? 'positivo' : 'muted', 'aria-hidden': 'true' }, icono(p.ok ? 'check' : 'chart')),
          h('span', null, h('strong', null, p.t, p.ok ? h('span', { class: 'solo-lector' }, ' (hecho)') : null), h('div', { class: 'explicacion' }, p.s))), p.ok ? null : enlace);
      })));
  }

  function render(cont) {
    var doc = E.doc(), ctx = E.ctx(), d = doc.datos, hoy = F.hoy();
    cont.appendChild(Comun.cabecera({ titulo: doc.config.nombreNegocio || 'Mi negocio', descripcion: 'Así va tu negocio. Los números del periodo solo cuentan pedidos entregados.' }));

    var pasos = primerosPasos(doc);
    if (pasos) cont.appendChild(h('div', { style: { marginBottom: '1rem' } }, pasos));
    if (!d.pedidos.length && !d.recetas.length && !d.insumos.length) return;

    var cuerpo = h('div', { class: 'pila' });
    cont.appendChild(h('div', { class: 'fila entre', style: { marginBottom: '.75rem' } },
      Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']] })));
    cont.appendChild(cuerpo);

    var res = A.resumenPeriodo(doc, estPeriodo.desde, estPeriodo.hasta);
    var prev = A.periodoAnterior(estPeriodo.desde, estPeriodo.hasta);
    var resPrev = A.resumenPeriodo(doc, prev.desde, prev.hasta);
    var etq = estPeriodo.modo === 'hoy' ? 'ayer' : estPeriodo.modo === 'semana' ? 'la semana pasada' : 'el mes pasado';
    var caja = A.saldosCaja(doc);
    var cobrar = A.cuentasPorCobrar(doc, hoy), totCobrar = cobrar.reduce(function (s, x) { return s + x.saldo; }, 0);

    cuerpo.appendChild(h('div', { class: 'rejilla kpis' },
      Comun.kpi({ titulo: 'Ventas', valor: F.cop(res.ingresosNetos), nota: res.nVentas ? res.nVentas + (res.nVentas === 1 ? ' pedido' : ' pedidos') + ' · ' + tendencia(res.ingresosNetos, resPrev.ingresosNetos, etq) : 'Aún no hay pedidos entregados', ayuda: 'Lo vendido en pedidos entregados, sin impuestos. No es lo mismo que el dinero que ya cobraste.' }),
      Comun.kpi({ titulo: 'Ganancia de contribución', valor: F.cop(res.contribucion), clase: res.contribucion < 0 ? 'malo' : '', nota: res.margenContribucion === null ? 'Sin ventas' : 'Margen ' + F.pct(res.margenContribucion, 1), ayuda: 'Lo que dejan las ventas después de ingredientes, comisiones y costos por unidad, antes de gastos.' }),
      Comun.kpi({ titulo: 'Utilidad estimada', valor: F.cop(res.utilidadOperativa), clase: res.utilidadOperativa < 0 ? 'malo' : res.utilidadOperativa > 0 ? 'bueno' : '', nota: 'Contribución − gastos operativos (' + F.cop(res.gastosOperativos) + ')', enlace: '#/resultados', ayuda: 'Es una estimación. La utilidad no es el dinero en caja: mira «Caja» para ver cuánto efectivo tienes.' }),
      Comun.kpi({ titulo: 'Ticket promedio', valor: res.ticketPromedio === null ? '—' : F.cop(res.ticketPromedio), nota: res.unidades ? F.cantidad(res.unidades) + ' unidades vendidas' : 'Aún sin ventas' }),
      Comun.kpi({ titulo: 'Dinero en caja', valor: F.cop(caja.total), nota: totCobrar > 0 ? 'Por cobrar: ' + F.cop(totCobrar) : 'Sin cuentas por cobrar', enlace: '#/caja' })));

    // ---------- gráfico ----------
    var gDesde = estPeriodo.modo === 'hoy' ? F.sumarDias(hoy, -6) : estPeriodo.desde, gHasta = estPeriodo.modo === 'hoy' ? hoy : estPeriodo.hasta;
    var resG = estPeriodo.modo === 'hoy' ? A.resumenPeriodo(doc, gDesde, gHasta) : res;
    var dias = [];
    for (var f = gDesde, n = 0; f <= gHasta && n < 70; f = F.sumarDias(f, 1), n++) dias.push(f);
    var cajaGrafico = h('div');
    var tarjetaGrafico = h('div', { class: 'tarjeta' }, h('h3', null, estPeriodo.modo === 'hoy' ? 'Últimos 7 días' : 'Ventas y ganancia por día'), cajaGrafico);

    // ---------- alertas ----------
    var alertas = A.alertas(doc, ctx, hoy);
    var cajaAlertas = h('div', { class: 'tarjeta pila' }, h('h3', null, 'Para revisar'),
      alertas.length ? h('div', { class: 'pila' }, alertas.slice(0, 6).map(function (a) {
        return h('a', { class: 'alerta-item ' + a.nivel, href: a.ruta }, icono(a.nivel === 'info' ? 'info' : 'alert'), h('div', null, h('strong', null, a.titulo), h('span', { class: 'explicacion' }, a.detalle)));
      })) : h('p', { class: 'muted' }, '✅ Todo en orden. No hay nada urgente.'),
      alertas.length > 6 ? h('p', { class: 'explicacion' }, 'Y ' + (alertas.length - 6) + ' avisos más.') : null);

    cuerpo.appendChild(h('div', { class: 'rejilla c2' }, tarjetaGrafico, cajaAlertas));

    // ---------- pedidos abiertos ----------
    var abiertos = A.pedidosAbiertos(doc).slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero - b.numero; });
    var bloqueAbiertos = h('div', { class: 'tarjeta pila' }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Pedidos por entregar (' + abiertos.length + ')'), h('a', { href: '#/ventas', class: 'btn btn-chico' }, 'Ver todas las ventas')),
      abiertos.length ? h('ul', { class: 'lista-simple' }, abiertos.slice(0, 6).map(function (p) {
        var c = C.calcularPedido(p), cli = p.clienteId ? Comun.nombreDe('clientes', p.clienteId) : '';
        return h('li', null, h('span', null, h('a', { href: '#/ventas/' + p.id }, h('strong', null, '#' + p.numero)), ' ' + (cli || 'Sin cliente') + ' · ' + F.fechaCorta(p.fecha), p.fecha < hoy ? h('span', { class: 'insignia aviso', style: { marginLeft: '.4rem' } }, 'De antes') : null,
          h('div', { class: 'explicacion' }, c.lineas.map(function (l) { return F.cantidad(l.cantidad) + ' × ' + l.nombre; }).join(', '))),
        h('span', { class: 'fila', style: { flexWrap: 'nowrap' } }, h('strong', { class: 'num' }, F.cop(c.totalPedido)),
          Comun.boton('Entregar', { chico: true, onclick: function () { E.mutar(function (dd) { O.cambiarEstadoPedido(dd, p.id, 'entregado'); }); App.Toast.ok('Pedido #' + p.numero + ' entregado.'); } })));
      })) : h('p', { class: 'muted' }, 'No tienes pedidos pendientes.'));

    // ---------- meta ----------
    var mes = F.mesDe(hoy);
    var meta = d.metas.filter(function (m) { return m.mes === mes; })[0];
    var bloqueMeta = null;
    if (meta && meta.ventas > 0) {
      var resMes = A.resumenPeriodo(doc, F.inicioMes(hoy), F.finMes(hoy));
      var av = C.avanceMeta({ meta: meta.ventas, ventas: resMes.ingresosNetos, hoy: hoy });
      bloqueMeta = h('div', { class: 'tarjeta pila' }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Meta de ' + F.nombreMes(mes)), h('a', { class: 'btn btn-chico', href: '#/equilibrio' }, 'Ver detalle')),
        h('div', { class: 'fila entre' }, h('strong', null, F.cop(resMes.ingresosNetos)), h('span', { class: 'muted' }, 'de ' + F.cop(meta.ventas) + ' (' + F.pct(av.avance, 0) + ')')),
        h('div', { class: 'barra ' + (av.cumplida ? 'ok' : av.avance > 0.5 ? '' : 'aviso'), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.round(av.avance * 100))), 'aria-label': 'Avance de la meta' }, h('span', { style: { width: Math.min(100, av.avance * 100) + '%' } })),
        av.cumplida ? h('p', { class: 'positivo' }, '🎉 ¡Meta cumplida!') : h('p', { class: 'explicacion' }, 'Te faltan ' + F.cop(av.faltante) + ' en ' + av.diasRestantes + (av.diasRestantes === 1 ? ' día' : ' días') + ': unos ' + F.cop(av.promedioDiarioRequerido) + ' al día.'));
    }
    cuerpo.appendChild(h('div', { class: 'rejilla c2' }, bloqueAbiertos, bloqueMeta));

    // ---------- ranking ----------
    var ranking = A.rankingProductos(doc, ctx, res).filter(function (r) { return r.unidades > 0 || r.res.precioPublico > 0; });
    ranking.sort(function (a, b) { return b.contribucionTotal - a.contribucionTotal || b.unidades - a.unidades; });
    if (ranking.length) {
      cuerpo.appendChild(h('div', { class: 'tarjeta pila' }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Tus productos en este periodo'), h('a', { class: 'btn btn-chico', href: '#/productos' }, 'Ver productos')),
        App.Tabla.crear({
          etiqueta: 'Ranking de productos', filas: ranking.slice(0, 8), onFila: function (r) { App.ProductosVista.irAEditor(r.id); },
          columnas: [
            { id: 'p', titulo: 'Producto', render: function (r) { return h('span', null, r.emoji + ' ', h('strong', null, r.nombre)); } },
            { id: 'u', titulo: 'Vendidas', clase: 'num', render: function (r) { return F.cantidad(r.unidades); } },
            { id: 'i', titulo: 'Ventas', clase: 'num', render: function (r) { return F.cop(r.ingresos); } },
            { id: 'g', titulo: 'Ganancia generada', clase: 'num', render: function (r) { return h('span', { class: r.contribucionTotal < 0 ? 'negativo' : '' }, F.cop(r.contribucionTotal)); } },
            { id: 'm', titulo: 'Margen unitario', clase: 'num', render: function (r) { return r.res.margen === null ? '—' : F.pct(r.res.margen, 1); } },
            { id: 'e', titulo: 'Estado', render: function (r) { return r.res.indicadores.length ? h('span', { class: 'insignia aviso', title: r.res.indicadores[0].texto }, r.res.indicadores[0].texto.slice(0, 38)) : h('span', { class: 'insignia ok' }, 'Saludable'); } }
          ]
        }).el));
    }

    // dibujar el gráfico al final, cuando el DOM ya está montado
    App.Graficos.dibujar(cajaGrafico, {
      tipo: 'bar', etiquetas: dias.map(function (x) { return F.fechaCorta(x); }), formato: 'cop', alto: true, ariaLabel: 'Ventas y ganancia por día',
      series: [{ nombre: 'Ventas', datos: dias.map(function (x) { return resG.porDia[x] ? resG.porDia[x].ventas : 0; }) }, { nombre: 'Ganancia de contribución', datos: dias.map(function (x) { return resG.porDia[x] ? resG.porDia[x].contribucion : 0; }) }]
    });
  }

  App.registrarVista('inicio', { titulo: 'Inicio', render: render });
})(typeof self !== 'undefined' ? self : this);
