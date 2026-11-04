/* Gráficos SVG livianos, sin dependencias. Colores vía tokens CSS. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function niceTicks(min, max, n = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function observe(el, draw) {
    let raf = 0, lastW = 0;
    const run = () => { const w = el.clientWidth; if (w && w !== lastW) { lastW = w; draw(w); } };
    run();
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
      ro.observe(el);
    }
  }

  function legendHTML(series, kind = "line") {
    if (series.length < 2) return "";
    return `<div class="legend">${series.map((s) => `<span><i class="${kind === "sq" ? "sq" : ""}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  }

  /** Gráfico de líneas con crosshair y tooltip. */
  function line(el, opt) {
    const H = opt.height || 260;
    const yfmt = opt.yfmt || ((v) => v.toLocaleString("es-CL"));
    const tfmt = opt.tfmt || yfmt;
    const labels = opt.labels;
    const series = opt.series;
    el.innerHTML = legendHTML(series) + `<div class="chart" style="height:${H}px"></div>`;
    const box = el.querySelector(".chart");
    const tip = document.createElement("div");
    tip.className = "tip";

    observe(box, (W) => {
      const endL = opt.endLabels && series.length <= 4;
      const m = { l: opt.ml || 52, r: endL ? 64 : 12, t: 10, b: 24 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      let vals = [];
      series.forEach((s) => s.values.forEach((v) => v != null && vals.push(v)));
      (opt.bands || []).forEach((b) => { b.lo.forEach((v) => v != null && vals.push(v)); b.hi.forEach((v) => v != null && vals.push(v)); });
      (opt.refLines || []).forEach((r) => vals.push(r.y));
      let min = Math.min(...vals), max = Math.max(...vals);
      if (opt.yDomain) [min, max] = opt.yDomain;
      const ticks = opt.yDomain ? opt.yTicks || niceTicks(min, max, 4) : niceTicks(min, max, 4);
      const y0 = ticks[0], y1 = ticks[ticks.length - 1];
      const n = labels.length;
      const X = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

      let g = "";
      ticks.forEach((t) => {
        g += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}" style="stroke:var(--grid)" stroke-width="1"/>`;
        g += `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yfmt(t))}</text>`;
      });
      (opt.refLines || []).forEach((r) => {
        g += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(r.y)}" y2="${Y(r.y)}" style="stroke:var(--axis)" stroke-width="1"/>`;
        if (r.label) g += `<text x="${m.l + iw - 4}" y="${Y(r.y) - 4}" text-anchor="end">${esc(r.label)}</text>`;
      });
      const nx = Math.max(2, Math.min(6, Math.floor(iw / 110)));
      for (let k = 0; k < nx; k++) {
        const i = Math.round((k / (nx - 1)) * (n - 1));
        const anchor = k === 0 ? "start" : k === nx - 1 ? "end" : "middle";
        g += `<text x="${X(i)}" y="${H - 6}" text-anchor="${anchor}">${esc(opt.xfmt ? opt.xfmt(labels[i]) : labels[i])}</text>`;
      }
      (opt.bands || []).forEach((b) => {
        let up = "", dn = "";
        b.hi.forEach((v, i) => { if (v != null) up += (up ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); });
        for (let i = b.lo.length - 1; i >= 0; i--) if (b.lo[i] != null) dn += "L" + X(i).toFixed(1) + "," + Y(b.lo[i]).toFixed(1);
        g += `<path d="${up}${dn}Z" style="fill:${b.color};opacity:${b.opacity || 0.12}"/>`;
      });
      series.forEach((s) => {
        let d = "", pen = false;
        s.values.forEach((v, i) => {
          if (v == null) { pen = false; return; }
          d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1);
          pen = true;
        });
        if (s.area) {
          const first = s.values.findIndex((v) => v != null);
          g += `<path d="${d}L${X(n - 1)},${Y(y0)}L${X(first)},${Y(y0)}Z" style="fill:${s.color};opacity:.10"/>`;
        }
        g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      });
      // etiquetas finales
      if (endL) {
        const ends = series.map((s) => {
          let i = s.values.length - 1;
          while (i >= 0 && s.values[i] == null) i--;
          return { s, i, y: i >= 0 ? Y(s.values[i]) : null };
        }).filter((e) => e.y != null);
        ends.sort((a, b) => a.y - b.y);
        for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].ly = ends[k - 1].ly + 14;
        ends.forEach((e) => { e.ly = e.ly || e.y; });
        for (let k = 1; k < ends.length; k++) if (ends[k].ly - ends[k - 1].ly < 14) ends[k].ly = ends[k - 1].ly + 14;
        ends.forEach((e) => {
          g += `<circle cx="${X(e.i)}" cy="${e.y}" r="4" style="fill:${e.s.color};stroke:var(--surface)" stroke-width="2"/>`;
          if (Math.abs(e.ly - e.y) > 2) g += `<line x1="${X(e.i) + 5}" x2="${X(e.i) + 10}" y1="${e.y}" y2="${e.ly}" style="stroke:var(--axis)"/>`;
          g += `<text class="lbl" x="${X(e.i) + 12}" y="${e.ly + 4}">${esc(yfmt(e.s.values[e.i]))}</text>`;
        });
      }
      g += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--axis);display:none" stroke-width="1"/>`;
      g += `<g class="hd"></g>`;
      g += `<rect class="ov" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
      box.innerHTML = `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "gráfico")}">${g}</svg>`;
      box.appendChild(tip);
      const svg = box.querySelector("svg"), xh = svg.querySelector(".xh"), hd = svg.querySelector(".hd"), ov = svg.querySelector(".ov");
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
        xh.setAttribute("x1", X(i)); xh.setAttribute("x2", X(i)); xh.style.display = "";
        hd.innerHTML = series.map((s) => s.values[i] == null ? "" : `<circle cx="${X(i)}" cy="${Y(s.values[i])}" r="4" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`).join("");
        tip.innerHTML = `<div class="t">${esc(opt.xfmtLong ? opt.xfmtLong(labels[i]) : labels[i])}</div>` +
          series.map((s) => `<div class="r"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><b>${s.values[i] == null ? "–" : esc(tfmt(s.values[i]))}</b></div>`).join("") + (opt.tipExtra ? opt.tipExtra(i) : "");
        tip.style.display = "block";
        const tw = tip.offsetWidth;
        let left = X(i) + 14;
        if (left + tw > W) left = X(i) - tw - 14;
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = m.t + "px";
      };
      const leave = () => { xh.style.display = "none"; hd.innerHTML = ""; tip.style.display = "none"; };
      ov.addEventListener("mousemove", move);
      ov.addEventListener("touchmove", move, { passive: true });
      ov.addEventListener("mouseleave", leave);
      ov.addEventListener("touchend", leave);
    });
  }

  /** Barras horizontales divergentes (positivo / negativo) con tooltip. */
  function hbars(el, rows, opt = {}) {
    const fmt = opt.fmt || ((v) => v.toFixed(1));
    const rowH = opt.rowH || 28;
    const H = rows.length * rowH + 8;
    el.innerHTML = `<div class="chart" style="height:${H}px"></div>`;
    const box = el.querySelector(".chart");
    const tip = document.createElement("div");
    tip.className = "tip";
    observe(box, (W) => {
      const lw = opt.labelW || Math.min(150, W * 0.32);
      const valW = 76;
      const iw = Math.max(40, W - lw - valW * 2);
      const mx = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
      const hasNeg = rows.some((r) => r.value < 0), hasPos = rows.some((r) => r.value > 0);
      const cx = hasNeg && hasPos ? lw + valW + iw / 2 : hasNeg ? lw + valW + iw : lw + valW;
      const half = hasNeg && hasPos ? iw / 2 : iw;
      let g = "";
      rows.forEach((r, k) => {
        const yc = 4 + k * rowH + rowH / 2;
        const bh = Math.min(14, rowH - 10);
        const len = (Math.abs(r.value) / mx) * half;
        const col = r.color || (r.value >= 0 ? "var(--pos)" : "var(--neg)");
        g += `<text class="lbl" x="0" y="${yc + 4}">${esc(r.label)}</text>`;
        if (len > 0.5) {
          const rad = Math.min(4, len);
          const y = yc - bh / 2;
          const d = r.value >= 0
            ? `M${cx},${y}H${cx + len - rad}Q${cx + len},${y} ${cx + len},${y + rad}V${y + bh - rad}Q${cx + len},${y + bh} ${cx + len - rad},${y + bh}H${cx}Z`
            : `M${cx},${y}H${cx - len + rad}Q${cx - len},${y} ${cx - len},${y + rad}V${y + bh - rad}Q${cx - len},${y + bh} ${cx - len + rad},${y + bh}H${cx}Z`;
          g += `<path d="${d}" style="fill:${col}"/>`;
        }
        const tx = r.value >= 0 ? cx + len + 6 : cx - len - 6;
        g += `<text class="lbl" x="${tx}" y="${yc + 4}" text-anchor="${r.value >= 0 ? "start" : "end"}">${esc(fmt(r.value))}</text>`;
        g += `<rect class="hit" data-k="${k}" x="0" y="${yc - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>`;
      });
      g = `<line x1="${cx}" x2="${cx}" y1="2" y2="${H - 2}" style="stroke:var(--axis)" stroke-width="1"/>` + g;
      box.innerHTML = `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || "barras")}">${g}</svg>`;
      box.appendChild(tip);
      box.querySelectorAll(".hit").forEach((h) => {
        h.addEventListener("mousemove", (ev) => {
          const r = rows[+h.dataset.k];
          tip.innerHTML = `<div class="t">${esc(r.label)}</div>` + (r.tip || `<div class="r"><span>Valor</span><b>${esc(fmt(r.value))}</b></div>`);
          tip.style.display = "block";
          const bb = box.getBoundingClientRect();
          let left = ev.clientX - bb.left + 14;
          if (left + tip.offsetWidth > W) left = ev.clientX - bb.left - tip.offsetWidth - 14;
          tip.style.left = Math.max(0, left) + "px";
          tip.style.top = Math.max(0, ev.clientY - bb.top - 10) + "px";
        });
        h.addEventListener("mouseleave", () => { tip.style.display = "none"; });
      });
    });
  }

  /** Sparkline como string SVG. */
  function spark(values, opt = {}) {
    const w = opt.w || 140, h = opt.h || 28;
    const v = values.filter((x) => x != null);
    if (v.length < 2) return "";
    const mn = Math.min(...v), mx = Math.max(...v);
    const X = (i) => (i / (values.length - 1)) * (w - 6) + 1;
    const Y = (x) => h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 6);
    let d = "", pen = false;
    values.forEach((x, i) => { if (x == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(x).toFixed(1); pen = true; });
    const li = values.length - 1;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" style="stroke:var(--axis)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${X(li)}" cy="${Y(values[li])}" r="3" style="fill:${opt.color || "var(--accent)"}"/></svg>`;
  }

  /** Barra de rango (p5–p95, p25–p75 y punto central) como string SVG, en una escala común [mn, mx]. */
  function rango(p, mn, mx, opt = {}) {
    const w = opt.w || 150, h = 16;
    const X = (v) => 4 + ((Math.max(mn, Math.min(mx, v)) - mn) / (mx - mn || 1)) * (w - 8);
    const col = p.p50 >= 0 ? "var(--pos)" : "var(--neg)";
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" class="rango">
      <line x1="${X(0)}" x2="${X(0)}" y1="1" y2="${h - 1}" style="stroke:var(--axis)"/>
      <line x1="${X(p.p5)}" x2="${X(p.p95)}" y1="${h / 2}" y2="${h / 2}" style="stroke:var(--axis)" stroke-width="2" stroke-linecap="round"/>
      <line x1="${X(p.p25)}" x2="${X(p.p75)}" y1="${h / 2}" y2="${h / 2}" style="stroke:${col};opacity:.45" stroke-width="6" stroke-linecap="round"/>
      <circle cx="${X(p.p50)}" cy="${h / 2}" r="4" style="fill:${col};stroke:var(--surface)" stroke-width="2"/></svg>`;
  }

  window.Charts = { line, hbars, spark, legendHTML, niceTicks, rango };
})();
