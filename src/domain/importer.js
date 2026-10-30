import { unzipSync, zipSync } from 'fflate';
import { packageKey } from './learning.js';
import { spellingParts, splitNounArticle, wordAudioEntries } from './word-display.js';
import {correctMasterRow,vocabularyCorrections} from './vocabulary-corrections.js';
export const SIMPLE_HEADERS = ['法语单词','词性','中文释义','法语例句','例句翻译','书本出处'];
export const NUMBERED_HEADERS = ['音频编号',...SIMPLE_HEADERS];
export const MASTER_HEADERS = ['课次','序号','法语','音标','词性','中文','例句','音频','真人音频','状态'];
const isNumberedTable=rows=>NUMBERED_HEADERS.every((h,i)=>rows[0]?.[i]===h);
export function normalizeAudioNumber(value) {
  const raw=String(value??'').trim();
  if(!/^\d{1,6}$/.test(raw)||Number(raw)<1)fail('音频编号填写 001–999999 的数字 / Numéro audio : 001 à 999999.');
  return String(Number(raw)).padStart(3,'0');
}
export function numberedAudioName(word,form) {
  if(!word.audioNumber)return null;
  return `${word.audioNumber}.mp3`;
}
export function numberedAudioCandidates(word,form,lessonId) {
  const shared=numberedAudioName(word,form);
  if(!shared)return [];
  const names=[];
  // Previously distributed packages can still provide separate m/f recordings.
  if(word.forms.length>1&&form.gender){
    const separate=`${word.audioNumber}-${audioSuffix(word,form)}.mp3`;
    names.push(separate,...(lessonId?[`${lessonId}_${separate}`]:[]));
  }
  names.push(shared,...(lessonId?[`${lessonId}_${shared}`]:[]));
  return names;
}
const audioSuffix=(word,form)=>word.forms.filter(f=>f.gender===form.gender)[0]===form?form.gender:'base';
export const HEADERS = ['主词条ID', '形式ID', '法语形式', '词性', '性别', '中文释义', '是否考试', '音频文件', '音标', '法语例句', '例句翻译', '书本出处', '变化说明', '题目限定', '课内顺序'];
export const POS = ['n.', 'adj.', 'v.', 'adv.', 'prép.', 'pron.', 'art.', 'conj.', 'interj.', 'loc.', 'num.'];
const fail = s => { throw new Error(s); };
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const positive = v => Number.isInteger(v) && v > 0;
export function validateLesson(p) {
  if (!p || p.schemaVersion !== 1) fail('格式版本必须为 1 / Version de format : 1.');
  if (p.book?.id !== 'inspire1' || !nonempty(p.book?.title)) fail('首版只开放 Inspire 1 / Seul Inspire 1 est disponible.');
  if (p.book.level !== undefined) fail('请移除旧等级字段 book.level / Retirez le champ book.level.');
  if (!/^L(0[1-9]|[1-9]\d)$/.test(p.lesson?.id) || !nonempty(p.lesson.title) || !positive(p.lesson.order) || !positive(p.lesson.version)) fail('课次编号、名称、排序或版本错误 / Informations de leçon invalides.');
  if (!Array.isArray(p.words) || !p.words.length || p.words.length > 5000) fail('词库需要 1–5000 个词条 / Entre 1 et 5 000 entrées.');
  const ids = new Set(), forms = new Set(), orders = new Set(), audioNumbers=new Set();
  for (const [i, w] of p.words.entries()) {
    const at = `words[${i}]`;
    if (!/^w\d{6}$/.test(w.id) || ids.has(w.id)) fail(`${at}.id：词条编号无效或重复 / ID invalide ou dupliqué.`);
    ids.add(w.id);
    if (!positive(w.order) || orders.has(w.order)) fail(`${at}.order：课内顺序需唯一正整数 / Ordre positif et unique.`); orders.add(w.order);
    if (!POS.includes(w.pos) || !Array.isArray(w.meanings) || !w.meanings.length || !w.meanings.every(nonempty)) fail(`${at}：请检查词性和中文释义 / Vérifiez la catégorie et le sens.`);
    if (!Array.isArray(w.forms) || !w.forms.length || !w.forms.some(f => f.tested === true)) fail(`${at}：每词至少一个待考形式 / Au moins une forme à pratiquer.`);
    if(w.audioNumber!==undefined){
      if(typeof w.audioNumber!=='string'||normalizeAudioNumber(w.audioNumber)!==w.audioNumber||audioNumbers.has(w.audioNumber))fail(`${at}：音频编号无效或重复 / Numéro audio invalide ou dupliqué.`);
      audioNumbers.add(w.audioNumber);
    }
    for (const [j, f] of w.forms.entries()) {
      const where = `${at}.forms[${j}]`;
      if (!new RegExp(`^${w.id}-(m|f|base)$`).test(f.id) || forms.has(f.id)) fail(`${where}.id：形式编号无效或重复 / ID de forme invalide.`); forms.add(f.id);
      if (!nonempty(f.text) || typeof f.tested !== 'boolean' || !['m', 'f', null].includes(f.gender)) fail(`${where}：形式、性别或考试标记错误 / Forme, genre ou indicateur invalide.`);
      const article=w.pos==='n.'?splitNounArticle(f.text):null;
      if(article?.prefix&&!article.answer)fail(`${where}.text：冠词后需填写名词 / Ajoutez le nom après l’article.`);
      if ((w.pos === 'n.' && !f.gender && !article.prefix) || (f.id.endsWith('-m') && f.gender !== 'm') || (f.id.endsWith('-f') && f.gender !== 'f') || (article?.gender&&f.gender&&article.gender!==f.gender)) fail(`${where}.gender：请检查冠词、性别与编号 / Vérifiez l’article, le genre et l’identifiant.`);
      if (f.audio !== null && (typeof f.audio !== 'string' || !/^audio\/[A-Za-z0-9_-]+\.mp3$/.test(f.audio))) fail(`${where}.audio：音频路径错误 / Chemin audio invalide.`);
      if (f.example !== undefined && (!nonempty(f.example?.fr) || (f.example.zh!==undefined&&typeof f.example.zh!=='string'))) fail(`${where}.example：例句或翻译格式错误 / Phrase ou traduction invalide.`);
      if(f.example?.audio!==undefined&&f.example.audio!==null&&!/^audio\/[A-Za-z0-9_-]+\.mp3$/.test(f.example.audio))fail(`${where}.example.audio：例句录音路径错误 / Audio de phrase invalide.`);
      if (f.source !== undefined && typeof f.source !== 'string') fail(`${where}.source：出处须为文字 / La source doit être du texte.`);
    }
  }
  return p;
}
export function rowsToLesson(rows, meta, files = {}, library = []) {
  if(rows.length&&MASTER_HEADERS.every((h,i)=>rows[0][i]===h))return masterRowsToLesson(rows,meta,files,library);
  if(rows.length&&(isNumberedTable(rows)||SIMPLE_HEADERS.every((h,i)=>rows[0][i]===h)))return simpleRowsToLesson(rows,meta,files,library);
  if (!rows.length || HEADERS.some((h, i) => rows[0][i] !== h)) fail('无法识别表头，请使用词库总表 / En-têtes du tableau non reconnus.');
  const groups = new Map();
  rows.slice(1).forEach((row, i) => {
    if (!row.some(v => v !== null && v !== undefined && v !== '')) return;
    const at = `单词表第 ${i + 2} 行 / Ligne ${i + 2}`;
    if (row.some(v => typeof v === 'object' && v !== null)) fail(`${at}：不支持公式或复杂单元格 / Formules non prises en charge.`);
    const value = n => String(row[n] ?? '').trim();
    const id = value(0), formId = value(1), pos = value(3), meanings = value(5).split(/[;；]/).map(x => x.trim()).filter(Boolean), order = Number(value(14));
    if (!['是', '否'].includes(value(6))) fail(`${at}：是否考试填写“是”或“否” / Indiquez 是 ou 否.`);
    const common = { pos, meanings, patternNote: value(12), questionHint: value(13), order };
    const existing = groups.get(id);
    if (existing && JSON.stringify(existing.common) !== JSON.stringify(common)) fail(`${at}：同词的公共字段不一致 / Champs communs incohérents.`);
    const entry = existing || { common, forms: [] }; groups.set(id, entry);
    let audio = value(7) ? `audio/${value(7)}` : (files[`audio/${formId}.mp3`] ? `audio/${formId}.mp3` : null);
    const fr = value(9), zh = value(10);
    if (Boolean(fr) !== Boolean(zh)) fail(`${at}：例句和翻译须成对填写 / Phrase et traduction requises.`);
    entry.forms.push({ id: formId, text: value(2), gender: value(4) || null, tested: value(6) === '是', audio, ...(value(8) ? { ipa: value(8) } : {}), ...(fr ? { example: { fr, zh } } : {}), ...(value(11) ? { source: value(11) } : {}) });
  });
  return validateLesson({ schemaVersion: 1, book: { id: 'inspire1', title: 'Inspire 1' }, lesson: { id: meta.id, title: meta.title, order: Number(meta.order), version: Number(meta.version) }, words: [...groups].map(([id, e]) => ({ id, ...e.common, forms: e.forms })).sort((a, b) => a.order - b.order) });
}
const literal=s=>String(s||'').normalize('NFC').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
const compatibleGender=(pos,a,b)=>a===b||(pos==='n.'&&(!a||!b));
const identity=w=>JSON.stringify([w.pos,[...w.meanings].sort(),w.forms.map(f=>[f.gender,literal(spellingParts(w,f).answer)]).sort()]);
const audioStem=(word,form)=>spellingParts(word,form).answer.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function simpleAudioName(word,form){
  const stem=audioStem(word,form),shared=word.forms.some(f=>f!==form&&audioStem(word,f)===stem);
  return `${stem}${shared&&form.gender?'-'+form.gender:''}.mp3`;
}
export function simpleRowsToLesson(rows,meta,files={},library=[]){
  const numbered=isNumberedTable(rows),offset=numbered?1:0,seenAudioNumbers=new Set();
  const existingWords=library.filter(p=>p.book.id==='inspire1').flatMap(p=>p.words),registry=new Map(existingWords.map(w=>[identity(w),w]));
  const used=new Set([...existingWords.map(w=>w.id),...(meta.reservedIds||[])]),words=[],seen=new Set();let serial=1;
  const nextId=()=>{while(used.has(`w${String(serial).padStart(6,'0')}`))serial++;if(serial>999999)fail('可用编号不足 / Plus aucun identifiant disponible.');const id=`w${String(serial++).padStart(6,'0')}`;used.add(id);return id;};
  rows.slice(1).forEach((row,index)=>{
    if(!row.some(v=>v!==null&&v!==undefined&&v!==''))return;
    const at=`单词表第 ${index+2} 行 / Ligne ${index+2}`;
    if(row.some(v=>typeof v==='object'&&v!==null)||row.slice(6+offset).some(v=>v!==null&&v!==undefined&&v!==''))fail(`${at}：请勿增加模板外的列 / Respectez les colonnes du modèle.`);
    const cell=n=>String(row[n+offset]??'').trim(),rawPos=cell(1).toLowerCase().replace(/\s+/g,'');
    const audioNumber=numbered?normalizeAudioNumber(row[0]):null;
    if(audioNumber&&seenAudioNumbers.has(audioNumber))fail(`${at}：音频编号 ${audioNumber} 重复 / Numéro audio dupliqué.`);
    if(audioNumber)seenAudioNumbers.add(audioNumber);
    const aliases={'名词':'n.','动词':'v.','形容词':'adj.','副词':'adv.','介词':'prép.','代词':'pron.','冠词':'art.','连词':'conj.','感叹词':'interj.','短语':'loc.','n.m.':'n.','n.f.':'n.'};
    const pos=aliases[rawPos]||rawPos,meanings=cell(2).split(/[;；]/).map(s=>s.trim()).filter(Boolean),texts=cell(0).split(/\s*[/／|｜]\s*/u);
    if(!cell(0)||!POS.includes(pos)||!meanings.length||texts.some(t=>!t)||texts.length>2||(texts.length===2&&!['n.','adj.','num.'].includes(pos)))fail(`${at}：请填写单词、词性、释义；阴阳性用 / 分隔 / Vérifiez le mot, la catégorie et le sens.`);
    const w={pos,meanings,order:words.length+1,...(audioNumber?{audioNumber}:{}),forms:texts.map((text,i)=>{
      const article=pos==='n.'?splitNounArticle(text):null;
      let gender=article?.gender||null;
      if(pos==='n.')gender||=rawPos==='n.m.'?'m':rawPos==='n.f.'?'f':null;
      if(pos==='n.'&&texts.length===2)gender||=i===0?'m':'f';
      if(['adj.','num.'].includes(pos)&&texts.length===2)gender=i===0?'m':'f';
      if(pos==='n.'&&!gender&&!article.prefix)fail(`${at}：名词请连冠词填写，或用 n.m./n.f. 标明性别 / Ajoutez l’article ou indiquez n.m./n.f.`);
      const form={text,gender,tested:true,audio:null};form.text=spellingParts({pos},form).text;return form;
    })};
    if(w.forms.length===2){
      if(w.forms[0].gender!=='m'||w.forms[1].gender!=='f')fail(`${at}：阳性写前，阴性写后 / Masculin, puis féminin.`);
      const regular=literal(spellingParts(w,w.forms[1]).answer)===literal(spellingParts(w,w.forms[0]).answer)+'e';
      w.forms[1].tested=!regular;w.patternNote=regular?'阴性加 e，只考阳性 / Féminin en -e, masculin évalué':'两种形式分别考 / Deux formes à pratiquer';
    }
    const signature=identity(w);if(seen.has(signature))fail(`${at}：本课词条重复 / Mot en double dans cette leçon.`);seen.add(signature);
    const old=registry.get(signature)||existingWords.find(candidate=>candidate.pos===w.pos&&JSON.stringify([...candidate.meanings].sort())===JSON.stringify([...w.meanings].sort())&&candidate.forms.some(a=>w.forms.some(b=>compatibleGender(w.pos,a.gender,b.gender)&&literal(spellingParts(candidate,a).answer)===literal(spellingParts(w,b).answer))));
    w.id=old?.id||nextId();if(old)w.meanings=[...old.meanings];
    const matchedOldForms=new Set();
    w.forms.forEach(f=>{
      const candidates=(old?.forms||[]).filter(o=>!matchedOldForms.has(o.id)&&compatibleGender(w.pos,o.gender,f.gender)&&literal(spellingParts(old,o).answer)===literal(spellingParts(w,f).answer));
      const exactGender=candidates.filter(o=>o.gender===f.gender);
      const previous=exactGender.length===1?exactGender[0]:candidates.length===1?candidates[0]:null;
      if(previous){matchedOldForms.add(previous.id);if(!f.gender&&previous.gender)f.gender=previous.gender;}
      f.id=previous?.id||`${w.id}-${w.forms.length===2?f.gender:'base'}`;
      const audioNames=w.audioNumber?numberedAudioCandidates(w,f,meta.id).map(name=>'audio/'+name):[`audio/${simpleAudioName(w,f)}`,`audio/${f.id}.mp3`];
      f.audio=audioNames.find(name=>files[name])||null;
    });
    const fr=cell(3),zh=cell(4);if(Boolean(fr)!==Boolean(zh))fail(`${at}：例句和翻译须同时填写 / Phrase et traduction requises.`);
    if(fr)w.forms[0].example={fr,zh};if(cell(5))w.forms[0].source=cell(5);words.push(w);
  });
  return validateLesson({schemaVersion:1,book:{id:'inspire1',title:'Inspire 1'},lesson:{id:meta.id,title:meta.title,order:Number(meta.order),version:Number(meta.version)},words});
}
function resolveAudioFile(files,name){
  const canonical='audio/'+name;if(files[canonical])return canonical;
  const matches=Object.keys(files).filter(key=>key.split('/').at(-1)===name);
  if(matches.length>1)fail(`录音文件重名 / Plusieurs fichiers : ${name}`);
  if(matches.length){files[canonical]=files[matches[0]];return canonical;}
  return null;
}
export function attachExampleResources(pkg,files){
  const metadata=Object.keys(files).filter(name=>name.split('/').at(-1)==='examples.json');
  if(metadata.length>1)fail('例句资料文件重复 / Plusieurs fichiers de phrases.');
  let entries=[];
  if(metadata.length){
    let content;try{content=JSON.parse(new TextDecoder().decode(files[metadata[0]]));}catch{fail('例句资料无法读取 / Phrases illisibles.');}
    if(content?.schema!==1||!Array.isArray(content.entries))fail('例句资料格式错误 / Format des phrases invalide.');
    entries=content.entries;
  }
  for(const word of pkg.words){
    const main=word.forms.find(f=>f.example?.fr);
    for(const form of word.forms){
      const example=form.example;if(!example?.fr)continue;
      const row=entries.find(e=>e.lesson===pkg.lesson.id&&String(e.number)===word.audioNumber&&e.fr===example.fr);
      if(!example.zh&&typeof row?.zh==='string')example.zh=row.zh;
      if(!example.audio){
        const candidates=[`${form.id}-example.mp3`];
        if(form===main){
          if(typeof row?.audio==='string')candidates.unshift(row.audio);
          if(word.sourceAudio)candidates.push(word.sourceAudio.slice(0,-4)+'-example.mp3');
          if(word.audioNumber)candidates.push(`${pkg.lesson.id}_${word.audioNumber}-example.mp3`,`${word.audioNumber}-example.mp3`);
        }
        for(const name of candidates){
          if(!/^[A-Za-z0-9_-]+\.mp3$/.test(name))fail('例句录音文件名无效 / Nom de fichier de phrase invalide.');
          const found=resolveAudioFile(files,name);if(found){example.audio=found;break;}
        }
      }
    }
  }
  return pkg;
}
export function masterRowsToLesson(rows,meta,files={},library=[]){
  const selected=rows.slice(1).filter(row=>String(row[0]??'').trim()===meta.id);
  if(!selected.length){const available=[...new Set(rows.slice(1).map(row=>String(row[0]??'').trim()).filter(Boolean))];fail(`总表中没有 ${meta.id}；已有课次：${available.join('、')} / Leçon absente.`);}
  const prepared=selected.map((row,index)=>{
    row=correctMasterRow(row,meta.id);
    if(row.some(value=>value!==null&&typeof value==='object'))fail(`总表第 ${index+2} 行不能使用公式 / Formules non prises en charge.`);
    const text=String(row[2]??'').trim(),sourcePos=String(row[4]??'').trim();
    const aliases={'n.m.pl.':'n.m.','n.f.pl.':'n.f.','v.i.':'v.','v.t.':'v.','v.pr.':'v.'};
    const pos=aliases[sourcePos]||sourcePos;
    const forms=text.split(/\s*[/／]\s*/);
    const third=forms.length===3&&forms[0]==='beau'&&forms[1]==='belle'&&forms[2]==='bel';
    if(forms.length>2&&!third)fail(`请单独核对多形式词条：${text} / Formes à vérifier.`);
    const optionalE=/\(e\)/i.test(text);
    let baseText=third?forms.slice(0,2).join(' / '):optionalE?text.replace(/\(e\)/i,''):text;
    if(forms.length===2&&pos==='n.'){
      const parts=forms.map(splitNounArticle),noun=parts.find(part=>part.answer)?.answer;
      if(noun&&parts.some(part=>part.prefix&&!part.answer))baseText=parts.map(part=>part.answer?`${part.prefix}${part.prefix&&!/['’]$/.test(part.prefix)?' ':''}${part.answer}`:`${part.prefix}${/['’]$/.test(part.prefix)?'':' '}${noun}`).join(' / ');
    }
    return {row,text,sourcePos,pos,third,optionalE,baseText};
  });
  const p=simpleRowsToLesson([NUMBERED_HEADERS,...prepared.map(x=>[x.row[1],x.baseText,x.pos,x.row[5],'','',''])],meta,{},library);
  p.sourceFormat='master-table';
  p.words.forEach((w,index)=>{
    const item=prepared[index],row=item.row;w.sourcePos=item.sourcePos;w.sourceText=item.text;w.sourceStatus=String(row[9]??'').trim();
    const correction=vocabularyCorrections.find(c=>c.lesson===meta.id&&c.number===w.audioNumber&&c.text===item.text);if(correction){w.contentRevision=correction.revision;w.previousSourceText=correction.from;}
    if(item.optionalE){
      const previous=library.find(pkg=>packageKey(pkg)===packageKey(p))?.words.find(word=>word.audioNumber===w.audioNumber&&word.sourceText===item.text);
      if(previous){w.id=previous.id;w.forms[0].id=previous.forms.find(f=>f.gender==='m')?.id||`${w.id}-base`;}
      w.forms[0].gender='m';
      const old=library.flatMap(pkg=>pkg.words).find(word=>word.id===w.id);
      const feminine=old?.forms.find(f=>f.gender==='f');
      w.forms.push({id:feminine?.id||`${w.id}-f`,text:item.text.replace(/\(e\)/i,'e'),gender:'f',tested:false,audio:null});
      w.patternNote='阴性加 e，只考阳性 / Féminin en -e, masculin évalué';
    }
    if(item.third){
      w.forms[0].questionHint='辅音前 / Devant une consonne';
      const used=new Set(w.forms.map(f=>f.id)),id=[`${w.id}-base`,`${w.id}-m`].find(id=>!used.has(id));
      w.forms.push({id,text:'bel',gender:'m',tested:true,audio:null,questionHint:'元音或哑音 h 前 / Devant une voyelle ou un h muet'});
      w.patternNote='bel 用于元音或哑音 h 开头的阳性单数名词前 / Devant une voyelle ou un h muet';
    }
    const fr=String(row[6]??'').trim();if(fr){
      const zhIndex=rows[0].indexOf('例句翻译'),audioIndex=rows[0].indexOf('例句音频');
      const zh=zhIndex>=0?String(row[zhIndex]??'').trim():'';
      const exampleAudio=audioIndex>=0?String(row[audioIndex]??'').trim():'';
      w.forms[0].example={fr,zh,...(exampleAudio?{audio:'audio/'+exampleAudio}:{})};
    }
    const ipa=String(row[3]??'').trim();if(ipa)for(const f of w.forms)f.ipa=ipa;
    const filename=String(row[8]||row[7]||`${meta.id}_${w.audioNumber}.mp3`).trim();
    if(!/^[A-Za-z0-9_-]+\.mp3$/.test(filename))fail(`录音文件名无效 / Nom audio invalide : ${filename}`);
    w.sourceAudio=filename;
    const audio=resolveAudioFile(files,filename);
    for(const f of w.forms){
      const separate=f.gender?resolveAudioFile(files,filename.slice(0,-4)+'-'+audioSuffix(w,f)+'.mp3'):null;
      f.audio=separate||audio;
    }
  });
  return validateLesson(attachExampleResources(p,files));
}
export function unpack(bytes) {
  if (bytes.length > 200 * 1024 * 1024) fail('压缩包不能超过 200 MB / Archive limitée à 200 Mo.');
  let total = 0; const seen = new Set();
  return unzipSync(bytes, { filter: e => {
    if (seen.has(e.name) || e.name.startsWith('/') || /^[A-Za-z]:/.test(e.name) || e.name.includes('\\') || e.name.split('/').includes('..')) fail('压缩包路径无效或重复 / Chemin invalide dans le ZIP.');
    seen.add(e.name); total += e.originalSize;
    if (total > 500 * 1024 * 1024 || e.originalSize > 20 * 1024 * 1024 || seen.size > 10000) fail('解压内容过大 / Contenu décompressé trop volumineux.');
    return true;
  } });
}
export async function parseImport(file, meta, library = []) {
  let audioFile;
  if(Array.isArray(file)){
    if(file.length===1)file=file[0];
    else if(file.length===2){const sheet=file.find(f=>f.name.toLowerCase().endsWith('.xlsx')),audio=file.find(f=>f.name.toLowerCase().endsWith('.zip'));if(!sheet||!audio)fail('请选择一份 Excel 和一个录音 ZIP / Un Excel et un ZIP audio.');file=sheet;audioFile=audio;}
    else fail('请选择一份 Excel，可同时选择一个录音 ZIP / Un Excel avec un ZIP audio facultatif.');
  }
  if (file.size > 200 * 1024 * 1024) fail('文件超过 200 MB / Fichier trop volumineux.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.toLowerCase().split('.').pop();
  let pkg, files = {};
  if(audioFile){if(file.size+audioFile.size>200*1024*1024)fail('资料总大小超过 200 MB / Fichiers trop volumineux.');files=unpack(new Uint8Array(await audioFile.arrayBuffer()));}
  if (ext === 'json') pkg = JSON.parse(new TextDecoder().decode(bytes));
  else if (ext === 'xlsx') pkg = await parseExcel(bytes, meta, files, library);
  else if (ext === 'zip') {
    files = unpack(bytes);
    const workbooks=Object.keys(files).filter(name=>/\.xlsx$/i.test(name)&&!name.split('/').at(-1).startsWith('~$'));
    const json = files['lesson.json'], xlsx = workbooks.length===1?files[workbooks[0]]:null;
    if (Boolean(json) === Boolean(xlsx)||workbooks.length>1) fail('ZIP 中需有一份词表 Excel 或 lesson.json / Un seul fichier de contenu.');
    pkg = json ? JSON.parse(new TextDecoder().decode(json)) : await parseExcel(xlsx, meta, files, library);
  } else fail('请选择 ZIP、XLSX 或 JSON / Choisissez ZIP, XLSX ou JSON.');
  attachExampleResources(pkg,files);validateLesson(pkg);
  delete pkg.demo;
  const assets = [], warnings = [], cached = new Map();
  for (const w of pkg.words) {
    if (!w.forms.some(f=>f.example)) warnings.push(`${w.forms[0].text}：暂无句子 / Phrase absente`);
    if (pkg.sourceFormat!=='master-table'&&!w.forms.some(f=>f.source)) warnings.push(`${w.forms[0].text}：暂无出处 / Source absente`);
    for (const f of wordAudioEntries(w)) {
    delete f.audioKey;
    if (!f.audio) { warnings.push(f.fr?`${w.forms[0].text}：暂无例句录音 / Phrase sans audio`:w.audioNumber?`${f.text}：缺少 ${w.sourceAudio||numberedAudioName(w,f)} / Audio absent`:`${f.text}：暂无录音 / Audio absent`); continue; }
    const audio = files[f.audio];
    if (!audio) fail(`找不到音频 / Audio introuvable : ${f.audio}`);
    if (!audio.length || audio.length > 10 * 1024 * 1024) fail(`音频大小错误 / Taille audio invalide : ${f.audio}`);
    if (!cached.has(f.audio)) {
      const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', audio))].map(n => n.toString(16).padStart(2, '0')).join('');
      await verifyAudio(audio, f.audio);
      cached.set(f.audio, id); assets.push({ id, bytes: audio });
    }
    f.audioKey = cached.get(f.audio);
    }
  }
  const matchedNames=new Set([...cached.keys()].map(name=>name.split('/').at(-1)));
  const extra = Object.keys(files).filter(n => n.endsWith('.mp3') && !cached.has(n) && (pkg.sourceFormat!=='master-table'||(n.split('/').at(-1).startsWith(pkg.lesson.id+'_')&&!matchedNames.has(n.split('/').at(-1)))));
  if (extra.length) warnings.push(`${extra.length} 段音频未引用 / fichiers audio non utilisés`);
  return { pkg, assets, warnings, stats: { words: pkg.words.length, forms: pkg.words.reduce((n, w) => n + w.forms.length, 0), audio: cached.size, key: packageKey(pkg) } };
}
export function normalizeXlsx(bytes) {
  const parts = unpack(bytes); let changed = false;
  for (const name of Object.keys(parts).filter(n => n.startsWith('xl/') && n.endsWith('.xml'))) {
    let xml = new TextDecoder().decode(parts[name]);
    const aliases = [...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g)].map(m=>m[1]);
    for (const alias of new Set(aliases)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xml = xml.replace(new RegExp(`(<\\/?)(?:${escaped}):`, 'g'), '$1');
      xml = xml.replace(new RegExp(`xmlns:${escaped}=`, 'g'), 'xmlns='); changed = true;
    }
    if (aliases.length) parts[name] = new TextEncoder().encode(xml);
  }
  // Comments are not imported into the vocabulary. Remove their relationships
  // in memory because ExcelJS cannot read some valid WPS comment locations.
  for(const name of Object.keys(parts).filter(n=>/^xl\/worksheets\/_rels\/.*\.rels$/.test(n))){
    const xml=new TextDecoder().decode(parts[name]);
    const clean=xml.replace(/<(?:[\w-]+:)?Relationship\b[^>]*\bType=["'][^"']*\/(?:comments|vmlDrawing)["'][^>]*\/>/g,'');
    if(clean!==xml){parts[name]=new TextEncoder().encode(clean);changed=true;}
  }
  return changed ? zipSync(parts) : bytes;
}
async function parseExcel(bytes, meta, files, library) {
  bytes = normalizeXlsx(bytes); // ExcelJS otherwise rejects valid prefixed OOXML.
  const module = await import('exceljs/dist/exceljs.min.js'); const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('词库总表')||workbook.getWorksheet('单词表'); if (!sheet) fail('找不到“词库总表”工作表 / Feuille 词库总表 introuvable.');
  if (sheet.rowCount > 10001) fail('表格最多支持 10000 行 / Maximum : 10 000 lignes.');
  const rows = [];
  for (let i = 1; i <= sheet.rowCount; i++) rows.push(Array.from({ length: 15 }, (_, j) => sheet.getRow(i).getCell(j + 1).value));
  return rowsToLesson(rows, meta, files, library);
}
async function verifyAudio(bytes, name) {
  const hasId3=bytes[0]===73&&bytes[1]===68&&bytes[2]===51, hasFrame=bytes[0]===255&&(bytes[1]&224)===224;
  if(!hasId3&&!hasFrame)fail(`不是有效 MP3 / MP3 invalide : ${name}`);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  try {
    await new Promise((resolve, reject) => { const audio = new Audio(); const done = (error) => { clearTimeout(timer); audio.removeAttribute('src'); audio.load(); error ? reject(error) : resolve(); }; const timer = setTimeout(() => done(new Error(`音频检查超时 / Délai audio dépassé : ${name}`)), 8000); audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? null : new Error(`音频无法解码 / Audio illisible : ${name}`)); audio.onerror = () => done(new Error(`音频无法解码 / Audio illisible : ${name}`)); audio.preload = 'metadata'; audio.src = url; });
  } finally { URL.revokeObjectURL(url); }
}
