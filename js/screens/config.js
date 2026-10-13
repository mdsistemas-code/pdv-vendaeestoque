/* screens/config.js
   Tela Configurações: onde os dados ficam, backup, restauração e conta. */

/* =========================================================
   CONFIGURAÇÕES — onde os dados ficam, backup, restauração
   ========================================================= */
const LAST_BACKUP_KEY = DB_NAME + ':ultimoBackup';

function lastBackupDate(){
  try { const v = localStorage.getItem(LAST_BACKUP_KEY); return v ? new Date(v) : null; }
  catch (e) { return null; }
}

function renderConfig(){
  const info = $('#storageInfo');
  const counts = plural(state.products.length, 'produto', 'produtos') + ', ' +
    plural(state.customers.length, 'cliente', 'clientes') + ', ' +
    plural(state.sales.length, 'venda', 'vendas') + ', ' +
    plural(state.payments.length, 'recebimento', 'recebimentos') + ' de fiado e ' +
    plural(state.expenses.length, 'gasto', 'gastos') + '.';

  if (offline) {
    info.innerHTML = '<p class="neg">O banco de dados não abriu. Confira o arquivo config.js e recarregue a página.</p>';
  } else if (storageMode === 'claude') {
    info.innerHTML = '<p><b>Demonstração no Claude.</b> Os dados ficam salvos no próprio link e aparecem em qualquer aparelho em que você abrir esse link. Para usar no seu site, publique a pasta do projeto (veja o README).</p><p class="muted">' + counts + '</p>';
  } else if (storageMode === 'firebase') {
    info.innerHTML = '<p><b>Na nuvem (Firebase).</b> Os dados ficam online e aparecem em qualquer computador ou celular onde você entrar com a sua conta. Se a internet cair, o sistema continua funcionando e envia tudo quando ela voltar.</p><p class="muted">' + counts + '</p>';
  } else {
    info.innerHTML = '<p><b>Neste navegador.</b> Os dados ficam guardados neste computador' +
      (db && !db.usingIndexedDB ? ' (modo reserva, com menos espaço)' : '') +
      '. Outro computador ou celular não enxerga estes dados. Para usar em vários aparelhos, ative o modo Firebase (veja o README).</p><p class="muted">' + counts + '</p>';
  }

  const lb = lastBackupDate();
  setText('lastBackupInfo', lb
    ? 'Último backup feito neste aparelho: ' + fmtDate(lb.toISOString()) + ' às ' + fmtTime(lb.toISOString()) + '.'
    : 'Nenhum backup feito neste aparelho ainda.');

  renderUsersPanel();
  renderBrandPanel();
  const isCloud = storageMode === 'firebase' && db && db.auth;
  $('#accountPanel').style.display = isCloud ? '' : 'none';
  if (isCloud) { const u = db.auth.user(); setText('accountEmail', u ? u.email : '—'); }
  renderBackupReminder();
}

function renderBackupReminder(){
  const el = $('#backupReminder');
  if (storageMode !== 'local' || offline || !isReady() || state.sales.length === 0) { el.style.display = 'none'; return; }
  const lb = lastBackupDate();
  const days = lb ? Math.floor((Date.now() - lb.getTime()) / 86400000) : null;
  if (days !== null && days < 7) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  setText('backupReminderText', days === null
    ? 'Você ainda não fez nenhum backup. Os dados ficam só neste navegador: se ele for limpo ou o computador der problema, eles se perdem.'
    : 'Seu último backup foi há ' + days + ' dias. Faça um novo para não perder as vendas recentes.');
}

async function downloadBackup(){
  if (!requireDb()) return;
  try {
    const dados = await db.exportAll();
    const payload = { app: 'deposito-bebidas', versao: 1, exportadoEm: new Date().toISOString(), dados };
    await downloadFile('backup-deposito-' + dayKey(new Date()) + '.json', JSON.stringify(payload, null, 2), 'application/json');
    try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); } catch (e) { /* sem localStorage */ }
    toast('Backup baixado. Guarde o arquivo num lugar seguro: pendrive, e-mail ou nuvem.');
    renderConfig();
  } catch (e) {
    toast(errMsg(e, 'Não foi possível gerar o backup.'), 'error');
  }
}

