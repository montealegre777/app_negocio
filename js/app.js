/* Arranque, esqueleto de la interfaz, enrutador por hash, tema, avisos globales y atajos de teclado. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono, E = App.Estado, F = App.Formato, A = App.Analisis;

  App.Acciones = App.Acciones || {};
  var vistas = App.Vistas = App.Vistas || {};
  var rutaActual = null, paramsActual = {};
  var el = {};
  var arrancado = false;

  var GRUPOS = [
    { titulo: 'Negocio', items: [
      { ruta: 'inicio', texto: 'Inicio', icono: 'home' }, { ruta: 'resultados', texto: 'Resultados', icono: 'chart' }, { ruta: 'caja', texto: 'Caja', icono: 'wallet' }] },
    { titulo: 'Costos', items: [
      { ruta: 'productos', texto: 'Productos y preparaciones', icono: 'tag' }, { ruta: 'insumos', texto: 'Insumos', icono: 'box' }, { ruta: 'canales', texto: 'Canales de venta', icono: 'swap' }] },
    { titulo: 'Operación', items: [
      { ruta: 'ventas', texto: 'Ventas y pedidos', icono: 'bag' }, { ruta: 'clientes', texto: 'Clientes', icono: 'users' }, { ruta: 'compras', texto: 'Compras y proveedores', icono: 'truck' },
      { ruta: 'inventario', texto: 'Inventario', icono: 'layers' }, { ruta: 'produccion', texto: 'Producción y compras', icono: 'clipboard' }] },
    { titulo: 'Gestión', items: [
      { ruta: 'gastos', texto: 'Gastos', icono: 'dollar' }, { ruta: 'equilibrio', texto: 'Equilibrio y metas', icono: 'target' }, { ruta: 'carta', texto: 'Carta', icono: 'book' }] },
    { titulo: 'Sistema', items: [{ ruta: 'configuracion', texto: 'Configuración y respaldos', icono: 'sliders' }] }
  ];

  // ---------------- Enrutador ----------------
  function leerHash() {
    var partes = (root.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var ruta = partes[0] || 'inicio';
    if (!vistas[ruta]) ruta = 'inicio';
    return { ruta: ruta, params: { id: partes[1] ? decodeURIComponent(partes[1]) : null, resto: partes.slice(2) } };
  }

  function tituloDe(vista, params) { return typeof vista.titulo === 'function' ? vista.titulo(params) : vista.titulo; }

  function renderizar(esNavegacion) {
    if (!E.doc()) return;
    var r = leerHash();
    var vista = vistas[r.ruta];
    if (!vista) return;
    var y = root.scrollY;
    var mismaRuta = rutaActual === r.ruta && paramsActual.id === r.params.id;
    rutaActual = r.ruta; paramsActual = r.params;
    App.Graficos.limpiar();
    App.Dom.limpiar(el.contenido);
    var titulo = tituloDe(vista, r.params);
    try {
      vista.render(el.contenido, r.params);
    } catch (e) {
      console.error(e);
      el.contenido.appendChild(h('div', { class: 'aviso error', role: 'alert' }, icono('alert'),
        h('div', null, h('strong', null, 'Algo salió mal al mostrar esta pantalla.'), h('p', null, 'Tus datos están a salvo. Detalle técnico: ' + (e && e.message)),
          h('button', { type: 'button', class: 'btn', onclick: function () { root.location.hash = '#/inicio'; } }, 'Ir al inicio'))));
    }
    el.titulo.textContent = titulo;
    document.title = titulo + ' · ' + (E.config().nombreNegocio || 'Mi negocio');
    marcarMenu();
    actualizarBanners();
    if (mismaRuta && !esNavegacion) root.scrollTo(0, y);
    else { root.scrollTo(0, 0); if (esNavegacion) { el.contenido.focus({ preventScroll: true }); } }
  }

  var pendiente = false;
  function programarRender() {
    if (pendiente) return;
    pendiente = true;
    root.requestAnimationFrame(function () { pendiente = false; renderizar(false); });
  }

  App.Router = {
    registrar: function (ruta, vista) { vistas[ruta] = vista; },
    ir: function (ruta) { root.location.hash = '#/' + ruta; },
    refrescar: programarRender,
    actual: function () { return { ruta: rutaActual, params: paramsActual }; }
  };

  // ---------------- Tema ----------------
  function temaGuardado() { try { return root.localStorage.getItem('emprendedor.tema') || 'auto'; } catch (e) { return 'auto'; } }
  function aplicarTema(t) {
    if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-tema', t); else document.documentElement.removeAttribute('data-tema');
    try { root.localStorage.setItem('emprendedor.tema', t); } catch (e) { /* nada */ }
  }
  App.Tema = { aplicar: function (t) { aplicarTema(t); actualizarBotonTema(); if (E.doc()) renderizar(false); }, actual: function () { return temaGuardado(); } };
  function esOscuro() {
    var t = temaGuardado();
    return t === 'oscuro' || (t === 'auto' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function alternarTema() {
    aplicarTema(esOscuro() ? 'claro' : 'oscuro');
    actualizarBotonTema();
    if (E.doc()) renderizar(false); // los gráficos leen los colores del tema
  }
  function actualizarBotonTema() {
    if (!el.btnTema) return;
    App.Dom.limpiar(el.btnTema);
    el.btnTema.appendChild(icono(esOscuro() ? 'sun' : 'moon'));
    el.btnTema.setAttribute('aria-label', esOscuro() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    el.btnTema.title = el.btnTema.getAttribute('aria-label');
  }

  // ---------------- Esqueleto ----------------
  function enlaceMenu(it) {
    return h('a', { class: 'menu-enlace', href: '#/' + it.ruta, 'data-ruta': it.ruta, title: it.texto }, icono(it.icono), h('span', { class: 'texto' }, it.texto), h('span', { class: 'insignia aviso', hidden: true, 'data-contador': it.ruta }));
  }

  function construirEsqueleto() {
    var raiz = document.getElementById('raiz');
    App.Dom.limpiar(raiz);
    el.nombreNegocio = h('span', { class: 'nombre-negocio' }, 'Mi negocio');
    el.menu = h('nav', { class: 'menu-lateral', 'aria-label': 'Menú principal' },
      h('div', { class: 'marca' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '🍽️'), el.nombreNegocio),
      GRUPOS.map(function (g) { return h('div', { class: 'menu-grupo' }, h('h2', null, g.titulo), g.items.map(enlaceMenu)); }),
      h('div', { class: 'menu-pie' },
        h('p', { class: 'explicacion no-imprimir ocultar-colapsado', style: { padding: '0 .6rem' } }, '💾 Tus datos se guardan solo en este navegador. Haz respaldos desde Configuración.'),
        h('button', { type: 'button', class: 'menu-enlace', style: { background: 'none', border: 0, font: 'inherit', cursor: 'pointer', width: '100%' }, onclick: alternarMenu, 'aria-label': 'Contraer o expandir el menú' },
          icono('colapsar'), h('span', { class: 'texto' }, 'Contraer menú'))));

    el.titulo = h('h1', { id: 'titulo-vista' }, 'Inicio');
    el.guardado = h('span', { class: 'estado-guardado', role: 'status' });
    el.btnTema = h('button', { type: 'button', class: 'btn btn-fantasma btn-icono', onclick: alternarTema });
    el.btnVenta = h('button', { type: 'button', class: 'btn btn-primario ocultar-movil', onclick: function () { if (App.Acciones.nuevaVenta) App.Acciones.nuevaVenta(); } }, icono('plus'), 'Nueva venta');
    el.barra = h('header', { class: 'barra-superior' },
      h('button', { type: 'button', class: 'btn btn-fantasma btn-icono solo-movil', 'aria-label': 'Abrir menú completo', onclick: abrirHojaMenu }, icono('menu')),
      el.titulo, el.guardado,
      h('button', { type: 'button', class: 'btn btn-fantasma btn-icono', 'aria-label': 'Calculadora rápida (Alt+K)', title: 'Calculadora rápida (Alt+K)', onclick: function () { if (App.Acciones.calculadora) App.Acciones.calculadora(); } }, icono('calc')),
      el.btnTema, el.btnVenta);
    el.banner = h('div', { class: 'banner-global pila', 'aria-live': 'polite' });
    el.contenido = h('main', { class: 'contenido', id: 'contenido', tabindex: '-1', 'aria-labelledby': 'titulo-vista' });
    el.principal = h('div', { class: 'principal' }, el.barra, el.banner, el.contenido);

    function itemInf(it) { return h('a', { href: '#/' + it.ruta, 'data-ruta': it.ruta }, icono(it.icono), it.texto.split(' ')[0].replace('Ventas', 'Ventas')); }
    el.inferior = h('nav', { class: 'barra-inferior', 'aria-label': 'Navegación móvil' },
      [{ ruta: 'inicio', texto: 'Inicio', icono: 'home' }, { ruta: 'ventas', texto: 'Ventas', icono: 'bag' }, { ruta: 'productos', texto: 'Productos', icono: 'tag' }, { ruta: 'caja', texto: 'Caja', icono: 'wallet' }].map(itemInf),
      h('button', { type: 'button', onclick: abrirHojaMenu }, icono('mas'), 'Más'));
    el.fab = h('button', { type: 'button', class: 'btn btn-primario fab-venta', onclick: function () { if (App.Acciones.nuevaVenta) App.Acciones.nuevaVenta(); } }, icono('plus'), 'Nueva venta');

    el.app = h('div', { class: 'app' + (menuColapsado() ? ' menu-colapsado' : '') }, el.menu, el.principal);
    raiz.appendChild(h('a', { href: '#contenido', class: 'solo-lector', onclick: function (e) { e.preventDefault(); el.contenido.focus(); } }, 'Saltar al contenido'));
    raiz.appendChild(el.app);
    raiz.appendChild(el.inferior);
    raiz.appendChild(el.fab);
    actualizarBotonTema();
  }

  function menuColapsado() { try { return root.localStorage.getItem('emprendedor.menuColapsado') === '1'; } catch (e) { return false; } }
  function alternarMenu() {
    var c = !el.app.classList.contains('menu-colapsado');
    el.app.classList.toggle('menu-colapsado', c);
    try { root.localStorage.setItem('emprendedor.menuColapsado', c ? '1' : '0'); } catch (e) { /* nada */ }
  }

  function abrirHojaMenu() {
    var cont = h('div', { class: 'hoja-menu' }, GRUPOS.map(function (g) {
      return h('div', null, h('h3', null, g.titulo), g.items.map(function (it) {
        return h('a', { href: '#/' + it.ruta, onclick: function () { m.cerrar(); } }, icono(it.icono), it.texto);
      }));
    }), h('p', { class: 'explicacion', style: { marginTop: '1rem' } }, '💾 Tus datos se guardan solo en este navegador. Haz respaldos desde Configuración.'));
    var m = App.Modal.abrir({ titulo: 'Menú', contenido: cont, panel: true });
  }

  function marcarMenu() {
    App.Dom.$$('[data-ruta]', document).forEach(function (a) {
      if (a.dataset.ruta === rutaActual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // contadores discretos
    try {
      var doc = E.doc(), hoy = F.hoy();
      var abiertos = A.pedidosAbiertos(doc).length;
      var bajo = A.insumosStockBajo(doc, A.stockInsumos(doc)).length;
      var venc = A.cuentasPorCobrar(doc, hoy).filter(function (x) { return x.vencida; }).length;
      var cont = { ventas: abiertos, inventario: bajo, caja: venc };
      App.Dom.$$('[data-contador]', el.menu).forEach(function (b) {
        var n = cont[b.dataset.contador];
        b.hidden = !n; b.textContent = n ? String(n) : '';
        if (n) b.setAttribute('title', b.dataset.contador === 'ventas' ? 'Pedidos abiertos' : b.dataset.contador === 'inventario' ? 'Insumos con stock bajo' : 'Cuentas por cobrar vencidas');
      });
      el.nombreNegocio.textContent = doc.config.nombreNegocio || 'Mi negocio';
    } catch (e) { /* los contadores son decorativos */ }
  }

  // ---------------- Avisos globales ----------------
  var otraPestana = false;
  function actualizarBanners() {
    App.Dom.limpiar(el.banner);
    if (!E.doc()) return;
    if (E.sinAlmacenamiento()) {
      el.banner.appendChild(App.Comun.aviso('error', [h('strong', null, 'Este navegador no permite guardar datos (modo privado o bloqueado). '),
        'Lo que registres se perderá al cerrar la pestaña. Abre la app en una ventana normal o descarga respaldos seguido.'], 'alert'));
    }
    if (otraPestana) {
      el.banner.appendChild(App.Comun.aviso('warn', [h('strong', null, 'Se modificaron los datos en otra pestaña. '), 'Si sigues editando aquí podrías sobrescribir esos cambios. ',
        h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { if (E.recargarDesdeAlmacen()) { otraPestana = false; App.Toast.ok('Datos recargados.'); } else App.Toast.error('No pude leer los datos de la otra pestaña.'); } }, 'Recargar los datos'),
        ' ', h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { otraPestana = false; actualizarBanners(); } }, 'Seguir con esta pestaña')], 'alert'));
    }
    if (App.Operaciones.hayDemo(E.doc())) {
      el.banner.appendChild(App.Comun.aviso('info', [h('strong', null, 'Estás viendo datos de ejemplo. '), 'Los precios son ilustrativos. ',
        h('button', { type: 'button', class: 'btn btn-chico', onclick: App.Acciones.quitarDemo }, 'Quitar datos de ejemplo')], 'info'));
    }
  }

  App.Acciones.quitarDemo = function () {
    App.Modal.confirmar({
      titulo: 'Quitar datos de ejemplo', peligro: true, palabra: 'QUITAR', textoConfirmar: 'Quitar datos de ejemplo',
      mensaje: 'Se borrarán solo los datos marcados como EJEMPLO (productos, ventas, gastos, etc.). Lo que tú hayas creado no se toca.'
    }).then(function (ok) {
      if (!ok) return;
      var res = null;
      var antes = JSON.stringify(E.doc());
      E.mutar(function (d) { res = App.Operaciones.quitarDemo(d); });
      if (res && !res.ok) {
        App.Modal.abrir({
          titulo: 'No se pueden quitar todavía', tamano: 'chico',
          contenido: h('div', null, h('p', null, 'Algunos datos tuyos dependen de datos de ejemplo. Cámbialos o bórralos primero:'), h('ul', null, res.bloqueos.slice(0, 8).map(function (b) { return h('li', null, b); }))),
          pie: [h('button', { type: 'button', class: 'btn btn-primario', onclick: function () { root.document.querySelector('dialog').close(); } }, 'Entendido')]
        });
      } else if (res) {
        App.Toast.mostrar('Datos de ejemplo eliminados (' + res.quitados + ' registros).', { accion: 'Deshacer', duracion: 8000, onAccion: function () { E.usarDocumento(JSON.parse(antes)); } });
      }
    });
  };

  function actualizarGuardado(g) {
    if (!el.guardado) return;
    App.Dom.limpiar(el.guardado);
    el.guardado.className = 'estado-guardado' + (g.estado === 'error' ? ' error' : '');
    if (g.estado === 'pendiente') el.guardado.appendChild(document.createTextNode('Guardando…'));
    else if (g.estado === 'error') el.guardado.appendChild(h('span', null, icono('alert'), ' Error al guardar'));
    else el.guardado.appendChild(h('span', null, icono('check'), ' Guardado'));
  }

  // ---------------- Atajos ----------------
  function enCampo(t) { return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); }
  function atajos(e) {
    if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); if (App.Acciones.nuevaVenta) App.Acciones.nuevaVenta(); }
    else if (e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (App.Acciones.calculadora) App.Acciones.calculadora(); }
    else if (e.key === '/' && !enCampo(e.target) && !document.querySelector('dialog[open]')) {
      var b = el.contenido.querySelector('input[type="search"]');
      if (b) { e.preventDefault(); b.focus(); }
    }
  }

  // ---------------- Arranque ----------------
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(root.location.protocol)) return; // en file:// se omite sin errores
    navigator.serviceWorker.register('service-worker.js').catch(function () { /* sin conexión no es crítico */ });
  }

  function iniciarVistas() {
    root.addEventListener('hashchange', function () { renderizar(true); });
    E.suscribir(programarRender);
    E.suscribirGuardado(actualizarGuardado);
    actualizarGuardado(E.estadoGuardado());
    E.vigilarOtraPestana();
    E.alCambioExterno(function () { otraPestana = true; actualizarBanners(); });
    renderizar(true);
    if (!E.config().asistenteCompleto && App.Asistente) App.Asistente.abrir();
  }

  function arrancar() {
    App.Iconos.instalar();
    aplicarTema(temaGuardado());
    var r = E.iniciar();
    construirEsqueleto();
    root.document.addEventListener('keydown', atajos);
    if (r.estado === 'corrupto' || r.estado === 'invalido') {
      App.Recuperacion.mostrar(r, function () { arrancado = true; iniciarVistas(); });
    } else {
      arrancado = true;
      iniciarVistas();
      if (r.estado === 'migrado') App.Toast.ok('Tus datos se actualizaron a la versión más reciente de la app.');
    }
    registrarServiceWorker();
  }

  App.arrancar = arrancar;
  App.estaArrancada = function () { return arrancado; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})(typeof self !== 'undefined' ? self : this);
