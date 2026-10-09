# Mi Negocio — gestión para emprendimientos de alimentos

Aplicación web para llevar en un solo lugar: **costos y precios, ventas y pedidos, clientes, gastos, compras, inventario, producción, caja y resultados**. Pensada para un negocio pequeño de comida en Colombia (pesos COP, fechas AAAA-MM-DD, zona horaria America/Bogotá, semana que empieza el lunes).

No tiene servidor, cuentas ni paso de compilación. Son archivos estáticos: HTML + CSS + JavaScript puro.

> **Importante:** tus datos se guardan **solo en este navegador** (localStorage). No hay sincronización entre celular y computador, ni inicio de sesión. Haz un respaldo con frecuencia (Configuración → Descargar respaldo).

## Cómo abrirla

1. **Lo más simple:** abre `index.html` con doble clic.
2. **Recomendado (para instalarla como app y que funcione sin internet):** publícala en cualquier hosting estático gratuito (Netlify Drop, Cloudflare Pages, GitHub Pages, Vercel…) o sírvela localmente:
   ```bash
   npx serve .          # o: python3 -m http.server 8080
   ```
   Con `http://` o `https://` se activa el *service worker* (funciona sin conexión) y el navegador te ofrece «Instalar app».

Un respaldo es específico del **sitio** donde lo creaste: abrir `index.html` desde el disco y abrirla desde un hosting son «lugares» distintos con datos distintos. Pasa los datos de uno a otro con *Descargar respaldo* → *Importar*.

## Primeros pasos (10 minutos)

1. **Inicio:** al abrir verás un asistente. Puedes cargar **datos de ejemplo** para explorar y quitarlos después (Configuración → «Quitar datos de ejemplo», escribes `QUITAR`; tus registros reales se conservan).
2. **Insumos:** crea lo que compras (nombre, presentación, cantidad, precio). Ej. «Carne molida — 500 g — $12.000».
3. **Productos:** arma la receta con cantidades por unidad, merma si aplica, empaque y mano de obra. La app calcula costo y te sugiere precio según el margen que quieras.
4. **Canales:** si vendes por plataformas (Rappi, etc.) define su comisión y el precio por canal.
5. **Ventas:** registra pedidos, cobros y entregas. **Gastos / Compras:** registra lo que pagas. **Caja:** ve cuánto tienes y quién te debe.
6. **Resultados / Equilibrio:** ganancia real del periodo, puente de utilidad a caja, punto de equilibrio y metas del mes.

## Secciones

| Ruta | Para qué sirve |
|---|---|
| `#/inicio` | Resumen del día/mes, alertas y atajos |
| `#/insumos` | Ingredientes y empaques, historial de precios, variaciones |
| `#/productos` | Recetas, sub-recetas (preparaciones), combos, costo y precio |
| `#/canales` | Canales de venta, comisiones, precios por canal |
| `#/calculadora` | «¿A cuánto vendo esto?» sin guardar nada |
| `#/ventas` | Pedidos, pagos parciales, entregas, descuentos, WhatsApp |
| `#/clientes` | Clientes, historial y mensaje de cobro |
| `#/gastos` | Gastos fijos y variables, pendientes por pagar |
| `#/compras` | Compras a proveedores (el flete se prorratea) |
| `#/inventario` | Existencias, stock bajo, conteo físico, mermas |
| `#/produccion` | Plan de producción → lista de compras; lotes (modo con producción) |
| `#/caja` | Cuentas, movimientos, por cobrar, por pagar, transferencias |
| `#/resultados` | Estado de resultados, comparación con el periodo anterior, gráficos |
| `#/equilibrio` | Punto de equilibrio, calculadora de meta, metas mensuales |
| `#/carta` | Lista de precios para imprimir o enviar por WhatsApp |
| `#/configuracion` | Negocio, políticas de costeo, respaldos, importación, recuperación |

## Cómo calcula (reglas clave)

