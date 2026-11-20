/* share.js
   Comprovante de venda (à vista ou fiado) e extrato do cliente: pelo WhatsApp, pelo menu de
   compartilhar do aparelho, copiando o texto ou imprimindo o cupom (bobina de 58/80 mm ou folha). */

function storeName(){ return brandInfo().name; }

/* ---------- Textos ---------- */
function saleReceiptText(s){
  const L = [];
  L.push('*' + storeName() + '*');
  L.push((isActive(s) ? 'Comprovante de venda ' : 'VENDA CANCELADA ') + saleLabel(s));
  L.push(fmtDate(s.date) + ' às ' + fmtTime(s.date) + ' — ' + CONSUMO_LABELS[saleConsumo(s)].toLowerCase());
  if (s.editedAt) L.push('(alterada em ' + fmtDate(s.editedAt) + ' às ' + fmtTime(s.editedAt) + ')');
  if (s.customerId) L.push('Cliente: ' + customerName(s.customerId));
  L.push('');
  const misto = saleConsumo(s) === 'misto';
  // Cada item: nome, e embaixo quantidade × valor unitário = total do item
  (s.items || []).forEach(it => {
    L.push(itemLabel(it) + (misto && itemConsumo(it, s) === 'local' ? ' (no local)' : ''));
    L.push('   ' + it.qty + ' x ' + fmt(it.price) +
      (it.discount ? ' − ' + fmt(it.discount) + ' de desconto' + (itemDiscountNote(it) ? ' (' + itemDiscountNote(it) + ')' : '') : '') +
      ' = ' + fmt(itemNet(it)));
  });
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
  L.push('Extrato — ' + (c ? c.name : 'Cliente'));
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
      ${o.print ? '<button class="btn btn-outline" id="shPrint">Imprimir</button>' : ''}
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
  const pr = $('#shPrint', sheet);
  if (pr) pr.addEventListener('click', o.print);
}

/* ---------- Cupom e extrato para imprimir ----------
   O conteúdo é montado uma vez, como uma lista de blocos (título, linha com valor, separador...),
   e daí sai em dois formatos:
   • HTML para a impressão do aparelho (só o cupom aparece; a largura se ajusta à bobina de 58/80 mm ou à folha);
   • imagem PNG na largura de uma bobina de 80 mm, para o celular: vai para o compartilhar (aplicativo da
     impressora térmica Bluetooth, WhatsApp, Imprimir) ou é salva.
   Os textos dos blocos são simples (sem HTML). */

// Itens de uma venda: nome, quantidade × valor unitário e desconto
function rcItemBlocks(s){
  const misto = saleConsumo(s) === 'misto';
  const out = [];
  (s.items || []).forEach(it => {
    out.push({ t: 'name', text: itemLabel(it), note: misto && itemConsumo(it, s) === 'local' ? '(no local)' : '' });
    out.push({ t: 'row', l: it.qty + ' x ' + fmt(it.price), r: fmt(round2(it.qty * it.price)) });
    if (it.discount) out.push({ t: 'row', l: 'Desconto' + (itemDiscountNote(it) ? ' (' + itemDiscountNote(it) + ')' : ''), r: '− ' + fmt(it.discount), cls: 'muted' });
  });
  return out;
}
function rcHeadBlocks(){
  const b = brandInfo();
  return (b.logo ? [{ t: 'logo', src: b.logo }] : []).concat([{ t: 'store', text: b.name }]);
}

