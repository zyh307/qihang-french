import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const source=await fs.readFile(new URL('../../src/oral/local-client.js',import.meta.url),'utf8');
const bank=JSON.parse(await fs.readFile(new URL('../../src/oral/bank-full.json',import.meta.url),'utf8'));
const delfSource=await fs.readFile(new URL('../../src/oral/delf-exam.js',import.meta.url),'utf8');
const delfCards=JSON.parse(await fs.readFile(new URL('../../src/oral/delf-cards.json',import.meta.url),'utf8'));
async function fixture(jobs,options={}){
 const sessions=new Map(),nativeEvents=[],sent=[],polls=[],messages=[],audioFrames=[];
 let clock=Date.now();
 class ExamDate extends Date {static now(){return clock;}}
 let cursor=0,recording=0,recognizedAt=0,failedSaves=options.failedSaves||0;const recognitionArgs=[];
 const call=async(method,args={})=>{
  if(method==='status')return{model:{ready:true},recognizer:{ready:options.prepared!==false},provider:{status:'connected',hasTask:false}};
  if(method==='events')return{cursor,events:nativeEvents.filter(e=>e.seq>args.after)};
  if(method==='session.save'){if(failedSaves-->0)throw Error('isolated storage failure');sessions.set(args.session.id,structuredClone(args.session));return{};}
  if(method==='session.get')return structuredClone(sessions.get(args.id));
  if(method==='record.begin')return{audio:'test-recording-'+(++recording)};
  if(method==='record.end')return{audio:'test-recording-'+recording,row:'row-'+recording,duration:2};
  if(method==='recognize'){recognitionArgs.push(structuredClone(args));recognizedAt=performance.now();return{job:'isolated-job',timeoutMs:10000};}
  if(method==='job'){polls.push(performance.now()-recognizedAt);return structuredClone(jobs.length>1?jobs.shift():jobs[0]);}
  if(method==='send'){
   sent.push(structuredClone(args));
   if(options.manualReplies)return{submitted:true};
   for(const event of [{type:'task_read',turn:args.task.turn_id},{type:'sentence',text:'Bonjour !'},{type:'turn_end',hasAudio:false}])nativeEvents.push({...event,seq:++cursor});
   return{submitted:true};
  }
  return{};
 };
 const window={QihangShortAudioExperiment:options.shortAudioExperiment===true,addEventListener(){}};window.parent={postMessage(){}};
 const context=vm.createContext({window,parent:window.parent,document:{hidden:false,addEventListener(){}},location:{origin:'http://test.local',href:'http://test.local/static/oral/index.html'},fetch:async path=>({json:async()=>path==='delf-cards.json'?delfCards:bank}),Date:ExamDate,URL,Blob,setTimeout,clearTimeout,performance,crypto:webcrypto,structuredClone,btoa,atob,console});
 const module=new vm.SourceTextModule(source,{context,identifier:'local-client.js'});
 await module.link(name=>name==='./delf-exam.js'?new vm.SourceTextModule(delfSource,{context}):name==='./browser-client.js'?new vm.SyntheticModule(['createBrowserOralCall'],function(){this.setExport('createBrowserOralCall',native=>native);},{context}):name==='./browser-store.js'?new vm.SyntheticModule(['getOralAudio','sessionAudioIds'],function(){this.setExport('getOralAudio',async()=>null);this.setExport('sessionAudioIds',()=>[]);},{context}):new vm.SyntheticModule(['oralCall'],function(){this.setExport('oralCall',call);},{context}));
 await module.evaluate();
 const channel=window.QihangOralClient.createSocket();channel.onmessage=e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));else audioFrames.push(e.data);};
 async function until(condition){const end=performance.now()+5000;while(!condition()){assert.ok(performance.now()<end,'test condition timed out');await new Promise(r=>setTimeout(r,5));}}
 async function command(action,expected='ack',values={}){const request=webcrypto.randomUUID();channel.send(JSON.stringify({action,request,mode:'practice',part:'intro',...values}));await until(()=>messages.some(m=>m.request===request));const reply=messages.find(m=>m.request===request);assert.equal(reply.type,expected,reply.message);}
 await until(()=>channel.readyState===1);if(!options.skipStart){await command('start');await until(()=>!channel.inFlight);}
 return{pushNative(event){nativeEvents.push({...event,seq:++cursor});},advanceClock(seconds){clock+=seconds*1000;},channel,messages,audioFrames,polls,sent,sessions,until,command,recognitionArgs,client:window.QihangOralClient};
}

