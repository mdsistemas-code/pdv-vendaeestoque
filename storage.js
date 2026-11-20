/* =========================================================
   Camada de dados
   ---------------------------------------------------------
   O resto do sistema conversa com o banco sempre pela mesma
   interface, não importa onde os dados ficam:

     db.collection(nome).onSnapshot(callback)   → avisa a cada mudança
     db.collection(nome).add(dados)             → { id }
     db.collection(nome).doc(id).update(campos)
     db.collection(nome).doc(id).delete()
     db.increment(n)                            → soma n a um campo (ex.: estoque)
     db.exportAll() / db.replaceAll(dados)      → backup e restauração

   Coleções: products (produtos), customers (clientes), sales (vendas),
   payments (recebimentos de fiado), expenses (gastos/despesas), users (usuários e senhas)
   e settings (configurações, como o nome e a logo do sistema).

   Implementações, escolhidas em config.js:
     • local    (padrão) — IndexedDB, no navegador deste computador.
     • firebase           — Firestore na nuvem, com login, para vários aparelhos.
     • claude             — banco do claude.ai; usado só na demonstração web
                            publicada no Claude (no seu site, use local ou firebase).
   ========================================================= */
const COLLECTIONS = ['products', 'customers', 'sales', 'payments', 'expenses', 'users', 'settings'];
const DB_NAME = 'deposito-bebidas';

class Increment { constructor(n){ this.n = n; } }