function saleReceiptBlocks(s){
  const B = rcHeadBlocks();
  B.push({ t: 'title', text: (isActive(s) ? 'Comprovante de venda ' : 'VENDA CANCELADA ') + saleLabel(s) });
  const info = [fmtDate(s.date) + ' às ' + fmtTime(s.date), CONSUMO_LABELS[saleConsumo(s)]];
  if (s.customerId) info.push('Cliente: ' + customerName(s.customerId));
  if (s.sellerName) info.push('Atendente: ' + s.sellerName);
  if (s.editedAt) info.push('(alterada em ' + fmtDate(s.editedAt) + ' às ' + fmtTime(s.editedAt) + ')');
  B.push({ t: 'info', lines: info }, { t: 'sep' });
  B.push(...rcItemBlocks(s), { t: 'sep' });
  if (s.discount) {
    const itemsDisc = saleItemsDiscount(s), generalDisc = saleGeneralDiscount(s);
    B.push({ t: 'row', l: 'Subtotal', r: fmt(saleSubtotal(s)) });
    if (itemsDisc > 0) B.push({ t: 'row', l: 'Descontos nos itens', r: '− ' + fmt(itemsDisc) });
    if (generalDisc > 0) B.push({ t: 'row', l: itemsDisc > 0 ? 'Desconto geral' : 'Desconto', r: '− ' + fmt(generalDisc) });
  }
  B.push({ t: 'row', l: 'TOTAL', r: fmt(s.total), cls: 'total' }, { t: 'sep' });
  if (s.type === 'fiado') {
    B.push({ t: 'row', l: 'Pagamento', r: 'Fiado (pagar depois)' });
    if (isActive(s)) {
      if ((s.paidAmount || 0) > 0) B.push({ t: 'row', l: 'Já pago', r: fmt(s.paidAmount) });
      B.push(s.paid ? { t: 'row', l: 'Situação', r: 'Quitada' } : { t: 'row', l: 'Falta pagar', r: fmt(saleRemaining(s)), cls: 'bold' });
    }
  } else {
    B.push({ t: 'row', l: 'Pagamento', r: methodLabel(s) });
    if (typeof s.cashReceived === 'number') B.push({ t: 'row', l: 'Recebido', r: fmt(s.cashReceived) });
    if (s.change) B.push({ t: 'row', l: 'Troco', r: fmt(s.change) });
  }
  B.push({ t: 'sep' }, { t: 'foot', text: 'Obrigado pela preferência!', small: 'Não é documento fiscal' });
  return B;
}

