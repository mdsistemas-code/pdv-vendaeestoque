/* screens/vendas.js
   Tela Vendas: histórico com filtros, detalhes e cancelamento de vendas. */

/* =========================================================
   DETALHES / CANCELAMENTO DE VENDA
   ========================================================= */
function openSaleDetails(id){
  const s = getSale(id);
  if (!s) return;
  const active = isActive(s);
  const sub = saleSubtotal(s);
  const itemsDisc = saleItemsDiscount(s);
  const generalDisc = saleGeneralDiscount(s);
  const hasItemDisc = itemsDisc > 0;
  const rows = (s.items || []).map(it => `
    <tr><td>${esc(it.name)}</td><td class="num">${it.qty}</td><td class="num">${fmt(it.price)}</td>${hasItemDisc ? `<td class="num">${it.discount ? '<span class="neg">− ' + fmt(it.discount) + '</span>' + (itemDiscountNote(it) ? ' <span class="muted">(' + itemDiscountNote(it) + ')</span>' : '') : '—'}</td>` : ''}<td class="num">${fmt(itemNet(it))}</td></tr>`).join('');
  const facts = [
    ['Subtotal', fmt(sub)],
    (hasItemDisc ? ['Descontos nos itens', '− ' + fmt(itemsDisc)] : null),
    (generalDisc > 0 ? [hasItemDisc ? 'Desconto geral' : 'Desconto', '− ' + fmt(generalDisc)] : null),
    ['Total', fmt(s.total), 'total'],
    (typeof s.cashReceived === 'number' ? ['Recebido em dinheiro', fmt(s.cashReceived)] : null),
    (typeof s.change === 'number' && s.change > 0 ? ['Troco', fmt(s.change)] : null),
    (s.type === 'fiado' ? ['Já pago', fmt(s.paidAmount || 0)] : null),
    (s.type === 'fiado' && active ? ['Falta pagar', fmt(saleRemaining(s))] : null)
  ].filter(Boolean);

  const sheet = openModal(`
    <h3>Venda ${saleLabel(s)}</h3>
    <div class="sub">${fmtDate(s.date)} às ${fmtTime(s.date)} — ${s.customerId ? esc(customerName(s.customerId)) : 'Venda no balcão'}${s.sellerName ? ' — atendido por ' + esc(s.sellerName) : ''}</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
      ${statusTag(s)} <span class="tag neutral">${methodLabel(s)}</span>
    </div>
    ${!active && s.canceledAt ? '<div class="hint">Cancelada em ' + fmtDate(s.canceledAt) + ' às ' + fmtTime(s.canceledAt) + '.</div>' : ''}
    ${(s.edits || []).length ? `<div class="edit-history"><b>${plural(s.edits.length, 'alteração', 'alterações')}</b>${s.edits.slice().reverse().map(e => `<div>${fmtDate(e.at)} às ${fmtTime(e.at)}${e.by ? ' por ' + esc(e.by) : ''} — antes: ${fmt(e.totalAntes)} (${esc(e.formaAntes || '')}): ${esc(e.itensAntes || '')}</div>`).join('')}</div>` : ''}
    <h4>Itens</h4>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Unitário</th>${hasItemDisc ? '<th class="num">Desconto</th>' : ''}<th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="totals-box">
      ${facts.map(f => `<div class="fact ${f[2] || ''}"><span>${f[0]}</span><span>${f[1]}</span></div>`).join('')}
    </div>
    <div class="modal-actions">
      ${active ? '<button class="btn btn-danger-outline" id="sdCancel">Cancelar venda</button><span class="spacer"></span>' : ''}
      ${active && s.type === 'fiado' && !s.paid ? '<button class="btn btn-outline" id="sdReceive">Receber fiado</button>' : ''}
      ${active ? '<button class="btn btn-outline" id="sdEdit">Editar venda</button>' : ''}
      <button class="btn btn-outline" id="sdShare">Compartilhar</button>
      <button class="btn btn-primary" data-close>Fechar</button>
    </div>`, { wide: true });

  $('#sdShare', sheet).addEventListener('click', () => shareSale(s.id, true));
  const editBtn = $('#sdEdit', sheet);
  if (editBtn) editBtn.addEventListener('click', () => startEditSale(s.id));
  const cancelBtn = $('#sdCancel', sheet);
  if (cancelBtn) cancelBtn.addEventListener('click', () => cancelSale(s.id));
  const recBtn = $('#sdReceive', sheet);
  if (recBtn) recBtn.addEventListener('click', () => openReceiveModal(s.customerId));
}

