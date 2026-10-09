/* Caja: saldos por cuenta, movimientos, por cobrar, por pagar y cuentas. El dinero que entra y sale, no la utilidad. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, A = App.Analisis, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var pestana = 'movimientos', estPeriodo = { modo: 'mes' }, estMov = {}, estCobrar = {}, estPagar = {}, filtroCuenta = '', filtroTipo = '';

  var ETIQUETA_TIPO = { venta: 'Venta cobrada', gasto: 'Gasto', compra: 'Compra', transferencia: 'Transferencia', aporte: 'Aporte del dueño', retiro: 'Retiro del dueño', devolucion: 'Devolución', ajuste: 'Ajuste' };

  function cuentasOpc(incluirId) {
    return E.datos().cuentas.filter(function (c) { return !c.archivado || c.id === incluirId; }).map(function (c) { return { valor: c.id, texto: c.nombre + (c.archivado ? ' (archivada)' : '') }; });
  }

  function sinCuentas() {
    return App.Modal.aviso('Primero crea una cuenta', 'Una cuenta es un lugar donde guardas dinero: Efectivo, Nequi, Bancolombia… Créala en la pestaña «Cuentas».').then(function () { pestana = 'cuentas'; App.Router.refrescar(); });
  }

  // ---------------- Cuentas ----------------
  function abrirCuenta(id) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.cuentas, id) : null;
    var base = ex || M.nuevaCuenta({});
    var nombre = Form.texto({ etiqueta: 'Nombre de la cuenta', valor: base.nombre, requerido: true, maxlength: 40, placeholder: 'Ej. Efectivo, Nequi, Bancolombia' });
    var saldo = Form.numero({ etiqueta: 'Saldo inicial', tipo: 'moneda', valor: base.saldoInicial, ayuda: 'Lo que había en la cuenta en la fecha de abajo. Desde ahí la app suma y resta cada movimiento.' });
    var fecha = Form.fecha({ etiqueta: 'Fecha de ese saldo', valor: base.fechaSaldoInicial });
    var errores = h('div');
    function guardar() {
      var s = saldo.get();
      var obj = M.nuevaCuenta(Object.assign({}, ex || {}, { nombre: nombre.get(), saldoInicial: s === null ? 0 : s, fechaSaldoInicial: fecha.get() }));
      if (s !== null && isNaN(s)) obj.saldoInicial = NaN;
      var res = V.validarCuenta(obj), errs = Object.assign({}, res.errores);
      var dup = doc.datos.cuentas.some(function (c) { return c.id !== (ex && ex.id) && !c.archivado && c.nombre.trim().toLowerCase() === (obj.nombre || '').trim().toLowerCase(); });
      if (dup && !errs.nombre) errs.nombre = 'Ya tienes una cuenta con ese nombre.';
      if (Comun.mostrarErroresForm({ nombre: nombre, saldoInicial: saldo, fechaSaldoInicial: fecha }, { errores: errs }, errores)) return;
      E.mutar(function (d) { O.guardarEntidad(d, 'cuentas', obj); });
      App.Toast.ok(ex ? 'Cuenta actualizada.' : 'Cuenta creada.');
      m.cerrar();
    }
    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () {
      var uso = O.usoDeEntidad(doc, 'cuentas', ex.id);
      if (!uso.tieneHistoria) App.Modal.confirmar({ titulo: 'Eliminar cuenta', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar la cuenta «' + ex.nombre + '»? No tiene movimientos.' }).then(function (ok) { if (ok) { E.mutar(function (d) { O.eliminarEntidad(d, 'cuentas', ex.id); }, { deshacer: 'Cuenta eliminada.' }); m.cerrar(); } });
      else Comun.archivarEntidad('cuentas', ex.id, 'cuenta').then(function (ok) { if (ok) m.cerrar(); });
    } }, 'Eliminar o archivar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));
    var m = App.Modal.abrir({ titulo: ex ? 'Editar cuenta' : 'Nueva cuenta', tamano: 'chico', contenido: h('div', { class: 'pila' }, nombre.el, Form.rejilla([saldo, fecha]), errores), pie: pie });
    m.el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); } });
  }

  // ---------------- Movimiento manual ----------------
  function abrirMovimiento(tipoInicial) {
    var cuentas = cuentasOpc();
    if (!cuentas.length) { sinCuentas(); return; }
    var tipo = Form.seleccion({ etiqueta: 'Tipo de movimiento', valor: tipoInicial || 'aporte', vacio: false, opciones: [
      { valor: 'aporte', texto: 'Aporte: pongo plata de mi bolsillo al negocio' },
      { valor: 'retiro', texto: 'Retiro: saco plata del negocio para mí' },
      { valor: 'ajuste', texto: 'Ajuste: corregir el saldo (sube o baja)' }] });
    var cuenta = Form.seleccion({ etiqueta: 'Cuenta', valor: cuentas[0].valor, vacio: false, opciones: cuentas });
    var monto = Form.numero({ etiqueta: 'Monto', tipo: 'moneda', valor: null, requerido: true });
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: F.hoy() });
    var desc = Form.texto({ etiqueta: 'Descripción (opcional)', valor: '', maxlength: 80, placeholder: 'Ej. Retiro para gastos personales' });
    var nota = h('p', { class: 'explicacion' });
    function textoNota() {
      var t = tipo.get();
      nota.textContent = t === 'ajuste' ? 'Para un ajuste puedes escribir un valor negativo (por ejemplo −5.000) si el dinero real es menor al que muestra la app.'
        : t === 'retiro' ? 'Un retiro no es un gasto: baja tu caja pero no baja la utilidad del negocio.' : 'Un aporte sube tu caja pero no cuenta como venta.';
    }
    tipo.alCambiar(textoNota); textoNota();
    var m = App.Modal.abrir({
      titulo: 'Registrar movimiento de caja', tamano: 'chico', contenido: h('div', { class: 'pila' }, Form.rejilla([tipo, cuenta, monto, fecha]), desc.el, nota),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var v = monto.get(), errs = {}, t = tipo.get();
        if (v === null || isNaN(v) || v === 0) errs.monto = 'Escribe un monto distinto de cero.';
        else if (t !== 'ajuste' && v < 0) errs.monto = 'Escribe el monto sin signo; el tipo ya indica si entra o sale.';
        if (!F.esFechaISO(fecha.get())) errs.fecha = 'Fecha inválida.';
        if (Comun.mostrarErroresForm({ monto: monto, fecha: fecha }, { errores: errs })) return;
        E.mutar(function (d) { O.movimientoCajaManual(d, { fecha: fecha.get(), cuentaId: cuenta.get(), tipo: t, monto: v, descripcion: desc.get() }); });
        App.Toast.ok('Movimiento registrado.'); m.cerrar();
      } }, 'Registrar')]
    });
  }

  function abrirTransferencia() {
    var cuentas = cuentasOpc();
    if (cuentas.length < 2) { App.Modal.aviso('Necesitas dos cuentas', 'Para mover dinero entre cuentas (por ejemplo de Efectivo a Nequi) primero crea al menos dos cuentas.').then(function () { pestana = 'cuentas'; App.Router.refrescar(); }); return; }
    var desde = Form.seleccion({ etiqueta: 'Sale de', valor: cuentas[0].valor, vacio: false, opciones: cuentas });
    var hacia = Form.seleccion({ etiqueta: 'Entra a', valor: cuentas[1].valor, vacio: false, opciones: cuentas });
    var monto = Form.numero({ etiqueta: 'Monto', tipo: 'moneda', valor: null, requerido: true });
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: F.hoy() });
    var m = App.Modal.abrir({
      titulo: 'Transferir entre cuentas', tamano: 'chico', contenido: h('div', { class: 'pila' }, Form.rejilla([desde, hacia, monto, fecha]), h('p', { class: 'explicacion' }, 'Mover dinero entre tus cuentas no es ni ingreso ni gasto: tu caja total no cambia.')),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var v = monto.get(), errs = {};
        if (v === null || isNaN(v) || v <= 0) errs.monto = 'El monto debe ser mayor que 0.';
        if (desde.get() === hacia.get()) errs.hacia = 'Elige dos cuentas distintas.';
        if (!F.esFechaISO(fecha.get())) errs.fecha = 'Fecha inválida.';
        if (Comun.mostrarErroresForm({ monto: monto, hacia: hacia, fecha: fecha }, { errores: errs })) return;
        E.mutar(function (d) { O.transferir(d, { fecha: fecha.get(), desdeCuentaId: desde.get(), haciaCuentaId: hacia.get(), monto: v }); });
        App.Toast.ok('Transferencia registrada.'); m.cerrar();
      } }, 'Transferir')]
    });
  }

  // ---------------- Pestañas ----------------
  function renderMovimientos(cont) {
    var doc = E.doc(), d = doc.datos;
    var selP = Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['semana', 'Esta semana'], ['todo', 'Todo'], ['rango', 'Personalizado']] });
    var cuenta = Form.seleccion({ etiqueta: 'Cuenta', valor: filtroCuenta, vacio: 'Todas', opciones: cuentasOpc(filtroCuenta) });
    var tipo = Form.seleccion({ etiqueta: 'Tipo', valor: filtroTipo, vacio: 'Todos', opciones: M.TIPOS_MOV_CAJA.map(function (t) { return { valor: t, texto: ETIQUETA_TIPO[t] }; }) });
    cuenta.alCambiar(function () { filtroCuenta = cuenta.get(); App.Router.refrescar(); });
    tipo.alCambiar(function () { filtroTipo = tipo.get(); App.Router.refrescar(); });
    var nombresCuenta = {};
    d.cuentas.forEach(function (c) { nombresCuenta[c.id] = c.nombre; });
    var filas = d.movimientosCaja.filter(function (x) {
      return x.fecha >= estPeriodo.desde && x.fecha <= estPeriodo.hasta && (!filtroCuenta || x.cuentaId === filtroCuenta) && (!filtroTipo || x.tipo === filtroTipo);
    });
    var entra = 0, sale = 0;
    filas.forEach(function (x) { if (x.tipo === 'transferencia') return; if (x.monto >= 0) entra += x.monto; else sale += -x.monto; });
    cont.appendChild(h('div', { class: 'fila' }, selP, cuenta.el, tipo.el));
    cont.appendChild(h('div', { class: 'rejilla kpis' },
      Comun.kpi({ titulo: 'Entró', valor: F.cop(entra), clase: 'bueno', ayuda: 'No cuenta las transferencias entre tus cuentas.' }),
      Comun.kpi({ titulo: 'Salió', valor: F.cop(sale) }),
      Comun.kpi({ titulo: 'Diferencia', valor: F.cop(entra - sale), clase: entra - sale < 0 ? 'malo' : '', nota: 'Entró − salió en este periodo' })));
    if (!d.movimientosCaja.length) {
      cont.appendChild(Comun.vacio({ emoji: '💵', titulo: 'Aún no hay movimientos', texto: 'Aparecen solos cuando cobras una venta, pagas un gasto o una compra. También puedes registrar aportes y retiros.', acciones: [Comun.boton('Registrar un aporte', { primario: true, icono: 'plus', onclick: function () { abrirMovimiento('aporte'); } })] }));
      return;
    }
    var tabla = App.Tabla.crear({
      etiqueta: 'Movimientos de caja', filas: filas, estado: estMov, orden: { col: 'fecha', dir: -1 }, placeholderBusqueda: 'Buscar movimiento…',
      buscarEn: function (x) { return x.descripcion + ' ' + ETIQUETA_TIPO[x.tipo] + ' ' + (nombresCuenta[x.cuentaId] || ''); },
      columnas: [
        { id: 'fecha', titulo: 'Fecha', valor: function (x) { return x.fecha; }, render: function (x) { return F.fecha(x.fecha); } },
        { id: 'tipo', titulo: 'Tipo', valor: function (x) { return ETIQUETA_TIPO[x.tipo]; }, render: function (x) { return h('span', { class: 'insignia ' + (x.tipo === 'transferencia' ? 'info' : x.monto >= 0 ? 'ok' : 'error') }, ETIQUETA_TIPO[x.tipo] || x.tipo); } },
        { id: 'desc', titulo: 'Descripción', valor: function (x) { return x.descripcion || ''; }, render: function (x) { return h('span', null, x.descripcion || '—', x.manual ? null : h('span', { class: 'small muted' }, ' · automático')); } },
        { id: 'cuenta', titulo: 'Cuenta', valor: function (x) { return nombresCuenta[x.cuentaId] || ''; }, render: function (x) { return nombresCuenta[x.cuentaId] || '—'; } },
        { id: 'monto', titulo: 'Monto', clase: 'num', valor: function (x) { return x.monto; }, render: function (x) { return h('strong', { class: x.monto < 0 ? 'negativo' : 'positivo' }, (x.monto > 0 ? '+' : '') + F.cop(x.monto)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (x) {
          if (!x.manual) return h('span', { class: 'small muted' }, 'Viene de ' + (x.origen && x.origen.tipo === 'pedido' ? 'una venta' : x.origen && x.origen.tipo === 'gasto' ? 'un gasto' : x.origen && x.origen.tipo === 'compra' ? 'una compra' : 'otro registro'));
          return Comun.botonIcono('trash', 'Eliminar movimiento', function () {
            App.Modal.confirmar({ titulo: 'Eliminar movimiento', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar este movimiento de ' + F.cop(Math.abs(x.monto)) + '?' + (x.transferId ? ' Como es una transferencia, también se quita su otra mitad.' : '') }).then(function (ok) {
              if (ok) E.mutar(function (dd) { O.eliminarMovimientoCajaManual(dd, x.id); }, { deshacer: 'Movimiento eliminado.' });
            });
          });
        } }
      ]
    });
    cont.appendChild(tabla.el);
  }

  function renderPorCobrar(cont) {
    var doc = E.doc(), lista = A.cuentasPorCobrar(doc, F.hoy());
    var total = lista.reduce(function (s, x) { return s + x.saldo; }, 0), vencido = lista.filter(function (x) { return x.vencida; }).reduce(function (s, x) { return s + x.saldo; }, 0);
    cont.appendChild(h('div', { class: 'rejilla kpis' },
      Comun.kpi({ titulo: 'Te deben', valor: F.cop(total), nota: lista.length + (lista.length === 1 ? ' pedido entregado sin cobrar completo' : ' pedidos entregados sin cobrar completo') }),
      Comun.kpi({ titulo: 'Vencido', valor: F.cop(vencido), clase: vencido > 0 ? 'malo' : '', nota: 'Más de ' + doc.config.diasCobroVencido + ' días sin pagarse' })));
    if (!lista.length) { cont.appendChild(Comun.vacio({ emoji: '🎉', titulo: 'Nadie te debe', texto: 'Todo lo que has entregado está cobrado.' })); return; }
    var clientes = {};
    doc.datos.clientes.forEach(function (c) { clientes[c.id] = c; });
    var tabla = App.Tabla.crear({
      etiqueta: 'Cuentas por cobrar', filas: lista, estado: estCobrar, orden: { col: 'dias', dir: -1 }, placeholderBusqueda: 'Buscar por cliente o n.º…',
      buscarEn: function (x) { return '#' + x.pedido.numero + ' ' + ((clientes[x.pedido.clienteId] || {}).nombre || 'sin cliente'); },
      columnas: [
        { id: 'ped', titulo: 'Pedido', valor: function (x) { return x.pedido.numero; }, render: function (x) { return h('a', { href: '#/ventas/' + x.pedido.id }, '#' + x.pedido.numero); } },
        { id: 'cli', titulo: 'Cliente', valor: function (x) { return (clientes[x.pedido.clienteId] || {}).nombre || ''; }, render: function (x) { return (clientes[x.pedido.clienteId] || {}).nombre || h('span', { class: 'muted' }, 'Sin cliente'); } },
        { id: 'fecha', titulo: 'Fecha', valor: function (x) { return x.pedido.fecha; }, render: function (x) { return F.fecha(x.pedido.fecha); } },
        { id: 'dias', titulo: 'Antigüedad', clase: 'num', valor: function (x) { return x.dias; }, render: function (x) { return h('span', { class: x.vencida ? 'negativo' : '' }, x.dias <= 0 ? 'Hoy' : x.dias + (x.dias === 1 ? ' día' : ' días'), x.vencida ? h('span', { class: 'insignia error', style: { marginLeft: '.4rem' } }, 'Vencida') : null); } },
        { id: 'total', titulo: 'Total', clase: 'num', valor: function (x) { return x.calculo.totalPedido; }, render: function (x) { return F.cop(x.calculo.totalPedido); } },
        { id: 'saldo', titulo: 'Debe', clase: 'num', valor: function (x) { return x.saldo; }, render: function (x) { return h('strong', null, F.cop(x.saldo)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (x) {
          var cli = clientes[x.pedido.clienteId];
          return h('span', { class: 'grupo-botones derecha' },
            Comun.boton('Cobrar', { chico: true, primario: true, onclick: function () { App.VentasVista.abrirPago(x.pedido.id); } }),
            cli ? Comun.botonIcono('whatsapp', 'Copiar recordatorio de cobro para ' + cli.nombre, function () { Comun.copiarWhatsApp(App.ClientesVista.textoCobro(cli, x.saldo)); }) : null);
        } }
      ],
      pie: function () { return [h('td', { colspan: 5 }, h('strong', null, 'Total por cobrar')), h('td', { class: 'num' }, h('strong', null, F.cop(total))), h('td')]; }
    });
    cont.appendChild(tabla.el);
  }

  function renderPorPagar(cont) {
    var doc = E.doc(), lista = A.cuentasPorPagar(doc, F.hoy());
    var total = lista.reduce(function (s, x) { return s + x.valor; }, 0);
    cont.appendChild(h('div', { class: 'rejilla kpis' }, Comun.kpi({ titulo: 'Debes', valor: F.cop(total), nota: lista.length + (lista.length === 1 ? ' pendiente de pago' : ' pendientes de pago') })));
    if (!lista.length) { cont.appendChild(Comun.vacio({ emoji: '✅', titulo: 'No debes nada', texto: 'No tienes gastos ni compras pendientes de pago.' })); return; }
    var tabla = App.Tabla.crear({
      etiqueta: 'Cuentas por pagar', filas: lista, estado: estPagar, orden: { col: 'dias', dir: -1 }, placeholderBusqueda: 'Buscar…',
      buscarEn: function (x) { return x.descripcion; },
      columnas: [
        { id: 'tipo', titulo: 'Tipo', valor: function (x) { return x.tipo; }, render: function (x) { return h('span', { class: 'insignia' }, x.tipo === 'gasto' ? 'Gasto' : 'Compra'); } },
        { id: 'desc', titulo: 'Descripción', valor: function (x) { return x.descripcion; }, render: function (x) { return x.descripcion; } },
        { id: 'fecha', titulo: 'Fecha', valor: function (x) { return x.fecha; }, render: function (x) { return F.fecha(x.fecha); } },
        { id: 'dias', titulo: 'Antigüedad', clase: 'num', valor: function (x) { return x.dias; }, render: function (x) { return x.dias <= 0 ? 'Hoy' : x.dias + (x.dias === 1 ? ' día' : ' días'); } },
        { id: 'valor', titulo: 'Valor', clase: 'num', valor: function (x) { return x.valor; }, render: function (x) { return h('strong', null, F.cop(x.valor)); } },
        { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (x) {
          return Comun.boton('Pagar', { chico: true, primario: true, onclick: function () { if (x.tipo === 'gasto') App.GastosVista.abrirPagar(x.id); else App.ComprasVista.abrirPagarCompra(x.id); } });
        } }
      ],
      pie: function () { return [h('td', { colspan: 4 }, h('strong', null, 'Total por pagar')), h('td', { class: 'num' }, h('strong', null, F.cop(total))), h('td')]; }
    });
    cont.appendChild(tabla.el);
  }

  function renderCuentas(cont) {
    var doc = E.doc(), s = A.saldosCaja(doc);
    cont.appendChild(h('div', { class: 'fila' }, Comun.boton('Nueva cuenta', { primario: true, icono: 'plus', onclick: function () { abrirCuenta(null); } })));
    var todas = doc.datos.cuentas.slice().sort(function (a, b) { return (a.archivado ? 1 : 0) - (b.archivado ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'); });
    if (!todas.length) { cont.appendChild(Comun.vacio({ emoji: '🏦', titulo: 'Crea tu primera cuenta', texto: 'Una cuenta es donde guardas el dinero: Efectivo, Nequi, Bancolombia… Con ellas la app te dice cuánto tienes.', acciones: [Comun.boton('Nueva cuenta', { primario: true, icono: 'plus', onclick: function () { abrirCuenta(null); } })] })); return; }
    var saldos = {};
    s.filas.forEach(function (f) { saldos[f.cuenta.id] = f.saldo; });
    cont.appendChild(h('div', { class: 'tarjeta' }, h('ul', { class: 'lista-simple' }, todas.map(function (c) {
      var saldo = c.archivado ? A.saldoCuenta(doc, c.id) : saldos[c.id];
      return h('li', null,
        h('span', null, h('strong', null, c.nombre), ' ', Comun.ejemplo(c), c.archivado ? h('span', { class: 'insignia' }, 'Archivada') : null, h('div', { class: 'small muted' }, 'Saldo inicial ' + F.cop(c.saldoInicial) + ' el ' + F.fecha(c.fechaSaldoInicial))),
        h('span', { class: 'grupo-botones' }, h('strong', { class: saldo < 0 ? 'negativo' : '' }, F.cop(saldo)),
          Comun.botonIcono('edit', 'Editar ' + c.nombre, function () { abrirCuenta(c.id); }),
          c.archivado ? Comun.botonIcono('archivo', 'Restaurar ' + c.nombre, function () { Comun.restaurarEntidad('cuentas', c.id); }) : null));
    }))));
  }

  function render(cont) {
    var doc = E.doc(), hoy = F.hoy();
    var s = A.saldosCaja(doc), porCobrar = A.cuentasPorCobrar(doc, hoy), porPagar = A.cuentasPorPagar(doc, hoy);
    var tc = porCobrar.reduce(function (t, x) { return t + x.saldo; }, 0), tp = porPagar.reduce(function (t, x) { return t + x.valor; }, 0);
    cont.appendChild(Comun.cabecera({
      titulo: 'Caja', descripcion: 'El dinero que realmente tienes y se mueve. No es lo mismo que la utilidad: puedes vender y aún no haber cobrado.',
      acciones: [
        Comun.boton('Aporte o retiro', { icono: 'plus', onclick: function () { abrirMovimiento('aporte'); } }),
        Comun.boton('Transferir', { icono: 'swap', onclick: abrirTransferencia }),
        Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.caja(); } })]
    }));
    cont.appendChild(h('div', { class: 'rejilla kpis' },
      Comun.kpi({ titulo: 'Total en caja', valor: F.cop(s.total), clase: s.total < 0 ? 'malo' : '', nota: s.filas.length + (s.filas.length === 1 ? ' cuenta' : ' cuentas') }),
      Comun.kpi({ titulo: 'Te deben', valor: F.cop(tc), nota: porCobrar.length + (porCobrar.length === 1 ? ' pedido' : ' pedidos') }),
      Comun.kpi({ titulo: 'Debes', valor: F.cop(tp), nota: porPagar.length + (porPagar.length === 1 ? ' pendiente' : ' pendientes') })));
    if (s.filas.length) {
      cont.appendChild(h('div', { class: 'rejilla kpis', 'aria-label': 'Saldo por cuenta' }, s.filas.map(function (f) {
        return Comun.kpi({ titulo: f.cuenta.nombre, valor: F.cop(f.saldo), clase: f.saldo < 0 ? 'malo' : '' });
      })));
    } else {
      cont.appendChild(Comun.aviso('info', ['Aún no tienes cuentas de dinero. ', h('a', { href: '#/caja', onclick: function (e) { e.preventDefault(); pestana = 'cuentas'; App.Router.refrescar(); } }, 'Crea una cuenta'), ' para ver cuánto tienes y registrar cobros y pagos.']));
    }
    var tabs = [['movimientos', 'Movimientos'], ['cobrar', 'Por cobrar (' + porCobrar.length + ')'], ['pagar', 'Por pagar (' + porPagar.length + ')'], ['cuentas', 'Cuentas']];
    cont.appendChild(h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Secciones de caja' }, tabs.map(function (t) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(pestana === t[0]), onclick: function () { pestana = t[0]; App.Router.refrescar(); } }, t[1]);
    })));
    if (pestana === 'movimientos') renderMovimientos(cont);
    else if (pestana === 'cobrar') renderPorCobrar(cont);
    else if (pestana === 'pagar') renderPorPagar(cont);
    else renderCuentas(cont);
  }

  App.CajaVista = { abrirCuenta: abrirCuenta, abrirMovimiento: abrirMovimiento, abrirTransferencia: abrirTransferencia };
  App.registrarVista('caja', { titulo: 'Caja', render: render });
})(typeof self !== 'undefined' ? self : this);