// Extrato do cliente: compras em aberto (com itens e valor unitário), total e últimos pagamentos.
// Como o extrato enviado, não usa a palavra "fiado".
function customerStatementBlocks(customerId){
  const c = getCustomer(customerId);
  const open = openFiadoSales(customerId).sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = new Date().toISOString();
  const B = rcHeadBlocks();
  B.push({ t: 'title', text: 'Extrato — ' + (c ? c.name : 'Cliente') });
  B.push({ t: 'info', lines: (c && c.phone ? [c.phone] : []).concat(['Atualizado em ' + fmtDate(now) + ' às ' + fmtTime(now)]) }, { t: 'sep' });
  if (!open.length) B.push({ t: 'foot', text: 'Nenhuma compra em aberto. Obrigado!' });
  open.forEach((s, i) => {
    if (i) B.push({ t: 'sep', light: true });
    B.push({ t: 'row', l: 'Compra ' + saleLabel(s), r: fmtDate(s.date), cls: 'bold' });
    B.push(...rcItemBlocks(s));
    if (s.discount && saleGeneralDiscount(s) > 0) B.push({ t: 'row', l: saleItemsDiscount(s) > 0 ? 'Desconto geral' : 'Desconto', r: '− ' + fmt(saleGeneralDiscount(s)), cls: 'muted' });
    B.push({ t: 'row', l: 'Total da compra', r: fmt(s.total) });
    if ((s.paidAmount || 0) > 0) B.push({ t: 'row', l: 'Já pago', r: '− ' + fmt(s.paidAmount) });
    B.push({ t: 'row', l: 'Falta pagar', r: fmt(saleRemaining(s)), cls: 'bold' });
  });
  if (open.length) B.push({ t: 'sep' }, { t: 'row', l: 'TOTAL EM ABERTO', r: fmt(customerDebt(customerId)), cls: 'total' });
  const pays = state.payments.filter(p => p.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  if (pays.length) {
    B.push({ t: 'sep' }, { t: 'name', text: 'Últimos pagamentos' });
    pays.forEach(p => B.push({ t: 'row', l: fmtDate(p.date) + ' — ' + (METHOD_LABELS[p.method] || p.label || ''), r: fmt(p.amount) }));
  }
  B.push({ t: 'sep' }, { t: 'foot', text: 'Qualquer dúvida, é só chamar.', small: 'Não é documento fiscal' });
  return B;
}

/* ---------- Blocos → HTML ---------- */
function blocksToHTML(blocks){
  const row = b => '<div class="rc-row ' + (b.cls ? 'rc-' + b.cls : '') + '"><span>' + esc(b.l) + '</span><span>' + esc(b.r) + '</span></div>';
  return '<div class="rc">' + blocks.map(b => {
    switch (b.t) {
      case 'logo': return '<div class="rc-head"><img class="rc-logo" src="' + b.src + '" alt=""></div>';
      case 'store': return '<div class="rc-head"><div class="rc-store">' + esc(b.text) + '</div></div>';
      case 'title': return '<div class="rc-title">' + esc(b.text) + '</div>';
      case 'info': return '<div class="rc-info">' + b.lines.map(esc).join('<br>') + '</div>';
      case 'sep': return '<div class="rc-sep' + (b.light ? ' rc-sep-light' : '') + '"></div>';
      case 'name': return '<div class="rc-name">' + esc(b.text) + (b.note ? ' <small>' + esc(b.note) + '</small>' : '') + '</div>';
      case 'row': return row(b);
      case 'foot': return '<div class="rc-foot">' + esc(b.text) + (b.small ? '<br><small>' + esc(b.small) + '</small>' : '') + '</div>';
      default: return '';
    }
  }).join('') + '</div>';
}

/* ---------- Blocos → imagem PNG (largura de bobina de 80 mm: 576 pontos) ---------- */
async function blocksToPNG(blocks){
  const W = 576, PAD = 20, INNER = W - PAD * 2;
  const FONT = '"Inter", Arial, Helvetica, sans-serif';
  const S = { store: [36, 700], title: [26, 700], info: [22, 400], name: [24, 600], row: [24, 400], muted: [21, 400], bold: [24, 700], total: [34, 700], foot: [23, 400], small: [18, 400] };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = k => { ctx.font = S[k][1] + ' ' + S[k][0] + 'px ' + FONT; return S[k][0]; };
  const wrap = (text, max) => {   // quebra o texto em linhas que cabem na largura
    const words = String(text).split(' '), lines = [];
    let cur = '';
    words.forEach(w => {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= max || !cur) cur = t; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  };
  const logo = blocks.find(b => b.t === 'logo');
  let img = null;
  if (logo) {
    img = new Image();
    img.src = logo.src;
    try { await img.decode(); } catch (e) { img = null; }
  }
  // Monta a lista de desenhos e calcula a altura; depois desenha
  const ops = [];
  let y = PAD;
  const line = (k, text, align, x) => { const sz = font(k); ops.push({ k, text, align, x, y: y + sz }); y += Math.round(sz * 1.32); };
  blocks.forEach(b => {
    if (b.t === 'logo' && img) {
      const h = Math.min(110, img.height * Math.min(1, (W * 0.6) / img.width));
      const w = img.width * (h / img.height);
      ops.push({ img, x: (W - w) / 2, y, w, h }); y += h + 10;
    } else if (b.t === 'store' || b.t === 'title') {
      font(b.t); wrap(b.text, INNER).forEach(t => line(b.t, t, 'center', W / 2));
      if (b.t === 'title') y += 4;
    } else if (b.t === 'info') {
      font('info'); b.lines.forEach(l => wrap(l, INNER).forEach(t => line('info', t, 'center', W / 2)));
    } else if (b.t === 'sep') {
      y += 8; ops.push({ sep: true, light: b.light, y }); y += 12;
    } else if (b.t === 'name') {
      y += 4; font('name'); wrap(b.text + (b.note ? ' ' + b.note : ''), INNER).forEach(t => line('name', t, 'left', PAD));
    } else if (b.t === 'row') {
      const k = b.cls === 'total' ? 'total' : b.cls === 'muted' ? 'muted' : b.cls === 'bold' ? 'bold' : 'row';
      const sz = font(k);
      const rw = ctx.measureText(b.r).width;
      const lines = wrap(b.l, Math.max(120, INNER - rw - 16));
      ops.push({ k, text: b.r, align: 'right', x: W - PAD, y: y + sz });
      lines.forEach(t => line(k, t, 'left', PAD));
    } else if (b.t === 'foot') {
      font('foot'); wrap(b.text, INNER).forEach(t => line('foot', t, 'center', W / 2));
      if (b.small) { font('small'); line('small', b.small, 'center', W / 2); }
    }
  });
  canvas.width = W;
  canvas.height = Math.ceil(y + PAD);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  ops.forEach(o => {
    if (o.img) { ctx.drawImage(o.img, o.x, o.y, o.w, o.h); return; }
    if (o.sep) {
      ctx.save(); ctx.lineWidth = 2; ctx.setLineDash(o.light ? [3, 6] : [10, 7]);
      ctx.beginPath(); ctx.moveTo(PAD, o.y); ctx.lineTo(W - PAD, o.y); ctx.stroke(); ctx.restore(); return;
    }
    font(o.k); ctx.textAlign = o.align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(o.text, o.x, o.y);
  });
  return new Promise((resolve, reject) => canvas.toBlob(bl => bl ? resolve(bl) : reject(new Error('png')), 'image/png'));
}

/* ---------- Imprimir ---------- */
function inClaudePreview(){ try { return window.self !== window.top; } catch (e) { return true; } }

// No computador: abre direto a janela de impressão. No celular (e na prévia do Claude, onde a impressão
// direta é bloqueada): pergunta como imprimir — imagem do cupom ou impressão do aparelho.
function printDoc(o){   // o = { title, blocks, filename }
  const html = blocksToHTML(o.blocks);
  if (isMobileLayout() || inClaudePreview()) openPrintChooser(o, html);
  else printHTML(html);
}

function openPrintChooser(o, html){
  const preview = inClaudePreview();
  const sheet = openModal(`
    <h3>${esc(o.title)}</h3>
    <div class="sub">Escolha como imprimir.</div>
    <div class="print-preview">${html}</div>
    <div class="print-options">
      <button class="btn btn-primary" data-primary id="ppImage">Imagem do cupom</button>
      <div class="hint">Abre o compartilhar do celular. Para impressora térmica Bluetooth, escolha o aplicativo da impressora. Também dá para mandar no WhatsApp, usar <b>Imprimir</b> ou salvar a imagem.</div>
      <button class="btn btn-outline" id="ppPrint">Impressão do celular</button>
      <div class="hint">Usa a impressão do Android ou do iPhone (impressoras Wi-Fi, ou com o serviço de impressão instalado).${preview ? ' <span class="neg">Na prévia do Claude a impressão direta é bloqueada: use a imagem.</span>' : ''}</div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" data-close>Fechar</button></div>`);
  $('#ppPrint', sheet).addEventListener('click', () => printHTML(html));
  $('#ppImage', sheet).addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await shareOrSaveImage(o.blocks, o.filename, o.title); }
    finally { btn.disabled = false; }
  });
}

