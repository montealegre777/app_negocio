/* Equilibrio y metas: cuánto necesitas vender para cubrir tus gastos fijos y cómo vas frente a tus metas del mes. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, C = App.Calculos, A = App.Analisis, E = App.Estado, O = App.Operaciones, Form = App.Form, Comun = App.Comun;
  var fuente = null, canalSel = '', estProd = {}, objetivoUtilidad = null;

  function barra(avance, cumplida) {
    return h('div', { class: 'barra ' + (cumplida ? 'ok' : avance > 0.5 ? '' : 'aviso'), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.round(avance * 100))), 'aria-label': 'Avance' },
      h('span', { style: { width: Math.min(100, Math.max(0, avance * 100)) + '%' } }));
  }

  // ---------------- gastos fijos estimados ----------------
  function abrirFijo(id) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.gastosFijosEstimados, id) : null;
    var concepto = Form.texto({ etiqueta: 'Concepto', valor: ex ? ex.concepto : '', requerido: true, maxlength: 60, placeholder: 'Ej. Arriendo del local' });
    var valor = Form.numero({ etiqueta: 'Valor mensual', tipo: 'moneda', valor: ex ? ex.valorMensual : null, requerido: true });
    function guardar() {
      var v = valor.get(), errs = {};
      if (!concepto.get()) errs.concepto = 'Escribe el concepto.';
      if (v === null || isNaN(v) || v <= 0) errs.valor = 'El valor debe ser mayor que 0.';
      if (Comun.mostrarErroresForm({ concepto: concepto, valor: valor }, { errores: errs })) return;
      E.mutar(function (d) { O.guardarEntidad(d, 'gastosFijosEstimados', Object.assign({}, ex || {}, { concepto: concepto.get(), valorMensual: v })); });
      App.Toast.ok('Gasto fijo guardado.'); m.cerrar();
    }
    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () { E.mutar(function (d) { O.eliminarEntidad(d, 'gastosFijosEstimados', ex.id); }, { deshacer: 'Gasto fijo eliminado.' }); m.cerrar(); } }, 'Eliminar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));
    var m = App.Modal.abrir({ titulo: ex ? 'Editar gasto fijo' : 'Nuevo gasto fijo estimado', tamano: 'chico', contenido: h('div', { class: 'pila' }, concepto.el, valor.el), pie: pie });
    m.el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); } });
  }

  // ---------------- metas ----------------
  function abrirMeta(mesInicial) {
    var doc = E.doc(), hoy = F.hoy(), mes0 = F.mesDe(hoy);
    var meses = [mes0, F.sumarMeses(mes0, 1), F.sumarMeses(mes0, 2)];
    var mes = Form.seleccion({ etiqueta: 'Mes', valor: mesInicial || mes0, vacio: false, opciones: meses.map(function (k) { return { valor: k, texto: F.nombreMes(k) }; }) });
    var ventas = Form.numero({ etiqueta: 'Meta de ventas', tipo: 'moneda', valor: null, ayuda: 'Lo que quieres vender en el mes (sin impuestos).' });
    var utilidad = Form.numero({ etiqueta: 'Meta de utilidad (opcional)', tipo: 'moneda', valor: null, ayuda: 'Lo que quieres que te quede después de costos y gastos.' });
    function cargar() {
      var ex = doc.datos.metas.filter(function (x) { return x.mes === mes.get(); })[0];
      ventas.set(ex ? ex.ventas : null); utilidad.set(ex && ex.utilidad ? ex.utilidad : null);
    }
    mes.alCambiar(cargar); cargar();
    var m = App.Modal.abrir({
      titulo: 'Meta del mes', tamano: 'chico', contenido: h('div', { class: 'pila' }, mes.el, ventas.el, utilidad.el),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var v = ventas.get(), u = utilidad.get(), errs = {};
        if (v === null || isNaN(v) || v <= 0) errs.ventas = 'Escribe una meta de ventas mayor que 0.';
        if (u !== null && (isNaN(u) || u < 0)) errs.utilidad = 'La meta de utilidad debe ser 0 o más.';
        if (Comun.mostrarErroresForm({ ventas: ventas, utilidad: utilidad }, { errores: errs })) return;
        E.mutar(function (d) {
          var ex = d.metas.filter(function (x) { return x.mes === mes.get(); })[0];
          O.guardarEntidad(d, 'metas', Object.assign({}, ex || {}, { mes: mes.get(), ventas: v, utilidad: u || 0 }));
        });
        App.Toast.ok('Meta guardada.'); m.cerrar();
      } }, 'Guardar')]
    });
  }

  function bloqueMeta(doc, hoy, res, mesActual) {
    var meta = doc.datos.metas.filter(function (x) { return x.mes === mesActual; })[0];
    var tarjeta = h('div', { class: 'tarjeta pila' }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Meta de ' + F.nombreMes(mesActual)), Comun.boton(meta ? 'Cambiar meta' : 'Fijar una meta', { primario: !meta, icono: meta ? 'edit' : 'plus', onclick: function () { abrirMeta(mesActual); } })));
    if (!meta) { tarjeta.appendChild(h('p', { class: 'explicacion' }, 'Una meta te da un número claro por el que trabajar cada día. Fija cuánto quieres vender este mes.')); return tarjeta; }
    var avV = C.avanceMeta({ meta: meta.ventas, ventas: res.ingresosNetos, hoy: hoy });
    if (avV) {
      tarjeta.appendChild(h('div', { class: 'fila entre' }, h('span', null, h('strong', null, 'Ventas: ' + F.cop(res.ingresosNetos)), h('span', { class: 'muted' }, ' de ' + F.cop(meta.ventas))), h('strong', null, F.pct(avV.avance, 0))));
      tarjeta.appendChild(barra(avV.avance, avV.cumplida));
      tarjeta.appendChild(avV.cumplida ? h('p', { class: 'positivo' }, '🎉 ¡Meta de ventas cumplida!') : h('p', { class: 'explicacion' }, 'Te faltan ' + F.cop(avV.faltante) + ' en ' + avV.diasRestantes + (avV.diasRestantes === 1 ? ' día' : ' días') + ' (contando hoy): unos ' + F.cop(avV.promedioDiarioRequerido) + ' al día.'));
    }
    if (meta.utilidad > 0) {
      var avU = C.avanceMeta({ meta: meta.utilidad, ventas: Math.max(res.utilidadOperativa, 0), hoy: hoy });
      tarjeta.appendChild(h('div', { class: 'fila entre' }, h('span', null, h('strong', null, 'Utilidad: ' + F.cop(res.utilidadOperativa)), h('span', { class: 'muted' }, ' de ' + F.cop(meta.utilidad))), h('strong', null, F.pct(avU.avance, 0))));
      tarjeta.appendChild(barra(avU.avance, avU.cumplida));
      tarjeta.appendChild(avU.cumplida ? h('p', { class: 'positivo' }, '🎉 ¡Meta de utilidad cumplida!') : h('p', { class: 'explicacion' }, 'Te faltan ' + F.cop(avU.faltante) + ' de utilidad. La utilidad es una estimación (ver Resultados).'));
    }
    return tarjeta;
  }

  function historialMetas(doc, hoy) {
    var mesActual = F.mesDe(hoy);
    var pasadas = doc.datos.metas.filter(function (x) { return x.mes < mesActual; }).sort(function (a, b) { return a.mes < b.mes ? 1 : -1; });
    var futuras = doc.datos.metas.filter(function (x) { return x.mes > mesActual; }).sort(function (a, b) { return a.mes < b.mes ? -1 : 1; });
    if (!pasadas.length && !futuras.length) return null;
    var filas = futuras.concat(pasadas).map(function (x) {
      var r = A.resumenPeriodo(doc, x.mes + '-01', F.finMes(x.mes + '-01'));
      var okV = r.ingresosNetos >= x.ventas, futura = x.mes > mesActual;
      return h('tr', null,
        h('td', { 'data-label': 'Mes' }, F.nombreMes(x.mes)),
        h('td', { class: 'num', 'data-label': 'Meta de ventas' }, F.cop(x.ventas)),
        h('td', { class: 'num', 'data-label': 'Vendido' }, futura ? '—' : F.cop(r.ingresosNetos)),
        h('td', { 'data-label': 'Resultado' }, futura ? h('span', { class: 'insignia' }, 'Próximo mes') : h('span', { class: 'insignia ' + (okV ? 'ok' : 'aviso') }, okV ? 'Cumplida' : F.pct(r.ingresosNetos / x.ventas, 0) + ' de la meta')),
        h('td', { class: 'num', 'data-label': 'Utilidad' }, x.utilidad > 0 ? (futura ? F.cop(x.utilidad) : F.cop(r.utilidadOperativa) + ' / ' + F.cop(x.utilidad)) : '—'),
        h('td', { class: 'num sin-etiqueta' }, Comun.botonIcono('trash', 'Eliminar meta de ' + F.nombreMes(x.mes), function () { E.mutar(function (d) { O.eliminarEntidad(d, 'metas', x.id); }, { deshacer: 'Meta eliminada.' }); })));
    });
    return h('div', { class: 'tarjeta pila' }, h('h3', { style: { margin: 0 } }, 'Historial de metas'),
      h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla-tarjetas', 'aria-label': 'Historial de metas' },
        h('thead', null, h('tr', null, ['Mes', 'Meta de ventas', 'Vendido', 'Resultado', 'Utilidad (lograda / meta)', ''].map(function (t, i) { return h('th', { scope: 'col', class: i === 1 || i === 2 || i === 4 ? 'num' : '' }, t); }))), h('tbody', null, filas))));
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, ctx = E.ctx(), hoy = F.hoy(), mesActual = F.mesDe(hoy);
    var fijos = A.gastosFijosMensuales(doc, hoy);
    if (fuente !== 'estimados' && fuente !== 'reales') fuente = fijos.estimados > 0 ? 'estimados' : (fijos.mesesConDatos > 0 ? 'reales' : 'estimados');
    if (fuente === 'reales' && fijos.mesesConDatos === 0) fuente = 'estimados';
    var gastosFijos = fuente === 'reales' ? fijos.reales : fijos.estimados;
    var resMes = A.resumenPeriodo(doc, F.inicioMes(hoy), hoy);

    cont.appendChild(Comun.cabecera({ titulo: 'Equilibrio y metas', descripcion: 'Cuánto necesitas vender para cubrir tus gastos fijos, y cómo vas frente a tus metas.' }));

    // ------ gastos fijos ------
    var estim = d.gastosFijosEstimados.filter(function (x) { return !x.archivado; });
    var opcionFuente = function (valor, titulo, detalle, deshabilitado) {
      var id = 'ff-' + valor, inp = h('input', { type: 'radio', name: 'fuente-fijos', id: id, checked: fuente === valor, disabled: !!deshabilitado });
      inp.addEventListener('change', function () { if (inp.checked) { fuente = valor; App.Router.refrescar(); } });
      return h('label', { class: 'tarjeta', for: id, style: { display: 'flex', gap: '.6rem', alignItems: 'flex-start', cursor: deshabilitado ? 'not-allowed' : 'pointer', opacity: deshabilitado ? '.6' : '1' } }, inp, h('span', null, h('strong', null, titulo), h('div', { class: 'small muted' }, detalle)));
    };
    cont.appendChild(h('div', { class: 'tarjeta pila' },
      h('div', { class: 'tarjeta-cabecera' }, h('div', null, h('h3', null, 'Tus gastos fijos al mes'), h('p', { class: 'explicacion' }, 'Lo que pagas aunque no vendas nada: arriendo, internet, servicios, sueldos.')), Comun.boton('Agregar gasto fijo', { icono: 'plus', onclick: function () { abrirFijo(null); } })),
      estim.length ? h('ul', { class: 'lista-simple' }, estim.map(function (x) {
        return h('li', null, h('span', null, x.concepto), h('span', { class: 'grupo-botones' }, h('strong', null, F.cop(x.valorMensual)), Comun.botonIcono('edit', 'Editar ' + x.concepto, function () { abrirFijo(x.id); })));
      })) : h('p', { class: 'muted' }, 'Aún no has anotado gastos fijos estimados. También puedes registrar gastos de tipo «fijo» en Gastos y la app calcula el promedio real.'),
      h('div', { class: 'rejilla c2' },
        opcionFuente('estimados', 'Usar mis estimados: ' + F.cop(fijos.estimados), 'La suma de la lista de arriba.'),
        opcionFuente('reales', 'Usar el promedio real: ' + (fijos.mesesConDatos ? F.cop(fijos.reales) : '—'), fijos.mesesConDatos ? 'Promedio de los meses con gastos fijos registrados, entre los últimos ' + fijos.n + ' (' + fijos.mesesConDatos + ' con datos).' : 'Aún no hay gastos fijos registrados en meses anteriores.', fijos.mesesConDatos === 0))));

    // ------ equilibrio ------
    var periodoRef = { desde: F.sumarDias(hoy, -89), hasta: hoy };
    var resRef = A.resumenPeriodo(doc, periodoRef.desde, periodoRef.hasta);
    var margenPond = resRef.margenContribucion;
    var tarjetaEq = h('div', { class: 'tarjeta pila' }, h('h3', { style: { margin: 0 } }, 'Tu punto de equilibrio'));
    if (!(gastosFijos > 0)) {
      tarjetaEq.appendChild(Comun.aviso('info', 'Primero anota tus gastos fijos mensuales (arriba) para calcular cuánto necesitas vender.'));
    } else {
      var eq = margenPond === null ? { ok: false, mensaje: 'Necesitas al menos una venta entregada en los últimos 90 días para conocer tu margen promedio. Mira abajo el cálculo por producto.' } : C.puntoEquilibrio({ gastosFijos: gastosFijos, margenPonderado: margenPond });
      if (!eq.ok) tarjetaEq.appendChild(Comun.aviso('warn', eq.mensaje));
      else {
        var diasMes = F.diasDelMes(hoy), porDia = eq.ventasEquilibrio / diasMes;
        var avance = resMes.ingresosNetos / eq.ventasEquilibrio;
        tarjetaEq.appendChild(h('div', { class: 'rejilla kpis' },
          Comun.kpi({ titulo: 'Debes vender al mes', valor: F.cop(eq.ventasEquilibrio), clase: 'destacado', nota: 'para no perder ni ganar', ayuda: 'Gastos fijos ÷ margen de contribución promedio. Por encima de esto empiezas a tener utilidad.' }),
          Comun.kpi({ titulo: 'Equivale a vender al día', valor: F.cop(porDia), nota: 'Mes de ' + diasMes + ' días' }),
          Comun.kpi({ titulo: 'Margen promedio', valor: F.pct(margenPond, 1), nota: 'Ventas de los últimos 90 días', ayuda: 'De cada $ 100 vendidos, esta parte queda después de costos variables, para pagar tus gastos fijos.' }),
          Comun.kpi({ titulo: 'Gastos fijos usados', valor: F.cop(gastosFijos), nota: fuente === 'reales' ? 'Promedio real' : 'Tus estimados' })));
        tarjetaEq.appendChild(h('div', { class: 'pila', style: { gap: '.4rem' } },
          h('div', { class: 'fila entre' }, h('span', null, 'Este mes llevas ', h('strong', null, F.cop(resMes.ingresosNetos))), h('strong', null, F.pct(avance, 0) + ' del equilibrio')),
          barra(avance, avance >= 1),
          h('p', { class: 'explicacion' }, avance >= 1 ? 'Ya cubriste tus gastos fijos del mes. Lo que vendas de aquí en adelante deja utilidad (según el margen promedio).' : 'Aún te faltan ' + F.cop(Math.max(eq.ventasEquilibrio - resMes.ingresosNetos, 0)) + ' en ventas este mes para cubrir tus gastos fijos.')));
        // ¿Cuánto debo vender para ganar X?
        var obj = Form.numero({ etiqueta: '¿Cuánto quieres ganar al mes?', tipo: 'moneda', valor: objetivoUtilidad, placeholder: 'Ej. 1.000.000' });
        var respuesta = h('p', { class: 'explicacion', 'aria-live': 'polite' });
        function pintarObj() {
          var v = obj.get(); objetivoUtilidad = v === null || isNaN(v) ? null : v;
          respuesta.textContent = objetivoUtilidad && objetivoUtilidad > 0 ? 'Para ganar ' + F.cop(objetivoUtilidad) + ' además de cubrir tus gastos fijos necesitas vender unos ' + F.cop((gastosFijos + objetivoUtilidad) / margenPond) + ' al mes (' + F.cop((gastosFijos + objetivoUtilidad) / margenPond / diasMes) + ' al día).' : 'Escribe una cantidad y te digo cuánto tendrías que vender.';
        }
        obj.alCambiar(pintarObj); pintarObj();
        tarjetaEq.appendChild(h('div', { class: 'pila' }, obj.el, respuesta));
      }
    }
    cont.appendChild(tarjetaEq);

    // ------ por producto ------
    var canales = d.canales.filter(function (c) { return !c.archivado; });
    var productos = d.recetas.filter(function (r) { return !r.archivado && r.tipo !== 'preparacion'; });
    if (gastosFijos > 0 && productos.length) {
      var canalDef = A.canalPorDefecto(doc);
      if (!canalSel || !canales.some(function (c) { return c.id === canalSel; })) canalSel = canalDef ? canalDef.id : '';
      var selCanal = Form.seleccion({ etiqueta: 'Canal', valor: canalSel, vacio: canales.length ? false : 'Sin canales', opciones: canales.map(function (c) { return { valor: c.id, texto: c.nombre }; }) });
      selCanal.alCambiar(function () { canalSel = selCanal.get(); App.Router.refrescar(); });
      var filas = productos.map(function (r) {
        var x = C.resultadoProducto(ctx, r.id, canalSel || null);
        var eqp = x.ganancia > 0 ? C.puntoEquilibrio({ gastosFijos: gastosFijos, gananciaUnitaria: x.ganancia }) : { ok: false };
        return { r: r, x: x, unidades: eqp.ok ? eqp.unidadesEquilibrio : null };
      });
      cont.appendChild(h('div', { class: 'tarjeta pila' },
        h('div', { class: 'tarjeta-cabecera' }, h('div', null, h('h3', null, 'Si vendieras solo un producto'), h('p', { class: 'explicacion' }, 'Cuántas unidades al mes necesitarías de cada uno para cubrir ' + F.cop(gastosFijos) + ' de gastos fijos.')), selCanal.el),
        App.Tabla.crear({
          etiqueta: 'Unidades de equilibrio por producto', filas: filas, estado: estProd, orden: { col: 'unidades', dir: 1 },
          columnas: [
            { id: 'nombre', titulo: 'Producto', valor: function (f) { return f.r.nombre; }, render: function (f) { return h('strong', null, f.r.nombre); } },
            { id: 'precio', titulo: 'Precio', clase: 'num', valor: function (f) { return f.x.precioPublico || 0; }, render: function (f) { return f.x.precioPublico > 0 ? F.cop(f.x.precioPublico) : '—'; } },
            { id: 'ganancia', titulo: 'Ganancia por unidad', clase: 'num', valor: function (f) { return f.x.ganancia || 0; }, render: function (f) { return f.x.precioPublico > 0 ? h('span', { class: f.x.ganancia < 0 ? 'negativo' : '' }, F.cop(f.x.ganancia)) : '—'; } },
            { id: 'unidades', titulo: 'Unidades al mes', clase: 'num', valor: function (f) { return f.unidades === null ? Infinity : f.unidades; }, render: function (f) { return f.unidades === null ? h('span', { class: 'muted', title: 'Con este precio no se gana nada por unidad' }, 'No se alcanza') : h('strong', null, F.cantidad(f.unidades) + ' und'); } },
            { id: 'dia', titulo: 'Al día', clase: 'num', valor: function (f) { return f.unidades === null ? Infinity : f.unidades; }, render: function (f) { return f.unidades === null ? '—' : F.cantidad(Math.ceil(f.unidades / F.diasDelMes(hoy))) + ' und'; } }
          ]
        }).el));
    }

    // ------ metas ------
    cont.appendChild(bloqueMeta(doc, hoy, resMes, mesActual));
    var hist = historialMetas(doc, hoy);
    if (hist) cont.appendChild(hist);
  }

  App.registrarVista('equilibrio', { titulo: 'Equilibrio y metas', render: render });
})(typeof self !== 'undefined' ? self : this);
