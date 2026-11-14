// Articles are removed by the caller: compare the vocabulary spelling itself.
const plain=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^\p{L}\p{N}]/gu,'');
const spellings=[['oignon','ognon'],['clef','clé'],['asseoir','assoir'],['nénuphar','nénufar'],['cuiller','cuillère'],['paie','paye'],['nouveau','nouvel','nouvelle']];
const variantKeys=new Map(spellings.flatMap((group,index)=>group.map(text=>[plain(text),index])));
// Familiar shop categories can be confused by meaning as well as spelling.
const shops=new Set(['boulangerie','pâtisserie','boulangerie-pâtisserie','boucherie','charcuterie','boucherie-charcuterie','poissonnerie','épicerie','librairie','papeterie','pharmacie','bijouterie','parfumerie','boulangerie et pâtisserie','boucherie et charcuterie','supermarché','hypermarché','supérette','droguerie','quincaillerie','laverie','fromagerie','crémerie','cordonnerie','pressing','bureau de tabac','magasin de vêtements','magasin de chaussures'].map(plain));
export const isShopVocabulary=text=>shops.has(plain(String(text||'').replace(/^(?:un|une|le|la|les|des)\s+|^l['’]/iu,'')));
const families=[['boire','boisson','buveur','buvable'],['lire','lecture','lecteur','lisible'],['ecrire','ecrit','ecriture','ecrivain'],['connaitre','connu','connaissance'],['choisir','choix'],['libre','liberte','liberer','liberation'],['payer','paie','paye','paiement'],['employer','emploi','employe','employeur'],['envoyer','envoi','envoye'],['ouvrir','ouvert','ouverture','rouvrir'],['couvrir','couvert','couverture','recouvrir'],['offrir','offert','offre'],['permettre','permis','permission'],['conduire','conduit','conduite','conducteur'],['traduire','traduit','traduction','traducteur'],['construire','construit','construction','constructeur'],['produire','produit','production','producteur'],['habit','habits','habiller','habille','habillement','habillage','deshabiller','deshabille','rhabiller'],['vetir','vetu','vetement','revêtir','revetir','revetu','devetir'],['habituer','habitue','habitude','habituel','habituellement'],['dormir','endormir','endormi','dormeur'],['beau','belle','beaute'],['bon','bonne','bonte'],['doux','douce','douceur','doucement'],['long','longue','longueur','longuement'],['vieux','vieille','vieillesse','vieillir'],['nouveau','nouvelle','nouveaute'],['fou','folle','folie'],['chaud','chaleur','chaleureux'],['histoire','historique','historien'],['pluie','pluvieux'],['soleil','solaire'],['important','importance'],['different','difference'],['patient','patience'],['present','presence'],['frequent','frequence','frequemment'],['possible','possibilite'],['responsable','responsabilite'],['nature','naturel','naturellement'],['facile','facilite'],['difficile','difficulte'],['triste','tristesse'],['riche','richesse'],['pauvre','pauvrete'],['lent','lenteur','lentement'],['rapide','rapidite']];
const prefixes=['anti','auto','contre','entre','inter','sous','super','trans','ap','com','con','de','des','dis','en','em','in','im','mal','me','pre','re','sur'];
const suffixes=['ante','antes','ant','iquement','eusement','issement','ification','isation','ation','ition','ateur','atrice','ement','ienne','euse','ance','ence','iste','isme','ique','aire','able','ible','iere','erie','ite','eux','eur','ien','ier','age','ion','ive','if','inal','ial','al','ale','elle','el','ie','er','ir','re'];
const rootsCache=new Map();
const phraseFunctionWords=new Set(['a','au','aux','de','du','des','en','le','la','les','l','un','une','d','et','ou','se','s','ce','cet','cette','ces','mon','ma','mes','ton','ta','tes','son','sa','ses']);
const phraseWords=text=>(String(text).match(/\p{L}+/gu)||[]).map(plain).filter(word=>word.length>=3&&!phraseFunctionWords.has(word));
const phraseNegation=/(?:^|[\s'’])(?:ne|n|pas|sans|non|ni|aucun|aucune|jamais)(?:$|[\s'’])/iu;
function familyRoots(word){
 if(rootsCache.has(word))return rootsCache.get(word);
 const singular=word.replace(/(?:s|x)$/u,''),forms=new Set([word,singular]);
 for(const value of [word,singular])for(const suffix of suffixes)if(value.endsWith(suffix)&&value.length-suffix.length>=3)forms.add(value.slice(0,-suffix.length));
 for(const prefix of prefixes)if(word!=='devoir'&&word.startsWith(prefix)&&word.length-prefix.length>=4){const stem=word.slice(prefix.length);forms.add(stem);for(const suffix of suffixes)if(stem.endsWith(suffix)&&stem.length-suffix.length>=3)forms.add(stem.slice(0,-suffix.length));}
 const roots=new Set([...forms].map(value=>value.replace(/qu/g,'c').replace(/e$/u,'').replace(/([nlts])\1$/u,'$1')).filter(value=>value.length>=3));
 for(let i=0;i<families.length;i++)if(families[i].some(value=>value===word||value===singular||value===word.replace(/e$/u,'')||value===singular.replace(/e$/u,'')))roots.add('family:'+i);
 if(rootsCache.size>4096)rootsCache.clear();rootsCache.set(word,roots);return roots;
}
export function sameWordFamily(left,right){
 const reflexive=text=>String(text||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu,'').trim().replace(/^(?:se\s+|s['’]\s*)/iu,'').replace(/\s*[（(]\s*(?:se|s['’])\s*[)）]\s*$/iu,'');
 const l=reflexive(left),r=reflexive(right);
 // A verb and its reflexive form are unsuitable distractors for each other,
 // even when their Chinese glosses differ.
 if((l!==String(left).trim()||r!==String(right).trim())&&plain(l)===plain(r))return true;
 const a=plain(l),b=plain(r);
 if(a===b)return true;
 if(variantKeys.has(a)&&variantKeys.get(a)===variantKeys.get(b))return true;
 // A phrase and its content word/derivative are ambiguous Chinese choices:
 // deuxième rue / deuxième, première rue / premier. Two different phrases
 // sharing a verb or article remain eligible; do not merge negated phrases.
 if(/\s/u.test(l)||/\s/u.test(r)){
  if(phraseNegation.test(l)||phraseNegation.test(r))return false;
  const left=phraseWords(l),right=phraseWords(r);
  if(!/\s/u.test(l)&&left.length===1)return right.some(word=>sameWordFamily(left[0],word));
  if(!/\s/u.test(r)&&right.length===1)return left.some(word=>sameWordFamily(word,right[0]));
  return false;
 }
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