- **Costo de insumo:** política *último precio* o *promedio* (configurable). El flete de una compra se reparte proporcionalmente entre sus ítems.
- **Unidades:** g/kg, ml/l, und/docena, más equivalencias propias (ej. «1 huevo = 50 g»).
- **Merma:** si un insumo rinde 90 %, el costo sube en proporción.
- **Precio sugerido** = (costo + costos fijos adicionales por unidad) ÷ (1 − margen objetivo − comisión del canal − % adicionales), redondeado hacia arriba (a $100 por defecto). Si la resta da cero o menos, la app dice que no existe un precio posible y qué bajar.
- **Utilidad ≠ caja.** La utilidad cuenta lo vendido y lo gastado; la caja cuenta lo cobrado y lo pagado. El *puente utilidad → caja* explica la diferencia (por cobrar, por pagar, inventario, aportes/retiros, otros). El residual se muestra como «Otros» y se marca como estimación.
- **Pedidos:** al entregar se congela una *foto* (precios, costos, comisión) para que cambios posteriores no alteren el histórico.
- **Inventario** con dos modos: *sobre pedido* (la entrega descuenta insumos) y *con producción* (los lotes descuentan insumos y suman producto terminado; las ventas descuentan producto terminado).
- **Por cobrar:** pedido entregado con saldo > 0.
- **Punto de equilibrio** = gastos fijos ÷ margen de contribución ponderado de los últimos 90 días (o el margen que indiques si aún no tienes ventas).

### Casos de referencia (verificados en `tests/`)

| Caso (datos de ejemplo) | Resultado |
|---|---|
| Hamburguesa: costo de producción | $3.905 |
| Hamburguesa en plataforma de domicilios (precio $12.000): costos variables totales | $6.805 |
| Hamburguesa en plataforma: ganancia por unidad | $5.195 (margen 43,29 %) |
| Lote de producción de ejemplo | $78.100 |
| Punto de equilibrio de ejemplo | $2.500.000 de ventas / 193 unidades |
| Caja de ejemplo | $120.000 |

## Respaldos, importación y recuperación

- **Descargar respaldo:** JSON completo con todos tus datos.
- **Importar:** valida el archivo antes de tocar nada, muestra un resumen y exige escribir `REEMPLAZAR`. Rechaza archivos que no sean un respaldo de esta app.
- **Copia automática:** además del guardado normal se mantiene una copia anterior (`.bak`). Si los datos se dañan, la pantalla de **Recuperación** permite restaurar la copia o descargar lo que haya para enviarlo a revisión.
- **Exportar CSV** (Excel en español: separador `;`, con BOM): insumos, recetas/productos, ventas, gastos, compras, inventario y sus movimientos, caja, lista de compras y resumen mensual.
- Acciones destructivas piden escribir una palabra: `BORRAR`, `BORRAR TODO`, `ELIMINAR`, `QUITAR`, `REEMPLAZAR`.

## Estructura del proyecto

```
index.html            # punto de entrada (scripts clásicos, sin módulos: funciona en file://)
manifest.json         # PWA
service-worker.js     # caché sin conexión (solo http/https). Cambia VERSION al publicar cambios
css/                  # base, componentes, layout (con modo oscuro e impresión)
icons/                # íconos de la app
vendor/               # Chart.js 4.4.9 (local, sin CDN)
js/nucleo/            # lógica pura, sin DOM (también corre en Node)
js/ui/                # dom, formularios, tablas, modales, toasts, íconos
js/vistas/            # una pantalla por archivo
js/almacen.js         # persistencia (localStorage + copia .bak)
js/estado.js          # único punto de escritura: Estado.mutar(fn)
js/demo.js            # datos de ejemplo
tests/                # pruebas con node:test
```

Reglas del código: un único espacio de nombres global `App`; todo el DOM se crea con `h()` (nunca `innerHTML` con datos del usuario); todo cambio de datos pasa por `Estado.mutar`; los movimientos de inventario y caja derivados se regeneran de forma idempotente.

## Pruebas

```bash
npm test        # Node 18+; 77 pruebas, sin dependencias
```

Cubren unidades, costos, precios por canal, comisiones, inventario y producción, caja, puente utilidad→caja, punto de equilibrio, migraciones, validación e importación, e invariantes (p. ej. regenerar movimientos dos veces no duplica nada).

## Publicar una nueva versión

1. Edita lo que necesites.
2. Cambia `VERSION` en `service-worker.js` (si no, quien ya la instaló seguirá viendo la versión vieja en caché).
3. Si cambias la forma de los datos: sube la versión de esquema y agrega la migración en `js/nucleo/migraciones.js` (los datos viejos se migran al abrir; los de una versión más nueva se rechazan con un mensaje claro).

## Límites conocidos

- Datos solo locales: borrar «datos del sitio» del navegador borra todo (por eso los respaldos).
- Sin sincronización entre dispositivos ni usuarios múltiples.
- localStorage tiene un tope de unos 5 MB por sitio; para un negocio pequeño alcanza para años, pero mira la barra «Espacio usado en el navegador» en Configuración.
- Los impuestos (IVA/INC) son opcionales y vienen desactivados; la app **no** reemplaza la contabilidad ni la facturación electrónica.
- Las cifras de «Otros» en el puente utilidad→caja son una estimación.
