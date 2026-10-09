/* Gastos: operativos e inversiones, pendientes por pagar y gastos recurrentes. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, F = App.Formato, A = App.Analisis, E = App.Estado, M = App.Modelo, O = App.Operaciones, Form = App.Form, Comun = App.Comun, V = App.Validacion;
  var estTabla = {}, estPeriodo = { modo: 'mes' }, filtro = { estado: '', categoria: '' };

  function cuentasOpciones() { return E.datos().cuentas.filter(function (c) { return !c.archivado; }).map(function (c) { return { valor: c.id, texto: c.nombre }; }); }

  function abrirEditor(id, alGuardar) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.gastos, id) : null;
    if (id && !ex) return;
    var base = ex || M.nuevoGasto({});
    var cuentas = cuentasOpciones();
    var fecha = Form.fecha({ etiqueta: 'Fecha', valor: base.fecha });
    var desc = Form.texto({ etiqueta: 'Descripción', valor: base.descripcion, requerido: true, maxlength: 80, placeholder: 'Ej. Gas para cocinar' });
    var cat = Form.seleccion({ etiqueta: 'Categoría', valor: base.categoria, vacio: false, opciones: M.CATEGORIAS_GASTO.map(function (c) { return { valor: c, texto: c }; }) });
    var valor = Form.numero({ etiqueta: 'Valor', tipo: 'moneda', valor: base.valor || null, requerido: true });
    var tipo = Form.seleccion({ etiqueta: '¿Se repite o cambia?', valor: base.tipo, vacio: false, ayuda: 'Fijo: casi igual cada mes (internet, arriendo). Variable: cambia según lo que vendes.', opciones: [{ valor: 'fijo', texto: 'Fijo (cada mes igual)' }, { valor: 'variable', texto: 'Variable' }] });
    var clasif = Form.seleccion({ etiqueta: 'Clase de gasto', valor: base.clasificacion, vacio: false, ayuda: 'Una inversión (una sartén, una nevera) sale de tu caja pero no baja la utilidad del mes.', opciones: [{ valor: 'operativo', texto: 'Operativo (gasto del día a día)' }, { valor: 'inversion', texto: 'Inversión (equipo que dura)' }] });
    var estadoPago = Form.seleccion({ etiqueta: 'Estado', valor: base.estadoPago, vacio: false, opciones: [{ valor: 'pagado', texto: 'Ya lo pagué' }, { valor: 'pendiente', texto: 'Falta pagarlo' }] });
    var cuenta = Form.seleccion({ etiqueta: 'Pagado desde la cuenta', valor: base.cuentaId || (cuentas[0] ? cuentas[0].valor : ''), vacio: cuentas.length ? false : 'No tienes cuentas', opciones: cuentas });
    var obs = Form.area({ etiqueta: 'Observaciones (opcional)', valor: base.observaciones, filas: 2, maxlength: 300 });
    var errores = h('div');
    function visibilidadCuenta() { cuenta.el.hidden = estadoPago.get() !== 'pagado'; }
    estadoPago.alCambiar(visibilidadCuenta); visibilidadCuenta();

    function guardar() {
      var v = valor.get();
      var obj = M.nuevoGasto(Object.assign({}, ex || {}, { fecha: fecha.get(), descripcion: desc.get(), categoria: cat.get(), valor: v === null ? 0 : v, tipo: tipo.get(), clasificacion: clasif.get(), estadoPago: estadoPago.get(), cuentaId: estadoPago.get() === 'pagado' ? (cuenta.get() || null) : null, observaciones: obs.get() }));
      if (v !== null && isNaN(v)) obj.valor = NaN;
      var res = V.validarGasto(obj);
      if (Comun.mostrarErroresForm({ fecha: fecha, descripcion: desc, valor: valor, cuentaId: cuenta }, res, errores)) return;
      E.mutar(function (d) { O.guardarGasto(d, obj); });
      App.Toast.ok(ex ? 'Gasto actualizado.' : 'Gasto registrado.');
      m.cerrar();
      if (alGuardar) alGuardar();
    }
    var pie = [];
    if (ex) pie.push(h('button', { type: 'button', class: 'btn btn-fantasma', onclick: function () {
      App.Modal.confirmar({ titulo: 'Eliminar gasto', peligro: true, textoConfirmar: 'Eliminar', mensaje: '¿Eliminar «' + ex.descripcion + '»? Si estaba pagado, también se quita de tu caja.' }).then(function (ok) {
        if (ok) { E.mutar(function (d) { O.eliminarDocumento(d, 'gastos', ex.id); }, { deshacer: 'Gasto eliminado.' }); m.cerrar(); }
      });
    } }, 'Eliminar'));
    pie.push(h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'));
    pie.push(h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar'));
    var m = App.Modal.abrir({ titulo: ex ? 'Editar gasto' : 'Nuevo gasto', tamano: 'ancho', contenido: h('div', { class: 'pila' }, Form.rejilla([fecha, desc, cat, valor, tipo, clasif, estadoPago, cuenta]), obs.el, errores), pie: pie });
  }

  function abrirPagar(id) {
    var doc = E.doc(), g = O.buscar(doc.datos.gastos, id), cuentas = cuentasOpciones();
    if (!cuentas.length) { App.Modal.aviso('Primero crea una cuenta', 'Para pagar un gasto necesitas una cuenta de dinero. Créala en «Caja».').then(function () { App.Router.ir('caja'); }); return; }
    var cuenta = Form.seleccion({ etiqueta: 'Pagar desde', valor: cuentas[0].valor, vacio: false, opciones: cuentas });
    var fecha = Form.fecha({ etiqueta: 'Fecha del pago', valor: F.hoy() });
    var m = App.Modal.abrir({
      titulo: 'Pagar «' + g.descripcion + '»', tamano: 'chico', contenido: h('div', { class: 'pila' }, h('p', null, 'Valor: ', h('strong', null, F.cop(g.valor))), Form.rejilla([cuenta, fecha])),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        if (!F.esFechaISO(fecha.get())) { fecha.error('Fecha inválida.'); return; }
        E.mutar(function (d) { O.pagarGasto(d, id, cuenta.get(), fecha.get()); }); App.Toast.ok('Gasto pagado.'); m.cerrar();
      } }, 'Registrar pago')]
    });
  }

  // ---------------- recurrentes ----------------
  function abrirRecurrente(id) {
    var doc = E.doc(), ex = id ? O.buscar(doc.datos.gastosRecurrentes, id) : null;
    var base = ex || { descripcion: '', categoria: 'Servicios', tipo: 'fijo', clasificacion: 'operativo', valor: 0, diaDelMes: 1, activo: true };
    var desc = Form.texto({ etiqueta: 'Descripción', valor: base.descripcion, requerido: true, maxlength: 80, placeholder: 'Ej. Arriendo del local' });
    var cat = Form.seleccion({ etiqueta: 'Categoría', valor: base.categoria, vacio: false, opciones: M.CATEGORIAS_GASTO.map(function (c) { return { valor: c, texto: c }; }) });
    var valor = Form.numero({ etiqueta: 'Valor mensual', tipo: 'moneda', valor: base.valor || null, requerido: true });
    var dia = Form.numero({ etiqueta: 'Día del mes en que se paga', tipo: 'entero', valor: base.diaDelMes });
    var activo = Form.casilla({ etiqueta: 'Activo', valor: base.activo !== false });
    var m = App.Modal.abrir({
      titulo: ex ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente', tamano: 'chico',
      contenido: h('div', { class: 'pila' }, h('p', { class: 'explicacion' }, 'Un gasto que se repite cada mes. Cada mes la app te propone crearlo; nada se crea solo.'), Form.rejilla([desc, cat, valor, dia]), activo.el),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var v = valor.get(), dd = dia.get(), errs = {};
        if (!desc.get()) errs.descripcion = 'Describe el gasto.';
        if (v === null || isNaN(v) || v <= 0) errs.valor = 'El valor debe ser mayor que 0.';
        if (dd === null || isNaN(dd) || dd < 1 || dd > 31 || Math.round(dd) !== dd) errs.dia = 'Escribe un día entre 1 y 31.';
        if (Comun.mostrarErroresForm({ descripcion: desc, valor: valor, dia: dia }, { errores: errs })) return;
        var obj = Object.assign({}, ex || {}, { descripcion: desc.get(), categoria: cat.get(), tipo: 'fijo', clasificacion: 'operativo', valor: v, diaDelMes: dd, activo: activo.get() });
        E.mutar(function (d) { O.guardarEntidad(d, 'gastosRecurrentes', obj); });
        App.Toast.ok('Guardado.'); m.cerrar();
      } }, 'Guardar')]
    });
  }

  function proponerRecurrentes() {
    var doc = E.doc(), mes = F.mesDe(F.hoy());
    var pend = O.gastosRecurrentesPendientes(doc, mes);
    if (!pend.length) { App.Toast.mostrar('Ya están creados los gastos recurrentes de ' + F.nombreMes(mes) + '.'); return; }
    var marcas = pend.map(function (r) { return Form.casilla({ etiqueta: r.descripcion + ' — ' + F.cop(r.valor) + ' (día ' + r.diaDelMes + ')', valor: true }); });
    var m = App.Modal.abrir({
      titulo: 'Gastos recurrentes de ' + F.nombreMes(mes), tamano: 'chico',
      contenido: h('div', { class: 'pila' }, h('p', null, 'Se crearán como «Falta pagarlos». Desmarca los que no quieras este mes.'), marcas.map(function (c) { return c.el; })),
      pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(); } }, 'Cancelar'), h('button', { type: 'button', class: 'btn btn-primario', onclick: function () {
        var ids = pend.filter(function (r, i) { return marcas[i].get(); }).map(function (r) { return r.id; });
        if (!ids.length) { m.cerrar(); return; }
        var n = 0; E.mutar(function (d) { n = O.generarGastosRecurrentes(d, mes, ids).length; });
        App.Toast.ok(n + (n === 1 ? ' gasto creado.' : ' gastos creados.')); m.cerrar();
      } }, 'Crear gastos')]
    });
  }

  function render(cont) {
    var doc = E.doc(), d = doc.datos, hoy = F.hoy();
    var pendRec = O.gastosRecurrentesPendientes(doc, F.mesDe(hoy));
    cont.appendChild(Comun.cabecera({
      titulo: 'Gastos', descripcion: 'Lo que gastas para mantener el negocio andando (gas, internet, publicidad…). Las compras de insumos se registran en «Compras».',
      acciones: [Comun.boton('Descargar CSV', { icono: 'download', onclick: function () { App.Exportar.gastos(estPeriodo.modo === 'todo' ? null : estPeriodo.desde, estPeriodo.modo === 'todo' ? null : estPeriodo.hasta); } }),
        Comun.boton('Nuevo gasto', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })]
    }));
    if (pendRec.length) cont.appendChild(h('div', { style: { marginBottom: '1rem' } }, Comun.aviso('info', [h('strong', null, 'Tienes ' + pendRec.length + (pendRec.length === 1 ? ' gasto recurrente' : ' gastos recurrentes') + ' de ' + F.nombreMes(F.mesDe(hoy)) + ' por crear. '),
      Comun.boton('Revisar y crear', { chico: true, onclick: proponerRecurrentes })], 'info')));

    cont.appendChild(h('div', { class: 'fila entre', style: { marginBottom: '.75rem' } }, Comun.selectorPeriodo(estPeriodo, function () { App.Router.refrescar(); }, { modos: [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['rango', 'Personalizado'], ['todo', 'Todo']] })));
    var enPeriodo = d.gastos.filter(function (g) { return g.fecha >= estPeriodo.desde && g.fecha <= estPeriodo.hasta; });
    var oper = enPeriodo.filter(function (g) { return g.clasificacion === 'operativo'; }), inv = enPeriodo.filter(function (g) { return g.clasificacion === 'inversion'; });
    var suma = function (arr) { return arr.reduce(function (s, g) { return s + g.valor; }, 0); };
    var pendientes = d.gastos.filter(function (g) { return g.estadoPago === 'pendiente'; });

    cont.appendChild(h('div', { class: 'rejilla kpis', style: { marginBottom: '1rem' } },
      Comun.kpi({ titulo: 'Gastos operativos', valor: F.cop(suma(oper)), nota: oper.length + ' registros', ayuda: 'Se restan de tu utilidad.' }),
      Comun.kpi({ titulo: 'Inversiones', valor: F.cop(suma(inv)), nota: 'No restan de la utilidad del mes', ayuda: 'Equipos o utensilios que duran: salen de tu caja, pero no son un gasto del mes.' }),
      Comun.kpi({ titulo: 'Por pagar (total)', valor: F.cop(suma(pendientes)), clase: pendientes.length ? 'malo' : '', nota: pendientes.length + ' pendientes', enlace: '#/caja' })));

    var porCat = {}; oper.forEach(function (g) { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.valor; });
    var cats = Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; });
    if (cats.length) {
      var cajaG = h('div');
      cont.appendChild(h('div', { class: 'tarjeta', style: { marginBottom: '1rem' } }, h('h3', null, 'Gastos operativos por categoría'), cajaG));
      App.Graficos.dibujar(cajaG, { tipo: 'doughnut', etiquetas: cats, series: [{ nombre: 'Gastos', datos: cats.map(function (c) { return porCat[c]; }) }], formato: 'cop', ariaLabel: 'Gastos por categoría' });
    }

    var segE = h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Estado de pago' }, [['', 'Todos'], ['pendiente', 'Por pagar'], ['pagado', 'Pagados']].map(function (p) {
      return h('button', { type: 'button', 'aria-pressed': String(filtro.estado === p[0]), onclick: function () { filtro.estado = p[0]; App.Router.refrescar(); } }, p[1]);
    }));
    var selCat = Form.seleccion({ etiqueta: null, valor: filtro.categoria, vacio: 'Todas las categorías', opciones: M.CATEGORIAS_GASTO.map(function (c) { return { valor: c, texto: c }; }) });
    selCat.input.setAttribute('aria-label', 'Filtrar por categoría');
    selCat.alCambiar(function () { filtro.categoria = selCat.get(); App.Router.refrescar(); });
    var filas = enPeriodo.filter(function (g) { return (!filtro.estado || g.estadoPago === filtro.estado) && (!filtro.categoria || g.categoria === filtro.categoria); });

    if (!d.gastos.length) {
      cont.appendChild(Comun.vacio({ emoji: '💸', titulo: 'Aún no has registrado gastos', texto: 'Anota el gas, el internet, la publicidad… así tu utilidad refleja lo que realmente te queda.', acciones: [Comun.boton('Registrar un gasto', { primario: true, icono: 'plus', onclick: function () { abrirEditor(null); } })] }));
    } else {
      cont.appendChild(App.Tabla.crear({
        etiqueta: 'Gastos', filas: filas, estado: estTabla, orden: { col: 'fecha', dir: -1 }, herramientas: h('div', { class: 'fila' }, segE, selCat.el), buscarEn: function (g) { return g.descripcion + ' ' + g.categoria; },
        placeholderBusqueda: 'Buscar gasto…', onFila: function (g) { abrirEditor(g.id); }, vacio: h('div', { class: 'estado-vacio' }, h('p', null, 'No hay gastos en este periodo.')),
        columnas: [
          { id: 'fecha', titulo: 'Fecha', valor: function (g) { return g.fecha; }, render: function (g) { return F.fechaCorta(g.fecha); } },
          { id: 'desc', titulo: 'Descripción', valor: function (g) { return g.descripcion; }, render: function (g) { return h('span', null, h('strong', null, g.descripcion), ' ', Comun.ejemplo(g), g.clasificacion === 'inversion' ? h('span', { class: 'insignia info' }, 'Inversión') : null); } },
          { id: 'cat', titulo: 'Categoría', valor: function (g) { return g.categoria; } },
          { id: 'tipo', titulo: 'Tipo', valor: function (g) { return g.tipo; }, render: function (g) { return g.tipo === 'fijo' ? 'Fijo' : 'Variable'; } },
          { id: 'valor', titulo: 'Valor', clase: 'num', valor: function (g) { return g.valor; }, render: function (g) { return F.cop(g.valor); } },
          { id: 'est', titulo: 'Estado', valor: function (g) { return g.estadoPago; }, render: function (g) { return g.estadoPago === 'pagado' ? h('span', { class: 'insignia ok' }, 'Pagado') : h('span', { class: 'insignia aviso' }, 'Por pagar'); } },
          { id: 'acc', titulo: 'Acciones', ordenable: false, sinEtiqueta: true, clase: 'num', render: function (g) {
            return h('span', { class: 'grupo-botones derecha' }, g.estadoPago === 'pendiente' ? Comun.boton('Pagar', { chico: true, onclick: function () { abrirPagar(g.id); } }) : null, Comun.botonIcono('edit', 'Editar ' + g.descripcion, function () { abrirEditor(g.id); }));
          } }
        ],
        pie: function (f) { return [h('td', { colspan: 4 }, 'Total (' + f.length + ')'), h('td', { class: 'num' }, F.cop(suma(f))), h('td', { colspan: 2 })]; }
      }).el);
    }

    // recurrentes
    var rec = d.gastosRecurrentes.filter(function (r) { return !r.archivado; });
    cont.appendChild(h('div', { class: 'tarjeta pila', style: { marginTop: '1.25rem' } }, h('div', { class: 'tarjeta-cabecera' }, h('h3', null, 'Gastos recurrentes'), Comun.boton('Nuevo recurrente', { chico: true, icono: 'plus', onclick: function () { abrirRecurrente(null); } })),
      rec.length ? h('ul', { class: 'lista-simple' }, rec.map(function (r) {
        return h('li', null, h('span', null, h('strong', null, r.descripcion), ' · ' + F.cop(r.valor) + ' · día ' + r.diaDelMes, r.activo ? null : h('span', { class: 'insignia', style: { marginLeft: '.4rem' } }, 'Pausado')),
          h('span', { class: 'grupo-botones' }, Comun.botonIcono('edit', 'Editar ' + r.descripcion, function () { abrirRecurrente(r.id); }),
            Comun.botonIcono('trash', 'Quitar ' + r.descripcion, function () { E.mutar(function (x) { O.archivar(x, 'gastosRecurrentes', r.id, true); }, { deshacer: 'Gasto recurrente quitado.' }); })));
      })) : h('p', { class: 'muted' }, 'Aquí puedes dejar tus gastos de cada mes (arriendo, internet…) para crearlos con un clic.')));
  }

  App.GastosVista = { abrirEditor: abrirEditor, abrirPagar: abrirPagar };
  App.registrarVista('gastos', { titulo: 'Gastos', render: render });
})(typeof self !== 'undefined' ? self : this);
