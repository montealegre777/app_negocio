/* Diálogos accesibles basados en <dialog>: foco atrapado, Esc para cerrar, foco devuelto al cerrar.
   Incluye confirmación propia (nada de alert()/confirm()) con palabra de confirmación opcional. */
(function (root) {
  'use strict';
  var App = root.App = root.App || {};
  var h = App.Dom.h, icono = App.Dom.icono;
  var contador = 0;

  /**
   * abrir({titulo, contenido: Node, pie: [Node], tamano: 'normal'|'ancho'|'chico', panel: bool, alCerrar: fn, bloquearEsc: bool, enfocar: Node})
   * Devuelve {el, cuerpo, pie, cerrar(valor)}.
   */
  function abrir(op) {
    var abridor = document.activeElement;
    var idTitulo = 'dlg-t' + (++contador);
    var cuerpo = h('div', { class: 'modal-cuerpo' }, op.contenido);
    var pie = op.pie && op.pie.length ? h('div', { class: 'modal-pie' }, op.pie) : null;
    var dlg = h('dialog', {
      class: 'modal' + (op.panel ? ' panel' : '') + (op.tamano === 'ancho' ? ' ancho' : '') + (op.tamano === 'chico' ? ' chico' : ''),
      'aria-labelledby': idTitulo
    },
    h('div', { class: 'modal-cabecera' },
      h('h2', { id: idTitulo }, op.titulo),
      h('button', { type: 'button', class: 'btn btn-fantasma btn-icono', 'aria-label': 'Cerrar', onclick: function () { cerrar(); } }, icono('x'))),
    cuerpo, pie);
    var cerradoYa = false;
    var resultado = { el: dlg, cuerpo: cuerpo, pie: pie, cerrar: cerrar };
    function cerrar(valor) {
      if (cerradoYa) return;
      resultado.valor = valor;
      if (dlg.close) { try { dlg.close(); } catch (e) { finalizar(); } } else finalizar();
    }
    function finalizar() {
      if (cerradoYa) return;
      cerradoYa = true;
      dlg.remove();
      if (abridor && abridor.focus && document.body.contains(abridor)) { try { abridor.focus(); } catch (e) { /* nada */ } }
      if (op.alCerrar) op.alCerrar(resultado.valor);
    }
    dlg.addEventListener('close', finalizar);
    dlg.addEventListener('cancel', function (ev) { if (op.bloquearEsc) ev.preventDefault(); });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var foco = op.enfocar || cuerpo.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])') ||
      (pie && pie.querySelector('button:not([disabled])'));
    if (foco && foco.focus) setTimeout(function () { try { foco.focus(); } catch (e) { /* nada */ } }, 0);
    return resultado;
  }

  /**
   * confirmar({titulo, mensaje, textoConfirmar, peligro, palabra}) → Promise<boolean>.
   * Si `palabra` está definida, hay que escribirla para habilitar el botón (acciones destructivas).
   */
  function confirmar(op) {
    return new Promise(function (resolver) {
      var decision = false;
      var entrada = null, ayuda = null;
      var cont = h('div', { class: 'pila' }, typeof op.mensaje === 'string' ? h('p', null, op.mensaje) : op.mensaje);
      var btnOk = h('button', { type: 'button', class: 'btn ' + (op.peligro ? 'btn-peligro' : 'btn-primario'), onclick: function () { decision = true; m.cerrar(true); } }, op.textoConfirmar || 'Confirmar');
      if (op.palabra) {
        entrada = h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Escribe ' + op.palabra + ' para confirmar', id: 'conf-pal' + (++contador) });
        ayuda = h('label', { for: entrada.id, class: 'ayuda' }, 'Para confirmar, escribe ', h('strong', null, op.palabra), ':');
        btnOk.disabled = true;
        entrada.addEventListener('input', function () { btnOk.disabled = entrada.value.trim().toLowerCase() !== String(op.palabra).toLowerCase(); });
        entrada.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !btnOk.disabled) { e.preventDefault(); btnOk.click(); } });
        cont.appendChild(h('div', { class: 'campo' }, ayuda, entrada));
      }
      var m = abrir({
        titulo: op.titulo || 'Confirmar', contenido: cont, tamano: 'chico',
        pie: [h('button', { type: 'button', class: 'btn', onclick: function () { m.cerrar(false); } }, op.textoCancelar || 'Cancelar'), btnOk],
        enfocar: entrada || undefined,
        alCerrar: function () { resolver(decision); }
      });
      if (!entrada) setTimeout(function () { (op.peligro ? m.pie.firstChild : btnOk).focus(); }, 0);
    });
  }

  function aviso(titulo, mensaje) {
    return new Promise(function (resolver) {
      var m = abrir({
        titulo: titulo, contenido: typeof mensaje === 'string' ? h('p', null, mensaje) : mensaje, tamano: 'chico',
        pie: [h('button', { type: 'button', class: 'btn btn-primario', onclick: function () { m.cerrar(); } }, 'Entendido')],
        alCerrar: resolver
      });
    });
  }

  App.Modal = { abrir: abrir, confirmar: confirmar, aviso: aviso };
})(typeof self !== 'undefined' ? self : this);
