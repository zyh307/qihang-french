// Remove dictionary layout metadata, keeping the Chinese definition itself.
export function definitionText(value){
 let text=String(value||'').trim().replace(/^:Template:[^\s]+\s*/u,'');
 text=text.split(/\r?\n/u).filter(line=>!/^\s*(?:[*#]\s*)?国际音标\s*(?:\^|[：:]|\/)/u.test(line)).join('\n');
 text=text.replace(/^([^\p{Script=Han}\n]+)\n(?=\s*[*#]?(?:副词|名词|形容词|动词|介词|连词|代词|数词))/u,'');
 text=text.replace(/^\s*[*#=：:\s]+/u,'').replace(/^(?:副词短语|名词短语|形容词短语|动词短语|副词|名词|形容词|动词|介词|连词|代词|数词)(?:（[^）]*）|\([^)]*\))?\s*[：:]\s*/u,'');
 // POS chains such as "n.m. ou n.f.inv." and "v.t. et v.i." are not senses.
 const pos='(?:pron|prép|prep|interj|conj|adj|adv|loc|art|num|indéf|interr|exclam|inv|pl|sg|intr|tr|pr|vt|vi|ad|ph|n|v|m|f|t|i)\\.';
 const prefix=new RegExp('^(?:(?:'+pos+')\\s*|(?:et|ou)\\s+|[，,；;=]\\s*)+','iu');
 text=text.replace(prefix,'').replace(/^(?:pl|sg|m|f)\s+(?=\p{Script=Han})/u,'').replace(/(?:\n\s*)?----\s*$/u,'').trim();
 return text;
}
