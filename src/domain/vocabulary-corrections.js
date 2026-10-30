// Corrections shared by table imports and the bundled curriculum.
export const vocabularyCorrections=[{
  lesson:'L14',number:'016',from:'une promenade',text:'faire une promenade',pos:'loc.',
  ipa:'/fɛʁ yn pʁomnad/',exampleFr:'Nous allons faire une promenade au parc.',
  exampleZh:'我们要去公园散步。',revision:1
}];
export function correctMasterRow(row,lesson){
  const correction=vocabularyCorrections.find(c=>c.lesson===lesson&&Number(c.number)===Number(row[1])&&[c.from,c.text].includes(String(row[2]||'').trim()));
  if(!correction)return row;
  const result=[...row];result[2]=correction.text;result[3]=correction.ipa;result[4]=correction.pos;result[6]=correction.exampleFr;
  return result;
}
