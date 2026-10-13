/* screens/venda.js
   Tela Nova venda: busca de produtos, carrinho, desconto, troco, forma de pagamento e fiado. */

/* =========================================================
   NOVA VENDA
   ========================================================= */
function vendaFilteredProducts(){
  const q = ui.vendaSearch.trim().toLowerCase();
  return state.products
    .filter(p => (ui.vendaCat === 'Todas' || (p.category || 'Outros') === ui.vendaCat))
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
    .sort(byName);
}

function renderVenda(){
  const cats = categoriesInUse();
  if (ui.vendaCat !== 'Todas' && !cats.includes(ui.vendaCat)) ui.vendaCat = 'Todas';
  renderChips('#vendaCatChips', ['Todas', ...cats], ui.vendaCat, v => { ui.vendaCat = v; renderVenda(); });

  const grid = $('#pickProducts');
  if (!isReady()) grid.innerHTML = '<div class="span-all">' + loadingHTML() + '</div>';
  else if (!state.products.length) grid.innerHTML = '<div class="empty-state span-all">Nenhum produto cadastrado ainda.<br><button class="link-btn" data-goto="produtos">Cadastrar produtos</button></div>';
  else {
    const list = vendaFilteredProducts();
    grid.innerHTML = list.length ? list.map(p => {
      const out = availableStock(p.id) <= 0;
      const inCart = cart[p.id] || 0;
      return `<button class="product-pick" data-add="${p.id}" ${out ? 'disabled' : ''}>
          ${inCart ? '<span class="in-cart">' + inCart + '</span>' : ''}
          ${productThumbHTML(p, 52, 'pp-thumb')}
          <span class="pp-body">
            <span class="pp-name">${esc(p.name)}</span>
            <span class="pp-price">${cartDiscounts[p.id] ? '<s class="pp-old">' + fmt(linePrice(p.id)) + '</s> ' + fmt(unitNet(p.id)) : fmt(linePrice(p.id))}</span>
            <span class="stock-pill ${out || isLow(p) ? 'low' : ''}">${out ? 'Sem estoque' : (p.stock || 0) + ' em estoque'}</span>
          </span>
        </button>`;
    }).join('') : '<div class="empty-state span-all">Nenhum produto encontrado para essa busca.</div>';
  }
  renderCart();
}

function addToCart(pid){
  const p = getProduct(pid);
  if (!p) return false;
  const cur = cart[pid] || 0;
  const stock = availableStock(pid);
  if (cur + 1 > stock) {
    toast(stock <= 0 ? p.name + ' está sem estoque.' : 'Estoque insuficiente: só há ' + stock + ' un. de ' + p.name + '.', 'error');
    return false;
  }
  cart[pid] = cur + 1;
  renderVenda();
  return true;
}

function cartSubtotal(){
  return round2(Object.keys(cart).reduce((a, pid) => a + (getProduct(pid) ? linePrice(pid) * cart[pid] : 0), 0));
}
/* ---------- Desconto por item ---------- */
function linePrice(pid){ if (cartPrices[pid]) return cartPrices[pid].price; const p = getProduct(pid); return p ? p.price : 0; }
function lineCost(pid){ if (cartPrices[pid]) return cartPrices[pid].cost; const p = getProduct(pid); return p ? (p.costPrice || 0) : 0; }
// Estoque disponível para esta venda: na edição, as unidades que já eram dela contam como disponíveis
function availableStock(pid){ const p = getProduct(pid); return (p ? (p.stock || 0) : 0) + (editingSaleId ? (editOriginalQty[pid] || 0) : 0); }
function lineGross(pid){ return round2(linePrice(pid) * (cart[pid] || 0)); }
// O desconto vale para CADA unidade: R$ 10 com R$ 1 de desconto = R$ 9 cada,
// e toda unidade adicionada depois já entra com o desconto.
function unitDiscount(pid){
  const d = cartDiscounts[pid];
  if (!d || !getProduct(pid)) return 0;
  const price = linePrice(pid);
  const v = d.type === 'pct' ? price * d.value / 100 : d.value;
  return Math.min(price, Math.max(0, v));
}
function unitNet(pid){ return round2(linePrice(pid) - unitDiscount(pid)); }
function lineDiscount(pid){ return round2(Math.min(lineGross(pid), unitDiscount(pid) * (cart[pid] || 0))); }
function cartDiscountTag(pid){
  const d = cartDiscounts[pid];
  if (!d) return '';
  return d.type === 'pct' ? '− ' + pctText(d.value) + '%' : '− ' + fmt(d.value) + ' cada';
}
function cartItemsDiscount(){ return round2(Object.keys(cart).reduce((a, pid) => a + lineDiscount(pid), 0)); }

