/* Piezas de interfaz compartidas por las vistas (no contienen fórmulas). */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono, F = App.Formato, E = App.Estado;

  function cabecera(op) {
    return h('div', { class: 'cabecera-vista' },
      h('div', null, h('h2', null, op.titulo), op.descripcion ? h('p', null, op.descripcion) : null),
      op.acciones && op.acciones.length ? h('div', { class: 'grupo-botones' }, op.acciones) : null);
  }

  function kpi(op) {
    var cont = op.enlace ? 'a' : 'div';
    return h(cont, { class: 'kpi' + (op.clase ? ' ' + op.clase : ''), href: op.enlace || null },
      h('div', { class: 'kpi-titulo' }, op.titulo, op.ayuda ? App.Form.ayudaPop(op.ayuda) : null),
      h('div', { class: 'kpi-valor' }, op.valor),
      op.nota ? h('div', { class: 'kpi-nota' }, op.nota) : null);
  }

  function vacio(op) {
    return h('div', { class: 'estado-vacio' },
      h('div', { class: 'estado-icono', 'aria-hidden': 'true' }, op.emoji || '🍽️'),
      h('h3', null, op.titulo), op.texto ? h('p', null, op.texto) : null,
      op.acciones && op.acciones.length ? h('div', { class: 'grupo-botones', style: { justifyContent: 'center' } }, op.acciones) : null);
  }

  function ejemplo(obj) {
    return obj && obj.esDemo ? h('span', { class: 'insignia ejemplo', title: 'Dato de ejemplo: lo puedes quitar desde Configuración' }, 'EJEMPLO') : null;
  }

  function nombreDe(coleccion, id) {
    var o = (E.datos()[coleccion] || []).filter(function (x) { return x.id === id; })[0];
    return o ? o.nombre : '';
  }

  function boton(texto, op) {
    op = op || {};
    return h('button', {
      type: 'button', class: 'btn' + (op.primario ? ' btn-primario' : '') + (op.peligro ? ' btn-peligro' : '') + (op.fantasma ? ' btn-fantasma' : '') + (op.chico ? ' btn-chico' : '') + (op.soloIcono ? ' btn-icono' : ''),
      onclick: op.onclick, disabled: op.disabled, 'aria-label': op.etiqueta || (op.soloIcono ? texto : null), title: op.titulo || null
    }, op.icono ? icono(op.icono) : null, op.soloIcono ? null : texto);
  }

  function botonIcono(nombreIcono, etiqueta, onclick, extra) {
    return h('button', { type: 'button', class: 'btn btn-fantasma btn-icono btn-chico', 'aria-label': etiqueta, title: etiqueta, onclick: onclick }, icono(nombreIcono));
  }

  /** Selector de periodo: hoy / semana / mes / rango. `est` guarda {modo, desde, hasta} entre renders. */
  function selectorPeriodo(est, alCambiar, opciones) {
    var op = opciones || {};
    var hoy = F.hoy();
    if (!est.modo) est.modo = op.modo || 'mes';
    function calcular() {
      if (est.modo === 'hoy') { est.desde = hoy; est.hasta = hoy; }
      else if (est.modo === 'semana') { est.desde = F.inicioSemana(hoy); est.hasta = F.finSemana(hoy); }
      else if (est.modo === 'mes') { est.desde = F.inicioMes(hoy); est.hasta = F.finMes(hoy); }
      else if (est.modo === 'mesPasado') { var mp = F.sumarMeses(F.mesDe(hoy), -1) + '-01'; est.desde = mp; est.hasta = F.finMes(mp); }
      else if (est.modo === 'todo') { est.desde = '2000-01-01'; est.hasta = '2999-12-31'; }
      else { est.desde = est.desde || F.inicioMes(hoy); est.hasta = est.hasta || hoy; }
    }
    calcular();
    var modos = op.modos || [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['rango', 'Personalizado']];
    var contenedor = h('div', { class: 'fila' });
    function dibujar() {
      App.Dom.limpiar(contenedor);
      contenedor.appendChild(h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Periodo' }, modos.map(function (m) {
        return h('button', { type: 'button', 'aria-pressed': String(est.modo === m[0]), onclick: function () { est.modo = m[0]; calcular(); dibujar(); alCambiar(est); } }, m[1]);
      })));
      if (est.modo === 'rango') {
        var d = App.Form.fecha({ etiqueta: 'Desde', valor: est.desde }), a = App.Form.fecha({ etiqueta: 'Hasta', valor: est.hasta });
        function aplicar() { if (d.get() && a.get() && d.get() <= a.get()) { est.desde = d.get(); est.hasta = a.get(); alCambiar(est); } }
        d.alCambiar(aplicar); a.alCambiar(aplicar);
        contenedor.appendChild(h('div', { class: 'fila' }, d.el, a.el));
      } else if (est.modo !== 'todo') {
        contenedor.appendChild(h('span', { class: 'muted small' }, est.desde === est.hasta ? F.fecha(est.desde) : F.fecha(est.desde) + ' – ' + F.fecha(est.hasta)));
      }
    }
    dibujar();
    return contenedor;
  }

  /** Tres medidas que no se deben confundir: ganancia, margen de contribución y % sobre el costo. */
  function medidas(res, config) {
    var baseTxt = config.baseMarkup === 'variables' ? 'todos los costos variables' : 'el costo de producción';
    function m(titulo, valor, texto, clase) {
      return h('div', { class: 'medida' }, h('span', { class: 'small muted' }, titulo), h('b', { class: clase || '' }, valor), h('span', { class: 'explicacion' }, texto));
    }
    var noCalc = res.motivo ? ' ' + res.motivo + '.' : '';
    return h('div', { class: 'ficha-medidas' },
      m('Ganancia por unidad', F.cop(res.ganancia, { decimales: res.ganancia !== 0 && Math.abs(res.ganancia) < 100 ? 2 : 0 }), 'Pesos que te quedan por cada unidad, después de costos, comisión y otros.', res.ganancia < 0 ? 'negativo' : 'positivo'),
      m('Margen de contribución', res.margen === null ? '—' : F.pct(res.margen, 1), 'De cada $ 100 que cobras, esta parte es ganancia.' + (res.margen === null ? noCalc : '')),
      m('% de ganancia sobre el costo', res.pctSobreCosto === null ? '—' : F.pct(res.pctSobreCosto, 1), 'Cuánto ganas por cada peso que cuesta (base: ' + baseTxt + ').' + (res.pctSobreCosto === null ? noCalc : '')));
  }

  function opcionesDe(coleccion, op) {
    op = op || {};
    return E.datos()[coleccion].filter(function (x) { return (op.incluirArchivados || !x.archivado || x.id === op.incluirId) && (!op.filtro || op.filtro(x)); })
      .slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); })
      .map(function (x) { return { valor: x.id, texto: x.nombre + (x.archivado ? ' (archivado)' : '') + (x.esDemo ? ' · ejemplo' : '') }; });
  }

  function icono2(emoji, color) {
    return h('span', { class: 'emoji-producto', style: { background: (color || '#888') + '26' }, 'aria-hidden': 'true' }, emoji || '🍽️');
  }

  function textoWhatsApp(texto) {
    App.Dom.copiar(texto).then(function (ok) {
      if (ok) App.Toast.ok('Texto copiado. Pégalo en WhatsApp.'); else App.Toast.error('No pude copiar. Selecciona el texto manualmente.');
    });
  }

  /** Archiva o elimina según tenga historia. Pide confirmación y lista lo afectado. */
  function archivarEntidad(coleccion, id, etiqueta) {
    var Ops = App.Operaciones, doc = E.doc();
    var obj = Ops.buscar(doc.datos[coleccion], id);
    if (!obj) return Promise.resolve(false);
    var uso = Ops.usoDeEntidad(doc, coleccion, id);
    var detalle = [];
    if (uso.recetas.length) {
      detalle.push(h('p', null, 'Se usa en estas recetas, que quedarán con error hasta que lo cambies:'));
      detalle.push(h('ul', null, uso.recetas.map(function (r) { return h('li', null, r.nombre); })));
    }
    if (uso.documentos) detalle.push(h('p', null, 'Tiene ' + uso.documentos + ' registros de historia (ventas, compras o movimientos). Por eso se archiva en lugar de borrarse: deja de aparecer en las listas, pero tu historial no cambia.'));
    return App.Modal.confirmar({
      titulo: 'Archivar ' + etiqueta, mensaje: h('div', null, h('p', null, '¿Archivar «' + obj.nombre + '»? Podrás restaurarlo cuando quieras.'), detalle),
      textoConfirmar: 'Archivar', peligro: uso.recetas.length > 0
    }).then(function (ok) {
      if (!ok) return false;
      E.mutar(function (d) { Ops.archivar(d, coleccion, id, true); }, { deshacer: '«' + obj.nombre + '» archivado.' });
      return true;
    });
  }

  function restaurarEntidad(coleccion, id) {
    E.mutar(function (d) { App.Operaciones.archivar(d, coleccion, id, false); });
    App.Toast.ok('Restaurado.');
  }

  /** Mensaje del pedido para WhatsApp. */
  function resumenPedidoTexto(p) {
    var c = App.Calculos.calcularPedido(p), cfg = E.config();
    var lineas = c.lineas.map(function (l) { return '• ' + F.cantidad(l.cantidad) + ' × ' + l.nombre + ' — ' + F.cop(l.ingresoNeto); });
    return [cfg.nombreNegocio + ' — Pedido #' + p.numero + ' (' + F.fecha(p.fecha) + ')'].concat(lineas,
      c.envioCobrado ? ['Envío: ' + F.cop(c.envioCobrado)] : [], ['Total: ' + F.cop(c.totalPedido)], c.pagado ? ['Pagado: ' + F.cop(c.pagado)] : [],
      c.saldoPorCobrar > 0 ? ['Saldo por pagar: ' + F.cop(c.saldoPorCobrar)] : []).join('\n');
  }

  function aviso(tipo, contenido, nombreIcono) {
    return h('div', { class: 'aviso ' + (tipo || ''), role: tipo === 'error' ? 'alert' : null }, icono(nombreIcono || (tipo === 'error' || tipo === 'warn' ? 'alert' : 'info')), h('div', null, contenido));
  }

  function filtroTexto(valor) { return App.Tabla.normalizar(valor); }

  /** Costo por unidad base con los decimales que hagan falta ($ 0,375 por g; $ 1.200 por und). */
  function costoUnidad(cb) {
    if (cb === null || cb === undefined || !isFinite(cb)) return '—';
    var abs = Math.abs(cb);
    return F.cop(cb, { decimales: abs === 0 ? 0 : abs < 1 ? 3 : abs < 100 ? 2 : 0 });
  }

  /** Insignia de variación de precio (▲ rojo si sube, ▼ verde si baja). */
  function insigniaVariacion(v) {
    if (!v || Math.abs(v.pct) < 0.0005) return null;
    var sube = v.pct > 0;
    return h('span', { class: 'insignia ' + (sube ? 'error' : 'ok'), title: 'Antes ' + costoUnidad(v.antes) + ', ahora ' + costoUnidad(v.despues) + ' por unidad base' },
      icono(sube ? 'sube' : 'baja'), (sube ? '+' : '') + F.pct(v.pct, 1));
  }

  /** Enfoca un campo con error o muestra los errores sin campo. Devuelve true si hay errores. */
  function mostrarErroresForm(mapa, res, contenedorExtra) {
    var r = App.Form.mostrarErrores(mapa, res.errores);
    if (contenedorExtra) {
      App.Dom.limpiar(contenedorExtra);
      r.sinCampo.forEach(function (t) { contenedorExtra.appendChild(aviso('error', t, 'alert')); });
    }
    return r.hay;
  }

  /** Las vistas se registran al cargar el script; app.js las usa al arrancar. */
  App.Vistas = App.Vistas || {};
  App.registrarVista = function (ruta, vista) { App.Vistas[ruta] = vista; };

  App.Comun = {
    costoUnidad: costoUnidad, insigniaVariacion: insigniaVariacion, mostrarErroresForm: mostrarErroresForm,
    cabecera: cabecera, kpi: kpi, vacio: vacio, ejemplo: ejemplo, nombreDe: nombreDe, boton: boton, botonIcono: botonIcono, selectorPeriodo: selectorPeriodo,
    medidas: medidas, opcionesDe: opcionesDe, iconoProducto: icono2, copiarWhatsApp: textoWhatsApp, archivarEntidad: archivarEntidad, restaurarEntidad: restaurarEntidad,
    resumenPedidoTexto: resumenPedidoTexto, aviso: aviso, filtroTexto: filtroTexto
  };
})(typeof self !== 'undefined' ? self : this);
