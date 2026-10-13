/* screens/gastos.js
   Tela Gastos: despesas pagas e contas a pagar (com vencimento), por categoria,
   com lucro líquido do período (lucro das vendas − gastos pagos). */

/* =========================================================
   GASTOS
   ========================================================= */
function expenseCategoriesInUse(){
  return [...new Set(state.expenses.map(e => e.category || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function allExpenseCategories(){
  return [...new Set([...EXPENSE_CATEGORIES, ...expenseCategoriesInUse()])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function expenseStatusTag(e){
  if (!expenseIsOpen(e)) return '<span class="tag ok">Pago</span>';
  return expenseIsOverdue(e) ? '<span class="tag pend">Vencida</span>' : '<span class="tag neutral">A pagar</span>';
}

/* ---------- Formulário ---------- */
function setExpStatus(s){
  ui.expStatus = s;
  $$('#expStatusSeg button').forEach(b => b.classList.toggle('active', b.dataset.st === s));
  setText('expDateLabel', s === 'apagar' ? 'Vencimento' : 'Data do pagamento');
  $('#expMethodWrap').style.display = s === 'pago' ? '' : 'none';
}

function resetExpenseForm(){
  ui.editingExpenseId = null;
  setText('expFormTitle', 'Novo gasto');
  setText('btnSaveExpense', 'Adicionar gasto');
  $('#btnCancelExpenseEdit').style.display = 'none';
  $('#expenseFormPanel').classList.remove('editing');
  ['expDesc', 'expCategory', 'expAmount', 'expNotes'].forEach(id => { $('#' + id).value = ''; });
  $('#expDate').value = dayKey(new Date());
  $('#expMethod').value = 'dinheiro';
  setExpStatus('pago');
  renderGastos();
}

function editExpense(id){
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  ui.editingExpenseId = id;
  setText('expFormTitle', 'Editar gasto');
  setText('btnSaveExpense', 'Salvar alterações');
  $('#btnCancelExpenseEdit').style.display = '';
  $('#expenseFormPanel').classList.add('editing');
  $('#expDesc').value = e.description || '';
  $('#expCategory').value = e.category || '';
  $('#expAmount').value = fmtInput(e.amount || 0);
  $('#expDate').value = e.date || dayKey(new Date());
  $('#expNotes').value = e.notes || '';
  $('#expMethod').value = e.method || 'dinheiro';
  setExpStatus(e.status === 'apagar' ? 'apagar' : 'pago');
  renderGastos();
  openMobileForm('expenseFormPanel', false);
  $('#expenseFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusLater(() => $('#expDesc'), 200);
}

async function saveExpense(){
  if (!requireDb()) return;
  const description = $('#expDesc').value.trim();
  const category = $('#expCategory').value.trim() || 'Outros';
  const amount = parseMoney($('#expAmount').value);
  const date = $('#expDate').value;
  const notes = $('#expNotes').value.trim();
  if (!description) { toast('Descreva o gasto (ex.: Conta de luz).', 'error'); $('#expDesc').focus(); return; }
  if (isNaN(amount) || amount <= 0) { toast('Digite um valor válido.', 'error'); $('#expAmount').focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Escolha a data.', 'error'); $('#expDate').focus(); return; }

  const paid = ui.expStatus === 'pago';
  const data = { description, category, amount, date, status: paid ? 'pago' : 'apagar', method: paid ? $('#expMethod').value : null, notes };
  const editing = ui.editingExpenseId;
  const btn = $('#btnSaveExpense');
  btn.disabled = true;
  try {
    await withSave(() => editing
      ? db.collection('expenses').doc(editing).update(data)
      : db.collection('expenses').add(Object.assign({ createdAt: new Date().toISOString(), createdBy: sellerInfo().name }, data)));
    toast(editing ? 'Gasto atualizado.' : (paid ? 'Gasto de ' + fmt(amount) + ' registrado.' : 'Conta a pagar registrada: vence em ' + fmtDate(keyToDate(date).toISOString()) + '.'));
    resetExpenseForm();
    if (canAutoFocus()) $('#expDesc').focus();
  } catch (e) {
    toast(errMsg(e, 'Não foi possível salvar o gasto.'), 'error');
  } finally { btn.disabled = false; }
}

async function deleteExpense(id){
  const e = state.expenses.find(x => x.id === id);
  if (!e || !requireDb()) return;
  const ok = await confirmDialog({ title: 'Remover gasto?', message: '“' + e.description + '” de ' + fmt(e.amount) + ' será removido.', okLabel: 'Remover', danger: true });
  if (!ok) return;
  try {
    await withSave(() => db.collection('expenses').doc(id).delete());
    if (ui.editingExpenseId === id) resetExpenseForm();
    toast('Gasto removido.');
  } catch (err) { toast(errMsg(err, 'Não foi possível remover o gasto.'), 'error'); }
}

// Marca uma conta a pagar como paga, escolhendo a forma e a data do pagamento
function openPayExpense(id){
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  const today = dayKey(new Date());
  const sheet = openModal(`
    <h3>Pagar conta</h3>
    <div class="sub">${esc(e.description)} — <b>${fmt(e.amount)}</b>, ${expenseIsOverdue(e) ? 'venceu' : 'vence'} em ${fmtDate(keyToDate(e.date).toISOString())}.</div>
    <div class="row-2">
      <div>
        <label class="field-label" for="peMethod">Forma de pagamento</label>
        <select id="peMethod">${Object.keys(EXPENSE_METHODS).map(k => `<option value="${k}">${EXPENSE_METHODS[k]}</option>`).join('')}</select>
      </div>
      <div>
        <label class="field-label" for="peDate">Data do pagamento</label>
        <input type="date" id="peDate" value="${today}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="peOk">Confirmar pagamento</button>
    </div>`);
  $('#peOk', sheet).addEventListener('click', async ev => {
    if (!requireDb()) return;
    const d = $('#peDate', sheet).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Escolha a data do pagamento.', 'error'); return; }
    ev.target.disabled = true;
    try {
      await withSave(() => db.collection('expenses').doc(id).update({
        status: 'pago', method: $('#peMethod', sheet).value, date: d, dueDate: e.date,
        paidAt: d === today ? new Date().toISOString() : null
      }));
      closeModal();
      toast('Conta paga: ' + e.description + ' (' + fmt(e.amount) + ').');
    } catch (err) {
      ev.target.disabled = false;
      toast(errMsg(err, 'Não foi possível registrar o pagamento.'), 'error');
    }
  });
}

/* ---------- Lista e resumo ---------- */
function filteredExpenses(){
  const r = periodRange(ui.gastosPeriod);
  const q = ui.gastosSearch.trim().toLowerCase();
  const openOnly = ui.gastosStatus === 'apagar' || ui.gastosStatus === 'vencido';
  return state.expenses.filter(e => {
    if (ui.gastosStatus === 'pago' && expenseIsOpen(e)) return false;
    if (ui.gastosStatus === 'apagar' && !expenseIsOpen(e)) return false;
    if (ui.gastosStatus === 'vencido' && !expenseIsOverdue(e)) return false;
    if (!openOnly && !expenseInRange(e, r)) return false;        // contas em aberto aparecem sempre nesses filtros
    if (ui.gastosCat !== 'Todas' && (e.category || 'Outros') !== ui.gastosCat) return false;
    if (q && !((e.description || '') + ' ' + (e.category || '') + ' ' + (e.notes || '')).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const ao = expenseIsOpen(a), bo = expenseIsOpen(b);
    if (ao !== bo) return ao ? -1 : 1;                          // contas a pagar primeiro
    return ao ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
}

function expenseRowHTML(e){
  const when = expenseIsOpen(e)
    ? (expenseIsOverdue(e) ? '<span class="neg">Venceu em ' + fmtDate(keyToDate(e.date).toISOString()) + '</span>' : 'Vence em ' + fmtDate(keyToDate(e.date).toISOString()))
    : 'Pago em ' + fmtDate(keyToDate(e.date).toISOString()) + (e.method ? ' — ' + (EXPENSE_METHODS[e.method] || e.method) : '');
  return `
    <div class="list-row ${e.id === ui.editingExpenseId ? 'editing' : ''}">
      <div class="lr-main">
        <div class="name">${esc(e.description)} ${expenseStatusTag(e)}</div>
        <div class="meta">${esc(e.category || 'Outros')} — ${when}${e.notes ? ' — ' + esc(e.notes) : ''}</div>
      </div>
      <div class="right">
        <span class="amount rust">${fmt(e.amount)}</span>
        <div class="row-actions">
          ${expenseIsOpen(e) ? `<button class="btn btn-primary btn-xs" data-epay="${e.id}">Pagar</button>` : ''}
          <button class="btn btn-outline btn-xs" data-eedit="${e.id}">Editar</button>
          <button class="icon-btn" data-edel="${e.id}" aria-label="Remover gasto">✕</button>
        </div>
      </div>
    </div>`;
}

function renderGastos(){
  $('#expCategoryOptions').innerHTML = allExpenseCategories().map(c => '<option value="' + esc(c) + '"></option>').join('');
  renderChips('#gastosPeriodChips', PERIODS, ui.gastosPeriod, v => { ui.gastosPeriod = v; renderGastos(); });
  renderChips('#gastosStatusChips', EXPENSE_STATUS, ui.gastosStatus, v => { ui.gastosStatus = v; renderGastos(); });

  const cats = expenseCategoriesInUse();
  if (ui.gastosCat !== 'Todas' && !cats.includes(ui.gastosCat)) ui.gastosCat = 'Todas';
  const sel = $('#gastosCat');
  const sig = cats.join('|');
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = '<option value="Todas">Todas as categorias</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.dataset.sig = sig;
  }
  sel.value = ui.gastosCat;

  // Resumo do período
  const r = periodRange(ui.gastosPeriod);
  const pagos = paidExpensesIn(r);
  const totalPago = sumBy(pagos, e => e.amount);
  const vendas = state.sales.filter(s => isActive(s) && inRange(s.date, r));
  const lucroBruto = sumBy(vendas, saleProfit);
  const abertas = state.expenses.filter(expenseIsOpen);
  const vencidas = abertas.filter(expenseIsOverdue);
  const periodLabel = (PERIODS.find(p => p[0] === ui.gastosPeriod) || ['', ''])[1].toLowerCase();

  setText('gStatPagos', fmt(totalPago));
  setText('gStatPagosSub', plural(pagos.length, 'gasto', 'gastos') + ' — ' + periodLabel);
  setText('gStatAberto', fmt(sumBy(abertas, e => e.amount)));
  setText('gStatAbertoSub', plural(abertas.length, 'conta', 'contas') + (vencidas.length ? ', ' + plural(vencidas.length, 'vencida', 'vencidas') : ''));
  const liq = round2(lucroBruto - totalPago);
  setText('gStatLiquido', fmt(liq));
  $('#gStatLiquido').style.color = liq < 0 ? 'var(--rust)' : '';
  setText('gStatLiquidoSub', 'Lucro das vendas ' + fmt(lucroBruto) + ' − gastos ' + fmt(totalPago));

  // Gráfico por categoria (gastos pagos no período)
  const byCat = {};
  pagos.forEach(e => { const c = e.category || 'Outros'; byCat[c] = round2((byCat[c] || 0) + e.amount); });
  let keys = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  let vals = keys.map(k => byCat[k]);
  if (keys.length > 7) {
    const rest = round2(vals.slice(6).reduce((a, v) => a + v, 0));
    keys = keys.slice(0, 6).concat(['Outras categorias']);
    vals = vals.slice(0, 6).concat([rest]);
  }
  setChart('chartGastosCat', 'donut', {
    labels: keys, values: vals,
    colors: keys.map((k, i) => CAT_PALETTE[i % CAT_PALETTE.length]),
    centerLabel: 'gastos pagos',
    aria: 'Gastos por categoria',
    clickHint: 'Clique para filtrar a lista por esta categoria',
    onClick: i => { if (keys[i] === 'Outras categorias') return; ui.gastosCat = keys[i]; ui.gastosStatus = 'todos'; renderGastos(); }
  }, keys.length === 0);

  // Lista
  const wrap = $('#expenseList');
  if (!isReady()) { wrap.innerHTML = loadingHTML(); return; }
  if (!state.expenses.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum gasto registrado ainda. Use o formulário ao lado para lançar despesas como aluguel, luz, compra de mercadoria ou contas a pagar.</div>';
    setText('gastosSummary', '');
    return;
  }
  const list = filteredExpenses();
  setText('gastosSummary', list.length ? plural(list.length, 'lançamento', 'lançamentos') + ' somando ' + fmt(sumBy(list, e => e.amount)) : '');
  wrap.innerHTML = list.length ? list.map(expenseRowHTML).join('') : '<div class="empty-state">Nenhum gasto encontrado com esses filtros.</div>';
}

/* ---------- Eventos da tela ---------- */
$('#expStatusSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setExpStatus(b.dataset.st); });
$('#btnSaveExpense').addEventListener('click', saveExpense);
$('#btnCancelExpenseEdit').addEventListener('click', resetExpenseForm);
$$('#expenseFormPanel input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveExpense(); } }));
$('#gastosCat').addEventListener('change', e => { ui.gastosCat = e.target.value; renderGastos(); });
$('#gastosSearch').addEventListener('input', e => { ui.gastosSearch = e.target.value; renderGastos(); });
$('#btnExportGastos').addEventListener('click', exportGastos);
$('#expenseList').addEventListener('click', e => {
  const pay = e.target.closest('[data-epay]'); if (pay) { openPayExpense(pay.dataset.epay); return; }
  const ed = e.target.closest('[data-eedit]'); if (ed) { editExpense(ed.dataset.eedit); return; }
  const del = e.target.closest('[data-edel]'); if (del) { deleteExpense(del.dataset.edel); return; }
});
$('#expDate').value = dayKey(new Date());
$('#btnBillsNotice').addEventListener('click', () => { ui.gastosStatus = 'vencido'; ui.gastosCat = 'Todas'; goTo('gastos'); });
