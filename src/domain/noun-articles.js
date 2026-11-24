const rules={terre:{meaning:/地球/u,article:'la',word:'Terre'},soleil:{meaning:/太阳/u,article:'le',word:'Soleil'},lune:{meaning:/月亮|月球/u,article:'la',word:'Lune'},univers:{meaning:/宇宙/u,article:"l'",word:'univers'},ciel:{meaning:/天|天空/u,article:'le',word:'ciel'},monde:{meaning:/世界/u,article:'le',word:'monde'}};
export function nounPresentation(word,form){
 if(word?.pos!=='n.'||form?.literal)return null;
 const text=String(form?.text||word.word||word.lexiconWord||'').normalize('NFC').replaceAll('’',"'").trim();
 if(/^(?:(?:un|le|les|des) )?repas$/iu.test(text))return {article:'un',word:'repas',replaceArticle:true};
 const bare=text.replace(/^(?:un|une|le|la)\s+|^l'/iu,'').toLocaleLowerCase('fr'),rule=rules[bare];if(!rule)return null;
 const sense=word.primaryMeaning||form?.meaning||word.meanings?.[0]||'';
 return rule.meaning.test(sense)?rule:null;
}