let passed=0;
{
 const t=await fixture([{state:'done',text:'Je suis étudiant.',elapsedMs:4,backend:'gpu',modelLoadMs:0,inferenceMs:3,encoderMs:2,decoderMs:1,threads:16}]);
 try{
  await t.command('record_start');await t.command('record_stop');await t.until(()=>t.sent.length===2);
  assert.equal(t.polls.length,1);assert.ok(t.polls[0]<250,`Ready result unnecessarily delayed ${t.polls[0]}ms`);
  await t.until(()=>!t.channel.inFlight);
  const saved=[...t.sessions.values()][0],row=saved.messages.find(m=>m.role==='user');
  assert.equal(row.confirmed_text,'Je suis étudiant.');assert.equal(row.audio,'test-recording-1');assert.equal(row.reply_delivered,true);
  assert.equal(row.recognition.backend,'gpu');assert.equal(row.recognition.model_load_ms,0);assert.equal(row.recognition.inference_ms,3);
  passed++;
 }finally{t.channel.close();}
}
{
 const t=await fixture([{state:'running',phase:'transcribing',elapsedMs:10},{state:'done',text:'Bonjour.',elapsedMs:100}]);
 try{
  await t.command('record_start');await t.command('record_stop');await t.until(()=>t.sent.length===2);
  assert.ok(t.polls[0]<250);assert.ok(t.polls[1]-t.polls[0]>=100&&t.polls[1]-t.polls[0]<400);
  passed++;
 }finally{t.channel.close();}
}
{
 const t=await fixture([{state:'failed',error:'isolated recognizer failure'}]);
 try{
  await t.command('record_start');await t.command('record_stop');await t.until(()=>t.channel.recognizingRow===null);
  assert.equal(t.sent.length,1,'Failed recognition must not be sent to the examiner');
  const saved=[...t.sessions.values()][0],row=saved.messages.find(m=>m.role==='user');
  assert.equal(row.audio,'test-recording-1');assert.equal(row.recognition_status,'failed');assert.equal(row.confirmation_status,'not_sent');
  passed++;
 }finally{t.channel.close();}
}
{
 const t=await fixture([],{prepared:false,skipStart:true});
 try{await t.command('start','error');assert.equal(t.sessions.size,0,'Preparation must not create a premature exam session');passed++;}
 finally{t.channel.close();}
}
{
 const t=await fixture([],{failedSaves:1,skipStart:true});
 try{
  await t.command('start','error');assert.equal(t.channel.session,null,'Failed save must not leave a phantom active session');
  assert.equal(t.sessions.size,0);assert.equal(t.sent.length,0,'Unsaved practice must not contact the examiner');
  await t.command('start');await t.until(()=>!t.channel.inFlight);
  assert.equal(t.sessions.size,1);assert.equal(t.sent.length,1,'Retry should open exactly one practice');passed++;
 }finally{t.channel.close();}
}
{
 for(const experimental of [false,true]){
  const t=await fixture([{state:'done',text:'Bonjour.',audioContext:512,shortAudioRequested:experimental,nativeLibrary:'arm64-fp16-dotprod',elapsedMs:10,encoderMs:7}],{shortAudioExperiment:experimental});
  try{
   await t.command('record_start');await t.command('record_stop');await t.until(()=>t.sent.length===2);await t.until(()=>!t.channel.inFlight);
   assert.equal(t.recognitionArgs[0].shortAudio,experimental,'Only opted-in experiment may shorten context');
   const row=t.channel.session.messages.find(m=>m.role==='user');assert.equal(row.recognition.audio_context,512);assert.equal(row.recognition.short_audio_requested,experimental);assert.equal(row.recognition.native_library,'arm64-fp16-dotprod');
   if(experimental){t.client.setShortAudioMode(false);await t.command('record_start');await t.command('record_stop');await t.until(()=>t.sent.length===3);assert.equal(t.recognitionArgs[1].shortAudio,false,'Closing the switch restores full context on next turn');}
  }finally{t.channel.close();}
 }
 passed++;
}
for(const level of ['A2','B1','B2']){
 const t=await fixture([{state:'done',text:'Je pense que le sujet mérite un débat.'}],{skipStart:true});
 const s=()=>t.channel.session;
 const command=(name,values)=>t.command(name,'ack',values);
 const expire=async seconds=>{t.advanceClock(seconds);await command('clock');await t.until(()=>!t.channel.inFlight);};
 const choose=async part=>{const [a,b]=s().drawn[part];assert.notEqual(a.id,b.id);await command('choose_card',{part,id:b.id});};
 try{
  await command('start',{part:'full',mode:'simulation',level});
  assert.equal(s().phase,'selecting');
  assert.equal(t.sent.length,0);
  if(level==='B1')await t.command('choose_card','error',{part:'interaction',id:s().drawn.interaction[0].id});
  await t.command('commit_choices','error');
  for(const part of {A2:['monologue','interaction'],B1:['opinion'],B2:['presentation']}[level])await choose(part);
  await command('commit_choices');
  assert.equal(s().phase,'preparation');
  assert.equal(s().prep_until-Date.now()/1000<=(level==='B2'?1800:600),true);
  await t.command('next','error');
  await t.command('record_start','error');
  await expire(level==='B2'?1799:599);
  assert.equal(s().phase,'preparation');
  await expire(1);
  assert.equal(s().phase,'active');
  if(level==='B2'){
   assert.equal(t.sent.length,0,'Examiner stays silent during presentation');
   await command('record_start');
   await expire(420);
   assert.equal(s().stage_index,0,'Time expiry must preserve the in-progress recording');
   await command('record_stop');await t.until(()=>!t.channel.recognizingRow);
   assert.equal(t.sent.length,0,'Do not send presentation as an interactive turn');
   await expire(0);
   assert.equal(t.sent.at(-1).task.stage,'debate');
   assert.equal(t.sent.at(-1).task.card.id,s().chosen.presentation.id);
   assert.equal(t.sent.at(-1).task.recent_dialogue[0].text,'Je pense que le sujet mérite un débat.');
   await expire(780);
   assert.ok(s().ended);
   assert.equal(t.sent.at(-1).task.mode,'evaluation');
   assert.equal(t.sent.at(-1).task.learner_rows[0].stage,'presentation');
  }else{
   assert.equal(t.sent.at(-1).task.stage,'intro');
   await expire(level==='A2'?90:180);
   if(level==='B1'){
    assert.equal(s().phase,'selecting');
    await choose('interaction');await command('commit_choices');
    assert.equal(s().phase,'active');await expire(240);
    assert.equal(s().stages[s().stage_index],'opinion');
   }else assert.equal(s().stages[s().stage_index],'monologue');
   await command('record_start');await command('record_stop');
   await t.until(()=>!t.channel.recognizingRow&&!t.channel.inFlight);
   assert.equal(t.sent.at(-1).task.card.id,s().chosen[s().stages[s().stage_index]].id);
   if(level==='A2')await expire(120);
   await expire(level==='A2'?210:420);
   assert.ok(s().ended);
  }
  passed++;
 }finally{clearTimeout(t.channel.evalDeadline);t.channel.close();}
}