function openItemDiscount(pid){
  const p = getProduct(pid);
  if (!p) return;
  const price = linePrice(pid);
  const qty = cart[pid] || 0;
  const gross = lineGross(pid);
  const cur = cartDiscounts[pid];
  let type = cur ? cur.type : 'pct';
  const sheet = openModal(`
    <h3>Desconto no item</h3>
    <div class="sub"><b>${esc(p.name)}</b> — ${fmt(price)} cada, ${qty} no carrinho. O desconto vale para todas as unidades.</div>
    <label class="field-label">Tipo de desconto</label>
    <div class="segmented" id="idType">
      <button data-t="pct">Porcentagem (%)</button>
      <button data-t="valor">Valor (R$)</button>
    </div>
    <label class="field-label" for="idValue" id="idValueLabel">Desconto</label>
    <input type="text" inputmode="decimal" id="idValue" value="${cur ? (cur.type === 'pct' ? pctText(cur.value) : fmtInput(cur.value)) : ''}" autocomplete="off">
    <div class="chip-row quick-chips" id="idQuick">${[5, 10, 15, 20].map(n => `<button class="chip" data-pct="${n}">${n}%</button>`).join('')}</div>
    <div class="hint" id="idHint"></div>
    <div class="modal-actions">
      ${cur ? '<button class="btn btn-danger-outline" id="idRemove">Tirar desconto</button><span class="spacer"></span>' : ''}
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="idApply">Aplicar desconto</button>
    </div>`);
  const input = $('#idValue', sheet);
  const calc = () => {
    const raw = input.value.trim();
    if (!raw) return { ok: false, msg: '' };
    const v = parseMoney(raw);
    if (isNaN(v) || v <= 0) return { ok: false, msg: 'Digite um valor maior que zero.' };
    if (type === 'pct' && v > 100) return { ok: false, msg: 'A porcentagem vai até 100%.' };
    if (type === 'valor' && v > price) return { ok: false, msg: 'O desconto não pode passar do preço da unidade (' + fmt(price) + ').' };
    const unit = type === 'pct' ? price * v / 100 : v;
    const d = round2(Math.min(gross, unit * qty));
    return { ok: true, v, d, unitNet: round2(price - unit) };
  };
  const update = () => {
    $$('#idType button', sheet).forEach(b => b.classList.toggle('active', b.dataset.t === type));
    setText('idValueLabel', type === 'pct' ? 'Desconto (%)' : 'Desconto em cada unidade (R$)');
    input.placeholder = type === 'pct' ? 'Ex: 10' : '0,00';
    const r = calc();
    const hint = $('#idHint', sheet);
    if (r.ok) {
      hint.innerHTML = 'Cada unidade fica por <b>' + fmt(r.unitNet) + '</b> (era ' + fmt(price) + ').' +
        (qty > 1 ? ' Com ' + qty + ' unidades: ' + fmt(gross - r.d) + ', − ' + fmt(r.d) + '.' : '');
    } else hint.innerHTML = r.msg ? '<span class="neg">' + r.msg + '</span>' : '';
  };
  $('#idType', sheet).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.t === type) return;
    type = b.dataset.t; input.value = ''; update(); input.focus();
  });
  $('#idQuick', sheet).addEventListener('click', e => {
    const b = e.target.closest('[data-pct]'); if (!b) return;
    type = 'pct'; input.value = b.dataset.pct; update(); input.focus();
  });
  input.addEventListener('input', update);
  $('#idApply', sheet).addEventListener('click', () => {
    const r = calc();
    if (!r.ok) { toast(r.msg || 'Digite o desconto.', 'error'); input.focus(); return; }
    cartDiscounts[pid] = { type, value: r.v };
    closeModal();
    renderVenda();
  });
  const rm = $('#idRemove', sheet);
  if (rm) rm.addEventListener('click', () => { delete cartDiscounts[pid]; closeModal(); renderVenda(); });
  update();
}

