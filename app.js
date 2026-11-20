/* app.js
   Liga tudo: conexão com o banco, login, navegação entre telas e inicialização. */

/* =========================================================
   Conexão com o banco (local ou Firebase — ver storage.js)
   ========================================================= */
async function connect(){
  const cfg = window.APP_CONFIG || {};
  try {
    if (cfg.armazenamento === 'firebase') {
      storageMode = 'firebase';
      const fb = cfg.firebase || {};
      if (!fb.apiKey || !fb.projectId) throw new Error('as chaves do Firebase não foram preenchidas em config.js');
      db = await createFirebaseDb(fb);
      db.auth.onChange(user => {
        if (user) {
          currentUser = { id: user.uid, name: user.email, username: user.email, admin: true };
          enterApp();
          subscribeAll();
        } else {
          unsubscribeAll();
          currentUser = null;
          showAuthScreen('firebase');
          setSync('offline');
          setText('syncText', 'Desconectado');
        }
        renderConfig();
      });
      window.addEventListener('online', () => { if (pendingWrites === 0) setSync('ok'); });
      window.addEventListener('offline', () => setSync('pending'));
    } else if (cfg.armazenamento === 'claude' && window.claude && typeof window.claude.use === 'function') {
      storageMode = 'claude';
      db = await createClaudeDb();
      subscribeAll();
    } else {
      storageMode = 'local';
      db = createLocalDb();
      await db.init();
      subscribeAll();
    }
  } catch (e) {
    console.error(e);
    db = null;
    offline = true;
    $('#loginOverlay').classList.add('hidden');   // sem banco não há o que proteger: mostra o erro
    setSync('offline');
    const banner = $('#offlineBanner');
    banner.textContent = 'Não foi possível abrir o banco de dados (' + (e && e.message ? e.message : e) + '). Confira o arquivo config.js e a sua internet, depois recarregue a página.';
    banner.style.display = 'block';
    scheduleRender();
  }
}

function subscribeAll(){
  unsubscribeAll();
  COLLECTIONS.forEach(name => {
    // No Firebase o login é do próprio Firebase: a lista de usuários do sistema não é usada
    if (name === 'users' && storageMode === 'firebase') { loaded.users = true; return; }
    const stop = db.collection(name).onSnapshot(snap => {
      state[name] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      loaded[name] = true;
      if (name === 'users') evaluateAuth();
      if (isReady() && pendingWrites === 0) setSync(storageMode === 'firebase' && navigator.onLine === false ? 'pending' : 'ok');
      scheduleRender();
    }, err => {
      console.error(err);
      setSync('offline');
      const banner = $('#offlineBanner');
      banner.textContent = errMsg(err, 'Perdemos a conexão com o banco de dados. Recarregue a página.');
      banner.style.display = 'block';
    });
    unsubscribers.push(stop);
  });
}

function unsubscribeAll(){
  unsubscribers.forEach(stop => { try { stop(); } catch (e) { /* já encerrado */ } });
  unsubscribers = [];
  COLLECTIONS.forEach(n => { state[n] = []; loaded[n] = false; });
  cart = {};
  scheduleRender();
}

window.addEventListener('storage-error', e => {
  toast(errMsg(e.detail, 'Uma alteração não pôde ser enviada para a nuvem. Confira a internet e as regras do Firebase.'), 'error');
});

/* =========================================================
   Navegação e renderização
   ========================================================= */
function goTo(screen){
  if (!SCREEN_TITLES[screen]) return;
  currentScreen = screen;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.goto === screen));
  $('#btnMore').classList.toggle('active', MORE_SCREENS.includes(screen));
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen));
  setText('screenTitle', SCREEN_TITLES[screen]);
  $('#btnHeaderVenda').style.display = screen === 'venda' ? 'none' : '';
  renderAll();
  window.scrollTo(0, 0);
  if (screen === 'venda') focusLater(() => $('#vendaSearch'), 60);
}

function scheduleRender(){
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}

function renderAll(){
  renderBadges();
  renderInicio();
  renderVenda();
  renderVendas();
  renderCaixa();
  renderFiado();
  renderProdutos();
  renderClientes();
  renderRelatorio();
  renderGastos();
  renderConfig();
  applyBrand();
}

