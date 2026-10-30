const base=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr');
const punctuation=s=>!/[\p{L}\p{N}]/u.test(s);
export function spellingDiff(input,expected){
  const a=[...String(input).normalize('NFC')],b=[...String(expected).normalize('NFC')];
  if(a.length>300||b.length>300)return[{kind:'replace',actual:a.join(''),expected:b.join('')}];
  const d=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=0;i<=a.length;i++)d[i][0]=i;
  for(let j=0;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]));
  let i=a.length,j=b.length;const changes=[];
  while(i||j){
    if(i&&j&&d[i][j]===d[i-1][j-1]+Number(a[i-1]!==b[j-1])){
      const actual=a[--i],expected=b[--j];
      const kind=actual===expected?'same':actual.toLocaleLowerCase('fr')===expected.toLocaleLowerCase('fr')?'case':base(actual)===base(expected)?'accent':punctuation(actual)&&punctuation(expected)?'format':'replace';
      changes.push({kind,actual,expected});
    }else if(j&&d[i][j]===d[i][j-1]+1){const expected=b[--j];changes.push({kind:punctuation(expected)?'format':'missing',actual:'',expected});}
    else{const actual=a[--i];changes.push({kind:punctuation(actual)?'format':'extra',actual,expected:''});}
  }
  return changes.reverse().reduce((groups,change)=>{const last=groups.at(-1);if(last?.kind===change.kind){last.actual+=change.actual;last.expected+=change.expected;}else groups.push({...change});return groups;},[]);
}