function cartDiscountValue(){
  const v = $('#cartDiscount').value.trim();
  return v ? parseMoney(v) : 0;
}

function renderEditState(){
  const s = editingSaleId ? getSale(editingSaleId) : null;
  $('#editBanner').style.display = editingSaleId ? 'flex' : 'none';
  if (editingSaleId) {
    $('#editBannerText').innerHTML = s
      ? 'Editando a venda <b>' + saleLabel(s) + '</b> de ' + fmtDate(s.date) + ' às ' + fmtTime(s.date) + (isActive(s) ? '' : ' <span class="neg">(cancelada)</span>')
      : '<span class="neg">A venda em edição não existe mais.</span>';
  }
  setText('cartTitle', editingSaleId ? 'Itens da venda' : 'Carrinho');
  if (!savingSale) setText('btnFinalizeSale', finalizeLabel());
  setText('cartEmpty', editingSaleId
    ? 'A venda ficou sem itens. Adicione produtos ou, para desfazer a venda inteira, use Cancelar venda nos detalhes dela.'
    : 'Clique em um produto para adicionar à venda.');
  if (currentScreen === 'venda') setText('screenTitle', editingSaleId ? 'Editar venda' : 'Nova venda');
}

function renderCart(){
  renderEditState();
  Object.keys(cart).forEach(pid => { if (!getProduct(pid) || cart[pid] <= 0) delete cart[pid]; });
  Object.keys(cartDiscounts).forEach(pid => { if (!cart[pid]) delete cartDiscounts[pid]; });
  const ids = Object.keys(cart);
  const has = ids.length > 0;
  $('#cartEmpty').style.display = has ? 'none' : 'block';
  $('#cartExtras').style.display = has ? 'block' : 'none';
  $('#btnClearCart').style.display = has ? '' : 'none';
  $('#cartList').innerHTML = ids.map(pid => {
    const p = getProduct(pid);
    const gross = lineGross(pid);
    const disc = lineDiscount(pid);
    const d = cartDiscounts[pid];
    const discBtn = d
      ? `<button class="disc-tag" data-act="disc" data-id="${pid}" title="Alterar desconto">${cartDiscountTag(pid)}</button>`
      : `<button class="link-btn ci-disc" data-act="disc" data-id="${pid}">＋ desconto</button>`;
    const unitTxt = d ? '<s>' + fmt(linePrice(pid)) + '</s> ' + fmt(unitNet(pid)) + ' un.' : fmt(linePrice(pid)) + ' un.';
    return `<div class="cart-item">
        <div class="ci-info">${productThumbHTML(p, 34, 'ci-thumb')}<div><div class="ci-name">${esc(p.name)}</div><div class="ci-meta">${unitTxt} ${discBtn}</div></div></div>
        <div class="qty-ctrl">
          <button class="qty-btn" data-act="dec" data-id="${pid}" aria-label="Diminuir">−</button>
          <span class="qty">${cart[pid]}</span>
          <button class="qty-btn" data-act="inc" data-id="${pid}" aria-label="Aumentar">+</button>
        </div>
        <div class="ci-total">${disc ? '<s>' + fmt(gross) + '</s>' : ''}${fmt(gross - disc)}</div>
        <button class="icon-btn" data-act="rm" data-id="${pid}" aria-label="Remover">✕</button>
      </div>`;
  }).join('');
  renderCustomerSelect();
  renderCartTotals();
  if (typeof updateMobileCartBar === 'function') updateMobileCartBar();
}

function renderCartTotals(){
  const sub = cartSubtotal();
  const itemDisc = cartItemsDiscount();
  const afterItems = round2(sub - itemDisc);
  const disc = cartDiscountValue();
  const discOk = !isNaN(disc) && disc >= 0 && disc <= afterItems;
  const total = round2(afterItems - (discOk ? disc : 0));
  setText('cartSubtotal', fmt(sub));
  $('#itemsDiscLine').style.display = itemDisc ? '' : 'none';
  setText('cartItemsDiscount', '− ' + fmt(itemDisc));
  setText('cartTotal', fmt(total));
  $('#discountError').style.display = discOk ? 'none' : 'block';
  $('#cartDiscount').classList.toggle('invalid', !discOk);

  const cashStr = $('#cashReceived').value.trim();
  const cash = parseMoney(cashStr);
  const el = $('#cashChange');
  if (!cashStr) { el.textContent = '—'; el.className = ''; }
  else if (isNaN(cash)) { el.textContent = 'Valor inválido'; el.className = 'neg'; }
  else if (cash < total) { el.textContent = 'Faltam ' + fmt(total - cash); el.className = 'neg'; }
  else { el.textContent = fmt(cash - total); el.className = 'pos'; }
}

