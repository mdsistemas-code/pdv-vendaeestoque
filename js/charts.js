/* charts.js
   Gráficos desenhados em SVG pelo próprio sistema — não dependem de biblioteca externa. */

/* =========================================================
   Gráficos — desenhados em SVG pelo próprio sistema
   (não dependem de biblioteca externa, então sempre funcionam)
   ========================================================= */
const chartStore = {};
const _measureCtx = document.createElement('canvas').getContext('2d');
function textW(t, size, weight){
  _measureCtx.font = (weight || 400) + ' ' + size + 'px Inter, system-ui, sans-serif';
  return _measureCtx.measureText(String(t)).width;
}
function fitText(t, maxW, size, weight){
  t = String(t);
  if (maxW <= 12) return '';
  if (textW(t, size, weight) <= maxW) return t;
  while (t.length > 1 && textW(t + '…', size, weight) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
function compactMoney(v){
  const a = Math.abs(v);
  if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: a < 10 ? 2 : 0 });
}
function niceScale(max, count, integer){
  if (!(max > 0)) return integer ? { max: 4, step: 1 } : { max: 100, step: 25 };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  return { step, max: Math.ceil(max / step - 1e-9) * step };
}
function roundTopRect(x, y, w, h, r){
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function roundRightRect(x, y, w, h, r){
  r = Math.max(0, Math.min(r, h / 2, w));
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function itemAttrs(i, title, value){
  return `class="item" data-ci="${i}" data-tip-t="${esc(title)}" data-tip-v="${esc(value)}"`;
}

/* Barras verticais (ex.: faturamento por dia) */
function svgBar(W, H, c){
  const n = c.values.length;
  const money = c.money !== false;
  const sc = niceScale(Math.max(0, ...c.values), 4, !money);
  const ticks = [];
  for (let v = 0; v <= sc.max + 1e-9; v += sc.step) ticks.push(round2(v));
  const fmtTick = money ? compactMoney : (v => String(Math.round(v)));
  const padL = Math.ceil(Math.max(...ticks.map(v => textW(fmtTick(v), 11)))) + 12;
  const padR = 4, padT = c.showValues ? 22 : 10, padB = 24;
  const pw = Math.max(10, W - padL - padR), ph = Math.max(10, H - padT - padB);
  const band = pw / n;
  const bw = Math.max(3, Math.min(band * 0.64, 46));
  const y = v => padT + ph - (v / sc.max) * ph;
  const labelW = Math.max(...c.labels.map(l => textW(l, 11, 700))) + 10;
  const every = Math.max(1, Math.ceil(labelW / band));
  let s = '';
  ticks.forEach(v => {
    const yy = Math.round(y(v)) + 0.5;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="grid${v === 0 ? ' base' : ''}"/>`;
    s += `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" class="tick">${esc(fmtTick(v))}</text>`;
  });
  c.values.forEach((v, i) => {
    const x0 = padL + band * i, cx = x0 + band / 2;
    const hgt = v > 0 ? Math.max(2, padT + ph - y(v)) : 0;
    const tipT = c.tipLabels ? c.tipLabels[i] : c.labels[i];
    const tipV = c.tipValues ? c.tipValues[i] : (money ? fmt(v) : v + ' un.');
    s += `<g ${itemAttrs(i, tipT, tipV)}>`;
    s += `<rect x="${x0}" y="${padT}" width="${band}" height="${ph}" fill="transparent"/>`;
    if (hgt > 0) s += `<path class="bar" d="${roundTopRect(cx - bw / 2, padT + ph - hgt, bw, hgt, 4)}" fill="${c.colors ? c.colors[i] : c.color}"/>`;
    const vt = money ? compactMoney(v) : String(v);
    if (c.showValues && v > 0 && band >= textW(vt, 11.5, 600) + 4) {
      s += `<text x="${cx}" y="${padT + ph - hgt - 6}" text-anchor="middle" class="val">${esc(vt)}</text>`;
    }
    if (i % every === 0) s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="tick${c.strongLabel === i ? ' strong' : ''}">${esc(c.labels[i])}</text>`;
    s += '</g>';
  });
  return s;
}

/* Barras horizontais (ex.: ranking de produtos) */
function svgHBar(W, H, c){
  const n = c.values.length;
  const money = c.money !== false;
  const rowH = Math.min(36, (H - 6) / n);
  const barH = Math.max(8, Math.min(18, rowH * 0.58));
  const vals = c.values.map((v, i) => c.valueLabels ? c.valueLabels[i] : (money ? fmt(v) : v + ' un.'));
  const labelW = Math.min(W * 0.4, Math.max(...c.labels.map(l => textW(l, 12))) + 14);
  const valW = Math.max(...vals.map(t => textW(t, 11.5, 600))) + 12;
  const pw = Math.max(10, W - labelW - valW);
  const max = Math.max(...c.values, 0) || 1;
  let s = '';
  c.values.forEach((v, i) => {
    const y0 = 3 + i * rowH, cy = y0 + rowH / 2;
    const bwid = v > 0 ? Math.max(3, pw * v / max) : 0;
    s += `<g ${itemAttrs(i, c.labels[i], vals[i])}>`;
    s += `<rect x="0" y="${y0}" width="${W}" height="${rowH}" fill="transparent"/>`;
    s += `<text x="0" y="${cy + 4}" class="lbl">${esc(fitText(c.labels[i], labelW - 14, 12))}</text>`;
    if (bwid) s += `<path class="bar" d="${roundRightRect(labelW, cy - barH / 2, bwid, barH, 4)}" fill="${c.colors ? c.colors[i] : c.color}"/>`;
    s += `<text x="${labelW + bwid + 8}" y="${cy + 4}" class="val">${esc(vals[i])}</text>`;
    s += '</g>';
  });
  return s;
}

/* Rosca com legenda (ex.: formas de pagamento) */
function svgDonut(W, H, c){
  const money = c.money !== false;
  const total = c.values.reduce((a, b) => a + b, 0) || 1;
  const n = c.values.length;
  const wide = W >= 380;
  const size = wide ? Math.min(H - 16, W * 0.42, 220) : Math.min(W - 40, 180);
  const r = size / 2, ri = r * 0.64;
  const cx = wide ? r + 6 : W / 2, cy = wide ? H / 2 : r + 6;
  const pt = (rad, ang) => (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2);
  const tip = i => (money ? fmt(c.values[i]) : String(c.values[i])) + ' — ' + Math.round(c.values[i] / total * 100) + '% do total';
  let s = '', a0 = -Math.PI / 2;
  c.values.forEach((v, i) => {
    if (v <= 0) return;
    const frac = v / total;
    const a1 = a0 + frac * 2 * Math.PI;
    s += `<g ${itemAttrs(i, c.labels[i], tip(i))}>`;
    if (frac >= 0.9999) {
      s += `<circle class="slice" cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${c.colors[i]}" stroke-width="${r - ri}"/>`;
    } else {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      s += `<path class="slice" d="M${pt(r, a0)}A${r},${r} 0 ${large} 1 ${pt(r, a1)}L${pt(ri, a1)}A${ri},${ri} 0 ${large} 0 ${pt(ri, a0)}Z" fill="${c.colors[i]}" stroke="#fff" stroke-width="2"/>`;
    }
    s += '</g>';
    a0 = a1;
  });
  s += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" class="center-v">${esc(money ? compactMoney(total) : String(total))}</text>`;
  s += `<text x="${cx}" y="${cy + 19}" text-anchor="middle" class="tick">${esc(c.centerLabel || 'total')}</text>`;

  const rowH = 26;
  const lx = wide ? cx + r + 26 : 8;
  const lw = wide ? W - lx : W - 16;
  let ly = wide ? Math.max(4, H / 2 - (n * rowH) / 2) : size + 20;
  c.values.forEach((v, i) => {
    const valT = money ? fmt(v) : String(v);
    const pct = Math.round(v / total * 100) + '%';
    const rightW = textW(valT, 12, 600) + textW(pct, 11.5) + 18;
    const my = ly + rowH / 2;
    s += `<g ${itemAttrs(i, c.labels[i], tip(i))}>`;
    s += `<rect x="${lx - 4}" y="${ly}" width="${lw + 4}" height="${rowH}" fill="transparent"/>`;
    s += `<circle class="slice" cx="${lx + 5}" cy="${my}" r="5" fill="${c.colors[i]}"/>`;
    s += `<text x="${lx + 17}" y="${my + 4}" class="lbl">${esc(fitText(c.labels[i], lw - 17 - rightW - 6, 12))}</text>`;
    s += `<text x="${lx + lw}" y="${my + 4}" text-anchor="end" class="lbl"><tspan class="strong">${esc(valT)}</tspan><tspan class="soft" dx="8">${pct}</tspan></text>`;
    s += '</g>';
    ly += rowH;
  });
  return { svg: s, height: wide ? H : Math.ceil(ly + 6) };
}

function drawChart(id){
  const st = chartStore[id];
  const el = document.getElementById(id);
  if (!st || !el) return;
  const W = Math.floor(el.clientWidth);
  st.lastW = W;
  if (!W) return;
  if (st.empty) { el.innerHTML = ''; return; }
  const box = el.parentElement;
  let H, inner;
  if (st.kind === 'donut') {
    box.style.height = '';
    H = box.clientHeight || 260;
    const res = svgDonut(W, H, st.cfg);
    inner = res.svg;
    if (res.height > H) { box.style.height = res.height + 'px'; H = res.height; }
  } else {
    H = el.clientHeight || 260;
    inner = st.kind === 'hbar' ? svgHBar(W, H, st.cfg) : svgBar(W, H, st.cfg);
  }
  el.classList.toggle('clickable', typeof st.cfg.onClick === 'function');
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(st.cfg.aria || '')}">${inner}</svg>`;
}

const chartRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => {
  entries.forEach(en => {
    const id = en.target.id;
    const st = chartStore[id];
    if (st && Math.floor(en.contentRect.width) !== st.lastW) requestAnimationFrame(() => drawChart(id));
  });
}) : null;
if (!chartRO) window.addEventListener('resize', () => Object.keys(chartStore).forEach(drawChart));

/* Atualiza um gráfico só quando os dados mudam (ou o tamanho da tela) */
function setChart(id, kind, cfg, isEmpty){
  const el = document.getElementById(id);
  if (!el) return;
  const emptyEl = document.getElementById(id + 'Empty');
  if (emptyEl) emptyEl.style.display = isEmpty ? 'flex' : 'none';
  const sig = kind + '|' + (isEmpty ? 'empty' : JSON.stringify(cfg));
  const st = chartStore[id];
  if (!st && chartRO) chartRO.observe(el);
  if (st && st.sig === sig) {
    st.cfg = cfg;
    if (st.lastW !== Math.floor(el.clientWidth)) drawChart(id);
    return;
  }
  chartStore[id] = { kind, cfg, sig, empty: !!isEmpty, lastW: -1 };
  drawChart(id);
}

/* Tooltip ao passar o mouse e clique para detalhar */
const chartTip = document.getElementById('chartTip');
function hideChartTip(){ chartTip.style.display = 'none'; }
document.addEventListener('mousemove', e => {
  const it = e.target && e.target.closest ? e.target.closest('.svg-chart .item') : null;
  if (!it) { if (chartTip.style.display !== 'none') hideChartTip(); return; }
  const host = it.closest('.svg-chart');
  const st = chartStore[host.id];
  chartTip.innerHTML = '';
  const b = document.createElement('b'); b.textContent = it.getAttribute('data-tip-t');
  const v = document.createElement('span'); v.textContent = it.getAttribute('data-tip-v');
  chartTip.append(b, v);
  if (st && typeof st.cfg.onClick === 'function' && st.cfg.clickHint) {
    const sm = document.createElement('small'); sm.textContent = st.cfg.clickHint; chartTip.append(sm);
  }
  chartTip.style.display = 'block';
  const tw = chartTip.offsetWidth, th = chartTip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - th - 12;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 14;
  if (y < 8) y = e.clientY + 18;
  chartTip.style.left = Math.max(8, x) + 'px';
  chartTip.style.top = y + 'px';
});
document.addEventListener('scroll', hideChartTip, true);

