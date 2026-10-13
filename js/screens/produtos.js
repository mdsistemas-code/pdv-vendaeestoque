/* screens/produtos.js
   Tela Produtos: cadastro, edição, categorias, custo, preço e entrada de estoque. */

/* =========================================================
   PRODUTOS
   ========================================================= */
function updateMarginHint(){
  const cost = parseMoney($('#prodCost').value);
  const price = parseMoney($('#prodPrice').value);
  const el = $('#marginHint');
  if (isNaN(price) || price <= 0) { el.textContent = ''; return; }
  const c = isNaN(cost) ? 0 : cost;
  const m = round2(price - c);
  if (c <= 0) { el.textContent = 'Informe o custo para ver o lucro por unidade.'; return; }
  el.innerHTML = 'Lucro por unidade: <span class="' + (m >= 0 ? 'pos' : 'neg') + '">' + fmt(m) + ' (' + Math.round(m / c * 100) + '% sobre o custo)</span>';
}

/* ---------- Imagem do produto ---------- */
// Lê a foto escolhida, reduz para no máximo 400 px e comprime (JPEG) para não pesar o sistema
// Logos: corta as margens que sobram em volta e, se o fundo for branco, deixa transparente
function trimImage(img){
  const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * s)), H = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  const px = d.data;
  const at = (x, y) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].map(i => [px[i], px[i + 1], px[i + 2], px[i + 3]]);
  const bg = [0, 1, 2, 3].map(k => Math.round(corners.reduce((a, cc) => a + cc[k], 0) / 4));
  const uniform = corners.every(cc => cc.every((v, k) => Math.abs(v - bg[k]) < 24));
  if (!uniform) return { el: c, w: W, h: H };
  const transparentBg = bg[3] < 40;
  const differs = i => transparentBg ? px[i + 3] > 40 : (Math.abs(px[i] - bg[0]) > 24 || Math.abs(px[i + 1] - bg[1]) > 24 || Math.abs(px[i + 2] - bg[2]) > 24);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (differs(at(x, y))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { el: c, w: W, h: H };                       // imagem toda de uma cor só
  // Fundo branco/quase branco vira transparente (bordas suaves preservadas)
  if (!transparentBg && Math.min(bg[0], bg[1], bg[2]) > 225) {
    for (let i = 0; i < px.length; i += 4) {
      const dark = Math.max(bg[0] - px[i], bg[1] - px[i + 1], bg[2] - px[i + 2]);
      px[i + 3] = Math.round(px[i + 3] * Math.max(0, Math.min(1, (dark - 6) / 60)));
    }
    ctx.putImageData(d, 0, 0);
  }
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { el: out, w: out.width, h: out.height };
}