function applySaleTypeUI(){
  $$('#saleTypeSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === ui.saleType));
  $$('#paymentSeg button').forEach(b => b.classList.toggle('active', b.dataset.pm === ui.pm));
  $$('#cardTypeSeg button').forEach(b => b.classList.toggle('active', b.dataset.ct === ui.cardType));
  const lock = editLockInfo();
  $$('#saleTypeSeg button').forEach(b => { b.disabled = !!lock; });
  $('#customerSelect').disabled = !!lock;
  $('#btnQuickCustomer').style.display = lock ? 'none' : '';
  const lockHint = $('#editLockHint');
  lockHint.style.display = lock ? '' : 'none';
  if (lock) lockHint.textContent = 'Esta venda fiado já recebeu ' + fmt(lock.paid) + ', então o tipo e o cliente não podem mudar. Itens, quantidades e descontos podem.';
  const fiado = ui.saleType === 'fiado';
  $('#paymentMethodWrap').style.display = fiado ? 'none' : 'block';
  $('#customerPickWrap').style.display = fiado ? 'block' : 'none';
  $('#cardTypeSeg').style.display = (!fiado && ui.pm === 'cartao') ? 'flex' : 'none';
  $('#cashWrap').style.display = (!fiado && ui.pm === 'dinheiro') ? 'block' : 'none';
}

function renderCustomerSelect(){
  const sel = $('#customerSelect');
  const sorted = [...state.customers].sort(byName);
  const sig = sorted.map(c => c.id + ':' + c.name).join('|');
  const prev = ui.selectCustomerId || sel.value;
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = '<option value="">Selecione o cliente…</option>' + sorted.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.dataset.sig = sig;
  }
  if (prev && sorted.some(c => c.id === prev)) {
    sel.value = prev;
    if (ui.selectCustomerId === prev) ui.selectCustomerId = null;
  }
  updateCustomerHint();
}
function updateCustomerHint(){
  const id = $('#customerSelect').value;
  if (!id) { setText('customerDebtHint', state.customers.length ? '' : 'Nenhum cliente cadastrado — use “Novo cliente”.'); return; }
  const d = customerDebt(id);
  setText('customerDebtHint', d > 0 ? 'Este cliente já deve ' + fmt(d) + '.' : 'Sem fiado em aberto.');
}

function getPaymentInfo(){
  if (ui.pm === 'cartao') return ui.cardType === 'credito'
    ? { method: 'cartao_credito', label: 'Cartão crédito' }
    : { method: 'cartao_debito', label: 'Cartão débito' };
  if (ui.pm === 'pix') return { method: 'pix', label: 'Pix' };
  return { method: 'dinheiro', label: 'Dinheiro' };
}

// Valida o carrinho e monta os dados da venda (usado na venda nova e na edição)
function buildSaleDraft(){
  const ids = Object.keys(cart).filter(k => cart[k] > 0);
  if (!ids.length) return null;
  for (const pid of ids) {
    const p = getProduct(pid);
    if (!p) { delete cart[pid]; renderVenda(); toast('Um produto do carrinho foi removido do cadastro. Confira o carrinho.', 'error'); return null; }
    if (cart[pid] > availableStock(pid)) { toast('Estoque insuficiente de ' + p.name + ' (disponível: ' + availableStock(pid) + ').', 'error'); return null; }
  }

  const subtotal = cartSubtotal();
  const itemsDiscount = cartItemsDiscount();
  const generalDiscount = cartDiscountValue();
  if (isNaN(generalDiscount) || generalDiscount < 0 || generalDiscount > round2(subtotal - itemsDiscount)) {
    toast('Corrija o valor do desconto geral.', 'error'); $('#cartDiscount').focus(); return null;
  }
  const discount = round2(itemsDiscount + generalDiscount);   // total de descontos da venda
  const total = round2(subtotal - discount);

  let customerId = null, payment = null, cashReceived = null, change = null;
  if (ui.saleType === 'fiado') {
    customerId = $('#customerSelect').value;
    if (!customerId) { toast('Selecione o cliente da venda fiado.', 'error'); $('#customerSelect').focus(); return null; }
  } else {
    payment = getPaymentInfo();
    if (payment.method === 'dinheiro') {
      const cashStr = $('#cashReceived').value.trim();
      if (cashStr) {
        cashReceived = parseMoney(cashStr);
        if (isNaN(cashReceived) || cashReceived < total) { toast('O valor recebido em dinheiro é menor que o total.', 'error'); $('#cashReceived').focus(); return null; }
        change = round2(cashReceived - total);
      }
    }
  }

  const items = ids.map(pid => {
    const p = getProduct(pid);
    const d = cartDiscounts[pid];
    return {
      productId: pid, name: p.name, category: p.category || 'Outros', qty: cart[pid], price: linePrice(pid), cost: lineCost(pid),
      discount: lineDiscount(pid),
      discountPct: d && d.type === 'pct' ? d.value : null,
      discountUnit: d && d.type === 'valor' ? d.value : null
    };
  });
  return {
    type: ui.saleType, customerId, items, subtotal, discount, itemsDiscount, generalDiscount, total,
    paymentMethod: payment ? payment.method : null,
    paymentLabel: payment ? payment.label : null,
    cashReceived, change
  };
}

