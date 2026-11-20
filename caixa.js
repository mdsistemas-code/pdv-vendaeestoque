/* screens/caixa.js
   Tela Caixa do dia: total recebido por forma de pagamento e movimentações. */

/* =========================================================
   CAIXA DO DIA
   ========================================================= */
function caixaData(key){
  const daySales = state.sales.filter(s => dayKey(new Date(s.date)) === key);
  const active = daySales.filter(isActive);
  const canceled = daySales.filter(s => !isActive(s));
  const dayPays = state.payments.filter(p => dayKey(new Date(p.date)) === key);
  const methods = PAY_METHODS.map(m => {
    const vendas = active.filter(s => s.type !== 'fiado' && s.paymentMethod === m);
    const recs = dayPays.filter(p => p.method === m);
    return { m, total: round2(sumBy(vendas, s => s.total) + sumBy(recs, p => p.amount)), nV: vendas.length, nR: recs.length };
  });
  const semForma = active.filter(s => s.type !== 'fiado' && !s.paymentMethod);
  if (semForma.length) methods.push({ m: 'nao_informado', total: sumBy(semForma, s => s.total), nV: semForma.length, nR: 0 });
  const recebido = round2(methods.reduce((a, x) => a + x.total, 0));
  const fiadoVendido = sumBy(active.filter(s => s.type === 'fiado'), s => s.total);
  const fiadoRecebido = sumBy(dayPays, p => p.amount);
  const dayExpenses = state.expenses.filter(e => !expenseIsOpen(e) && e.date === key);
  const gastos = sumBy(dayExpenses, e => e.amount);
  const gastosDinheiro = sumBy(dayExpenses.filter(e => e.method === 'dinheiro'), e => e.amount);
  // Hora do gasto: quando foi pago/lançado nesse dia; senão, meio-dia
  const expenseWhen = e => {
    if (e.paidAt && dayKey(new Date(e.paidAt)) === key) return e.paidAt;
    if (e.createdAt && dayKey(new Date(e.createdAt)) === key) return e.createdAt;
    const d = keyToDate(key); d.setHours(12, 0, 0, 0); return d.toISOString();
  };
  const movements = [
    ...daySales.map(s => ({
      date: s.date, kind: 'Venda ' + saleLabel(s),
      desc: (s.customerId ? customerName(s.customerId) + ' — ' : '') + itemsSummary(s),
      method: methodLabel(s), value: s.total, canceled: !isActive(s), saleId: s.id
    })),
    ...dayPays.map(p => ({
      date: p.date, kind: 'Recebimento de fiado',
      desc: customerName(p.customerId) || p.customerName || '',
      method: METHOD_LABELS[p.method] || p.label || '', value: p.amount, canceled: false
    })),
    ...dayExpenses.map(e => ({
      date: expenseWhen(e), kind: 'Gasto',
      desc: e.description + ' (' + (e.category || 'Outros') + ')',
      method: EXPENSE_METHODS[e.method] || '', value: -e.amount, canceled: false, expense: true
    }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { active, canceled, methods, recebido, fiadoVendido, fiadoRecebido, movements, gastos, gastosDinheiro,
    saldo: round2(recebido - gastos),
    totalVendido: sumBy(active, s => s.total), descontos: sumBy(active, s => s.discount || 0) };
}

function renderCaixa(){
  const input = $('#caixaDate');
  if (input.value !== ui.caixaDate) input.value = ui.caixaDate;
  const isToday = ui.caixaDate === dayKey(new Date());
  $('#caixaNext').disabled = isToday;
  if (!isReady()) { $('#caixaBody').innerHTML = '<tr><td colspan="5">' + loadingHTML() + '</td></tr>'; return; }

  const c = caixaData(ui.caixaDate);
  setText('caixaRecebido', fmt(c.recebido));
  setText('caixaRecebidoSub', (isToday ? 'Hoje' : keyToDate(ui.caixaDate).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })) + ' — dinheiro, Pix e cartões, incluindo fiado recebido');

  const facts = [
    ['Total vendido', fmt(c.totalVendido)],
    ['Vendido no fiado (a receber)', fmt(c.fiadoVendido)],
    ['Fiado recebido no dia', fmt(c.fiadoRecebido)],
    ['Descontos dados', fmt(c.descontos)],
    ['Gastos pagos no dia', c.gastos ? '− ' + fmt(c.gastos) : fmt(0)],
    ['Saldo do dia (recebido − gastos)', fmt(c.saldo)],
    ['Vendas realizadas', String(c.active.length)],
    ['Vendas canceladas', String(c.canceled.length)]
  ];
  $('#caixaFacts').innerHTML = facts.map(f => `<div class="fact"><span>${f[0]}</span><span>${f[1]}</span></div>`).join('');

  $('#caixaMethods').innerHTML = c.methods.map(x => `
    <div class="stat-card">
      <div class="label"><span class="mdot" style="background:${METHOD_COLORS[x.m]}"></span>${METHOD_LABELS[x.m]}</div>
      <div class="value">${fmt(x.total)}</div>
      <div class="foot">${plural(x.nV, 'venda', 'vendas')}${x.nR ? ' + ' + plural(x.nR, 'recebimento', 'recebimentos') : ''}${x.m === 'dinheiro' && c.gastosDinheiro ? '<br>Na gaveta, após gastos: <b>' + fmt(x.total - c.gastosDinheiro) + '</b>' : ''}</div>
    </div>`).join('');

  $('#caixaTableWrap').style.display = c.movements.length ? '' : 'none';
  $('#caixaEmpty').style.display = c.movements.length ? 'none' : 'block';
  $('#caixaBody').innerHTML = c.movements.map(m => `
    <tr class="${m.saleId ? 'clickable' : ''} ${m.canceled ? 'canceled' : ''}" ${m.saleId ? 'data-sale="' + m.saleId + '"' : ''}>
      <td class="nowrap">${fmtTime(m.date)}</td>
      <td class="nowrap">${esc(m.kind)}${m.canceled ? ' <span class="tag cancel">Cancelada</span>' : ''}</td>
      <td class="items-cell" title="${esc(m.desc)}">${esc(m.desc)}</td>
      <td class="nowrap">${esc(m.method)}</td>
      <td class="num"><b class="${m.expense ? 'neg' : ''}">${m.value < 0 ? '− ' + fmt(-m.value) : fmt(m.value)}</b></td>
    </tr>`).join('');
}

/* ---------- Eventos da tela ---------- */
$('#caixaDate').addEventListener('change', e => { if (e.target.value) { ui.caixaDate = e.target.value; renderCaixa(); } });
$('#caixaPrev').addEventListener('click', () => { ui.caixaDate = shiftDay(ui.caixaDate, -1); renderCaixa(); });
$('#caixaNext').addEventListener('click', () => { ui.caixaDate = shiftDay(ui.caixaDate, 1); renderCaixa(); });
$('#caixaToday').addEventListener('click', () => { ui.caixaDate = dayKey(new Date()); renderCaixa(); });
$('#btnExportCaixa').addEventListener('click', exportCaixa);
