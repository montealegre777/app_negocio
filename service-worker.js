/* Service worker: deja la app disponible sin conexión.
   Estrategia: se guarda todo el «caparazón» de la app al instalar y se sirve desde la caché
   (mientras se actualiza en segundo plano). Los datos del negocio NO pasan por aquí: viven en localStorage.
   Al publicar una versión nueva, cambia VERSION para que los usuarios reciban los archivos nuevos. */
const VERSION = 'v1.0.0';
const CACHE = 'mi-negocio-' + VERSION;
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.json',
  'css/base.css',
  'css/componentes.css',
  'css/layout.css',
  'vendor/chart.umd.min.js',
  'js/nucleo/unidades.js',
  'js/nucleo/formato.js',
  'js/nucleo/modelo.js',
  'js/nucleo/calculos.js',
  'js/nucleo/derivados.js',
  'js/nucleo/operaciones.js',
  'js/nucleo/analisis.js',
  'js/nucleo/migraciones.js',
  'js/nucleo/validacion.js',
  'js/almacen.js',
  'js/ui/dom.js',
  'js/ui/iconos.js',
  'js/ui/toast.js',
  'js/ui/modal.js',
  'js/ui/form.js',
  'js/ui/tabla.js',
  'js/graficos.js',
  'js/estado.js',
  'js/exportar.js',
  'js/demo.js',
  'js/vistas/comun.js',
  'js/vistas/importar.js',
  'js/vistas/recuperacion.js',
  'js/vistas/calculadora.js',
  'js/vistas/asistente.js',
  'js/vistas/insumos.js',
  'js/vistas/productos.js',
  'js/vistas/canales.js',
  'js/vistas/ventas.js',
  'js/vistas/clientes.js',
  'js/vistas/gastos.js',
  'js/vistas/compras.js',
  'js/vistas/inventario.js',
  'js/vistas/produccion.js',
  'js/vistas/caja.js',
  'js/vistas/resultados.js',
  'js/vistas/equilibrio.js',
  'js/vistas/carta.js',
  'js/vistas/inicio.js',
  'js/vistas/configuracion.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('mi-negocio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const red = fetch(req).then((resp) => {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      e.waitUntil(red);
      if (guardado) return guardado;
      const resp = await red;
      if (resp) return resp;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    })
  );
});