function finalizeLabel(){ return editingSaleId ? 'Salvar alterações' : 'Finalizar venda'; }

async function finalizeSale(){
  if (savingSale || !requireDb()) return;
  if (editingSaleId) return saveEditedSale();
  const draft = buildSaleDraft();
  if (!draft) return;
  const number = nextSaleNumber();
  const seller = sellerInfo();
  const sale = Object.assign({ number, date: new Date().toISOString(), sellerId: seller.id, sellerName: seller.name }, draft, {
    paid: draft.type === 'avista',
    paidAmount: draft.type === 'avista' ? draft.total : 0,
    status: 'ativa'
  });

  const btn = $('#btnFinalizeSale');
  savingSale = true;
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    let saleId = null;
    await withSave(async () => {
      const ref = await db.collection('sales').add(sale);
      saleId = ref.id;
      for (const it of draft.items) {
        if (getProduct(it.productId)) await db.collection('products').doc(it.productId).update({ stock: db.increment(-it.qty) });
      }
    });
    const label = '#' + String(number).padStart(4, '0');
    toast('Venda ' + label + ' registrada: ' + fmt(draft.total) + (draft.change ? ' — troco ' + fmt(draft.change) : ''), 'ok',
      { label: 'Compartilhar', onClick: () => shareSale(saleId) });
    resetSaleForm();
  } catch (e) {
    toast(errMsg(e, 'Não foi possível salvar a venda. Tente de novo.'), 'error');
  } finally {
    savingSale = false;
    btn.disabled = false;
    btn.textContent = finalizeLabel();
  }
}

/* =========================================================
   EDITAR VENDA JÁ REALIZADA
   ========================================================= */
// Venda fiado que já recebeu pagamento: o tipo e o cliente não podem mudar
function editLockInfo(){
  const s = editingSaleId ? getSale(editingSaleId) : null;
  if (!s || s.type !== 'fiado' || !((s.paidAmount || 0) > 0)) return null;
  return { paid: s.paidAmount, customerId: s.customerId };
}

