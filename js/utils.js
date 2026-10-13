/* utils.js
   Atalhos de DOM, formatação de dinheiro e datas, e consultas aos dados. */

/* Celular: tela estreita, ou celular deitado (tela baixa com toque) */
const MOBILE_QUERY = '(max-width: 860px), (pointer: coarse) and (max-height: 520px)';
function isMobileLayout(){ return !!(window.matchMedia && matchMedia(MOBILE_QUERY).matches); }
// No celular, focar um campo sozinho abre o teclado e cobre a tela: só focamos em computador
function canAutoFocus(){ return !(window.matchMedia && matchMedia('(pointer: coarse)').matches); }

/* Põe o cursor num campo depois de um instante, mas só se a pessoa (ou o preenchimento
   automático de senhas do navegador) ainda não estiver digitando em outro campo */
function focusLater(getEl, delay){
  if (!canAutoFocus()) return;
  setTimeout(() => {
    const el = typeof getEl === 'function' ? getEl() : getEl;
    if (!el || !el.isConnected) return;
    const a = document.activeElement;
    if (a && a !== el && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    el.focus();
  }, delay || 60);
}

/* Tabelas: cada célula recebe o nome da sua coluna; no celular a linha vira um cartão */
function labelTables(root){
  (root || document).querySelectorAll('table.data').forEach(t => {
    const heads = Array.from(t.querySelectorAll('thead th'), th => th.textContent.trim());
    t.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
      let col = 0;
      Array.from(tr.children).forEach(td => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', td.colSpan > 1 ? '' : (heads[col] || ''));
        col += td.colSpan || 1;
      });
    });
    t.classList.add('cards');
  });
}

