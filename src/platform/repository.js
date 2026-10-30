// Platform boundary: IndexedDB works in the browser preview and an Android WebView.
// Native filesystem bridges can replace this adapter without changing learning rules.
export function createRepository() {
  let opened;
  const open = () => opened ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('francais-ensemble-v1', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('state'); req.result.createObjectStore('audio'); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('无法打开本地存储 / Stockage local inaccessible.'));
  });
  async function read(store, key) { const db = await open(); return new Promise((resolve, reject) => { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }); }
  return {
    async load() { const primary = await read('state', 'primary'); if (!primary) return null; if (primary.schema === 1 && Array.isArray(primary.library) && primary.progress && primary.settings && primary.sessions) return primary; const backup = await read('state', 'backup'); if (backup?.schema === 1 && Array.isArray(backup.library)) return backup; throw new Error('学习记录异常，请先保留数据 / Données illisibles, conservez-les.'); },
    async save(state, assets = []) {
      const db = await open(); const copy = JSON.parse(JSON.stringify(state));
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['state', 'audio'], 'readwrite'), store = tx.objectStore('state');
        const q = store.get('primary'); q.onsuccess = () => { if (q.result) store.put(q.result, 'backup'); store.put(copy, 'primary'); };
        for (const asset of assets) tx.objectStore('audio').put(asset.bytes, asset.id);
        tx.oncomplete = resolve; tx.onerror = () => reject(new Error('保存失败，请检查存储空间 / Échec de sauvegarde, vérifiez l’espace libre.')); tx.onabort = () => reject(new Error('保存已中止 / Sauvegarde interrompue.'));
      });
    },
    audio: key => read('audio', key),
    async allAudio() { const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction('audio'), store = tx.objectStore('audio'), values = []; store.openCursor().onsuccess = e => { const cur = e.target.result; if (cur) { values.push({ id: cur.key, bytes: cur.value }); cur.continue(); } }; tx.oncomplete = () => resolve(values); tx.onerror = () => reject(tx.error); }); },
  };
}