function openVendasFiltered(o){
  ui.vendasPeriod = o.period || ui.vendasPeriod;
  ui.vendasMethod = o.method || 'todas';
  ui.vendasSearch = o.search || '';
  ui.vendasLimit = 50;
  $('#vendasMethod').value = ui.vendasMethod;
  $('#vendasSearch').value = ui.vendasSearch;
  goTo('vendas');
}
function openCaixaDay(key){ ui.caixaDate = key; goTo('caixa'); }

/* =========================================================
   Agregações usadas pelos gráficos
   ========================================================= */
function aggregateProducts(sales){
  const map = new Map();
  sales.forEach(s => (s.items || []).forEach(it => {
    const key = it.productId || it.name;
    const p = getProduct(it.productId);
    let e = map.get(key);
    if (!e) { e = { name: p ? p.name : it.name, category: it.category || (p && p.category) || 'Outros', qty: 0, revenue: 0, profit: 0 }; map.set(key, e); }
    e.qty += it.qty;
    e.revenue += itemNet(it);
    e.profit += (it.price - itemCost(it)) * it.qty - (it.discount || 0);
  }));
  return [...map.values()].map(e => Object.assign(e, { revenue: round2(e.revenue), profit: round2(e.profit) })).sort((a, b) => b.revenue - a.revenue);
}

