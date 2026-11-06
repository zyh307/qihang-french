'use strict';
const $ = id => document.getElementById(id);
const S = {boot: null, socket: null, session: null, review: null, state: 'idle', pending: new Map(),
  epoch: 0, rate: 24000, context: null, sources: new Set(), playUntil: 0, audioBacklog: [], audioBacklogBytes: 0, audioRecovering: false,
  stream: null, inputContext: null, capture: null, micBusy: false, captureEpoch: 0, polling: null, actionBusy: false,
  micStats:null, revisionTarget:null, localReviews:new Set(),recognitionChosen:false,evaluationTimer:null};
const delf=window.QihangDelf;
const stageNames = {intro:'引导问答', exchange:'信息交换', roleplay:'情景对话', full:'完整练习'};
if(delf)for(const [key,part] of Object.entries(delf.parts))stageNames[key]=part.name;
const hintTexts = {intro:'可以从姓名、居住地、学习和爱好说起。用你会的短句即可，不需要背一篇长介绍。',
  exchange:'观察关键词，选择你会的疑问句。你可以询问对方的情况，考官会回答你。',
  roleplay:'先打招呼，再说明你需要什么。需要时询问价格或请对方重复，最后礼貌告别。'};
function node(tag, text, cls) { const e = document.createElement(tag); if(text !== undefined) e.textContent = text; if(cls) e.className = cls; return e; }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').setAttribute('role','alert');$('notice').setAttribute('aria-live','polite'); }
function show(view) {
  if(window.parent!==window)window.parent.postMessage({type:'qihang-oral-view',home:view==='home'},location.origin);
  clearTimeout(S.evaluationTimer);
  for (const id of ['home','practice','history','review']) $(id).hidden = id !== view;
  $('navPractice').classList.toggle('active', view === 'home' || view === 'practice');
  $('navHistory').classList.toggle('active', view === 'history' || view === 'review');
}
async function api(path, body) {
  const options = body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-Oral-Client':'web'}, body:JSON.stringify(body)};
  const response = await (window.QihangOralClient?window.QihangOralClient.fetch(path,options):fetch(path,options)); const data = await response.json();
  if(!response.ok) throw Error(data.error || '操作失败，请重试'); return data;
}
function setRecording(player,path){if(window.QihangOralClient)window.QihangOralClient.setAudio(player,path).catch(error=>notice(error.message));else player.src=path;}
function providerView(data) {
  const ready = data.status === 'ready';
  const connection=document.querySelector('.connection');if(connection)connection.hidden=!!window.QihangOralClient?.local&&ready;
  $('bindingMessage').textContent = data.message;
  $('connectionDot').classList.toggle('ready', ready);
  $('connectionLabel').textContent = ready ? '绑定就绪' : data.status === 'binding' ? '等待绑定' : '尚未连接';
  $('bindingCode').hidden = data.status !== 'binding'; $('codeValue').textContent = data.code || '';
  $('bind').textContent = ready ? '刷新连接' : data.status === 'binding' ? '等待绑定…' : '连接小智';
  $('bind').disabled = data.status === 'binding';
  for (const b of document.querySelectorAll('[data-part],#full')) b.disabled = false;
  $('bind').disabled=data.status==='unconfigured'||data.status==='offline'||data.status==='binding';
}
async function refresh() {
  S.boot = await api('/api/bootstrap');providerView(S.boot.provider);
  if(S.boot.bank)$('bankInfo').textContent=`${S.boot.bank.intro_questions}个问句 · ${S.boot.bank.keywords}张词卡 · ${S.boot.bank.scenes}个情景 · 参考公开样题编写`;
  $('recognitionChoice').hidden=window.QihangOralClient?.local||!S.boot.capabilities?.confirm_transcript;
  const configured=!!S.boot.capabilities?.independent_fr && !!S.boot.french_asr?.configured;
  $('recognizerChoice').hidden=window.QihangOralClient?.local||!configured;
  if(!S.recognitionChosen)$('recognitionMode').value=configured?'independent_fr':'xiaozhi';
  $('recognizerMessage').textContent=S.boot.french_asr?.message||'';
  if(S.boot.advanced)$('levelPicker').hidden=false;
  return S.boot;
}
async function pollProvider() {
  clearTimeout(S.polling);
  try {
    const data = await api('/api/provider'); providerView(data);
    if(S.boot) S.boot.provider = data;
    if(data.status === 'binding') S.polling = setTimeout(pollProvider, 2500);
  } catch(e) { notice(e.message); $('bind').disabled = false; }
}
async function connectSocket() {
  if(S.socket?.readyState === WebSocket.OPEN) return false;
  if(S.socket?.readyState === WebSocket.CONNECTING) throw Error('练习窗口正在连接，请稍候');
  await new Promise((resolve,reject) => {
    const ws = window.QihangOralClient?.createSocket?window.QihangOralClient.createSocket():window.QihangOralClient?new WebSocket(window.QihangOralClient.socketURL(),window.QihangOralClient.socketProtocols()):new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    S.socket = ws; ws.binaryType = 'arraybuffer';
    const timeout = setTimeout(()=>{ws.close();reject(Error('练习窗口连接超时'));}, 10000);
    ws.onmessage = event => {
      if(S.socket!==ws)return;
      if(typeof event.data !== 'string') { playPCM(event.data); return; }
      const data = JSON.parse(event.data);
      if(data.type === 'welcome') {clearTimeout(timeout);resolve();}
      if(data.type === 'session') {S.session=data.session;renderSession();}
      if(data.type === 'record_deadline') S.recordUntil=data.until;
      if(data.type === 'state') {S.state=data.state;$('voiceState').textContent=data.message;if(S.stream && data.state!=='recording') stopCapture(false);updateButtons();}
      if(data.type === 'audio_format') {S.rate=data.rate;S.epoch=data.epoch;}
      if(data.type === 'clear_audio') {stopPlayback();S.epoch=data.epoch;}
      if(data.type === 'notice') notice(data.message);
      if(data.type === 'error') {
        notice(data.message);
        if(data.request && S.pending.has(data.request)) {
          const p=S.pending.get(data.request);clearTimeout(p.timer);p.reject(Error(data.message));S.pending.delete(data.request);
        }
        if(S.stream) stopCapture(false);
        updateButtons();
      }
      if(data.type === 'ack') {
        if(data.session) {S.session=data.session;renderSession();}
        const p=S.pending.get(data.request);
        if(p) {clearTimeout(p.timer);p.resolve(data);S.pending.delete(data.request);}
      }
    };
    ws.onerror = ()=>{clearTimeout(timeout);reject(Error('口语连接未成功，请重新打开应用 / Rouvrez l’application.'));ws.close();};
    ws.onclose = ()=>{
      clearTimeout(timeout);reject(Error('练习连接已关闭'));
      if(S.socket !== ws) return;
      S.state='disconnected';stopCapture(false);stopPlayback();
      for(const p of S.pending.values()) {clearTimeout(p.timer);p.reject(Error('连接已断开，已有记录保留'));} S.pending.clear();
      $('voiceState').textContent='本机连接已断开，返回练习页重新打开即可';updateButtons();
    };
  });
  return true;
}
function send(action, values={}) {
  return new Promise((resolve,reject)=>{
    if(S.socket?.readyState !== WebSocket.OPEN) {reject(Error('练习连接未就绪，请返回练习页重试'));return;}
    const request=crypto.randomUUID();
    const timer=setTimeout(()=>{S.pending.delete(request);reject(Error('操作等待超时，请检查连接后重试'));},35000);
    S.pending.set(request,{resolve,reject,timer});
    try{S.socket.send(JSON.stringify({action,request,...values}));}catch(error){clearTimeout(timer);S.pending.delete(request);reject(error);}
  });
}
async function action(fn) {
  if(S.actionBusy) return;
  S.actionBusy=true;updateButtons();notice('');
  try {await fn();} catch(e) {notice(e.message);} finally {S.actionBusy=false;updateButtons();}
}
async function ensureAudio() {
  if(!S.context || S.context.state === 'closed') S.context=new AudioContext();
  await S.context.resume();
}
function stopPlayback() {for(const source of S.sources) {try{source.stop();}catch{}} S.sources.clear();S.playUntil=0;S.audioBacklog=[];S.audioBacklogBytes=0;if($('resumeAudio'))$('resumeAudio').hidden=true;}
function drainAudio(){if(S.context?.state!=='running')return;const pending=S.audioBacklog;S.audioBacklog=[];S.audioBacklogBytes=0;if($('resumeAudio'))$('resumeAudio').hidden=true;for(const data of pending)playPCM(data);}
function playPCM(data) {
  const view=new DataView(data);if(data.byteLength<6 || view.getUint32(0,true)!==S.epoch || !$('lastAudio').paused) return;
  if(!S.context || S.context.state !== 'running') {
    if(S.audioBacklogBytes+data.byteLength>S.rate*2*40){stopPlayback();notice('语音未能播放，可在记录中回听 / Réécoutez la réponse dans l’historique.');return;}
    S.audioBacklog.push(data.slice(0));S.audioBacklogBytes+=data.byteLength;if($('resumeAudio'))$('resumeAudio').hidden=false;
    if(!S.audioRecovering){S.audioRecovering=true;ensureAudio().then(()=>{drainAudio();if(S.context?.state!=='running')notice('点按“播放考官语音” / Appuyez sur Écouter.');}).catch(()=>notice('点按“播放考官语音” / Appuyez sur Écouter.')).finally(()=>{S.audioRecovering=false;});}return;
  }
  const samples=new Int16Array(data,4);const buffer=S.context.createBuffer(1,samples.length,S.rate);const out=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++) out[i]=samples[i]/32768;
  if(S.playUntil-S.context.currentTime>40) {stopPlayback();notice('播放积压，已停止；请点击“继续本环节”重连');return;}
  const source=S.context.createBufferSource();source.buffer=buffer;source.connect(S.context.destination);
  const at=Math.max(S.context.currentTime+.03,S.playUntil);source.start(at);S.playUntil=at+buffer.duration;S.sources.add(source);
  source.onended=()=>{S.sources.delete(source);updateButtons();};updateButtons();
}
function playing() {return S.sources.size>0 || !$('lastAudio').paused;}
function updateButtons() {
  const active=S.session?.phase==='active' && !S.session?.progress?.completed;
  const recording=!!S.stream;
  const confirming=!!S.session?.awaiting_confirmation;
  const local=!!window.QihangOralClient?.local;
  const channelReady=S.socket?.readyState===WebSocket.OPEN;
  const exam=delf?.isAdvanced(S.session), deadline=exam?delf.examClock(S.session):null;
  const canCapture=exam?['idle','stopped'].includes(S.state)&&!playing()&&(!deadline||Date.now()/1000<deadline||S.session.finish_round?.answer_due):local?!['recognizing','confirming'].includes(S.state):S.state==='idle'&&!playing();
  $('mic').disabled=!active || confirming || S.actionBusy || S.micBusy || (!recording&&!canCapture);
  const label=recording?'我说完了':S.micBusy?'正在开启麦克风':!S.session?'请先开始练习':S.session?.phase==='preparation'?'请先结束准备':S.session?.phase==='ended'?'练习已结束':S.session?.progress?.completed?'本环节已完成':confirming?'请先确认文字':S.state==='recognizing'?'正在识别':exam&&!recording&&playing()?'请听考官说完':S.actionBusy?'正在连接考官':!channelReady?'重新连接并说话':local&&(playing()||S.state==='speaking')?'打断并说话':'开始说话';
  $('mic').classList.toggle('recording',recording);$('micLabel').textContent=label;$('mic').setAttribute('aria-label',label);$('mic').title=label;
  $('sendText').disabled=!active || S.actionBusy || recording || S.state!=='idle' || playing();
  for(const id of ['nextStage','finishPrep','nextKeyword','resume']) $(id).disabled=S.actionBusy || recording || confirming || S.state==='recognizing';
  $('confirmSpeech').disabled=S.actionBusy || !confirming || !$('confirmedTranscript').value.trim();
  $('retrySpeech').disabled=S.actionBusy || !confirming;
  for(const id of ['abort','finish','endTop']) $(id).disabled=S.actionBusy || !S.session || S.session.phase==='ended';
  for(const b of document.querySelectorAll('[data-card-index]'))b.disabled=S.actionBusy||recording||confirming||S.state!=='idle';
  $('nextKeyword').disabled=S.actionBusy||recording||confirming||S.state!=='idle';
  if(exam){
    const s=S.session;
    $('delfConfirm').disabled=S.actionBusy||delf.choiceKeys(s).some(part=>!s.chosen[part]);
    $('nextStage').disabled=S.actionBusy||recording||S.micBusy||!['idle','stopped'].includes(S.state)||playing()||!s.progress.can_advance;
  }
  $('viewExample').disabled=S.actionBusy||recording||playing()||!['idle','stage_complete','stopped'].includes(S.state);
}

