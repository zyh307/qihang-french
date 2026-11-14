import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {primaryMeaning,meaningPoints} from '../src/domain/meanings.js';
import {semanticLabel,semanticContrast,splitChoiceSenses} from '../src/domain/choice-semantic-core.js';
import {reviewedSemanticGroups} from '../src/domain/choice-semantic-groups.js';
const root=new URL('../',import.meta.url),read=async path=>JSON.parse(await fs.readFile(new URL(path,root),'utf8'));
const dictionary=await read('src/static/lexicon/french.json'),words=[],sources=[];
words.push(...dictionary.entries.map(row=>({...row,id:'dictionary:'+row.id,forms:[{id:'base',text:row.word,tested:true}],auditSource:'dictionary'})));
sources.push({source:'dictionary',count:dictionary.entries.length});
for(const book of ['inspire1','inspire2','inspire3','inspire4','fos1']){
 const entries=unzipSync(await fs.readFile(new URL('src/static/content/'+book+'.zip',root)),{filter:f=>f.name==='manifest.json'}),data=JSON.parse(strFromU8(entries['manifest.json']));
 const rows=data.library.flatMap(p=>p.words.map(w=>({...w,auditSource:p.book.id+':'+p.lesson.id})));words.push(...rows);sources.push({source:book,count:rows.length});
}
const groups=new Map();
for(const word of words)for(const sense of meaningPoints(word)){
 const labels=[...new Set(splitChoiceSenses(sense).filter(key=>/^[\p{Script=Han}\p{N}]+$/u.test(key)&&key.length<=18))].sort();
 if(labels.length<2||labels.length>24||labels.some((a,i)=>labels.slice(i+1).some(b=>semanticContrast(a,b))))continue;
 const key=labels.join('|');groups.set(key,labels);
}
const learned=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([,labels])=>labels);
const target=new URL('src/lexicon/choice-semantic-index.json',root);
await fs.writeFile(target,JSON.stringify({version:1,source:'Chinese synonyms within existing dictionary and textbook sense points; independent groups, no transitive merge',groups:learned})+'\n');
console.log(JSON.stringify({sources,entries:words.length,reviewedGroups:reviewedSemanticGroups.length,dictionarySenseGroups:learned.length,indexBytes:(await fs.stat(target)).size}));
if(!process.argv.includes('--audit'))process.exit(0);

