/* Configuración, respaldos, exportaciones y datos de ejemplo. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, Comun = App.Comun, X = App.Exportar;

  function render(cont) {
    var doc = E.doc(), cfg = doc.config;
    cont.appendChild(Comun.cabecera({ titulo: 'Configuración y respaldos', descripcion: 'Ajusta cómo calcula la app, guarda copias de seguridad y exporta tus datos.' }));

    // ---------------- Ajustes generales ----------------
    var nombre = Form.texto({ etiqueta: 'Nombre del negocio', valor: cfg.nombreNegocio, maxlength: 60 });
    var margen = Form.numero({ etiqueta: 'Margen de ganancia objetivo', tipo: 'porcentaje', valor: cfg.margenObjetivo, ayuda: 'De cada $ 100 que cobras, cuántos quieres que sean ganancia. Se usa para el precio recomendado. Valor sugerido: 30 %.' });
    var redondeo = Form.seleccion({ etiqueta: 'Redondear precios recomendados hacia arriba a', valor: String(cfg.redondeoPrecio), vacio: false, opciones: [50, 100, 500, 1000].map(function (n) { return { valor: String(n), texto: F.cop(n) }; }) });
    var base = Form.seleccion({ etiqueta: '«% de ganancia sobre el costo» se calcula sobre', valor: cfg.baseMarkup, vacio: false, opciones: [{ valor: 'produccion', texto: 'El costo de producción' }, { valor: 'variables', texto: 'Todos los costos variables (con comisión y otros)' }] });
    var minAlerta = Form.numero({ etiqueta: 'Avisarme si el margen baja de', tipo: 'porcentaje', valor: cfg.margenMinimoAlerta, ayuda: 'Los productos por debajo de este margen aparecen con una alerta. Valor sugerido: 15 %.' });
    var politica = Form.seleccion({ etiqueta: 'Costo de los insumos', valor: cfg.politicaCosto, vacio: false, ayuda: 'Cambiar esto recalcula el costo de todos tus productos.', opciones: [{ valor: 'ultimo', texto: 'Usar el último precio que pagué' }, { valor: 'promedio', texto: 'Usar el promedio de mis compras' }] });
    var alertaIns = Form.numero({ etiqueta: 'Avisarme si un insumo sube más de', tipo: 'porcentaje', valor: cfg.alertaVariacionInsumoPct });
    var diasCobro = Form.numero({ etiqueta: 'Cuenta por cobrar vencida después de (días)', tipo: 'entero', valor: cfg.diasCobroVencido });
    var mesesFijos = Form.numero({ etiqueta: 'Meses para promediar tus gastos fijos', tipo: 'entero', valor: cfg.mesesPromedioFijos, ayuda: 'Se usa en el punto de equilibrio.' });
    var impActivo = Form.casilla({ etiqueta: 'Manejo impuestos (IVA, impoconsumo) en mis precios', valor: cfg.impuestos && cfg.impuestos.activo, ayuda: 'Actívalo solo si cobras impuestos. Luego pones la tarifa en cada producto. Apagado, la app no calcula impuestos.' });
    var impIncluido = Form.casilla({ etiqueta: 'Mis precios de venta ya incluyen el impuesto', valor: cfg.impuestos && cfg.impuestos.preciosIncluyenImpuesto });
    var errores = h('div');

    function guardarGeneral() {
      var vals = { margen: margen.get(), minAlerta: minAlerta.get(), alertaIns: alertaIns.get(), diasCobro: diasCobro.get(), mesesFijos: mesesFijos.get() };
      var hay = false;
      [[margen, 'margen', 0, 0.99, 'Escribe un porcentaje entre 0 y 99.'], [minAlerta, 'minAlerta', 0, 0.99, 'Escribe un porcentaje entre 0 y 99.'], [alertaIns, 'alertaIns', 0, 10, 'Escribe un porcentaje válido.']].forEach(function (p) {
        var v = vals[p[1]]; p[0].error('');
        if (v === null || isNaN(v) || v < p[2] || v > p[3]) { p[0].error(p[4]); hay = true; }
      });
      [[diasCobro, 'diasCobro', 1, 365], [mesesFijos, 'mesesFijos', 1, 12]].forEach(function (p) {
        var v = vals[p[1]]; p[0].error('');
        if (v === null || isNaN(v) || Math.round(v) !== v || v < p[2] || v > p[3]) { p[0].error('Escribe un número entero entre ' + p[2] + ' y ' + p[3] + '.'); hay = true; }
      });
      if (hay) { App.Toast.error('Revisa los campos marcados en rojo.'); return; }
      var cambiaPolitica = politica.get() !== cfg.politicaCosto;
      E.mutar(function (d) {
        d.config.nombreNegocio = nombre.get() || 'Mi negocio';
        d.config.margenObjetivo = vals.margen;
        d.config.redondeoPrecio = Number(redondeo.get());
        d.config.baseMarkup = base.get();
        d.config.margenMinimoAlerta = vals.minAlerta;
        d.config.politicaCosto = politica.get();
        d.config.alertaVariacionInsumoPct = vals.alertaIns;
        d.config.diasCobroVencido = vals.diasCobro;
        d.config.mesesPromedioFijos = vals.mesesFijos;
        d.config.impuestos = { activo: impActivo.get(), preciosIncluyenImpuesto: impIncluido.get() };
      });
      App.Toast.ok(cambiaPolitica ? 'Guardado. Los costos de tus productos se recalcularon.' : 'Configuración guardada.');
    }

    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Mi negocio y mis precios'),
      Form.rejilla([nombre, margen, redondeo, base, minAlerta, politica, alertaIns, diasCobro, mesesFijos]),
      h('div', { class: 'pila' }, impActivo.el, impIncluido.el), errores,
      h('div', { class: 'grupo-botones' }, Comun.boton('Guardar cambios', { primario: true, icono: 'check', onclick: guardarGeneral }))));

    // ---------------- Inventario ----------------
    var modos = { sobrePedido: 'Sencillo: descuento los insumos al entregar cada pedido', conProduccion: 'Por lotes: registro lo que produzco y vendo del producto terminado' };
    var modoSel = Form.seleccion({ etiqueta: 'Modo de inventario', valor: cfg.modoInventario, vacio: false, opciones: Object.keys(modos).map(function (k) { return { valor: k, texto: modos[k] }; }) });
    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Inventario'), modoSel.el,
      h('p', { class: 'explicacion' }, 'Cambiar el modo recalcula tu inventario con las ventas, compras y producciones que ya registraste. No se pierde ningún registro.'),
      h('div', { class: 'grupo-botones' }, Comun.boton('Aplicar modo de inventario', { onclick: function () {
        if (modoSel.get() === cfg.modoInventario) { App.Toast.mostrar('Ya estás en ese modo.'); return; }
        App.Modal.confirmar({ titulo: 'Cambiar modo de inventario', textoConfirmar: 'Cambiar modo', mensaje: 'Se recalculará todo tu inventario con el modo «' + modos[modoSel.get()] + '». ¿Continuar?' }).then(function (ok) {
          if (!ok) return;
          E.mutar(function (d) { O.cambiarModoInventario(d, modoSel.get()); }, { deshacer: 'Modo de inventario cambiado.' });
        });
      } }))));

    // ---------------- Apariencia ----------------
    var tema = App.Tema.actual();
    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Apariencia'),
      h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Tema' }, [['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(function (p) {
        return h('button', { type: 'button', 'aria-pressed': String(tema === p[0]), onclick: function () { App.Tema.aplicar(p[0]); } }, p[1]);
      }))));

    // ---------------- Respaldos ----------------
    var uso = E.uso(), pct = uso.pct;
    var ult = cfg.ultimoRespaldo;
    var diasSin = ult ? F.diasEntre(F.hoy(new Date(ult)), F.hoy()) : null;
    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Respaldos'),
      h('p', null, 'Tus datos viven solo en este navegador. Si borras los datos del navegador o cambias de computador, se pierden. Descarga una copia seguido y guárdala en Drive, correo o tu computador.'),
      diasSin === null ? Comun.aviso('warn', 'Todavía no has descargado ningún respaldo.') : Comun.aviso(diasSin > 7 ? 'warn' : 'ok', 'Último respaldo: ' + F.fechaHora(ult) + (diasSin > 0 ? ' (hace ' + diasSin + (diasSin === 1 ? ' día)' : ' días)') : ' (hoy)'), diasSin > 7 ? 'alert' : 'check'),
      h('div', { class: 'grupo-botones' }, Comun.boton('Descargar respaldo (.json)', { primario: true, icono: 'download', onclick: function () { X.respaldoJSON(); } }),
        Comun.boton('Importar un respaldo', { icono: 'upload', onclick: function () { App.Importar.abrir(); } })),
      h('div', null, h('div', { class: 'fila entre small' }, h('span', null, 'Espacio usado en el navegador'), h('span', null, F.pct(pct, 1))),
        h('div', { class: 'barra ' + (pct > 0.7 ? 'error' : pct > 0.5 ? 'aviso' : 'ok'), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct * 100)), 'aria-label': 'Espacio usado' }, h('span', { style: { width: Math.min(100, pct * 100) + '%' } })),
        pct > 0.5 ? h('p', { class: 'explicacion' }, 'Se está llenando. Descarga un respaldo y archiva datos que ya no uses.') : null)));

    // ---------------- Exportar ----------------
    var mesSel = Form.texto({ etiqueta: 'Mes para el resumen (AAAA-MM)', valor: F.mesDe(F.hoy()), maxlength: 7 });
    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Exportar a Excel o Google Sheets (CSV)'),
      h('p', { class: 'explicacion' }, 'Se descargan archivos .csv con tildes y separador «;», listos para abrir en Excel o Sheets.'),
      h('div', { class: 'grupo-botones' }, [
        ['Ventas', function () { X.ventas(); }], ['Gastos', function () { X.gastos(); }], ['Compras', function () { X.compras(); }],
        ['Insumos', function () { X.insumos(); }], ['Inventario', function () { X.inventario(); }], ['Movimientos de inventario', function () { X.movimientosInventario(); }],
        ['Caja', function () { X.caja(); }], ['Rentabilidad de productos', function () { X.productos(); }], ['Recetas', function () { X.recetas(); }]
      ].map(function (p) { return Comun.boton(p[0], { icono: 'download', onclick: p[1] }); })),
      h('div', { class: 'fila', style: { alignItems: 'flex-end' } }, mesSel.el, Comun.boton('Resumen del mes', { icono: 'download', onclick: function () {
        var m = mesSel.get();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { mesSel.error('Escribe el mes así: 2026-10'); return; }
        mesSel.error(''); X.resumenMensual(m + '-01', F.finMes(m + '-01'));
      } }))));

    // ---------------- Datos de ejemplo ----------------
    var hayDemo = O.hayDemo(doc);
    cont.appendChild(h('div', { class: 'tarjeta pila' }, h('h3', null, 'Datos de ejemplo'),
      h('p', { class: 'explicacion' }, 'Una hamburguesa y un sándwich con compras, ventas y gastos ficticios para que explores la app. Van marcados como EJEMPLO y se quitan con un clic sin tocar lo tuyo.'),
      h('div', { class: 'grupo-botones' }, hayDemo ? Comun.boton('Quitar datos de ejemplo', { icono: 'trash', onclick: App.Acciones.quitarDemo })
        : Comun.boton('Cargar datos de ejemplo', { icono: 'plus', onclick: function () {
          var res; E.mutar(function (d) { res = App.Demo.generar(d); });
          if (res && res.ok) App.Toast.ok('Datos de ejemplo cargados.'); else App.Toast.error((res && res.mensaje) || 'No se pudieron cargar.');
        } }))));

    // ---------------- Zona peligrosa ----------------
    cont.appendChild(h('div', { class: 'tarjeta pila', style: { borderColor: 'var(--danger)' } }, h('h3', null, 'Zona delicada'),
      h('p', { class: 'explicacion' }, 'Borra todo lo que tienes guardado en este navegador y deja la app como nueva. Antes se descargará un respaldo automático.'),
      h('div', { class: 'grupo-botones' }, Comun.boton('Borrar todos mis datos', { peligro: true, icono: 'trash', onclick: function () {
        App.Modal.confirmar({ titulo: 'Borrar todos los datos', peligro: true, palabra: 'BORRAR TODO', textoConfirmar: 'Borrar todo', mensaje: 'Se borrarán TODOS tus insumos, productos, ventas, gastos y configuración. Se descargará antes un respaldo para que puedas recuperarlos.' }).then(function (ok) {
          if (!ok) return;
          X.respaldoJSON();
          E.borrarTodo();
          App.Toast.ok('Datos borrados. Empiezas de nuevo.');
          root.location.hash = '#/inicio';
          setTimeout(function () { if (App.Asistente) App.Asistente.abrir(); }, 200);
        });
      } }))));

    cont.appendChild(h('p', { class: 'explicacion', style: { textAlign: 'center', marginTop: '1rem' } }, 'Versión ' + M.APP_VERSION + ' · Los datos nunca salen de tu dispositivo.'));
  }

  App.registrarVista('configuracion', { titulo: 'Configuración y respaldos', render: render });
})(typeof self !== 'undefined' ? self : this);
