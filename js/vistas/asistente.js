/* Asistente inicial de 4 pasos. Todos los valores son sugeridos y se pueden cambiar después en Configuración. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, F = App.Formato;
  var abierto = false;

  function abrir() {
    if (abierto) return;
    abierto = true;
    var cfg = E.config();
    var s = {
      paso: 0, punto: 'cero', nombre: cfg.nombreNegocio === 'Mi negocio' ? '' : cfg.nombreNegocio,
      margen: cfg.margenObjetivo, redondeo: cfg.redondeoPrecio, base: cfg.baseMarkup,
      cuentas: [{ nombre: 'Efectivo', saldo: 0 }, { nombre: '', saldo: 0 }],
      canales: [{ nombre: 'Venta directa', comision: 0 }, { nombre: '', comision: 0.2 }],
      modo: cfg.modoInventario, politica: cfg.politicaCosto
    };
    var TITULOS = ['Tu negocio', 'Precios y márgenes', 'Dinero y canales de venta', 'Inventario y costos'];
    var cuerpo = h('div', { class: 'pila' });
    var m;

    function sugerido() { return h('span', { class: 'explicacion' }, ' (valor sugerido, ajústalo a tu negocio)'); }

    function radio(nombre, valor, actual, titulo, texto, alElegir, deshabilitado) {
      var id = 'as-' + nombre + '-' + valor;
      var input = h('input', { type: 'radio', name: nombre, id: id, value: valor, checked: actual === valor, disabled: !!deshabilitado });
      input.addEventListener('change', function () { if (input.checked) alElegir(valor); });
      return h('label', { class: 'tarjeta', for: id, style: { display: 'flex', gap: '.7rem', cursor: deshabilitado ? 'not-allowed' : 'pointer', alignItems: 'flex-start' } },
        input, h('span', null, h('strong', null, titulo), h('br'), h('span', { class: 'explicacion' }, texto)));
    }

    function pasoNegocio() {
      var nombre = Form.texto({ etiqueta: 'Nombre de tu negocio', valor: s.nombre, placeholder: 'Ej. Sabores de Doña Luz', maxlength: 60 });
      nombre.alCambiar(function () { s.nombre = nombre.get(); });
      cuerpo.appendChild(h('p', null, '¡Bienvenido! En 4 pasos dejas la app lista. Todo se puede cambiar después.'));
      cuerpo.appendChild(nombre.el);
      cuerpo.appendChild(h('fieldset', null, h('legend', null, '¿Cómo quieres empezar?'),
        h('div', { class: 'pila' },
          radio('punto', 'cero', s.punto, 'Desde cero', 'Una app vacía para registrar tu negocio real. Recomendado.', function (v) { s.punto = v; pintar(); }),
          radio('punto', 'ejemplo', s.punto, 'Con datos de ejemplo', 'Una hamburguesa y un sándwich con ventas, compras y gastos ficticios para explorar. Los quitas con un clic cuando quieras.', function (v) { s.punto = v; pintar(); }))));
    }

    function pasoPrecios() {
      var margen = Form.numero({ etiqueta: 'Margen de ganancia que quieres ganar en cada venta', tipo: 'porcentaje', valor: s.margen, ayuda: 'De cada $ 100 que cobras, cuántos quieres que sean ganancia. Se usa para sugerirte precios.' });
      margen.alCambiar(function () { var v = margen.get(); s.margen = v; margen.error(v === null || isNaN(v) || v < 0 || v >= 1 ? 'Escribe un porcentaje entre 0 y 99.' : ''); });
      var redondeo = Form.seleccion({ etiqueta: 'Redondear los precios sugeridos hacia arriba a', valor: String(s.redondeo), vacio: false,
        opciones: [50, 100, 500, 1000].map(function (n) { return { valor: String(n), texto: F.cop(n) }; }) });
      redondeo.alCambiar(function () { s.redondeo = Number(redondeo.get()); });
      var base = Form.seleccion({ etiqueta: '«% de ganancia sobre el costo» se calcula sobre', valor: s.base, vacio: false,
        opciones: [{ valor: 'produccion', texto: 'El costo de producción (lo más común)' }, { valor: 'variables', texto: 'Todos los costos variables (incluye comisión y otros)' }] });
      base.alCambiar(function () { s.base = base.get(); });
      cuerpo.appendChild(h('p', { class: 'explicacion' }, 'Valores sugeridos: ajústalos a tu negocio.'));
      cuerpo.appendChild(Form.rejilla([margen, redondeo, base]));
      cuerpo.appendChild(h('p', { class: 'explicacion' }, 'Ojo: «margen» y «% de ganancia sobre el costo» son cosas distintas. Si compras a $ 1.000 y vendes a $ 2.000, ganas 50 % del precio (margen) y 100 % sobre el costo.'));
    }

    function pasoDinero() {
      if (s.punto === 'ejemplo') {
        cuerpo.appendChild(App.Comun.aviso('info', 'Con los datos de ejemplo ya vienen cuentas (Efectivo y Nequi) y dos canales de venta. Podrás crear los tuyos cuando quites el ejemplo.'));
        return;
      }
      cuerpo.appendChild(h('p', null, '¿Dónde guardas el dinero de tu negocio? Con el saldo de hoy podrás ver cuánto tienes en caja.'));
      s.cuentas.forEach(function (c, i) {
        var n = Form.texto({ etiqueta: i === 0 ? 'Cuenta 1' : 'Cuenta ' + (i + 1) + ' (opcional)', valor: c.nombre, placeholder: i === 1 ? 'Ej. Nequi o Bancolombia' : '', maxlength: 40 });
        var sv = Form.numero({ etiqueta: 'Saldo de hoy', tipo: 'moneda', valor: c.saldo });
        n.alCambiar(function () { c.nombre = n.get(); }); sv.alCambiar(function () { var v = sv.get(); c.saldo = v === null || isNaN(v) ? 0 : v; });
        cuerpo.appendChild(Form.rejilla([n, sv]));
      });
      cuerpo.appendChild(h('hr'));
      cuerpo.appendChild(h('p', null, '¿Por dónde vendes? Si una plataforma te cobra comisión, anótala para que los precios la tengan en cuenta.'));
      s.canales.forEach(function (c, i) {
        var n = Form.texto({ etiqueta: i === 0 ? 'Canal 1' : 'Canal ' + (i + 1) + ' (opcional)', valor: c.nombre, placeholder: i === 1 ? 'Ej. Rappi o Didi' : '', maxlength: 40 });
        var cm = Form.numero({ etiqueta: 'Comisión que cobra', tipo: 'porcentaje', valor: c.comision });
        n.alCambiar(function () { c.nombre = n.get(); }); cm.alCambiar(function () { var v = cm.get(); c.comision = v === null || isNaN(v) ? 0 : v; });
        cuerpo.appendChild(Form.rejilla([n, cm]));
      });
    }

    function pasoInventario() {
      cuerpo.appendChild(h('fieldset', null, h('legend', null, '¿Cómo manejas el inventario?'), h('div', { class: 'pila' },
        radio('modo', 'sobrePedido', s.modo, 'Sencillo: descontar al entregar', 'Cuando entregas un pedido, la app descuenta los insumos que gastaste. Recomendado.', function (v) { s.modo = v; }, s.punto === 'ejemplo'),
        radio('modo', 'conProduccion', s.modo, 'Por lotes', 'Anotas cuánto produces y vendes del producto terminado. Más control, más trabajo.', function (v) { s.modo = v; }, s.punto === 'ejemplo'))));
      if (s.punto === 'ejemplo') cuerpo.appendChild(h('p', { class: 'explicacion' }, 'Con los datos de ejemplo se usa el modo sencillo; podrás cambiarlo después.'));
      cuerpo.appendChild(h('fieldset', null, h('legend', null, '¿Con qué precio de insumo calculas tus costos?'), h('div', { class: 'pila' },
        radio('politica', 'ultimo', s.politica, 'El último precio que pagué', 'Reacciona rápido cuando algo sube. Recomendado.', function (v) { s.politica = v; }),
        radio('politica', 'promedio', s.politica, 'El promedio de mis compras', 'Más estable; usa todas tus compras registradas.', function (v) { s.politica = v; }))));
    }

    var pasos = [pasoNegocio, pasoPrecios, pasoDinero, pasoInventario];
    var btnAtras, btnSig, btnOmitir;

    function valido() {
      if (s.paso === 1 && (s.margen === null || isNaN(s.margen) || s.margen < 0 || s.margen >= 1)) return 'El margen debe estar entre 0 % y 99 %.';
      return null;
    }

    function pintar() {
      App.Dom.limpiar(cuerpo);
      var puntos = h('ol', { class: 'fila', style: { listStyle: 'none', padding: 0, margin: '0 0 .5rem', gap: '.4rem' }, 'aria-label': 'Progreso' }, TITULOS.map(function (t, i) {
        return h('li', { 'aria-current': i === s.paso ? 'step' : null }, h('span', { class: 'insignia ' + (i === s.paso ? 'info' : i < s.paso ? 'ok' : '') }, (i + 1) + '. ' + t));
      }));
      cuerpo.appendChild(puntos);
      cuerpo.appendChild(h('h3', { style: { margin: '.25rem 0' } }, TITULOS[s.paso]));
      pasos[s.paso]();
      btnAtras.disabled = s.paso === 0;
      App.Dom.limpiar(btnSig);
      btnSig.appendChild(document.createTextNode(s.paso === pasos.length - 1 ? 'Terminar y empezar' : 'Siguiente'));
    }

    function terminar() {
      E.mutar(function (d) {
        d.config.nombreNegocio = s.nombre || 'Mi negocio';
        d.config.margenObjetivo = s.margen;
        d.config.redondeoPrecio = s.redondeo;
        d.config.baseMarkup = s.base;
        d.config.politicaCosto = s.politica;
        d.config.modoInventario = s.punto === 'ejemplo' ? 'sobrePedido' : s.modo;
        if (s.punto === 'ejemplo') {
          App.Demo.generar(d);
        } else {
          s.cuentas.filter(function (c) { return c.nombre; }).forEach(function (c) {
            O.guardarEntidad(d, 'cuentas', M.nuevaCuenta({ nombre: c.nombre, saldoInicial: c.saldo, fechaSaldoInicial: F.hoy() }));
          });
          s.canales.filter(function (c) { return c.nombre; }).forEach(function (c) {
            var okc = App.Validacion.validarCanal({ nombre: c.nombre, comisionPct: c.comision }, d).ok;
            if (okc) O.guardarEntidad(d, 'canales', M.nuevoCanal({ nombre: c.nombre, comisionPct: c.comision, tipo: c.comision > 0 ? 'plataforma' : 'directo' }));
          });
        }
        d.config.asistenteCompleto = true;
      });
      abierto = false;
      m.cerrar();
      App.Toast.ok(s.punto === 'ejemplo' ? 'Listo. Explora con los datos de ejemplo.' : '¡Listo! Empieza creando tus insumos y tu primer producto.');
      App.Router.ir(s.punto === 'ejemplo' ? 'inicio' : 'inicio');
    }

    btnAtras = h('button', { type: 'button', class: 'btn', onclick: function () { if (s.paso > 0) { s.paso--; pintar(); } } }, 'Atrás');
    btnSig = h('button', {
      type: 'button', class: 'btn btn-primario', onclick: function () {
        var err = valido();
        if (err) { App.Toast.error(err); return; }
        if (s.paso < pasos.length - 1) { s.paso++; pintar(); } else terminar();
      }
    });
    btnOmitir = h('button', {
      type: 'button', class: 'btn btn-fantasma', onclick: function () {
        E.mutar(function (d) { d.config.asistenteCompleto = true; });
        abierto = false; m.cerrar();
      }
    }, 'Omitir por ahora');

    pintar();
    m = App.Modal.abrir({
      titulo: 'Configura tu negocio', tamano: 'ancho', bloquearEsc: true,
      contenido: cuerpo, pie: [btnOmitir, btnAtras, btnSig], alCerrar: function () { abierto = false; }
    });
  }

  App.Asistente = { abrir: abrir };
})(typeof self !== 'undefined' ? self : this);