// Content audit requested by the user. This never starts an application,
// modifies a lesson/record, records audio or writes into a delivery package.
const {choiceMeaningKeys,meaningsOverlap}=await import('../src/domain/choice-meanings.js');
const {distractorExclusion}=await import('../src/domain/choice-eligibility.js');
const {sameWordFamily}=await import('../src/domain/choice-similarity.js');
const {spellingParts}=await import('../src/domain/word-display.js');
const rows=words.map(w=>({w,label:primaryMeaning(w),keys:choiceMeaningKeys([primaryMeaning(w),...w.meanings]),excluded:distractorExclusion(w)}));
const eligible=rows.filter(row=>!row.excluded),primaryLabels=new Set(rows.map(row=>row.label));
const members=new Map();
for(const row of eligible){const primaryKeys=choiceMeaningKeys(row.label);for(const key of primaryKeys){if(!members.has(key))members.set(key,new Map());members.get(key).set(row.label,(members.get(key).get(row.label)||0)+1);}}
const clusters=[...members].filter(([,labels])=>labels.size>1).map(([key,labels])=>({key,labels:[...labels.keys()],entries:[...labels.values()].reduce((a,b)=>a+b,0)}));
const probes=[['在西边','西'],['西方的','向西'],['在左侧','左边的'],['在北面','北'],['在上面','上'],['在里面','内部'],['在这里','这儿'],['第二条街','第二的'],['漂亮的','美丽的'],['很高兴','开心'],['上床睡觉','睡眠'],['再次见到','再次见面'],['早晨','上午'],['马 上','立即'],['鼻子','鼻'],['房屋','房子'],['开车','驾驶汽车'],['在东部','东方'],['向南方','南'],['往东北方向','东北'],['在前面','前方'],['在外面','外部'],['在附近','旁边'],['此处','这里'],['今日','今天'],['明天','次日'],['每星期','每周'],['常常','经常'],['依然','仍然'],['很冷','寒冷的'],['暖和的','温暖'],['迅速地','飞快'],['很大的','庞大'],['相同的','一样'],['不正确的','错误'],['非常美丽的','漂亮'],['喜欢','喜爱'],['难过','悲伤'],['累的','疲劳'],['很简单','容易'],['低价','便宜'],['白的','白色'],['黑色的','黑'],['向左方的','左'],['右侧','在右边'],['阅读','读书'],['老师','教师'],['男子','男人'],['父亲','爸爸'],['小孩','儿童'],['公共汽车','巴士'],['自行车','单车'],['计算机','电脑'],['猫咪','猫'],['问','询问'],['感谢','谢谢'],['改变','变化'],['食物','食品'],['办法','方法'],['进来','进入'],['拿来','带来'],['结束','完成'],['不可能的','不可能'],['不可缺少','必需']];
const contrasts=[['东','西'],['左','右'],['东北','东'],['上','下'],['前','后'],['第一','第二'],['喜欢','不喜欢'],['巴西','西'],['西班牙','西']];
probes.push(['在早上','上午'],['令人喜悦的','开心'],['夏季的','夏天'],['周一','星期一'],['在家里','家中']);
const missing=probes.filter(([a,b])=>!meaningsOverlap(choiceMeaningKeys(a),choiceMeaningKeys(b)));
const overblocked=contrasts.filter(([a,b])=>meaningsOverlap(choiceMeaningKeys(a),choiceMeaningKeys(b)));
const pool=eligible.filter(row=>row.w.auditSource==='dictionary'&&(row.w.frequency??4)>=3.8).sort((a,b)=>(b.w.frequency||0)-(a.w.frequency||0)).slice(0,256),insufficient=[];
let candidateChecks=0;
for(const row of eligible){let available=0;const seen=[row.keys];for(const candidate of pool){candidateChecks++;if(candidate.w.id===row.w.id||seen.some(keys=>meaningsOverlap(keys,candidate.keys)))continue;
 if(row.w.forms.some(f=>candidate.w.forms.some(other=>sameWordFamily(spellingParts(row.w,f).answer,spellingParts(candidate.w,other).answer))))continue;
 seen.push(candidate.keys);if(++available===3)break;
 }if(available<3)insufficient.push({source:row.w.auditSource,word:row.w.forms.map(f=>f.text).join(' / '),label:row.label,available});}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const summary={sources,entries:words.length,uniquePrimaryLabels:primaryLabels.size,eligibleChoiceEntries:eligible.length,reviewedSemanticGroups:reviewedSemanticGroups.length,dictionarySenseGroups:learned.length,sharedPrimaryClusters:clusters.length,representativeNearPairs:probes.length,missingNearPairs:missing,contrastPairs:contrasts.length,overblockedContrasts:overblocked,fullInventoryCandidateChecks:candidateChecks,entriesWithFewerThanThreeDistinctCommonChoices:insufficient.length,indexSha256:digest(await fs.readFile(target)),scope:'Full bundled vocabulary inventory and common fallback candidates; no UI/device tests and no claim of exhaustive human semantic review of every Chinese word pair.'};
const out=new URL('.lexicon-work/choice-semantics/',root);await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify({summary,insufficient,clusters,inventory:rows.map(({w,label,excluded})=>({source:w.auditSource,id:w.id,french:w.forms.map(f=>f.text).join(' / '),label,excluded}))},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(missing.length||overblocked.length||insufficient.length)process.exitCode=1;
