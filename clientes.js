/* screens/clientes.js
   Tela Clientes: cadastro, edição e histórico de compras. */

/* =========================================================
   CLIENTES
   ========================================================= */
function resetCustomerForm(){
  ui.editingCustomerId = null;
  setText('custFormTitle', 'Novo cliente');
  setText('btnSaveCustomer', 'Adicionar cliente');
  $('#btnCancelCustomerEdit').style.display = 'none';
  $('#customerFormPanel').classList.remove('editing');
  $('#custName').value = '';
  $('#custPhone').value = '';
  renderClientes();
}

function editCustomer(id){
  const c = getCustomer(id);
  if (!c) return;
  ui.editingCustomerId = id;
  setText('custFormTitle', 'Editar cliente');
  setText('btnSaveCustomer', 'Salvar alterações');
  $('#btnCancelCustomerEdit').style.display = '';
  $('#customerFormPanel').classList.add('editing');
  $('#custName').value = c.name || '';
  $('#custPhone').value = c.phone || '';
  renderClientes();
  openMobileForm('customerFormPanel', false);
  $('#customerFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusLater(() => $('#custName'), 200);
}

async function saveCustomer(){
  if (!requireDb()) return;
  const name = $('#custName').value.trim();
  const phone = $('#custPhone').value.trim();
  if (!name) { toast('Digite o nome do cliente.', 'error'); $('#custName').focus(); return; }
  if (state.customers.some(c => c.id !== ui.editingCustomerId && c.name.trim().toLowerCase() === name.toLowerCase())) {
    toast('Já existe um cliente com esse nome.', 'error'); $('#custName').focus(); return;
  }
  const editing = ui.editingCustomerId;
  const btn = $('#btnSaveCustomer');
  btn.disabled = true;
  try {
    await withSave(() => editing
      ? db.collection('customers').doc(editing).update({ name, phone })
      : db.collection('customers').add({ name, phone, createdAt: new Date().toISOString() }));
    toast(editing ? 'Cliente atualizado.' : name + ' cadastrado.');
    resetCustomerForm();
    if (canAutoFocus()) $('#custName').focus();
  } catch (e) {
    toast(errMsg(e, 'Não foi possível salvar o cliente.'), 'error');
  } finally { btn.disabled = false; }
}

async function deleteCustomer(id){
  const c = getCustomer(id);
  if (!c || !requireDb()) return;
  const debt = customerDebt(id);
  if (debt > 0) { toast(c.name + ' ainda deve ' + fmt(debt) + '. Receba ou cancele as vendas antes de remover.', 'error'); return; }
  const ok = await confirmDialog({ title: 'Remover cliente?', message: '“' + c.name + '” será removido do cadastro. As vendas antigas continuam no histórico.', okLabel: 'Remover', danger: true });
  if (!ok) return;
  try {
    await withSave(() => db.collection('customers').doc(id).delete());
    if (ui.editingCustomerId === id) resetCustomerForm();
    toast('Cliente removido.');
  } catch (e) { toast(errMsg(e, 'Não foi possível remover o cliente.'), 'error'); }
}

function renderClientes(){
  const wrap = $('#customerList');
  setText('custSummary', state.customers.length ? plural(state.customers.length, 'cliente', 'clientes') : '');
  if (!isReady()) { wrap.innerHTML = loadingHTML(); return; }
  if (!state.customers.length) { wrap.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado. Use o formulário ao lado para adicionar.</div>'; return; }
  const q = ui.custSearch.trim().toLowerCase();
  const list = state.customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)).sort(byName);
  if (!list.length) { wrap.innerHTML = '<div class="empty-state">Nenhum cliente encontrado.</div>'; return; }
  wrap.innerHTML = list.map(c => {
    const debt = customerDebt(c.id);
    const purchases = state.sales.filter(s => s.customerId === c.id && isActive(s));
    return `
      <div class="list-row clickable ${c.id === ui.editingCustomerId ? 'editing' : ''}" data-cdetails="${c.id}">
        <div class="lr-main">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${c.phone ? esc(c.phone) + ' — ' : ''}${plural(purchases.length, 'compra', 'compras')}${purchases.length ? ', total ' + fmt(sumBy(purchases, s => s.total)) : ''}</div>
        </div>
        <div class="right">
          ${debt > 0.004 ? '<span class="tag pend">Deve ' + fmt(debt) + '</span>' : '<span class="tag ok">Em dia</span>'}
          <div class="row-actions">
            <button class="btn btn-outline btn-xs" data-cedit="${c.id}">Editar</button>
            <button class="icon-btn" data-cdel="${c.id}" aria-label="Remover cliente">✕</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ---------- Eventos da tela ---------- */
$('#btnSaveCustomer').addEventListener('click', saveCustomer);
$('#btnCancelCustomerEdit').addEventListener('click', resetCustomerForm);
$('#custSearch').addEventListener('input', e => { ui.custSearch = e.target.value; renderClientes(); });
$$('#customerFormPanel input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomer(); } }));