function renderBadges(){
  const debtors = new Set(openFiadoSales().map(s => s.customerId)).size;
  setText('navFiadoBadge', debtors ? String(debtors) : '');
  const restock = state.products.filter(needsRestock).length;
  setText('navStockBadge', restock ? String(restock) : '');
  const pendingAccounts = currentUser && currentUser.admin && usesAppLogin() ? state.users.filter(u => !isActiveUser(u)).length : 0;
  setText('navConfigBadge', pendingAccounts ? String(pendingAccounts) : '');
  const an = $('#accountsNotice');
  if (pendingAccounts) {
    setText('accountsNoticeText', pendingAccounts === 1 ? 'Uma conta nova está aguardando a sua aprovação.' : pendingAccounts + ' contas novas estão aguardando a sua aprovação.');
    an.style.display = 'flex';
  } else an.style.display = 'none';
  const overdue = state.expenses.filter(expenseIsOverdue).length;
  // Celular: bolinha no "Mais" quando algo lá dentro pede atenção
  $('#moreDot').style.display = (restock || overdue || pendingAccounts) ? '' : 'none';
  $('#fiadoDot').style.display = debtors ? '' : 'none';
  setText('navGastosBadge', overdue ? String(overdue) : '');
}

function renderChips(sel, options, selected, onSelect){
  const wrap = $(sel);
  wrap.innerHTML = options.map(o => {
    const value = Array.isArray(o) ? o[0] : o;
    const label = Array.isArray(o) ? o[1] : o;
    return '<button class="chip' + (value === selected ? ' active' : '') + '" data-value="' + esc(value) + '">' + esc(label) + '</button>';
  }).join('');
  wrap.onclick = e => { const b = e.target.closest('.chip'); if (b) onSelect(b.dataset.value); };
}

/* =========================================================
   Eventos globais (cliques em listas, atalhos de teclado)
   ========================================================= */
document.addEventListener('click', e => {
  const chartItem = e.target.closest('.svg-chart .item');
  if (chartItem) {
    const st = chartStore[chartItem.closest('.svg-chart').id];
    if (st && typeof st.cfg.onClick === 'function') { hideChartTip(); st.cfg.onClick(Number(chartItem.getAttribute('data-ci'))); }
    return;
  }
  const go = e.target.closest('[data-goto]');
  if (go) { if (modalOpen()) closeModal(); goTo(go.dataset.goto); return; }
  const stock = e.target.closest('[data-stock]');
  if (stock) { openStockModal(stock.dataset.stock); return; }
  const pedit = e.target.closest('[data-pedit]');
  if (pedit) { editProduct(pedit.dataset.pedit); return; }
  const pdel = e.target.closest('[data-pdel]');
  if (pdel) { deleteProduct(pdel.dataset.pdel); return; }
  const cedit = e.target.closest('[data-cedit]');
  if (cedit) { editCustomer(cedit.dataset.cedit); return; }
  const cdel = e.target.closest('[data-cdel]');
  if (cdel) { deleteCustomer(cdel.dataset.cdel); return; }
  const stmt = e.target.closest('[data-statement]');
  if (stmt) { shareStatement(stmt.dataset.statement); return; }
  const rec = e.target.closest('[data-receive]');
  if (rec) { openReceiveModal(rec.dataset.receive); return; }
  const cdet = e.target.closest('[data-cdetails]');
  if (cdet) { openCustomerDetails(cdet.dataset.cdetails); return; }
  const sale = e.target.closest('[data-sale]');
  if (sale) { openSaleDetails(sale.dataset.sale); return; }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (confirmDone) { confirmDone(false); return; }
    if (modalOpen()) { closeModal(); return; }
  }
  if (e.key === 'F2') { e.preventDefault(); if (modalOpen()) closeModal(); goTo('venda'); }
});

/* =========================================================
   Celular: menu "Mais", formulários sob demanda e barra do carrinho
   ========================================================= */
const MORE_SCREENS = ['caixa', 'gastos', 'produtos', 'clientes', 'relatorio', 'config'];

