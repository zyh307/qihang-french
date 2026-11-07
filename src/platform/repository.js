// Platform boundary: IndexedDB works in the browser preview and an Android WebView.
// Native filesystem bridges can replace this adapter without changing learning rules.
import {openRecordDatabase,recordEpoch,idbDone,idbResult} from './browser-database.js';
export function createRepository() {
  let epoch;
  const open = openRecordDatabase;
  async function read(store, key) { const db = await open(); return new Promise((resolve, reject) => { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }); }
  return {
    async load() { const db=await open(),tx=db.transaction('state'),done=idbDone(tx),store=tx.objectStore('state');const [primary,backup,revision]=await Promise.all([idbResult(store.get('primary')),idbResult(store.get('backup')),idbResult(store.get('recordsEpoch'))]);await done;epoch=revision||0;if (!primary) return null; if (primary.schema === 1 && Array.isArray(primary.library) && primary.progress && primary.settings && primary.sessions) return primary;if (backup?.schema === 1 && Array.isArray(backup.library)) return backup; throw new Error('学习记录异常，请先保留数据 / Données illisibles, conservez-les.'); },
    async save(state, assets = [], {isolated=false} = {}) {
      // Callers pass an isolated plain snapshot; IndexedDB performs the structured clone.
      const db = await open();epoch??=await recordEpoch();const copy = isolated?state:JSON.parse(JSON.stringify(state));
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['state', 'audio'], 'readwrite'), store = tx.objectStore('state');
        let stale=false;const revision=store.get('recordsEpoch');revision.onsuccess=()=>{if((revision.result||0)!==epoch){stale=true;tx.abort();return;}const q = store.get('primary');q.onsuccess = () => { if (q.result) store.put(q.result, 'backup'); store.put(copy, 'primary'); };for (const asset of assets) tx.objectStore('audio').put(asset.bytes, asset.id);};
        tx.oncomplete = resolve; tx.onerror = () => reject(new Error('保存失败，请检查存储空间 / Échec de sauvegarde, vérifiez l’espace libre.')); tx.onabort = () => reject(new Error(stale?'记录已恢复，请重新打开此页面 / Rouvrez cette page.':'保存已中止 / Sauvegarde interrompue.'));
      });
    },
    async cacheAudio(asset){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(asset.bytes,asset.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});},
    audio: key => read('audio', key),
    async allAudio() { const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction('audio'), store = tx.objectStore('audio'), values = []; store.openCursor().onsuccess = e => { const cur = e.target.result; if (cur) { values.push({ id: cur.key, bytes: cur.value }); cur.continue(); } }; tx.oncomplete = () => resolve(values); tx.onerror = () => reject(tx.error); }); },
  };
}