async function startEditSale(id){
  const s = getSale(id);
  if (!s || !isActive(s)) { toast('Só dá para editar vendas que não foram canceladas.', 'error'); return; }
  const missing = (s.items || []).filter(it => !getProduct(it.productId));
  if (missing.length) {
    toast('Não dá para editar: ' + missing.map(i => i.name).join(', ') + ' foi removido do cadastro de produtos.', 'error');
    return;
  }
  if (editingSaleId && editingSaleId !== id) {
    const other = getSale(editingSaleId);
    const ok = await confirmDialog({ title: 'Trocar de venda?', message: 'Você estava editando a venda ' + (other ? saleLabel(other) : '') + '. As alterações não salvas serão descartadas.', okLabel: 'Editar esta venda' });
    if (!ok) return;
  } else if (!editingSaleId && Object.keys(cart).length) {
    const ok = await confirmDialog({ title: 'Descartar o carrinho?', message: 'Há uma venda nova em andamento no carrinho. Ela será descartada para você editar a venda ' + saleLabel(s) + '.', okLabel: 'Descartar e editar' });
    if (!ok) return;
  }

  editingSaleId = id;
  cart = {}; cartDiscounts = {}; cartPrices = {}; editOriginalQty = {};
  (s.items || []).forEach(it => {
    const pid = it.productId;
    cart[pid] = (cart[pid] || 0) + it.qty;
    editOriginalQty[pid] = (editOriginalQty[pid] || 0) + it.qty;
    const p = getProduct(pid);
    cartPrices[pid] = { price: it.price, cost: typeof it.cost === 'number' ? it.cost : (p.costPrice || 0) };
    if (it.discountPct) cartDiscounts[pid] = { type: 'pct', value: it.discountPct };
    else if (it.discountUnit) cartDiscounts[pid] = { type: 'valor', value: it.discountUnit };
    else if (it.discount) cartDiscounts[pid] = { type: 'valor', value: round2(it.discount / it.qty) };
  });
  const general = saleGeneralDiscount(s);
  $('#cartDiscount').value = general > 0 ? fmtInput(general) : '';
  $('#cashReceived').value = typeof s.cashReceived === 'number' ? fmtInput(s.cashReceived) : '';
  ui.saleType = s.type === 'fiado' ? 'fiado' : 'avista';
  const m = s.paymentMethod || 'dinheiro';
  if (m === 'cartao_debito' || m === 'cartao_credito') { ui.pm = 'cartao'; ui.cardType = m === 'cartao_credito' ? 'credito' : 'debito'; }
  else { ui.pm = m === 'pix' ? 'pix' : 'dinheiro'; ui.cardType = 'debito'; }
  ui.selectCustomerId = s.customerId || null;
  ui.vendaSearch = ''; $('#vendaSearch').value = '';
  closeModal();
  applySaleTypeUI();
  goTo('venda');
  toast('Editando a venda ' + saleLabel(s) + '. Altere o que precisar e clique em Salvar alterações.');
}

async function saveEditedSale(){
  const s = getSale(editingSaleId);
  if (!s || !isActive(s)) {
    toast('Esta venda não existe mais ou foi cancelada. A edição foi encerrada.', 'error');
    resetSaleForm();
    return;
  }
  const draft = buildSaleDraft();
  if (!draft) return;

  const lock = editLockInfo();
  if (lock) {
    if (draft.type !== 'fiado' || draft.customerId !== lock.customerId) { toast('Esta venda já recebeu ' + fmt(lock.paid) + ': o tipo e o cliente não podem mudar.', 'error'); return; }
    if (draft.total < lock.paid - 0.004) { toast('Esta venda já recebeu ' + fmt(lock.paid) + '. O novo total não pode ser menor que isso.', 'error'); return; }
  }

  const now = new Date().toISOString();
  const paidBefore = s.type === 'fiado' ? (s.paidAmount || 0) : 0;
  const patch = Object.assign({}, draft, {
    paid: draft.type === 'avista' ? true : paidBefore >= draft.total - 0.004,
    paidAmount: draft.type === 'avista' ? draft.total : paidBefore,
    editedAt: now,
    edits: (s.edits || []).concat([{ at: now, by: sellerInfo().name, totalAntes: s.total, itensAntes: itemsSummary(s), formaAntes: methodLabel(s) }])
  });
  if (draft.type === 'fiado' && patch.paid && !s.paid) patch.paidDate = now;

  // Estoque: devolve o que era da venda e retira o que ficou
  const deltas = {};
  (s.items || []).forEach(it => { deltas[it.productId] = (deltas[it.productId] || 0) + it.qty; });
  draft.items.forEach(it => { deltas[it.productId] = (deltas[it.productId] || 0) - it.qty; });

  const btn = $('#btnFinalizeSale');
  savingSale = true;
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    await withSave(async () => {
      await db.collection('sales').doc(s.id).update(patch);
      for (const pid of Object.keys(deltas)) {
        if (deltas[pid] !== 0 && getProduct(pid)) await db.collection('products').doc(pid).update({ stock: db.increment(deltas[pid]) });
      }
    });
    const id = s.id;
    toast('Venda ' + saleLabel(s) + ' atualizada: ' + fmt(s.total) + ' → ' + fmt(draft.total) + '.', 'ok',
      { label: 'Ver venda', onClick: () => openSaleDetails(id) });
    resetSaleForm();
    goTo('vendas');
  } catch (e) {
    toast(errMsg(e, 'Não foi possível salvar as alterações. Tente de novo.'), 'error');
  } finally {
    savingSale = false;
    btn.disabled = false;
    btn.textContent = finalizeLabel();
  }
}

