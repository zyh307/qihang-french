const plain=value=>String(value??'').normalize('NFKC').replaceAll('著','着').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu,'');
const singleAdjectives=new Set([...'大小高矮长短宽窄厚薄轻重冷热暖凉快慢早晚新旧好坏美丑干湿软硬胖瘦深浅远近贵贱忙闲强弱亮暗真假空满红黄蓝绿黑白紫灰酸甜苦咸辣圆直斜穷富']);
const mannerAdjectives=new Set(['迅速','快速','缓慢','缓缓','慢慢','高兴','快乐','安静','认真','仔细','正确','准确','清楚','清晰','直接','明确','明显','轻轻','完全','全部','突然','悄悄']);
export function semanticLabel(value){
 let key=plain(value);
 if(key.endsWith('的')&&(key.length>=3||singleAdjectives.has(key.slice(0,-1))))key=key.slice(0,-1);
 if(key.endsWith('地')&&mannerAdjectives.has(key.slice(0,-1)))key=key.slice(0,-1);
 // Normalize a whole directional gloss, never an arbitrary occurrence of 西
 // inside a name such as 巴西 / 西班牙, or 东北 into 东 / 北.
 const direction=key.match(/^(?:位于|处于|是在|在|向|往|朝|往向)?(?:正|以)?(东北|东南|西北|西南|东|西|南|北|左|右|上|下|前|后)(?:方向|方位|一边|一侧|部地区|方|边|面|侧|部|头)?$/u);
 if(direction)return direction[1];
 for(let i=0;i<3;i++){
  const before=key;
  key=key.replace(/^在(?=\p{Script=Han}{2})/u,'').replace(/^(?:使人感到|令人感到|让人感到|令人|让人|使人|感到)(?=\p{Script=Han}{2})/u,'');
  if(!/^十分之/u.test(key)){
   const degree=key.match(/^(?:非常|十分|极其|特别|相当|比较|较为|很|较)(.+)$/u);
   if(degree&&(degree[1].length>=2||singleAdjectives.has(degree[1])))key=degree[1];
  }
  if(key===before)break;
 }
 return key;
}
export function splitChoiceSenses(values){
 return (Array.isArray(values)?values:[values]).flatMap(value=>String(value??'')
  .replace(/（[^）]*）|\([^)]*\)|\[[^\]]*\]|【[^】]*】|〈[^〉]*〉/gu,'')
  .split(/[，,、；;\n/／]+/u)).map(semanticLabel).filter(Boolean);
}
const oppositePairs=[['东','西'],['南','北'],['上','下'],['前','后'],['左','右'],['内','外'],['进','出'],['买','卖'],['开','关'],['冷','热'],['早','晚'],['大','小'],['高','矮']];
export function semanticContrast(a,b){
 if((/^(?:不|没有|没|未|非)/u.test(a))!==(/^(?:不|没有|没|未|非)/u.test(b)))return true;
 if(a.includes('无')&&b.includes('有')||a.includes('有')&&b.includes('无'))return true;
 if(oppositePairs.some(([x,y])=>a.includes(x)&&b.includes(y)||a.includes(y)&&b.includes(x)))return true;
 const ordinal=value=>value.match(/^第([一二三四五六七八九十百\d]+)/u)?.[1];
 return !!(ordinal(a)&&ordinal(b)&&ordinal(a)!==ordinal(b));
}
