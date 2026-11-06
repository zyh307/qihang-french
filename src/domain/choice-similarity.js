// Articles are removed by the caller: compare the vocabulary spelling itself.
const plain=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/œ/g,'oe').replace(/[^\p{L}\p{N}]/gu,'');
// Familiar shop categories can be confused by meaning as well as spelling.
const shops=new Set(['boulangerie','pâtisserie','boulangerie-pâtisserie','boucherie','charcuterie','boucherie-charcuterie','poissonnerie','épicerie','librairie','papeterie','pharmacie','bijouterie','parfumerie','boulangerie et pâtisserie','boucherie et charcuterie','supermarché','hypermarché','supérette','droguerie','quincaillerie','laverie','fromagerie','crémerie','cordonnerie','pressing','bureau de tabac','magasin de vêtements','magasin de chaussures'].map(plain));
export const isShopVocabulary=text=>shops.has(plain(String(text||'').replace(/^(?:un|une|le|la|les|des)\s+|^l['’]/iu,'')));
const families=[['beau','belle','beaute'],['bon','bonne','bonte'],['doux','douce','douceur','doucement'],['long','longue','longueur','longuement'],['vieux','vieille','vieillesse','vieillir'],['nouveau','nouvelle','nouveaute'],['fou','folle','folie'],['chaud','chaleur','chaleureux'],['histoire','historique','historien'],['pluie','pluvieux'],['soleil','solaire'],['important','importance'],['different','difference'],['patient','patience'],['present','presence'],['frequent','frequence','frequemment'],['possible','possibilite'],['responsable','responsabilite'],['nature','naturel','naturellement'],['facile','facilite'],['difficile','difficulte'],['triste','tristesse'],['riche','richesse'],['pauvre','pauvrete'],['lent','lenteur','lentement'],['rapide','rapidite']];
const suffixes=['iquement','eusement','issement','ification','isation','ation','ition','ateur','atrice','ement','ienne','euse','ance','ence','iste','isme','ique','aire','able','ible','iere','erie','ite','eux','eur','ien','ier','age','ion','ive','if','inal','ial','al','ale','elle','el','ie','er','ir','re'];
const rootsCache=new Map();
function familyRoots(word){
 if(rootsCache.has(word))return rootsCache.get(word);
 const singular=word.replace(/(?:s|x)$/u,''),forms=new Set([word,singular]);
 for(const value of [word,singular])for(const suffix of suffixes)if(value.endsWith(suffix)&&value.length-suffix.length>=3)forms.add(value.slice(0,-suffix.length));
 const roots=new Set([...forms].map(value=>value.replace(/qu/g,'c').replace(/e$/u,'').replace(/([nlts])\1$/u,'$1')).filter(value=>value.length>=3));
 for(let i=0;i<families.length;i++)if(families[i].some(value=>value===word||value===singular||value===word.replace(/e$/u,'')||value===singular.replace(/e$/u,'')))roots.add('family:'+i);
 if(rootsCache.size>4096)rootsCache.clear();rootsCache.set(word,roots);return roots;
}
export function sameWordFamily(left,right){
 // Fixed expressions sharing a small word are still distinct vocabulary items.
 if(/\s/u.test(String(left).trim())||/\s/u.test(String(right).trim()))return false;
 const a=plain(left),b=plain(right);if(a===b)return String(left).normalize('NFC').toLocaleLowerCase('fr')===String(right).normalize('NFC').toLocaleLowerCase('fr');
 // These spellings resemble each other without being noun/adjective derivatives.
 if((a.startsWith('heureu')&&b==='heure')||(b.startsWith('heureu')&&a==='heure'))return false;
 if((a.startsWith('terribl')&&b==='terre')||(b.startsWith('terribl')&&a==='terre'))return false;
 const roots=familyRoots(a);return [...familyRoots(b)].some(root=>roots.has(root));
}
export function spellingSimilarity(left,right){
 const a=plain(left),b=plain(right),length=Math.max(a.length,b.length);
 if(!a||!b)return 0;
 if(a===b)return 1;
 if(Math.abs(a.length-b.length)>Math.max(2,Math.floor(length*.4)))return 0;
 let older,previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];
  for(let j=1;j<=b.length;j++){
   current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],older[j-2]+1);
  }
  older=previous;previous=current;
 }
 return 1-previous[b.length]/length;
}
