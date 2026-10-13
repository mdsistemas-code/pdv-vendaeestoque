/* share.js
   Compartilhar comprovante de venda (à vista ou fiado) e extrato de fiado do cliente:
   pelo WhatsApp, pelo menu de compartilhar do aparelho ou copiando o texto. */

function storeName(){ return brandInfo().name; }

/* ---------- Textos ---------- */
function saleReceiptText(s){
  const L = [];
  L.push('*' + storeName() + '*');
  L.push((isActive(s) ? 'Comprovante de venda ' : 'VENDA CANCELADA ') + saleLabel(s));
  L.push(fmtDate(s.date) + ' às ' + fmtTime(s.date));
  if (s.editedAt) L.push('(alterada em ' + fmtDate(s.editedAt) + ' às ' + fmtTime(s.editedAt) + ')');
  if (s.customerId) L.push('Cliente: ' + customerName(s.customerId));
  L.push('');
  (s.items || []).forEach(it => L.push(it.qty + 'x ' + it.name + ' — ' + fmt(itemNet(it)) +
    (it.discount ? ' (desconto de ' + fmt(it.discount) + (itemDiscountNote(it) ? ': ' + itemDiscountNote(it) : '') + ')' : '')));
  L.push('');
  if (s.discount) {
    const itemsDisc = saleItemsDiscount(s), generalDisc = saleGeneralDiscount(s);
    L.push('Subtotal: ' + fmt(saleSubtotal(s)));
    if (itemsDisc > 0) L.push('Descontos nos itens: − ' + fmt(itemsDisc));
    if (generalDisc > 0) L.push((itemsDisc > 0 ? 'Desconto geral' : 'Desconto') + ': − ' + fmt(generalDisc));
  }
  L.push('*Total: ' + fmt(s.total) + '*');
  if (s.type === 'fiado') {
    L.push('Pagamento: fiado (pagar depois)');
    if (isActive(s)) {
      if ((s.paidAmount || 0) > 0) L.push('Já pago desta compra: ' + fmt(s.paidAmount));
      L.push(s.paid ? 'Situação: compra quitada' : '*Falta pagar desta compra: ' + fmt(saleRemaining(s)) + '*');
      const debt = customerDebt(s.customerId);
      if (debt > 0 && Math.abs(debt - saleRemaining(s)) > 0.004) L.push('Total em aberto na sua conta: ' + fmt(debt));
    }
  } else {
    L.push('Pagamento: ' + methodLabel(s));
    if (typeof s.cashReceived === 'number') L.push('Recebido: ' + fmt(s.cashReceived) + (s.change ? ' — troco: ' + fmt(s.change) : ''));
  }
  L.push('');
  L.push('Obrigado pela preferência!');
  return L.join('\n');
}

function customerStatementText(customerId){
  const c = getCustomer(customerId);
  const open = openFiadoSales(customerId).sort((a, b) => new Date(a.date) - new Date(b.date));
  const L = [];
  L.push('*' + storeName() + '*');
  L.push('Extrato de fiado — ' + (c ? c.name : 'Cliente'));
  L.push('Atualizado em ' + fmtDate(new Date().toISOString()));
  L.push('');
  if (!open.length) {
    L.push('Você não tem compras em aberto. Obrigado!');
  } else {
    L.push('Compras em aberto:');
    open.forEach(s => L.push('• ' + fmtDateShort(s.date) + ' (' + saleLabel(s) + '): ' + itemsSummary(s) + ' — falta ' + fmt(saleRemaining(s))));
    L.push('');
    L.push('*Total em aberto: ' + fmt(customerDebt(customerId)) + '*');
  }
  const pays = state.payments.filter(p => p.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  if (pays.length) {
    L.push('');
    L.push('Últimos pagamentos:');
    pays.forEach(p => L.push('• ' + fmtDateShort(p.date) + ' — ' + fmt(p.amount) + ' (' + (METHOD_LABELS[p.method] || p.label || '') + ')'));
  }
  L.push('');
  L.push('Qualquer dúvida, é só chamar.');
  return L.join('\n');
}

/* ---------- Envio ---------- */
// Converte "(87) 99999-0000" em "5587999990000" para o link do WhatsApp
function whatsappNumber(phone){
  let d = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

function copyText(text){
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); }
    catch (e) { reject(e); }
    finally { ta.remove(); }
  });
}

function openShareModal(o){
  const canShare = typeof navigator.share === 'function';
  const preview = esc(o.text).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  const sheet = openModal(`
    <h3>${esc(o.title)}</h3>
    <div class="sub">Envie pelo WhatsApp, compartilhe por outro aplicativo ou copie o texto.</div>
    <div class="receipt">${preview}</div>
    <label class="field-label" for="shPhone">WhatsApp do cliente (opcional)</label>
    <input type="tel" id="shPhone" placeholder="(00) 00000-0000" value="${esc(o.phone || '')}" autocomplete="off">
    <div class="hint">Sem número, o WhatsApp abre para você escolher o contato.</div>
    <div class="modal-actions">
      ${o.back ? '<button class="btn btn-outline" id="shBack">Voltar</button>' : ''}
      <button class="btn btn-outline" id="shCopy">Copiar texto</button>
      ${canShare ? '<button class="btn btn-outline" id="shNative">Compartilhar…</button>' : ''}
      <span class="spacer"></span>
      <button class="btn btn-whatsapp" data-primary id="shWhats">Enviar pelo WhatsApp</button>
    </div>`);

  $('#shWhats', sheet).addEventListener('click', () => {
    const num = whatsappNumber($('#shPhone', sheet).value);
    const url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(o.text);
    // Abre em outra aba, sem tirar o sistema da tela
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $('#shCopy', sheet).addEventListener('click', () => {
    copyText(o.text).then(() => toast('Texto copiado. É só colar na conversa.'))
      .catch(() => toast('Não foi possível copiar. Selecione o texto e copie manualmente.', 'error'));
  });
  const nb = $('#shNative', sheet);
  if (nb) nb.addEventListener('click', () => {
    navigator.share({ title: o.title, text: o.text }).catch(e => {
      if (e && e.name !== 'AbortError') toast('Não foi possível abrir o compartilhamento.', 'error');
    });
  });
  const back = $('#shBack', sheet);
  if (back) back.addEventListener('click', o.back);
}

function shareSale(id, fromDetails){
  const s = getSale(id);
  if (!s) { toast('Venda não encontrada.', 'error'); return; }
  const c = s.customerId ? getCustomer(s.customerId) : null;
  openShareModal({
    title: 'Compartilhar venda ' + saleLabel(s),
    text: saleReceiptText(s),
    phone: c ? c.phone : '',
    back: fromDetails ? () => openSaleDetails(id) : null
  });
}

function shareStatement(customerId, fromDetails){
  const c = getCustomer(customerId);
  if (!c) return;
  openShareModal({
    title: 'Extrato de fiado — ' + c.name,
    text: customerStatementText(customerId),
    phone: c.phone || '',
    back: fromDetails ? () => openCustomerDetails(customerId) : null
  });
}