function readJsonFile(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(new Error('O arquivo escolhido não é um backup válido.')); } };
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsText(file);
  });
}

async function restoreBackup(file){
  if (!requireDb()) return false;
  let payload;
  try { payload = await readJsonFile(file); }
  catch (e) { toast(e.message, 'error'); return false; }
  const dados = payload && payload.dados;
  const valid = payload && payload.app === 'deposito-bebidas' && dados &&
    COLLECTIONS.every(c => dados[c] === undefined || Array.isArray(dados[c]));
  if (!valid) { toast('Este arquivo não é um backup deste sistema.', 'error'); return false; }
  // Backup antigo, sem usuários: mantém os usuários e senhas atuais
  const backupHasUsers = Array.isArray(dados.users) && dados.users.length > 0;
  if (!backupHasUsers) dados.users = state.users.slice();
  if (!Array.isArray(dados.settings)) dados.settings = state.settings.slice();
  const n = c => (dados[c] || []).length;
  const counts = plural(n('products'), 'produto', 'produtos') + ', ' + plural(n('customers'), 'cliente', 'clientes') + ', ' +
    plural(n('sales'), 'venda', 'vendas') + ', ' + plural(n('payments'), 'recebimento', 'recebimentos') + ', ' + plural(n('expenses'), 'gasto', 'gastos');
  // Aparelho sem dados (ex.: primeira inicialização): não há nada a perder
  const hasData = ['products', 'customers', 'sales', 'payments', 'expenses'].some(c => state[c].length);
  const usersNote = backupHasUsers && storageMode !== 'firebase'
    ? (hasData || state.users.length ? ' Os usuários e senhas também passam a ser os do backup.' : ' As contas do backup também vêm junto.')
    : '';
  const ok = await confirmDialog(hasData ? {
    title: 'Restaurar backup?',
    message: 'Os dados atuais serão substituídos pelos do arquivo (' + counts + ').' + usersNote + ' Se precisar dos dados atuais, baixe um backup deles antes.',
    okLabel: 'Substituir dados',
    danger: true
  } : {
    title: 'Carregar backup?',
    message: 'Os dados do arquivo serão carregados neste aparelho (' + counts + ').' + usersNote,
    okLabel: 'Carregar dados'
  });
  if (!ok) return false;
  try {
    await withSave(() => db.replaceAll(dados));
    cart = {};
    toast('Backup restaurado.');
    return backupHasUsers ? 'com-contas' : 'sem-contas';   // a tela de entrada usa isso na primeira inicialização
  } catch (e) {
    toast(errMsg(e, 'Não foi possível restaurar o backup.'), 'error');
    return false;
  }
}

async function wipeAll(){
  if (!requireDb()) return;
  const ok = await confirmDialog({
    title: 'Apagar todos os dados?',
    message: 'Produtos, clientes, vendas, recebimentos e gastos serão apagados. Os usuários, as senhas, o nome e a logo continuam. Baixe um backup antes se quiser guardar alguma coisa.',
    okLabel: 'Apagar tudo',
    danger: true
  });
  if (!ok) return;
  const sure = await confirmDialog({ title: 'Tem certeza?', message: 'Esta ação não pode ser desfeita.', okLabel: 'Sim, apagar tudo', danger: true });
  if (!sure) return;
  try {
    await withSave(() => db.replaceAll({ users: state.users.slice(), settings: state.settings.slice() }));   // mantém usuários, senhas, nome e logo
    cart = {};
    toast('Todos os dados foram apagados.');
  } catch (e) {
    toast(errMsg(e, 'Não foi possível apagar os dados.'), 'error');
  }
}

// Eventos da tela
$('#btnBackup').addEventListener('click', downloadBackup);
$('#btnBackupReminder').addEventListener('click', downloadBackup);
$('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
$('#restoreFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) restoreBackup(f);
});
$('#btnWipe').addEventListener('click', wipeAll);
$('#btnLogout').addEventListener('click', () => logout());

