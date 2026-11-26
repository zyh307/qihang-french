import {applyReviewedForms,reviewedReading} from './word-readings.js';

const spelling=value=>String(value||'').normalize('NFC').trim().toLocaleLowerCase('fr');
const registers={sympa:{zh:'口语',fr:'Familier'},sympathique:{zh:'标准表达',fr:'Courant'}};
export function registerForm(word,form){
 if(!word||word.conjugation||!/^adj[.\s]?/i.test(word.pos||''))return null;
 const names=new Set((word.forms||[]).map(f=>spelling(f.text)));
 return names.has('sympa')&&names.has('sympathique')?registers[spelling(form?.text)]||null:null;
}
export const relationGender=(word,form)=>registerForm(word,form)?null:form.gender;
export function applyFormRelations(word){
 if(!word||word.conjugation)return false;
 const names=(word.forms||[]).map(form=>spelling(form.text));
 const lexiconWord=spelling(word.lexiconWord);
 const withoutArticle=text=>text.replace(/^(?:un|une) /u,'');
 const head=names[0]&&withoutArticle(names[0]);
 if(word.pos==='adj.'&&names.includes('égal à')&&names.includes('égale à')){
  for(const form of word.forms){
   const text=spelling(form.text);
   if(text==='égal à')form.gender='m';
   if(text==='égale à')form.gender='f';
  }
 }
 if(word.pos==='n.'&&names.some(name=>/^(?:(?:un|le|des|les) )?multiples?$/u.test(name))){
  const isAdjectiveMeaning=value=>typeof value==='string'&&value.trim()==='多样的';
  if(word.meanings?.some(isAdjectiveMeaning))word.meanings=word.meanings.filter(value=>!isAdjectiveMeaning(value));
  if(isAdjectiveMeaning(word.primaryMeaning)){
   word.primaryMeaning=word.meanings?.[0]||'倍数';
   delete word.primaryMeaningChosen;
  }
  if(isAdjectiveMeaning(word.primaryMeaningBeforeChoice))delete word.primaryMeaningBeforeChoice;
 }

 if(head&&(!lexiconWord||lexiconWord===head)&&names.every(name=>withoutArticle(name)===head)){
  const pos={pour:'prép.',comment:'adv.'}[head];
  if(typeof pos==='string'){
   if(word.pos!==pos)delete word.vocabularyMerge;
   word.pos=word.sourcePos=pos;
   for(const form of word.forms){
    if(!/-(m|f)$/u.test(form.id||''))form.gender=null;
    if(spelling(form.text)!==head){form.text=head;form.audio=null;form.audioKey='tts:'+encodeURIComponent(head);form.audioOrigin='synthesized';}
    form.literal=true;
   }
  }
 }
 if(word.pos==='n.')for(const form of word.forms||[]){
  if(!/^(?:(?:un|le|les|des) )?repas$/u.test(spelling(form.text)))continue;
  form.text='un repas';form.gender='m';word.sourcePos='n.m.';
  form.audioKey='tts:un%20repas';form.audio=null;form.audioOrigin='synthesized';
 }
 const reading=reviewedReading(word);
 if(word.id&&reading?.matchSpelling)applyReviewedForms(word,reading);
 let changed=false;
 for(const form of word?.forms||[]){const register=registerForm(word,form);if(!register)continue;form.gender=null;form.registerLabel=register.zh+' · '+register.fr;form.questionHint=form.registerLabel;changed=true;}
 if(changed&&/两种形式分别考|Deux formes à pratiquer/i.test(word.patternNote||''))delete word.patternNote;
 return changed;
}
