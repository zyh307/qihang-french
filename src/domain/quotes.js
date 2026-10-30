// Public-domain excerpts. Chinese translations prepared for this collection.
const works = {
  lion: ['Jean de La Fontaine', 'Le Lion et le Rat', 'https://fr.wikisource.org/wiki/Fables_de_La_Fontaine_(éd._1874)/Le_Lion_et_le_Rat'],
  tortue: ['Jean de La Fontaine', 'Le Lièvre et la Tortue', 'https://fr.wikisource.org/wiki/Le_Lièvre_et_la_Tortue'],
  chartier: ['Jean de La Fontaine', 'Le Chartier embourbé', 'https://fr.wikisource.org/wiki/Le_Chartier_embourbé'],
  laboureur: ['Jean de La Fontaine', 'Le Laboureur et ses enfants', 'https://fr.wikisource.org/wiki/Le_Laboureur_et_ses_enfants_(La_Fontaine)'],
  art: ['Nicolas Boileau', 'L’Art poétique', 'https://fr.wikisource.org/wiki/Boileau_-_Œuvres_poétiques/L’Art_poétique/Texte_Entier'],
  methode: ['René Descartes', 'Discours de la méthode · I', 'https://fr.wikisource.org/wiki/Discours_de_la_méthode_(éd._Cousin)/Première_partie'],
  cid: ['Pierre Corneille', 'Le Cid · II, 2', 'https://fr.wikiquote.org/wiki/Le_Cid'],
  hugo: ['Victor Hugo', 'Les Châtiments · IV, IX', 'https://fr.wikisource.org/wiki/Les_Châtiments/«_Ceux_qui_vivent,_ce_sont_ceux_qui_luttent_;_ce_sont_…_»'],
};
const entries = [
  ['lion','Patience et longueur de temps font plus que force ni que rage.','耐心与时间，比蛮力与急躁更有力量。','patience','n. f.','耐心'],
  ['lion','On a souvent besoin d’un plus petit que soi.','我们常常也需要比自己弱小者的帮助。','besoin','n. m.','需要'],
  ['lion','Il faut, autant qu’on peut, obliger tout le monde.','应当尽己所能，帮助每一个人。','obliger','v.','帮助；使受惠'],
  ['tortue','Rien ne sert de courir ; il faut partir à point.','光跑得快没有用，要紧的是适时出发。','partir','v.','出发'],
  ['chartier','Aide-toi, le Ciel t’aidera.','先帮助自己，上天也会帮助你。','aider','v.','帮助'],
  ['laboureur','Le travail est un trésor.','劳动是一笔财富。','trésor','n. m.','宝藏；财富'],
  ['art','Ce que l’on conçoit bien s’énonce clairement, et les mots pour le dire arrivent aisément.','想得清楚，才能说得明白，表达的词句也会自然到来。','clairement','adv.','清楚地'],
  ['art','Hâtez-vous lentement ; et, sans perdre courage, vingt fois sur le métier remettez votre ouvrage.','从容地抓紧时间，不失勇气，一遍遍打磨自己的作品。','courage','n. m.','勇气'],
  ['art','Polissez-le sans cesse et le repolissez.','不断打磨，再打磨。','polir','v.','打磨；润饰'],
  ['art','Avant donc que d’écrire, apprenez à penser.','动笔之前，先学会思考。','penser','v.','思考'],
  ['art','Qui ne sait se borner ne sut jamais écrire.','不懂得有所节制，就不懂得写作。','se borner','v. pr.','有所节制'],
  ['art','Soyez-vous à vous-même un sévère critique.','做自己严格的批评者。','critique','n.','批评者'],
  ['art','Aimez qu’on vous conseille, et non pas qu’on vous loue.','乐于听取建议，而不只是赞美。','conseiller','v.','劝告；建议'],
  ['art','Il faut que chaque chose y soit mise en son lieu.','让每一样东西各得其所。','lieu','n. m.','地方；位置'],
  ['art','Donnez à votre ouvrage une juste étendue.','让作品有恰到好处的篇幅。','ouvrage','n. m.','作品'],
  ['art','Le secret est d’abord de plaire et de toucher.','秘诀首先在于令人喜爱、打动人心。','toucher','v.','触动；打动'],
  ['art','Le vrai peut quelquefois n’être pas vraisemblable.','真实之事，有时也未必显得可信。','vraisemblable','adj.','可信的；合乎情理的'],
  ['art','Souvent trop d’abondance appauvrit la matière.','过多的堆砌，常使内容反而贫乏。','abondance','n. f.','丰富；充裕'],
  ['art','Le temps, qui change tout, change aussi nos humeurs.','时间改变一切，也改变我们的心境。','temps','n. m.','时间'],
  ['methode','Le bon sens est la chose du monde la mieux partagée.','在世间万物中，良知是分配得最均匀的。','bon sens','loc. n. m.','理性；良知'],
  ['methode','Ce n’est pas assez d’avoir l’esprit bon, mais le principal est de l’appliquer bien.','仅有聪明的头脑还不够，更重要的是善于运用它。','appliquer','v.','运用'],
  ['cid','À vaincre sans péril, on triomphe sans gloire.','胜利若不经历风险，也就没有荣耀。','gloire','n. f.','荣耀'],
  ['cid','Aux âmes bien nées, la valeur n’attend point le nombre des années.','对于高贵的心灵，才华不必等待岁月。','valeur','n. f.','才华；价值'],
  ['hugo','Ceux qui vivent, ce sont ceux qui luttent.','真正活着的，是那些奋力前行的人。','lutter','v.','奋斗'],
];
export const quotes = entries.map(([key,fr,zh,word,pos,meaning],index) => {
  const [author,work,source]=works[key];
  return {id:`quote-${index+1}`,fr,zh,word,pos,meaning,author,work,source};
});
export function randomQuoteIndex(previous=-1,random=Math.random) {
  if(previous<0 || previous>=quotes.length)return Math.min(quotes.length-1,Math.floor(random()*quotes.length));
  const next=Math.min(quotes.length-2,Math.floor(random()*(quotes.length-1)));
  return next>=previous?next+1:next;
}
