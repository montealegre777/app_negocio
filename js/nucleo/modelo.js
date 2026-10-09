/* Modelo de datos: constantes, valores por defecto y fábricas de entidades. UMD. */
(function (root, factory) {
  var F;
  if (typeof module === 'object' && module.exports) F = require('./formato.js'); else F = root.App.Formato;
  var mod = factory(F);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Modelo = mod; }
}(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var APP_VERSION = '1.0.0';
  var CLAVE = 'emprendedor.datos';

  var COLECCIONES = ['insumos', 'proveedores', 'recetas', 'canales', 'clientes', 'pedidos', 'cuentas', 'movimientosCaja',
    'gastos', 'gastosRecurrentes', 'compras', 'movInventario', 'lotes', 'metas', 'gastosFijosEstimados'];

  var ESTADOS_PEDIDO = ['pendiente', 'enPreparacion', 'entregado', 'cancelado'];
  var ETIQUETA_ESTADO = { pendiente: 'Pendiente', enPreparacion: 'En preparación', entregado: 'Entregado', cancelado: 'Cancelado' };
  var MEDIOS_PAGO = ['efectivo', 'transferencia', 'Nequi', 'Daviplata', 'tarjeta', 'plataforma', 'otro'];
  var CATEGORIAS_INSUMO = ['Ingrediente', 'Empaque', 'Otro'];
  var CATEGORIAS_GASTO = ['Transporte', 'Gas', 'Servicios', 'Publicidad', 'Utensilios', 'Mantenimiento', 'Arriendo', 'Mano de obra', 'Otros'];
  var TIPOS_CANAL = { directo: 'Venta directa', domicilioPropio: 'Domicilio propio', plataforma: 'Plataforma' };
  var TIPOS_MOV_CAJA = ['venta', 'gasto', 'compra', 'transferencia', 'aporte', 'retiro', 'devolucion', 'ajuste'];

  function crearId() {
    try {
      var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (typeof self !== 'undefined' && self.crypto);
      if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    } catch (e) { /* respaldo abajo */ }
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }
  function ahoraISO() { return new Date().toISOString(); }

  function configPorDefecto() {
    return {
      nombreNegocio: 'Mi negocio',
      margenObjetivo: 0.3,
      redondeoPrecio: 100,
      baseMarkup: 'produccion',
      politicaCosto: 'ultimo',
      modoInventario: 'sobrePedido',
      margenMinimoAlerta: 0.15,
      alertaVariacionInsumoPct: 0.1,
      diasCobroVencido: 15,
      mesesPromedioFijos: 3,
      impuestos: { activo: false, preciosIncluyenImpuesto: false },
      siguientePedido: 1,
      tema: 'auto',
      asistenteCompleto: false,
      ultimoRespaldo: null
    };
  }

  function datosVacios() {
    var d = {};
    COLECCIONES.forEach(function (c) { d[c] = []; });
    return d;
  }

  function docNuevo() {
    var t = ahoraISO();
    return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, config: configPorDefecto(), datos: datosVacios(), creadoEn: t, actualizadoEn: t };
  }

  /** Sellos comunes de toda entidad. */
  function sellar(obj, esDemo) {
    var t = ahoraISO();
    if (!obj.id) obj.id = crearId();
    if (!obj.creadoEn) obj.creadoEn = t;
    obj.actualizadoEn = t;
    if (typeof obj.esDemo !== 'boolean') obj.esDemo = !!esDemo;
    return obj;
  }

  function nuevoInsumo(o) {
    o = o || {};
    return {
      id: o.id, nombre: o.nombre || '', categoria: o.categoria || 'Ingrediente', unidadBase: o.unidadBase || 'g',
      presentacion: o.presentacion || { precio: 0, cantidad: 1, unidad: o.unidadBase || 'g' },
      mermaPct: typeof o.mermaPct === 'number' ? o.mermaPct : 0, equivalencias: o.equivalencias || [],
      stockMinimo: typeof o.stockMinimo === 'number' ? o.stockMinimo : 0, proveedorIdPreferido: o.proveedorIdPreferido || null,
      historialPrecios: o.historialPrecios || [], archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  function nuevaReceta(o) {
    o = o || {};
    var tipo = o.tipo || 'producto';
    return {
      id: o.id, tipo: tipo, nombre: o.nombre || '', categoria: o.categoria || '', descripcion: o.descripcion || '',
      emoji: o.emoji || (tipo === 'preparacion' ? '🥣' : tipo === 'combo' ? '🍱' : '🍔'), color: o.color || '#e07a1f',
      rinde: o.rinde > 0 ? o.rinde : 1, unidadRinde: o.unidadRinde || (tipo === 'preparacion' ? 'g' : 'und'),
      lineas: o.lineas || [], costosAdicionales: o.costosAdicionales || [],
      precioBase: typeof o.precioBase === 'number' ? o.precioBase : 0, preciosPorCanal: o.preciosPorCanal || {},
      margenObjetivo: typeof o.margenObjetivo === 'number' ? o.margenObjetivo : undefined,
      tarifaImpuesto: typeof o.tarifaImpuesto === 'number' ? o.tarifaImpuesto : 0,
      archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  function nuevaLinea(refTipo, refId, cantidad, unidad, mermaPct) {
    var l = { id: crearId(), refTipo: refTipo, refId: refId, cantidad: cantidad, unidad: unidad };
    if (typeof mermaPct === 'number') l.mermaPct = mermaPct;
    return l;
  }

  function nuevoCanal(o) {
    o = o || {};
    var tipo = o.tipo || 'directo';
    return {
      id: o.id, nombre: o.nombre || '', comisionPct: typeof o.comisionPct === 'number' ? o.comisionPct : 0, tipo: tipo,
      liquidaNeto: typeof o.liquidaNeto === 'boolean' ? o.liquidaNeto : tipo === 'plataforma',
      archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  function nuevoCliente(o) {
    o = o || {};
    return { id: o.id, nombre: o.nombre || '', telefono: o.telefono || '', direccion: o.direccion || '', notas: o.notas || '', archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn };
  }

  function nuevoProveedor(o) {
    o = o || {};
    return { id: o.id, nombre: o.nombre || '', telefono: o.telefono || '', notas: o.notas || '', archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn };
  }

  function nuevaCuenta(o) {
    o = o || {};
    return { id: o.id, nombre: o.nombre || '', saldoInicial: typeof o.saldoInicial === 'number' ? o.saldoInicial : 0, fechaSaldoInicial: o.fechaSaldoInicial || F.hoy(), archivado: !!o.archivado, esDemo: o.esDemo, creadoEn: o.creadoEn };
  }

  function nuevaLineaPedido(productoId, nombre, cantidad, precioUnit) {
    return { id: crearId(), productoId: productoId, nombreSnap: nombre, cantidad: cantidad, precioUnit: precioUnit, descuentoLinea: { tipo: '$', valor: 0 }, snap: null };
  }

  function nuevoPedido(o) {
    o = o || {};
    return {
      id: o.id, numero: o.numero, fecha: o.fecha || F.hoy(), clienteId: o.clienteId || null, canalId: o.canalId || null,
      estado: o.estado || 'pendiente', lineas: o.lineas || [], descuentoPedido: o.descuentoPedido || { tipo: '$', valor: 0 },
      envioCobrado: o.envioCobrado || 0, costoEnvio: o.costoEnvio || 0, pagos: o.pagos || [], observaciones: o.observaciones || '',
      esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  function nuevoGasto(o) {
    o = o || {};
    return {
      id: o.id, fecha: o.fecha || F.hoy(), descripcion: o.descripcion || '', categoria: o.categoria || 'Otros', tipo: o.tipo || 'variable',
      clasificacion: o.clasificacion || 'operativo', valor: o.valor || 0, estadoPago: o.estadoPago || 'pagado', cuentaId: o.cuentaId || null,
      fechaPago: o.fechaPago || null, observaciones: o.observaciones || '', recurrenteId: o.recurrenteId || null, esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  function nuevaCompra(o) {
    o = o || {};
    return {
      id: o.id, fecha: o.fecha || F.hoy(), proveedorId: o.proveedorId || null, lineas: o.lineas || [], flete: o.flete || 0,
      estadoPago: o.estadoPago || 'pagado', cuentaId: o.cuentaId || null, fechaPago: o.fechaPago || null, observaciones: o.observaciones || '',
      esDemo: o.esDemo, creadoEn: o.creadoEn
    };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, APP_VERSION: APP_VERSION, CLAVE: CLAVE, COLECCIONES: COLECCIONES,
    ESTADOS_PEDIDO: ESTADOS_PEDIDO, ETIQUETA_ESTADO: ETIQUETA_ESTADO, MEDIOS_PAGO: MEDIOS_PAGO,
    CATEGORIAS_INSUMO: CATEGORIAS_INSUMO, CATEGORIAS_GASTO: CATEGORIAS_GASTO, TIPOS_CANAL: TIPOS_CANAL, TIPOS_MOV_CAJA: TIPOS_MOV_CAJA,
    crearId: crearId, ahoraISO: ahoraISO, configPorDefecto: configPorDefecto, datosVacios: datosVacios, docNuevo: docNuevo, sellar: sellar,
    nuevoInsumo: nuevoInsumo, nuevaReceta: nuevaReceta, nuevaLinea: nuevaLinea, nuevoCanal: nuevoCanal, nuevoCliente: nuevoCliente,
    nuevoProveedor: nuevoProveedor, nuevaCuenta: nuevaCuenta, nuevaLineaPedido: nuevaLineaPedido, nuevoPedido: nuevoPedido,
    nuevoGasto: nuevoGasto, nuevaCompra: nuevaCompra
  };
}));