/* ---------- Nome e logo do sistema ---------- */
// Enquanto a pessoa edita (brandDirty), o formulário não é sobrescrito pelas atualizações do banco
function brandFormInfo(){
  return { name: $('#brandNameInput').value.trim() || ((window.APP_CONFIG || {}).nomeDaLoja || 'Depósito'), logo: safeImage(ui.brandLogo), showName: $('#brandShowName').checked };
}
function renderBrandPanel(){
  const canEdit = !!(currentUser && currentUser.admin) || storageMode === 'firebase';
  if (!ui.brandDirty) {
    const s = storeSettings();
    $('#brandNameInput').value = s.name || '';
    $('#brandNameInput').placeholder = (window.APP_CONFIG || {}).nomeDaLoja || 'Depósito';
    ui.brandLogo = safeImage(s.logo);
    $('#brandShowName').checked = !!s.showName;
  }
  const f = brandFormInfo();
  $('#brandLogoPreview').innerHTML = f.logo ? '<img src="' + f.logo + '" alt="Logo">' : '<span>Sem logo</span>';
  setText('btnPickLogo', f.logo ? 'Trocar imagem' : 'Escolher imagem');
  $('#btnRemoveLogo').style.display = f.logo && canEdit ? '' : 'none';
  $('#brandShowWrap').style.display = f.logo ? '' : 'none';
  const prev = $('#brandPreview');
  prev.innerHTML = brandHTML(f);
  prev.classList.toggle('has-logo', !!f.logo);
  ['brandNameInput', 'brandShowName'].forEach(id => { $('#' + id).disabled = !canEdit; });
  $('#btnPickLogo').style.display = canEdit ? '' : 'none';
  $('#brandActions').style.display = canEdit ? '' : 'none';
  $('#brandLockNote').style.display = canEdit ? 'none' : '';
  setText('btnBrandSave', ui.brandDirty ? 'Salvar nome e logo' : 'Salvo');
  $('#btnBrandSave').disabled = !ui.brandDirty;
}
function brandChanged(){ ui.brandDirty = true; renderBrandPanel(); }

async function useLogoFile(file){
  try {
    ui.brandLogo = await processImageFile(file, { maxW: 480, maxH: 160, png: true, maxBytes: 160000, trim: true });
    brandChanged();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveBrand(){
  if (!requireDb()) return;
  const name = $('#brandNameInput').value.trim();
  const data = { name, logo: safeImage(ui.brandLogo), showName: $('#brandShowName').checked, updatedAt: new Date().toISOString() };
  const btn = $('#btnBrandSave');
  btn.disabled = true;
  try {
    await withSave(() => db.collection('settings').doc('loja').set(data));
    ui.brandDirty = false;
    renderBrandPanel();
    applyBrand();
    toast('Nome e logo atualizados.');
  } catch (e) {
    btn.disabled = false;
    toast(errMsg(e, 'Não foi possível salvar o nome e a logo.'), 'error');
  }
}

async function resetBrand(){
  const ok = await confirmDialog({ title: 'Voltar ao padrão?', message: 'O nome volta a ser "' + ((window.APP_CONFIG || {}).nomeDaLoja || 'Depósito') + '" e a logo é removida.', okLabel: 'Voltar ao padrão' });
  if (!ok) return;
  $('#brandNameInput').value = '';
  ui.brandLogo = null;
  $('#brandShowName').checked = false;
  ui.brandDirty = true;
  await saveBrand();
}

$('#brandNameInput').addEventListener('input', brandChanged);
$('#brandShowName').addEventListener('change', brandChanged);
$('#btnPickLogo').addEventListener('click', () => $('#brandLogoFile').click());
$('#brandLogoFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) useLogoFile(f); });
$('#btnRemoveLogo').addEventListener('click', () => { ui.brandLogo = null; $('#brandShowName').checked = false; brandChanged(); });
$('#btnBrandSave').addEventListener('click', saveBrand);
$('#btnBrandReset').addEventListener('click', resetBrand);
$('#brandNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (ui.brandDirty) saveBrand(); } });
const logoBox = $('#brandLogoBox');
['dragenter', 'dragover'].forEach(t => logoBox.addEventListener(t, e => { e.preventDefault(); logoBox.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => logoBox.addEventListener(t, e => { e.preventDefault(); logoBox.classList.remove('drag'); }));
logoBox.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && $('#btnPickLogo').style.display !== 'none') useLogoFile(f); });