const guideCopy={
 intro:{steps:['考官向你提问，你回答自己的姓名、居住地、学习、家庭和爱好。','听不懂可以请求重复；每次只回答当前问题。']},
 exchange:{steps:['一次拿到6张关键词卡，六张卡会同时显示。','你围绕每张卡的主题主动问一个问题，考官简短回答；不必逐字使用卡上的词。','答完一张后自动记录进度并切到下一张。请求重复不算完成；也可点击卡片自选顺序。'],ending:'参考约2分钟，六张词卡逐一交流后收尾。这里是你提问，考官不会连续反问你。'},
 roleplay:{steps:['先读情景和价格材料，明确你要买什么或预订什么。','你扮演顾客，与考官完成询价、数量、确认和结账等交流。','完成事情后礼貌告别，例如“Merci, au revoir”。'],ending:'参考约2分钟。完成交易并告别，或完成本次练习的交流轮次后，考官和网页会明确提示结束。'}
};
function closeGuide(){const v=$('guideVideo');v.pause();v.removeAttribute('src');v.load();$('guideDialog').close();}
function showGuideStage(stage){
  if(S.guidePart!=='full'&&!S.guideResume)S.guidePart=stage;
  const copy=guideCopy[stage];$('guideTitle').textContent=stageNames[stage];
  const media=S.boot?.examples?.[stage];const v=$('guideVideo');v.pause();v.removeAttribute('src');v.removeAttribute('poster');v.hidden=!media?.video;
  if(media?.poster){if(window.QihangOralClient)window.QihangOralClient.mediaURL(`/examples/${stage}.jpg`).then(url=>v.poster=url).catch(()=>{});else v.poster=`/examples/${stage}.jpg`;}
  if(media?.video){if(window.QihangOralClient)window.QihangOralClient.mediaURL(`/examples/${stage}.mp4`).then(url=>{v.src=url;v.load();}).catch(()=>{});else v.src=`/examples/${stage}.mp4`;}
  v.load();$('guideVideoError').hidden=!!media?.video;$('guideVideoError').textContent=media?.video?'视频暂时无法播放，可打开原视频；也可以直接练习。':'观看示范可打开下方原视频链接，也可以直接练习。';
  $('guideSteps').replaceChildren(...copy.steps.map(x=>node('li',x)));$('guideEnding').textContent=copy.ending||'';$('guideEnding').parentElement.hidden=!copy.ending;
  $('guideTabs').replaceChildren();for(const key of Object.keys(guideCopy)){const b=node('button',stageNames[key],'guide-tab'+(key===stage?' active':''));b.type='button';b.onclick=()=>showGuideStage(key);$('guideTabs').append(b);}
}
function openGuide(part,resume=false){
  S.guidePart=part;S.guideResume=resume;showGuideStage(part==='full'?'intro':part);
  $('guideStart').disabled=!resume&&S.boot?.provider?.status!=='ready';
  $('guideStart').textContent=resume?'返回练习 · Reprendre':S.boot?.provider?.status==='ready'?'开始练习 · Commencer':'请先连接考官 · Connectez l’examinateur';
  const example=$('guideDialog').querySelector('.guide-example');if(example)example.open=false;
  $('guideDialog').showModal();
}
function renderProgress(){
 const s=S.session;if(!s||s.phase==='ended')return;const stage=s.stages[s.stage_index];
 if(delf?.isAdvanced(s)){
   if(s.phase!=='active')return;
   const left=Math.max(0,Math.ceil(s.stage_until-(s.solo_processing_at||Date.now()/1000)));
   $('remainingTime').textContent=s.mode==='practice'?formatTime(Math.max(0,Math.floor(Date.now()/1000-s.stage_started))):formatTime(left);
   $('stageMessage').textContent=S.state==='recognizing'?'正在转写已保存的发言。':s.mode==='simulation'&&left===0?'时间已到，完成当前一轮交流后收尾。':delf.parts[stage].hint;
   $('nextStage').hidden=s.stage_index===s.stages.length-1||s.mode==='simulation';
   return;
 }
 const p=s.progress||{};const target=p.target_seconds||({intro:90,exchange:120,roleplay:120}[stage]);
 const seconds=Math.max(0,Math.floor(Date.now()/1000-(s.stage_started||s.created)));const left=Math.max(0,target-seconds);
 $('stageStatus').hidden=s.phase==='preparation';$('stageStatus').classList.toggle('complete',!!p.completed);
 $('stageProgress').textContent=p.completed?'本环节已完成':stage==='exchange'?`词卡进度 ${(s.exchange_done||[]).length} / ${s.keywords.length}`:`已完成 ${p.answers||0} 轮回答`;
 $('stageMessage').textContent=p.completed?(s.stage_index<s.stages.length-1?'点击“下一个环节”继续。':'点击“结束并复盘”，回听本次练习。'):stage==='intro'?'先回答姓名和年龄，再交流其他主题；本轮问题答完、考官收尾后结束。':stage==='exchange'?'每张词卡由你问一个问题；六张交流完成后收尾。':'完成任务后礼貌告别，考官会明确收尾。';
 $('targetTime').textContent=p.completed?'已结束':seconds>=target?'参考时长已到':'距参考时长';
 $('remainingTime').textContent=p.completed?'✓':`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
 if(!p.completed&&seconds>=target)$('stageMessage').textContent+=' 参考时间已到，完成当前交流后收尾；不会截断录音。';
}
if(window.QihangShortAudioExperiment&&window.QihangOralClient?.local){
 const label=node('label','短句加速（试验）'),check=node('input');check.type='checkbox';check.id='shortAudioMode';check.checked=window.QihangOralClient.shortAudioEnabled;
 check.onchange=()=>window.QihangOralClient.setShortAudioMode(check.checked);label.append(check);document.querySelector('.mic-options')?.append(label);
 const note=node('p','若识别变差，可关闭短句加速，按完整窗口重新录音。','quiet');label.parentElement?.append(note);
}
function transcript(target, session, audio=false) {
  target.replaceChildren();
  if(!session.messages.length) {const current=session.stages[session.stage_index];target.append(node('div',session.phase==='preparation'?'准备好后，开始和考官交流。':current==='exchange'?'轮到你提问 · À vous de poser une question.':current==='roleplay'?'可以先打招呼 · Vous pouvez commencer.':delf?.openingCue(current)?'由你开始这一环节。':'考官即将和你打招呼…','empty-dialogue'));return;}
  const messages=window.QihangOralClient?.displayMessages?.(session.messages)||session.messages;
  for(const row of messages) {
    const box=node('div',undefined,'bubble'+(row.role==='user'?' user':''));
    box.append(node('div',(row.role==='user'?'你':'Camille')+(audio?' · '+(stageNames[row.stage]||''):''),'who'));
    box.append(node('p',row.text || (row.audio?(row.interrupted?'录音已保存 · 本次发言被中断':['failed','cancelled'].includes(row.recognition_status)?'未识别成功 · 可回听或重新录音':'录音已保存 · 等待识别'):'尚未收到识别文字')));
    if(row.recognition)box.append(node('small','独立法语识别 · 原始转写','revision-note'));
    if(row.recognition&&window.QihangShortAudioExperiment)box.append(node('small',`识别 ${(row.recognition.elapsed_ms/1000).toFixed(1)}秒 · 编码 ${(row.recognition.encoder_ms/1000).toFixed(1)}秒 · 计算窗口 ${((row.recognition.audio_context||1500)/50).toFixed(1)}秒`,'revision-note'));
    if(row.asr_reviews?.length) {
      box.append(node('span','本地法语复核（独立候选）：'+(row.asr_reviews.at(-1).text||'未识别出文字'),'asr-note'));
      box.append(node('small','两种识别都可能出错，请结合原声确认。','asr-note quiet'));
    }
    if(row.revisions?.length) box.append(node('span','你的修订稿：'+row.revisions.at(-1).text,'revision-note'));
    if(row.confirmation_status) box.append(node('small',row.confirmation_status==='automatic'?'本机转写 · 自动回复':row.confirmation_status==='confirmed'?'已由你确认后用于对话':row.confirmation_status==='cancelled'?'此条已放弃，原录音保留':row.confirmation_status==='not_sent'?'尚未发送 · 可重新录音':window.QihangOralClient?.local?'正在本机识别':'等待你确认，考官暂不回复','revision-note'));
    if(row.role==='user' && row.audio && !row.recognition_status && S.boot?.local_asr?.available) {
      const review=node('button',S.localReviews.has(row.id)?'正在本机复核…':row.asr_reviews?.length?'重新复核':'本地法语复核','text-button');
      review.dataset.action='local-review';review.dataset.rowId=row.id;review.disabled=S.localReviews.has(row.id);
      review.onclick=()=>reviewRecording(session.id,row.id,review);box.append(review);
    }
    if(!window.QihangOralClient?.local && row.role==='user' && (row.text || row.audio)) {
      const edit=node('button','识别有误？记一份修订稿','text-button');
      edit.onclick=()=>{S.revisionTarget={sid:session.id,row:row.id};$('originalTranscript').textContent=row.text||'（没有收到识别文字）';$('revisionText').value=row.revisions?.at(-1)?.text||row.asr_reviews?.at(-1)?.text||'';$('revisionDialog').showModal();};
      box.append(edit);
    }
    if(audio && row.audio) {const player=document.createElement('audio');player.controls=true;player.preload='none';setRecording(player,`/api/sessions/${session.id}/audio/${row.audio}`);box.append(player);}
    target.append(box);
  }
  if(!audio) target.scrollTop=target.scrollHeight;
}
async function reviewRecording(sid,row,button) {
  if(S.localReviews.has(row)) return;
  S.localReviews.add(row);button.disabled=true;button.textContent='正在本机复核…';
  try {
    await api(`/api/sessions/${sid}/local-review`,{row});
    if(S.review?.id===sid && !$('review').hidden) await openReview(sid);
    notice('本地复核已单独保存。请回听原声，确认后可记入修订稿。');
  } catch(e) {notice(e.message);}
  finally {
    S.localReviews.delete(row);
    for(const b of document.querySelectorAll('[data-action="local-review"]')) {if(b.dataset.rowId===row){b.disabled=false;if(b.textContent==='正在本机复核…')b.textContent='本地法语复核';}}
  }
}
function renderSession() {
  const session=S.session;if(!session) return;
  if(session.phase==='ended'){
    if(delf?.isAdvanced(session)&&!$('practice').hidden&&!S.actionBusy)openReview(session.id).catch(error=>notice(error.message));
    return;
  }
  show('practice');
  if(delf?.isAdvanced(session)){renderDelf(session);return;}
  $('practiceGrid').classList.remove('delf-live');$('practiceGrid').hidden=false;$('conversation').hidden=false;$('conversation').classList.remove('delf-quiet');$('delfChoice').hidden=true;$('delfCards').hidden=true;
  $('taskDetails').hidden=false;$('currentPrompt').hidden=true;$('transcript').hidden=false;$('micSettings').hidden=false;
  $('abort').hidden=false;$('resume').hidden=false;$('finishPrep').hidden=false;$('finishPrep').textContent='结束准备，开始口试';$('viewExample').hidden=false;$('endTop').textContent='← 结束并保存';
  $('examinerLevel').textContent='你的 A1 法语考官';$('prepInfo').textContent='准备信息交换关键词和情景任务。引导问答无需准备。';
  $('stageStatus').classList.remove('exam-timer');

  const pending=window.QihangOralClient?.local?null:session.messages.find(m=>m.id===session.awaiting_confirmation);
  const form=$('recognitionForm');form.hidden=!pending;
  if(pending && form.dataset.row!==pending.id) {form.dataset.row=pending.id;$('confirmedTranscript').value=pending.revisions?.at(-1)?.text||pending.text||'';}
  const stage=session.stages[session.stage_index];const def=S.boot.stages[stage];
  const details=$('taskDetails');if(details&&details.dataset.stage!==session.id+':'+stage+':'+session.phase){details.dataset.stage=session.id+':'+stage+':'+session.phase;details.open=session.phase==='preparation'||window.matchMedia('(min-width:861px)').matches;}
  const prompt=$('currentPrompt');if(prompt){prompt.hidden=session.phase!=='active'||stage==='intro';prompt.replaceChildren();if(!prompt.hidden)prompt.append(node('span',stage==='exchange'?'当前词卡 · Carte actuelle':'当前任务 · Votre tâche','label'),node('strong',stage==='exchange'?session.keywords[session.keyword_index]:session.scene.task));}
  $('modeTag').textContent=(session.mode==='simulation'?'模拟考试':'陪练')+' · A1';
  $('steps').replaceChildren();
  $('steps').hidden=session.stages.length<2;
  session.stages.forEach((s,i)=>$('steps').append(node('div',`${String(i+1).padStart(2,'0')}  ${stageNames[s]}`,'step'+(i===session.stage_index?' current':i<session.stage_index?' done':''))));
  $('taskEyebrow').textContent=def.fr;$('taskTitle').textContent=session.phase==='preparation'?'准备时间':def.name;$('taskHint').textContent=def.hint;
  $('prep').hidden=session.phase!=='preparation';
  $('keywords').hidden=stage!=='exchange' && session.phase!=='preparation';
  $('keyword').textContent=session.phase==='preparation'?session.keywords.join(' · '):session.keywords[session.keyword_index];
  const done=session.exchange_done||[];$('keywordGrid').replaceChildren();
  session.keywords.forEach((word,index)=>{const b=node('button',undefined,'keyword-card'+(index===session.keyword_index?' current':'')+(done.includes(index)?' done':''));b.type='button';b.dataset.cardIndex=index;b.setAttribute('aria-pressed',String(index===session.keyword_index));b.append(node('span',String(index+1).padStart(2,'0')),node('strong',word),node('small',done.includes(index)?'已交流':index===session.keyword_index?'当前词卡':'待交流'));b.onclick=()=>action(()=>send('select_keyword',{index}));$('keywordGrid').append(b);});
  $('keywordProgress').textContent=`已交流 ${done.length} / ${session.keywords.length} 张`;
  $('nextKeyword').hidden=session.phase==='preparation';
  $('sceneCard').hidden=stage!=='roleplay' && session.phase!=='preparation';
  $('sceneTitle').textContent=session.scene.fr;$('sceneTask').textContent=session.scene.task;
  $('materials').replaceChildren();
  for(const item of session.scene.materials) {const row=node('div',undefined,'material');row.append(node('span',item.name),node('span',item.price));$('materials').append(row);}
  $('checks').replaceChildren(node('legend','交流任务 · 自评勾选'));
  for(const text of session.scene.checks) {
    const label=node('label',undefined,'check');const check=document.createElement('input');check.type='checkbox';check.checked=session.checks.includes(text);
    check.disabled=session.phase!=='active';
    check.onchange=()=>action(async()=>{const checks=[...$('checks').querySelectorAll('input:checked')].map(e=>e.nextSibling.textContent);await send('checks',{checks});});
    label.append(check,node('span',text));$('checks').append(label);
  }
  $('showHint').hidden=session.mode==='simulation'||session.phase!=='active';
  $('hintText').textContent=hintTexts[stage];
  $('nextStage').hidden=session.phase==='preparation'||session.stage_index===session.stages.length-1;
  $('finish').hidden=session.phase==='preparation';
  const last=[...session.messages].reverse().find(m=>m.role==='user'&&m.audio);
  $('lastRecording').hidden=!last;
  if(last) {const src=`/api/sessions/${session.id}/audio/${last.audio}`;if(($('lastAudio').dataset.recordingSource||$('lastAudio').getAttribute('src'))!==src)setRecording($('lastAudio'),src);}
  const audioOnly=['intro','roleplay'].includes(stage);
  $('transcript').hidden=audioOnly;$('micSettings').hidden=audioOnly;
  if(audioOnly)$('transcript').replaceChildren();
  if(!audioOnly)transcript($('transcript'),{...session,messages:session.messages.filter(m=>m.stage===stage)});renderProgress();updateButtons();
}
function formatTime(seconds){
  const n=Math.max(0,seconds);
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
function delfCard(card){
  const box=node('article',undefined,'delf-paper');box.lang='fr';
  box.append(node('h3',card.title));
  for(const value of [card.consigne,card.document,card.prompt,card.situation,card.role])if(value)box.append(node('p',value));
  if(card.credit)box.append(node('small',card.credit,'quiet'));
  const link=node('a','Source · France Éducation international ↗','quiet');
  link.href=card.source;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
  return box;
}
function renderDelf(s){
  const stage=delf.currentPart(s),part=delf.parts[stage],spec=delf.exams[s.level];
  const selecting=s.phase==='selecting',preparing=s.phase==='preparation',simulation=s.mode==='simulation';
  $('modeTag').textContent=s.level+' · '+(simulation?'模拟考试':'熟悉流程');
  $('examinerLevel').textContent='DELF '+s.level+' 法语考官';
  $('steps').hidden=false;$('steps').replaceChildren(...s.stages.map((key,index)=>node('div',`${index+1}  ${delf.parts[key].name}`,'step'+(index===s.stage_index&&!preparing?' current':index<s.stage_index?' done':''))));
  $('delfChoice').hidden=!selecting;$('practiceGrid').hidden=selecting;
  $('practiceGrid').classList.toggle('delf-live',simulation&&s.phase==='active');
  $('conversation').hidden=preparing;$('taskDetails').hidden=true;$('currentPrompt').hidden=true;
  $('prep').hidden=!preparing;$('finishPrep').hidden=!preparing;$('finishPrep').textContent='跳过准备，开始口试';
  $('taskEyebrow').textContent=preparing?'PRÉPARATION':part.fr;
  $('taskTitle').textContent=preparing?'准备时间':part.name;
  $('taskHint').textContent=preparing?'只准备下方选定的原题。倒计时结束后进入第一环节。':part.hint;
  $('prepInfo').textContent='可以在纸上记关键词和提纲。';
  $('prepClock').textContent=preparing?formatTime(Math.ceil(s.prep_until-Date.now()/1000)):'';
  $('stageStatus').hidden=preparing||selecting;$('stageStatus').classList.remove('complete');
  $('stageProgress').textContent=part.name;$('targetTime').textContent=simulation?'剩余时间':'本环节已用';
  $('elapsed').textContent='';
  $('showHint').hidden=true;$('hintBox').hidden=true;$('viewExample').hidden=true;
  $('abort').hidden=simulation;$('resume').hidden=false;
  $('micSettings').hidden=simulation;$('transcript').hidden=simulation;
  $('finish').hidden=preparing||selecting||simulation;$('endTop').textContent='← 提前结束并保存';
  $('nextStage').hidden=preparing||selecting||s.stage_index===s.stages.length-1||simulation;
  const screen=`${s.id}:${s.phase}:${stage}`;
  if(S.delfScreen!==screen){S.delfScreen=screen;window.scrollTo(0,0);}
  const key=`${screen}:${Object.values(s.chosen).map(c=>c.id).join(',')}`;
  const choices=$('delfChoiceCards'),cards=$('delfCards');
  if(choices.dataset.renderKey!==key){
    choices.dataset.renderKey=key;
    choices.replaceChildren();cards.replaceChildren();
    if(selecting){
      const initial=s.stage_started===null;
      $('delfChoiceTitle').textContent=initial?'抽两题，选一题':'第二部分 · 现场抽题';
      $('delfChoiceInfo').textContent=initial&&s.level==='A2'?'独白和互动各抽两题，请各选一题。':initial?'阅读两份材料，选择其中一份。':'本环节无准备时间，确认后立即进入互动。';
      for(const key of delf.choiceKeys(s)){
        const group=node('section',undefined,'delf-choice-group');
        group.append(node('h3',delf.parts[key].name));
        const grid=node('div',undefined,'delf-pair');
        for(const card of s.drawn[key]){
          const paper=delfCard(card),selected=s.chosen[key]?.id===card.id;
          paper.classList.toggle('selected',selected);
          const button=node('button',selected?'已选 · Sélectionné':'选这道题 · Choisir','button outline');
          button.type='button';button.setAttribute('aria-pressed',String(selected));
          button.onclick=()=>action(()=>send('choose_card',{part:key,id:card.id}));paper.append(button);grid.append(paper);
        }
        group.append(grid);choices.append(group);
      }
      $('delfConfirm').textContent=initial&&simulation?'确认，开始准备':'确认，开始口试';
    }else{
      const visible=preparing?spec.prepared.map(part=>s.chosen[part]):[delf.currentCard(s)];
      for(const card of visible.filter(Boolean))cards.append(delfCard(card));
      cards.hidden=!cards.children.length;
    }
  }
  $('conversation').classList.toggle('delf-quiet',simulation);
  const last=simulation?null:[...s.messages].reverse().find(m=>m.stage===stage&&m.role==='user'&&m.audio);
  $('lastRecording').hidden=!last;
  if(last){
    const path=`/api/sessions/${s.id}/audio/${last.audio}`;
    if($('lastAudio').dataset.recordingSource!==path)setRecording($('lastAudio'),path);
  }
  if(!simulation)transcript($('transcript'),{...s,messages:s.messages.filter(m=>m.stage===stage)});
  renderProgress();updateButtons();
}
if(delf){
  function selectLevel(level){
    const spec=delf.exams[level];
    for(const button of $('levelPicker').querySelectorAll('[data-level]'))button.setAttribute('aria-pressed',String(button.dataset.level===level));
    $('a1Start').hidden=!!spec;$('delfStart').hidden=!spec;
    document.querySelector('.hero .eyebrow').textContent='DELF · '+level;
    const title=document.querySelector('.hero h1'),description=document.querySelector('.hero p');
    title.textContent=spec?'走进 DELF 口试':'从一句 Bonjour，开始自在表达。';
    description.textContent=spec?'按成人版口试的顺序抽题、准备，与法语考官完成对话。':'和法语考官练习问答、提问与日常对话。每次只专注一段交流。';
    if(!spec)return;
    $('delfBegin').dataset.level=level;
    $('delfTitle').textContent='DELF '+level+' 完整口试';
    $('delfTiming').textContent=`准备 ${spec.prep/60} 分钟 · 口试 ${spec.total}`;
    $('delfOutline').replaceChildren(...spec.stages.map(key=>{
      const part=delf.parts[key];
      const item=node('li');item.append(node('strong',part.name),node('span',delf.timing(level,key)[2]),node('small',part.fr));return item;
    }));
    $('delfInfo').textContent=(level==='A2'?'独白和情景各抽两题选一，合用 10 分钟准备。':level==='B1'?'先抽观点材料，只准备第三部分；第二部分现场抽题。':'两份原文选一，独白和辩论使用同一份材料。')+' 模拟按考试时钟推进。熟悉流程可自行切换环节。';
  }
  for(const button of $('levelPicker').querySelectorAll('[data-level]'))button.onclick=()=>selectLevel(button.dataset.level);
  $('delfBegin').onclick=()=>start('full',$('delfBegin').dataset.level);
  $('delfConfirm').onclick=()=>action(async()=>{await ensureAudio();await send('commit_choices');});
}
async function start(part,level='A1') {if(!S.boot){notice('页面正在连接，请稍候');return;}await action(async()=>{await ensureAudio();await connectSocket();S.state='waiting';await send('start',{part,level,mode:$(level==='A1'?'mode':'delfMode').value,scene:$('scene').value,recognition_mode:$('recognitionMode').value,confirm_transcript:!!S.boot.capabilities?.confirm_transcript && $('confirmRecognition').checked});$('hintBox').hidden=true;});}
function captureCancelled(){const error=Error('录音已取消 / Enregistrement annulé.');error.captureCancelled=true;return error;}
function requestInput(audio,current){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{settled=true;reject(Error('麦克风启动超时，请重试 / Réessayez le microphone.'));},15000);
    navigator.mediaDevices.getUserMedia({audio}).then(stream=>{
      if(settled||!current()){stream.getTracks().forEach(track=>track.stop());if(!settled){settled=true;clearTimeout(timer);reject(captureCancelled());}return;}
      settled=true;clearTimeout(timer);resolve(stream);
    },error=>{if(!settled){settled=true;clearTimeout(timer);reject(current()?error:captureCancelled());}});
  });
}
async function openMicrophone(device,current){
  try{return await requestInput({channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(device?{deviceId:{exact:device}}:{})},current);}
  catch(error){
    if(!current())throw captureCancelled();
    if(!['NotReadableError','OverconstrainedError','NotFoundError','AbortError'].includes(error.name))throw error;
    // Retry once with the system default and no processing constraints; a saved device may no longer exist.
    const stream=await requestInput(true,current);$('inputDevice').value='';return stream;
  }
}
function microphoneError(error){
  if(error.name==='NotAllowedError')return window.QihangNative?'请在系统应用权限中允许麦克风 / Autorisez le microphone dans les paramètres.':'请允许浏览器使用麦克风 / Autorisez le microphone dans le navigateur.';
  if(error.name==='NotFoundError')return '没有找到可用麦克风 / Aucun microphone disponible.';
  if(['NotReadableError','AbortError'].includes(error.name))return '麦克风暂时不可用，请结束其他录音或通话后重试 / Microphone indisponible. Fermez les autres enregistrements ou appels.';
  return error.message;
}
async function beginCapture() {
  if(S.micBusy||S.actionBusy) return;
  S.micBusy=true;const epoch=++S.captureEpoch;updateButtons();
  const current=()=>epoch===S.captureEpoch&&!document.hidden;
  const check=()=>{if(!current())throw captureCancelled();};
  let stream,context,recordStarted=false;
  try {
    if(window.QihangOralClient?.local){await ensureAudio();stopPlayback();$('lastAudio').pause();const sessionId=S.session?.id,fresh=await connectSocket();if(fresh)await send('restore',{id:sessionId});await send('prepare_record');}
    check();
    if(!navigator.mediaDevices?.getUserMedia) throw Error('当前浏览器不支持录音，请用 Edge 或 Chrome 打开本机地址');
    const device=$('inputDevice').value;
    stream=await openMicrophone(device,current);check();
    // Let the browser's audio engine resample, rather than aliasing high frequencies in JS.
    try{context=new AudioContext({sampleRate:16000,latencyHint:'interactive'});}catch(error){if(error.name!=='NotSupportedError')throw error;context=new AudioContext({latencyHint:'interactive'});}
    await context.resume();check();
    const devices=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);check();
    const selected=$('inputDevice').value;$('inputDevice').replaceChildren();
    const defaultOption=node('option','系统默认麦克风');defaultOption.value='';$('inputDevice').append(defaultOption);
    devices.filter(d=>d.kind==='audioinput').forEach((d,i)=>{const option=node('option',d.label||`麦克风 ${i+1}`);option.value=d.deviceId;$('inputDevice').append(option);});
    $('inputDevice').value=selected;
    $('inputName').textContent='正在使用：'+(stream.getAudioTracks()[0]?.label||'系统默认麦克风');
    S.micStats={peak:0,maxRms:0,clipped:0,blocks:0};
    await context.audioWorklet.addModule(window.QihangOralClient?.workletURL||'/assets/capture.js');check();
    const source=context.createMediaStreamSource(stream);const capture=new AudioWorkletNode(context,'oral-capture');
    const gain=context.createGain();gain.gain.value=0;
    const state={buffer:new Float32Array(0),position:0,ratio:context.sampleRate/16000};
    capture.port.onmessage=event=>{
      if(event.data?.flushed) {capture.flushed?.();return;}
      if(!S.stream || S.socket?.readyState!==WebSocket.OPEN) return;
      const input=event.data;
      let energy=0,peak=0;const gain=Number($('inputGain').value)||1;
      for(let i=0;i<input.length;i++){const v=input[i]*gain;peak=Math.max(peak,Math.abs(v));energy+=v*v;input[i]=Math.max(-.999,Math.min(.999,v));}
      const rms=Math.sqrt(energy/Math.max(1,input.length));S.micStats.peak=Math.max(S.micStats.peak,peak);S.micStats.maxRms=Math.max(S.micStats.maxRms,rms);S.micStats.blocks++;
      if(peak>=1) S.micStats.clipped++;
      $('inputLevel').value=Math.min(1,rms*5);
      $('inputQuality').textContent=peak>=1?'输入过强，请降低增益或远离麦克风':rms<.008?'当前音量偏轻，请靠近麦克风再说话':'正在接收声音';
      const joined=new Float32Array(state.buffer.length+input.length);joined.set(state.buffer);joined.set(input,state.buffer.length);
      const values=[];
      while(state.position+1<joined.length) {const i=Math.floor(state.position),f=state.position-i;values.push(joined[i]*(1-f)+joined[i+1]*f);state.position+=state.ratio;}
      const used=Math.floor(state.position);state.buffer=joined.slice(used);state.position-=used;
      if(values.length) {const pcm=new Int16Array(values.length);for(let i=0;i<values.length;i++){const v=Math.max(-1,Math.min(1,values[i]));pcm[i]=Math.round(v*(v<0?32768:32767));}
        if(S.socket.bufferedAmount>32000*5) {notice('网络发送积压，已停止录音');stopCapture(true).catch(e=>notice(e.message));return;} S.socket.send(pcm.buffer);}
    };
    await send('record_start');recordStarted=true;check();
    S.stream=stream;S.inputContext=context;S.capture=capture;
    source.connect(capture);capture.connect(gain);gain.connect(context.destination);notice('');
  } catch(e) {
    stream?.getTracks().forEach(t=>t.stop());if(context) await context.close().catch(()=>{});
    if(S.stream===stream){S.stream=null;S.inputContext=null;if(S.capture){S.capture.disconnect();S.capture.port.onmessage=null;S.capture=null;}}
    if(recordStarted&&S.socket?.readyState===WebSocket.OPEN)await send('abort').catch(()=>{});
    if(!e.captureCancelled)notice(microphoneError(e));
  } finally {S.micBusy=false;updateButtons();}
}
async function stopCapture(submit=true) {
  S.captureEpoch++;S.recordUntil=null;
  const stream=S.stream,context=S.inputContext;
  if(submit && S.capture && stream) {
    const capture=S.capture;
    await new Promise(resolve=>{const timer=setTimeout(resolve,600);capture.flushed=()=>{clearTimeout(timer);resolve();};capture.port.postMessage('flush');});
  }
  S.stream=null;S.inputContext=null;
  if(S.capture){S.capture.disconnect();S.capture.port.onmessage=null;S.capture=null;}
  stream?.getTracks().forEach(t=>t.stop());if(context) await context.close().catch(()=>{});
  if(stream && S.micStats){$('inputLevel').value=0;$('inputQuality').textContent=S.micStats.clipped?'本次录音出现过强输入，可降低增益后重试':S.micStats.maxRms<.015?'本次音量偏轻，可选择更近的麦克风或提高输入增益':'录音已结束，可回听上一句检查开头和结尾。';}
  updateButtons();if(submit && stream) await send('record_stop');
}
async function finish() {await action(async()=>{await stopCapture(false);await connectSocket();await send('end',{id:S.session.id});stopPlayback();await openReview(S.session.id);});}
async function showHistory() {
  if(S.session && S.session.phase!=='ended') {notice('当前练习尚未结束，请先点击“结束并保存”');return;}
  await refresh();show('history');$('historyList').replaceChildren();
  if(!S.boot.sessions.length) $('historyList').append(node('div','还没有练习记录。完成一次对话后，会保存在这里。','panel review-block muted'));
  for(const session of S.boot.sessions) {
    const button=node('button',undefined,'history-item panel');const info=node('div');
    info.append(node('strong',(session.level||'A1')+' · '+stageNames[session.part]+' · '+(session.mode==='simulation'?'模拟':'陪练')),
      node('p',new Date(session.created*1000).toLocaleString('zh-CN')+' · '+(session.ended?'已结束':'未结束，可查看或继续')));
    button.append(info,node('span','查看 →'));button.onclick=()=>action(()=>openReview(session.id));$('historyList').append(button);
  }
}
async function openReview(id) {
  const session=await api('/api/sessions/'+id);S.review=session;show('review');
  $('reviewMeta').textContent=(session.level||'A1')+' · '+stageNames[session.part]+' · '+new Date(session.created*1000).toLocaleString('zh-CN');
  const duration=Math.max(0,Math.round(((session.ended||session.updated)-session.created)/60));
  const user=session.messages.filter(x=>x.role==='user');const seconds=user.reduce((n,x)=>n+(x.seconds||0),0);
  $('reviewStats').replaceChildren();
  for(const [value,label] of [[duration+' 分钟','本次练习时长（含准备）'],[user.length+' 次','你的发言次数'],[Math.round(seconds)+' 秒','已保存的录音']]) {
    const card=node('div',undefined,'stat');card.append(node('strong',value),node('span',label));$('reviewStats').append(card);
  }
  transcript($('reviewTranscript'),session,true);
  $('reviewChecks').textContent=delf?.isAdvanced(session)?(session.ended?'结合原题和录音复盘。':'还可以继续本次口试。'):session.checks.length?'你勾选已完成：'+session.checks.join('、'):'本次没有勾选自评任务。可结合录音自行检查。';
  if(delf?.isAdvanced(session)&&Object.keys(session.chosen).length){
    const details=node('details');details.append(node('summary','回看本场原题'));
    for(const card of Object.values(session.chosen))details.append(delfCard(card));
    $('reviewChecks').append(details);
  }
  $('restore').hidden=!!session.ended;
  renderEvaluation(session);
}
function renderEvaluation(session) {
  clearTimeout(S.evaluationTimer);
  const box=$('evaluationContent'),button=$('evaluate'),state=session.evaluation||{};
  box.replaceChildren();button.hidden=!session.ended;
  button.disabled=state.status==='pending'||state.voice_status==='pending';button.textContent=state.status==='ready'?'重新生成评价':state.status==='error'?'重试评价':'生成评价';
  if(state.status!=='ready') {
    box.append(node('p',state.status==='pending'?'AI正在回顾这轮对话，请稍候…':state.message||'结束练习后，AI会给出本轮评价和下一步练习建议。','muted'));
    if(state.status==='pending'||state.voice_status==='pending')S.evaluationTimer=setTimeout(async()=>{
      if($('review').hidden||S.review?.id!==session.id)return;
      try{const fresh=await api('/api/sessions/'+session.id);S.review=fresh;renderEvaluation(fresh);}catch(e){box.replaceChildren(node('p','评价状态暂时无法获取，点击重试。','muted'));button.disabled=false;button.textContent='重试评价';}
    },2000);
    return;
  }
  if(state.voice_status==='pending')S.evaluationTimer=setTimeout(async()=>{
   if($('review').hidden||S.review?.id!==session.id)return;
   try{const fresh=await api('/api/sessions/'+session.id);S.review=fresh;renderEvaluation(fresh);}catch{}
  },1500);
  const voice=node('section',undefined,'evaluation-voice');
  voice.append(node('h3','语音评价'));
  if(state.audio){
   const player=node('audio');player.controls=true;player.preload='none';
   setRecording(player,'/api/sessions/'+session.id+'/audio/'+state.audio);voice.append(player);
  }else voice.append(node('p',state.voice_status==='pending'?'考官正在生成语音评价…':'本次未收到考官语音，可重新生成评价。','quiet'));
  box.append(voice);
  const report=state.report;box.append(node('p',report.summary,'evaluation-summary'));
  for(const stage of report.stages) {
    const card=node('section',undefined,'evaluation-stage');card.append(node('h3',stageNames[stage.stage]));
    const criteria=node('dl',undefined,'evaluation-criteria');
    for(const [key,label] of [['task','任务完成'],['interaction','交流互动'],['vocabulary','词汇表达'],['grammar','简单语法']])criteria.append(node('dt',label),node('dd',stage[key]));
    card.append(criteria,node('h4','这次做得好的地方'));
    for(const item of stage.strengths){const p=node('div',undefined,'evaluation-example');p.append(node('blockquote',item.quote),node('p',item.comment));card.append(p);}
    if(stage.improvements.length)card.append(node('h4','下次可以这样说'));
    for(const item of stage.improvements){const p=node('div',undefined,'evaluation-example');p.append(node('blockquote',item.quote),node('p',item.better,'better-phrase'),node('p',item.reason));card.append(p);}
    card.append(node('h4','下一步练习'));const list=node('ol');for(const task of stage.practice)list.append(node('li',task));card.append(list);box.append(card);
  }
}
$('evaluate').onclick=()=>action(async()=>{
  if(!S.review)return;
  await api(`/api/sessions/${S.review.id}/evaluation`,{});await openReview(S.review.id);
});
setInterval(()=>{
  const s=S.session;if(!s || s.phase==='ended') return;
  if(delf?.isAdvanced(s)){
    if(document.hidden||$('practice').hidden)return;
    if(s.phase==='preparation')$('prepClock').textContent=formatTime(Math.ceil(s.prep_until-Date.now()/1000));
    renderProgress();
    const now=Date.now()/1000,deadline=delf.examClock(s);
    if(!S.actionBusy&&!S.micBusy&&S.stream&&S.recordUntil&&now>=S.recordUntil){
      action(()=>stopCapture(true));
    }else if(!S.actionBusy&&!S.micBusy&&!S.stream&&S.state!=='recognizing'&&deadline&&now>=deadline&&S.socket?.readyState===WebSocket.OPEN){
      action(async()=>{await send('clock',{playback_busy:playing()});if(S.session?.ended)await openReview(S.session.id);});
    }
    return;
  }
  const elapsed=Math.max(0,Math.floor(Date.now()/1000-(s.stage_started||s.created)));
  $('elapsed').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  renderProgress();
  if(s.phase==='preparation') {const left=Math.max(0,Math.ceil(s.prep_until-Date.now()/1000));$('prepClock').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');
    if(!left) {$('voiceState').textContent='准备时间已到，点击“结束准备，开始口试”继续';}}
},250);
$('bind').onclick=()=>action(async()=>{$('bind').disabled=true;try{const data=await api('/api/bind',{});providerView(data);S.boot.provider=data;if(data.status==='binding') pollProvider();}finally{$('bind').disabled=S.boot?.provider?.status==='binding';}});
document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>openGuide(b.dataset.part));$('full').onclick=()=>openGuide('full');
$('guideClose').onclick=closeGuide;$('guideDialog').addEventListener('cancel',e=>{e.preventDefault();closeGuide();});
$('guideStart').onclick=()=>{const part=S.guidePart;const resume=S.guideResume;closeGuide();if(!resume)start(part);};
$('guideVideo').onerror=()=>{$('guideVideoError').hidden=true; if($('guideVideo').getAttribute('src'))$('guideVideoError').hidden=false;};
$('viewExample').onclick=()=>openGuide(S.session.stages[S.session.stage_index],true);
$('mic').onclick=()=>S.stream?action(()=>stopCapture(true)):beginCapture();
if($('resumeAudio'))$('resumeAudio').onclick=()=>action(async()=>{await ensureAudio();drainAudio();});
$('recognitionMode').onchange=()=>{S.recognitionChosen=true;};
$('confirmedTranscript').oninput=updateButtons;
$('recognitionForm').onsubmit=e=>{e.preventDefault();action(async()=>{await ensureAudio();await send('confirm_transcript',{row:S.session.awaiting_confirmation,text:$('confirmedTranscript').value});});};
$('retrySpeech').onclick=()=>action(async()=>{await ensureAudio();await send('retry_recognition',{row:S.session.awaiting_confirmation});});
$('abort').onclick=()=>action(async()=>{await stopCapture(false);stopPlayback();await send('abort');});
$('resume').onclick=()=>action(async()=>{await ensureAudio();const fresh=await connectSocket();await send(fresh?'restore':'resume',fresh?{id:S.session.id}:{});});
$('nextStage').onclick=()=>action(async()=>{stopPlayback();$('hintBox').hidden=true;await send('next');});
$('finishPrep').onclick=()=>action(async()=>{await ensureAudio();await send(delf?.isAdvanced(S.session)?'skip_preparation':'next');});
$('nextKeyword').onclick=()=>action(async()=>{stopPlayback();await send('keyword');});
$('finish').onclick=finish;$('endTop').onclick=finish;
$('showHint').onclick=()=>{$('hintBox').hidden=!$('hintBox').hidden;};
$('textForm').onsubmit=event=>{event.preventDefault();action(async()=>{const text=$('textInput').value.trim();if(!text) return;await send('text',{text});$('textInput').value='';});};
$('navPractice').onclick=$('backHome').onclick=()=>{if(S.session && S.session.phase!=='ended') {show('practice');return;}show('home');refresh().catch(e=>notice(e.message));};
$('navHistory').onclick=$('reviewBack').onclick=()=>showHistory().catch(e=>notice(e.message));
function evaluationLines(state) {
 if(state?.status!=='ready')return [];
 const report=state.report,lines=['','AI口语复盘（基于文字，非官方成绩）',report.summary];
 for(const stage of report.stages){
  lines.push('',stageNames[stage.stage], '任务完成：'+stage.task,'交流互动：'+stage.interaction,'词汇：'+stage.vocabulary,'语法：'+stage.grammar);
  for(const item of stage.strengths)lines.push('优点 · '+item.quote+' → '+item.comment);
  for(const item of stage.improvements)lines.push('练习改写 · '+item.quote+' → '+item.better+'（'+item.reason+'）');
  lines.push(...stage.practice.map(t=>'下一步：'+t));
 }
 return lines;
}
$('export').onclick=()=>{if(!S.review) return;const s=S.review;if(window.QihangOralClient?.exportSession){window.QihangOralClient.exportSession(s.id).catch(e=>notice(e.message));return;}const text=['启航法语 · DELF A1 对话记录',new Date(s.created*1000).toLocaleString('zh-CN'),'原始转写可能包含识别错误；不是官方成绩。','',...s.messages.map(m=>`${m.role==='user'?'你':'Camille'} [${stageNames[m.stage]}]：${m.text||'（无识别文字，见原录音）'}${m.recognition?'\n独立法语识别：'+m.recognition.model+'（原始输出）':''}${m.asr_reviews?.length?'\n本地法语复核（独立候选）：'+(m.asr_reviews.at(-1).text||'未识别出文字'):''}${m.revisions?.length?'\n考生修订稿：'+m.revisions.at(-1).text:''}${m.confirmed_text?'\n考生确认文字：'+m.confirmed_text:''}${m.confirmation_status==='cancelled'?'\n此条已放弃，原录音保留':m.confirmation_status==='pending'?'\n待确认':''}`),...evaluationLines(s.evaluation)].join('\n');
  if(window.QihangOralClient){window.QihangOralClient.exportText('A1-'+s.id.slice(0,8)+'.txt',text);return;}
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='A1-'+s.id.slice(0,8)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onclick=()=>action(async()=>{await ensureAudio();await connectSocket();await send('restore',{id:S.review.id});});
$('lastAudio').onplay=()=>{stopPlayback();updateButtons();};$('lastAudio').onpause=$('lastAudio').onended=updateButtons;
$('revisionCancel').onclick=()=>$('revisionDialog').close();
$('revisionForm').onsubmit=event=>{event.preventDefault();action(async()=>{const target=S.revisionTarget;if(!target)return;const d=await api(`/api/sessions/${target.sid}/revision`,{row:target.row,text:$('revisionText').value});$('revisionDialog').close();if(S.review?.id===target.sid){S.review=d.session;await openReview(target.sid);}notice('修订稿已单独保存，原始识别文字保留。');});};
window.addEventListener('beforeunload',()=>{S.captureEpoch++;S.stream?.getTracks().forEach(t=>t.stop());S.socket?.close();});
(async()=>{try{await refresh();for(const scene of S.boot.scenes){const option=node('option',scene.title);option.value=scene.id;$('scene').append(option);}
  $('version').textContent=window.QihangOralClient?'DELF A1':'A1 · '+(S.boot.build?.split('web-').at(-1)||'');if(S.boot.provider.status==='binding') pollProvider();
}catch(e){
  if(window.QihangOralClient){S.boot=await window.QihangOralClient.offlineBootstrap();providerView(S.boot.provider);$('bankInfo').textContent='42 问句 · 48 词卡 · 12 情景';for(const scene of S.boot.scenes){const option=node('option',scene.title);option.value=scene.id;$('scene').append(option);}window.QihangOralClient.connectionFailed(e.message);notice('请在口语设置中完成准备 / Préparez le mode oral.');}
  else notice('无法连接本机服务：'+e.message);
}})();

window.addEventListener('pagehide',()=>{S.captureEpoch++;S.stream?.getTracks().forEach(track=>track.stop());S.socket?.close();stopPlayback();});

if(window.QihangOralClient){
 const labels={navPractice:['练习','Pratiquer'],navHistory:['记录','Historique'],bind:{'连接小智':'连接小智 · Connecter','刷新连接':'刷新连接 · Actualiser','等待绑定…':'等待绑定 · Association…'},micLabel:{'开始说话':'开始说话 · Parler','我说完了':'我说完了 · Terminé'},finish:['结束练习','Terminer'],endTop:['结束并保存','Terminer et enregistrer'],full:['开始完整练习','Épreuve complète'],backHome:['返回练习','Pratiquer'],reviewBack:['全部记录','Historique'],evaluate:{'生成评价':'生成评价 · Évaluer','重新评价':'重新评价 · Réévaluer','重试评价':'重试评价 · Réessayer'},export:['导出记录','Exporter']};
 const update=()=>{for(const [id,copy] of Object.entries(labels)){const element=$(id);if(!element)continue;if(Array.isArray(copy)){if(!element.dataset.bilingual){element.textContent=copy.join(' · ');element.dataset.bilingual='1';}}else if(copy[element.textContent])element.textContent=copy[element.textContent];}};
 update();const observer=new MutationObserver(update);for(const id of Object.keys(labels)){const element=$(id);if(element)observer.observe(element,{childList:true,characterData:true,subtree:true});}window.addEventListener('pagehide',()=>observer.disconnect());
}

if(window.QihangOralClient)document.addEventListener('visibilitychange',()=>{if(document.hidden){const capturing=S.stream||S.micBusy;stopCapture(false);if(capturing)S.socket?.close();stopPlayback();}});

if(window.QihangOralClient)window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='qihang-oral-suspend'){stopCapture(false);S.socket?.close();stopPlayback();}});

if(window.QihangOralClient?.local){const providerTimer=setInterval(()=>{if(!document.hidden)api('/api/provider').then(data=>{if(S.boot)S.boot.provider=data;providerView(data);}).catch(()=>{});},2500);window.addEventListener('pagehide',()=>clearInterval(providerTimer));}
