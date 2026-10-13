/* screens/inicio.js
   Tela Início: resumo do dia e do mês, estoque para repor, últimas vendas e gráficos. */

/* =========================================================
   INÍCIO
   ========================================================= */
function renderInicio(){
  const now = new Date();
  const today = dayKey(now);
  const active = state.sales.filter(isActive);
  const todaySales = active.filter(s => dayKey(new Date(s.date)) === today);
  const monthSales = active.filter(s => inRange(s.date, periodRange('mes')));
  const fatHoje = sumBy(todaySales, s => s.total);
  const fatMes = sumBy(monthSales, s => s.total);
  const lucroMes = sumBy(monthSales, saleProfit);
  const debtors = new Set(openFiadoSales().map(s => s.customerId)).size;

  setText('statHoje', fmt(fatHoje));
  setText('statHojeSub', plural(todaySales.length, 'venda', 'vendas'));
  setText('statFaturado', fmt(fatMes));
  setText('statFaturadoSub', plural(monthSales.length, 'venda', 'vendas') + ' em ' + now.toLocaleDateString('pt-BR', { month: 'long' }));
  setText('statLucro', fmt(lucroMes));
  setText('statLucroSub', fatMes > 0 ? 'Margem de ' + Math.round(lucroMes / fatMes * 100) + '% sobre as vendas' : 'Sem vendas no mês');
  const gastosMes = sumBy(paidExpensesIn(periodRange('mes')), e => e.amount);
  setText('statGastos', fmt(gastosMes));
  setText('statGastosSub', 'Lucro líquido: ' + fmt(lucroMes - gastosMes));
  const vencidas = state.expenses.filter(expenseIsOverdue);
  const venceHoje = state.expenses.filter(e => expenseIsOpen(e) && e.date === today);
  const bills = $('#billsNotice');
  if (isReady() && (vencidas.length || venceHoje.length)) {
    const parts = [];
    if (vencidas.length) parts.push(plural(vencidas.length, 'conta vencida', 'contas vencidas') + ' (' + fmt(sumBy(vencidas, e => e.amount)) + ')');
    if (venceHoje.length) parts.push(plural(venceHoje.length, 'conta vence', 'contas vencem') + ' hoje (' + fmt(sumBy(venceHoje, e => e.amount)) + ')');
    setText('billsNoticeText', 'Atenção: ' + parts.join(' e ') + '.');
    bills.style.display = 'flex';
  } else bills.style.display = 'none';
  setText('statFiado', fmt(totalFiadoAberto()));
  setText('statFiadoSub', plural(debtors, 'cliente devendo', 'clientes devendo'));

  // Estoque para repor
  const lowWrap = $('#lowStockList');
  if (!isReady()) lowWrap.innerHTML = loadingHTML();
  else {
    const low = state.products.filter(needsRestock).sort((a, b) => (a.stock || 0) - (b.stock || 0));
    if (!state.products.length) lowWrap.innerHTML = '<div class="empty-state">Nenhum produto cadastrado ainda.<br><button class="link-btn" data-goto="produtos">Cadastrar produtos</button></div>';
    else if (!low.length) lowWrap.innerHTML = '<div class="empty-state">Todos os produtos estão acima do estoque mínimo.</div>';
    else lowWrap.innerHTML = low.slice(0, 8).map(p => `
      <div class="list-row">
        <div class="lr-main">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">${isOut(p) ? '<span class="neg">Sem estoque</span>' : '<b>' + (p.stock || 0) + '</b> un. (mín. ' + p.minStock + ')'}</div>
        </div>
        <button class="btn btn-outline btn-xs" data-stock="${p.id}">Dar entrada</button>
      </div>`).join('') + (low.length > 8 ? `<button class="link-btn" data-goto="produtos">Ver os outros ${low.length - 8}</button>` : '');
  }

  // Últimas vendas
  const wrap = $('#ultimasVendas');
  if (!isReady()) wrap.innerHTML = loadingHTML();
  else {
    const recent = sortedSales().slice(0, 8);
    wrap.innerHTML = recent.length ? recent.map(saleRowHTML).join('')
      : '<div class="empty-state">Nenhuma venda registrada ainda.<br><button class="link-btn" data-goto="venda">Fazer a primeira venda</button></div>';
  }

  renderHomeCharts(active, monthSales, today);
}

