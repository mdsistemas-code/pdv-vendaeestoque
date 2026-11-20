/* export.js
   Download de arquivos e exportação para CSV (abre no Excel). */

/* =========================================================
   Exportação (CSV para Excel) e download de arquivos
   ========================================================= */
let claudeDownloads;  // undefined = ainda não verificado
async function getClaudeDownloads(){
  if (claudeDownloads !== undefined) return claudeDownloads;
  claudeDownloads = null;
  try { if (window.claude && typeof window.claude.use === 'function') claudeDownloads = await window.claude.use('downloads'); }
  catch (e) { claudeDownloads = null; }
  return claudeDownloads;
}

// Devolve true quando o arquivo foi entregue; false se a pessoa recusou (dentro do Claude)
async function downloadFile(filename, content, mime){
  // Dentro do Claude, o arquivo é entregue pela própria plataforma
  const dl = await getClaudeDownloads();
  if (dl) {
    try { await dl.save({ filename, data: content }); return true; }
    catch (e) { if (!e || e.code !== 'declined') throw e; return false; }
  }
  const blob = new Blob([content], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

function csvNum(n){ return round2(n).toFixed(2).replace('.', ','); }
function toCSV(rows){
  return '\ufeff' + rows.map(r => r.map(c => {
    const s = c === null || c === undefined ? '' : String(c);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
}
function saveCSV(filename, rows){
  downloadFile(filename, toCSV(rows), 'text/csv;charset=utf-8')
    .catch(() => toast('Não foi possível exportar o arquivo.', 'error'));
}
function exportVendas(){
  const rows = [['Nº', 'Data', 'Hora', 'Cliente', 'Itens', 'Consumo', 'Forma de pagamento', 'Situação', 'Subtotal', 'Desconto', 'Total', 'Atendente']];
  filteredHistory().forEach(s => rows.push([
    saleLabel(s), fmtDate(s.date), fmtTime(s.date), s.customerId ? customerName(s.customerId) : 'Balcão',
    itemsSummary(s), CONSUMO_LABELS[saleConsumo(s)], methodLabel(s), statusTag(s).replace(/<[^>]+>/g, ''),
    csvNum(saleSubtotal(s)), csvNum(s.discount || 0), csvNum(s.total), s.sellerName || ''
  ]));
  saveCSV('vendas-' + dayKey(new Date()) + '.csv', rows);
}
function exportCaixa(){
  const c = caixaData(ui.caixaDate);
  const rows = [['Hora', 'Movimento', 'Descrição', 'Forma', 'Valor', 'Situação']];
  c.movements.forEach(m => rows.push([fmtTime(m.date), m.kind, m.desc, m.method, csvNum(m.value), m.canceled ? 'Cancelada' : '']));
  rows.push([]);
  c.methods.forEach(x => rows.push(['', 'Total ' + METHOD_LABELS[x.m], '', '', csvNum(x.total), '']));
  rows.push(['', 'Total recebido', '', '', csvNum(c.recebido), '']);
  rows.push(['', 'Vendido no fiado', '', '', csvNum(c.fiadoVendido), '']);
  saveCSV('caixa-' + ui.caixaDate + '.csv', rows);
}
function exportRelatorio(){
  const d = reportData();
  const rows = [['Produto', 'Categoria', 'Vendido como', 'Total (unidades)', 'Faturamento', 'Lucro']];
  d.prods.forEach(p => rows.push([p.name, p.category, formsSoldText(p.forms), fmtQty(p.qty), csvNum(p.revenue), csvNum(p.profit)]));
  rows.push([]);
  rows.push(['Faturamento total (com descontos)', '', '', '', csvNum(d.fat), csvNum(d.lucro)]);
  rows.push(['Vendas fiado entram no faturamento e no lucro só quando são recebidas, na data do recebimento.']);
  const label = (PERIODS.find(p => p[0] === ui.reportPeriod) || ['', 'periodo'])[1].toLowerCase().replace(/\s+/g, '-');
  saveCSV('relatorio-' + label + '-' + dayKey(new Date()) + '.csv', rows);
}

function exportGastos(){
  const rows = [['Data', 'Descrição', 'Categoria', 'Situação', 'Forma de pagamento', 'Valor', 'Observação']];
  filteredExpenses().forEach(e => rows.push([
    fmtDate(keyToDate(e.date).toISOString()), e.description, e.category || 'Outros',
    expenseIsOpen(e) ? (expenseIsOverdue(e) ? 'Vencida' : 'A pagar') : 'Pago',
    e.method ? (EXPENSE_METHODS[e.method] || e.method) : '', csvNum(e.amount), e.notes || ''
  ]));
  saveCSV('gastos-' + dayKey(new Date()) + '.csv', rows);
}
