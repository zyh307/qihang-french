export const exams = {
  A2: {prep: 600, prepared: ['monologue','interaction'], stages: ['intro','monologue','interaction'], total: '6–8 分钟'},
  B1: {prep: 600, prepared: ['opinion'], stages: ['intro','interaction','opinion'], total: '10–15 分钟'},
  B2: {prep: 1800, prepared: ['presentation'], stages: ['presentation','debate'], total: '20 分钟'},
};
export const parts = {
  intro: {name:'引导问答', fr:'Entretien dirigé', hint:'考官先开口，根据你的回答追问。', examiner:'以法语请考生自我介绍，再根据回答追问本人、活动、过去或计划。A2 说慢一点，B1 可追问理由和经历。'},
  monologue: {name:'独白', fr:'Monologue suivi', hint:'先连续陈述，停录后考官可就你的发言追问。', examiner:'陈述后只围绕题卡与考生刚说的内容问简短补充问题。没有收到陈述时，不自行提问。'},
  interaction: {name:'情景互动', fr:'Exercice en interaction', hint:'按原题指定身份，与考官完成情景任务。', examiner:'只扮演题卡指定的角色。遵守原题事实与已有对话约定。A2 自然回应日常请求，B1 按题意提出合理阻力或替代方案，让考生协商。'},
  opinion: {name:'观点陈述与追问', fr:'Expression d’un point de vue', hint:'先做约 3 分钟陈述，再回答考官追问。', examiner:'先听完独白，再针对考生立场追问理由或要求举例。没有收到陈述时，不自行提问。'},
  presentation: {name:'独白陈述', fr:'Monologue suivi', hint:'用 5–7 分钟阐明问题、立场和论据。陈述中考官保持安静。', examiner:'独白阶段不发言。'},
  debate: {name:'辩论', fr:'Débat avec l’examinateur', hint:'用刚才同一篇材料，回应反方观点并捍卫自己的立场。', examiner:'根据考生刚才的独白和本环节发言提出具体反例、质疑或追问。每轮只挑战一个论点，留出回应空间。'},
};
const greetingCue = '你可以先打招呼 / Vous pouvez commencer par saluer l’examinateur.';
const openingCues = {
  exchange: '你可以先用当前词卡提问 / Vous pouvez poser une question avec le mot de la carte.',
  roleplay: greetingCue,
  monologue: '你可以开始独白 / Vous pouvez commencer votre monologue.',
  interaction: greetingCue,
  opinion: '你可以先陈述自己的观点 / Vous pouvez commencer par présenter votre point de vue.',
  presentation: '你可以开始独白陈述 / Vous pouvez commencer votre exposé.',
};
export const openingCue = part => openingCues[part];

