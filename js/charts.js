/* charts.js — Gráficos SVG minimalistas */
const Charts = (() => {

  /* Sparkline: array de números → SVG path */
  function sparkline(data, width = 100, height = 30, color = 'currentColor') {
    if (!data.length) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1 || 1);
    const points = data.map((v, i) => [
      i * step,
      height - ((v - min) / range) * (height - 4) - 2
    ]);
    const path = points.map((p, i) =>
      (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)
    ).join(' ');
    const areaPath = path + ` L${width},${height} L0,${height} Z`;
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
        <defs>
          <linearGradient id="grad-${color.replace(/[^a-z0-9]/gi,'')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".3"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#grad-${color.replace(/[^a-z0-9]/gi,'')})"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  /* Barras horizontales */
  function bars(data, opts = {}) {
    const { width = 300, barHeight = 24, gap = 8, color = 'var(--accent-500)' } = opts;
    const max = Math.max(...data.map(d => d.value), 1);
    return data.map((d, i) => {
      const w = (d.value / max) * width;
      return `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:${gap}px">
          <div style="width:80px;font-size:.75rem;color:var(--text-muted);text-align:right;font-weight:500">${Utils.esc(d.label)}</div>
          <div style="flex:1;background:var(--surface-2);border-radius:6px;height:${barHeight}px;position:relative;overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:${w}px;background:linear-gradient(90deg,${color},${color}dd);border-radius:6px;transition:width .8s cubic-bezier(.16,1,.3,1);box-shadow:0 0 12px ${color}55"></div>
          </div>
          <div style="width:60px;font-size:.8rem;font-weight:700;color:var(--text);text-align:right;font-variant-numeric:tabular-nums">${Utils.num(d.value)}</div>
        </div>
      `;
    }).join('');
  }

  /* Donut chart */
  function donut(data, size = 160, thickness = 22) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const r = size / 2 - thickness / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const segments = data.map(d => {
      const len = (d.value / total) * c;
      const seg = `
        <circle cx="${size/2}" cy="${size/2}" r="${r}"
          fill="none" stroke="${d.color}" stroke-width="${thickness}"
          stroke-dasharray="${len} ${c - len}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${size/2} ${size/2})"
          style="transition:stroke-dasharray .8s"/>
      `;
      offset += len;
      return seg;
    }).join('');
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}"/>
        ${segments}
        <text x="50%" y="48%" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${total}</text>
        <text x="50%" y="62%" text-anchor="middle" font-size="10" fill="var(--text-muted)" letter-spacing="1">TOTAL</text>
      </svg>
    `;
  }

  /* Estado habitaciones por color */
  function estadoHabitaciones() {
    const habs = DB.get('habitaciones');
    const estados = {};
    habs.forEach(h => estados[h.estado] = (estados[h.estado] || 0) + 1);
    return estados;
  }

  return { sparkline, bars, donut, estadoHabitaciones };
})();