function openMoreMenu(){
  const badge = id => { const t = ($('#' + id) || {}).textContent; return t ? '<span class="nav-badge">' + esc(t) + '</span>' : ''; };
  const items = [
    ['caixa', '▣', 'Caixa do dia', ''], ['gastos', '↧', 'Gastos', badge('navGastosBadge')],
    ['produtos', '▦', 'Produtos', badge('navStockBadge')], ['clientes', '☺', 'Clientes', ''],
    ['relatorio', '▲', 'Relatório', ''], ['config', '⚙', 'Configurações', badge('navConfigBadge')]
  ];
  const b = brandInfo();
  const sheet = openModal(`
    <div class="brand more-brand ${b.logo ? 'has-logo' : ''}">${brandHTML(b)}</div>
    <div class="more-grid">
      ${items.map(i => `<button class="more-item ${currentScreen === i[0] ? 'active' : ''}" data-goto="${i[0]}"><span class="ic">${i[1]}</span><span>${i[2]}</span>${i[3]}</button>`).join('')}
    </div>
    ${currentUser ? `<div class="more-user"><span>Conectado como <b>${esc(currentUser.name)}</b></span><button class="btn btn-outline btn-small" id="mmLogout">Sair</button></div>` : ''}
    <div class="modal-actions"><button class="btn btn-outline" data-close>Fechar</button></div>`);
  const lo = $('#mmLogout', sheet);
  if (lo) lo.addEventListener('click', () => { closeModal(); logout(); });
}

function openMobileForm(panelId, scroll){
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.remove('m-collapsed');
  const toggle = document.querySelector('[data-mopen="' + panelId + '"]');
  if (toggle) toggle.classList.add('m-hidden');
  if (scroll !== false && isMobileLayout()) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeMobileForm(panelId){
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.add('m-collapsed');
  const toggle = document.querySelector('[data-mopen="' + panelId + '"]');
  if (toggle) toggle.classList.remove('m-hidden');
}

// Barra do carrinho: aparece no celular quando há itens e o carrinho não está visível na tela
let cartPanelInView = false;
function updateMobileCartBar(){
  const bar = $('#mobileCartBar');
  const ids = Object.keys(cart).filter(k => cart[k] > 0);
  const n = ids.reduce((a, k) => a + cart[k], 0);
  const show = isMobileLayout() && ids.length > 0 && !authScreen && !(currentScreen === 'venda' && cartPanelInView);
  bar.style.display = show ? 'flex' : 'none';
  document.body.classList.toggle('has-cart-bar', show);
  if (!show) return;
  setText('mcbCount', plural(n, 'item', 'itens') + (editingSaleId ? ' — editando venda' : ''));
  const total = round2(cartSubtotal() - cartItemsDiscount() - (isNaN(cartDiscountValue()) ? 0 : cartDiscountValue()));
  setText('mcbTotal', fmt(Math.max(0, total)));
  setText('btnMcb', currentScreen === 'venda' ? 'Ver carrinho' : 'Continuar venda');
}
function showCart(){
  if (currentScreen !== 'venda') goTo('venda');
  setTimeout(() => $('.cart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    cartPanelInView = entries.some(e => e.isIntersecting);
    updateMobileCartBar();
  }, { rootMargin: '0px 0px -45% 0px', threshold: 0 }).observe($('.cart-panel'));   // só conta quando o carrinho sobe até a metade de cima da tela
}

// As listas em tabela recebem os rótulos sempre que são redesenhadas
['renderVendas', 'renderCaixa', 'renderRelatorio', 'renderFiado'].forEach(name => {
  const original = window[name];
  window[name] = function(){ const r = original.apply(this, arguments); labelTables(); return r; };
});

$('#btnMore').addEventListener('click', openMoreMenu);
$('#btnMcb').addEventListener('click', showCart);
document.addEventListener('click', e => {
  const o = e.target.closest('[data-mopen]'); if (o) { openMobileForm(o.dataset.mopen); return; }
  const c = e.target.closest('[data-mclose]'); if (c) closeMobileForm(c.dataset.mclose);
});
if (window.matchMedia) matchMedia(MOBILE_QUERY).addEventListener('change', () => { updateMobileCartBar(); });
if (!canAutoFocus()) $('#vendaSearch').placeholder = 'Buscar produto…';

/* =========================================================
   Inicialização
   ========================================================= */
function setDateLabel(){
  const d = new Date();
  const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  setText('dateLabel', t.charAt(0).toUpperCase() + t.slice(1));
}

let lastBrandSig = '';
function applyBrand(){
  const b = brandInfo();
  const sig = b.name + '|' + (b.logo ? b.logo.length + b.logo.slice(-24) : '') + '|' + b.showName;
  if (sig === lastBrandSig) return;          // só redesenha quando muda
  lastBrandSig = sig;
  $$('nav.sidenav .brand').forEach(el => { el.innerHTML = brandHTML(b); el.classList.toggle('has-logo', !!b.logo); });
  document.title = b.name;
}

applyBrand();
showAuthScreen('loading');
setDateLabel();
applySaleTypeUI();
setSync('connecting');
renderAll();
connect();