// Lê a imagem escolhida, reduz e comprime para não pesar o sistema.
// Produtos: JPEG até 400 px. Logo: PNG (mantém o fundo transparente).
function processImageFile(file, opts){
  const o = Object.assign({ maxW: 400, maxH: 400, png: false, maxBytes: 110000 }, opts || {});
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).')); return; }
    if (file.size > 20 * 1024 * 1024) { reject(new Error('Imagem muito grande (máximo 20 MB).')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
      img.onload = () => {
        try {
          const src = o.trim ? trimImage(img) : { el: img, w: img.naturalWidth, h: img.naturalHeight };
          const encode = factor => {
            const scale = Math.min(1, o.maxW / src.w, o.maxH / src.h) * factor;
            const w = Math.max(1, Math.round(src.w * scale));
            const h = Math.max(1, Math.round(src.h * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            if (!o.png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }   // JPEG não tem transparência
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src.el, 0, 0, w, h);
            return c;
          };
          let data;
          if (o.png) {
            let factor = 1;
            data = encode(factor).toDataURL('image/png');
            while (data.length > o.maxBytes && factor > 0.3) { factor *= 0.8; data = encode(factor).toDataURL('image/png'); }
          } else {
            const c = encode(1);
            let q = 0.82;
            data = c.toDataURL('image/jpeg', q);
            while (data.length > o.maxBytes && q > 0.45) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
          }
          resolve(data);
        } catch (e) { reject(new Error('Não foi possível usar essa imagem.')); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePicker(){
  const img = safeImage(ui.prodImage);
  $('#prodImagePreview').innerHTML = img ? '<img src="' + img + '" alt="Imagem do produto">' : '<span>Sem imagem</span>';
  $('#prodImagePreview').classList.toggle('has-image', !!img);
  setText('btnPickImage', img ? 'Trocar imagem' : 'Escolher imagem');
  $('#btnRemoveImage').style.display = img ? '' : 'none';
}

async function useImageFile(file){
  const hint = $('#prodImageHint');
  hint.textContent = 'Preparando a imagem…';
  try {
    ui.prodImage = await processImageFile(file);
    renderImagePicker();
    hint.textContent = 'A imagem é salva quando você clicar em ' + (ui.editingProductId ? '"Salvar alterações".' : '"Adicionar produto".');
  } catch (e) {
    hint.textContent = 'JPG ou PNG. No computador, dá para arrastar a foto até aqui.';
    toast(e.message, 'error');
  }
}

function openImageViewer(id){
  const p = getProduct(id);
  const img = p && safeImage(p.image);
  if (!img) return;
  openModal(`
    <h3>${esc(p.name)}</h3>
    <img class="image-view" src="${img}" alt="${esc(p.name)}">
    <div class="modal-actions">
      <button class="btn btn-outline" id="ivEdit">Editar produto</button>
      <button class="btn btn-primary" data-primary data-close>Fechar</button>
    </div>`);
  $('#ivEdit').addEventListener('click', () => { closeModal(); editProduct(id); });
}

function resetProductForm(){
  ui.editingProductId = null;
  setText('prodFormTitle', 'Novo produto');
  setText('btnSaveProduct', 'Adicionar produto');
  setText('prodStockLabel', 'Estoque inicial');
  $('#btnCancelProductEdit').style.display = 'none';
  $('#productFormPanel').classList.remove('editing');
  ['prodName', 'prodCategory', 'prodCost', 'prodPrice', 'prodStock', 'prodMinStock'].forEach(id => { $('#' + id).value = ''; });
  ui.prodImage = null;
  renderImagePicker();
  setText('prodImageHint', 'JPG ou PNG. No computador, dá para arrastar a foto até aqui.');
  updateMarginHint();
  renderProdutos();
}

function editProduct(id){
  const p = getProduct(id);
  if (!p) return;
  ui.editingProductId = id;
  setText('prodFormTitle', 'Editar produto');
  setText('btnSaveProduct', 'Salvar alterações');
  setText('prodStockLabel', 'Estoque atual');
  $('#btnCancelProductEdit').style.display = '';
  $('#productFormPanel').classList.add('editing');
  $('#prodName').value = p.name || '';
  $('#prodCategory').value = p.category || '';
  $('#prodCost').value = p.costPrice ? fmtInput(p.costPrice) : '';
  $('#prodPrice').value = fmtInput(p.price || 0);
  $('#prodStock').value = String(p.stock || 0);
  $('#prodMinStock').value = p.minStock ? String(p.minStock) : '';
  ui.prodImage = safeImage(p.image);
  renderImagePicker();
  setText('prodImageHint', 'JPG ou PNG. No computador, dá para arrastar a foto até aqui.');
  updateMarginHint();
  renderProdutos();
  openMobileForm('productFormPanel', false);
  $('#productFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusLater(() => $('#prodName'), 200);
}

async function saveProduct(){
  if (!requireDb()) return;
  const name = $('#prodName').value.trim();
  const category = $('#prodCategory').value.trim() || 'Outros';
  const costStr = $('#prodCost').value.trim();
  const cost = costStr ? parseMoney(costStr) : 0;
  const price = parseMoney($('#prodPrice').value);
  const stockStr = $('#prodStock').value.trim();
  const minStr = $('#prodMinStock').value.trim();
  const stock = stockStr ? parseQty(stockStr) : 0;
  const minStock = minStr ? parseQty(minStr) : 0;

  if (!name) { toast('Digite o nome do produto.', 'error'); $('#prodName').focus(); return; }
  if (isNaN(cost) || cost < 0) { toast('Valor de custo inválido.', 'error'); $('#prodCost').focus(); return; }
  if (isNaN(price) || price <= 0) { toast('Digite um valor de venda válido.', 'error'); $('#prodPrice').focus(); return; }
  if (isNaN(stock)) { toast('O estoque precisa ser um número inteiro.', 'error'); $('#prodStock').focus(); return; }
  if (isNaN(minStock)) { toast('O estoque mínimo precisa ser um número inteiro.', 'error'); $('#prodMinStock').focus(); return; }
  if (state.products.some(p => p.id !== ui.editingProductId && p.name.trim().toLowerCase() === name.toLowerCase())) {
    toast('Já existe um produto com esse nome.', 'error'); $('#prodName').focus(); return;
  }

  const data = { name, category, costPrice: cost, price, stock, minStock, image: safeImage(ui.prodImage) };
  const editing = ui.editingProductId;
  const btn = $('#btnSaveProduct');
  btn.disabled = true;
  try {
    await withSave(() => editing
      ? db.collection('products').doc(editing).update(data)
      : db.collection('products').add(Object.assign({ createdAt: new Date().toISOString() }, data)));
    toast(editing ? 'Produto atualizado.' : name + ' adicionado.');
    if (cost > price) toast('Atenção: o custo está maior que o valor de venda.', 'error');
    resetProductForm();
    if (canAutoFocus()) $('#prodName').focus();
  } catch (e) {
    toast(errMsg(e, 'Não foi possível salvar o produto.'), 'error');
  } finally { btn.disabled = false; }
}

async function deleteProduct(id){
  const p = getProduct(id);
  if (!p || !requireDb()) return;
  const ok = await confirmDialog({ title: 'Remover produto?', message: '“' + p.name + '” será removido do cadastro. As vendas já registradas continuam no histórico.', okLabel: 'Remover', danger: true });
  if (!ok) return;
  try {
    await withSave(() => db.collection('products').doc(id).delete());
    delete cart[id];
    if (ui.editingProductId === id) resetProductForm();
    toast('Produto removido.');
  } catch (e) { toast(errMsg(e, 'Não foi possível remover o produto.'), 'error'); }
}

function openStockModal(id){
  const p = getProduct(id);
  if (!p) return;
  const sheet = openModal(`
    <h3>Entrada de estoque</h3>
    <div class="sub">${esc(p.name)} — estoque atual: <b>${p.stock || 0} un.</b></div>
    <label class="field-label" for="stQty">Quantidade que chegou</label>
    <input type="text" inputmode="numeric" id="stQty" placeholder="Ex: 24" autocomplete="off">
    <label class="field-label" for="stCost">Valor de custo por unidade (R$)</label>
    <input type="text" inputmode="decimal" id="stCost" value="${p.costPrice ? fmtInput(p.costPrice) : ''}" placeholder="0,00" autocomplete="off">
    <div class="hint" id="stHint"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="stOk">Confirmar entrada</button>
    </div>`);
  const upd = () => {
    const q = parseQty($('#stQty', sheet).value);
    $('#stHint', sheet).textContent = isNaN(q) || q <= 0 ? '' : 'O estoque vai ficar com ' + ((p.stock || 0) + q) + ' un.';
  };
  $('#stQty', sheet).addEventListener('input', upd);
  $('#stOk', sheet).addEventListener('click', async e => {
    if (!requireDb()) return;
    const q = parseQty($('#stQty', sheet).value);
    const costStr = $('#stCost', sheet).value.trim();
    const cost = costStr ? parseMoney(costStr) : (p.costPrice || 0);
    if (isNaN(q) || q <= 0) { toast('Digite a quantidade (número inteiro).', 'error'); return; }
    if (isNaN(cost) || cost < 0) { toast('Valor de custo inválido.', 'error'); return; }
    e.target.disabled = true;
    try {
      await withSave(() => db.collection('products').doc(id).update({ stock: db.increment(q), costPrice: cost }));
      closeModal();
      toast('Entrada de ' + q + ' un. de ' + p.name + ' registrada.');
    } catch (err) {
      e.target.disabled = false;
      toast(errMsg(err, 'Não foi possível registrar a entrada.'), 'error');
    }
  });
}

function productRowHTML(p){
  const cost = p.costPrice || 0;
  const margin = round2(p.price - cost);
  const tag = isOut(p) ? '<span class="tag pend">Sem estoque</span>' : (isLow(p) ? '<span class="tag pend">Estoque baixo</span>' : '');
  return `
    <div class="list-row ${p.id === ui.editingProductId ? 'editing' : ''}">
      <div class="lr-thumb ${safeImage(p.image) ? 'zoomable' : ''}" ${safeImage(p.image) ? 'data-pimg="' + p.id + '" title="Ver imagem"' : ''}>${productThumbHTML(p, 48)}</div>
      <div class="lr-main lr-grow">
        <div class="name">${esc(p.name)} ${tag}</div>
        <div class="meta">Estoque <b>${p.stock || 0}</b> un.${p.minStock ? ' (mín. ' + p.minStock + ')' : ''} — custo ${fmt(cost)} — lucro <span class="${margin >= 0 ? 'pos' : 'neg'}">${fmt(margin)}${cost > 0 ? ' (' + Math.round(margin / cost * 100) + '%)' : ''}</span></div>
      </div>
      <div class="right">
        <span class="amount amber">${fmt(p.price)}</span>
        <div class="row-actions">
          <button class="btn btn-outline btn-xs" data-stock="${p.id}">Entrada</button>
          <button class="btn btn-outline btn-xs" data-pedit="${p.id}">Editar</button>
          <button class="icon-btn" data-pdel="${p.id}" aria-label="Remover produto">✕</button>
        </div>
      </div>
    </div>`;
}

function renderProdutos(){
  $('#categoryOptions').innerHTML = allCategories().map(c => '<option value="' + esc(c) + '"></option>').join('');
  const cats = categoriesInUse();
  if (ui.prodCat !== 'Todas' && !cats.includes(ui.prodCat)) ui.prodCat = 'Todas';
  renderChips('#prodCatChips', ['Todas', ...cats], ui.prodCat, v => { ui.prodCat = v; renderProdutos(); });

  const stockCost = sumBy(state.products, p => (p.stock || 0) * (p.costPrice || 0));
  const stockSale = sumBy(state.products, p => (p.stock || 0) * (p.price || 0));
  $('#prodSummary').innerHTML = state.products.length
    ? plural(state.products.length, 'produto', 'produtos') + ' — estoque vale <b>' + fmt(stockCost) + '</b> a custo, <b>' + fmt(stockSale) + '</b> a preço de venda'
    : '';

  const wrap = $('#productList');
  if (!isReady()) { wrap.innerHTML = loadingHTML(); return; }
  if (!state.products.length) { wrap.innerHTML = '<div class="empty-state">Nenhum produto cadastrado. Use o formulário ao lado para adicionar o primeiro.</div>'; return; }

  const q = ui.prodSearch.trim().toLowerCase();
  const filtered = state.products
    .filter(p => ui.prodCat === 'Todas' || (p.category || 'Outros') === ui.prodCat)
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .sort(byName);
  if (!filtered.length) { wrap.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>'; return; }

  const groups = {};
  filtered.forEach(p => { const c = p.category || 'Outros'; (groups[c] = groups[c] || []).push(p); });
  wrap.innerHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(cat => `
    <div class="category-group">
      <div class="cg-title">${esc(cat)} <span>${plural(groups[cat].length, 'produto', 'produtos')}</span></div>
      ${groups[cat].map(productRowHTML).join('')}
    </div>`).join('');
}

/* ---------- Eventos da tela ---------- */
$('#btnSaveProduct').addEventListener('click', saveProduct);
$('#btnCancelProductEdit').addEventListener('click', resetProductForm);
$('#prodCost').addEventListener('input', updateMarginHint);
$('#prodPrice').addEventListener('input', updateMarginHint);
$('#prodSearch').addEventListener('input', e => { ui.prodSearch = e.target.value; renderProdutos(); });
$$('#productFormPanel input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveProduct(); } }));
$('#btnPickImage').addEventListener('click', () => $('#prodImageFile').click());
$('#prodImageFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) useImageFile(f);
});
$('#btnRemoveImage').addEventListener('click', () => {
  ui.prodImage = null;
  renderImagePicker();
  setText('prodImageHint', ui.editingProductId ? 'Imagem removida. Clique em "Salvar alterações" para confirmar.' : 'JPG ou PNG. No computador, dá para arrastar a foto até aqui.');
});
const imgBox = $('#prodImageBox');
['dragenter', 'dragover'].forEach(t => imgBox.addEventListener(t, e => { e.preventDefault(); imgBox.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => imgBox.addEventListener(t, e => { e.preventDefault(); imgBox.classList.remove('drag'); }));
imgBox.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) useImageFile(f); });
$('#productList').addEventListener('click', e => { const t = e.target.closest('[data-pimg]'); if (t) openImageViewer(t.dataset.pimg); });
renderImagePicker();