function resetSaleForm(){
  cart = {};
  cartDiscounts = {};
  editingSaleId = null;
  cartPrices = {};
  editOriginalQty = {};
  ui.selectCustomerId = null;
  $('#cartDiscount').value = '';
  $('#cashReceived').value = '';
  $('#customerSelect').value = '';
  ui.saleType = 'avista'; ui.pm = 'dinheiro'; ui.cardType = 'debito';
  ui.vendaSearch = ''; $('#vendaSearch').value = '';
  applySaleTypeUI();
  renderVenda();
  if (canAutoFocus()) $('#vendaSearch').focus();
}

function openQuickCustomer(){
  const sheet = openModal(`
    <h3>Novo cliente</h3>
    <div class="sub">O cliente fica salvo para as próximas vendas.</div>
    <label class="field-label" for="qcName">Nome</label>
    <input type="text" id="qcName" placeholder="Ex: João da Padaria" autocomplete="off">
    <label class="field-label" for="qcPhone">Telefone (opcional)</label>
    <input type="tel" id="qcPhone" placeholder="(00) 00000-0000" autocomplete="off">
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="qcSave">Salvar cliente</button>
    </div>`);
  $('#qcSave', sheet).addEventListener('click', async () => {
    if (!requireDb()) return;
    const name = $('#qcName', sheet).value.trim();
    const phone = $('#qcPhone', sheet).value.trim();
    if (!name) { toast('Digite o nome do cliente.', 'error'); return; }
    if (state.customers.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) { toast('Já existe um cliente com esse nome.', 'error'); return; }
    try {
      const ref = await withSave(() => db.collection('customers').add({ name, phone, createdAt: new Date().toISOString() }));
      ui.selectCustomerId = ref.id;
      closeModal();
      toast('Cliente ' + name + ' cadastrado.');
      renderCustomerSelect();
    } catch (e) { toast(errMsg(e, 'Não foi possível salvar o cliente.'), 'error'); }
  });
}

/* ---------- Eventos da tela ---------- */
$('#vendaSearch').addEventListener('input', e => { ui.vendaSearch = e.target.value; renderVenda(); });
$('#vendaSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = vendaFilteredProducts().find(p => !isOut(p));
    if (!first) { toast('Nenhum produto disponível para essa busca.', 'error'); return; }
    if (addToCart(first.id)) { ui.vendaSearch = ''; e.target.value = ''; renderVenda(); }
  } else if (e.key === 'Escape') { ui.vendaSearch = ''; e.target.value = ''; renderVenda(); }
});
$('#pickProducts').addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (b && !b.disabled) addToCart(b.dataset.add);
});
$('#cartList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'inc') { addToCart(id); return; }
  if (b.dataset.act === 'disc') { openItemDiscount(id); return; }
  if (b.dataset.act === 'dec') cart[id] = Math.max(0, (cart[id] || 0) - 1);
  if (b.dataset.act === 'rm') { delete cart[id]; delete cartDiscounts[id]; }
  renderVenda();
});
$('#btnClearCart').addEventListener('click', () => { cart = {}; cartDiscounts = {}; renderVenda(); });
$('#btnCancelEdit').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: 'Cancelar edição?', message: 'As alterações feitas nesta venda serão descartadas. A venda continua como estava.', okLabel: 'Descartar alterações' });
  if (!ok) return;
  const id = editingSaleId;
  resetSaleForm();
  goTo('vendas');
  if (id && getSale(id)) openSaleDetails(id);
});
$('#cartDiscount').addEventListener('input', () => { renderCartTotals(); updateMobileCartBar(); });
$('#cashReceived').addEventListener('input', renderCartTotals);
$('#saleTypeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.saleType = b.dataset.type; applySaleTypeUI(); });
$('#paymentSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.pm = b.dataset.pm; applySaleTypeUI(); });
$('#cardTypeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.cardType = b.dataset.ct; applySaleTypeUI(); });
$('#customerSelect').addEventListener('change', updateCustomerHint);
$('#btnQuickCustomer').addEventListener('click', openQuickCustomer);
$('#btnFinalizeSale').addEventListener('click', finalizeSale);