for(const level of ['A2','B1','B2']){
 const t=await fixture([],{skipStart:true});
 try{
  await t.command('start','ack',{level,part:'full',mode:'simulation'});
  const s=t.channel.session;
  for(const part of {A2:['monologue','interaction'],B1:['opinion'],B2:['presentation']}[level])
   await t.command('choose_card','ack',{part,id:s.drawn[part][0].id});
  await t.command('commit_choices');
  assert.equal(s.phase,'preparation');
  await t.command('skip_preparation');
  assert.equal(s.phase,'active');
  assert.ok(s.events.some(e=>e.type==='preparation_skipped'));
  await t.until(()=>!t.channel.inFlight);
  if(level!=='B2'){
   const optionsRow={id:'closing-row',role:'user',stage:'intro',confirmed_text:'Bonjour',confirmation_status:'automatic'};
   s.messages.push(optionsRow);
   t.channel.inFlight={turn:{turn_id:'held-turn'},row:optionsRow.id};
   t.advanceClock(200);
   await t.command('clock');
   assert.equal(s.stage_index,0,'Must wait for the examiner reply');
   await t.channel.event({type:'turn_end'});
   await t.command('clock','ack',{playback_busy:true});
   assert.equal(s.stage_index,0,'Must also wait for queued audio playback');
   await t.command('clock');
   assert.equal(s.stage_index,1);
  }
  passed++;
 }finally{t.channel.close();}
}
{
 const options={};
 const t=await fixture([{state:'done',text:'Je suis étudiant.'}],options);
 try{
  await t.command('record_start');await t.command('record_stop');
  await t.until(()=>!t.channel.recognizingRow&&!t.channel.inFlight);
  options.manualReplies=true;
  await t.command('end');
  await t.until(()=>t.channel.evaluation);
  const s=t.channel.session,turn=s.evaluation.request_id;
  t.pushNative({type:'evaluation',request_id:turn,result:{summary:'中文文字评价',stages:[]}});
  await t.until(()=>s.evaluation.status==='ready');
  assert.ok(t.channel.evaluation,'Keep evaluation routing alive until its speech ends');
  t.pushNative({type:'audio',turn,pcm:btoa('\0'.repeat(40)),rate:24000});
  t.pushNative({type:'reply_recording',turn,audio:'evaluation-recording'});
  t.pushNative({type:'turn_end',turn});
  await t.until(()=>!t.channel.evaluation);
  assert.equal(s.evaluation.audio,'evaluation-recording');
  assert.equal(s.evaluation.voice_status,'ready');
  assert.equal(t.sessions.get(s.id).evaluation.audio,'evaluation-recording');
  passed++;
 }finally{clearTimeout(t.channel.evalDeadline);t.channel.close();}
}

