/* Local exam state and transport adapter for the existing oral interface.
 * No remote ASR, shared device identity, server URL or auto-resend of an uncertain turn. */
import {oralCall as call} from './native-bridge.js';
const bank=await fetch('bank-full.json').then(r=>r.json()),now=()=>Date.now()/1000,id=()=>crypto.randomUUID();
let activeChannel=null;
const stage=s=>s.stages[s.stage_index],accepted=m=>m.role==='user'&&['confirmed','automatic'].includes(m.confirmation_status);
const normalized=t=>t.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const repeat=t=>/repete|repet|pas compris|pardon|plus lent|encore une fois/i.test(normalized(t));
const question=t=>!repeat(t)&&(normalized(t).trim().endsWith('?')||/^(qu|quel|comment|combien|pourquoi|ou\b|d'ou|est.ce|avez|etes|aimez|faites|vous\b|tu\b|ton\b|votre\b)/i.test(normalized(t).trim()));
function shuffled(a){const b=[...a];for(let i=b.length-1;i>0;i--){const n=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*(i+1));[b[i],b[n]]=[b[n],b[i]];}return b;}
function progress(s){const part=stage(s),rows=s.messages.filter(m=>m.stage===part&&accepted(m)&&!repeat(m.confirmed_text)),elapsed=s.stage_started?now()-s.stage_started:0,budget={intro:90,exchange:120,roleplay:120}[part];let reason='';if(part==='intro'&&(rows.length>=6||elapsed>=budget&&rows.length>=4))reason='本次引导问答已完成';if(part==='exchange'&&s.exchange_done.length>=s.keywords.length)reason='六张词卡已交流';if(part==='roleplay'&&(rows.length>=8||elapsed>=budget&&rows.length>=3||rows.length>=2&&/au revoir|bonne journee|a bientot/.test(normalized(rows.at(-1)?.confirmed_text||''))))reason='本次情景交流已收尾';return {stage:part,answers:rows.length,elapsed,target_seconds:budget,closing:!!reason,reason,completed:!!s.stage_completion[part],cards_done:s.exchange_done,total_cards:s.keywords.length};}
function decorate(s){s.progress=progress(s);return s;}
function task(s,evaluation=false){const part=stage(s),rows=s.messages.filter(accepted),p=progress(s);const index=Math.min(rows.filter(m=>m.stage==='intro'&&!repeat(m.confirmed_text)).length,s.intro_questions.length-1);
 const instruction=evaluation?'停止考试对话。根据learner_rows中的实际考生原句提供中文点评、表达改写和练习建议，按实际练过的环节评价。不得评价发音、口音、语速或停顿；不得编造官方成绩或通过结论，不把可能的识别错误直接判为语言错误。只引用对应row的连续原文。调用self.french_exam.submit_evaluation提交结构化结果。':
 (s.mode==='simulation'?'模拟考试：只用简单法语，不即时纠错，不提供答案。':'陪练：默认简单法语，考生明确要求时可用中文简短提示。')+'一次只问一个问题或给一个简短回应，然后等待。'+
 (part==='intro'?'你提问，考生回答。避免重复已回答的问题。下一主题参考：'+s.intro_questions[index].question:part==='exchange'?'考生是提问者，你简短回答，禁止反问Et vous。你是Camille，住在Lyon，是法语教师，喜欢阅读和游泳，有一个姐姐。请求重复时只重复或简化。':s.scene.facts+' 按题卡扮演角色，严格遵守价格、时间和任务。')+
 (p.closing?' 先回应最新发言，再说Merci, cette partie est terminée，不再提问，不自行进入下一环节。':'');
 return {turn_id:id(),level:'A1',mode:evaluation?'evaluation':s.mode,stage:part,instruction:evaluation?bank.evaluationInstruction:instruction,keyword:s.keywords[s.keyword_index],keyword_cards:s.keywords.map((word,index)=>({index,word,done:s.exchange_done.includes(index)})),scene:s.scene,progress:p,intro_plan:{question:s.intro_questions[index].question},candidate_question:question(rows.at(-1)?.confirmed_text||''),recent_dialogue:s.messages.filter(m=>m.role==='assistant'||accepted(m)).slice(-48).map(m=>({role:m.role,text:m.confirmed_text||m.text})),learner_rows:rows.map(m=>({id:m.id,stage:m.stage,text:m.confirmed_text})),stage_evidence:Object.fromEntries(s.stages.map(st=>[st,{learner_turns:rows.filter(m=>m.stage===st).length,flow_completed:!!s.stage_completion[st]}])),completed_stages:Object.keys(s.stage_completion),transcript_only:evaluation};
}
async function save(s){s.updated=now();await call('session.save',{session:decorate(s)});}
function create(values){const part=values.part,mode=values.mode;if(!['intro','exchange','roleplay','full'].includes(part)||!['practice','simulation'].includes(mode))throw Error('请选择练习 / Choisissez un exercice.');const prep=mode==='simulation'&&part==='full';return {id:id(),created:now(),updated:now(),mode,part,stages:part==='full'?Object.keys(bank.stages):[part],stage_index:0,phase:prep?'preparation':'active',prep_until:prep?now()+600:null,stage_started:prep?null:now(),scene:structuredClone(bank.scenes.find(s=>s.id===values.scene)||shuffled(bank.scenes)[0]),keywords:shuffled(bank.keywords).slice(0,6),keyword_index:0,messages:[],checks:[],events:[],ended:null,provider_verified:true,recognition_mode:'independent_fr',confirm_transcript:false,exchange_done:[],stage_completion:{},intro_questions:shuffled(bank.intro).slice(0,6).map(([topic,,questions])=>({topic,question:shuffled(questions)[0]})),bank_version:bank.version};}
function provider(state){return {...state,status:state.status==='connected'?'ready':state.status==='waiting'?'binding':state.status};}
class LocalChannel {
 constructor(){this.readyState=0;this.bufferedAmount=0;this.queue=Promise.resolve();this.session=null;this.cursor=0;this.audioEpoch=1;this.closed=false;this.inFlight=null;this.evaluation=null;setTimeout(async()=>{try{this.cursor=(await call('events',{after:Number.MAX_SAFE_INTEGER})).cursor;if(this.closed)return;this.readyState=1;this.emit('welcome');this.loop();}catch(e){if(!this.closed)this.onerror?.(e);}},0);}
 emit(type,values={}){if(!this.closed)this.onmessage?.({data:JSON.stringify({type,...values})});}
 state(state,message){this.emit('state',{state,message});}
 close(){if(this.closed)return;this.closed=true;this.recognizingRow=null;this.readyState=3;if(this.recording&&this.session){const s=this.session;this.queue.then(async()=>{try{const r=await call('record.end');s.messages.push({id:id(),role:'user',stage:stage(s),at:now(),audio:r.audio,seconds:r.duration,text:'',confirmation_status:'cancelled',recognition_status:'cancelled',interrupted:true});await save(s);}catch{}});}call('recognize.cancel').catch(()=>{});call('cancel').catch(()=>{});this.onclose?.();}
 send(data){if(this.closed||this.readyState!==1)throw Error('口语连接已关闭，请重新连接 / Reconnectez la séance.');if(typeof data!=='string'){const bytes=new Uint8Array(data);this.bufferedAmount+=bytes.length;this.queue=this.queue.then(()=>call('record.chunk',{pcm:base64(bytes)})).catch(e=>this.emit('error',{message:e.message})).finally(()=>{this.bufferedAmount-=bytes.length;});return;}
  const command=JSON.parse(data);this.queue=this.queue.then(async()=>{try{await this.action(command);this.emit('ack',{request:command.request,session:this.session?decorate(this.session):undefined});}catch(e){this.emit('error',{request:command.request,message:e.message});}});
 }
 async update(){if(this.session){await save(this.session);this.emit('session',{session:decorate(this.session)});}}
 async suspend(){
  const s=this.session;if(!s||s.ended)return;
  this.recognizingRow=null;await call('background');this.suspended=true;this.recording=null;this.inFlight=null;
  for(const row of s.messages)if(row.recognition_status==='pending'){row.recognition_status='cancelled';row.confirmation_status='cancelled';row.interrupted=true;}
  if(s.awaiting_confirmation){const row=s.messages.find(m=>m.id===s.awaiting_confirmation);if(row?.recognition_status!=='done')delete s.awaiting_confirmation;}
  this.audioEpoch++;this.emit('clear_audio',{epoch:this.audioEpoch});
  await save(s);this.session=await call('session.get',{id:s.id});
  this.emit('session',{session:decorate(this.session)});this.state('stopped','内容已保留，点击继续 / Séance conservée.');
 }
 async foreground(){
  await call('resume');const s=this.session;if(!s||s.ended)return;
  const status=await call('status');
  if(this.suspended||this.recording&&status.recording!=='recording'){
   this.suspended=false;this.recording=null;this.inFlight=null;
   await save(s);this.session=await call('session.get',{id:s.id});
   this.emit('session',{session:decorate(this.session)});this.state('stopped','内容已保留，点击继续 / Séance conservée.');
  }
 }
 async connectExaminer(s){
  const current=await call('status');if(this.connectionSession===s.id&&current.provider.status==='connected')return;
  if(current.provider.status==='connected'&&current.provider.hasTask===false&&!current.provider.busy){this.connectionSession=s.id;return;}
  this.connectionSession=null;this.state('waiting','正在建立口语会话 / Ouverture de la séance…');
  await call('binding.reconnect');const until=Date.now()+28000;
  while(Date.now()<until){
   if(this.closed||document.hidden)throw Error('连接已暂停，内容已保留 / Connexion suspendue.');
   const value=(await call('status')).provider;
   if(value.status==='connected'){this.connectionSession=s.id;return;}
   if(['failed','expired','waiting','unbound'].includes(value.status))throw Error(value.message||'请检查考官连接 / Vérifiez la connexion.');
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw Error('连接等待超时，内容已保留，请点继续重试 / Connexion expirée, séance conservée.');
 }
 async control(){const s=this.session;try{
  await this.connectExaminer(s);if(this.closed||document.hidden)throw Error('连接已暂停，内容已保留 / Connexion suspendue.');
  this.inFlight={turn:task(s),row:[...s.messages].reverse().find(m=>accepted(m)&&m.stage===stage(s))?.id};s.events.push({type:'request_pending',at:now(),turn:this.inFlight.turn.turn_id});await this.update();this.state('waiting','考官正在思考 / L’examinateur réfléchit…');
  const row=s.messages.find(m=>m.id===this.inFlight.row);
  const text=(row?'继续':s.mode==='simulation'?'模拟':'陪练')+bank.stages[stage(s)].name;
  const turn=this.inFlight.turn.turn_id;await call('send',{task:this.inFlight.turn,text});s.events.push({type:'request_submitted',at:now(),turn});await this.update();
 }catch(e){s.events.push({type:'send_failed',turn:this.inFlight?.turn.turn_id,at:now()});this.inFlight=null;this.connectionSession=null;await this.update();this.state('stopped',e.message);throw e;}}
 async openStage(){
  const s=this.session;if(stage(s)==='intro'){await this.control();return;}
  try{await this.connectExaminer(s);await this.update();this.state('idle',stage(s)==='exchange'?'轮到你提问 / À vous de poser une question.':'可以先打招呼 / Vous pouvez saluer l’examinateur.');}
  catch(e){this.connectionSession=null;this.state('stopped',e.message);throw e;}
 }
 async action(a){let s=this.session;
  if(a.action==='start'){if(s&&s.phase!=='ended')throw Error('请先结束当前练习 / Terminez la séance actuelle.');if(this.evaluation?.evaluation?.status==='pending')throw Error('请等待本次点评结束 / Attendez l’évaluation.');const status=await call('status');if(!status.model.ready||status.recognizer?.ready===false||status.provider.status!=='connected')throw Error('请先完成口语准备 / Terminez la préparation.');this.session=s=create(a);await this.update();if(s.phase==='active')await this.openStage();else this.state('idle','准备好后开始口试 / Préparez-vous.');return;}
  if(a.action==='restore'){this.session=s=await call('session.get',{id:a.id});s.confirm_transcript=false;for(const row of s.messages){if(row.recognition_status==='pending'){row.recognition_status='failed';row.confirmation_status='not_sent';row.recognition_error='上次识别被中断，请重新录音 / Réenregistrez cette réponse.';}if(row.id===s.awaiting_confirmation&&row.recognition_status==='done'&&row.text?.trim()){row.confirmed_text=row.revisions?.at(-1)?.text||row.text;row.confirmation_status='automatic';row.submission_source='restored_transcript';}if(accepted(row)&&!row.reply_delivered)row.delivery_uncertain=true;}delete s.awaiting_confirmation;if(s.evaluation?.status==='pending')s.evaluation={status:'error',message:'上次评价未完成，可重新生成 / Réessayez l’évaluation.'};if(s.ended)throw Error('本次练习已结束 / Séance terminée.');this.inFlight=null;this.state('stopped','练习已恢复，点击继续 / Séance restaurée.');await this.update();return;}
  if(!s||s.ended)throw Error('当前没有练习 / Aucune séance active.');
  if(this.recognizingRow&&['prepare_record','record_start','next','keyword','select_keyword','resume'].includes(a.action))throw Error('正在识别，请等待或点停止 / Attendez la transcription ou arrêtez-la.');
  if(a.action==='prepare_record'){
   if(s.phase!=='active'||progress(s).completed)throw Error('请先开始或切换练习环节 / Choisissez une partie active.');
   if(s.awaiting_confirmation||this.recording)throw Error('请先完成当前发言 / Terminez le tour actuel.');
   const status=await call('status');if(!status.model.ready||['recognizing','cancelling'].includes(status.recording))throw Error(status.recording==='cancelling'?'上一段识别正在停止，请稍候 / Arrêt de la transcription…':'请等待识别模型就绪 / Attendez le modèle.');
   const pending=this.inFlight;if(pending||status.provider.busy){this.inFlight=null;this.connectionSession=null;await call('cancel');s.events.push({type:'reply_interrupted_by_learner',at:now(),turn:pending?.turn.turn_id});}
   this.audioEpoch++;this.emit('clear_audio',{epoch:this.audioEpoch});
   await this.connectExaminer(s);await this.update();this.state('idle','可以开始说话 / Vous pouvez parler.');return;
  }
  if(a.action==='record_start'){if(s.awaiting_confirmation||this.inFlight)throw Error('请先完成当前发言 / Terminez le tour actuel.');const result=await call('record.begin',{session:s.id,stage:stage(s)});this.recording=result.audio;this.state('recording','正在录音 / Enregistrement…');return;}
  if(a.action==='record_stop'){const recording=await call('record.end');this.recording=null;const row={id:recording.row||id(),native_recording:true,role:'user',stage:stage(s),at:now(),audio:recording.audio,seconds:recording.duration,text:'',original_asr:'',recognition_status:'pending',confirmation_status:'pending',card_index:s.keyword_index};s.messages.push(row);await this.update();this.state('recognizing','正在本机识别 / Reconnaissance sur cet appareil…');this.recognize(row).catch(e=>this.emit('error',{message:e.message}));return;}
  if(a.action==='confirm_transcript')throw Error('识别文字自动发送 / Envoi automatique.');
  if(a.action==='retry_recognition'){this.recognizingRow=null;await call('recognize.cancel');const row=s.messages.find(m=>m.id===s.awaiting_confirmation);if(row)row.confirmation_status='cancelled';delete s.awaiting_confirmation;await this.update();this.state('idle','原录音已保留，可以重新录音 / Vous pouvez réenregistrer.');return;}
  if(a.action==='abort'||a.action==='end'){this.recognizingRow=null;await call('recognize.cancel');if(this.recording){try{const r=await call('record.end');s.messages.push({id:r.row||id(),role:'user',stage:stage(s),audio:r.audio,seconds:r.duration,at:now(),text:'',confirmation_status:'cancelled',recognition_status:'cancelled'});}finally{this.recording=null;}}await call('cancel');this.inFlight=null;for(const row of s.messages)if(row.recognition_status==='pending'){row.recognition_status='cancelled';row.confirmation_status='cancelled';}if(s.awaiting_confirmation){const row=s.messages.find(m=>m.id===s.awaiting_confirmation);if(row)row.confirmation_status='cancelled';delete s.awaiting_confirmation;}this.audioEpoch++;this.emit('clear_audio',{epoch:this.audioEpoch});if(a.action==='end'){s.phase='ended';s.ended=now();}await this.update();this.state('stopped','本次内容已保存 / Séance enregistrée.');if(a.action==='end')this.evaluate(s).catch(e=>this.emit('notice',{message:e.message}));return;}
  if(a.action==='checks'){s.checks=(a.checks||[]).filter(c=>s.scene.checks.includes(c));await this.update();return;}
  if(this.inFlight||s.awaiting_confirmation)throw Error('请先完成当前发言 / Terminez le tour actuel.');
  if(a.action==='next'){if(s.phase==='preparation')s.phase='active';else if(s.stage_index<s.stages.length-1)s.stage_index++;else throw Error('已经是最后一个环节 / Dernière partie.');s.stage_started=now();await this.openStage();return;}
  if(a.action==='keyword'||a.action==='select_keyword'){if(stage(s)!=='exchange')throw Error('当前不在信息交换 / Partie différente.');const index=a.action==='select_keyword'?a.index:s.keywords.findIndex((_,i)=>i!==s.keyword_index&&!s.exchange_done.includes(i));if(!Number.isInteger(index)||index<0||index>=s.keywords.length)throw Error('没有其他待练词卡 / Aucune autre carte.');s.keyword_index=index;await this.openStage();return;}
  if(a.action==='resume'){this.connectionSession=null;await this.control();return;}
  throw Error('请使用录音回答 / Répondez au microphone.');
 }
 async recognize(row){
  const session=this.session;this.recognizingRow=row.id;
  const current=()=>!this.closed&&!this.suspended&&this.session===session&&!session.ended&&this.recognizingRow===row.id&&row.confirmation_status!=='cancelled';
  let result;
  try{
   const job=await call('recognize',{audio:row.audio}),started=performance.now();let shown='';
   while(current()){
    result=await call('job',{id:job.job});if(!current())return;
    if(result.state!=='running')break;
    if(performance.now()-started>(job.timeoutMs||600000)+5000){await call('recognize.cancel');throw Error('识别用时过长，已停止，原录音保留 / Reconnaissance trop longue, audio conservé.');}
    const seconds=Math.floor((result.elapsedMs||performance.now()-started)/1000),phase=result.phase==='loading'?'正在加载模型 / Chargement du modèle':result.phase==='finishing'?'正在整理文字 / Finalisation':'正在本机识别 / Transcription locale';
    const message=`${phase} · ${seconds}s${result.percent>0?' · '+result.percent+'%':''}`;
    if(message!==shown){shown=message;this.state('recognizing',message);}
    await new Promise(resolve=>setTimeout(resolve,120));
   }
  }catch(error){result={state:'failed',error:error.message};}
  if(!current())return;
  this.queue=this.queue.then(async()=>{
   if(!current())return;this.recognizingRow=null;delete session.awaiting_confirmation;
   if(result?.state==='done'&&result.text?.trim()){
    row.text=row.original_asr=row.confirmed_text=result.text.trim();row.recognition_status='done';row.confirmation_status='automatic';row.submission_source='local_asr';row.submitted_at=now();
    row.recognition={engine:'whisper.cpp',model:result.model||'whisper-large-v3-french-q5_0',elapsed_ms:result.elapsedMs,model_load_ms:result.modelLoadMs,inference_ms:result.inferenceMs,encoder_ms:result.encoderMs,decoder_ms:result.decoderMs,threads:result.threads,backend:result.backend};await this.update();
    try{await this.control();}catch(error){row.delivery_error=error.message;await this.update();this.emit('notice',{message:error.message});}
   }else{
    row.recognition_status=result?.state==='cancelled'?'cancelled':'failed';row.confirmation_status='not_sent';row.recognition_error=result?.error||'未识别出文字，请重新录音 / Réenregistrez votre réponse.';
    await this.update();this.state('stopped',row.recognition_error);this.emit('notice',{message:row.recognition_error});
   }
  });
  await this.queue;
 }
 async evaluate(s){if(!s.messages.some(accepted)){s.evaluation={status:'error',message:'本次没有有效发言，无法生成评价 / Aucune réponse disponible.'};await save(s);return;}if(this.inFlight||this.evaluation?.evaluation?.status==='pending')throw Error('请先等考官结束 / Attendez la fin du tour.');const t=task(s,true);s.evaluation={status:'pending',request_id:t.turn_id};this.evaluation=s;await save(s);try{await call('send',{task:t,text:'请读取本次评价任务，调用工具提交中文点评、表达改写和练习建议。'});}catch(e){s.evaluation={status:'error',message:e.message};this.evaluation=null;await save(s);throw e;}this.evalDeadline=setTimeout(async()=>{if(s.evaluation.status==='pending'){s.evaluation={status:'error',message:'未收到结构化点评，请检查考官配置后重试 / Évaluation non reçue.'};if(this.evaluation===s)this.evaluation=null;await save(s);}},95000);}
 async loop(){let failures=0;while(!this.closed){
  try{
   const batch=await call('events',{after:this.cursor});if(this.closed)return;failures=0;
   for(const e of batch.events){
    this.cursor=e.seq;if(e.type==='notice'){this.emit('notice',{message:e.message});continue;}
    if(e.type==='task_read'&&this.inFlight?.turn.turn_id===e.turn&&this.session){this.session.events.push({type:'task_read',at:now(),turn:e.turn});this.state('waiting','题卡已同步，等待考官回复 / Tâche reçue, réponse en cours…');}
    if(e.type==='error'){this.connectionSession=null;if(this.session){this.session.events.push({type:'service_error',at:now(),message:e.message});await save(this.session);}}
    if(e.type==='turn_end'&&e.cancelled){await this.cancelled();continue;}await this.event(e);
   }
   this.cursor=batch.cursor;
  }catch(error){if(this.closed)return;if(++failures===1)this.emit('notice',{message:error.message});if(failures>=3){this.close();return;}}
  await new Promise(resolve=>setTimeout(resolve,failures?1000:120));
 }}
 async cancelled(){
  if(this.inFlight&&this.session){this.session.events.push({type:'request_interrupted',at:now(),turn:this.inFlight.turn.turn_id});this.inFlight=null;await this.update();this.state('stopped','内容已保留，点击继续 / Séance conservée.');}
 }
 async event(e){const s=this.session;if(e.type==='provider'){if(e.status!=='connected'&&this.inFlight&&s){s.events.push({type:'connection_interrupted',at:now(),turn:this.inFlight.turn.turn_id});this.inFlight=null;await this.update();this.state('stopped','连接中断，已有内容保留 / Séance conservée.');}parent.postMessage({type:'qihang-oral-native-state'},location.origin);return;}if(e.type==='audio'){if(this.evaluation)return;const bytes=unbase64(e.pcm);if(this.lastRate!==e.rate){this.lastRate=e.rate;this.emit('audio_format',{rate:e.rate,epoch:this.audioEpoch});}const out=new Uint8Array(bytes.length+4);new DataView(out.buffer).setUint32(0,this.audioEpoch,true);out.set(bytes,4);this.onmessage?.({data:out.buffer});return;}if(e.type==='sentence'&&s&&!this.evaluation){s.messages.push({id:id(),role:'assistant',text:e.text,stage:stage(s),at:now(),request_id:this.inFlight?.turn.turn_id});await this.update();}if(e.type==='reply_recording'){const target=this.evaluation||s;if(target){const row=[...target.messages].reverse().find(m=>m.role==='assistant'&&m.request_id===e.turn);if(row){row.audio=e.audio;await save(target);}}}if(e.type==='speaking')this.state('speaking','考官正在说话 / L’examinateur parle…');if(e.type==='turn_end'&&s){if(this.inFlight){const row=s.messages.find(m=>m.id===this.inFlight.row);if(row&&!row.reply_delivered){row.reply_delivered=true;if(stage(s)==='exchange'&&question(row.confirmed_text)){if(!s.exchange_done.includes(row.card_index))s.exchange_done.push(row.card_index);const next=s.keywords.findIndex((_,i)=>!s.exchange_done.includes(i));if(next>=0)s.keyword_index=next;}}const p=progress(s);if(p.closing)s.stage_completion[stage(s)]={at:now(),reason:p.reason};this.inFlight=null;await this.update();}this.state(s.progress?.completed?'stage_complete':'idle','轮到你了 / À vous.');}if(e.type==='evaluation'&&this.evaluation&&this.evaluation.evaluation.request_id===e.request_id){clearTimeout(this.evalDeadline);this.evaluation.evaluation={status:'ready',report:e.result,created:now()};await save(this.evaluation);this.evaluation=null;}if(e.type==='error'){if(this.evaluation?.evaluation?.status==='pending'){this.evaluation.evaluation={status:'error',message:e.message};await save(this.evaluation);this.evaluation=null;clearTimeout(this.evalDeadline);}if(this.inFlight&&s){s.events.push({type:'request_interrupted',at:now(),turn:this.inFlight.turn.turn_id});this.inFlight=null;await this.update();}this.state('stopped',e.message||'已有内容保留，可重新连接 / Séance conservée.');this.emit('notice',{message:e.message});}}
}
export function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export function unbase64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function api(path,options={}){const body=options.body?JSON.parse(options.body):{};let value;let match;
 if(path==='/api/bootstrap'){const status=await call('status'),history=await call('session.list');value={provider:provider(status.provider),stages:bank.stages,scenes:bank.scenes,sessions:history.sessions,bank:{intro_questions:42,keywords:48,scenes:12},capabilities:{confirm_transcript:false,independent_fr:true,auto_reply:true},french_asr:{configured:status.model.ready,message:'当前设备本地法语识别 / Reconnaissance sur cet appareil.'}};}
 else if(path==='/api/provider')value=provider((await call('status')).provider);
 else if(path==='/api/bind'){await call('binding.begin');value=provider((await call('status')).provider);}
 else if((match=path.match(/^\/api\/sessions\/([a-z0-9-]+)\/evaluation$/i))){const s=await call('session.get',{id:match[1]});if(!activeChannel)activeChannel=new LocalChannel();await activeChannel.evaluate(s);value=s;}
 else if((match=path.match(/^\/api\/sessions\/([a-z0-9-]+)\/revision$/i)))throw Error('练习记录不可修改 / Historique en lecture seule.');
 else if((match=path.match(/^\/api\/sessions\/([a-z0-9-]+)$/i)))value=await call('session.get',{id:match[1]});
 else throw Error('此操作不可用 / Action indisponible.');
 return {ok:true,json:async()=>value};
}
window.QihangOralClient={local:true,fetch:api,createSocket(){if(activeChannel&&!activeChannel.closed)activeChannel.close();activeChannel=new LocalChannel();return activeChannel;},workletURL:new URL('capture.js',location.href).href,async setAudio(player,path){const id=path.split('/').at(-1).replace(/\.wav$/,'');const r=await call('audio.read',{id});if(player.dataset.blob)URL.revokeObjectURL(player.dataset.blob);const url=URL.createObjectURL(new Blob([unbase64(r.data)],{type:'audio/wav'}));player.src=url;player.dataset.blob=url;player.dataset.recordingSource=path;},connectionFailed(message){parent.postMessage({type:'qihang-oral-error',message},location.origin);},async offlineBootstrap(){return {provider:{status:'offline',message:'请完成口语准备 / Préparez le mode oral.'},stages:bank.stages,scenes:bank.scenes};},async exportSession(id){const a=await call('session.export',{id});parent.postMessage({type:'qihang-oral-export-archive',name:a.name,data:a.data},location.origin);}};
document.addEventListener('visibilitychange',()=>{
 const channel=activeChannel;
 if(channel&&!channel.closed)channel.queue=channel.queue.then(()=>document.hidden?channel.suspend():channel.foreground()).catch(e=>channel.emit('notice',{message:e.message}));
 else if(!document.hidden)call('resume').catch(()=>{});
});

document.addEventListener('click',event=>{const link=event.target.closest?.('a[target="_blank"]');if(link?.href?.startsWith('https://')){event.preventDefault();parent.postMessage({type:'qihang-oral-link',url:link.href},location.origin);}});
