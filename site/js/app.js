/* Centro de Inversión — dashboard interactivo. */
(function () {
  "use strict";

  // ------------------------------------------------------------------ utilidades
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } },
  };
  const nf = (d) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fUSD = new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fCLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const sg = (v, plus) => (v < 0 ? "-" : plus && v > 0 ? "+" : "");
  const usd = (v) => (v == null ? "–" : sg(v) + fUSD.format(Math.abs(v)));
  const clp = (v) => (v == null ? "–" : sg(Math.round(v)) + fCLP.format(Math.abs(Math.round(v))));
  const sclp = (v) => (v == null ? "–" : sg(Math.round(v), true) + fCLP.format(Math.abs(Math.round(v))));
  const susd = (v) => (v == null ? "–" : sg(v, true) + fUSD.format(Math.abs(v)));
  const clpC = (v) => {
    if (v == null) return "–";
    const a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e9) return s + "$" + nf(1).format(a / 1e9) + " mil M";
    if (a >= 1e6) return s + "$" + nf(1).format(a / 1e6) + " M";
    return clp(v);
  };
  const pct = (v, d = 1, sign = true) => (v == null || isNaN(v) ? "–" : (sign && v > 0 ? "+" : "") + nf(d).format(v * 100) + "%");
  const num = (v, d = 2) => (v == null ? "–" : nf(d).format(v));
  const cls = (v) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "");
  const fecha = (s) => { const [y, m, d] = s.split("-"); return `${d}-${m}-${y}`; };
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaCorta = (s) => { const [y, m] = s.split("-"); return `${MES[+m - 1]} ${y.slice(2)}`; };
  const fechaDia = (s) => { const [, m, d] = s.split("-"); return `${+d} ${MES[+m - 1]}`; };
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); };

  const CLASES = ["RV EE.UU.", "RV Internacional", "Acciones", "Oro", "Renta fija", "Liquidez", "Efectivo"];
  const COLOR_CLASE = { "RV EE.UU.": "var(--s1)", "RV Internacional": "var(--s2)", "Acciones": "var(--s3)", "Oro": "var(--s4)", "Renta fija": "var(--s5)", "Liquidez": "var(--s6)", "Efectivo": "var(--s7)" };
  const DARK_INK = new Set(["Oro"]);
  const ICON = {
    regimen: '<svg class="icon" viewBox="0 0 16 16"><path d="M2 12l3-4 3 2 5-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mercado: '<svg class="icon" viewBox="0 0 16 16"><rect x="2" y="8" width="3" height="6" rx="1" fill="currentColor"/><rect x="6.5" y="5" width="3" height="9" rx="1" fill="currentColor"/><rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor"/></svg>',
    fx: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 2v12M11 4.5C10.3 3.6 9.2 3 8 3 6.3 3 5 4 5 5.5S6.3 7.6 8 8s3 1 3 2.5S9.7 13 8 13c-1.3 0-2.4-.6-3-1.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    tasas: '<svg class="icon" viewBox="0 0 16 16"><path d="M3 13L13 3" stroke="currentColor" stroke-width="1.5"/><circle cx="4.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11.5" cy="11.5" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
    cobre: '<svg class="icon" viewBox="0 0 16 16"><path d="M3 11l5-8 5 8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>',
    movers: '<svg class="icon" viewBox="0 0 16 16"><path d="M5 13V3M2 6l3-3 3 3M11 3v10M8 10l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    senales: '<svg class="icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" fill="currentColor"/><path d="M4 4a5.5 5.5 0 000 8M12 4a5.5 5.5 0 010 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    alerta: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 2l6.5 11.5h-13z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    info: '<svg class="icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    critico: '<svg class="icon" viewBox="0 0 16 16" style="color:var(--critical)"><path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z" fill="currentColor"/><path d="M8 4.5v4M8 10.8v.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    serio: '<svg class="icon" viewBox="0 0 16 16" style="color:var(--serious)"><path d="M8 1.5l7 12.5H1z" fill="currentColor"/><path d="M8 6v3.5M8 11.4v.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    advertencia: '<svg class="icon" viewBox="0 0 16 16" style="color:var(--warning)"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.5M8 11v.5" stroke="#0b0b0b" stroke-width="1.6" stroke-linecap="round"/></svg>',
    ok: '<svg class="icon" viewBox="0 0 16 16" style="color:var(--good)"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5 8.2l2 2 4-4.2" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  ICON.clases = ICON.mercado; ICON.ranking = ICON.movers; ICON.asignacion = ICON.regimen; ICON.mezcla = ICON.mercado; ICON.estres = ICON.alerta;
  const NIVEL_TXT = { critico: "Crítico", serio: "Serio", advertencia: "Atención" };

  // ------------------------------------------------------------------ estado
  let R = window.__REPORTE;
  const IDX = window.__INDICE || { diarios: [], semanales: [] };
  if (!R) {
    $("#main").innerHTML = `<div class="card"><h2>Aún no hay informes</h2><p class="sub">Genera el primero desde la terminal:</p><pre>python3 engine/motor.py</pre></div>`;
    return;
  }
  let A = {}, FX = 1;
  const S = {
    tab: LS.get("inv.tab", "resumen"),
    vista: "latest",
    pos: LS.get("inv.pos.v1", null),
    marcas: LS.get("inv.ordenes.v1", {}),
    log: LS.get("inv.log.v1", []),
    tol: LS.get("inv.tol", null),
    ordTipo: "diaria",
    filtro: "todos",
    sort: { k: "sc", dir: -1 },
    activo: LS.get("inv.activo", "VOO"),
    esc: { modo: "ambos", preset: "correccion", f: null },
  };

  function indexar() {
    A = {}; R.activos.forEach((a) => (A[a.ticker] = a));
    FX = R.meta.usdclp || 1;
    if (!S.pos) S.pos = JSON.parse(JSON.stringify(R.config));
    if (S.tol == null) S.tol = R.reglas.perdida_mensual_tolerable_pct || 8;
    if (!S.esc.f) S.esc.f = { ...R.escenarios[0].f };
    if (!A[S.activo]) S.activo = R.activos[0].ticker;
  }
  indexar();
  const guardarPos = () => LS.set("inv.pos.v1", S.pos);

  // ------------------------------------------------------------------ cálculos de cartera
  function cartera(pos = S.pos) {
    const val = {}, qty = {}, costo = {};
    let inv = 0;
    (pos.posiciones || []).forEach((p) => {
      const a = A[p.ticker], q = +p.cantidad || 0;
      if (!a || q <= 0) return;
      val[p.ticker] = (val[p.ticker] || 0) + q * a.precio;
      costo[p.ticker] = (costo[p.ticker] || 0) + q * (+p.costo_promedio || 0);
      qty[p.ticker] = (qty[p.ticker] || 0) + q;
      inv += q * a.precio;
    });
    const cashUSD = +pos.efectivo_usd || 0, cashCLP = +pos.efectivo_clp || 0;
    const total = inv + cashUSD + cashCLP / FX;
    const w = {};
    Object.keys(val).forEach((t) => (w[t] = total ? val[t] / total : 0));
    return { val, qty, costo, inv, cashUSD, cashCLP, total, totalCLP: total * FX, w, cashW: total ? (cashUSD + cashCLP / FX) / total : 1 };
  }

  function porClase(w, cashW = 0) {
    const out = {}; CLASES.forEach((c) => (out[c] = 0));
    Object.entries(w).forEach(([t, v]) => { const c = A[t] ? A[t].clase : "Liquidez"; out[c] = (out[c] || 0) + v; });
    out["Efectivo"] += cashW;
    return out;
  }

  const covIdx = {};
  function volPort(w) {
    const T = R.cov.tickers, M = R.cov.m;
    if (!covIdx._v || covIdx._v !== R) { T.forEach((t, i) => (covIdx[t] = i)); covIdx._v = R; }
    const ks = Object.keys(w).filter((t) => covIdx[t] != null && w[t]);
    let s = 0;
    ks.forEach((a) => ks.forEach((b) => { s += w[a] * w[b] * (M[covIdx[a]][covIdx[b]] || 0); }));
    return Math.sqrt(Math.max(0, s) / 1e4 * 252);
  }

  function retFactor(t, f) {
    const b = (A[t] && A[t].betas) || { spx: 0, tasas: 0, oro: 0, cobre: 0 };
    return b.spx * f.spx / 100 + b.tasas * f.tasas_pb / 100 + b.oro * f.oro / 100 + b.cobre * f.cobre / 100;
  }

  /** Impacto en CLP de un escenario de factores. val: USD por ticker. */
  function impacto(val, cashUSD, f) {
    const por = {}; let d = 0, base = 0;
    const fx1 = 1 + f.usdclp / 100;
    Object.entries(val).forEach(([t, v]) => {
      const r = retFactor(t, f);
      const dd = v * FX * ((1 + r) * fx1 - 1);
      por[t] = { r, clp: dd }; d += dd; base += v * FX;
    });
    const dc = cashUSD * FX * (fx1 - 1);
    if (cashUSD) por["Efectivo USD"] = { r: 0, clp: dc };
    d += dc;
    return { clp: d, por };
  }

  function impactoHist(val, cashUSD, h) {
    const por = {}; let d = 0;
    const fx1 = 1 + (h.ret["CLP=X"] || 0);
    Object.entries(val).forEach(([t, v]) => {
      let r = h.ret[t];
      if (r == null) r = ((A[t] && A[t].betas && A[t].betas.spx) || 1) * (h.ret.VOO || 0);
      const dd = v * FX * ((1 + r) * fx1 - 1);
      por[t] = { r, clp: dd }; d += dd;
    });
    const dc = cashUSD * FX * (fx1 - 1);
    if (cashUSD) por["Efectivo USD"] = { r: 0, clp: dc };
    return { clp: d + dc, por };
  }

  function valObjetivo(totalUSD) {
    const v = {}; Object.entries(R.objetivo.pesos).forEach(([t, w]) => (v[t] = w * totalUSD));
    return v;
  }

  // ------------------------------------------------------------------ órdenes
  function claveOrden(tipo, t) { return (tipo === "semanal" ? R.meta.semana : R.meta.fecha_datos) + "|" + tipo + "|" + t; }

  function ordenes(tipo) {
    const pf = cartera();
    const rg = R.reglas;
    if (pf.total <= 0) return { lista: [], pf };
    const minUSD = rg.orden_minima_usd || 10;
    const banda = (rg.banda_rebalanceo_pp || 1.5) / 100;
    const entrada = pf.cashW > 0.3;
    const tramos = rg.tramos_entrada || 4;
    const frac = rg.fraccion_orden_diaria || 0.5;
    const tick = new Set([...Object.keys(R.objetivo.pesos), ...Object.keys(pf.val)]);
    const lista = [];
    tick.forEach((t) => {
      const a = A[t]; if (!a) return;
      const tw = R.objetivo.pesos[t] || 0;
      const cur = pf.val[t] || 0;
      const gap = tw * pf.total - cur;
      let monto = 0, motivo = "", prioridad = 5;
      if (tipo === "semanal") {
        const salir = cur > 0 && tw === 0;
        if (!salir && Math.abs(gap) < Math.max(minUSD, banda * pf.total)) return;
        monto = gap;
        motivo = salir ? `Ya no está en el portafolio objetivo (${a.accion.toLowerCase()}): cerrar posición.`
          : `Rebalanceo: pasar de ${pct(pf.w[t] || 0, 1, false)} a ${pct(tw, 1, false)} objetivo.`;
        if (gap > 0 && entrada) { monto = gap / tramos; motivo = `Plan de entrada escalonado: 1 de ${tramos} tramos semanales hacia ${pct(tw, 1, false)} objetivo.`; }
        prioridad = salir ? 1 : 3;
      } else {
        if (a.stop_activo && cur > 0 && a.bloque === "satelite") {
          monto = -cur; motivo = `Stop dinámico perforado (${usd(a.stop)}). Regla de disciplina: cerrar.`; prioridad = 0;
        } else if (gap > 0 && a.sd >= 30 && a.sc >= 15) {
          monto = gap * frac; if (entrada) monto = Math.min(monto, gap / tramos);
          motivo = `Señal diaria confirma compra (puntaje diario ${num(a.sd, 0)}, combinado ${num(a.sc, 0)}). Compra parcial (${Math.round(frac * 100)}% de la brecha).`; prioridad = 2;
        } else if (gap < 0 && a.sd <= -30 && cur > 0) {
          monto = Math.max(gap * frac, -cur);
          motivo = `Señal diaria confirma venta (puntaje diario ${num(a.sd, 0)}). Reducción parcial hacia el objetivo.`; prioridad = 2;
        } else return;
      }
      let nota = "";
      if (monto > 0 && a.bloque === "satelite" && a.stop_dist > 0) {
        const maxM = (rg.riesgo_por_operacion_pct / 100) * pf.total / a.stop_dist;
        if (monto > maxM) { monto = maxM; nota = `Tamaño limitado: si toca el stop pierdes como máximo ${rg.riesgo_por_operacion_pct}% del portafolio.`; }
      }
      if (Math.abs(monto) < minUSD) return;
      lista.push({ tipo, t, a, monto, motivo, nota, prioridad, tw, cur, key: claveOrden(tipo, t) });
    });
    // financiamiento: las compras no pueden exceder efectivo + ventas
    const pendientes = lista.filter((o) => !S.marcas[o.key]);
    const ventas = pendientes.filter((o) => o.monto < 0).reduce((s, o) => s - o.monto, 0);
    const compras = pendientes.filter((o) => o.monto > 0).reduce((s, o) => s + o.monto, 0);
    const disp = pf.cashUSD + pf.cashCLP / FX + ventas;
    if (compras > disp && compras > 0) {
      const f = Math.max(0, disp / compras);
      lista.forEach((o) => { if (o.monto > 0 && !S.marcas[o.key]) { o.monto *= f; o.nota = (o.nota ? o.nota + " " : "") + "Ajustada al efectivo disponible."; } });
    }
    const filtrada = lista.filter((o) => Math.abs(o.monto) >= minUSD || S.marcas[o.key]);
    filtrada.sort((x, y) => x.prioridad - y.prioridad || Math.abs(y.monto) - Math.abs(x.monto));
    return { lista: filtrada, pf, compras: Math.min(compras, disp), ventas, entrada };
  }

  function escenarioOrden(o, pf) {
    const a = o.a, m = o.monto, am = Math.abs(m);
    const out = {};
    out.var1d = am * 1.645 * (a.vol_d || 0);
    out.stop = a.stop_dist > 0 ? am * a.stop_dist : null;
    out.p = a.p21 ? { p5: am * a.p21.p5, p50: am * a.p21.p50, p95: am * a.p21.p95 } : null;
    const corr = (R.escenarios.find((e) => e.id === "correccion") || R.escenarios[0]).f;
    out.corr = am * ((1 + retFactor(a.ticker, corr)) * (1 + corr.usdclp / 100) - 1);
    // portafolio después
    const val = { ...pf.val }; val[a.ticker] = (val[a.ticker] || 0) + m;
    const w0 = pf.w, w1 = {};
    Object.keys(val).forEach((t) => (w1[t] = val[t] / pf.total));
    out.wDespues = w1[a.ticker] || 0;
    out.vol0 = volPort(w0); out.vol1 = volPort(w1);
    return out;
  }

  function ordenCard(o, pf, compacta = false) {
    const a = o.a, compra = o.monto > 0, sc = escenarioOrden(o, pf);
    const marca = S.marcas[o.key];
    const cant = Math.abs(o.monto) / a.precio;
    const k = (lab, v, extra = "") => `<div class="sc"><div class="k">${lab}</div><div class="v">${v}${extra}</div></div>`;
    let grid = "";
    if (compra) {
      grid += k("Día malo (1 de cada 20)", `<span class="down">${sclp(-sc.var1d * FX)}</span>`);
      if (sc.stop) grid += k(a.bloque === "satelite" ? "Si toca el stop" : "Si quiebra tendencia (−3% bajo SMA200)", `<span class="down">${sclp(-sc.stop * FX)}</span>`);
      if (sc.p) grid += k("En 1 mes: pesimista · central · optimista", `<span class="${cls(sc.p.p5)}">${clpC(sc.p.p5 * FX)}</span> · <span class="${cls(sc.p.p50)}">${clpC(sc.p.p50 * FX)}</span> · <span class="${cls(sc.p.p95)}">${clpC(sc.p.p95 * FX)}</span>`);
      grid += k("Si el S&P 500 cae 10% (en CLP)", `<span class="${cls(sc.corr)}">${sclp(sc.corr * FX)}</span>`);
    } else {
      if (sc.p) grid += k("Si sigue cayendo (mes pesimista) evitas", `<span class="up">${clpC(-sc.p.p5 * FX)}</span>`);
      if (sc.p) grid += k("Si rebota (mes optimista) dejas de ganar", `${clpC(sc.p.p95 * FX)}`);
      grid += k("Riesgo diario que eliminas", `${clp(sc.var1d * FX)}`);
    }
    grid += k("Peso en tu portafolio tras ejecutar", `${pct(sc.wDespues, 1, false)} <small>obj. ${pct(o.tw, 1, false)}</small>`);
    grid += k("Volatilidad anual del portafolio", `${pct(sc.vol0, 1, false)} → ${pct(sc.vol1, 1, false)}`);
    const peor = compra ? Math.max(sc.stop || 0, sc.p ? -sc.p.p5 : 0, sc.var1d) : 0;
    const decide = compra
      ? `Para decidir: ¿estás dispuesto a ver esta posición perder hasta <b>${clp(peor * FX)}</b> (${pct(peor / pf.total, 2, false)} de tu portafolio) en un mes malo?`
      : `Para decidir: vender reduce tu riesgo, pero si el activo rebota no participas del alza.`;
    return `<article class="order ${marca ? "done" : ""}" data-key="${esc(o.key)}">
      <div class="order-top">
        <span class="side ${compra ? "buy" : "sell"}">${compra ? "COMPRAR" : "VENDER"}</span>
        <span class="tk">${esc(a.ticker)}</span><span class="nm">${esc(a.nombre)}</span>
        <span class="badge b-${a.accion}" title="Señal del modelo para el activo"><span class="dot"></span>Señal: ${a.accion}</span>
        ${marca ? `<span class="badge ${marca === "ejecutada" ? "good" : ""}"><span class="dot"></span>${marca === "ejecutada" ? "Ejecutada" : "Descartada"}</span>` : ""}
        <div class="amt">${usd(Math.abs(o.monto))}<small>≈ ${clp(Math.abs(o.monto) * FX)} · ${num(cant, cant < 1 ? 4 : 2)} u. a ${usd(a.precio)}</small></div>
      </div>
      <div class="why">${esc(o.motivo)} ${o.nota ? `<b>${esc(o.nota)}</b>` : ""}</div>
      ${compacta ? "" : `<div class="sc-grid">${grid}</div><p class="note" style="margin:10px 0 0">${decide}</p>`}
      ${compacta ? "" : `<div class="order-actions">
        ${marca ? `<button class="btn sm" data-act="deshacer">Deshacer marca</button>` : `<button class="btn sm primary" data-act="ejecutar">Registrar como ejecutada</button><button class="btn sm" data-act="descartar">Descartar</button>`}
        <button class="btn sm ghost" data-act="ver" data-t="${esc(a.ticker)}">Ver activo →</button>
        <span class="hint">${a.tipo_stop ? "Stop: " + usd(a.stop) + " (" + esc(a.tipo_stop) + ")" : ""}</span>
      </div>`}
    </article>`;
  }

  function registrarEjecucion(o) {
    const a = o.a, m = o.monto, q = m / a.precio;
    const p = S.pos.posiciones.find((x) => x.ticker === a.ticker);
    if (p) {
      const q0 = +p.cantidad || 0, nq = Math.max(0, q0 + q);
      if (m > 0) p.costo_promedio = (q0 * (+p.costo_promedio || 0) + m) / nq;
      p.cantidad = +nq.toFixed(6);
      if (p.cantidad <= 1e-6) S.pos.posiciones = S.pos.posiciones.filter((x) => x !== p);
    } else if (m > 0) {
      S.pos.posiciones.push({ ticker: a.ticker, cantidad: +q.toFixed(6), costo_promedio: a.precio });
    }
    if (m > 0) {
      let falta = m;
      const u = Math.min(+S.pos.efectivo_usd || 0, falta);
      S.pos.efectivo_usd = +((+S.pos.efectivo_usd || 0) - u).toFixed(2); falta -= u;
      if (falta > 0) S.pos.efectivo_clp = Math.max(0, Math.round((+S.pos.efectivo_clp || 0) - falta * FX));
    } else {
      S.pos.efectivo_usd = +((+S.pos.efectivo_usd || 0) - m).toFixed(2);
    }
    S.log.unshift({ fecha: new Date().toISOString().slice(0, 16).replace("T", " "), tipo: o.tipo, ticker: a.ticker, monto: m, precio: a.precio, cantidad: q });
    S.marcas[o.key] = "ejecutada";
    guardarPos(); LS.set("inv.log.v1", S.log); LS.set("inv.ordenes.v1", S.marcas);
  }

  // ------------------------------------------------------------------ componentes
  const badgeRegimen = (n) => `<span class="badge reg-${n}"><span class="dot"></span>${n}</span>`;
  const meter = (v) => {
    if (v == null) return "–";
    const w = Math.min(50, Math.abs(v) / 2);
    const st = v >= 0 ? `left:50%;width:${w}%;background:var(--pos)` : `right:50%;width:${w}%;background:var(--neg)`;
    return `<span class="meter" title="${num(v, 0)}"><i style="${st}"></i></span> <span style="font-variant-numeric:tabular-nums">${num(v, 0)}</span>`;
  };
  const bullets = (items) => `<ul class="bullets">${items.map((n) => `<li><span class="ic">${ICON[n.tipo] || ICON.info}</span><span>${esc(n.texto)}</span></li>`).join("")}</ul>`;

  function segBar(w) {
    const tot = Object.values(w).reduce((s, v) => s + v, 0) || 1;
    return `<div class="segbar" role="img" aria-label="${esc(CLASES.filter((c) => w[c] > 0).map((c) => c + " " + pct(w[c] / tot, 0, false)).join(", "))}">${CLASES.filter((c) => w[c] > 0.0005).map((c) => {
      const p = w[c] / tot;
      return `<div class="${DARK_INK.has(c) ? "dark-ink" : ""}" style="flex:${p} 1 0;background:${COLOR_CLASE[c]}" title="${esc(c)}: ${pct(p, 1, false)}">${p >= 0.07 ? pct(p, 0, false) : ""}</div>`;
    }).join("")}</div>`;
  }
  const leyendaClases = (ws) => {
    const presentes = CLASES.filter((c) => ws.some((w) => w[c] > 0.0005));
    return `<div class="legend">${presentes.map((c) => `<span><i class="sq" style="background:${COLOR_CLASE[c]}"></i>${esc(c)}</span>`).join("")}</div>`;
  };

  function tablaAsignacion(pf) {
    const act = porClase(pf.w, pf.cashW), obj = porClase(R.objetivo.pesos, 0);
    return `<div class="table-wrap"><table><thead><tr><th>Clase</th><th class="n">Actual</th><th class="n">Objetivo</th><th class="n">Diferencia</th></tr></thead><tbody>
      ${CLASES.filter((c) => act[c] > 0.0005 || obj[c] > 0.0005).map((c) => `<tr><td><span class="legend" style="margin:0"><span><i class="sq" style="background:${COLOR_CLASE[c]}"></i>${esc(c)}</span></span></td><td class="n">${pct(act[c], 1, false)}</td><td class="n">${pct(obj[c], 1, false)}</td><td class="n">${pct(obj[c] - act[c], 1)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  // ------------------------------------------------------------------ pestañas
  const TABS = {};

  TABS.resumen = {
    nombre: "Resumen",
    html() {
      const pf = cartera();
      const reg = R.regimen.hoy;
      const mac = Object.fromEntries(R.macro.map((m) => [m.simbolo, m]));
      const vol = volPort(pf.w);
      const var1 = 1.645 * vol / Math.sqrt(252) * pf.totalCLP;
      const od = ordenes("diaria"), os = ordenes("semanal");
      const pend = (l) => l.lista.filter((o) => !S.marcas[o.key]);
      const pnl = Object.keys(pf.val).reduce((s, t) => s + (pf.costo[t] ? pf.val[t] - pf.costo[t] : 0), 0);
      const costo = Object.values(pf.costo).reduce((s, v) => s + v, 0);
      const wAct = porClase(pf.w, pf.cashW), wObj = porClase(R.objetivo.pesos, 0);
      const prox = [...pend(od), ...pend(os)].slice(0, 4);
      return `
      ${pf.cashW > 0.3 ? `<div class="banner">${ICON.info} Tienes ${pct(pf.cashW, 0, false)} en efectivo. El plan para perfil moderado propone entrar <b>escalonado en ${R.reglas.tramos_entrada} tramos semanales</b> (reduce el riesgo de entrar justo antes de una caída). Revisa la pestaña <b>Órdenes</b>.</div>` : ""}
      <div class="grid g-main">
        <div class="card">
          <div class="card-head"><div><h2>Tu portafolio</h2><p class="sub">Valorizado al cierre del ${fecha(R.meta.fecha_datos)} · USD/CLP ${num(FX, 1)}</p></div>${badgeRegimen(reg.nombre)}</div>
          <div class="hero"><div><div class="big">${clpC(pf.totalCLP)}</div><div class="meta">${usd(pf.total)} · invertido ${pct(1 - pf.cashW, 0, false)}</div></div>
          ${costo > 0 ? `<div class="meta">Resultado no realizado<br><b class="${cls(pnl)}">${susd(pnl)} (${pct(pnl / costo)})</b></div>` : ""}</div>
          <h3>Asignación: actual vs objetivo</h3>
          ${leyendaClases([wAct, wObj])}
          <div class="alloc-row"><span class="k">Actual</span>${segBar(wAct)}</div>
          <div class="alloc-row"><span class="k">Objetivo</span>${segBar(wObj)}</div>
        </div>
        <div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr));align-content:start">
          <div class="tile"><div class="label">VIX (miedo)</div><div class="value">${num(reg.vix, 1)}</div><div class="delta ${cls(-(mac["^VIX"] || {}).c1d)}">${pct((mac["^VIX"] || {}).c1d)} día</div></div>
          <div class="tile"><div class="label">Dólar USD/CLP</div><div class="value">${num(FX, 1)}</div><div class="delta">${pct((mac["CLP=X"] || {}).c1d, 2)} día</div></div>
          <div class="tile"><div class="label">Riesgo 1 día (VaR 95%)</div><div class="value">${clpC(var1)}</div><div class="delta">vol. anual ${pct(vol, 1, false)}</div></div>
          <div class="tile"><div class="label">Tasa 10 años EE.UU.</div><div class="value">${num((mac["^TNX"] || {}).valor, 2)}%</div><div class="delta">${num(((mac["^TNX"] || {}).dif1d || 0) * 100, 0)} pb día</div></div>
          <div class="tile"><div class="label">Órdenes de hoy</div><div class="value">${pend(od).length}</div><div class="delta">${pend(os).length} de rebalanceo semanal</div></div>
          <div class="tile"><div class="label">Alertas</div><div class="value">${R.alertas.length}</div><div class="delta">${R.alertas.filter((a) => a.nivel === "critico").length} críticas</div></div>
        </div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-head"><div><h2>Lo esencial hoy</h2><p class="sub">Informe diario · ${fecha(R.meta.fecha_datos)}</p></div><button class="btn sm" data-go="diario">Informe completo →</button></div>${bullets(R.narrativa_diaria.slice(0, 7))}</div>
        <div class="card"><div class="card-head"><div><h2>Próximos movimientos</h2><p class="sub">Pendientes de ejecutar en Racional</p></div><button class="btn sm" data-go="ordenes">Ver órdenes →</button></div>
          ${prox.length ? `<div class="orders">${prox.map((o) => ordenCard(o, pf, true)).join("")}</div>` : `<div class="empty">Sin movimientos pendientes. Mantener es también una decisión.</div>`}
        </div>
      </div>`;
    },
  };

  TABS.diario = {
    nombre: "Informe diario",
    html() {
      const pf = cartera();
      const od = ordenes("diaria");
      return `
      <h1 class="section-title">Informe de inteligencia diario</h1>
      <p class="section-sub">Cierre del ${fecha(R.meta.fecha_datos)} · generado ${esc(R.meta.generado)} · régimen ${badgeRegimen(R.regimen.hoy.nombre)}</p>
      <div class="grid g-main">
        <div class="card"><h2>Resumen ejecutivo</h2><p class="sub">Lo que pasó y por qué importa para tu portafolio</p>${bullets(R.narrativa_diaria)}</div>
        <div class="card"><h2>Alertas de riesgo</h2><p class="sub">Ordenadas por severidad</p>
          ${R.alertas.length ? R.alertas.map((a) => `<div class="alert">${ICON[a.nivel]}<div><div class="lvl">${NIVEL_TXT[a.nivel]} · ${esc(a.ticker)}</div>${esc(a.texto)}</div></div>`).join("") : `<div class="alert">${ICON.ok}<div>Sin alertas.</div></div>`}
        </div>
      </div>
      <h3 class="section-title" style="font-size:16px;margin-top:24px">Tablero macro</h3>
      <div class="tiles">${R.macro.map((m) => {
        const tasa = m.simbolo === "^TNX";
        return `<div class="tile"><div class="label">${esc(m.nombre)}</div><div class="value">${tasa ? num(m.valor, 2) + "%" : num(m.valor, m.dec > 2 ? 2 : m.dec)}</div>
        <div class="delta">${tasa ? `${num(m.dif1d * 100, 0)} pb día · ${num(m.dif5d * 100, 0)} pb sem.` : `${pct(m.c1d, 2)} día · ${pct(m.c5d)} sem.`}</div>${Charts.spark(m.serie, { w: 150, h: 28 })}</div>`;
      }).join("")}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Movimiento del día por activo</h2><p class="sub">Variación % en la última sesión</p><div id="ch-movers"></div></div>
        <div class="card"><h2>Cambios de señal</h2><p class="sub">Acción sugerida vs la sesión anterior y hace una semana</p>
          <div class="table-wrap"><table><thead><tr><th>Activo</th><th>Hace 1 sem.</th><th>Ayer</th><th>Hoy</th></tr></thead><tbody>
          ${R.activos.filter((a) => a.accion !== a.accion_ayer || a.accion !== a.accion_sem).map((a) => `<tr class="click" data-ver="${esc(a.ticker)}"><td><span class="tk">${esc(a.ticker)}</span></td><td>${badge(a.accion_sem)}</td><td>${badge(a.accion_ayer)}</td><td>${badge(a.accion)}</td></tr>`).join("") || `<tr><td colspan="4" class="note">Sin cambios.</td></tr>`}
          </tbody></table></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">${tablaSenales()}</div>
      <h3 class="section-title" style="font-size:16px;margin-top:24px">Movimientos tácticos de hoy</h3>
      <p class="section-sub">Compras/ventas parciales cuando la señal diaria confirma la dirección del portafolio objetivo. Calculadas con tus posiciones.</p>
      ${od.lista.length ? `<div class="orders">${od.lista.map((o) => ordenCard(o, pf)).join("")}</div>` : `<div class="empty">Hoy no hay movimientos tácticos. Ninguna señal diaria confirma un cambio respecto de tu portafolio.</div>`}`;
    },
    after() {
      const rows = [...R.activos].sort((a, b) => b.r1d - a.r1d).map((a) => ({ label: a.ticker, value: a.r1d * 100, tip: `<div class="r"><span>${esc(a.nombre)}</span></div><div class="r"><span>Día</span><b>${pct(a.r1d, 2)}</b></div><div class="r"><span>Semana</span><b>${pct(a.r5d)}</b></div>` }));
      Charts.hbars($("#ch-movers"), rows, { fmt: (v) => (v > 0 ? "+" : "") + nf(1).format(v) + "%", rowH: 22, labelW: 60, aria: "Variación diaria por activo" });
      bindSort();
    },
  };
  const badge = (x) => `<span class="badge b-${x}"><span class="dot"></span>${x}</span>`;

  function tablaSenales() {
    let rows = R.activos.filter((a) => S.filtro === "todos" || (S.filtro === "nucleo" ? a.bloque !== "satelite" : a.bloque === "satelite"));
    const k = S.sort.k, d = S.sort.dir;
    rows = [...rows].sort((x, y) => {
      const a = x[k], b = y[k];
      if (typeof a === "string") return d * a.localeCompare(b);
      return d * ((a ?? -1e9) - (b ?? -1e9));
    });
    const th = (key, lab, n = true) => `<th class="sort ${n ? "n" : ""}" data-sort="${key}">${lab}${S.sort.k === key ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`;
    return `<div class="card-head"><div><h2>Señales del universo</h2><p class="sub">Puntajes −100 a +100. Combinado = 35% diario + 65% semanal. Clic en una fila para ver el detalle.</p></div>
      <div class="seg" role="group" aria-label="Filtrar">${[["todos", "Todos"], ["nucleo", "ETFs núcleo"], ["satelite", "Acciones"]].map(([v, l]) => `<button data-filtro="${v}" aria-pressed="${S.filtro === v}">${l}</button>`).join("")}</div></div>
      <div class="table-wrap"><table id="tbl-senales"><thead><tr>${th("ticker", "Activo", false)}${th("precio", "Precio")}${th("r1d", "Día")}${th("r21d", "1 mes")}${th("ytd", "Año")}${th("sd", "Diario")}${th("sw", "Semanal")}${th("sc", "Combinado")}<th>Acción</th>${th("rsi", "RSI")}${th("vol20", "Vol. 20d")}<th class="n">Stop / revisión</th><th class="n">Objetivo</th></tr></thead><tbody>
      ${rows.map((a) => `<tr class="click" data-ver="${esc(a.ticker)}"><td><span class="tk">${esc(a.ticker)}</span> <span class="nm">${esc(a.nombre)}</span></td>
        <td class="n">${usd(a.precio)}</td><td class="n ${cls(a.r1d)}">${pct(a.r1d)}</td><td class="n ${cls(a.r21d)}">${pct(a.r21d)}</td><td class="n ${cls(a.ytd)}">${pct(a.ytd)}</td>
        <td class="n">${meter(a.sd)}</td><td class="n">${meter(a.sw)}</td><td class="n">${meter(a.sc)}</td><td>${badge(a.accion)}</td>
        <td class="n">${num(a.rsi, 0)}</td><td class="n">${pct(a.vol20, 0, false)}</td><td class="n">${a.stop ? usd(a.stop) + (a.stop_activo ? " " + ICON.critico : "") : "–"}</td><td class="n">${R.objetivo.pesos[a.ticker] ? pct(R.objetivo.pesos[a.ticker], 1, false) : "–"}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function bindSort() {
    $$("[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : (k === "ticker" ? 1 : -1) };
      render();
    }));
  }

  TABS.semanal = {
    nombre: "Informe semanal",
    html() {
      const pf = cartera();
      const os = ordenes("semanal");
      const rk = R.riesgo, met = rk.backtest.met;
      const obj = R.objetivo.pesos, obj5 = R.objetivo_semana_pasada.pesos;
      const ts = [...new Set([...Object.keys(obj), ...Object.keys(obj5)])].sort((a, b) => (obj[b] || 0) - (obj[a] || 0));
      const val = valObjetivo(pf.total);
      return `
      <h1 class="section-title">Informe de inteligencia semanal</h1>
      <p class="section-sub">Semana ${esc(R.meta.semana)} · datos al ${fecha(R.meta.fecha_datos)} · régimen ${badgeRegimen(R.regimen.semana.nombre)} → ${badgeRegimen(R.regimen.hoy.nombre)}</p>
      <div class="grid g-main">
        <div class="card"><h2>Resumen estratégico</h2><p class="sub">Tendencias de mediano plazo y cambios en el portafolio objetivo</p>${bullets(R.narrativa_semanal)}</div>
        <div class="card"><h2>Riesgo del portafolio objetivo</h2><p class="sub">Con los pesos de esta semana, aplicados a tu capital (${clpC(pf.totalCLP)})</p>
          <dl class="kv">
            <dt>Volatilidad anual</dt><dd>${pct(rk.vol_anual, 1, false)}</dd>
            <dt>Pérdida 1 día (VaR 95%)</dt><dd>${pct(-rk.var95_1d)} · ${clpC(-rk.var95_1d * pf.totalCLP)}</dd>
            <dt>Pérdida 1 semana (VaR 95%)</dt><dd>${pct(-rk.var95_5d)} · ${clpC(-rk.var95_5d * pf.totalCLP)}</dd>
            <dt>Pérdida 1 mes (VaR 95%)</dt><dd>${pct(-rk.var95_21d)} · ${clpC(-rk.var95_21d * pf.totalCLP)}</dd>
            <dt>Peor mes (2 años)</dt><dd>${pct(rk.peor_mes)}</dd>
            <dt>Máxima caída (3 años)</dt><dd>${pct(met.modelo.max_dd)}</dd>
            <dt>Tu tolerancia mensual</dt><dd>${pct(-S.tol / 100)} ${-rk.var95_21d * 100 > -S.tol ? ICON.ok : ICON.serio}</dd>
          </dl>
          <p class="note">VaR 95%: una pérdida que se supera en ~1 de cada 20 periodos.</p>
        </div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Rendimiento de la semana</h2><p class="sub">Variación % en 5 sesiones</p><div id="ch-semana"></div></div>
        <div class="card"><h2>Portafolio objetivo: cambios de la semana</h2><p class="sub">Pesos estratégicos ajustados por tendencia, momentum y régimen</p>
          <div class="table-wrap"><table><thead><tr><th>Activo</th><th class="n">Sem. pasada</th><th class="n">Ahora</th><th class="n">Cambio</th><th class="n">Monto (tu capital)</th></tr></thead><tbody>
          ${ts.map((t) => `<tr class="click" data-ver="${esc(t)}" title="${esc((R.objetivo.razones || {})[t] || "")}"><td><span class="tk">${esc(t)}</span> <span class="nm">${esc(A[t] ? A[t].clase : "")}</span></td><td class="n">${pct(obj5[t] || 0, 1, false)}</td><td class="n"><b>${pct(obj[t] || 0, 1, false)}</b></td><td class="n ${cls((obj[t] || 0) - (obj5[t] || 0))}">${pct((obj[t] || 0) - (obj5[t] || 0), 1)}</td><td class="n">${clpC((val[t] || 0) * FX)}</td></tr>`).join("")}
          </tbody></table></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><div><h2>Simulación histórica (3 años)</h2><p class="sub">Cómo se habría comportado la mezcla objetivo actual, rebalanceada a diario, vs el S&P 500 y un 60/40. Base 100. No garantiza resultados futuros.</p></div></div>
        <div id="ch-backtest"></div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th></th><th class="n">Rent. anual</th><th class="n">Volatilidad</th><th class="n">Máx. caída</th><th class="n">Sharpe</th></tr></thead><tbody>
          ${[["modelo", "Portafolio objetivo"], ["voo", "S&P 500 (VOO)"], ["sesenta", "60/40 (VOO/BND)"]].map(([k, l]) => `<tr><td>${l}</td><td class="n">${pct(met[k].cagr)}</td><td class="n">${pct(met[k].vol, 1, false)}</td><td class="n">${pct(met[k].max_dd)}</td><td class="n">${num(met[k].sharpe, 2)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Pruebas de estrés con crisis reales</h2><p class="sub">Si cada episodio se repitiera hoy. En CLP incluye el efecto del dólar (en crisis el peso suele debilitarse, lo que amortigua).</p>
        <div class="table-wrap"><table><thead><tr><th>Episodio</th><th>Periodo</th><th class="n">S&P 500</th><th class="n">USD/CLP</th><th class="n">Objetivo (USD)</th><th class="n">Objetivo (CLP)</th><th class="n">Tu portafolio (CLP)</th></tr></thead><tbody>
        ${R.historicos.map((h) => { const mi = impactoHist(pf.val, pf.cashUSD, h); return `<tr title="${esc(h.descripcion)}"><td><b>${esc(h.nombre)}</b><div class="nm">${esc(h.descripcion)}</div></td><td>${fecha(h.desde)} → ${fecha(h.hasta)}</td><td class="n ${cls(h.ret.VOO)}">${pct(h.ret.VOO)}</td><td class="n">${pct(h.ret["CLP=X"])}</td><td class="n ${cls(h.impacto.usd)}">${pct(h.impacto.usd)}</td><td class="n ${cls(h.impacto.clp)}">${pct(h.impacto.clp)} · ${clpC(h.impacto.clp * pf.totalCLP)}</td><td class="n ${cls(mi.clp)}">${sclp(mi.clp)}</td></tr>`; }).join("")}
        </tbody></table></div>
      </div>
      <h3 class="section-title" style="font-size:16px;margin-top:24px">Rebalanceo semanal</h3>
      <p class="section-sub">Órdenes para acercar tu portafolio al objetivo. Banda de tolerancia ${R.reglas.banda_rebalanceo_pp} pp: diferencias menores no se operan (evita costos).</p>
      ${os.lista.length ? `<div class="orders">${os.lista.map((o) => ordenCard(o, pf)).join("")}</div>` : `<div class="empty">Tu portafolio está dentro de la banda de rebalanceo. No hay que hacer nada esta semana.</div>`}`;
    },
    after() {
      const rows = [...R.activos].sort((a, b) => b.r5d - a.r5d).map((a) => ({ label: a.ticker, value: a.r5d * 100 }));
      Charts.hbars($("#ch-semana"), rows, { fmt: (v) => (v > 0 ? "+" : "") + nf(1).format(v) + "%", rowH: 22, labelW: 60, aria: "Rendimiento semanal" });
      const b = R.riesgo.backtest;
      Charts.line($("#ch-backtest"), {
        labels: b.fechas, height: 280, endLabels: true, xfmt: fechaCorta, xfmtLong: fecha,
        yfmt: (v) => nf(0).format(v), tfmt: (v) => nf(1).format(v), refLines: [{ y: 100 }],
        series: [{ name: "Portafolio objetivo", values: b.modelo, color: "var(--s1)" }, { name: "S&P 500 (VOO)", values: b.voo, color: "var(--s2)" }, { name: "60/40", values: b.sesenta, color: "var(--s3)" }],
        aria: "Simulación histórica base 100",
      });
    },
  };

  TABS.ordenes = {
    nombre: "Órdenes",
    html() {
      const tipo = S.ordTipo;
      const o = ordenes(tipo);
      const pf = o.pf;
      const pend = o.lista.filter((x) => !S.marcas[x.key]);
      const compras = pend.filter((x) => x.monto > 0).reduce((s, x) => s + x.monto, 0);
      const ventas = pend.filter((x) => x.monto < 0).reduce((s, x) => s - x.monto, 0);
      const netoUSD = compras - ventas;
      const convertir = Math.max(0, netoUSD - pf.cashUSD);
      return `
      <h1 class="section-title">Órdenes para Racional</h1>
      <p class="section-sub">Calculadas con tus posiciones (pestaña <a href="#" data-go="posiciones">Mis posiciones</a>) y el portafolio objetivo. Registra cada orden cuando la ejecutes para que el plan se recalcule.</p>
      <div class="card-head">
        <div class="seg" role="group" aria-label="Tipo de órdenes">
          <button data-ord="diaria" aria-pressed="${tipo === "diaria"}">Diarias (tácticas)</button>
          <button data-ord="semanal" aria-pressed="${tipo === "semanal"}">Semanales (rebalanceo)</button>
        </div>
        <span class="note">${tipo === "diaria" ? "Ajustes del día cuando la señal diaria confirma. Opcionales." : "Plan base de la semana. Ejecútalo una vez, idealmente el mismo día cada semana."}</span>
      </div>
      <div class="tiles" style="margin-bottom:16px">
        <div class="tile"><div class="label">Compras pendientes</div><div class="value">${usd(compras)}</div><div class="delta">${clp(compras * FX)}</div></div>
        <div class="tile"><div class="label">Ventas pendientes</div><div class="value">${usd(ventas)}</div><div class="delta">${clp(ventas * FX)}</div></div>
        <div class="tile"><div class="label">Pesos a convertir a USD</div><div class="value">${clp(convertir * FX)}</div><div class="delta">${convertir > 0 ? "Hazlo primero en Racional" : "Tienes USD suficiente"}</div></div>
        <div class="tile"><div class="label">Efectivo disponible</div><div class="value">${clpC((pf.cashUSD + pf.cashCLP / FX) * FX)}</div><div class="delta">${usd(pf.cashUSD)} + ${clpC(pf.cashCLP)}</div></div>
      </div>
      ${o.lista.length ? `<div class="orders">${o.lista.map((x) => ordenCard(x, pf)).join("")}</div>` : `<div class="empty">${tipo === "diaria" ? "Sin movimientos tácticos hoy." : "Tu portafolio está dentro de la banda de rebalanceo."}</div>`}
      <p class="note" style="margin-top:16px">Cómo ejecutar en Racional: usa órdenes por monto (fracciones). Ejecuta durante el horario de mercado de EE.UU. (11:30–18:00 hora de Chile en horario de verano) y evita los primeros 15 minutos, cuando los spreads son mayores.</p>`;
    },
  };

  TABS.escenarios = {
    nombre: "Escenarios",
    html() {
      const f = S.esc.f;
      const sl = (k, lab, min, max, step, unit) => `<div class="slider"><label for="sl-${k}">${lab}</label><output id="o-${k}">${(f[k] > 0 ? "+" : "") + f[k]}${unit}</output><input type="range" id="sl-${k}" data-f="${k}" min="${min}" max="${max}" step="${step}" value="${f[k]}"></div>`;
      return `
      <h1 class="section-title">Escenarios: dimensiona el impacto antes de decidir</h1>
      <p class="section-sub">Mueve los factores o elige una situación. El impacto se calcula con la sensibilidad (beta) de cada activo estimada con 3 años de datos semanales, y se expresa en pesos chilenos.</p>
      <div class="grid g-side">
        <div class="card">
          <h2>Situación</h2><p class="sub">Hipotéticas</p>
          <div class="chips">${R.escenarios.map((e) => `<button class="chip" data-preset="${e.id}" aria-pressed="${S.esc.preset === e.id}" title="${esc(e.descripcion)}">${esc(e.nombre)}</button>`).join("")}</div>
          <p class="sub">Crisis reales (repetidas hoy)</p>
          <div class="chips">${R.historicos.map((h) => `<button class="chip" data-hist="${h.id}" aria-pressed="${S.esc.preset === "h:" + h.id}" title="${esc(h.descripcion)}">${esc(h.nombre)}</button>`).join("")}</div>
          <div id="esc-fact" class="${S.esc.preset.startsWith("h:") ? "hidden" : ""}">
          <h3>Factores</h3>
          ${sl("spx", "S&P 500", -40, 30, 1, "%")}
          ${sl("tasas_pb", "Tasa 10 años EE.UU.", -200, 200, 5, " pb")}
          ${sl("oro", "Oro", -30, 30, 1, "%")}
          ${sl("cobre", "Cobre", -40, 40, 1, "%")}
          ${sl("usdclp", "Dólar en Chile (USD/CLP)", -20, 20, 1, "%")}
          </div>
          <h3>Comparar</h3>
          <div class="seg" role="group">${[["ambos", "Ambos"], ["actual", "Mi portafolio"], ["objetivo", "Objetivo"]].map(([v, l]) => `<button data-modo="${v}" aria-pressed="${S.esc.modo === v}">${l}</button>`).join("")}</div>
          <h3>Tu tolerancia</h3>
          <div class="slider"><label for="sl-tol">Pérdida que aceptas en un mes malo</label><output id="o-tol">${S.tol}%</output><input type="range" id="sl-tol" min="2" max="25" step="1" value="${S.tol}"></div>
        </div>
        <div id="esc-out"></div>
      </div>
      <div class="card" style="margin-top:16px"><h2>Mapa de todas las situaciones</h2><p class="sub">Impacto en CLP sobre tu capital actual. Estado según tu tolerancia de ${S.tol}%.</p><div id="esc-tabla"></div></div>`;
    },
    after() { escCalcular(); },
  };

  function escCalcular() {
    const pf = cartera();
    const valO = valObjetivo(pf.total);
    const base = pf.totalCLP || 1;
    let titulo, imA, imO, desc;
    if (S.esc.preset.startsWith("h:")) {
      const h = R.historicos.find((x) => "h:" + x.id === S.esc.preset);
      imA = impactoHist(pf.val, pf.cashUSD, h); imO = impactoHist(valO, 0, h);
      titulo = h.nombre; desc = `${h.descripcion} (${fecha(h.desde)} → ${fecha(h.hasta)}; S&P ${pct(h.ret.VOO)}, USD/CLP ${pct(h.ret["CLP=X"])})`;
    } else {
      const e = R.escenarios.find((x) => x.id === S.esc.preset);
      imA = impacto(pf.val, pf.cashUSD, S.esc.f); imO = impacto(valO, 0, S.esc.f);
      titulo = e ? e.nombre : "Escenario personalizado"; desc = e ? e.descripcion : "Combinación de factores definida por ti.";
    }
    const tolCLP = -S.tol / 100 * base;
    const estado = (d) => d >= tolCLP * 0.5 ? ["ok", "Dentro de tu tolerancia"] : d >= tolCLP ? ["advertencia", "Cerca de tu límite"] : ["critico", "Supera tu tolerancia"];
    const tarjeta = (lab, im) => {
      const [ic, tx] = estado(im.clp);
      return `<div class="tile"><div class="label">${lab}</div><div class="value ${cls(im.clp)}">${sclp(im.clp)}</div><div class="delta">${pct(im.clp / base, 1)} · <span style="display:inline-flex;gap:4px;align-items:center;vertical-align:middle">${ICON[ic]} ${tx}</span></div></div>`;
    };
    const m = S.esc.modo;
    const usaObj = m === "objetivo" || (m === "ambos" && pf.inv === 0);
    const elegido = usaObj ? imO : imA;
    // guía de decisión
    const rvA = Object.entries(pf.w).filter(([t]) => A[t] && (A[t].clase.startsWith("RV") || A[t].bloque === "satelite")).reduce((s, [, w]) => s + w, 0);
    let guia = [];
    if (pf.inv === 0) guia.push("Hoy estás 100% en efectivo: el escenario no te afecta salvo por el dólar si tienes USD. Usa la columna 'Objetivo' para ver qué pasaría una vez invertido.");
    const d = imO.clp - imA.clp;
    if (pf.inv > 0 && Math.abs(d) > base * 0.002) guia.push(`Si llevas tu portafolio al objetivo, este escenario ${d > 0 ? "te costaría " + clp(Math.abs(d)) + " menos" : "te costaría " + clp(Math.abs(d)) + " más"}.`);
    if (elegido.clp < tolCLP) guia.push(`Este escenario supera tu tolerancia de ${S.tol}%. Opciones: (1) subir la liquidez (BIL) o renta fija, (2) entrar más escalonado, (3) aceptar el riesgo si tu horizonte es mayor a 5 años.`);
    const peor = Object.entries(elegido.por).sort((a, b) => a[1].clp - b[1].clp)[0];
    if (peor && peor[1].clp < 0) guia.push(`El mayor aporte a la pérdida es ${peor[0]} (${sclp(peor[1].clp)}). Reducir esa posición es la palanca más directa.`);
    const fx = S.esc.preset.startsWith("h:") ? (R.historicos.find((x) => "h:" + x.id === S.esc.preset).ret["CLP=X"] || 0) * 100 : S.esc.f.usdclp;
    if (fx > 3) guia.push(`El alza del dólar (${pct(fx / 100, 0)}) amortigua la pérdida en pesos: es la cobertura natural de invertir en USD desde Chile.`);
    if (fx < -3) guia.push(`La caída del dólar (${pct(fx / 100, 0)}) resta valor en pesos aunque tus activos suban en USD.`);
    if (!guia.length) guia.push("Impacto acotado: no requiere cambios en tu plan.");

    $("#esc-out").innerHTML = `<div class="card"><h2>${esc(titulo)}</h2><p class="sub">${esc(desc)}</p>
      <div class="tiles">${m !== "objetivo" ? tarjeta("Mi portafolio actual", imA) : ""}${m !== "actual" ? tarjeta("Portafolio objetivo", imO) : ""}
        <div class="tile"><div class="label">Tu límite (${S.tol}% mensual)</div><div class="value">${sclp(tolCLP)}</div><div class="delta">sobre ${clpC(base)}</div></div></div>
      <h3>Para decidir</h3>${bullets(guia.map((t) => ({ tipo: "info", texto: t })))}
      <h3>Impacto por activo (${usaObj ? "portafolio objetivo" : "mi portafolio"}, CLP)</h3><div id="ch-esc"></div></div>`;
    const rows = Object.entries(elegido.por).filter(([, v]) => Math.abs(v.clp) > 0.5).sort((a, b) => a[1].clp - b[1].clp)
      .map(([t, v]) => ({ label: t, value: v.clp, tip: `<div class="r"><span>Movimiento del activo</span><b>${pct(v.r)}</b></div><div class="r"><span>Impacto CLP</span><b>${sclp(v.clp)}</b></div>` }));
    if (rows.length) Charts.hbars($("#ch-esc"), rows, { fmt: (v) => clpC(v), rowH: 24, labelW: 90, aria: "Impacto por activo" });
    else $("#ch-esc").innerHTML = `<div class="empty">Sin posiciones expuestas a este escenario.</div>`;

    // tabla de todas las situaciones
    const todas = [
      ...R.escenarios.map((e) => ({ n: e.nombre, a: impacto(pf.val, pf.cashUSD, e.f).clp, o: impacto(valO, 0, e.f).clp })),
      ...R.historicos.map((h) => ({ n: h.nombre + " (real)", a: impactoHist(pf.val, pf.cashUSD, h).clp, o: impactoHist(valO, 0, h).clp })),
    ].sort((x, y) => x.o - y.o);
    $("#esc-tabla").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Situación</th><th class="n">Mi portafolio</th><th class="n">%</th><th class="n">Objetivo</th><th class="n">%</th><th>Estado (objetivo)</th></tr></thead><tbody>
      ${todas.map((x) => { const [ic, tx] = estado(x.o); return `<tr><td>${esc(x.n)}</td><td class="n ${cls(x.a)}">${sclp(x.a)}</td><td class="n">${pct(x.a / base)}</td><td class="n ${cls(x.o)}">${sclp(x.o)}</td><td class="n">${pct(x.o / base)}</td><td><span style="display:inline-flex;gap:6px;align-items:center">${ICON[ic]} ${tx}</span></td></tr>`; }).join("")}
    </tbody></table></div>`;
  }

  TABS.activos = {
    nombre: "Activos",
    html() {
      const a = A[S.activo];
      const b = a.betas || {};
      return `
      <div class="card-head"><div><h1 class="section-title">${esc(a.ticker)} · ${esc(a.nombre)}</h1><p class="section-sub" style="margin:0">${esc(a.clase)} · ${a.bloque === "satelite" ? "Acción satélite" : "ETF núcleo"} · ${badge(a.accion)}</p></div>
        <select id="sel-activo" aria-label="Activo">${R.activos.map((x) => `<option value="${esc(x.ticker)}" ${x.ticker === a.ticker ? "selected" : ""}>${esc(x.ticker)} — ${esc(x.nombre)}</option>`).join("")}</select></div>
      <div class="grid g-main">
        <div class="card"><h2>Precio y tendencia (12 meses)</h2><p class="sub">Precio vs medias móviles de 50 y 200 días (USD)</p><div id="ch-precio"></div>
          <h3>Puntaje combinado (−100 a +100)</h3><div id="ch-score"></div>
          <h3>RSI 14 días</h3><div id="ch-rsi"></div></div>
        <div class="grid" style="align-content:start">
          <div class="card"><h2>Por qué esta señal</h2><p class="sub">Diario ${num(a.sd, 0)} · Semanal ${num(a.sw, 0)} · Combinado ${num(a.sc, 0)}</p>${bullets(a.por_que.map((t) => ({ tipo: "senales", texto: t })))}</div>
          <div class="card"><h2>Datos clave</h2><dl class="kv" style="margin-top:8px">
            <dt>Precio</dt><dd>${usd(a.precio)} · ${clp(a.precio * FX)}</dd>
            <dt>Día · semana · mes</dt><dd>${pct(a.r1d)} · ${pct(a.r5d)} · ${pct(a.r21d)}</dd>
            <dt>Año · 12 meses</dt><dd>${pct(a.ytd)} · ${pct(a.r252d)}</dd>
            <dt>Desde máximo 52 sem.</dt><dd>${pct(a.dd52)}</dd>
            <dt>Volatilidad 20d / 1 año</dt><dd>${pct(a.vol20, 0, false)} / ${pct(a.vol252, 0, false)}</dd>
            <dt>Rango diario (ATR)</dt><dd>${usd(a.atr_pct * a.precio)} · ${pct(a.atr_pct, 1, false)}</dd>
            <dt>${a.bloque === "satelite" ? "Stop dinámico" : "Nivel de revisión"}</dt><dd>${a.stop ? usd(a.stop) + " (" + pct(-a.stop_dist) + ")" : "–"}</dd>
            <dt>Mes típico (p5 · p50 · p95)</dt><dd>${a.p21 ? pct(a.p21.p5) + " · " + pct(a.p21.p50) + " · " + pct(a.p21.p95) : "–"}</dd>
            <dt>Beta S&P 500</dt><dd>${num(b.spx, 2)}</dd>
            <dt>Sensibilidad a +100 pb</dt><dd>${pct(b.tasas)}</dd>
            <dt>Beta oro · cobre</dt><dd>${num(b.oro, 2)} · ${num(b.cobre, 2)}</dd>
            <dt>Peso objetivo</dt><dd>${pct(R.objetivo.pesos[a.ticker] || 0, 1, false)}</dd>
          </dl><p class="note">${esc((R.objetivo.razones || {})[a.ticker] || "Fuera del portafolio objetivo esta semana.")}</p></div>
        </div>
      </div>`;
    },
    after() {
      const s = R.series.activos[S.activo], f = R.series.fechas;
      Charts.line($("#ch-precio"), { labels: f, height: 280, endLabels: true, xfmt: fechaCorta, xfmtLong: fecha, yfmt: (v) => "$" + nf(v >= 100 ? 0 : 2).format(v), tfmt: (v) => usd(v),
        series: [{ name: "Precio", values: s.c, color: "var(--s1)" }, { name: "Media 50d", values: s.s50, color: "var(--s2)" }, { name: "Media 200d", values: s.s200, color: "var(--s3)" }], aria: "Precio" });
      Charts.line($("#ch-score"), { labels: f, height: 130, xfmt: fechaCorta, xfmtLong: fecha, yDomain: [-100, 100], yTicks: [-100, -50, 0, 50, 100], yfmt: (v) => nf(0).format(v),
        refLines: [{ y: 0 }], series: [{ name: "Puntaje", values: s.sc, color: "var(--s1)" }], aria: "Puntaje" });
      Charts.line($("#ch-rsi"), { labels: f, height: 120, xfmt: fechaCorta, xfmtLong: fecha, yDomain: [0, 100], yTicks: [0, 30, 50, 70, 100], yfmt: (v) => nf(0).format(v),
        refLines: [{ y: 70, label: "sobrecompra" }, { y: 30, label: "sobreventa" }], series: [{ name: "RSI", values: s.rsi, color: "var(--s1)" }], aria: "RSI" });
      $("#sel-activo").addEventListener("change", (e) => { S.activo = e.target.value; LS.set("inv.activo", S.activo); render(); });
    },
  };

  TABS.posiciones = {
    nombre: "Mis posiciones",
    html() {
      const pf = cartera();
      const opts = (sel) => R.activos.map((a) => `<option value="${esc(a.ticker)}" ${a.ticker === sel ? "selected" : ""}>${esc(a.ticker)}</option>`).join("");
      return `
      <h1 class="section-title">Mis posiciones en Racional</h1>
      <p class="section-sub">Copia aquí lo que tienes en tu cuenta. Se guarda solo en este navegador. Las órdenes y escenarios se recalculan con estos datos.</p>
      <div class="grid g-main">
        <div class="card"><h2>Posiciones</h2><p class="sub">Cantidad = número de acciones/cuotas (acepta fracciones). Costo promedio en USD.</p>
          <div class="table-wrap"><table class="pos-table"><thead><tr><th>Activo</th><th class="n">Cantidad</th><th class="n">Costo prom.</th><th class="n">Precio</th><th class="n">Valor</th><th class="n">Resultado</th><th class="n">Peso</th><th></th></tr></thead><tbody>
          ${S.pos.posiciones.map((p, i) => { const a = A[p.ticker]; const v = a ? p.cantidad * a.precio : 0; const c = p.cantidad * (p.costo_promedio || 0);
            return `<tr><td><select data-i="${i}" data-k="ticker">${opts(p.ticker)}</select></td><td class="n"><input type="number" step="any" min="0" data-i="${i}" data-k="cantidad" value="${p.cantidad}"></td><td class="n"><input type="number" step="any" min="0" data-i="${i}" data-k="costo_promedio" value="${p.costo_promedio}"></td><td class="n">${a ? usd(a.precio) : "–"}</td><td class="n">${usd(v)}</td><td class="n ${cls(v - c)}">${c ? susd(v - c) + " (" + pct((v - c) / c) + ")" : "–"}</td><td class="n">${pct(pf.total ? v / pf.total : 0, 1, false)}</td><td><button class="btn sm ghost" data-del="${i}" aria-label="Eliminar">✕</button></td></tr>`; }).join("") || `<tr><td colspan="8" class="note">Aún no tienes posiciones registradas.</td></tr>`}
          </tbody></table></div>
          <div class="row-actions"><button class="btn" id="btn-add">+ Agregar posición</button></div>
          <h3>Efectivo</h3>
          <div class="row-actions" style="margin-top:0;align-items:center">
            <label>USD en Racional <input type="number" step="any" min="0" id="in-usd" value="${S.pos.efectivo_usd}"></label>
            <label>Pesos disponibles para invertir (CLP) <input type="number" step="1000" min="0" id="in-clp" value="${S.pos.efectivo_clp}"></label>
          </div>
          <dl class="kv" style="margin-top:16px"><dt>Total invertido</dt><dd>${usd(pf.inv)}</dd><dt>Efectivo total</dt><dd>${usd(pf.cashUSD + pf.cashCLP / FX)}</dd><dt><b>Patrimonio</b></dt><dd><b>${usd(pf.total)} · ${clp(pf.totalCLP)}</b></dd></dl>
          <div class="row-actions"><button class="btn" id="btn-export">Exportar JSON</button><label class="btn">Importar JSON<input type="file" id="in-import" accept="application/json" class="hidden"></label><button class="btn" id="btn-reset">Restablecer desde config</button></div>
        </div>
        <div class="card"><h2>Registro de operaciones</h2><p class="sub">Órdenes que marcaste como ejecutadas</p>
          ${S.log.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Activo</th><th class="n">Monto</th><th class="n">Precio</th></tr></thead><tbody>${S.log.slice(0, 40).map((l) => `<tr><td>${esc(l.fecha)}</td><td><b>${l.monto > 0 ? "Compra" : "Venta"}</b> ${esc(l.ticker)}</td><td class="n">${usd(Math.abs(l.monto))}</td><td class="n">${usd(l.precio)}</td></tr>`).join("")}</tbody></table></div><div class="row-actions"><button class="btn sm" id="btn-clear-log">Borrar registro</button></div>` : `<div class="empty">Sin operaciones registradas.</div>`}
          <h3>Tolerancia al riesgo</h3>
          <div class="slider"><label for="sl-tol2">Pérdida mensual que aceptas</label><output>${S.tol}%</output><input type="range" id="sl-tol2" min="2" max="25" step="1" value="${S.tol}"></div>
          <p class="note">Perfil moderado típico: 6–10%. Se usa para colorear escenarios y validar el riesgo del portafolio objetivo.</p>
        </div>
      </div>`;
    },
    after() {
      $$(".pos-table [data-k]").forEach((el) => el.addEventListener("change", () => {
        const p = S.pos.posiciones[+el.dataset.i]; const k = el.dataset.k;
        p[k] = k === "ticker" ? el.value : Math.max(0, parseFloat(el.value) || 0);
        guardarPos(); render();
      }));
      $$("[data-del]").forEach((b) => b.addEventListener("click", () => { S.pos.posiciones.splice(+b.dataset.del, 1); guardarPos(); render(); }));
      $("#btn-add").addEventListener("click", () => { S.pos.posiciones.push({ ticker: "VOO", cantidad: 0, costo_promedio: A.VOO ? +A.VOO.precio.toFixed(2) : 0 }); guardarPos(); render(); });
      $("#in-usd").addEventListener("change", (e) => { S.pos.efectivo_usd = Math.max(0, parseFloat(e.target.value) || 0); guardarPos(); render(); });
      $("#in-clp").addEventListener("change", (e) => { S.pos.efectivo_clp = Math.max(0, parseFloat(e.target.value) || 0); guardarPos(); render(); });
      $("#btn-export").addEventListener("click", () => {
        const blob = new Blob([JSON.stringify({ ...S.pos, registro: S.log }, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `posiciones-${R.meta.fecha_datos}.json`; a.click();
      });
      $("#in-import").addEventListener("change", (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((t) => { const j = JSON.parse(t); S.pos = { posiciones: j.posiciones || [], efectivo_usd: j.efectivo_usd || 0, efectivo_clp: j.efectivo_clp || 0 }; if (j.registro) { S.log = j.registro; LS.set("inv.log.v1", S.log); } guardarPos(); render(); toast("Posiciones importadas"); }).catch(() => toast("Archivo no válido"));
      });
      $("#btn-reset").addEventListener("click", () => { if (confirm("¿Reemplazar tus posiciones por las de config/portafolio.json?")) { S.pos = JSON.parse(JSON.stringify(R.config)); guardarPos(); render(); } });
      const cl = $("#btn-clear-log"); if (cl) cl.addEventListener("click", () => { if (confirm("¿Borrar el registro?")) { S.log = []; LS.set("inv.log.v1", S.log); render(); } });
      $("#sl-tol2").addEventListener("input", (e) => { S.tol = +e.target.value; LS.set("inv.tol", S.tol); e.target.previousElementSibling.textContent = S.tol + "%"; });
    },
  };

  TABS.metodo = {
    nombre: "Metodología",
    html() {
      const rg = R.reglas;
      return `<div class="card prose" style="max-width:860px">
        <h1 class="section-title">Cómo funciona</h1>
        <p>Cada día, el motor descarga precios de cierre de ${R.activos.length} instrumentos disponibles en el mercado de EE.UU. (los que Racional permite comprar en USD) y 7 indicadores macro. Con ellos calcula señales, un portafolio objetivo y su riesgo. Todo es transparente y reproducible: no hay "cajas negras".</p>
        <h3>1. Portafolio estratégico (perfil moderado)</h3>
        <p>Base: ~65% renta variable (EE.UU., internacional, Chile, acciones satélite), 25% renta fija, 7% oro y 3% liquidez. La renta variable se limita entre ${pct(rg.rv_min, 0, false)} y ${pct(rg.rv_max, 0, false)}.</p>
        <h3>2. Señales</h3>
        <ul>
          <li><b>Puntaje diario</b> (corto plazo): precio vs media 20d, pendiente, MACD, RSI 14 y rupturas de 20 días.</li>
          <li><b>Puntaje semanal</b> (mediano plazo): precio vs media 200d, cruce 50/200, RSI semanal, retorno 3 meses y ranking de momentum 12-1 meses.</li>
          <li><b>Combinado</b> = 35% diario + 65% semanal. ≥45 Comprar · 15–45 Acumular · −15–15 Mantener · −45– −15 Reducir · ≤−45 Vender.</li>
        </ul>
        <h3>3. Portafolio objetivo táctico</h3>
        <p>Cada ETF núcleo se ajusta hasta ±${pct(rg.tilt_max, 0, false)} de su peso según su puntaje semanal; en régimen Defensivo la renta variable baja 15% adicional. El bloque satélite (${pct(rg.satelite.peso_total, 0, false)}) se reparte entre las ${rg.satelite.n_max} acciones con mejor puntaje y tendencia positiva, ponderadas por menor volatilidad, máximo ${pct(rg.satelite.max_por_accion, 0, false)} cada una. Lo no asignado va a liquidez (BIL).</p>
        <h3>4. Órdenes</h3>
        <ul>
          <li><b>Semanales</b>: rebalanceo cuando una posición se desvía más de ${rg.banda_rebalanceo_pp} pp del objetivo. Si tienes más de 30% en efectivo, se entra en ${rg.tramos_entrada} tramos semanales.</li>
          <li><b>Diarias</b>: compras/ventas parciales (${pct(rg.fraccion_orden_diaria, 0, false)} de la brecha) solo cuando la señal diaria confirma; cierre de acciones satélite que perforan su stop.</li>
          <li><b>Tamaño</b>: en acciones satélite, si toca el stop no pierdes más del ${rg.riesgo_por_operacion_pct}% del portafolio.</li>
        </ul>
        <h3>5. Riesgo y escenarios</h3>
        <p>Betas a S&P 500, tasa 10 años, oro y cobre estimadas por regresión con 3 años de retornos semanales. El impacto en CLP incluye el tipo de cambio. Las crisis reales usan los retornos efectivos de cada activo en esas fechas. El VaR usa simulación histórica de 2 años.</p>
        <h3>Actualizar los informes</h3>
        <p>En la terminal, desde la carpeta del proyecto: <code>python3 engine/motor.py</code> (o <code>./actualizar.sh</code>). Ideal: cada día hábil después de las 18:15 hora de Chile. Cada ejecución guarda el informe diario y el semanal en el archivo histórico (selector arriba a la derecha).</p>
        <h3>Límites</h3>
        <ul>
          <li>Las señales técnicas se equivocan con frecuencia; su valor está en la disciplina y el control de riesgo, no en predecir.</li>
          <li>No incluye resultados de empresas, noticias ni eventos de calendario: revísalos antes de operar acciones individuales.</li>
          <li>Verifica en Racional comisiones, spread cambiario e impuestos (en Chile las ganancias de capital y dividendos extranjeros se declaran).</li>
          <li>No es asesoría financiera.</li>
        </ul>
        ${R.meta.avisos.length ? `<h3>Avisos de esta ejecución</h3><ul>${R.meta.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      </div>`;
    },
  };

  // ------------------------------------------------------------------ render y eventos
  function renderTabs() {
    $("#tabs").innerHTML = Object.entries(TABS).map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${t.nombre}</button>`).join("");
  }
  function renderSelector() {
    const sel = $("#sel-informe");
    const o = [`<option value="latest">Último · ${fecha(window.__ULTIMO || R.meta.fecha_datos)}</option>`];
    if (IDX.diarios.length) o.push(`<optgroup label="Diarios">${IDX.diarios.map((d) => `<option value="diario-${d}">${fecha(d)}</option>`).join("")}</optgroup>`);
    if (IDX.semanales.length) o.push(`<optgroup label="Semanales">${IDX.semanales.map((d) => `<option value="semanal-${d}">Semana ${d}</option>`).join("")}</optgroup>`);
    sel.innerHTML = o.join("");
    sel.value = S.vista;
  }
  function render() {
    if (!TABS[S.tab]) S.tab = "resumen";
    renderTabs();
    $("#hdr-sub").textContent = `${R.meta.perfil} · datos al ${fecha(R.meta.fecha_datos)}${S.vista !== "latest" ? " (archivo)" : ""}`;
    const t = TABS[S.tab];
    $("#main").innerHTML = (S.vista !== "latest" ? `<div class="banner">${ICON.info} Estás viendo un informe archivado. Las órdenes se calculan con tus posiciones actuales y los precios de esa fecha.</div>` : "") + t.html();
    if (t.after) t.after();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab],[data-go],[data-ver],[data-filtro],[data-ord],[data-act],[data-preset],[data-hist],[data-modo]");
    if (!el) return;
    if (el.dataset.tab || el.dataset.go) {
      e.preventDefault();
      S.tab = el.dataset.tab || el.dataset.go; LS.set("inv.tab", S.tab); render(); window.scrollTo({ top: 0 }); return;
    }
    if (el.dataset.ver && !e.target.closest("button,input,select")) { S.activo = el.dataset.ver; LS.set("inv.activo", S.activo); S.tab = "activos"; render(); window.scrollTo({ top: 0 }); return; }
    if (el.dataset.filtro) { S.filtro = el.dataset.filtro; render(); return; }
    if (el.dataset.ord) { S.ordTipo = el.dataset.ord; render(); return; }
    if (el.dataset.modo) { S.esc.modo = el.dataset.modo; $$("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", b === el)); escCalcular(); return; }
    if (el.dataset.preset) {
      const p = R.escenarios.find((x) => x.id === el.dataset.preset);
      S.esc.preset = p.id; S.esc.f = { ...p.f }; render(); return;
    }
    if (el.dataset.hist) { S.esc.preset = "h:" + el.dataset.hist; render(); return; }
    if (el.dataset.act) {
      const card = el.closest(".order"); const key = card && card.dataset.key;
      if (el.dataset.act === "ver") { S.activo = el.dataset.t; S.tab = "activos"; render(); window.scrollTo({ top: 0 }); return; }
      if (!key) return;
      const [, tipo, t] = key.split("|");
      if (el.dataset.act === "ejecutar") {
        const o = ordenes(tipo).lista.find((x) => x.key === key);
        if (o) { registrarEjecucion(o); toast(`${o.monto > 0 ? "Compra" : "Venta"} de ${t} registrada. Posiciones actualizadas.`); }
      } else if (el.dataset.act === "descartar") { S.marcas[key] = "descartada"; LS.set("inv.ordenes.v1", S.marcas); }
      else if (el.dataset.act === "deshacer") { delete S.marcas[key]; LS.set("inv.ordenes.v1", S.marcas); toast("Marca eliminada (las posiciones no se revierten)."); }
      render();
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.f) {
      S.esc.f[el.dataset.f] = +el.value;
      const unit = el.dataset.f === "tasas_pb" ? " pb" : "%";
      $("#o-" + el.dataset.f).textContent = (el.value > 0 ? "+" : "") + el.value + unit;
      if (S.esc.preset !== "custom") { S.esc.preset = "custom"; $$("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", "false")); }
      escCalcular();
    }
    if (el.id === "sl-tol") { S.tol = +el.value; LS.set("inv.tol", S.tol); $("#o-tol").textContent = S.tol + "%"; escCalcular(); }
  });

  $("#btn-tema").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const nx = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nx); LS.set("inv.tema", nx); render();
  });

  function cargarScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src + "?v=" + Date.now(); s.onload = ok; s.onerror = fail; document.body.appendChild(s); });
  }
  $("#sel-informe").addEventListener("change", (e) => {
    const v = e.target.value;
    const src = v === "latest" ? "data/latest.js" : `data/archivo/${v}.js`;
    cargarScript(src).then(() => {
      R = window.__REPORTE; S.vista = v; indexar();
      if (v.startsWith("semanal")) S.tab = "semanal"; else if (v.startsWith("diario")) S.tab = "diario";
      render();
    }).catch(() => toast("No se pudo cargar ese informe."));
  });

  window.__ULTIMO = R.meta.fecha_datos;
  renderSelector();
  render();
})();