{
 const t=await fixture([{state:'done',text:'Je lis.'}],{manualReplies:true,skipStart:true});
 try{
  await t.command('start');
  const s=t.channel.session,turn=t.sent[0].task.turn_id;
  const first="Et qu'est-",second='ce que vous faites pendant votre temps libre ?';
  t.pushNative({type:'sentence',turn,text:first});
  t.pushNative({type:'audio',turn,rate:24000,pcm:btoa('AB')});
  await t.until(()=>t.channel.heldReply?.size===2);
  assert.equal(t.audioFrames.length,0,'Do not play an unfinished phrase by itself');
  t.pushNative({type:'sentence',turn,text:second});
  t.pushNative({type:'audio',turn,rate:24000,pcm:btoa('CD')});
  t.pushNative({type:'reply_recording',turn,audio:'examiner-complete'});
  t.pushNative({type:'turn_end',turn});
  await t.until(()=>!t.channel.inFlight);
  assert.equal(s.messages.length,1);
  assert.equal(s.messages[0].text,first+second);
  assert.equal(s.messages[0].audio,'examiner-complete');
  assert.equal(t.audioFrames.length,1);
  assert.equal(Buffer.from(t.audioFrames[0]).subarray(4).toString('ascii'),'ABCD');

  const old=[
   {...s.messages[0],text:first,audio:null},
   {...s.messages[0],text:second},
   {...s.messages[0],text:'Très bien.',request_id:'next-turn'},
  ];
  const displayed=t.client.displayMessages(old);
  assert.equal(old.length,3);
  assert.equal(displayed.length,2);
  assert.equal(displayed[0].text,first+second);
  assert.equal(displayed[0].audio,'examiner-complete');

  await t.command('record_start');await t.command('record_stop');
  await t.until(()=>t.sent.length===2);
  const next=t.sent[1].task.turn_id;
  t.pushNative({type:'sentence',turn:next,text:'Très bien.'});
  t.pushNative({type:'audio',turn:next,rate:24000,pcm:btoa('EF')});
  await t.until(()=>t.audioFrames.length===2);
  assert.ok(t.channel.inFlight,'Complete sentences still stream before turn end');
  t.pushNative({type:'turn_end',turn:next});
  await t.until(()=>!t.channel.inFlight);
  passed++;
 }finally{t.channel.close();}
}
console.log(`Local client: ${passed} groups passed; isolated native bridge, no personal data.`);
