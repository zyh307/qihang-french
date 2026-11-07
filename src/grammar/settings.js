const KEY='qihang-grammar-settings-v1';
import {grammarRevision,writeGrammarRecord} from './storage.js';
let revision;
export const defaultGrammarSettings=Object.freeze({roundSize:10,questionType:'both',shuffle:true});
export function normalizeGrammarSettings(value={}){
 return {roundSize:[5,10,15,20].includes(value?.roundSize)?value.roundSize:10,questionType:['both','translate','judge'].includes(value?.questionType)?value.questionType:'both',shuffle:value?.shuffle!==false};
}
export function readGrammarSettings(){try{revision=grammarRevision();return normalizeGrammarSettings(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return {...defaultGrammarSettings};}}
export function saveGrammarSettings(value){const next=normalizeGrammarSettings(value);writeGrammarRecord(KEY,next,revision);return next;}