async function cancelSale(id){
  const s = getSale(id);
  if (!s || !isActive(s) || !requireDb()) return;
  let msg = 'A venda ' + saleLabel(s) + ' de ' + fmt(s.total) + ' será cancelada e os produtos voltam para o estoque.';
  if (s.type === 'fiado' && (s.paidAmount || 0) > 0) msg += ' O valor de ' + fmt(s.paidAmount) + ' já recebido continua registrado no caixa — devolva ao cliente se for o caso.';
  const ok = await confirmDialog({ title: 'Cancelar venda?', message: msg, okLabel: 'Cancelar venda', danger: true });
  if (!ok) return;
  try {
    await withSave(async () => {
      await db.collection('sales').doc(s.id).update({ status: 'cancelada', canceledAt: new Date().toISOString() });
      for (const it of (s.items || [])) {
        const p = getProduct(it.productId);
        if (p) await db.collection('products').doc(p.id).update({ stock: db.increment(it.qty) });
      }
    });
    closeModal();
    if (editingSaleId === s.id) resetSaleForm();
    toast('Venda ' + saleLabel(s) + ' cancelada. Estoque devolvido.');
  } catch (e) { toast(errMsg(e, 'Não foi possível cancelar a venda.'), 'error'); }
}

/* =========================================================
   VENDAS (HISTÓRICO)
   ========================================================= */
function filteredHistory(){
  const r = periodRange(ui.vendasPeriod);
  const q = ui.vendasSearch.trim().toLowerCase();
  return sortedSales().filter(s => {
    if (!ui.vendasShowCanceled && !isActive(s)) return false;
    if (!inRange(s.date, r)) return false;
    if (ui.vendasMethod !== 'todas' && methodKey(s) !== ui.vendasMethod) return false;
    if (q) {
      const hay = [saleLabel(s), customerName(s.customerId), ...(s.items || []).map(i => i.name)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderVendas(){
  renderChips('#vendasPeriodChips', PERIODS, ui.vendasPeriod, v => { ui.vendasPeriod = v; ui.vendasLimit = 50; renderVendas(); });
  const body = $('#vendasBody');
  if (!isReady()) { body.innerHTML = '<tr><td colspan="7">' + loadingHTML() + '</td></tr>'; return; }
  const rows = filteredHistory();
  const act = rows.filter(isActive);
  $('#vendasSummary').innerHTML = '<b>' + plural(act.length, 'venda', 'vendas') + '</b> somando <b>' + fmt(sumBy(act, s => s.total)) + '</b>';
  $('#vendasTableWrap').style.display = rows.length ? '' : 'none';
  $('#vendasEmpty').style.display = rows.length ? 'none' : 'block';
  body.innerHTML = rows.slice(0, ui.vendasLimit).map(s => `
    <tr class="clickable ${isActive(s) ? '' : 'canceled'}" data-sale="${s.id}">
      <td class="nowrap"><b>${saleLabel(s)}</b>${(s.edits || []).length ? ' <span class="edited-mark" title="Venda editada">editada</span>' : ''}</td>
      <td class="nowrap">${fmtDate(s.date)} <span class="muted">${fmtTime(s.date)}</span></td>
      <td>${s.customerId ? esc(customerName(s.customerId)) : '<span class="muted">Balcão</span>'}</td>
      <td class="items-cell" title="${esc(itemsSummary(s))}">${esc(itemsSummary(s))}</td>
      <td class="nowrap">${methodLabel(s)}</td>
      <td class="num"><b>${fmt(s.total)}</b></td>
      <td>${statusTag(s)}</td>
    </tr>`).join('');
  $('#btnVendasMore').style.display = rows.length > ui.vendasLimit ? '' : 'none';
}

/* ---------- Eventos da tela ---------- */
$('#vendasMethod').addEventListener('change', e => { ui.vendasMethod = e.target.value; ui.vendasLimit = 50; renderVendas(); });
$('#vendasSearch').addEventListener('input', e => { ui.vendasSearch = e.target.value; ui.vendasLimit = 50; renderVendas(); });
$('#vendasShowCanceled').addEventListener('change', e => { ui.vendasShowCanceled = e.target.checked; renderVendas(); });
$('#btnVendasMore').addEventListener('click', () => { ui.vendasLimit += 50; renderVendas(); });
$('#btnExportVendas').addEventListener('click', exportVendas);
