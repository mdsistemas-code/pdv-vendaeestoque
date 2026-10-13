/* auth.js — Login e senha
   • Modo local e demonstração web: os usuários ficam no próprio banco (coleção "users").
     A senha nunca é guardada: só um "hash" (PBKDF2-SHA256 com sal), que não dá para reverter.
   • Modo Firebase: o login é o do Firebase Authentication (ver app.js).
   O primeiro acesso cria o usuário administrador e mostra um código de recuperação. */

const SESSION_KEY = DB_NAME + ':sessao';
let currentUser = null;            // { id, name, username, admin }
let authScreen = 'loading';        // 'loading' | 'setup' | 'firstlogin' | 'login' | 'firebase' | null (dentro do sistema)
let loginFailures = 0, loginBlockedUntil = 0;

function usesAppLogin(){ return storageMode !== 'firebase' && !offline; }

/* ---------- SHA-256 em JavaScript (reserva para páginas sem crypto.subtle, ex.: http comum) ---------- */
const SHA_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256Hex(str){
  const msg = new TextEncoder().encode(str);
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = len * 8;
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- Hash de senha ---------- */
function toHex(buf){ return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join(''); }
function randomHex(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return toHex(a); }
function hasSubtle(){ return !!(window.crypto && crypto.subtle && window.isSecureContext !== false); }

async function hashSecret(secret, salt, algo, iterations){
  if (algo === 'pbkdf2') {
    if (!hasSubtle()) throw { code: 'no-subtle' };
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
    return toHex(out);
  }
  let h = sha256Hex(salt + ':' + secret);
  for (let i = 1; i < iterations; i++) h = sha256Hex(h + salt);
  return h;
}
async function makeSecret(secret){
  const algo = hasSubtle() ? 'pbkdf2' : 'sha256x';
  const iterations = algo === 'pbkdf2' ? 150000 : 4000;
  const salt = randomHex(16);
  return { algo, iterations, salt, hash: await hashSecret(secret, salt, algo, iterations) };
}
async function checkSecret(rec, secret){
  if (!rec || !rec.hash) return false;
  return (await hashSecret(secret, rec.salt, rec.algo || 'pbkdf2', rec.iterations || 150000)) === rec.hash;
}

// Código de recuperação: 8 letras/números fáceis de ler, ex.: K7M2-Q9TX
function newRecoveryCode(){
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  const s = Array.from(a, n => abc[n % abc.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
function normalizeCode(c){ return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normalizeUsername(u){ return String(u || '').trim().toLowerCase(); }

/* ---------- Login com usuário ou e-mail ----------
   Um campo só: com "@" é e-mail; sem, é usuário. Uma conta pode ter os dois. */
function isValidEmail(v){ return v.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
// Lê o que foi digitado e devolve { username } ou { email } ou { error }
function parseLoginId(raw){
  const v = normalizeUsername(raw);
  if (!v) return { error: 'Digite o usuário ou e-mail.' };
  if (v.includes('@')) {
    if (!isValidEmail(v)) return { error: 'Esse e-mail parece incompleto. Use o formato nome@gmail.com.' };
    return { email: v };
  }
  if (!/^[a-z0-9._-]{2,30}$/.test(v)) return { error: 'O usuário deve ter de 2 a 30 letras ou números, sem espaços nem acentos. Ou use um e-mail.' };
  return { username: v };
}
// Já existe conta com esse usuário/e-mail? (ignora a própria conta, na edição)
function loginIdTaken(idr, exceptId){
  return state.users.some(u => u.id !== exceptId && ((idr.username && u.username === idr.username) || (idr.email && u.email === idr.email)));
}
// Acha a conta pelo que foi digitado: com "@" procura pelo e-mail; sem, pelo usuário
function findUserByLogin(raw){
  const v = normalizeUsername(raw);
  if (!v) return null;
  return state.users.find(u => v.includes('@') ? u.email === v : u.username === v) || null;
}
function loginLabel(u){ return u.username || u.email || ''; }
function loginIdsHTML(u){
  return [u.username ? 'usuário: <b>' + esc(u.username) + '</b>' : '', u.email ? 'e-mail: <b>' + esc(u.email) + '</b>' : ''].filter(Boolean).join(' · ');
}
// Campo único de usuário ou e-mail: teclado com "@" no celular, sem letra maiúscula automática
function prepLoginInput(input, placeholder){
  input.type = 'text';
  input.inputMode = 'email';
  input.autocomplete = 'username';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.placeholder = placeholder || '';
}

/* ---------- Sessão ---------- */
function readSession(){
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e) { return null; }
}
function writeSession(userId, remember){
  const v = JSON.stringify({ userId, at: new Date().toISOString() });
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, v);
    (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  } catch (e) { /* navegador sem armazenamento: vale só enquanto a página estiver aberta */ }
}
function clearSession(){
  try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* nada a limpar */ }
}
// Contas "pendente" vieram da antiga opção "Criar nova conta": só entram depois que um administrador aprovar
function isActiveUser(u){ return u.status !== 'pendente'; }
function activeAdminsCount(){ return state.users.filter(u => u.admin && isActiveUser(u)).length; }
function userView(u){ return { id: u.id, name: u.name || loginLabel(u), username: u.username || null, email: u.email || null, admin: !!u.admin }; }
function sellerInfo(){ return currentUser ? { id: currentUser.id, name: currentUser.name } : { id: null, name: '' }; }

/* ---------- Tela de entrada ---------- */
function showAuthScreen(mode){
  authScreen = mode;
  const ov = $('#loginOverlay');
  ov.classList.remove('hidden');
  const loading = mode === 'loading';
  $('#loginLoading').style.display = loading ? '' : 'none';
  $('#loginForm').style.display = loading ? 'none' : '';
  if (loading) return;
  const setup = mode === 'setup';
  const firebase = mode === 'firebase';
  const firstlogin = mode === 'firstlogin';
  // Na primeira inicialização: abas "Primeiro acesso" e "Já tenho conta"
  $('#authTabs').style.display = (setup || firstlogin) ? '' : 'none';
  $$('#authTabs button').forEach(b => b.classList.toggle('active', b.dataset.auth === mode));
  $('#firstLoginBox').style.display = firstlogin ? '' : 'none';
  $('#loginFields').style.display = firstlogin ? 'none' : '';
  $('#firstLoginCloudHint').style.display = storageMode === 'local' ? '' : 'none';
  if (firstlogin && storageMode === 'claude') {
    $('#firstLoginText').innerHTML = 'Esta demonstração ainda não tem nenhuma conta. Para entrar com a conta que você usa no seu site ou em outro aparelho, carregue o arquivo de backup de lá (<b>Configurações → Baixar backup</b>). Depois é só entrar com o mesmo usuário e senha.';
  }
  setText('loginTitle', setup ? 'Criar o primeiro acesso' : firstlogin ? 'Entrar com uma conta que já existe' : 'Entrar');
  setText('loginSub', setup
    ? 'Crie a conta do administrador. Depois você pode cadastrar outras pessoas em Configurações.'
    : firstlogin ? '' : firebase ? 'Use o e-mail e a senha cadastrados no Firebase.' : 'Entre com o seu usuário ou e-mail e a senha.');
  $$('.setup-only').forEach(el => { el.style.display = setup ? '' : 'none'; });
  $$('.local-only').forEach(el => { el.style.display = firebase ? 'none' : ''; });
  $('#btnForgot').style.display = (setup || firebase) ? 'none' : '';
  setText('loginUserLabel', firebase ? 'E-mail' : 'Usuário ou e-mail');
  prepLoginInput($('#loginUser'), firebase ? 'voce@email.com' : setup ? 'Ex: ze ou ze@gmail.com' : '');
  if (firebase) { $('#loginUser').type = 'email'; $('#loginUser').autocomplete = 'email'; }
  $('#loginPass').autocomplete = setup ? 'new-password' : 'current-password';
  setText('btnLogin', setup ? 'Criar e entrar' : 'Entrar');
  $('#loginError').style.display = 'none';
  $('#userChip').style.display = 'none';
  focusLater(() => firstlogin ? $('#btnFirstLoginRestore') : setup ? $('#setupName') : $('#loginUser'), 60);
}

function enterApp(){
  authScreen = null;
  $('#loginOverlay').classList.add('hidden');
  $('#loginError').style.display = 'none';
  $('#loginPass').value = '';
  renderUserChip();
  goTo('inicio');   // cada entrada começa pela tela Início
}

function renderUserChip(){
  const chip = $('#userChip');
  chip.style.display = currentUser && !authScreen ? 'flex' : 'none';
  if (currentUser) setText('userName', currentUser.name);
}

// Decide o que mostrar sempre que a lista de usuários muda (modo local e demonstração)
function evaluateAuth(){
  if (!usesAppLogin() || !loaded.users) return;
  const active = state.users.filter(isActiveUser);
  if (!active.length) { currentUser = null; if (authScreen !== 'setup' && authScreen !== 'firstlogin') showAuthScreen('setup'); return; }
  if (currentUser) {
    const u = active.find(x => x.id === currentUser.id);
    if (!u) { logout('Seu usuário foi removido.'); return; }
    currentUser = userView(u);
    if (!authScreen) renderUserChip();
    return;
  }
  const sess = readSession();
  const u = sess && active.find(x => x.id === sess.userId);
  if (u) { currentUser = userView(u); enterApp(); }
  else if (authScreen !== 'login') showAuthScreen('login');
}

function logout(msg){
  clearSession();
  currentUser = null;
  if (typeof resetSaleForm === 'function') resetSaleForm();
  closeModal();
  if (storageMode === 'firebase' && db && db.auth) { db.auth.signOut(); }
  else showAuthScreen(state.users.some(isActiveUser) ? 'login' : 'setup');
  if (msg) toast(msg);
}

function loginErrorMsg(e){
  const code = e && e.code ? e.code : '';
  if (code === 'no-subtle') return 'Este navegador não consegue conferir a senha nesta página. Abra o sistema pelo endereço https.';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'E-mail ou senha incorretos.';
  if (/too-many-requests/.test(code)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/network-request-failed/.test(code)) return 'Sem internet. Confira a conexão e tente de novo.';
  if (/operation-not-allowed/.test(code)) return 'O login por e-mail e senha não está ativado no Firebase.';
  return 'Não foi possível entrar. Tente de novo.';
}
function showLoginError(msg){ const err = $('#loginError'); err.textContent = msg; err.style.display = 'block'; }

function showRecoveryCode(code, forName, then){
  const sheet = openModal(`
    <h3>Anote o código de recuperação</h3>
    <div class="sub">Se ${forName ? esc(forName) + ' esquecer' : 'você esquecer'} a senha, este código permite criar uma nova na tela de entrada. Guarde num lugar seguro, fora do computador. Ele não aparece de novo.</div>
    <div class="recovery-code">${esc(code)}</div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="rcCopy">Copiar</button>
      <button class="btn btn-primary" data-primary id="rcDone">Já anotei</button>
    </div>`);
  $('#rcCopy', sheet).addEventListener('click', () => copyText(code).then(() => toast('Código copiado.')).catch(() => {}));
  $('#rcDone', sheet).addEventListener('click', () => { closeModal(); if (then) then(); });
}

async function submitLogin(e){
  e.preventDefault();
  if (!db || authScreen === 'firstlogin') return;
  const btn = $('#btnLogin');
  $('#loginError').style.display = 'none';
  const userIn = $('#loginUser').value;
  const pass = $('#loginPass').value;
  const remember = $('#loginRemember').checked;

  if (authScreen === 'firebase') {
    btn.disabled = true; btn.textContent = 'Entrando…';
    try { await db.auth.signIn(userIn.trim(), pass); $('#loginPass').value = ''; }
    catch (ex) { showLoginError(loginErrorMsg(ex)); }
    finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    return;
  }

  if (authScreen === 'setup') {
    const name = $('#setupName').value.trim();
    if (!name) { showLoginError('Digite seu nome.'); return; }
    const idr = parseLoginId(userIn);
    if (idr.error) { showLoginError(idr.error); return; }
    if (pass.length < 4) { showLoginError('A senha precisa ter pelo menos 4 caracteres.'); return; }
    if (pass !== $('#setupPass2').value) { showLoginError('As senhas não conferem.'); return; }
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const code = newRecoveryCode();
      const rec = await makeSecret(pass);
      const recovery = await makeSecret(normalizeCode(code));
      const ref = await withSave(() => db.collection('users').add(Object.assign(
        { name, admin: true, createdAt: new Date().toISOString(), recovery }, idr, rec)));
      writeSession(ref.id, remember);
      currentUser = Object.assign({ id: ref.id, name, admin: true }, idr);
      enterApp();
      $('#setupName').value = ''; $('#setupPass2').value = '';
      showRecoveryCode(code, null, () => toast('Pronto! Bem-vindo, ' + name + '.'));
    } catch (ex) { showLoginError(errMsg(ex, loginErrorMsg(ex))); }
    finally { btn.disabled = false; btn.textContent = authScreen === 'setup' ? 'Criar e entrar' : 'Entrar'; }
    return;
  }

  // Entrar
  if (Date.now() < loginBlockedUntil) { showLoginError('Muitas tentativas erradas. Aguarde ' + Math.ceil((loginBlockedUntil - Date.now()) / 1000) + ' segundos.'); return; }
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    if (!normalizeUsername(userIn)) { showLoginError('Digite o usuário ou e-mail.'); return; }
    const u = findUserByLogin(userIn);
    const ok = u ? await checkSecret(u, pass) : false;
    if (!ok) {
      loginFailures++;
      if (loginFailures >= 5) { loginBlockedUntil = Date.now() + 30000; loginFailures = 0; }
      showLoginError(userIn.includes('@') ? 'E-mail ou senha incorretos.' : 'Usuário ou senha incorretos.');
      return;
    }
    loginFailures = 0;
    if (!isActiveUser(u)) { showLoginError('Sua conta ainda está aguardando a aprovação de um administrador.'); return; }
    writeSession(u.id, remember);
    currentUser = userView(u);
    enterApp();
    toast('Olá, ' + currentUser.name + '!');
    db.collection('users').doc(u.id).update({ lastLoginAt: new Date().toISOString() }).catch(() => {});
  } catch (ex) { showLoginError(loginErrorMsg(ex)); }
  finally { btn.disabled = false; btn.textContent = 'Entrar'; }
}

/* ---------- Primeira inicialização: entrar com uma conta que já existe ---------- */
// Traz os dados (e as contas) de outro aparelho por um arquivo de backup
async function firstLoginRestore(file){
  const result = await restoreBackup(file);
  if (!result) return;
  // Decide pelo conteúdo do arquivo: a lista de contas pode chegar do banco um instante depois
  if (result === 'com-contas' || state.users.some(isActiveUser)) {
    showAuthScreen('login');
    setText('loginSub', 'Dados carregados. Agora entre com o seu usuário ou e-mail e a senha.');
  } else {
    showAuthScreen('setup');
    toast('O backup foi carregado, mas não tinha contas. Crie o primeiro acesso para entrar.');
  }
}

/* ---------- Esqueci a senha (código de recuperação) ---------- */
function openRecovery(){
  const sheet = openModal(`
    <h3>Esqueci a senha</h3>
    <div class="sub">Use o código de recuperação que apareceu quando o usuário foi criado. Sem o código, peça a um administrador para criar uma nova senha em Configurações.</div>
    <label class="field-label" for="rvUser">Usuário ou e-mail</label>
    <input type="text" id="rvUser" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc($('#loginUser').value)}">
    <label class="field-label" for="rvCode">Código de recuperação</label>
    <input type="text" id="rvCode" placeholder="XXXX-XXXX" autocomplete="off">
    <div class="row-2">
      <div><label class="field-label" for="rvPass">Nova senha</label><input type="password" id="rvPass" autocomplete="new-password"></div>
      <div><label class="field-label" for="rvPass2">Repita a senha</label><input type="password" id="rvPass2" autocomplete="new-password"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Voltar</button>
      <button class="btn btn-primary" data-primary id="rvOk">Criar nova senha</button>
    </div>`);
  $('#rvOk', sheet).addEventListener('click', async ev => {
    const u = findUserByLogin($('#rvUser', sheet).value);
    const code = normalizeCode($('#rvCode', sheet).value);
    const p1 = $('#rvPass', sheet).value, p2 = $('#rvPass2', sheet).value;
    if (p1.length < 4) { toast('A nova senha precisa ter pelo menos 4 caracteres.', 'error'); return; }
    if (p1 !== p2) { toast('As senhas não conferem.', 'error'); return; }
    ev.target.disabled = true;
    try {
      if (!u || !u.recovery || !(await checkSecret(u.recovery, code))) { toast('Usuário/e-mail ou código de recuperação incorretos.', 'error'); return; }
      await withSave(async () => db.collection('users').doc(u.id).update(await makeSecret(p1)));
      closeModal();
      const typed = normalizeUsername($('#rvUser', sheet).value);
      $('#loginUser').value = typed;
      $('#loginPass').value = '';
      toast('Senha alterada. Entre com a nova senha.');
      if (canAutoFocus()) $('#loginPass').focus();
    } catch (ex) { toast(errMsg(ex, loginErrorMsg(ex)), 'error'); }
    finally { ev.target.disabled = false; }
  });
}

/* ---------- Usuários (Configurações) ---------- */
function renderUsersPanel(){
  const panel = $('#usersPanel');
  panel.style.display = usesAppLogin() ? '' : 'none';
  if (!usesAppLogin()) return;
  const admin = !!(currentUser && currentUser.admin);
  $('#btnNewUser').style.display = admin ? '' : 'none';
  setText('usersNote', admin
    ? 'Para cadastrar uma pessoa, use Novo usuário. Cada pessoa entra com o próprio usuário ou e-mail e a senha, e as vendas registram quem atendeu.'
    : 'Só administradores criam, aprovam e removem usuários. Você pode trocar a sua senha e o seu e-mail.');
  const me = currentUser && state.users.find(u => u.id === currentUser.id);
  setText('btnMyEmail', me && me.email ? 'Trocar meu e-mail' : 'Cadastrar meu e-mail');

  const pending = state.users.filter(u => !isActiveUser(u)).sort((x, y) => String(x.requestedAt || '').localeCompare(String(y.requestedAt || '')));
  const pendBox = $('#pendingUsers');
  pendBox.style.display = admin && pending.length ? '' : 'none';
  pendBox.innerHTML = admin && pending.length ? `
    <div class="pending-title">Aguardando aprovação (${pending.length})</div>
    ${pending.map(u => `
      <div class="list-row">
        <div class="lr-main">
          <div class="name">${esc(u.name || loginLabel(u))}</div>
          <div class="meta">${loginIdsHTML(u)}${u.requestedAt ? ' — pediu em ' + fmtDate(u.requestedAt) + ' às ' + fmtTime(u.requestedAt) : ''}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-outline btn-xs" data-ureject="${u.id}">Recusar</button>
          <button class="btn btn-primary btn-xs" data-uapprove="${u.id}">Aprovar</button>
        </div>
      </div>`).join('')}` : '';

  const admins = activeAdminsCount();
  $('#usersList').innerHTML = state.users.filter(isActiveUser).sort(byName).map(u => {
    const me = currentUser && u.id === currentUser.id;
    const lastAdmin = u.admin && admins <= 1;
    const canRemove = admin && !me && !lastAdmin;
    return `
      <div class="list-row">
        <div class="lr-main">
          <div class="name">${esc(u.name || loginLabel(u))} ${u.admin ? '<span class="tag neutral">Administrador</span>' : ''} ${me ? '<span class="tag ok">Você</span>' : ''}</div>
          <div class="meta">${loginIdsHTML(u)}${u.lastLoginAt ? ' — último acesso ' + fmtDate(u.lastLoginAt) + ' às ' + fmtTime(u.lastLoginAt) : ''}${u.approvedBy ? ' — aprovado por ' + esc(u.approvedBy) : ''}</div>
        </div>
        <div class="row-actions">
          ${admin && !me && !lastAdmin ? `<button class="btn btn-outline btn-xs" data-uadmin="${u.id}">${u.admin ? 'Tirar administrador' : 'Tornar administrador'}</button>` : ''}
          ${admin && !me ? `<button class="btn btn-outline btn-xs" data-uemail="${u.id}">E-mail</button>` : ''}
          ${admin && !me ? `<button class="btn btn-outline btn-xs" data-ureset="${u.id}">Nova senha</button>` : ''}
          ${canRemove ? `<button class="icon-btn" data-udel="${u.id}" aria-label="Remover usuário">✕</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function approveUser(id){
  const u = state.users.find(x => x.id === id);
  if (!u || !requireDb()) return;
  try {
    await withSave(() => db.collection('users').doc(id).update({ status: 'ativo', approvedAt: new Date().toISOString(), approvedBy: currentUser ? currentUser.name : '' }));
    toast('Conta de ' + (u.name || loginLabel(u)) + ' aprovada. Já pode entrar.');
  } catch (e) { toast(errMsg(e, 'Não foi possível aprovar a conta.'), 'error'); }
}

async function rejectUser(id){
  const u = state.users.find(x => x.id === id);
  if (!u || !requireDb()) return;
  const ok = await confirmDialog({ title: 'Recusar conta?', message: 'O pedido de ' + (u.name || loginLabel(u)) + ' (' + (u.username ? 'usuário ' + u.username : 'e-mail ' + u.email) + ') será apagado.', okLabel: 'Recusar', danger: true });
  if (!ok) return;
  try { await withSave(() => db.collection('users').doc(id).delete()); toast('Pedido recusado.'); }
  catch (e) { toast(errMsg(e, 'Não foi possível recusar a conta.'), 'error'); }
}

async function toggleAdmin(id){
  const u = state.users.find(x => x.id === id);
  if (!u || !requireDb()) return;
  const makeAdmin = !u.admin;
  if (!makeAdmin && activeAdminsCount() <= 1) { toast('Precisa existir pelo menos um administrador.', 'error'); return; }
  const who = u.name || loginLabel(u);
  const ok = await confirmDialog({
    title: makeAdmin ? 'Tornar administrador?' : 'Tirar administrador?',
    message: makeAdmin ? who + ' vai poder criar, aprovar e remover usuários e definir senhas.' : who + ' deixa de gerenciar usuários.',
    okLabel: makeAdmin ? 'Tornar administrador' : 'Tirar administrador'
  });
  if (!ok) return;
  try {
    const patch = { admin: makeAdmin };
    let code = null;
    if (makeAdmin && !u.recovery) { code = newRecoveryCode(); patch.recovery = await makeSecret(normalizeCode(code)); }
    await withSave(() => db.collection('users').doc(id).update(patch));
    toast(makeAdmin ? who + ' agora é administrador.' : who + ' não é mais administrador.');
    if (code) showRecoveryCode(code, who);
  } catch (e) { toast(errMsg(e, 'Não foi possível alterar o usuário.'), 'error'); }
}

function openNewUser(){
  const sheet = openModal(`
    <h3>Novo usuário</h3>
    <div class="sub">A pessoa vai entrar com este usuário (ou e-mail) e senha.</div>
    <label class="field-label" for="nuName">Nome</label>
    <input type="text" id="nuName" placeholder="Ex: Maria" autocomplete="off">
    <label class="field-label" for="nuUser">Usuário ou e-mail (para entrar)</label>
    <input type="text" id="nuUser" inputmode="email" placeholder="Ex: maria ou maria@gmail.com" autocomplete="off" autocapitalize="none" spellcheck="false">
    <div class="row-2">
      <div><label class="field-label" for="nuPass">Senha</label><input type="password" id="nuPass" autocomplete="new-password"></div>
      <div><label class="field-label" for="nuPass2">Repita a senha</label><input type="password" id="nuPass2" autocomplete="new-password"></div>
    </div>
    <label class="check" style="margin-top:14px"><input type="checkbox" id="nuAdmin"> Administrador (pode criar e remover usuários)</label>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="nuOk">Criar usuário</button>
    </div>`);
  $('#nuOk', sheet).addEventListener('click', async ev => {
    if (!requireDb()) return;
    const name = $('#nuName', sheet).value.trim();
    const idr = parseLoginId($('#nuUser', sheet).value);
    const p1 = $('#nuPass', sheet).value, p2 = $('#nuPass2', sheet).value;
    const admin = $('#nuAdmin', sheet).checked;
    if (!name) { toast('Digite o nome.', 'error'); return; }
    if (idr.error) { toast(idr.error, 'error'); return; }
    if (loginIdTaken(idr)) { toast(idr.email ? 'Já existe uma conta com esse e-mail.' : 'Já existe alguém com esse usuário.', 'error'); return; }
    if (p1.length < 4) { toast('A senha precisa ter pelo menos 4 caracteres.', 'error'); return; }
    if (p1 !== p2) { toast('As senhas não conferem.', 'error'); return; }
    ev.target.disabled = true;
    try {
      const data = Object.assign({ name, admin, createdAt: new Date().toISOString() }, idr, await makeSecret(p1));
      let code = null;
      if (admin) { code = newRecoveryCode(); data.recovery = await makeSecret(normalizeCode(code)); }
      await withSave(() => db.collection('users').add(data));
      closeModal();
      toast('Conta ' + (idr.username || idr.email) + ' criada.');
      if (code) showRecoveryCode(code, name);
    } catch (ex) {
      ev.target.disabled = false;
      toast(errMsg(ex, 'Não foi possível criar o usuário.'), 'error');
    }
  });
}

function openPasswordChange(targetId){
  const u = state.users.find(x => x.id === targetId);
  if (!u) return;
  const self = currentUser && u.id === currentUser.id;
  const sheet = openModal(`
    <h3>${self ? 'Trocar minha senha' : 'Nova senha para ' + esc(u.name || loginLabel(u))}</h3>
    <div class="sub">${self ? 'Confirme a senha atual e escolha uma nova.' : 'Passe a nova senha para a pessoa. Ela pode trocar depois.'}</div>
    ${self ? '<label class="field-label" for="pcOld">Senha atual</label><input type="password" id="pcOld" autocomplete="current-password">' : ''}
    <div class="row-2">
      <div><label class="field-label" for="pcNew">Nova senha</label><input type="password" id="pcNew" autocomplete="new-password"></div>
      <div><label class="field-label" for="pcNew2">Repita a senha</label><input type="password" id="pcNew2" autocomplete="new-password"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="pcOk">Salvar senha</button>
    </div>`);
  $('#pcOk', sheet).addEventListener('click', async ev => {
    if (!requireDb()) return;
    const p1 = $('#pcNew', sheet).value, p2 = $('#pcNew2', sheet).value;
    if (p1.length < 4) { toast('A senha precisa ter pelo menos 4 caracteres.', 'error'); return; }
    if (p1 !== p2) { toast('As senhas não conferem.', 'error'); return; }
    ev.target.disabled = true;
    try {
      if (self && !(await checkSecret(u, $('#pcOld', sheet).value))) { toast('A senha atual está errada.', 'error'); return; }
      await withSave(async () => db.collection('users').doc(u.id).update(await makeSecret(p1)));
      closeModal();
      toast(self ? 'Sua senha foi alterada.' : 'Nova senha definida para ' + (u.name || loginLabel(u)) + '.');
    } catch (ex) { toast(errMsg(ex, 'Não foi possível alterar a senha.'), 'error'); }
    finally { ev.target.disabled = false; }
  });
}

// Dá para adicionar um e-mail a contas que já existem (criadas só com usuário)
function openEmailChange(targetId){
  const u = state.users.find(x => x.id === targetId);
  if (!u) return;
  const self = currentUser && u.id === currentUser.id;
  const who = u.name || loginLabel(u);
  const sheet = openModal(`
    <h3>${u.email ? 'Trocar e-mail' : 'Cadastrar e-mail'}${self ? '' : ' de ' + esc(who)}</h3>
    <div class="sub">${self ? 'Com o e-mail cadastrado, você pode entrar usando o e-mail no lugar do usuário.' : who + ' vai poder entrar usando este e-mail.'}${u.email && u.username ? ' Deixe em branco para tirar o e-mail.' : ''}</div>
    <label class="field-label" for="emNew">E-mail</label>
    <input type="email" id="emNew" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="nome@gmail.com" value="${esc(u.email || '')}">
    ${self ? '<label class="field-label" for="emPass">Sua senha (para confirmar)</label><input type="password" id="emPass" autocomplete="current-password">' : ''}
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Cancelar</button>
      <button class="btn btn-primary" data-primary id="emOk">Salvar e-mail</button>
    </div>`);
  $('#emOk', sheet).addEventListener('click', async ev => {
    if (!requireDb()) return;
    const v = normalizeUsername($('#emNew', sheet).value);
    if (!v && !u.username) { toast('Esta conta entra só pelo e-mail: ele não pode ficar em branco.', 'error'); return; }
    if (v && !isValidEmail(v)) { toast('Digite um e-mail válido, como nome@gmail.com.', 'error'); return; }
    if (v && loginIdTaken({ email: v }, u.id)) { toast('Já existe outra conta com esse e-mail.', 'error'); return; }
    if (v === (u.email || '')) { closeModal(); return; }
    ev.target.disabled = true;
    try {
      if (self && !(await checkSecret(u, $('#emPass', sheet).value))) { toast('A senha está errada.', 'error'); return; }
      await withSave(() => db.collection('users').doc(u.id).update({ email: v || null }));
      closeModal();
      toast(v ? (self ? 'E-mail salvo. Agora você pode entrar com ' + v + '.' : 'E-mail de ' + who + ' salvo.') : 'E-mail removido.');
    } catch (ex) { toast(errMsg(ex, 'Não foi possível salvar o e-mail.'), 'error'); }
    finally { ev.target.disabled = false; }
  });
}

async function deleteUser(id){
  const u = state.users.find(x => x.id === id);
  if (!u || !requireDb()) return;
  if (u.admin && activeAdminsCount() <= 1) { toast('Não dá para remover o último administrador.', 'error'); return; }
  const ok = await confirmDialog({ title: 'Remover usuário?', message: (u.name || loginLabel(u)) + ' não vai mais conseguir entrar no sistema. As vendas feitas por essa pessoa continuam registradas.', okLabel: 'Remover', danger: true });
  if (!ok) return;
  try { await withSave(() => db.collection('users').doc(id).delete()); toast('Usuário removido.'); }
  catch (e) { toast(errMsg(e, 'Não foi possível remover o usuário.'), 'error'); }
}

/* ---------- Eventos ---------- */
$('#loginForm').addEventListener('submit', submitLogin);
$('#btnForgot').addEventListener('click', openRecovery);
$('#authTabs').addEventListener('click', e => { const b = e.target.closest('[data-auth]'); if (b) showAuthScreen(b.dataset.auth); });
$('#btnFirstLoginRestore').addEventListener('click', () => $('#firstLoginFile').click());
$('#firstLoginFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) firstLoginRestore(f); });
$('#btnLogoutTop').addEventListener('click', () => logout());
$('#btnNewUser').addEventListener('click', openNewUser);
$('#btnMyPassword').addEventListener('click', () => { if (currentUser) openPasswordChange(currentUser.id); });
$('#btnMyEmail').addEventListener('click', () => { if (currentUser) openEmailChange(currentUser.id); });
$('#usersList').addEventListener('click', e => {
  const r = e.target.closest('[data-ureset]'); if (r) { openPasswordChange(r.dataset.ureset); return; }
  const em = e.target.closest('[data-uemail]'); if (em) { openEmailChange(em.dataset.uemail); return; }
  const d = e.target.closest('[data-udel]'); if (d) { deleteUser(d.dataset.udel); return; }
  const ad = e.target.closest('[data-uadmin]'); if (ad) { toggleAdmin(ad.dataset.uadmin); return; }
});
$('#pendingUsers').addEventListener('click', e => {
  const ap = e.target.closest('[data-uapprove]'); if (ap) { approveUser(ap.dataset.uapprove); return; }
  const rj = e.target.closest('[data-ureject]'); if (rj) { rejectUser(rj.dataset.ureject); return; }
});
