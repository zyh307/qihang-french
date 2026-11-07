export const GRAMMAR_REVISION='qihang-grammar-records-revision';
export const grammarRevision=()=>localStorage.getItem(GRAMMAR_REVISION);
export function writeGrammarRecord(key,value,revision){if(grammarRevision()!==revision)throw Error('记录已恢复，请重新打开此页面 / Rouvrez cette page.');localStorage.setItem(key,JSON.stringify(value));}