const limits = {
  A2: {intro:[90,90,'约 1 分 30 秒'], monologue:[120,120,'约 2 分钟'], interaction:[180,210,'3–4 分钟']},
  B1: {intro:[120,180,'2–3 分钟'], interaction:[180,240,'3–4 分钟'], opinion:[300,420,'5–7 分钟']},
  B2: {presentation:[300,420,'5–7 分钟'], debate:[600,780,'10–13 分钟']},
};
const cardKey = {opinion:'document',presentation:'document',monologue:'monologue',interaction:'interaction'};
const speechCaps = {monologue:120,opinion:180,presentation:420};
export const timing = (level, part) => limits[level][part];
export const isAdvanced = s => Boolean(exams[s?.level]);
export const currentPart = s => s.stages[s.stage_index];
export const currentCard = s => s.chosen[currentPart(s)==='debate'?'presentation':currentPart(s)];
export const examClock = s => s.phase==='preparation'?s.prep_until:s.phase==='active'&&s.mode==='simulation'?s.stage_until:null;
export const choiceKeys = s => s.phase==='selecting'?(s.stage_started===null?exams[s.level].prepared:[currentPart(s)]):[];
export function createExam(base, level, cards, shuffle, now) {
  const spec=exams[level];
  if(!spec || base.part!=='full')throw Error('请选择完整口试 / Choisissez une épreuve complète.');
  const drawn={};
  for(const part of spec.stages)if(cardKey[part])drawn[part]=shuffle(cards.cards[cardKey[part]]).slice(0,2);
  return {...base,level,stages:[...spec.stages],bank_version:cards.version,phase:'selecting',
    prep_until:null,stage_started:null,stage_until:null,drawn,chosen:{},presented:{},created:now};
}
export function chooseCard(s, part, id) {
  if(!choiceKeys(s).includes(part))throw Error('该环节还未开放抽题 / Le tirage n’est pas ouvert.');
  const card=s.drawn[part].find(card=>card.id===id);
  if(!card)throw Error('请选择抽到的原题 / Choisissez un sujet tiré.');
  s.chosen[part]=card;
}
export function openPart(s, now) {
  delete s.finish_round;
  s.phase='active';
  s.stage_started=now;
  const duration=timing(s.level,currentPart(s))[1];
  s.stage_until=now+duration;
}
export function commitChoices(s, now) {
  if(s.phase!=='selecting'||choiceKeys(s).some(part=>!s.chosen[part]))throw Error('请为每个部分选一道题 / Choisissez un sujet par partie.');
  if(s.stage_started===null){
    if(s.mode==='simulation'){
      s.phase='preparation';
      s.prep_until=now+exams[s.level].prep;
    }else openPart(s,now);
  }else openPart(s,now);
}
export function advancePart(s, now) {
  const part=currentPart(s);
  s.stage_completion[part]={at:now,reason:'已结束环节'};
  if(s.stage_index===s.stages.length-1){
    s.phase='ended';
    s.ended=now;
  }else{
    s.stage_index++;
    if(!s.chosen[currentPart(s)]&&s.drawn[currentPart(s)])s.phase='selecting';
    else openPart(s,now);
  }
}
export function recordDeadline(s, now) {
  const part=currentPart(s);
  const cap=(!s.presented[part]&&speechCaps[part])||120;
  return now+cap;
}
export function examProgress(s, now) {
  const part=currentPart(s);
  const [minimum,target]=timing(s.level,part);
  return {stage:part,target_seconds:target,elapsed:s.stage_started===null?0:Math.max(0,now-s.stage_started),
    completed:!!s.stage_completion[part], closing:false,
    can_advance:s.mode==='practice'||now>=s.stage_started+minimum&&s.level!=='B2'};
}
export function examTask(s, turnId, evaluation, rows) {
  const part=currentPart(s);
  const evidenceStages=evaluation?s.stages:[part];
  const relevant=message=>message.stage===part||part==='debate'&&message.stage==='presentation';
  const history=s.messages.filter(m=>(evaluation||relevant(m))&&(m.role==='assistant'||rows.includes(m)));
  const instruction=evaluation?
    '停止对话。用中文按实际有发言的环节提供结构化反馈。A2 重点看是否说清事实、原因并完成情景任务；B1 看观点组织、例子、协商与回应；B2 看问题提炼、论据、让步与反驳。分别说明任务、互动（纯独白可标不适用）、词汇、语法。只逐字引用同一环节中 learner_rows 的原句，未完成环节注明证据有限。不要从转写评发音、语速或停顿，不给官方分数。调用 self.french_exam.submit_evaluation 提交文字报告，然后用中文语音简要讲解本次优点、一个改进和下一步练习。':
    (s.mode==='simulation'?'全程只说法语。不纠错、不提示、不提供答案。':'默认说法语；考生明确请求帮助时可以给简短提示。')+
    '当前级别 '+s.level+'。只执行当前环节。一次只问一个问题或给一个简短回应，等考生发言。计时和环节切换由应用管理。' + parts[part].examiner+(s.mode==='simulation'&&s.stage_until<=Date.now()/1000?' 时间已到。回应考生本轮发言后自然收尾，不再提出新问题，不开启新话题。':'');
  return {turn_id:turnId,level:s.level,mode:evaluation?'evaluation':s.mode,stage:part,instruction,
    card:evaluation?undefined:currentCard(s),exam_cards:evaluation?s.chosen:undefined,
    recent_dialogue:(evaluation?history:history.slice(-16)).map(m=>({role:m.role,stage:m.stage,text:m.confirmed_text||m.text})),
    learner_rows:(evaluation?rows:rows.filter(relevant).slice(-12)).map(m=>({id:m.id,stage:m.stage,text:m.confirmed_text})),
    stage_evidence:Object.fromEntries(evidenceStages.map(st=>[st,{learner_turns:rows.filter(m=>m.stage===st).length,flow_completed:!!s.stage_completion[st]}])),
    completed_stages:Object.keys(s.stage_completion),transcript_only:evaluation};
}
