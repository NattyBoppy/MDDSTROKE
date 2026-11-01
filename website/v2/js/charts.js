/*
  charts.js: small live line charts on a <canvas> (no chart library, so it stays light).
  -------------------------------------------------------------------------------------
  Each chart shows the last 30 seconds. Colours come from the CSS variables in style.css,
  so changing the theme there changes the charts too.

    const c = new LiveChart(canvas, { series:[{ key:'index', label:'Index', color:'--c-index' }], min:0, max:100, unit:'%' });
    c.push(performance.now(), { index: 42 });
    c.draw(performance.now());
*/

export class LiveChart {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.series = opts.series;              // [{ key, label, color: '--css-variable', dashed? }]
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.auto = !!opts.auto;                // let the top of the chart grow with the data
    this.autoRange = !!opts.autoRange;      // fit both the top and the bottom to the data (serial plotter)
    this.unit = opts.unit || '';
    this.ticks = opts.ticks || 3;
    this.windowMs = opts.windowMs || 30000;
    this.points = [];                       // { t, values:{key:number|null}, on:boolean }
    this.threshold = null;                  // optional dashed line (EMG threshold)
    this.markerKey = opts.markerKey || null; // which flag draws the shaded "ON" bands
  }

  push(t, values, on = false) {
    this.points.push({ t, values: { ...values }, on });
    const cut = t - this.windowMs - 1000;
    while (this.points.length && this.points[0].t < cut) this.points.shift();
  }

  clear() { this.points = []; }

  draw(now) {
    const { canvas, ctx } = this;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;                   // hidden (e.g. a closed panel): nothing to do
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(canvas);
    const color = v => css.getPropertyValue(v).trim() || '#888';

    // vertical range
    let lo = this.min, hi = this.max;
    if (this.auto) {
      for (const p of this.points) for (const s of this.series) {
        const v = p.values[s.key];
        if (v != null && v > hi) hi = v;
      }
      if (this.threshold != null && this.threshold > hi) hi = this.threshold;
      hi = niceCeil(hi * 1.1);
    }
    if (this.autoRange) {
      let mn = Infinity, mx = -Infinity;
      for (const p of this.points) {
        if (now - p.t > this.windowMs) continue;
        for (const s of this.series) {
          const v = p.values[s.key];
          if (v == null) continue;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
      if (mx - mn < 1e-6) { mn -= 1; mx += 1; }
      const pad = (mx - mn) * 0.08;
      lo = mn - pad; hi = mx + pad;
    }
    const pad = { l: 46, r: 8, t: 8, b: 18 };
    const X = t => pad.l + (1 - (now - t) / this.windowMs) * (w - pad.l - pad.r);
    const Y = v => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);

    // grid + labels
    ctx.font = '11px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.strokeStyle = color('--chart-grid');
    ctx.fillStyle = color('--muted');
    for (let i = 0; i <= this.ticks; i++) {
      const v = lo + (hi - lo) * (i / this.ticks);
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(tickText(v, hi - lo) + this.unit, 2, y + 4);
    }
    ctx.fillText(`−${Math.round(this.windowMs / 1000)} s`, pad.l, h - 4);
    ctx.textAlign = 'right'; ctx.fillText('now', w - pad.r, h - 4); ctx.textAlign = 'left';

    // shaded bands where the marker flag was on (EMG trigger ON)
    if (this.markerKey) {
      ctx.fillStyle = color('--chart-on');
      let start = null;
      this.points.forEach((p, i) => {
        if (p.on && start === null) start = p.t;
        const last = i === this.points.length - 1;
        if (start !== null && (!p.on || last)) {
          const x0 = Math.max(pad.l, X(start)), x1 = X(p.t);
          if (x1 > pad.l) ctx.fillRect(x0, pad.t, Math.max(2, x1 - x0), h - pad.t - pad.b);
          start = null;
        }
      });
    }

    // threshold line
    if (this.threshold != null) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color('--danger');
      const y = Y(this.threshold);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.restore();
    }

    // the data lines
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, 0, w - pad.l - pad.r, h); ctx.clip();
    for (const s of this.series) {
      ctx.strokeStyle = color(s.color);
      ctx.setLineDash(s.dashed ? [4, 3] : []);
      ctx.beginPath();
      let pen = false;
      for (const p of this.points) {
        const v = p.values[s.key];
        if (v == null) { pen = false; continue; }      // gap where there was no data
        const x = X(p.t), y = Y(Math.min(hi, Math.max(lo, v)));
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// tick labels: whole numbers for big ranges, decimals for small ones
function tickText(v, range) {
  if (range >= 20) return String(Math.round(v));
  if (range >= 2) return v.toFixed(1);
  return v.toFixed(2);
}

function niceCeil(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
