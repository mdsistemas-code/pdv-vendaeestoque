/* screens/fiado.js
   Tela Fiado: quem deve, recebimentos e histórico por cliente. */

/* =========================================================
   FIADO
   ========================================================= */
function renderFiado(){
  setText('fiadoTotalTop', fmt(totalFiadoAberto()));
  const monthPays = state.payments.filter(p => inRange(p.date, periodRange('mes')));
  setText('fiadoRecebidoMes', fmt(sumBy(monthPays, p => p.amount)));
  setText('fiadoRecebidoMesSub', plural(monthPays.length, 'recebimento', 'recebimentos'));

  const list = $('#fiadoList');
  if (!isReady()) { list.innerHTML = loadingHTML(); $('#fiadoPayments').innerHTML = ''; return; }

  const byCustomer = {};
  openFiadoSales().forEach(s => { (byCustomer[s.customerId] = byCustomer[s.customerId] || []).push(s); });
  const debtors = Object.keys(byCustomer).map(cid => ({
    id: cid,
    name: customerName(cid),
    phone: (getCustomer(cid) || {}).phone || '',
    debt: round2(byCustomer[cid].reduce((a, s) => a + saleRemaining(s), 0)),
    count: byCustomer[cid].length,
    since: Math.min(...byCustomer[cid].map(s => new Date(s.date).getTime()))
  })).filter(d => d.debt > 0.004).sort((a, b) => b.debt - a.debt);

  setText('fiadoCount', plural(debtors.length, 'cliente devendo', 'clientes devendo'));
  list.innerHTML = debtors.length ? debtors.map(d => {
    const days = Math.floor((Date.now() - d.since) / 86400000);
    return `
    <div class="list-row">
      <div class="lr-main">
        <div class="name">${esc(d.name)}</div>
        <div class="meta">${d.phone ? esc(d.phone) + ' — ' : ''}${plural(d.count, 'compra em aberto', 'compras em aberto')} desde ${fmtDate(new Date(d.since).toISOString())}${days >= 30 ? ' <span class="neg">(' + days + ' dias)</span>' : ''}</div>
      </div>
      <div class="right">
        <span class="amount rust">${fmt(d.debt)}</span>
        <div class="row-actions">
          <button class="btn btn-outline btn-xs" data-cdetails="${d.id}">Detalhes</button>
          <button class="btn btn-outline btn-xs" data-statement="${d.id}">Enviar extrato</button>
          <button class="btn btn-primary btn-xs" data-receive="${d.id}">Receber</button>
        </div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">Nenhum fiado em aberto. Tudo recebido.</div>';

  const pays = [...state.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  $('#fiadoPayments').innerHTML = pays.length ? `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th class="num">Valor</th></tr></thead>
      <tbody>${pays.map(p => `<tr><td class="nowrap">${fmtDate(p.date)} <span class="muted">${fmtTime(p.date)}</span></td><td>${esc(customerName(p.customerId) || p.customerName)}</td><td>${esc(METHOD_LABELS[p.method] || p.label || '')}</td><td class="num"><b>${fmt(p.amount)}</b></td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state">Nenhum recebimento registrado ainda.</div>';
}

function openReceiveModal(customerId){
  const c = getCustomer(customerId);
  const debt = customerDebt(customerId);
  if (debt <= 0) { toast('Este cliente não tem fiado em aberto.'); return; }
  let method = 'dinheiro';
  const sheet = openModal(`
    <h3>Receber fiado</h3>
    <div class="sub">${esc(c ? c.name : 'Cliente')} deve <b>${fmt(debt)}</b>.</div>
    <label class="field-label" for="rcAmount">Valor recebido (R$)</label>
    <input type="text" inputmode="decimal" id="rcAmount" value="${fmtInput(debt)}" autocomplete="off">
    <div class="hint" id="rcHint">Quitação total da dívida.</div>
    <label class="field-label">Forma de pagamento</label>
    <div class="segmented" id="rcMethod">
      <button data-m="dinheiro" class="active">Dinheiro</button>
      <button data-m="pix">Pix</button>
      <button data-m="cartao_debito">Débito</button>
      <button data-m="cartao_credito">Crédito</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="rcOk">Confirmar recebimento</button>
    </div>`);

  $('#rcMethod', sheet).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    method = b.dataset.m;
    $$('#rcMethod button', sheet).forEach(x => x.classList.toggle('active', x === b));
  });
  $('#rcAmount', sheet).addEventListener('input', () => {
    const v = parseMoney($('#rcAmount', sheet).value);
    const hint = $('#rcHint', sheet);
    if (isNaN(v) || v <= 0) { hint.innerHTML = '<span class="neg">Digite um valor válido.</span>'; return; }
    if (v > debt + 0.004) { hint.innerHTML = '<span class="neg">Valor maior que a dívida (' + fmt(debt) + ').</span>'; return; }
    hint.textContent = Math.abs(v - debt) < 0.005 ? 'Quitação total da dívida.' : 'Pagamento parcial — vai restar ' + fmt(debt - v) + '.';
  });
  $('#rcOk', sheet).addEventListener('click', async e => {
    if (!requireDb()) return;
    const amount = parseMoney($('#rcAmount', sheet).value);
    if (isNaN(amount) || amount <= 0) { toast('Digite um valor válido.', 'error'); return; }
    if (amount > debt + 0.004) { toast('O valor é maior que a dívida de ' + fmt(debt) + '.', 'error'); return; }
    e.target.disabled = true;
    try {
      await withSave(async () => {
        let remaining = amount;
        const open = openFiadoSales(customerId).sort((a, b) => new Date(a.date) - new Date(b.date));
        for (const s of open) {
          if (remaining <= 0.004) break;
          const pay = Math.min(saleRemaining(s), remaining);
          const newPaid = round2((s.paidAmount || 0) + pay);
          remaining = round2(remaining - pay);
          const patch = { paidAmount: newPaid };
          if (newPaid >= s.total - 0.004) { patch.paid = true; patch.paidDate = new Date().toISOString(); }
          await db.collection('sales').doc(s.id).update(patch);
        }
        await db.collection('payments').add({
          date: new Date().toISOString(), customerId, customerName: c ? c.name : '',
          amount, method, label: METHOD_LABELS[method], receivedBy: sellerInfo().name
        });
      });
      closeModal();
      toast('Recebido ' + fmt(amount) + ' de ' + (c ? c.name : 'cliente') + ' (' + METHOD_LABELS[method] + ').');
    } catch (err) {
      e.target.disabled = false;
      toast(errMsg(err, 'Não foi possível registrar o recebimento.'), 'error');
    }
  });
}

function openCustomerDetails(id){
  const c = getCustomer(id);
  if (!c) return;
  const debt = customerDebt(id);
  const custSales = sortedSales().filter(s => s.customerId === id && isActive(s));
  const open = custSales.filter(s => s.type === 'fiado' && !s.paid);
  const pays = state.payments.filter(p => p.customerId === id).sort((a, b) => new Date(b.date) - new Date(a.date));

  const sheet = openModal(`
    <h3>${esc(c.name)}</h3>
    <div class="sub">${c.phone ? esc(c.phone) : 'Sem telefone cadastrado'}</div>
    <div class="mini-stats">
      <div><div class="l">Deve hoje</div><div class="v" style="color:${debt > 0 ? 'var(--rust)' : 'var(--green-ok)'}">${fmt(debt)}</div></div>
      <div><div class="l">Total comprado</div><div class="v">${fmt(sumBy(custSales, s => s.total))}</div></div>
      <div><div class="l">Compras</div><div class="v">${custSales.length}</div></div>
    </div>
    <h4>Fiados em aberto</h4>
    ${open.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Venda</th><th>Data</th><th>Itens</th><th class="num">Total</th><th class="num">Falta</th></tr></thead>
      <tbody>${open.map(s => `<tr class="clickable" data-sale="${s.id}"><td><b>${saleLabel(s)}</b></td><td class="nowrap">${fmtDate(s.date)}</td><td class="items-cell">${esc(itemsSummary(s))}</td><td class="num">${fmt(s.total)}</td><td class="num"><b class="neg">${fmt(saleRemaining(s))}</b></td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state">Nenhum fiado em aberto.</div>'}
    <h4>Pagamentos recebidos</h4>
    ${pays.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Data</th><th>Forma</th><th class="num">Valor</th></tr></thead>
      <tbody>${pays.slice(0, 20).map(p => `<tr><td class="nowrap">${fmtDate(p.date)} <span class="muted">${fmtTime(p.date)}</span></td><td>${esc(METHOD_LABELS[p.method] || p.label || '')}</td><td class="num"><b>${fmt(p.amount)}</b></td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state">Nenhum pagamento de fiado registrado.</div>'}
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Fechar</button>
      ${debt > 0 ? '<button class="btn btn-outline" id="cdStatement">Enviar extrato</button><button class="btn btn-primary" id="cdReceive">Receber fiado</button>' : ''}
    </div>`, { wide: true });
  const sb = $('#cdStatement', sheet);
  if (sb) sb.addEventListener('click', () => shareStatement(id, true));
  const rb = $('#cdReceive', sheet);
  if (rb) rb.addEventListener('click', () => openReceiveModal(id));
}
