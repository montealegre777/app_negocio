/* Datos de ejemplo. Reproducen la hoja de cálculo original (hamburguesa de lentejas y sándwich de pollo).
   Todo lo que crea lleva esDemo:true, así "Quitar datos de ejemplo" solo borra esto. UMD. */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { M: require('./nucleo/modelo.js'), F: require('./nucleo/formato.js'), C: require('./nucleo/calculos.js'), O: require('./nucleo/operaciones.js') };
  } else { deps = { M: root.App.Modelo, F: root.App.Formato, C: root.App.Calculos, O: root.App.Operaciones }; }
  var mod = factory(deps.M, deps.F, deps.C, deps.O);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Demo = mod; }
}(typeof self !== 'undefined' ? self : this, function (M, F, C, O) {
  'use strict';

  function generar(doc, opciones) {
    var hoy = (opciones && opciones.hoy) || F.hoy();
    if (O.hayDemo(doc)) return { ok: false, mensaje: 'Ya cargaste los datos de ejemplo.' };
    function dia(n) { return F.sumarDias(hoy, n); }
    function demo(o) { o.esDemo = true; return o; }
    function guardar(col, o) { return O.guardarEntidad(doc, col, demo(o)); }

    var prov = guardar('proveedores', M.nuevoProveedor({ nombre: 'Distribuidora La Plaza', telefono: '3101234567', notas: 'Proveedor de ejemplo' }));
    var efectivo = guardar('cuentas', M.nuevaCuenta({ nombre: 'Efectivo', saldoInicial: 600000, fechaSaldoInicial: dia(-30) }));
    var nequi = guardar('cuentas', M.nuevaCuenta({ nombre: 'Nequi', saldoInicial: 100000, fechaSaldoInicial: dia(-30) }));
    var directo = guardar('canales', M.nuevoCanal({ nombre: 'Venta directa', comisionPct: 0, tipo: 'directo' }));
    var plataforma = guardar('canales', M.nuevoCanal({ nombre: 'Plataforma de domicilios', comisionPct: 0.2, tipo: 'plataforma' }));
    var laura = guardar('clientes', M.nuevoCliente({ nombre: 'Laura Gómez', telefono: '3001234567', direccion: 'Cra 5 # 10-20', notas: 'Cliente de ejemplo' }));
    var carlos = guardar('clientes', M.nuevoCliente({ nombre: 'Carlos Ruiz', telefono: '3209876543', direccion: 'Calle 8 # 4-15', notas: 'Cliente de ejemplo' }));

    // ---------- Insumos: [nombre, categoría, unidad base, cantidad presentación, precio, costo anterior (opcional), stock mínimo] ----------
    var defs = [
      ['Pan de hamburguesa', 'Ingrediente', 'und', 6, 7200, null, 10],
      ['Lentejas secas', 'Ingrediente', 'g', 500, 4500, 4200, 500],
      ['Avena en hojuelas', 'Ingrediente', 'g', 500, 4000, null, 300],
      ['Cebolla', 'Ingrediente', 'g', 1000, 3000, null, 500],
      ['Tomate', 'Ingrediente', 'g', 1000, 3500, 2800, 500],
      ['Lechuga', 'Ingrediente', 'g', 500, 3000, null, 300],
      ['Queso en lonjas', 'Ingrediente', 'und', 20, 16000, 14000, 10],
      ['Mayonesa', 'Ingrediente', 'g', 400, 8000, null, 200],
      ['Aceite vegetal', 'Ingrediente', 'ml', 1000, 12000, null, 300],
      ['Caja para hamburguesa', 'Empaque', 'und', 50, 25000, null, 20],
      ['Servilleta y bolsa', 'Empaque', 'und', 100, 5000, null, 30],
      ['Pan para sándwich', 'Ingrediente', 'und', 10, 15000, null, 10],
      ['Pollo desmechado', 'Ingrediente', 'g', 1000, 18000, null, 500]
    ];
    var I = {};
    defs.forEach(function (x) {
      var hist = [];
      var costo = x[4] / x[3];
      if (x[5]) hist.push({ fecha: dia(-60), costoBase: x[5] / x[3], origen: 'manual', ts: dia(-60) + 'T12:00:00.000Z' });
      hist.push({ fecha: dia(-25), costoBase: costo, origen: 'manual', ts: dia(-25) + 'T12:00:00.000Z' });
      I[x[0]] = guardar('insumos', M.nuevoInsumo({
        nombre: x[0], categoria: x[1], unidadBase: x[2], presentacion: { precio: x[4], cantidad: x[3], unidad: x[2] },
        stockMinimo: x[6], proveedorIdPreferido: prov.id, historialPrecios: hist
      }));
    });
    function L(nombre, cant, unidad) { return M.nuevaLinea('insumo', I[nombre].id, cant, unidad || I[nombre].unidadBase); }

    // ---------- Preparación (ejemplo del caso E) ----------
    guardar('recetas', M.nuevaReceta({
      tipo: 'preparacion', nombre: 'Salsa de la casa', categoria: 'Preparaciones', emoji: '🥣', color: '#c0392b', rinde: 250, unidadRinde: 'g',
      descripcion: 'Mayonesa con cebolla picada. Rinde 250 g.', lineas: [L('Mayonesa', 200), L('Cebolla', 50)]
    }));

    // ---------- Productos ----------
    var hamb = guardar('recetas', M.nuevaReceta({
      tipo: 'producto', nombre: 'Hamburguesa de lentejas', categoria: 'Hamburguesas', emoji: '🍔', color: '#e07a1f', rinde: 1, precioBase: 12000,
      descripcion: 'Hamburguesa vegetariana de lentejas y avena.',
      lineas: [L('Pan de hamburguesa', 1), L('Lentejas secas', 60), L('Avena en hojuelas', 20), L('Cebolla', 25), L('Tomate', 40), L('Lechuga', 20),
        L('Queso en lonjas', 1), L('Mayonesa', 10), L('Aceite vegetal', 10), L('Caja para hamburguesa', 1), L('Servilleta y bolsa', 1)],
      costosAdicionales: [{ id: M.crearId(), concepto: 'Gas y mano de obra', tipo: 'monto', valor: 500 }]
    }));
    var sand = guardar('recetas', M.nuevaReceta({
      tipo: 'producto', nombre: 'Sándwich de pollo', categoria: 'Sándwiches', emoji: '🥪', color: '#2e86c1', rinde: 1, precioBase: 9000,
      descripcion: 'Sándwich de pollo desmechado con queso.',
      lineas: [L('Pan para sándwich', 1), L('Pollo desmechado', 80), L('Queso en lonjas', 1), L('Tomate', 30), L('Lechuga', 15), L('Mayonesa', 10), L('Servilleta y bolsa', 1)],
      costosAdicionales: [{ id: M.crearId(), concepto: 'Gas y mano de obra', tipo: 'monto', valor: 300 }]
    }));
    var P = { h: hamb, s: sand };

    // ---------- Compras (a los mismos costos de la hoja: no alteran los costos) ----------
    O.guardarCompra(doc, demo(M.nuevaCompra({
      fecha: dia(-21), proveedorId: prov.id, estadoPago: 'pagado', cuentaId: efectivo.id, observaciones: 'Compra inicial de ejemplo',
      lineas: [
        ['Pan de hamburguesa', 60, 'und', 72000], ['Lentejas secas', 3000, 'g', 27000], ['Avena en hojuelas', 2000, 'g', 16000],
        ['Cebolla', 4000, 'g', 12000], ['Tomate', 5000, 'g', 17500], ['Lechuga', 3000, 'g', 18000], ['Queso en lonjas', 40, 'und', 32000],
        ['Mayonesa', 2000, 'g', 40000], ['Aceite vegetal', 2000, 'ml', 24000], ['Caja para hamburguesa', 100, 'und', 50000],
        ['Servilleta y bolsa', 200, 'und', 10000], ['Pan para sándwich', 30, 'und', 45000], ['Pollo desmechado', 3000, 'g', 54000]
      ].map(function (x) { return { insumoId: I[x[0]].id, cantidad: x[1], unidad: x[2], precioTotal: x[3] }; })
    })));
    O.guardarCompra(doc, demo(M.nuevaCompra({
      fecha: dia(-7), proveedorId: prov.id, estadoPago: 'pagado', cuentaId: nequi.id,
      lineas: [{ insumoId: I['Tomate'].id, cantidad: 2000, unidad: 'g', precioTotal: 7000 }, { insumoId: I['Lechuga'].id, cantidad: 1000, unidad: 'g', precioTotal: 6000 }]
    })));

    // ---------- Pedidos ----------
    function pedido(off, canal, items, estado, cliente, pago) {
      var lineas = items.map(function (it) { return M.nuevaLineaPedido(P[it[0]].id, P[it[0]].nombre, it[1], P[it[0]].precioBase); });
      var p = O.guardarPedido(doc, demo(M.nuevoPedido({ fecha: dia(off), canalId: canal.id, clienteId: cliente ? cliente.id : null, estado: estado, lineas: lineas })));
      if (pago) {
        var calc = C.calcularPedido(p);
        var monto = typeof pago.monto === 'number' ? pago.monto : Math.round(calc.totalEsperado);
        O.registrarPago(doc, p.id, { fecha: dia(off), cuentaId: pago.cuenta.id, monto: monto, medio: pago.medio });
      }
      return p;
    }
    var EF = { cuenta: efectivo, medio: 'efectivo' }, NQ = { cuenta: nequi, medio: 'Nequi' }, PL = { cuenta: nequi, medio: 'plataforma' };
    pedido(-20, directo, [['h', 2], ['s', 1]], 'entregado', laura, EF);
    pedido(-19, plataforma, [['h', 1]], 'entregado', null, PL);
    pedido(-18, directo, [['s', 3]], 'entregado', carlos, { cuenta: efectivo, medio: 'efectivo', monto: 10000 }); // fiado vencido
    pedido(-17, plataforma, [['h', 2]], 'entregado', null, PL);
    pedido(-15, directo, [['h', 1], ['s', 1]], 'entregado', laura, NQ);
    pedido(-14, directo, [['h', 3]], 'entregado', null, EF);
    pedido(-13, plataforma, [['s', 2], ['h', 1]], 'entregado', null, PL);
    pedido(-11, directo, [['h', 2]], 'entregado', carlos, EF);
    pedido(-10, directo, [['h', 1], ['s', 2]], 'entregado', null, EF);
    pedido(-8, plataforma, [['h', 3]], 'entregado', null, PL);
    pedido(-7, directo, [['h', 2], ['s', 1]], 'entregado', laura, EF);
    pedido(-5, directo, [['s', 2]], 'entregado', null, NQ);
    pedido(-3, plataforma, [['h', 1], ['s', 1]], 'entregado', null, PL);
    var cancel = pedido(-2, directo, [['h', 2]], 'pendiente', carlos, { cuenta: nequi, medio: 'Nequi', monto: 10000 });
    O.cancelarPedido(doc, cancel.id, { devolver: true, cuentaId: nequi.id, fecha: dia(-2) });
    pedido(-1, directo, [['h', 4], ['s', 2]], 'entregado', laura, NQ);
    pedido(-1, directo, [['h', 1]], 'pendiente', null, null); // abierto de un día anterior
    pedido(0, directo, [['h', 2]], 'pendiente', carlos, { cuenta: nequi, medio: 'Nequi', monto: 10000 }); // anticipo
    pedido(0, plataforma, [['s', 1]], 'enPreparacion', null, null);

    // ---------- Gastos ----------
    function gasto(off, desc, cat, tipo, clasif, valor, estado, cuenta) {
      return O.guardarGasto(doc, demo(M.nuevoGasto({ fecha: dia(off), descripcion: desc, categoria: cat, tipo: tipo, clasificacion: clasif, valor: valor, estadoPago: estado, cuentaId: estado === 'pagado' ? cuenta.id : null })));
    }
    gasto(-15, 'Internet y celular', 'Servicios', 'fijo', 'operativo', 60000, 'pagado', nequi);
    gasto(-12, 'Gas para cocinar', 'Gas', 'variable', 'operativo', 45000, 'pagado', efectivo);
    gasto(-9, 'Publicidad en redes', 'Publicidad', 'variable', 'operativo', 30000, 'pagado', nequi);
    gasto(-20, 'Sartén grande', 'Utensilios', 'variable', 'inversion', 85000, 'pagado', efectivo);
    gasto(-2, 'Servicio de energía', 'Servicios', 'fijo', 'operativo', 38000, 'pendiente', null);

    guardar('gastosRecurrentes', { descripcion: 'Internet y celular', categoria: 'Servicios', tipo: 'fijo', clasificacion: 'operativo', valor: 60000, diaDelMes: 5, activo: true });
    guardar('gastosFijosEstimados', { concepto: 'Internet y celular', valorMensual: 60000 });
    guardar('gastosFijosEstimados', { concepto: 'Servicios (energía y agua)', valorMensual: 80000 });
    guardar('gastosFijosEstimados', { concepto: 'Publicidad', valorMensual: 40000 });
    guardar('metas', { mes: F.mesDe(hoy), ventas: 1000000, utilidad: 400000 });

    var merma = O.movimientoInventarioManual(doc, { fecha: dia(-6), insumoId: I['Tomate'].id, tipo: 'merma', cantidadBase: -300, costoBase: 3.5, motivo: 'Se dañaron unos tomates' });
    merma.esDemo = true;
    return { ok: true };
  }

  return { generar: generar };
}));
