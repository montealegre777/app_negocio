/* TODAS las fórmulas de costeo, precios y pedidos. La interfaz no calcula nada: llama a estas funciones. UMD. */
(function (root, factory) {
  var U, F;
  if (typeof module === 'object' && module.exports) { U = require('./unidades.js'); F = require('./formato.js'); }
  else { U = root.App.Unidades; F = root.App.Formato; }
  var mod = factory(U, F);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.App = root.App || {}; root.App.Calculos = mod; }
}(typeof self !== 'undefined' ? self : this, function (U, F) {
  'use strict';

  var EPS = 1e-9;

  function mapaPorId(arr) { var m = {}; (arr || []).forEach(function (x) { m[x.id] = x; }); return m; }
  function num(x, def) { return typeof x === 'number' && isFinite(x) ? x : (def || 0); }

  // ============================================================
  // 5.2 Costo base del insumo
  // ============================================================

  /** costoBase = precioPresentacion / cantidadPresentacionEnUnidadBase. Devuelve null si no se puede. */
  function costoBasePresentacion(ins) {
    var p = ins && ins.presentacion;
    if (!p || !(p.cantidad > 0) || !(p.precio >= 0)) return null;
    var conv = U.intentarConvertir(p.cantidad, p.unidad, ins.unidadBase, ins.equivalencias);
    if (!conv.ok || !(conv.valor > 0)) return null;
    return p.precio / conv.valor;
  }

  function compararHistorial(a, b) {
    // El precio de referencia con el que se creó el insumo es el más antiguo: cualquier compra o edición posterior lo reemplaza.
    if (!!a.inicial !== !!b.inicial) return a.inicial ? -1 : 1;
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    var ta = a.ts || '', tb = b.ts || '';
    return ta === tb ? 0 : (ta < tb ? -1 : 1);
  }

  /** Último valor del historial de precios (por fecha y sello), o null. */
  function ultimoHistorial(ins) {
    var h = (ins && ins.historialPrecios || []).filter(function (x) { return x && typeof x.costoBase === 'number' && isFinite(x.costoBase); });
    if (!h.length) return null;
    return h.reduce(function (a, b) { return compararHistorial(a, b) >= 0 ? a : b; }).costoBase;
  }

  /** Líneas de compra por insumo, ya convertidas a unidad base, con el flete prorrateado por valor. */
  function lineasCompraPorInsumo(compras, insumosPorId) {
    var out = {};
    (compras || []).forEach(function (c) {
      var suma = 0;
      (c.lineas || []).forEach(function (l) { suma += num(l.precioTotal); });
      (c.lineas || []).forEach(function (l) {
        var ins = insumosPorId[l.insumoId];
        if (!ins) return;
        var conv = U.intentarConvertir(l.cantidad, l.unidad, ins.unidadBase, ins.equivalencias);
        if (!conv.ok || !(conv.valor > 0)) return;
        var flete = suma > 0 ? num(c.flete) * num(l.precioTotal) / suma : 0;
        (out[ins.id] = out[ins.id] || []).push({
          compraId: c.id, fecha: c.fecha, cantidadBase: conv.valor,
          costoTotal: num(l.precioTotal) + flete
        });
      });
    });
    return out;
  }

  /**
   * 'ultimo': el último precio registrado (compra o edición manual, según el historial);
   * 'promedio': promedio ponderado por cantidad de todas las compras (si no hay compras, la presentación).
   */
  function costoBaseInsumo(ins, politica, lineasCompra) {
    var pres = costoBasePresentacion(ins);
    if (politica === 'promedio' && lineasCompra && lineasCompra.length) {
      var q = 0, c = 0;
      lineasCompra.forEach(function (x) { q += x.cantidadBase; c += x.costoTotal; });
      if (q > 0) return c / q;
    }
    if (politica !== 'promedio') {
      var h = ultimoHistorial(ins);
      if (h !== null) return h;
    }
    return pres;
  }

  // ============================================================
  // 5.3 Merma
  // ============================================================

  /** cantidadBruta = cantidadNeta / (1 − merma). La merma se limita a [0, 0.95]. */
  function cantidadBruta(neta, merma) {
    var m = Math.min(Math.max(num(merma), 0), 0.95);
    return neta / (1 - m);
  }

  // ============================================================
  // Contexto de cálculo (costos de insumos y recetas con memoria)
  // ============================================================

  /**
   * Crea un contexto a partir del documento. Opciones para simulaciones (no modifican datos):
   *  - costoBaseOverride {insumoId: costoBase}, factorInsumo {insumoId: 1.2}, factorInsumos (global), mermaDelta (suma a la merma de insumos)
   */
  function crearContexto(doc, opciones) {
    opciones = opciones || {};
    var d = doc.datos, config = doc.config || {};
    var insumos = mapaPorId(d.insumos), recetas = mapaPorId(d.recetas), canales = mapaPorId(d.canales);
    var ovr = opciones.costoBaseOverride || {}, fIns = opciones.factorInsumo || {};
    var fGlobal = typeof opciones.factorInsumos === 'number' ? opciones.factorInsumos : 1;
    var mermaDelta = num(opciones.mermaDelta);
    var comprasLin = null;
    var cacheCB = {}, cacheR = {}, enCurso = {};

    function comprasPorInsumo() {
      if (!comprasLin) comprasLin = lineasCompraPorInsumo(d.compras, insumos);
      return comprasLin;
    }

    function costoBase(id) {
      if (Object.prototype.hasOwnProperty.call(cacheCB, id)) return cacheCB[id];
      var ins = insumos[id], v = null;
      if (ins) {
        if (Object.prototype.hasOwnProperty.call(ovr, id)) v = ovr[id];
        else {
          v = costoBaseInsumo(ins, config.politicaCosto, comprasPorInsumo()[id]);
          if (v !== null) v = v * fGlobal * (fIns[id] || 1);
        }
      }
      cacheCB[id] = v;
      return v;
    }

    function calcularReceta(r) {
      var lineas = [], errores = [], total = 0;
      (r.lineas || []).forEach(function (l) {
        var it = {
          id: l.id, refTipo: l.refTipo, refId: l.refId, cantidad: l.cantidad, unidad: l.unidad,
          nombre: '', mermaPct: 0, cantidadBruta: null, unidadBruta: null, costo: null, error: null
        };
        if (!(l.cantidad >= 0)) it.error = 'Cantidad inválida';
        else if (l.refTipo === 'insumo') {
          var ins = insumos[l.refId];
          if (!ins) { it.nombre = '(insumo eliminado)'; it.error = 'El insumo ya no existe'; }
          else {
            it.nombre = ins.nombre;
            var merma = typeof l.mermaPct === 'number' ? l.mermaPct : num(ins.mermaPct);
            merma = Math.min(Math.max(merma + mermaDelta, 0), 0.95);
            it.mermaPct = merma;
            var conv = U.intentarConvertir(l.cantidad, l.unidad, ins.unidadBase, ins.equivalencias);
            var cb = costoBase(ins.id);
            if (!conv.ok) it.error = 'Unidades incompatibles (' + l.unidad + ' → ' + ins.unidadBase + ')';
            else if (cb === null) it.error = 'El insumo no tiene costo definido';
            else {
              it.cantidadBruta = cantidadBruta(conv.valor, merma);
              it.unidadBruta = ins.unidadBase;
              it.costo = it.cantidadBruta * cb;
            }
          }
        } else if (l.refTipo === 'preparacion') {
          var prep = recetas[l.refId];
          if (!prep || prep.tipo !== 'preparacion') { it.nombre = '(preparación eliminada)'; it.error = 'La preparación ya no existe'; }
          else {
            it.nombre = prep.nombre;
            var rp = receta(prep.id);
            if (rp && rp.circular) it.error = 'Referencia circular';
            else if (!rp || rp.costoProd === null) it.error = 'La preparación tiene errores';
            else {
              var uR = prep.unidadRinde || 'g';
              var cv = U.intentarConvertir(l.cantidad, l.unidad, uR, []);
              var m2 = typeof l.mermaPct === 'number' ? l.mermaPct : 0;
              it.mermaPct = m2;
              if (!cv.ok) it.error = 'Unidades incompatibles (' + l.unidad + ' → ' + uR + ')';
              else {
                it.cantidadBruta = cantidadBruta(cv.valor, m2);
                it.unidadBruta = uR;
                it.costo = it.cantidadBruta * rp.costoProd;
              }
            }
          }
        } else if (l.refTipo === 'producto') {
          var sub = recetas[l.refId];
          if (!sub || sub.tipo !== 'producto') { it.nombre = '(producto eliminado)'; it.error = 'El producto ya no existe'; }
          else {
            it.nombre = sub.nombre;
            var rs = receta(sub.id);
            if (rs && rs.circular) it.error = 'Referencia circular';
            else if (!rs || rs.costoProd === null) it.error = 'El producto tiene errores';
            else {
              it.cantidadBruta = l.cantidad;
              it.unidadBruta = 'und';
              it.costo = l.cantidad * (rs.costoProd + rs.fijosAdic);
            }
          }
        } else {
          it.error = 'Tipo de línea desconocido';
        }
        if (it.error) errores.push((it.nombre || 'Línea') + ': ' + it.error);
        else total += it.costo;
        lineas.push(it);
      });
      lineas.forEach(function (it) { it.pct = it.costo !== null && total > 0 ? it.costo / total : (it.costo === 0 ? 0 : null); });

      var rinde = r.rinde > 0 ? r.rinde : 1;
      var fijos = 0, pctPropio = 0;
      if (r.tipo !== 'preparacion') {
        (r.costosAdicionales || []).forEach(function (c) {
          if (c.tipo === 'porcentaje') pctPropio += num(c.valor); else fijos += num(c.valor);
        });
      }
      var pctPond = 0;
      if (r.tipo === 'combo') {
        var pesos = 0, acum = 0;
        lineas.forEach(function (it) {
          if (it.refTipo !== 'producto' || it.error) return;
          var sub2 = recetas[it.refId], rs2 = receta(it.refId);
          var w = num(it.cantidad) * num(sub2 && sub2.precioBase);
          pesos += w; acum += w * (rs2 ? rs2.pctAdic : 0);
        });
        pctPond = pesos > 0 ? acum / pesos : 0;
      }
      var hayError = errores.length > 0;
      var costoProd = hayError ? null : total / rinde;
      return {
        id: r.id, tipo: r.tipo, nombre: r.nombre, rinde: rinde, unidadRinde: r.unidadRinde || (r.tipo === 'preparacion' ? 'g' : 'und'),
        lineas: lineas, costoTotal: hayError ? null : total, costoProd: costoProd, costoPorUnidadRinde: costoProd,
        fijosAdic: fijos, pctAdic: pctPropio + pctPond, errores: errores, ok: !hayError && lineas.length > 0, circular: false
      };
    }

    function receta(id) {
      if (Object.prototype.hasOwnProperty.call(cacheR, id)) return cacheR[id];
      var r = recetas[id];
      if (!r) return null;
      if (enCurso[id]) {
        return { id: id, nombre: r.nombre, circular: true, costoProd: null, costoTotal: null, fijosAdic: 0, pctAdic: 0, lineas: [], errores: ['Referencia circular'], ok: false };
      }
      enCurso[id] = true;
      var res = calcularReceta(r);
      enCurso[id] = false;
      cacheR[id] = res;
      return res;
    }

    return {
      config: config, insumos: insumos, recetas: recetas, canales: canales, doc: doc,
      costoBase: costoBase, receta: receta, comprasPorInsumo: comprasPorInsumo
    };
  }

  /** ¿La receta `candidatoId` crearía un ciclo si se agrega a `recetaId`? */
  function creariaCiclo(doc, recetaId, candidatoId) {
    var recetas = mapaPorId(doc.datos.recetas);
    var visto = {};
    function llega(id) {
      if (id === recetaId) return true;
      if (visto[id]) return false;
      visto[id] = true;
      var r = recetas[id];
      if (!r) return false;
      return (r.lineas || []).some(function (l) { return (l.refTipo === 'preparacion' || l.refTipo === 'producto') && llega(l.refId); });
    }
    return llega(candidatoId);
  }

  // ============================================================
  // 5.7 Resultado unitario / 5.8 Precio recomendado
  // ============================================================

  function precioSinImpuesto(precio, tarifa, config) {
    var imp = config && config.impuestos;
    if (!imp || !imp.activo || !(tarifa > 0)) return precio;
    return imp.preciosIncluyenImpuesto ? precio / (1 + tarifa) : precio;
  }

  /**
   * p = {precio, costoProd, fijosAdic, pctAdic, comisionPct}
   * baseMarkup: 'produccion' (por defecto) o 'variables'.
   */
  function resultadoUnitario(p, baseMarkup) {
    var precio = num(p.precio), costoProd = num(p.costoProd);
    var fijos = num(p.fijosAdic), pctAdic = num(p.pctAdic), c = num(p.comisionPct);
    var comision = precio * c;
    var otros = fijos + precio * pctAdic;
    var variables = costoProd + otros + comision;
    var ganancia = precio - variables;
    var base = baseMarkup === 'variables' ? variables : costoProd;
    var margen = precio > 0 ? ganancia / precio : null;
    var pctSobreCosto = precio > 0 && base > 0 ? ganancia / base : null;
    var motivo = null;
    if (margen === null || pctSobreCosto === null) motivo = 'No se puede calcular: precio o costo en cero';
    return {
      precio: precio, costoProd: costoProd, fijosAdic: fijos, pctAdic: pctAdic, comisionPct: c,
      comision: comision, otrosCostos: otros, costosVariables: variables, ganancia: ganancia,
      margen: margen, base: base, pctSobreCosto: pctSobreCosto, calculable: motivo === null, motivo: motivo
    };
  }

  /**
   * p = {costoProd, fijosAdic, pctAdic, comisionPct, margenObjetivo, redondeo}
   * precioMinimo = (costoProd + fijosAdic) / (1 − m − c − pctAdic)
   */
  function precioRecomendado(p) {
    var m = num(p.margenObjetivo), c = num(p.comisionPct), pa = num(p.pctAdic);
    if (!(m >= 0 && m < 1)) return { ok: false, mensaje: 'El margen objetivo debe estar entre 0 % y menos de 100 %.' };
    var den = 1 - m - c - pa;
    if (den <= EPS) {
      var pctCostos = (c + pa) * 100;
      return {
        ok: false, denominador: den,
        mensaje: 'No existe un precio posible: la comisión y los costos porcentuales (' + F.pct(c + pa, 1) + ') más el margen objetivo (' + F.pct(m, 1) +
          ') suman ' + F.pct(m + c + pa, 1) + '. Baja el margen objetivo o reduce esos porcentajes' + (pctCostos > 0 ? '.' : '.')
      };
    }
    var costoFijo = num(p.costoProd) + num(p.fijosAdic);
    var minimo = costoFijo / den;
    var precio = F.redondearArriba(minimo, p.redondeo || 100);
    var res = resultadoUnitario({ precio: precio, costoProd: p.costoProd, fijosAdic: p.fijosAdic, pctAdic: p.pctAdic, comisionPct: c }, 'produccion');
    return { ok: true, denominador: den, precioMinimo: minimo, precio: precio, margenReal: res.margen };
  }

  function precioParaCanal(receta, canalId) {
    var pc = receta && receta.preciosPorCanal;
    if (pc && canalId && typeof pc[canalId] === 'number' && pc[canalId] > 0) return pc[canalId];
    return num(receta && receta.precioBase);
  }

  function margenObjetivoDe(receta, config) {
    return receta && typeof receta.margenObjetivo === 'number' ? receta.margenObjetivo : num(config.margenObjetivo, 0.3);
  }

  /** Resultado de un producto en un canal, con impuestos opcionales y precio recomendado. */
  function resultadoProducto(ctx, recetaId, canalId, precioForzado, comisionForzada) {
    var r = ctx.recetas[recetaId], rc = ctx.receta(recetaId);
    if (!r || !rc) return null;
    var canal = canalId ? ctx.canales[canalId] : null;
    var comisionPct = typeof comisionForzada === 'number' ? comisionForzada : (canal ? num(canal.comisionPct) : 0);
    var precioPublico = typeof precioForzado === 'number' ? precioForzado : precioParaCanal(r, canalId);
    var tarifa = num(r.tarifaImpuesto);
    var precio = precioSinImpuesto(precioPublico, tarifa, ctx.config);
    var costoProd = rc.costoProd === null ? 0 : rc.costoProd;
    var res = resultadoUnitario({ precio: precio, costoProd: costoProd, fijosAdic: rc.fijosAdic, pctAdic: rc.pctAdic, comisionPct: comisionPct }, ctx.config.baseMarkup);
    res.precioPublico = precioPublico;
    res.impuesto = ctx.config.impuestos && ctx.config.impuestos.activo && tarifa > 0 ? (ctx.config.impuestos.preciosIncluyenImpuesto ? precioPublico - precio : precio * tarifa) : 0;
    res.errorCosto = rc.costoProd === null;
    res.recomendado = precioRecomendado({
      costoProd: costoProd, fijosAdic: rc.fijosAdic, pctAdic: rc.pctAdic, comisionPct: comisionPct,
      margenObjetivo: margenObjetivoDe(r, ctx.config), redondeo: ctx.config.redondeoPrecio
    });
    if (res.recomendado.ok && ctx.config.impuestos && ctx.config.impuestos.activo && tarifa > 0 && ctx.config.impuestos.preciosIncluyenImpuesto) {
      res.recomendado.precioPublico = F.redondearArriba(res.recomendado.precioMinimo * (1 + tarifa), ctx.config.redondeoPrecio);
    }
    res.indicadores = indicadores(res, ctx.config);
    return res;
  }

  /** Indicadores discretos (nunca clasificar solo por margen). */
  function indicadores(res, config) {
    var ind = [];
    if (res.errorCosto) ind.push({ id: 'costoError', texto: 'El costo tiene errores: revisa la receta' });
    if (res.precio > 0 && res.ganancia < 0) ind.push({ id: 'contribNegativa', texto: 'Contribución negativa: pierdes dinero en cada venta' });
    else if (res.precio > 0 && res.margen !== null && res.margen < num(config.margenMinimoAlerta, 0.15)) ind.push({ id: 'margenBajo', texto: 'Margen por debajo del mínimo (' + F.pct(num(config.margenMinimoAlerta, 0.15), 0) + ')' });
    if (res.precio > 0 && res.recomendado && res.recomendado.ok) {
      var pr = res.recomendado.precioPublico || res.recomendado.precio;
      if (res.precioPublico < pr - EPS) ind.push({ id: 'precioBajo', texto: 'Precio por debajo del recomendado (' + F.cop(pr) + ')' });
    }
    if (!(res.precioPublico > 0)) ind.push({ id: 'sinPrecio', texto: 'Sin precio de venta definido' });
    return ind;
  }

  /** Tabla de rentabilidad de un producto por canal. */
  function tablaPorCanal(ctx, recetaId) {
    var rows = [];
    var canales = (ctx.doc.datos.canales || []).filter(function (c) { return !c.archivado; });
    if (!canales.length) canales = [null];
    canales.forEach(function (c) {
      var res = resultadoProducto(ctx, recetaId, c ? c.id : null);
      if (res) rows.push({ canal: c, resultado: res });
    });
    return rows;
  }

  // ============================================================
  // 5.9 Lote, simulador, impacto de cambio de precio
  // ============================================================

  /** Costo y compras de un lote de `unidades` del producto (o preparación). */
  function calcularLote(ctx, recetaId, unidades, canalId) {
    var rc = ctx.receta(recetaId), r = ctx.recetas[recetaId];
    if (!rc || !r || rc.costoProd === null) return null;
    var res = resultadoProducto(ctx, recetaId, canalId || null);
    var escala = unidades / rc.rinde;
    var ingredientes = rc.lineas.map(function (l) {
      return { nombre: l.nombre, refTipo: l.refTipo, refId: l.refId, cantidad: l.cantidadBruta * escala, unidad: l.unidadBruta, costo: l.costo * escala };
    });
    return {
      unidades: unidades,
      costoProduccion: rc.costoProd * unidades,
      otrosCostosVariables: res ? (res.otrosCostos + res.comision) * unidades : 0,
      ingresoEstimado: res ? res.precio * unidades : 0,
      gananciaEstimada: res ? res.ganancia * unidades : 0,
      ingredientes: ingredientes
    };
  }

  /**
   * Simulador "¿y si?": no guarda nada.
   * ajustes = {precio, comisionPct, factorInsumos (1.1 = +10 %), factorInsumo {id: f}, mermaDelta}
   */
  function simular(doc, recetaId, canalId, ajustes) {
    var a = ajustes || {};
    var ctx0 = crearContexto(doc);
    var ctx1 = crearContexto(doc, { factorInsumos: a.factorInsumos, factorInsumo: a.factorInsumo, mermaDelta: a.mermaDelta });
    var antes = resultadoProducto(ctx0, recetaId, canalId);
    var despues = resultadoProducto(ctx1, recetaId, canalId,
      typeof a.precio === 'number' ? a.precio : undefined, typeof a.comisionPct === 'number' ? a.comisionPct : undefined);
    return { antes: antes, despues: despues };
  }

  /** Productos/preparaciones que cambian de costo si el costo base de un insumo cambia. */
  function impactoCambioInsumo(doc, insumoId, nuevoCostoBase) {
    var ctxA = crearContexto(doc);
    var ovr = {}; ovr[insumoId] = nuevoCostoBase;
    var ctxB = crearContexto(doc, { costoBaseOverride: ovr });
    var out = [];
    (doc.datos.recetas || []).forEach(function (r) {
      if (r.archivado) return;
      var a = ctxA.receta(r.id), b = ctxB.receta(r.id);
      if (!a || !b || a.costoProd === null || b.costoProd === null) return;
      if (Math.abs(a.costoProd - b.costoProd) > EPS) out.push({ id: r.id, nombre: r.nombre, tipo: r.tipo, antes: a.costoProd, despues: b.costoProd, delta: b.costoProd - a.costoProd });
    });
    return out;
  }

  /** Recetas (no archivadas) que usan directamente un insumo. */
  function recetasQueUsan(doc, refTipo, refId) {
    return (doc.datos.recetas || []).filter(function (r) {
      return !r.archivado && (r.lineas || []).some(function (l) { return l.refTipo === refTipo && l.refId === refId; });
    });
  }

  // ============================================================
  // Consumo teórico de insumos (para inventario y lista de compras)
  // ============================================================

  /** Insumos (en unidad base, ya con merma) necesarios para producir `unidades` de una receta. */
  function consumoReceta(ctx, recetaId, unidades, acc, nivel) {
    acc = acc || {};
    nivel = nivel || 0;
    if (nivel > 12) return acc;
    var rc = ctx.receta(recetaId);
    if (!rc || rc.circular || rc.costoProd === null) return acc;
    var escala = unidades / rc.rinde;
    rc.lineas.forEach(function (l) {
      if (l.error || l.cantidadBruta === null) return;
      if (l.refTipo === 'insumo') acc[l.refId] = (acc[l.refId] || 0) + l.cantidadBruta * escala;
      else consumoReceta(ctx, l.refId, l.cantidadBruta * escala, acc, nivel + 1);
    });
    return acc;
  }

  // ============================================================
  // 5.10 Pedido
  // ============================================================

  function descuentoDe(desc, base) {
    if (!desc || !(desc.valor > 0) || !(base > 0)) return 0;
    var v = desc.tipo === '%' ? base * desc.valor : desc.valor;
    return Math.min(Math.max(v, 0), base);
  }

  function esVentaRealizada(p) { return !!p && p.estado === 'entregado'; }
  function totalPagado(p) { return (p.pagos || []).reduce(function (s, x) { return s + num(x.monto); }, 0); }

  function calcularPedido(p) {
    var lineas = (p.lineas || []).map(function (l) {
      var bruto = num(l.cantidad) * num(l.precioUnit);
      var dl = descuentoDe(l.descuentoLinea, bruto);
      return { l: l, bruto: bruto, descLinea: dl };
    });
    var baseDescPedido = lineas.reduce(function (s, x) { return s + x.bruto - x.descLinea; }, 0);
    var descPedidoTotal = descuentoDe(p.descuentoPedido, baseDescPedido);

    var tot = { bruto: 0, descLineas: 0, descPedido: descPedidoTotal, ingresoBase: 0, impuesto: 0, costoProd: 0, otros: 0, comision: 0, contrib: 0, unidades: 0 };
    var det = lineas.map(function (x) {
      var s = x.l.snap || {};
      var netoLinea = x.bruto - x.descLinea;
      var descPedidoLinea = baseDescPedido > 0 ? descPedidoTotal * netoLinea / baseDescPedido : 0;
      var ingresoNeto = netoLinea - descPedidoLinea; // lo que se cobra por la línea (con impuesto si el precio lo incluye)
      var tarifa = num(s.tarifaImpuesto), incluido = !!s.preciosIncluyenImpuesto;
      var base = tarifa > 0 && incluido ? ingresoNeto / (1 + tarifa) : ingresoNeto;
      var impuesto = tarifa > 0 ? (incluido ? ingresoNeto - base : ingresoNeto * tarifa) : 0;
      var costoProdLinea = num(x.l.cantidad) * num(s.costoProd);
      var otrosLinea = num(x.l.cantidad) * num(s.fijosAdic) + base * num(s.pctAdic);
      var comisionLinea = base * num(s.comisionPct);
      var contribLinea = base - costoProdLinea - otrosLinea - comisionLinea;
      tot.bruto += x.bruto; tot.descLineas += x.descLinea; tot.ingresoBase += base; tot.impuesto += impuesto;
      tot.costoProd += costoProdLinea; tot.otros += otrosLinea; tot.comision += comisionLinea; tot.contrib += contribLinea;
      tot.unidades += num(x.l.cantidad);
      return {
        id: x.l.id, productoId: x.l.productoId, nombre: x.l.nombreSnap, cantidad: num(x.l.cantidad), precioUnit: num(x.l.precioUnit),
        bruto: x.bruto, descLinea: x.descLinea, descPedidoLinea: descPedidoLinea, ingresoNeto: ingresoNeto, base: base, impuesto: impuesto,
        costoProd: costoProdLinea, otros: otrosLinea, comision: comisionLinea, contribucion: contribLinea
      };
    });
    var envio = num(p.envioCobrado), costoEnvio = num(p.costoEnvio);
    var total = tot.ingresoBase + tot.impuesto + envio;
    var pagado = totalPagado(p);
    // Una plataforma que liquida neto retiene su comisión: lo que realmente se espera recibir es el total menos la comisión.
    var liquidaNeto = (p.lineas || []).some(function (l) { return l.snap && l.snap.liquidaNeto; });
    var esperado = total - (liquidaNeto ? tot.comision : 0);
    var saldoRaw = esperado - pagado;
    var saldo = Math.abs(saldoRaw) < 0.5 ? 0 : saldoRaw;
    return {
      totalEsperado: esperado, liquidaNeto: liquidaNeto,
      lineas: det, unidades: tot.unidades, bruto: tot.bruto, descuentoLineas: tot.descLineas, descuentoPedido: tot.descPedido,
      subtotal: tot.ingresoBase + tot.impuesto, impuesto: tot.impuesto, envioCobrado: envio, costoEnvio: costoEnvio,
      totalPedido: total, ingresoNeto: tot.ingresoBase + envio, // sin impuesto
      costoProd: tot.costoProd, otrosCostos: tot.otros, comisiones: tot.comision,
      costosVariables: tot.costoProd + tot.otros + tot.comision + costoEnvio,
      contribucion: tot.contrib + envio - costoEnvio,
      pagado: pagado, saldoPorCobrar: saldo,
      estadoPago: saldo <= 0 ? 'pagado' : (pagado > 0 ? 'parcial' : 'pendiente')
    };
  }

  /** Instantánea de costos y comisión vigentes para una línea de pedido. */
  function crearSnap(ctx, productoId, canalId) {
    var rc = ctx.receta(productoId), r = ctx.recetas[productoId], canal = canalId ? ctx.canales[canalId] : null;
    var imp = ctx.config.impuestos || {};
    return {
      costoProd: rc && rc.costoProd !== null ? rc.costoProd : 0,
      fijosAdic: rc ? rc.fijosAdic : 0,
      pctAdic: rc ? rc.pctAdic : 0,
      comisionPct: canal ? num(canal.comisionPct) : 0,
      tarifaImpuesto: imp.activo && r ? num(r.tarifaImpuesto) : 0,
      preciosIncluyenImpuesto: !!imp.preciosIncluyenImpuesto,
      liquidaNeto: !!(canal && canal.liquidaNeto)
    };
  }

  // ============================================================
  // 5.14 Punto de equilibrio y 5.15 metas
  // ============================================================

  function puntoEquilibrio(p) {
    var fijos = num(p.gastosFijos);
    if (!(fijos > 0)) return { ok: false, mensaje: 'Primero registra tus gastos fijos mensuales para calcular el punto de equilibrio.' };
    var res = { ok: true, gastosFijos: fijos };
    if (typeof p.margenPonderado === 'number') {
      if (!(p.margenPonderado > EPS)) return { ok: false, mensaje: 'El margen ponderado es cero o negativo: con los precios y costos actuales no se llega al equilibrio.' };
      res.ventasEquilibrio = fijos / p.margenPonderado;
    }
    if (typeof p.gananciaUnitaria === 'number') {
      if (!(p.gananciaUnitaria > EPS)) return { ok: false, mensaje: 'La ganancia por unidad es cero o negativa: con este precio no se llega al equilibrio.' };
      res.unidadesEquilibrio = F.redondearArriba(fijos / p.gananciaUnitaria, 1);
    }
    return res;
  }

  function avanceMeta(p) {
    var meta = num(p.meta), ventas = num(p.ventas);
    if (!(meta > 0)) return null;
    var hoy = p.hoy, fin = F.finMes(hoy);
    var diasRestantes = Math.max(F.diasEntre(hoy, fin), 0) + 1; // incluye hoy
    var faltante = Math.max(meta - ventas, 0);
    return { avance: ventas / meta, faltante: faltante, diasRestantes: diasRestantes, promedioDiarioRequerido: faltante / diasRestantes, cumplida: ventas >= meta };
  }

  return {
    EPS: EPS, mapaPorId: mapaPorId, num: num,
    costoBasePresentacion: costoBasePresentacion, costoBaseInsumo: costoBaseInsumo, ultimoHistorial: ultimoHistorial,
    compararHistorial: compararHistorial, lineasCompraPorInsumo: lineasCompraPorInsumo, cantidadBruta: cantidadBruta,
    crearContexto: crearContexto, creariaCiclo: creariaCiclo,
    resultadoUnitario: resultadoUnitario, precioRecomendado: precioRecomendado, precioParaCanal: precioParaCanal,
    margenObjetivoDe: margenObjetivoDe, resultadoProducto: resultadoProducto, indicadores: indicadores, tablaPorCanal: tablaPorCanal,
    precioSinImpuesto: precioSinImpuesto,
    calcularLote: calcularLote, simular: simular, impactoCambioInsumo: impactoCambioInsumo, recetasQueUsan: recetasQueUsan,
    consumoReceta: consumoReceta,
    calcularPedido: calcularPedido, crearSnap: crearSnap, esVentaRealizada: esVentaRealizada, totalPagado: totalPagado, descuentoDe: descuentoDe,
    puntoEquilibrio: puntoEquilibrio, avanceMeta: avanceMeta
  };
}));