/* Atalhos para buscar elementos na página */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* =========================================================
   Utilitários
   ========================================================= */
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function fmt(n){
  const v = round2(n);
  return (v < 0 ? '− ' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInput(n){ return round2(n).toFixed(2).replace('.', ','); }
function parseMoney(v){
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(s)) return NaN;
  const n = Number(s);
  return isFinite(n) ? round2(n) : NaN;
}
function parseQty(v){
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return NaN;
  if (!/^\d+$/.test(s)) return NaN;
  return parseInt(s, 10);
}
function esc(str){
  return String(str === undefined || str === null ? '' : str).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}
function pad2(n){ return String(n).padStart(2, '0'); }
function dayKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function keyToDate(k){ const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function shiftDay(k, delta){ const d = keyToDate(k); d.setDate(d.getDate() + delta); return dayKey(d); }
function fmtDate(iso){ const d = new Date(iso); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
function fmtDateShort(iso){ const d = new Date(iso); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); }
function fmtTime(iso){ const d = new Date(iso); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtWhen(iso){ return dayKey(new Date(iso)) === dayKey(new Date()) ? 'Hoje, ' + fmtTime(iso) : fmtDateShort(iso) + ', ' + fmtTime(iso); }
function plural(n, s, p){ return n + ' ' + (n === 1 ? s : p); }
function sumBy(arr, fn){ return round2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0)); }
function setText(id, t){ const el = document.getElementById(id); if (el) el.textContent = t; }
function byName(a, b){ return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'); }
function loadingHTML(){ return '<div class="loading">Carregando dados…</div>'; }

function getProduct(id){ return state.products.find(p => p.id === id); }
function getCustomer(id){ return state.customers.find(c => c.id === id); }
function getSale(id){ return state.sales.find(s => s.id === id); }
function customerName(id){ if (!id) return ''; const c = getCustomer(id); return c ? c.name : 'Cliente removido'; }
function isActive(s){ return s.status !== 'cancelada'; }
function methodKey(s){ return s.type === 'fiado' ? 'fiado' : (s.paymentMethod || 'nao_informado'); }
function methodLabel(s){ return METHOD_LABELS[methodKey(s)] || 'Não informado'; }
function saleLabel(s){ return s.number ? '#' + String(s.number).padStart(4, '0') : '#' + String(s.id).slice(-5).toUpperCase(); }
function saleSubtotal(s){ return typeof s.subtotal === 'number' ? s.subtotal : round2((s.items || []).reduce((a, it) => a + it.qty * it.price, 0)); }
function itemCost(it){ if (typeof it.cost === 'number') return it.cost; const p = getProduct(it.productId); return p ? (p.costPrice || 0) : 0; }
// Descontos de uma venda gravada: nos itens e geral (vendas antigas só têm o geral)
function saleItemsDiscount(s){ return typeof s.itemsDiscount === 'number' ? s.itemsDiscount : round2((s.items || []).reduce((a, it) => a + (it.discount || 0), 0)); }
function saleGeneralDiscount(s){ return typeof s.generalDiscount === 'number' ? s.generalDiscount : round2((s.discount || 0) - saleItemsDiscount(s)); }
function pctText(v){ return String(round2(v)).replace('.', ','); }
// Descrição curta do desconto de um item gravado: "10%" ou "R$ 1,00 cada"
function itemDiscountNote(it){
  if (!it.discount) return '';
  if (it.discountPct) return pctText(it.discountPct) + '%';
  if (it.discountUnit) return fmt(it.discountUnit) + ' cada';
  return '';
}
function itemNet(it){ return round2(it.qty * it.price - (it.discount || 0)); }
function saleProfit(s){ return (s.items || []).reduce((a, it) => a + (it.price - itemCost(it)) * it.qty, 0) - (s.discount || 0); }
function itemsSummary(s){ return (s.items || []).map(i => i.qty + 'x ' + i.name).join(', '); }
function sortedSales(){ return [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date)); }
function saleRemaining(s){ return Math.max(0, round2(s.total - (s.paidAmount || 0))); }
function openFiadoSales(customerId){
  return state.sales.filter(s => s.type === 'fiado' && isActive(s) && !s.paid && (customerId === undefined || s.customerId === customerId));
}
function customerDebt(id){ return round2(openFiadoSales(id).reduce((a, s) => a + saleRemaining(s), 0)); }
function totalFiadoAberto(){ return round2(openFiadoSales().reduce((a, s) => a + saleRemaining(s), 0)); }
function categoriesInUse(){ return [...new Set(state.products.map(p => p.category || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
function allCategories(){ return [...new Set([...DEFAULT_CATEGORIES, ...categoriesInUse()])].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
/* Imagem do produto: só aceita imagens embutidas (data:) geradas pelo sistema */
function safeImage(src){ return typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null; }
function productInitials(name){
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}
// Miniatura quadrada; sem imagem, mostra as iniciais do produto
function productThumbHTML(p, size, extra){
  const img = safeImage(p && p.image);
  const st = 'width:' + size + 'px;height:' + size + 'px';
  return img
    ? '<img class="thumb ' + (extra || '') + '" src="' + img + '" alt="" style="' + st + '" loading="lazy">'
    : '<span class="thumb thumb-ph ' + (extra || '') + '" style="' + st + ';font-size:' + Math.round(size * 0.34) + 'px" aria-hidden="true">' + esc(productInitials(p && p.name)) + '</span>';
}
/* Nome e logo do sistema (Configurações → Nome e logo do sistema) */
function storeSettings(){ return state.settings.find(d => d.id === 'loja') || {}; }
function brandInfo(){
  const s = storeSettings();
  const name = String(s.name || (window.APP_CONFIG || {}).nomeDaLoja || 'Depósito').trim() || 'Depósito';
  return { name, logo: safeImage(s.logo), showName: !!s.showName };
}
function brandHTML(b){
  if (b.logo) return '<img class="brand-logo" src="' + b.logo + '" alt="' + esc(b.name) + '">' + (b.showName ? '<span class="brand-name">' + esc(b.name) + '</span>' : '');
  return '<span class="dot"></span><span class="brand-name">' + esc(b.name) + '</span><span class="brand-period">.</span>';
}
function isOut(p){ return (p.stock || 0) <= 0; }
function isLow(p){ return (p.minStock || 0) > 0 && (p.stock || 0) <= p.minStock; }
function needsRestock(p){ return isOut(p) || isLow(p); }
function nextSaleNumber(){ return state.sales.reduce((m, s) => Math.max(m, s.number || 0), 0) + 1; }
function isReady(){ return offline || Object.keys(loaded).every(k => loaded[k]); }

/* Gastos */
function expenseIsOpen(e){ return e.status === 'apagar'; }
function expenseIsOverdue(e){ return expenseIsOpen(e) && e.date < dayKey(new Date()); }
// e.date = dia do pagamento (gasto pago) ou do vencimento (conta a pagar), no formato AAAA-MM-DD
function expenseInRange(e, r){ if (!r) return true; const d = keyToDate(e.date); return d >= r.start && d < r.end; }
function paidExpensesIn(r){ return state.expenses.filter(e => !expenseIsOpen(e) && expenseInRange(e, r)); }
function openExpensesTotal(){ return sumBy(state.expenses.filter(expenseIsOpen), e => e.amount); }

function periodRange(key){
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);
  switch (key) {
    case 'hoje': return { start, end: tomorrow };
    case '7': { const s = new Date(start); s.setDate(s.getDate() - 6); return { start: s, end: tomorrow }; }
    case '30': { const s = new Date(start); s.setDate(s.getDate() - 29); return { start: s, end: tomorrow }; }
    case 'mes': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case 'mes_passado': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    default: return null;
  }
}
function inRange(iso, r){ if (!r) return true; const d = new Date(iso); return d >= r.start && d < r.end; }
