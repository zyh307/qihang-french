import {conjugationSpeech} from './speech-text.js';

export function conjugationSearchKey(value){
 return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replaceAll('œ','oe').replaceAll('æ','ae').replace(/[’‘]/gu,"'").replace(/\s+/gu,' ').trim();
}

export function searchVariants(person,raw){
  if(!raw||raw==='—')return [];
  const subjects=person==='il'?['il','elle','on']:person==='ils'?['ils','elles']:[person];
  const forms=[raw,...subjects.map(subject=>conjugationSpeech(subject,raw))];
  const participle=raw.match(/^(?:ai|as|a|avons|avez|ont|suis|es|est|sommes|êtes|sont)\s+(\p{L}+)$/u);
  if(participle)forms.push(participle[1]);
  return forms;
}