function capitalize(t){ return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

function timeBuckets(sales, range){
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today0); tomorrow.setDate(tomorrow.getDate() + 1);
  let start, end;
  if (range) {
    start = new Date(range.start);
    end = new Date(Math.min(range.end.getTime(), Math.max(tomorrow.getTime(), range.start.getTime() + 86400000)));
  } else {
    if (sales.length) { start = new Date(Math.min(...sales.map(s => new Date(s.date).getTime()))); start.setHours(0, 0, 0, 0); }
    else { start = new Date(today0); start.setDate(start.getDate() - 6); }
    end = tomorrow;
  }
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const out = { labels: [], values: [], counts: [], keys: [], tipLabels: [], unit: 'dia' };

  if (days <= 1) {
    const tot = new Array(24).fill(0), cnt = new Array(24).fill(0);
    sales.forEach(s => { const hr = new Date(s.date).getHours(); tot[hr] += s.total; cnt[hr]++; });
    let first = tot.findIndex(v => v > 0);
    let last = 23 - [...tot].reverse().findIndex(v => v > 0);
    if (first < 0) { first = 8; last = 20; }
    first = Math.min(first, 8); last = Math.max(last, 20);
    for (let h = first; h <= last; h++) {
      out.labels.push(pad2(h) + 'h'); out.values.push(round2(tot[h])); out.counts.push(cnt[h]);
      out.keys.push(dayKey(start)); out.tipLabels.push(pad2(h) + ':00 às ' + pad2(h) + ':59');
    }
    out.unit = 'hora';
    return out;
  }
  if (days <= 62) {
    const tot = {}, cnt = {};
    sales.forEach(s => { const k = dayKey(new Date(s.date)); tot[k] = (tot[k] || 0) + s.total; cnt[k] = (cnt[k] || 0) + 1; });
    for (let i = 0; i < days; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = dayKey(d);
      out.labels.push(pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1));
      out.values.push(round2(tot[k] || 0)); out.counts.push(cnt[k] || 0); out.keys.push(k);
      out.tipLabels.push(capitalize(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })));
    }
    out.unit = 'dia';
    return out;
  }
  const tot = {}, cnt = {};
  sales.forEach(s => { const d = new Date(s.date); const k = d.getFullYear() + '-' + d.getMonth(); tot[k] = (tot[k] || 0) + s.total; cnt[k] = (cnt[k] || 0) + 1; });
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur < end) {
    const k = cur.getFullYear() + '-' + cur.getMonth();
    out.labels.push(cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''));
    out.values.push(round2(tot[k] || 0)); out.counts.push(cnt[k] || 0); out.keys.push(null);
    out.tipLabels.push(capitalize(cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })));
    cur.setMonth(cur.getMonth() + 1);
  }
  out.unit = 'mês';
  return out;
}

function methodTotals(sales){
  const m = {};
  sales.forEach(s => { const k = methodKey(s); m[k] = round2((m[k] || 0) + s.total); });
  const keys = Object.keys(m).filter(k => m[k] > 0).sort((a, b) => m[b] - m[a]);
  return { keys, values: keys.map(k => m[k]) };
}
