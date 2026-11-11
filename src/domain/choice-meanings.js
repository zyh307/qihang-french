import {distractorExclusion} from './choice-eligibility.js';
import {sameWordFamily} from './choice-similarity.js';
import {spellingParts} from './word-display.js';
// Conservative synonym groups for Chinese answer choices. Keep negation,
// direction and qualifiers: resembling text alone does not imply equivalence.
const groups=[
 ['穿','穿衣','穿衣服','穿着','穿着衣服','穿着衣服的','穿衣的','着衣','着装','给……穿','给……穿衣','穿上','穿上衣服'],
 ['睡觉','睡眠','睡着','入睡','上床睡觉','去睡觉'],
 ['再次见到','再次见面','再次相见','重新见到','重新见面','再见面','再见到','重逢'],
 ['休闲','休憩','闲暇','空闲时间','闲暇时间'],['爱好','业余爱好','兴趣爱好'],['开心','高兴','愉快','快乐'],['漂亮','美丽','好看'],['想起','记起','回想起','记得'],['离开','离去','走开'],['开车','驾车','驾驶汽车'],
 ['见面','会面','相见'],['看见','看到','见到'],
 ['自行车','脚踏车','单车'],['出租车','计程车','的士'],
 ['公交车','公共汽车','公共汽車','巴士'],['地铁','地下铁'],
 ['手机','移动电话'],['电脑','计算机'],['因特网','互联网'],
 ['电影院','影剧院'],['影片','电影'],['照片','相片'],
 ['买','购买'],['卖','出售'],['工作','上班'],
 ['开始','起始'],['结束','完结'],['立刻','立即','马上'],
 ['经常','常常','时常'],['有时','有时候'],['每天','每日']
];
const plain=value=>String(value??'').normalize('NFKC').replaceAll('著','着').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu,'');
const aliases=new Map(groups.flatMap((group,index)=>group.map(value=>[plain(value),'synonym:'+index])));
export function choiceMeaningKeys(values){
 return new Set((Array.isArray(values)?values:[values]).flatMap(value=>String(value??'')
  .replace(/（[^）]*）|\([^)]*\)|\[[^\]]*\]|【[^】]*】/gu,'')
  .split(/[，,、；;\n/／]+/u)).map(plain).filter(Boolean).map(value=>aliases.get(value)||value));
}
function nearbyChinese(a,b){if(a===b)return true;if(a.startsWith('synonym:')||b.startsWith('synonym:')||!/[\u4e00-\u9fff]/u.test(a+b)||Math.min(a.length,b.length)<2)return false;const pairs=[['不',''],['无','有'],['上','下'],['前','后'],['左','右'],['进','出'],['买','卖']];if(pairs.some(([x,y])=>y?(a.includes(x)&&b.includes(y)||a.includes(y)&&b.includes(x)):(a.includes(x)!==b.includes(x))))return false;if(a.includes(b)||b.includes(a))return true;if(Math.min(a.length,b.length)<3)return false;let previous=Array(b.length+1).fill(0);for(const char of a){const next=[0];for(let i=0;i<b.length;i++)next.push(char===b[i]?previous[i]+1:Math.max(previous[i+1],next[i]));previous=next;}return previous[b.length]/Math.max(a.length,b.length)>=.78;}
export const meaningsOverlap=(left,right)=>[...left].some(a=>[...right].some(b=>nearbyChinese(a,b)));

// Also hide ambiguous distractors in a previously saved question, while keeping
// its valid choices, order, question ID and learning position unchanged.
export function unambiguousChoices(options,word,primary,resolve=()=>null){
 const seen=choiceMeaningKeys([primary,...(word.meanings||[])]);
 const eligible=[...(options||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id))).filter(option=>{
  if(option.id===word.id)return true;
  const source=resolve(option.id);
  if(source&&distractorExclusion(source))return false;
  const sourceFrench=source?.forms?.map(form=>spellingParts(source,form).answer)||[];
  if(sourceFrench.some(text=>word.forms?.some(form=>sameWordFamily(spellingParts(word,form).answer,text))))return false;
  if(distractorExclusion({meanings:[option.label],primaryMeaning:option.label,pos:option.pos||'v.',forms:String(option.french||'').split(/\s+\/\s+/u).map(text=>({text}))}))return false;
  const french=String(option.french||'').split(/\s+\/\s+/u);
  if(french.length&&french.every(text=>/^(?:se|s['’])$/iu.test(text.trim())))return false;
  if(french.some(text=>word.forms?.some(form=>sameWordFamily(spellingParts(word,form).answer,text))))return false;
  const keys=choiceMeaningKeys([option.label,...(source?.meanings||[])]);
  if(meaningsOverlap(keys,seen))return false;
  for(const key of keys)seen.add(key);
  return true;
 });
 const ids=new Set(eligible.map(option=>option.id));
 return (options||[]).filter(option=>ids.has(option.id));
}
