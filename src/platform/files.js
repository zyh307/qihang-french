import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { unpack, validateLesson } from '../domain/importer.js';
import { migrateSessions, packageKey, sessionKey, reviewPackage, MIXED_REVIEW_KEY,MIXED_ERRORS_KEY,MIXED_FAVORITES_KEY } from '../domain/learning.js';
import {nativeExport} from './native.js';
import {wordAudioEntries} from '../domain/word-display.js';
export function chooseFile(accept,multiple=false) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.multiple=multiple; input.style.display = 'none'; document.body.appendChild(input);
    const done = file => { input.remove(); resolve(file); }; input.onchange = () => done(multiple?Array.from(input.files||[]):input.files?.[0]||null); input.oncancel = () => done(multiple?[]:null); input.click();
  });
}
export async function download(name, bytes, mime = 'application/octet-stream') {
  const native=nativeExport(name,bytes,mime);if(native)return await native;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime })), link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportBackup(data, repository) {
  const files = { 'snapshot.json': strToU8(JSON.stringify(data)) };
  for (const audio of await repository.allAudio()) files[`audio/${audio.id}.bin`] = audio.bytes;
  return zipSync(files, { level: 3 });
}
export async function readBackup(file) {
  const files = unpack(new Uint8Array(await file.arrayBuffer()));
  if (!files['snapshot.json']) throw new Error('不是学习备份文件 / Ce fichier n’est pas une sauvegarde.');
  const data = JSON.parse(strFromU8(files['snapshot.json']));
  if(data.settings?.sounds!==undefined&&typeof data.settings.sounds!=='boolean')throw new Error('声音设置无效 / Sons invalides.');
  if(data.settings?.articleMode&&!['choice','typed'].includes(data.settings.articleMode))throw new Error('冠词设置无效 / Mode des articles invalide.');
  if(data.settings?.reviewMode&&!['both','spelling'].includes(data.settings.reviewMode))throw new Error('复习设置无效 / Mode de révision invalide.');
  if(data.settings?.wordMotion&&!['slide','page','none'].includes(data.settings.wordMotion))throw new Error('动效设置无效 / Animation invalide.');
  if(data.settings?.notifications!==undefined&&typeof data.settings.notifications!=='boolean')throw new Error('通知设置无效 / Réglage de notification invalide.');
  for(const name of ['shuffleLearning','errorAutoRemove'])if(data.settings?.[name]!==undefined&&typeof data.settings[name]!=='boolean')throw new Error('学习设置无效 / Réglage invalide.');
  if(data.settings?.reminderTime!==undefined&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.settings.reminderTime))throw new Error('提醒时间无效 / Heure de rappel invalide.');
  if(data.reservedWordIds!==undefined&&(!Array.isArray(data.reservedWordIds)||!data.reservedWordIds.every(id=>typeof id==='string'&&/^w\d{6}$/.test(id))))throw new Error('词条编号记录无效 / Registre des identifiants invalide.');
  if(data.reminders&&(['snoozedUntil','lastSentAt'].some(k=>data.reminders[k]!==undefined&&(!Number.isFinite(data.reminders[k])||data.reminders[k]<0))||['lastSentDate','dismissedDate','lastPopupDate'].some(k=>data.reminders[k]!==undefined&&(typeof data.reminders[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.reminders[k])))))throw new Error('提醒时间无效 / Heure de rappel invalide.');
  if(data.lessonCompletions&&(typeof data.lessonCompletions!=='object'||Object.values(data.lessonCompletions).some(v=>typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))))throw new Error('课次完成日期无效 / Date de leçon invalide.');
  if (data.schema !== 1 || !Array.isArray(data.library) || !data.progress || !data.sessions || !data.activity || !data.errors || !data.favorites || !data.recentOptions || ![3, 5, 7].includes(data.settings?.groupSize) || !Number.isInteger(data.settings.dailyGoal) || data.settings.dailyGoal < 1 || data.settings.dailyGoal > 100 || typeof data.settings.fuzzy !== 'boolean') throw new Error('备份内容不完整 / Sauvegarde incomplète.');
  if(data.errorHistory!==undefined&&(!data.errorHistory||typeof data.errorHistory!=='object'||Array.isArray(data.errorHistory)||Object.values(data.errorHistory).some(h=>!h||['count','reviewCount','cycleReviews'].some(key=>!Number.isInteger(h[key])||h[key]<0)||['lastReviewDate','lastErrorDate'].some(key=>h[key]!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(h[key])))))throw new Error('错题历史无效 / Historique d’erreurs invalide.');
  if(data.reminders?.badges&&Object.values(data.reminders.badges).some(b=>!b||typeof b.pending!=='boolean'||!Array.isArray(b.acknowledged)||!b.acknowledged.every(id=>typeof id==='string')||(b.ackDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(b.ackDate))))throw new Error('提醒记录无效 / Rappels invalides.');
  for(const field of ['lastPopupDates','lastSentDates'])if(data.reminders?.[field]&&Object.values(data.reminders[field]).some(value=>typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)))throw new Error('提醒日期无效 / Date de rappel invalide.');
  migrateSessions(data);
  const assets = [], seen = new Set();
  for (const p of [...data.library,reviewPackage(data)]) {
    if(!p.reviewPool)validateLesson(p);
    for(const [key,s]of Object.entries(data.sessions).filter(([,s])=>s.lessonKey===packageKey(p))) {
      const base=packageKey(p),prefix=base+':'+s.mode+':',ids=key.startsWith(prefix)?key.slice(prefix.length):null;
      if(p.reviewPool&&!((key===MIXED_REVIEW_KEY&&s.mode==='review')||(key===MIXED_ERRORS_KEY&&s.mode==='errors')||(key===MIXED_FAVORITES_KEY&&s.mode==='favorites')))throw new Error('复习进度无效 / Révision invalide.');
      const scoped=['direct','errors'].includes(s.mode)&&ids&&(ids==='all'||ids.split(',').every(id=>p.words.some(w=>w.id===id)));
      if(!['learn','review','direct','errors','favorites'].includes(s.mode)||(key!==sessionKey(p,s.mode)&&!scoped))throw new Error('练习分类与课次不一致 / Session incompatible avec cette leçon.');
      if(s.mistakeWordIds!==undefined&&(!Array.isArray(s.mistakeWordIds)||!s.mistakeWordIds.every(id=>typeof id==='string')))throw new Error('错题轮次记录无效 / Erreurs de série invalides.');
      if(s.removeErrors!==undefined&&typeof s.removeErrors!=='boolean')throw new Error('错题设置无效 / Erreurs invalides.');
      if (!['judge', 'practice', 'done'].includes(s.phase) || !Array.isArray(s.jobs) || !Array.isArray(s.pending) || !Array.isArray(s.group)) throw new Error('练习进度损坏 / Session invalide.');
      for (const id of [...s.pending, ...s.group, ...s.jobs.map(j => j.wordId)]) if (!p.words.some(w => w.id === id)) throw new Error('备份练习与词库不一致 / Session incompatible.');
      for(const field of ['doneWords','newKnownWordIds','acquiredWordIds'])if(s[field]!==undefined&&(!Array.isArray(s[field])||s[field].some(id=>!p.words.some(w=>w.id===id))))throw new Error('练习词条记录无效 / Mots de session invalides.');
      for (const j of s.jobs) if (!p.words.find(w => w.id === j.wordId)?.forms.some(f => f.id === j.formId) || !Array.isArray(j.sequence) || !j.sequence.every(k => ['recognize', 'choose', 'spell'].includes(k)) || !Number.isInteger(j.stage) || j.stage < 0 || j.stage >= j.sequence.length) throw new Error('练习队列损坏 / File d’exercices invalide.');
    }
    for (const w of p.words) for (const f of wordAudioEntries(w)) if (f.audioKey && !seen.has(f.audioKey)) {
      if (!/^[a-f0-9]{64}$/.test(f.audioKey) || !files[`audio/${f.audioKey}.bin`]) throw new Error('备份缺少录音 / Audio manquant dans la sauvegarde.');
      const bytes = files[`audio/${f.audioKey}.bin`];
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== f.audioKey) throw new Error('录音校验失败 / Vérification audio échouée.');
      seen.add(hash); assets.push({ id: hash, bytes });
    }
  }
  if(Object.entries(data.sessions).some(([key,s])=>!data.library.some(p=>packageKey(p)===s.lessonKey)&&!(s.lessonKey==='review:all'&&((key===MIXED_REVIEW_KEY&&s.mode==='review')||(key===MIXED_ERRORS_KEY&&s.mode==='errors')||(key===MIXED_FAVORITES_KEY&&s.mode==='favorites')))))throw new Error('备份练习所属课次不存在 / Leçon de session introuvable.');
  if(Object.entries(data.activeSessions).some(([lesson,key])=>data.sessions[key]?.lessonKey!==lesson))throw new Error('备份续练入口无效 / Reprise de session invalide.');
  return { data, assets };
}
let currentAudio, currentUrl, audioSerial=0;
export function stopAudio() { audioSerial++; if (currentAudio) { currentAudio.pause(); currentAudio.removeAttribute('src'); currentAudio = null; } if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; } }
export async function playAudio(form, repository, ended) {
  stopAudio();
  const token=audioSerial;
  if (!form.audioKey) throw new Error('尚未提供录音 / Audio non disponible.');
  const bytes = await repository.audio(form.audioKey); if(token!==audioSerial)return; if (!bytes) throw new Error('录音文件缺失 / Fichier audio manquant.');
  currentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })); currentAudio = new Audio(currentUrl);
  currentAudio.onended = () => { stopAudio(); ended?.(); }; currentAudio.onerror = () => { stopAudio(); ended?.(); };
  await currentAudio.play();
}