// Gera a imagem e entrega: pelo compartilhar do aparelho, se ele aceitar arquivos; senão, salva a imagem
async function shareOrSaveImage(blocks, filename, title){
  let blob;
  try { blob = await blocksToPNG(blocks); }
  catch (e) { toast('Não foi possível montar a imagem do cupom.', 'error'); return; }
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (!inClaudePreview() && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // a pessoa fechou o compartilhar
  }
  try {
    if (await downloadFile(filename, blob, 'image/png')) toast('Imagem salva. Abra a imagem e imprima, ou envie para o aplicativo da impressora.');
  } catch (e) {
    if (!e || e.code !== 'declined') toast('Não foi possível salvar a imagem.', 'error');
  }
}

function slugName(t){ return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'; }

function printStatement(customerId){
  const c = getCustomer(customerId);
  if (!c) { toast('Cliente não encontrado.', 'error'); return; }
  printDoc({ title: 'Imprimir extrato — ' + c.name, blocks: customerStatementBlocks(customerId), filename: 'extrato-' + slugName(c.name) + '.png' });
}

function printSale(id){
  const s = getSale(id);
  if (!s) { toast('Venda não encontrada.', 'error'); return; }
  printDoc({ title: 'Imprimir cupom ' + saleLabel(s), blocks: saleReceiptBlocks(s), filename: 'cupom-' + String(s.number || '').padStart(4, '0') + '.png' });
}

// Impressão do aparelho: só o cupom aparece (ver @media print em styles.css)
function printHTML(html){
  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = html;
  if (inClaudePreview()) toast('Se a janela de impressão não abrir aqui, é bloqueio da prévia. Use a imagem do cupom; no seu site a impressão abre normalmente.');
  const go = () => { try { window.print(); } catch (e) { toast('Não foi possível abrir a impressão neste aparelho. Use a imagem do cupom.', 'error'); } };
  // espera a logo carregar antes de imprimir
  const img = area.querySelector('img');
  if (img && !img.complete) { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }); }
  else setTimeout(go, 60);
}

function shareSale(id, fromDetails){
  const s = getSale(id);
  if (!s) { toast('Venda não encontrada.', 'error'); return; }
  const c = s.customerId ? getCustomer(s.customerId) : null;
  openShareModal({
    title: 'Compartilhar venda ' + saleLabel(s),
    text: saleReceiptText(s),
    phone: c ? c.phone : '',
    back: fromDetails ? () => openSaleDetails(id) : null,
    print: () => printSale(id)
  });
}

function shareStatement(customerId, fromDetails){
  const c = getCustomer(customerId);
  if (!c) return;
  openShareModal({
    title: 'Extrato — ' + c.name,
    text: customerStatementText(customerId),
    phone: c.phone || '',
    back: fromDetails ? () => openCustomerDetails(customerId) : null,
    print: () => printStatement(customerId)
  });
}
