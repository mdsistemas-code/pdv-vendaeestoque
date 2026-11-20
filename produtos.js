/* screens/produtos.js
   Tela Produtos: cadastro, edição, categorias, custo, preço e entrada de estoque. */

/* =========================================================
   PRODUTOS
   ========================================================= */
function updateMarginHint(){
  const cost = parseMoney($('#prodCost').value);
  const price = parseMoney($('#prodPrice').value);
  const localStr = $('#prodPriceLocal').value.trim();
  const local = localStr ? parseMoney(localStr) : NaN;
  const el = $('#marginHint');
  if (isNaN(price) || price <= 0) { el.textContent = localStr ? 'Preencha também o valor para retirada.' : ''; return; }
  const c = isNaN(cost) ? 0 : cost;
  if (c <= 0) { el.textContent = 'Informe o custo para ver o lucro por unidade.'; return; }
  const part = (label, v) => { const m = round2(v - c); return label + ' <span class="' + (m >= 0 ? 'pos' : 'neg') + '">' + fmt(m) + ' (' + Math.round(m / c * 100) + '%)</span>'; };
  el.innerHTML = 'Lucro por unidade: ' + part('retirada', price) +
    (!isNaN(local) && local > 0 ? ' · ' + part('no local', local) : localStr ? ' · <span class="neg">valor no local inválido</span>' : '');
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

/* ---------- Formas de venda no cadastro (grade, meia grade, fardo...) ---------- */
function formRowHTML(f){
  f = f || {};
  return `<div class="form-row" data-fid="${esc(f.id || '')}">
      <button type="button" class="icon-btn fr-rm" data-rmform aria-label="Remover esta forma de venda">✕</button>
      <div class="fr-grid">
        <div><label>Nome</label><input type="text" class="f-name" value="${esc(f.name || '')}" placeholder="Ex: Grade" autocomplete="off"></div>
        <div><label>Unidades</label><input type="text" inputmode="numeric" class="f-qty" value="${f.qty ? f.qty : ''}" placeholder="Ex: 23" autocomplete="off"></div>
      </div>
      <div class="fr-grid">
        <div><label>Retirada (R$)</label><input type="text" inputmode="decimal" class="f-price" value="${f.price ? fmtInput(f.price) : ''}" placeholder="0,00" autocomplete="off"></div>
        <div><label>No local (R$)</label><input type="text" inputmode="decimal" class="f-local" value="${f.priceLocal ? fmtInput(f.priceLocal) : ''}" placeholder="Igual à retirada" autocomplete="off"></div>
      </div>
      <div class="fr-hint"></div>
    </div>`;
}
function setProductForms(forms){ $('#prodForms').innerHTML = (forms || []).map(formRowHTML).join(''); updateFormHints(); }
function addFormRow(name){
  $('#prodForms').insertAdjacentHTML('beforeend', formRowHTML({ name }));
  const row = $('#prodForms').lastElementChild;
  updateFormHints();
  focusLater(() => $(name ? '.f-qty' : '.f-name', row), 50);
}
// Dica de cada forma: quanto daria vendendo na unidade e o lucro da forma.
// E, embaixo do estoque, quanto ele dá na maior forma (92 un. = 4× Grade).
function updateFormHints(){
  const typedForms = $$('#prodForms .form-row').map(row => ({ id: 'x', name: $('.f-name', row).value.trim(), qty: parseQty($('.f-qty', row).value), price: 1 }))
    .filter(f => f.name && f.qty > 1);
  const st = parseQty($('#prodStock').value);
  const bd = isNaN(st) ? '' : stockBreakdown({ forms: typedForms }, st);
  $('#prodStockHint').textContent = bd ? '= ' + bd : '';
  const unitPrice = parseMoney($('#prodPrice').value);
  const costStr = $('#prodCost').value.trim();
  const cost = costStr ? parseMoney(costStr) : 0;
  $$('#prodForms .form-row').forEach(row => {
    const qtyStr = $('.f-qty', row).value.trim();
    const qty = parseQty(qtyStr);
    const price = parseMoney($('.f-price', row).value);
    const el = $('.fr-hint', row);
    if (isNaN(qty) || qty < 2) { el.textContent = qtyStr ? 'Unidades: número inteiro, a partir de 2.' : ''; return; }
    const parts = [qty + ' un. no estoque'];
    if (!isNaN(unitPrice) && unitPrice > 0) parts.push('na unidade daria ' + fmt(unitPrice * qty));
    if (!isNaN(price) && price > 0 && !isNaN(cost) && cost > 0) {
      const m = round2(price - cost * qty);
      parts.push('lucro <span class="' + (m >= 0 ? 'pos' : 'neg') + '">' + fmt(m) + '</span>');
    }
    el.innerHTML = parts.join(' · ');
  });
}
// Lê as formas preenchidas. Linhas totalmente vazias são ignoradas.
function readProductForms(){
  const forms = [];
  for (const row of $$('#prodForms .form-row')) {
    const get = c => $(c, row).value.trim();
    const name = get('.f-name'), qtyStr = get('.f-qty'), priceStr = get('.f-price'), localStr = get('.f-local');
    if (!name && !qtyStr && !priceStr && !localStr) continue;
    if (!name) return { error: 'Dê um nome para a forma de venda (ex.: Grade).', el: $('.f-name', row) };
    const qty = parseQty(qtyStr);
    if (isNaN(qty) || qty < 2) return { error: 'Em “' + name + '”, informe quantas unidades tem (número inteiro, a partir de 2).', el: $('.f-qty', row) };
    const price = parseMoney(priceStr);
    if (isNaN(price) || price <= 0) return { error: 'Em “' + name + '”, informe o valor para retirada.', el: $('.f-price', row) };
    const priceLocal = localStr ? parseMoney(localStr) : null;
    if (priceLocal !== null && (isNaN(priceLocal) || priceLocal <= 0)) return { error: 'Em “' + name + '”, o valor no local é inválido. Deixe em branco para usar o da retirada.', el: $('.f-local', row) };
    forms.push({ id: row.dataset.fid || makeId(), name, qty, price, priceLocal });
  }
  return { forms };
}

function resetProductForm(){
  ui.editingProductId = null;
  setText('prodFormTitle', 'Novo produto');
  setText('btnSaveProduct', 'Adicionar produto');
  setText('prodStockLabel', 'Estoque inicial (un.)');
  $('#btnCancelProductEdit').style.display = 'none';
  $('#productFormPanel').classList.remove('editing');
  ['prodName', 'prodCategory', 'prodCost', 'prodPrice', 'prodPriceLocal', 'prodStock', 'prodMinStock'].forEach(id => { $('#' + id).value = ''; });
  setProductForms([]);
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
  setText('prodStockLabel', 'Estoque atual (un.)');
  $('#btnCancelProductEdit').style.display = '';
  $('#productFormPanel').classList.add('editing');
  $('#prodName').value = p.name || '';
  $('#prodCategory').value = p.category || '';
  $('#prodCost').value = p.costPrice ? fmtInput(p.costPrice) : '';
  $('#prodPrice').value = fmtInput(p.price || 0);
  $('#prodPriceLocal').value = hasLocalPrice(p) ? fmtInput(p.priceLocal) : '';
  $('#prodStock').value = String(p.stock || 0);
  $('#prodMinStock').value = p.minStock ? String(p.minStock) : '';
  setProductForms(productForms(p));
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
  const localStr = $('#prodPriceLocal').value.trim();
  const priceLocal = localStr ? parseMoney(localStr) : null;   // vazio = mesmo valor da retirada
  const stockStr = $('#prodStock').value.trim();
  const minStr = $('#prodMinStock').value.trim();
  const stock = stockStr ? parseQty(stockStr) : 0;
  const minStock = minStr ? parseQty(minStr) : 0;

  if (!name) { toast('Digite o nome do produto.', 'error'); $('#prodName').focus(); return; }
  if (isNaN(cost) || cost < 0) { toast('Valor de custo inválido.', 'error'); $('#prodCost').focus(); return; }
  if (isNaN(price) || price <= 0) { toast('Digite o valor para retirada.', 'error'); $('#prodPrice').focus(); return; }
  if (priceLocal !== null && (isNaN(priceLocal) || priceLocal <= 0)) { toast('Valor para consumo no local inválido. Deixe em branco para usar o mesmo da retirada.', 'error'); $('#prodPriceLocal').focus(); return; }
  if (isNaN(stock)) { toast('O estoque precisa ser um número inteiro.', 'error'); $('#prodStock').focus(); return; }
  if (isNaN(minStock)) { toast('O estoque mínimo precisa ser um número inteiro.', 'error'); $('#prodMinStock').focus(); return; }
  if (state.products.some(p => p.id !== ui.editingProductId && p.name.trim().toLowerCase() === name.toLowerCase())) {
    toast('Já existe um produto com esse nome.', 'error'); $('#prodName').focus(); return;
  }
  const fr = readProductForms();
  if (fr.error) { toast(fr.error, 'error'); fr.el.focus(); return; }

  const data = { name, category, costPrice: cost, price, priceLocal, forms: fr.forms, stock, minStock, image: safeImage(ui.prodImage) };
  const editing = ui.editingProductId;
  const btn = $('#btnSaveProduct');
  btn.disabled = true;
  try {
    await withSave(() => editing
      ? db.collection('products').doc(editing).update(data)
      : db.collection('products').add(Object.assign({ createdAt: new Date().toISOString() }, data)));
    toast(editing ? 'Produto atualizado.' : name + ' adicionado.');
    if (cost > price || (priceLocal && cost > priceLocal)) toast('Atenção: o custo está maior que o valor de venda.', 'error');
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
    removeProductFromCart(id);
    if (ui.editingProductId === id) resetProductForm();
    toast('Produto removido.');
  } catch (e) { toast(errMsg(e, 'Não foi possível remover o produto.'), 'error'); }
}

/* ---------- Entrada de estoque ----------
   A mercadoria pode chegar em unidades, numa forma de venda do produto (grade, fardo...) ou numa embalagem
   avulsa ("Outra embalagem": você diz quantas unidades tem). Tudo vira unidades no estoque. */
function openStockModal(id){
  const p = getProduct(id);
  if (!p) return;
  const forms = productForms(p).slice().sort((a, b) => b.qty - a.qty);
  const OTHER = '__outra';
  const breakdown = stockBreakdown(p);
  const sheet = openModal(`
    <h3>Entrada de estoque</h3>
    <div class="sub">${esc(p.name)} — estoque atual: <b>${p.stock || 0} un.</b>${breakdown ? ' (' + esc(breakdown) + ')' : ''}</div>
    <label class="field-label" for="stQty">Quantidade que chegou</label>
    <div class="row-2">
      <input type="text" inputmode="numeric" id="stQty" placeholder="Ex: 2" autocomplete="off">
      <select id="stForm" aria-label="Em que embalagem chegou">
        <option value="">Unidades</option>
        ${forms.map(f => '<option value="' + esc(f.id) + '">' + esc(f.name) + ' (' + f.qty + ' un.)</option>').join('')}
        <option value="${OTHER}">Outra embalagem…</option>
      </select>
    </div>
    <div id="stPackWrap" style="display:none">
      <label class="field-label" for="stPackQty">Quantas unidades tem cada embalagem?</label>
      <input type="text" inputmode="numeric" id="stPackQty" placeholder="Ex: 23" autocomplete="off">
    </div>
    <label class="field-label" for="stCost" id="stCostLabel">Valor de custo por unidade (R$)</label>
    <input type="text" inputmode="decimal" id="stCost" value="${p.costPrice ? fmtInput(p.costPrice) : ''}" placeholder="0,00" autocomplete="off">
    <div class="hint" id="stHint"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="stOk">Confirmar entrada</button>
    </div>`);
  const sel = $('#stForm', sheet), costEl = $('#stCost', sheet);
  // Embalagem escolhida: { name, size } (size = unidades em cada uma; 1 = unidade avulsa)
  const pack = () => {
    if (sel.value === OTHER) { const n = parseQty($('#stPackQty', sheet).value); return { name: 'embalagem', size: isNaN(n) ? NaN : n, other: true }; }
    const f = findForm(p, sel.value);
    return f ? { name: f.name, size: f.qty } : { name: null, size: 1 };
  };
  // O custo digitado vale para a embalagem escolhida (ex.: custo da grade); guardamos o da unidade
  let unitCost = p.costPrice || 0;
  let lastSize = 1;
  const readUnitCost = () => {
    const c = parseMoney(costEl.value);
    if (!isNaN(c) && lastSize > 0) unitCost = c / lastSize;
  };
  const showCost = () => {
    const pk = pack();
    const size = pk.size > 1 ? pk.size : 1;
    $('#stCostLabel', sheet).textContent = size > 1
      ? 'Valor de custo de cada ' + (pk.other ? 'embalagem' : pk.name.toLowerCase()) + ' (R$)'
      : 'Valor de custo por unidade (R$)';
    if (costEl.value.trim() && size !== lastSize) costEl.value = fmtInput(round2(unitCost * size));
    lastSize = size;
  };
  const totals = () => {
    const q = parseQty($('#stQty', sheet).value);
    const pk = pack();
    const total = isNaN(q) || isNaN(pk.size) ? NaN : q * pk.size;
    return { q, pk, total };
  };
  const upd = () => {
    const t = totals();
    const el = $('#stHint', sheet);
    if (isNaN(t.total) || t.total <= 0) {
      el.textContent = sel.value === OTHER && $('#stQty', sheet).value.trim() && isNaN(t.pk.size) ? 'Informe quantas unidades tem cada embalagem.' : '';
      return;
    }
    const after = (p.stock || 0) + t.total;
    const bd = stockBreakdown(p, after);
    const parts = [];
    if (t.pk.size > 1) parts.push('Vão entrar ' + t.q + ' × ' + t.pk.size + ' = ' + t.total + ' un.');
    parts.push('O estoque vai ficar com ' + after + ' un.' + (bd ? ' (' + bd + ').' : ''));
    const c = parseMoney(costEl.value);
    if (t.pk.size > 1 && !isNaN(c) && c > 0) parts.push('Custo por unidade: ' + fmt(c / t.pk.size) + '.');
    el.textContent = parts.join(' ');
  };
  sel.addEventListener('change', () => {
    readUnitCost();
    $('#stPackWrap', sheet).style.display = sel.value === OTHER ? '' : 'none';
    if (sel.value === OTHER) focusLater(() => $('#stPackQty', sheet), 30);
    showCost(); upd();
  });
  $('#stPackQty', sheet).addEventListener('input', () => { readUnitCost(); showCost(); upd(); });
  $('#stQty', sheet).addEventListener('input', upd);
  costEl.addEventListener('input', () => { readUnitCost(); upd(); });
  $('#stOk', sheet).addEventListener('click', async e => {
    if (!requireDb()) return;
    const t = totals();
    const q = t.total;
    if (sel.value === OTHER && (isNaN(t.pk.size) || t.pk.size < 2)) { toast('Informe quantas unidades tem cada embalagem (a partir de 2).', 'error'); $('#stPackQty', sheet).focus(); return; }
    if (isNaN(q) || q <= 0) { toast('Digite a quantidade (número inteiro).', 'error'); $('#stQty', sheet).focus(); return; }
    const costStr = costEl.value.trim();
    const typed = costStr ? parseMoney(costStr) : NaN;
    if (costStr && (isNaN(typed) || typed < 0)) { toast('Valor de custo inválido.', 'error'); costEl.focus(); return; }
    // custo da unidade: o digitado dividido pelas unidades da embalagem (4 casas para não perder centavos na grade)
    const cost = costStr ? Math.round(typed / (t.pk.size > 1 ? t.pk.size : 1) * 10000) / 10000 : (p.costPrice || 0);
    e.target.disabled = true;
    try {
      await withSave(() => db.collection('products').doc(id).update({ stock: db.increment(q), costPrice: cost }));
      closeModal();
      const what = t.pk.size > 1 ? t.q + '× ' + (t.pk.other ? 'embalagem de ' + t.pk.size : t.pk.name.toLowerCase()) + ' (' + q + ' un.)' : q + ' un.';
      toast('Entrada de ' + what + ' de ' + p.name + ' registrada.');
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
        <div class="meta">Estoque <b>${p.stock || 0}</b> un.${stockBreakdown(p) ? ' = ' + esc(stockBreakdown(p)) : ''}${p.minStock ? ' (mín. ' + p.minStock + ')' : ''} — custo ${fmt(cost)} — lucro <span class="${margin >= 0 ? 'pos' : 'neg'}">${fmt(margin)}${cost > 0 ? ' (' + Math.round(margin / cost * 100) + '%)' : ''}</span></div>
        ${productForms(p).length ? '<div class="meta">Também vende: ' + productForms(p).map(f => esc(f.name) + ' (' + f.qty + ' un.) <b>' + fmt(f.price) + '</b>').join(' · ') + '</div>' : ''}
      </div>
      <div class="right">
        <span class="amount amber">${fmt(p.price)}</span>
        ${hasLocalPrice(p) ? '<span class="muted price-local">no local ' + fmt(p.priceLocal) + '</span>' : ''}
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
$('#prodPriceLocal').addEventListener('input', updateMarginHint);
['prodPrice', 'prodCost', 'prodStock'].forEach(id => $('#' + id).addEventListener('input', updateFormHints));
$('#prodForms').addEventListener('input', updateFormHints);
$('#prodForms').addEventListener('click', e => {
  const rm = e.target.closest('[data-rmform]');
  if (rm) { rm.closest('.form-row').remove(); updateFormHints(); }
});
$('#prodForms').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); saveProduct(); } });
$('.forms-add').addEventListener('click', e => { const b = e.target.closest('[data-addform]'); if (b) addFormRow(b.dataset.addform); });
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
