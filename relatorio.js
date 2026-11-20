/* screens/relatorio.js
   Tela Relatório: faturamento, lucro, gráficos e desempenho por produto. */

/* =========================================================
   RELATÓRIO
   ========================================================= */
function reportData(){
  const r = periodRange(ui.reportPeriod);
  // Faturamento, lucro, gráficos e produtos: venda fiado só conta quando é recebida
  const entries = revenueEntries(r);
  const fat = sumBy(entries, e => e.total);
  const lucro = sumBy(entries, e => e.profit);
  const fiadoRecebido = sumBy(entries.filter(e => e.kind === 'fiado'), e => e.total);
  const prods = aggregateProducts(entries);
  const cats = {};
  prods.forEach(p => { cats[p.category] = round2((cats[p.category] || 0) + p.revenue); });
  // Nº de vendas, ticket médio e descontos: vendas feitas no período (à vista e fiado)
  const fs = state.sales.filter(s => isActive(s) && inRange(s.date, r));
  return { r, entries, fs, fat, lucro, fiadoRecebido, prods, cats, descontos: sumBy(fs, s => s.discount || 0) };
}

function renderRelatorio(){
  renderChips('#reportPeriodChips', PERIODS, ui.reportPeriod, v => { ui.reportPeriod = v; renderRelatorio(); });
  const d = reportData();
  setText('kpiTotal', fmt(d.fat));
  setText('kpiTotalSub', d.fiadoRecebido > 0 ? 'Inclui ' + fmt(d.fiadoRecebido) + ' de fiado recebido' : 'Fiado entra quando é recebido');
  setText('kpiLucro', fmt(d.lucro));
  setText('kpiMargem', d.fat > 0 ? Math.round(d.lucro / d.fat * 100) + '%' : '—');
  const nFiado = d.fs.filter(s => s.type === 'fiado').length;
  setText('kpiCount', String(d.fs.length));
  setText('kpiCountSub', nFiado ? 'Inclui ' + nFiado + ' no fiado' : '');
  setText('kpiAvg', fmt(d.fs.length ? sumBy(d.fs, s => s.total) / d.fs.length : 0));
  setText('kpiDesc', fmt(d.descontos));
  const gastos = sumBy(paidExpensesIn(d.r), e => e.amount);
  const liquido = round2(d.lucro - gastos);
  setText('kpiGastos', fmt(gastos));
  setText('kpiLiquido', fmt(liquido));
  $('#kpiLiquido').style.color = liquido < 0 ? 'var(--rust)' : '';

  $('#reportTableWrap').style.display = d.prods.length ? '' : 'none';
  $('#reportEmpty').style.display = d.prods.length ? 'none' : 'block';
  $('#reportBody').innerHTML = d.prods.map(p => {
    const costTotal = p.revenue - p.profit;
    // Vendido como: uma linha por forma (grade, meia grade, unidade); com mais de uma, mostra o faturamento de cada
    const several = p.forms.length > 1;
    const sold = p.forms.map(f => '<div class="sold-form">' + esc(formSoldText(f)) + (several ? ' <span class="muted">· ' + fmt(f.revenue) + '</span>' : '') + '</div>').join('');
    return `<tr>
      <td>${esc(p.name)}</td><td class="muted">${esc(p.category)}</td>
      <td class="sold-as"><div class="sold-list">${sold}</div></td>
      <td class="num">${fmtQty(p.qty)}</td><td class="num">${fmt(p.revenue)}</td>
      <td class="num ${p.profit >= 0 ? 'pos' : 'neg'}">${fmt(p.profit)}</td>
      <td class="num">${costTotal > 0 ? Math.round(p.profit / costTotal * 100) + '%' : '—'}</td>
    </tr>`;
  }).join('');
  $('#reportFoot').innerHTML = d.prods.length ? `<tr><td colspan="3">Total (antes do desconto geral)</td><td class="num">${fmtQty(d.prods.reduce((a, p) => a + p.qty, 0))}</td><td class="num">${fmt(sumBy(d.prods, p => p.revenue))}</td><td class="num">${fmt(sumBy(d.prods, p => p.profit))}</td><td></td></tr>` : '';

  renderReportCharts(d);
}

function renderReportCharts(d){
  const b = timeBuckets(d.entries, d.r);
  const clickDay = b.unit === 'dia';
  $('#chartDailyTitle').innerHTML = 'Faturamento por ' + b.unit + (clickDay ? ' <span>(clique num dia para abrir o caixa)</span>' : '');
  setChart('chartDaily', 'bar', {
    labels: b.labels,
    values: b.values,
    tipLabels: b.tipLabels,
    tipValues: b.values.map((v, i) => bucketTip(b, i)),
    color: '#C8872E',
    showValues: b.labels.length <= 12,
    aria: 'Faturamento por ' + b.unit,
    clickHint: clickDay ? 'Clique para abrir o caixa deste dia' : (b.unit === 'hora' ? 'Clique para ver as vendas de hoje' : ''),
    onClick: clickDay ? (i => openCaixaDay(b.keys[i])) : (b.unit === 'hora' ? (() => openVendasFiltered({ period: 'hoje' })) : null)
  }, d.entries.length === 0);

  const mt = methodTotals(d.entries);
  setChart('chartMethods', 'donut', {
    labels: mt.keys.map(revenueMethodLabel),
    values: mt.values,
    colors: mt.keys.map(k => METHOD_COLORS[k] || '#A4AEA8'),
    centerLabel: 'no período',
    aria: 'Formas de pagamento',
    clickHint: 'Clique para ver essas vendas',
    onClick: i => openRevenueMethod(mt.keys[i], ui.reportPeriod)
  }, mt.keys.length === 0);

  const topQty = [...d.prods].sort((a, b2) => b2.qty - a.qty).slice(0, 8);
  setChart('chartTopProducts', 'hbar', {
    labels: topQty.map(p => p.name),
    values: topQty.map(p => p.qty),
    valueLabels: topQty.map(p => fmtQty(p.qty) + ' un. · ' + fmt(p.revenue)),
    money: false,
    color: '#3F8A63',
    aria: 'Produtos mais vendidos',
    clickHint: 'Clique para ver as vendas deste produto',
    onClick: i => openVendasFiltered({ period: ui.reportPeriod, search: topQty[i].name })
  }, topQty.length === 0);

  let cKeys = Object.keys(d.cats).filter(k => d.cats[k] > 0).sort((a, b2) => d.cats[b2] - d.cats[a]);
  let cVals = cKeys.map(k => d.cats[k]);
  if (cKeys.length > 7) {
    const rest = round2(cVals.slice(6).reduce((a, v) => a + v, 0));
    cKeys = cKeys.slice(0, 6).concat(['Outras categorias']);
    cVals = cVals.slice(0, 6).concat([rest]);
  }
  setChart('chartCategories', 'donut', {
    labels: cKeys,
    values: cVals,
    colors: cKeys.map((k, i) => CAT_PALETTE[i % CAT_PALETTE.length]),
    centerLabel: 'no período',
    aria: 'Faturamento por categoria',
    clickHint: 'Clique para ver os produtos da categoria',
    onClick: i => { if (cKeys[i] === 'Outras categorias') return; ui.prodCat = cKeys[i]; ui.prodSearch = ''; $('#prodSearch').value = ''; goTo('produtos'); }
  }, cKeys.length === 0);
}

/* ---------- Eventos da tela ---------- */
$('#btnExportRelatorio').addEventListener('click', exportRelatorio);
