// Only noun articles are removed: prepositions and complete expressions stay intact.
const irregular = {
  lieux:'lieu',jeux:'jeu',yeux:'œil',cheveux:'cheveu',animaux:'animal',travaux:'travail',
  sociaux:'social',sociales:'social',familiales:'familial',familiaux:'familial',humaines:'humain',
  naturelles:'naturel',personnelles:'personnel',professionnelles:'professionnel',
  amoureuses:'amoureux',quotidiennes:'quotidien',ménagères:'ménager',
  formelle:'formel',informelle:'informel',cardinaux:'cardinal',ordinaux:'ordinal',
  nouveaux:'nouveau',nouvelles:'nouveau',verts:'vert',futures:'futur',tronqués:'tronqué',
  électroménagers:'électroménager',loisirs:'loisir','grands-parents':'grand-parent',
  'petits-enfants':'petit-enfant','beaux-parents':'beau-parent',citoyennes:'citoyen',
  positives:'positif',positifs:'positif',négatives:'négatif',négatifs:'négatif',
  bateaux:'bateau',réseaux:'réseau'
};
const invariant = new Set(['pays','temps','corps','mois','prix','sens','accès','progrès',
  'cours','discours','parcours','repas','taux','choix','bois','cas']);
export function headingWordKey(text){
  let value=String(text||'').normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'")
    .replace(/\s+/g,' ').trim().replace(/^(?:(?:un|une|le|la|les|des|du|de la)\s+|(?:de )?l'\s*)/u,'');
  value=irregular[value]||(invariant.has(value)?value:value.replace(/s$/u,''));
  return value.replaceAll('œ','oe').replaceAll('æ','ae');
}
export const headingWordKeys=word=>new Set((word.forms||[]).map(form=>headingWordKey(form.text)).filter(Boolean));
