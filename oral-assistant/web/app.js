'use strict';
const $ = id => document.getElementById(id);
const S = {boot: null, socket: null, session: null, review: null, state: 'idle', pending: new Map(),
  epoch: 0, rate: 24000, context: null, sources: new Set(), playUntil: 0,
  stream: null, inputContext: null, capture: null, micBusy: false, polling: null, actionBusy: false,
  micStats:null, revisionTarget:null, localReviews:new Set(),recognitionChosen:false,evaluationTimer:null};
const stageNames = {intro:'引导问答', exchange:'信息交换', roleplay:'情景对话', full:'完整练习'};
const hintTexts = {intro:'可以从姓名、居住地、学习和爱好说起。用你会的短句即可，不需要背一篇长介绍。',
  exchange:'观察关键词，选择你会的疑问句。你可以询问对方的情况，考官会回答你。',
  roleplay:'先打招呼，再说明你需要什么。需要时询问价格或请对方重复，最后礼貌告别。'};
function node(tag, text, cls) { const e = document.createElement(tag); if(text !== undefined) e.textContent = text; if(cls) e.className = cls; return e; }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function show(view) {
  clearTimeout(S.evaluationTimer);
  for (const id of ['home','practice','history','review']) $(id).hidden = id !== view;
  $('navPractice').classList.toggle('active', view === 'home' || view === 'practice');
  $('navHistory').classList.toggle('active', view === 'history' || view === 'review');
}
async function api(path, body) {
  const options = body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-Oral-Client':'web'}, body:JSON.stringify(body)};
  const response = await fetch(path, options); const data = await response.json();
  if(!response.ok) throw Error(data.error || '操作失败，请重试'); return data;
}
function providerView(data) {
  const ready = data.status === 'ready';
  $('bindingMessage').textContent = data.message;
  $('connectionDot').classList.toggle('ready', ready);
  $('connectionLabel').textContent = ready ? '绑定就绪' : data.status === 'binding' ? '等待绑定' : '尚未连接';
  $('bindingCode').hidden = data.status !== 'binding'; $('codeValue').textContent = data.code || '';
  $('bind').textContent = ready ? '刷新连接' : data.status === 'binding' ? '等待绑定…' : '连接小智';
  $('bind').disabled = data.status === 'binding';
  for (const b of document.querySelectorAll('[data-part],#full')) b.disabled = false;
}
async function refresh() {
  S.boot = await api('/api/bootstrap');providerView(S.boot.provider);
  if(S.boot.bank)$('bankInfo').textContent=`${S.boot.bank.intro_questions}个问句 · ${S.boot.bank.keywords}张词卡 · ${S.boot.bank.scenes}个情景 · 参考公开样题编写`;
  $('recognitionChoice').hidden=!S.boot.capabilities?.confirm_transcript;
  const configured=!!S.boot.capabilities?.independent_fr && !!S.boot.french_asr?.configured;
  $('recognizerChoice').hidden=!configured;
  if(!S.recognitionChosen)$('recognitionMode').value=configured?'independent_fr':'xiaozhi';
  $('recognizerMessage').textContent=S.boot.french_asr?.message||'';
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
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    S.socket = ws; ws.binaryType = 'arraybuffer';
    const timeout = setTimeout(()=>{ws.close();reject(Error('练习窗口连接超时'));}, 10000);
    ws.onmessage = event => {
      if(typeof event.data !== 'string') { playPCM(event.data); return; }
      const data = JSON.parse(event.data);
      if(data.type === 'welcome') {clearTimeout(timeout);resolve();}
      if(data.type === 'session') {S.session=data.session;renderSession();}
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
    ws.onerror = ()=>{clearTimeout(timeout);reject(Error('练习连接失败，可能已有其他练习窗口打开。请关闭旧窗口后重试。'));};
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
    S.socket.send(JSON.stringify({action,request,...values}));
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
function stopPlayback() {for(const source of S.sources) {try{source.stop();}catch{}} S.sources.clear();S.playUntil=0;}
function playPCM(data) {
  const view=new DataView(data);if(data.byteLength<6 || view.getUint32(0,true)!==S.epoch || !$('lastAudio').paused) return;
  if(!S.context || S.context.state !== 'running') {notice('浏览器暂停了音频，请点击“继续本环节”恢复播放');return;}
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
  $('mic').disabled=!active || confirming || S.actionBusy || S.micBusy || (!recording && (S.state!=='idle' || playing()));
  $('mic').classList.toggle('recording',recording);$('micLabel').textContent=recording?'我说完了':'开始说话';
  $('sendText').disabled=!active || S.actionBusy || recording || S.state!=='idle' || playing();
  for(const id of ['nextStage','finishPrep','nextKeyword','resume']) $(id).disabled=S.actionBusy || recording || confirming || S.state==='recognizing';
  $('confirmSpeech').disabled=S.actionBusy || !confirming || !$('confirmedTranscript').value.trim();
  $('retrySpeech').disabled=S.actionBusy || !confirming;
  for(const id of ['abort','finish','endTop']) $(id).disabled=S.actionBusy || !S.session || S.session.phase==='ended';
  for(const b of document.querySelectorAll('[data-card-index]'))b.disabled=S.actionBusy||recording||confirming||S.state!=='idle';
  $('nextKeyword').disabled=S.actionBusy||recording||confirming||S.state!=='idle';
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
  const copy=guideCopy[stage];$('guideTitle').textContent=stageNames[stage]+' · 先看懂，再开口';
  const media=S.boot?.examples?.[stage];const v=$('guideVideo');v.pause();v.removeAttribute('src');v.removeAttribute('poster');v.hidden=!media?.video;
  if(media?.poster)v.poster=`/examples/${stage}.jpg`;
  if(media?.video)v.src=`/examples/${stage}.mp4`;
  v.load();$('guideVideoError').hidden=!!media?.video;$('guideVideoError').textContent=media?.video?'视频暂时无法播放，可打开原视频；也可以直接练习。':'观看示范可打开下方原视频链接，也可以直接练习。';
  $('guideSteps').replaceChildren(...copy.steps.map(x=>node('li',x)));$('guideEnding').textContent=copy.ending||'';$('guideEnding').parentElement.hidden=!copy.ending;
  $('guideTabs').replaceChildren();for(const key of Object.keys(guideCopy)){const b=node('button',stageNames[key],'guide-tab'+(key===stage?' active':''));b.type='button';b.onclick=()=>showGuideStage(key);$('guideTabs').append(b);}
}
function openGuide(part,resume=false){
  S.guidePart=part;S.guideResume=resume;showGuideStage(part==='full'?'intro':part);
  $('guideStart').disabled=!resume&&S.boot?.provider?.status!=='ready';
  $('guideStart').textContent=resume?'返回练习 →':S.boot?.provider?.status==='ready'?'直接练习，跳过视频 →':'请先连接考官，再开始练习';
  $('guideDialog').showModal();
}
function renderProgress(){
 const s=S.session;if(!s||s.phase==='ended')return;const stage=s.stages[s.stage_index];
 const p=s.progress||{};const target=p.target_seconds||({intro:90,exchange:120,roleplay:120}[stage]);
 const seconds=Math.max(0,Math.floor(Date.now()/1000-(s.stage_started||s.created)));const left=Math.max(0,target-seconds);
 $('stageStatus').hidden=s.phase==='preparation';$('stageStatus').classList.toggle('complete',!!p.completed);
 $('stageProgress').textContent=p.completed?'本环节已完成':stage==='exchange'?`词卡进度 ${(s.exchange_done||[]).length} / ${s.keywords.length}`:`已完成 ${p.answers||0} 轮回答`;
 $('stageMessage').textContent=p.completed?(s.stage_index<s.stages.length-1?'点击“下一个环节”继续。':'点击“结束并复盘”，回听本次练习。'):stage==='intro'?'本次练习安排4–6轮回答，考官会继续追问学习、家庭和爱好。':stage==='exchange'?'每张词卡由你问一个问题；六张交流完成后收尾。':'完成任务后礼貌告别，考官会明确收尾。';
 $('targetTime').textContent=p.completed?'已结束':seconds>=target?'参考时长已到':'距参考时长';
 $('remainingTime').textContent=p.completed?'✓':`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
 if(!p.completed&&seconds>=target)$('stageMessage').textContent+=' 参考时间已到，完成当前交流后收尾；不会截断录音。';
}
function transcript(target, session, audio=false) {
  target.replaceChildren();
  if(!session.messages.length) {target.append(node('div',session.phase==='preparation'?'准备好后，开始和考官交流。':'考官即将和你打招呼…','empty-dialogue'));return;}
  for(const row of session.messages) {
    const box=node('div',undefined,'bubble'+(row.role==='user'?' user':''));
    box.append(node('div',(row.role==='user'?'你':'Camille')+(audio?' · '+(stageNames[row.stage]||''):''),'who'));
    box.append(node('p',row.text || (row.audio?(row.interrupted?'录音已保存 · 本次发言被中断':'录音已保存 · 等待识别'):'尚未收到识别文字')));
    if(row.recognition)box.append(node('small','独立法语识别 · 原始转写','revision-note'));
    if(row.asr_reviews?.length) {
      box.append(node('span','本地法语复核（独立候选）：'+(row.asr_reviews.at(-1).text||'未识别出文字'),'asr-note'));
      box.append(node('small','两种识别都可能出错，请结合原声确认。','asr-note quiet'));
    }
    if(row.revisions?.length) box.append(node('span','你的修订稿：'+row.revisions.at(-1).text,'revision-note'));
    if(row.confirmation_status) box.append(node('small',row.confirmation_status==='confirmed'?'已由你确认后用于对话':row.confirmation_status==='cancelled'?'此条已放弃，原录音保留':'等待你确认，考官暂不回复','revision-note'));
    if(row.role==='user' && row.audio && !row.recognition_status && S.boot?.local_asr?.available) {
      const review=node('button',S.localReviews.has(row.id)?'正在本机复核…':row.asr_reviews?.length?'重新复核':'本地法语复核','text-button');
      review.dataset.action='local-review';review.dataset.rowId=row.id;review.disabled=S.localReviews.has(row.id);
      review.onclick=()=>reviewRecording(session.id,row.id,review);box.append(review);
    }
    if(row.role==='user' && (row.text || row.audio)) {
      const edit=node('button','识别有误？记一份修订稿','text-button');
      edit.onclick=()=>{S.revisionTarget={sid:session.id,row:row.id};$('originalTranscript').textContent=row.text||'（没有收到识别文字）';$('revisionText').value=row.revisions?.at(-1)?.text||row.asr_reviews?.at(-1)?.text||'';$('revisionDialog').showModal();};
      box.append(edit);
    }
    if(audio && row.audio) {const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=`/api/sessions/${session.id}/audio/${row.audio}`;box.append(player);}
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
  if(session.phase==='ended') return;
  show('practice');
  const pending=session.messages.find(m=>m.id===session.awaiting_confirmation);
  const form=$('recognitionForm');form.hidden=!pending;
  if(pending && form.dataset.row!==pending.id) {form.dataset.row=pending.id;$('confirmedTranscript').value=pending.revisions?.at(-1)?.text||pending.text||'';}
  const stage=session.stages[session.stage_index];const def=S.boot.stages[stage];
  $('modeTag').textContent=(session.mode==='simulation'?'模拟考试':'陪练')+' · A1';
  $('steps').replaceChildren();
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
  if(last) {const src=`/api/sessions/${session.id}/audio/${last.audio}`;if($('lastAudio').getAttribute('src')!==src) $('lastAudio').src=src;}
  transcript($('transcript'),{...session,messages:session.messages.filter(m=>m.stage===stage)});renderProgress();updateButtons();
}
async function start(part) {if(!S.boot){notice('页面正在连接，请稍候');return;}await action(async()=>{await ensureAudio();await connectSocket();S.state='waiting';await send('start',{part,mode:$('mode').value,scene:$('scene').value,recognition_mode:$('recognitionMode').value,confirm_transcript:!!S.boot.capabilities?.confirm_transcript && $('confirmRecognition').checked});$('hintBox').hidden=true;});}
async function beginCapture() {
  if(S.micBusy) return;
  S.micBusy=true;updateButtons();
  let stream,context;
  try {
    if(!navigator.mediaDevices?.getUserMedia) throw Error('当前浏览器不支持录音，请用 Edge 或 Chrome 打开本机地址');
    const device=$('inputDevice').value;
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(device?{deviceId:{exact:device}}:{})}});
    // Let the browser's audio engine resample, rather than aliasing high frequencies in JS.
    context=new AudioContext({sampleRate:16000,latencyHint:'interactive'});await context.resume();
    const devices=await navigator.mediaDevices.enumerateDevices();
    const selected=$('inputDevice').value;$('inputDevice').replaceChildren();
    const defaultOption=node('option','系统默认麦克风');defaultOption.value='';$('inputDevice').append(defaultOption);
    devices.filter(d=>d.kind==='audioinput').forEach((d,i)=>{const option=node('option',d.label||`麦克风 ${i+1}`);option.value=d.deviceId;$('inputDevice').append(option);});
    $('inputDevice').value=selected;
    $('inputName').textContent='本次输入：'+(stream.getAudioTracks()[0]?.label||'默认麦克风')+' · 处理采样率 '+context.sampleRate+' Hz';
    S.micStats={peak:0,maxRms:0,clipped:0,blocks:0};
    await context.audioWorklet.addModule('/assets/capture.js');
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
    await send('record_start');
    S.stream=stream;S.inputContext=context;S.capture=capture;
    source.connect(capture);capture.connect(gain);gain.connect(context.destination);notice('');
  } catch(e) {
    stream?.getTracks().forEach(t=>t.stop());if(context) await context.close().catch(()=>{});
    notice(e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器地址栏允许使用麦克风后重试':e.message);
  } finally {S.micBusy=false;updateButtons();}
}
async function stopCapture(submit=true) {
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
    info.append(node('strong',stageNames[session.part]+' · '+(session.mode==='simulation'?'模拟':'陪练')),
      node('p',new Date(session.created*1000).toLocaleString('zh-CN')+' · '+(session.ended?'已结束':'未结束，可查看或继续')));
    button.append(info,node('span','查看 →'));button.onclick=()=>action(()=>openReview(session.id));$('historyList').append(button);
  }
}
async function openReview(id) {
  const session=await api('/api/sessions/'+id);S.review=session;show('review');
  $('reviewMeta').textContent=stageNames[session.part]+' · '+new Date(session.created*1000).toLocaleString('zh-CN');
  const duration=Math.max(0,Math.round(((session.ended||session.updated)-session.created)/60));
  const user=session.messages.filter(x=>x.role==='user');const seconds=user.reduce((n,x)=>n+(x.seconds||0),0);
  $('reviewStats').replaceChildren();
  for(const [value,label] of [[duration+' 分钟','本次练习时长（含准备）'],[user.length+' 次','你的发言次数'],[Math.round(seconds)+' 秒','已保存的录音']]) {
    const card=node('div',undefined,'stat');card.append(node('strong',value),node('span',label));$('reviewStats').append(card);
  }
  transcript($('reviewTranscript'),session,true);
  $('reviewChecks').textContent=session.checks.length?'你勾选已完成：'+session.checks.join('、'):'本次没有勾选自评任务。可结合录音自行检查。';
  $('restore').hidden=!!session.ended;
  renderEvaluation(session);
}
function renderEvaluation(session) {
  clearTimeout(S.evaluationTimer);
  const box=$('evaluationContent'),button=$('evaluate'),state=session.evaluation||{};
  box.replaceChildren();button.hidden=!session.ended;
  button.disabled=state.status==='pending';button.textContent=state.status==='ready'?'重新生成评价':state.status==='error'?'重试评价':'生成评价';
  if(state.status!=='ready') {
    box.append(node('p',state.status==='pending'?'AI正在回顾这轮对话，请稍候…':state.message||'结束练习后，AI会给出本轮评价和下一步练习建议。','muted'));
    if(state.status==='pending')S.evaluationTimer=setTimeout(async()=>{
      if($('review').hidden||S.review?.id!==session.id)return;
      try{const fresh=await api('/api/sessions/'+session.id);S.review=fresh;renderEvaluation(fresh);}catch(e){box.replaceChildren(node('p','评价状态暂时无法获取，点击重试。','muted'));button.disabled=false;button.textContent='重试评价';}
    },2000);
    return;
  }
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
  const elapsed=Math.max(0,Math.floor(Date.now()/1000-(s.stage_started||s.created)));
  $('elapsed').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  renderProgress();
  if(s.phase==='preparation') {const left=Math.max(0,Math.ceil(s.prep_until-Date.now()/1000));$('prepClock').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');
    if(!left) {$('voiceState').textContent='准备时间已到，点击“结束准备，开始口试”继续';}}
},1000);
$('bind').onclick=()=>action(async()=>{$('bind').disabled=true;try{const data=await api('/api/bind',{});providerView(data);S.boot.provider=data;if(data.status==='binding') pollProvider();}finally{$('bind').disabled=S.boot?.provider?.status==='binding';}});
document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>openGuide(b.dataset.part));$('full').onclick=()=>openGuide('full');
$('guideClose').onclick=closeGuide;$('guideDialog').addEventListener('cancel',e=>{e.preventDefault();closeGuide();});
$('guideStart').onclick=()=>{const part=S.guidePart;const resume=S.guideResume;closeGuide();if(!resume)start(part);};
$('guideVideo').onerror=()=>{$('guideVideoError').hidden=true; if($('guideVideo').getAttribute('src'))$('guideVideoError').hidden=false;};
$('viewExample').onclick=()=>openGuide(S.session.stages[S.session.stage_index],true);
$('mic').onclick=()=>S.stream?action(()=>stopCapture(true)):beginCapture();
$('recognitionMode').onchange=()=>{S.recognitionChosen=true;};
$('confirmedTranscript').oninput=updateButtons;
$('recognitionForm').onsubmit=e=>{e.preventDefault();action(async()=>{await ensureAudio();await send('confirm_transcript',{row:S.session.awaiting_confirmation,text:$('confirmedTranscript').value});});};
$('retrySpeech').onclick=()=>action(async()=>{await ensureAudio();await send('retry_recognition',{row:S.session.awaiting_confirmation});});
$('abort').onclick=()=>action(async()=>{await stopCapture(false);stopPlayback();await send('abort');});
$('resume').onclick=()=>action(async()=>{await ensureAudio();const fresh=await connectSocket();await send(fresh?'restore':'resume',fresh?{id:S.session.id}:{});});
$('nextStage').onclick=()=>action(async()=>{stopPlayback();$('hintBox').hidden=true;await send('next');});
$('finishPrep').onclick=()=>action(async()=>{await ensureAudio();await send('next');});
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
$('export').onclick=()=>{if(!S.review) return;const s=S.review;const text=['Parlons · A1 对话记录',new Date(s.created*1000).toLocaleString('zh-CN'),'原始转写可能包含识别错误；不是官方成绩。','',...s.messages.map(m=>`${m.role==='user'?'你':'Camille'} [${stageNames[m.stage]}]：${m.text||'（无识别文字，见原录音）'}${m.recognition?'\n独立法语识别：'+m.recognition.model+'（原始输出）':''}${m.asr_reviews?.length?'\n本地法语复核（独立候选）：'+(m.asr_reviews.at(-1).text||'未识别出文字'):''}${m.revisions?.length?'\n考生修订稿：'+m.revisions.at(-1).text:''}${m.confirmed_text?'\n考生确认文字：'+m.confirmed_text:''}${m.confirmation_status==='cancelled'?'\n此条已放弃，原录音保留':m.confirmation_status==='pending'?'\n待确认':''}`),...evaluationLines(s.evaluation)].join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='A1-'+s.id.slice(0,8)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onclick=()=>action(async()=>{await ensureAudio();await connectSocket();await send('restore',{id:S.review.id});});
$('lastAudio').onplay=()=>{stopPlayback();updateButtons();};$('lastAudio').onpause=$('lastAudio').onended=updateButtons;
$('revisionCancel').onclick=()=>$('revisionDialog').close();
$('revisionForm').onsubmit=event=>{event.preventDefault();action(async()=>{const target=S.revisionTarget;if(!target)return;const d=await api(`/api/sessions/${target.sid}/revision`,{row:target.row,text:$('revisionText').value});$('revisionDialog').close();if(S.review?.id===target.sid){S.review=d.session;await openReview(target.sid);}notice('修订稿已单独保存，原始识别文字保留。');});};
window.addEventListener('beforeunload',()=>{S.stream?.getTracks().forEach(t=>t.stop());S.socket?.close();});
(async()=>{try{await refresh();for(const scene of S.boot.scenes){const option=node('option',scene.title);option.value=scene.id;$('scene').append(option);}
  $('version').textContent='A1 · 原型 '+(S.boot.build?.split('web-').at(-1)||'开发版');if(S.boot.provider.status==='binding') pollProvider();
}catch(e){notice('无法连接本机服务：'+e.message);}})();