function renderHomeCharts(active, monthSales, today){
  // Últimos 7 dias — hoje em destaque
  const r7 = periodRange('7');
  const s7 = active.filter(s => inRange(s.date, r7));
  const b7 = timeBuckets(s7, r7);
  setChart('chartHome7', 'bar', {
    labels: b7.keys.map(k => k === today ? 'Hoje' : capitalize(keyToDate(k).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))),
    values: b7.values,
    tipLabels: b7.tipLabels,
    tipValues: b7.values.map((v, i) => fmt(v) + ' em ' + plural(b7.counts[i], 'venda', 'vendas')),
    colors: b7.keys.map(k => k === today ? '#9C6B1F' : '#DDB57A'),
    strongLabel: b7.keys.indexOf(today),
    showValues: true,
    aria: 'Faturamento dos últimos 7 dias',
    clickHint: 'Clique para abrir o caixa deste dia',
    onClick: i => openCaixaDay(b7.keys[i])
  }, s7.length === 0);

  // Faturamento por produto no mês
  const top = aggregateProducts(monthSales).slice(0, 6);
  setChart('chartHomeProducts', 'hbar', {
    labels: top.map(x => x.name),
    values: top.map(x => x.revenue),
    valueLabels: top.map(x => fmt(x.revenue) + ' · ' + x.qty + ' un.'),
    color: '#C8872E',
    aria: 'Faturamento por produto no mês',
    clickHint: 'Clique para ver as vendas deste produto',
    onClick: i => openVendasFiltered({ period: 'mes', search: top[i].name })
  }, top.length === 0);

  // Formas de pagamento no mês
  const mt = methodTotals(monthSales);
  setChart('chartHomeMethods', 'donut', {
    labels: mt.keys.map(k => METHOD_LABELS[k] || k),
    values: mt.values,
    colors: mt.keys.map(k => METHOD_COLORS[k] || '#A4AEA8'),
    centerLabel: 'no mês',
    aria: 'Formas de pagamento no mês',
    clickHint: 'Clique para ver essas vendas',
    onClick: i => openVendasFiltered({ period: 'mes', method: mt.keys[i] })
  }, mt.keys.length === 0);
}

function saleRowHTML(s){
  const cliente = s.customerId ? esc(customerName(s.customerId)) : 'Venda no balcão';
  const color = !isActive(s) ? '' : (s.type === 'fiado' ? (s.paid ? 'green' : 'rust') : 'amber');
  return `
    <div class="list-row clickable" data-sale="${s.id}">
      <div class="lr-main">
        <div class="name">${saleLabel(s)} · ${cliente}</div>
        <div class="meta">${fmtWhen(s.date)} — ${esc(itemsSummary(s))}</div>
      </div>
      <div class="stack-right">
        <span class="amount ${color}" ${!isActive(s) ? 'style="text-decoration:line-through;color:var(--muted)"' : ''}>${fmt(s.total)}</span>
        <span>${isActive(s) && s.type !== 'fiado' ? '<span class="tag neutral">' + methodLabel(s) + '</span>' : statusTag(s)}</span>
      </div>
    </div>`;
}

function statusTag(s){
  if (!isActive(s)) return '<span class="tag cancel">Cancelada</span>';
  if (s.type === 'fiado') {
    if (s.paid) return '<span class="tag ok">Fiado pago</span>';
    if ((s.paidAmount || 0) > 0) return '<span class="tag pend">Fiado parcial</span>';
    return '<span class="tag pend">Fiado aberto</span>';
  }
  return '<span class="tag ok">Paga</span>';
}