function makeId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function cloneData(o){ return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

/* ---------------------------------------------------------
   Modo local: IndexedDB (com localStorage como reserva)
   --------------------------------------------------------- */
function createLocalDb(){
  const cache = {};
  const listeners = {};
  COLLECTIONS.forEach(c => { cache[c] = new Map(); listeners[c] = []; });
  let idb = null;
  // Mantém abas diferentes do mesmo navegador sincronizadas
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DB_NAME) : null;

  function openIDB(){
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
      const req = indexedDB.open(DB_NAME, 4); // versão 2: gastos; 3: usuários; 4: configurações
      req.onupgradeneeded = () => {
        const d = req.result;
        COLLECTIONS.forEach(c => { if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGetAll(name){
    return new Promise((resolve, reject) => {
      const rq = idb.transaction(name, 'readonly').objectStore(name).getAll();
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  function idbWrite(name, fn){
    return new Promise((resolve, reject) => {
      const t = idb.transaction(name, 'readwrite');
      fn(t.objectStore(name));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Gravação cancelada'));
    });
  }

  const lsKey = name => DB_NAME + ':' + name;
  function lsLoad(name){ try { return JSON.parse(localStorage.getItem(lsKey(name)) || '[]'); } catch (e) { return []; } }
  function lsSave(name){ localStorage.setItem(lsKey(name), JSON.stringify(rows(name))); }

  function rows(name){ return [...cache[name].entries()].map(([id, d]) => Object.assign({ id }, d)); }
  function toMap(list){ return new Map(list.filter(r => r && r.id).map(r => { const d = cloneData(r); delete d.id; return [String(r.id), d]; })); }

  async function readCollection(name){
    cache[name] = toMap(idb ? await idbGetAll(name) : lsLoad(name));
  }

  function snapshot(name){
    const docs = [...cache[name].entries()].map(([id, d]) => ({ id, data: () => d }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  function emit(name){
    const snap = snapshot(name);
    listeners[name].forEach(fn => fn(snap));
  }

  function applyPatch(old, patch){
    const out = Object.assign({}, old);
    Object.keys(patch).forEach(k => {
      const v = patch[k];
      if (v instanceof Increment) out[k] = Math.round(((Number(out[k]) || 0) + v.n) * 100) / 100;
      else if (v === undefined) delete out[k];
      else out[k] = cloneData(v);
    });
    return out;
  }

  // Grava um registro (ou apaga, se data === null) e avisa quem estiver ouvindo
  async function commit(name, id, data){
    if (idb) {
      await idbWrite(name, st => { if (data === null) st.delete(id); else st.put(Object.assign({ id }, data)); });
      if (data === null) cache[name].delete(id); else cache[name].set(id, data);
    } else {
      const prev = cache[name].get(id);
      if (data === null) cache[name].delete(id); else cache[name].set(id, data);
      try { lsSave(name); }
      catch (e) {
        if (prev) cache[name].set(id, prev); else cache[name].delete(id);
        throw { code: 'quota_exceeded', message: 'Espaço do navegador esgotado' };
      }
    }
    emit(name);
    if (channel) channel.postMessage({ name });
  }

  return {
    mode: 'local',
    usingIndexedDB: false,
    increment: n => new Increment(n),

    async init(){
      try { idb = await openIDB(); }
      catch (e) { idb = null; console.warn('IndexedDB indisponível, usando localStorage.', e); }
      this.usingIndexedDB = !!idb;
      for (const c of COLLECTIONS) await readCollection(c);
      if (channel) {
        channel.onmessage = async ev => {
          const n = ev.data && ev.data.name;
          const names = n === '*' ? COLLECTIONS : COLLECTIONS.filter(c => c === n);
          for (const c of names) { await readCollection(c); emit(c); }
        };
      }
      // Pede ao navegador para não apagar os dados quando faltar espaço
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }
    },

    collection(name){
      if (!COLLECTIONS.includes(name)) throw new Error('Coleção desconhecida: ' + name);
      return {
        onSnapshot(next){
          listeners[name].push(next);
          setTimeout(() => next(snapshot(name)), 0);
          return () => { listeners[name] = listeners[name].filter(f => f !== next); };
        },
        async add(data){
          const id = makeId();
          await commit(name, id, applyPatch({}, data));
          return { id };
        },
        doc(id){
          return {
            async update(patch){
              const old = cache[name].get(id);
              if (!old) throw { code: 'not-found', message: 'Registro não encontrado' };
              await commit(name, id, applyPatch(old, patch));
            },
            async set(data){ await commit(name, id, applyPatch({}, data)); },
            async delete(){ await commit(name, id, null); }
          };
        }
      };
    },

    async exportAll(){
      const out = {};
      COLLECTIONS.forEach(c => { out[c] = rows(c); });
      return out;
    },

    async replaceAll(data){
      for (const c of COLLECTIONS) {
        const list = (data[c] || []).filter(r => r && r.id);
        if (idb) await idbWrite(c, st => { st.clear(); list.forEach(r => st.put(Object.assign(cloneData(r), { id: String(r.id) }))); });
        cache[c] = toMap(list);
        if (!idb) lsSave(c);
        emit(c);
      }
      if (channel) channel.postMessage({ name: '*' });
    }
  };
}

/* ---------------------------------------------------------
   Modo nuvem: Firebase (Firestore + login por e-mail e senha)
   --------------------------------------------------------- */
async function createFirebaseDb(config){
  const V = '10.12.2';
  const base = 'https://www.gstatic.com/firebasejs/' + V + '/';
  const [fbApp, fbAuth, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js')
  ]);
  const app = fbApp.initializeApp(config);
  let fdb;
  try {
    // Guarda uma cópia no aparelho: o caixa continua funcionando se a internet cair
    fdb = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    fdb = fs.getFirestore(app);
  }
  const auth = fbAuth.getAuth(app);

  function convert(patch){
    const out = {};
    Object.keys(patch).forEach(k => {
      const v = patch[k];
      if (v instanceof Increment) out[k] = fs.increment(v.n);
      else if (v !== undefined) out[k] = v === null ? null : cloneData(v);
    });
    return out;
  }

  // Com internet, espera o servidor confirmar. Sem internet, segue em frente:
  // o Firebase guarda no aparelho e envia sozinho quando a conexão voltar.
  function settle(p){
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => { done = true; resolve(); }, 1500);
      p.then(
        v => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        err => {
          if (!done) { done = true; clearTimeout(t); reject(err); }
          else window.dispatchEvent(new CustomEvent('storage-error', { detail: err }));
        }
      );
    });
  }

  return {
    mode: 'firebase',
    increment: n => new Increment(n),

    collection(name){
      const col = fs.collection(fdb, name);
      return {
        onSnapshot(next, onError){
          return fs.onSnapshot(col, snap => next({
            docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() })),
            size: snap.size,
            empty: snap.empty
          }), onError);
        },
        async add(data){
          const ref = fs.doc(col);
          await settle(fs.setDoc(ref, convert(data)));
          return { id: ref.id };
        },
        doc(id){
          const ref = fs.doc(fdb, name, id);
          return {
            update: patch => settle(fs.updateDoc(ref, convert(patch))),
            set: data => settle(fs.setDoc(ref, convert(data))),
            delete: () => settle(fs.deleteDoc(ref))
          };
        }
      };
    },

    async exportAll(){
      const out = {};
      for (const c of COLLECTIONS) {
        const snap = await fs.getDocs(fs.collection(fdb, c));
        out[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      }
      return out;
    },

    async replaceAll(data){
      const ops = [];
      for (const c of COLLECTIONS) {
        const snap = await fs.getDocs(fs.collection(fdb, c));
        snap.docs.forEach(d => ops.push(b => b.delete(d.ref)));
        (data[c] || []).filter(r => r && r.id).forEach(r => {
          const d = cloneData(r);
          const id = String(d.id);
          delete d.id;
          ops.push(b => b.set(fs.doc(fdb, c, id), d));
        });
      }
      for (let i = 0; i < ops.length; i += 400) {
        const batch = fs.writeBatch(fdb);
        ops.slice(i, i + 400).forEach(op => op(batch));
        await batch.commit();
      }
    },

    auth: {
      onChange: cb => fbAuth.onAuthStateChanged(auth, cb),
      signIn: (email, senha) => fbAuth.signInWithEmailAndPassword(auth, email, senha),
      signOut: () => fbAuth.signOut(auth),
      user: () => auth.currentUser
    }
  };
}

/* ---------------------------------------------------------
   Modo Claude: banco do claude.ai (só na demonstração web)
   --------------------------------------------------------- */
async function createClaudeDb(){
  const handle = await window.claude.use('db');
  if (!handle) throw new Error('o banco do Claude não está disponível nesta visualização');
  const cache = {};
  COLLECTIONS.forEach(c => { cache[c] = new Map(); });

  // Esse banco não soma valores sozinho: a soma (ex.: estoque) é feita a partir
  // da cópia local mais recente, e cada documento recebe uma gravação por vez.
  function convert(name, id, patch){
    const cur = id ? (cache[name].get(id) || {}) : {};
    const out = {};
    Object.keys(patch).forEach(k => {
      const v = patch[k];
      if (v instanceof Increment) out[k] = Math.round(((Number(cur[k]) || 0) + v.n) * 100) / 100;
      else if (v !== undefined) out[k] = v === null ? null : cloneData(v);
    });
    return out;
  }
  const queues = {};
  function serial(key, fn){
    const next = (queues[key] || Promise.resolve()).catch(() => {}).then(fn);
    queues[key] = next;
    return next;
  }

  return {
    mode: 'claude',
    increment: n => new Increment(n),

    collection(name){
      const col = handle.collection(name);
      return {
        onSnapshot(next, onError){
          return col.onSnapshot(snap => {
            cache[name] = new Map(snap.docs.map(d => [d.id, d.data() || {}]));
            next({ docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() || {} })), size: snap.docs.length, empty: snap.docs.length === 0 });
          }, onError);
        },
        async add(data){
          const d = convert(name, null, data);
          const ref = await col.add(d);
          cache[name].set(ref.id, d);
          return { id: ref.id };
        },
        doc(id){
          const ref = col.doc(id);
          const key = name + '/' + id;
          return {
            update: patch => serial(key, async () => {
              const d = convert(name, id, patch);
              await ref.update(d);
              cache[name].set(id, Object.assign({}, cache[name].get(id) || {}, d));
            }),
            set: data => serial(key, async () => {
              const d = convert(name, null, data);
              await ref.set(d);
              cache[name].set(id, d);
            }),
            delete: () => serial(key, async () => {
              await ref.delete();
              cache[name].delete(id);
            })
          };
        }
      };
    },

    async exportAll(){
      const out = {};
      COLLECTIONS.forEach(c => { out[c] = [...cache[c].entries()].map(([id, d]) => Object.assign({ id }, cloneData(d))); });
      return out;
    },

    async replaceAll(data){
      for (const c of COLLECTIONS) {
        const col = handle.collection(c);
        const list = (data[c] || []).filter(r => r && r.id);
        const keep = new Set(list.map(r => String(r.id)));
        for (const id of [...cache[c].keys()]) {
          if (!keep.has(id)) { await col.doc(id).delete(); cache[c].delete(id); }
        }
        for (const r of list) {
          const d = cloneData(r);
          const id = String(d.id);
          delete d.id;
          await col.doc(id).set(d);
          cache[c].set(id, d);
        }
      }
    }
  };
}
