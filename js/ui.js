/* ui.js
   Avisos (toasts), indicador de salvamento, janelas e confirmações. */

/* =========================================================
   Feedback: toasts, status de sincronização, modais
   ========================================================= */
function toast(msg, type, action){
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { close(); action.onClick(); });
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(close, action ? 8000 : (type === 'error' ? 5000 : 3200));
}

function setSync(s){
  const el = $('#syncStatus');
  el.dataset.state = s;
  setText('syncText', { connecting: 'Conectando…', ok: 'Dados salvos', saving: 'Salvando…', pending: 'Sem internet — salvando no aparelho', offline: 'Sem conexão' }[s] || '');
}
async function withSave(fn){
  pendingWrites++;
  setSync('saving');
  try { return await fn(); }
  finally { pendingWrites--; if (pendingWrites === 0) setSync(offline ? 'offline' : 'ok'); }
}
function errMsg(e, fallback){
  const code = e && (e.code || e.name);
  if (code === 'quota_exceeded' || code === 'QuotaExceededError' || code === 'resource-exhausted') return 'Espaço de armazenamento esgotado. Baixe um backup e apague dados antigos.';
  if (code === 'permission-denied') return 'Sem permissão para salvar. Confira o login e as regras do Firebase.';
  if (code === 'unauthenticated') return 'Sua sessão expirou. Entre novamente.';
  if (code === 'not-found') return 'Esse registro não existe mais.';
  return fallback;
}
function requireDb(){
  if (!db) { toast('O banco de dados não está disponível. Confira o config.js e recarregue a página.', 'error'); return false; }
  return true;
}

function openModal(html, opts){
  const ov = $('#modal');
  const sheet = $('#modalSheet');
  sheet.className = 'modal-sheet' + (opts && opts.wide ? ' wide' : '');
  sheet.innerHTML = html;
  labelTables(sheet);
  $$('[data-close]', sheet).forEach(b => b.addEventListener('click', closeModal));
  ov.classList.remove('hidden');
  const first = sheet.querySelector('input[type=text], input[type=tel], select');
  // Põe o cursor no primeiro campo, mas só se a pessoa (ou o preenchimento automático
  // do navegador) ainda não começou a usar a janela, para não desviar o que já está sendo digitado
  if (first && canAutoFocus()) setTimeout(() => {
    if (!first.isConnected || sheet.contains(document.activeElement)) return;
    first.focus();
    if (first.select) first.select();
  }, 40);
  return sheet;
}
function closeModal(){ $('#modal').classList.add('hidden'); $('#modalSheet').innerHTML = ''; }
function modalOpen(){ return !$('#modal').classList.contains('hidden'); }

let confirmDone = null;
function confirmDialog(o){
  return new Promise(resolve => {
    const ov = $('#confirmModal');
    setText('confirmTitle', o.title || 'Confirmar');
    setText('confirmMsg', o.message || '');
    const ok = $('#confirmOk');
    ok.textContent = o.okLabel || 'Confirmar';
    ok.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
    confirmDone = (v) => { ov.classList.add('hidden'); confirmDone = null; resolve(v); };
    ov.classList.remove('hidden');
    setTimeout(() => ok.focus(), 30);
  });
}
$('#confirmOk').addEventListener('click', () => confirmDone && confirmDone(true));
$('#confirmCancel').addEventListener('click', () => confirmDone && confirmDone(false));
$('#confirmModal').addEventListener('mousedown', e => { if (e.target.id === 'confirmModal' && confirmDone) confirmDone(false); });
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
$('#modalSheet').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    const p = $('#modalSheet [data-primary]');
    if (p) { e.preventDefault(); p.click(); }
  }
});
