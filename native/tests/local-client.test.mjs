import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const source=await fs.readFile(new URL('../../src/oral/local-client.js',import.meta.url),'utf8');
const bank=JSON.parse(await fs.readFile(new URL('../../src/oral/bank-full.json',import.meta.url),'utf8'));
async function fixture(jobs,options={}){
 const sessions=new Map(),nativeEvents=[],sent=[],polls=[],messages=[];
 let cursor=0,recording=0,recognizedAt=0;
 const call=async(method,args={})=>{
  if(method==='status')return{model:{ready:true},recognizer:{ready:options.prepared!==false},provider:{status:'connected',hasTask:false}};
  if(method==='events')return{cursor,events:nativeEvents.filter(e=>e.seq>args.after)};
  if(method==='session.save'){sessions.set(args.session.id,structuredClone(args.session));return{};}
  if(method==='session.get')return structuredClone(sessions.get(args.id));
  if(method==='record.begin')return{audio:'test-recording-'+(++recording)};
  if(method==='record.end')return{audio:'test-recording-'+recording,row:'row-'+recording,duration:2};
  if(method==='recognize'){recognizedAt=performance.now();return{job:'isolated-job',timeoutMs:10000};}
  if(method==='job'){polls.push(performance.now()-recognizedAt);return structuredClone(jobs.length>1?jobs.shift():jobs[0]);}
  if(method==='send'){
   sent.push(structuredClone(args));
   for(const event of [{type:'task_read',turn:args.task.turn_id},{type:'sentence',text:'Bonjour !'},{type:'turn_end',hasAudio:false}])nativeEvents.push({...event,seq:++cursor});
   return{submitted:true};
  }
  return{};
 };
 const window={};window.parent={postMessage(){}};
 const context=vm.createContext({window,parent:window.parent,document:{hidden:false,addEventListener(){}},location:{origin:'http://test.local',href:'http://test.local/static/oral/index.html'},fetch:async()=>({json:async()=>bank}),URL,Blob,setTimeout,clearTimeout,performance,crypto:webcrypto,structuredClone,btoa,atob,console});
 const module=new vm.SourceTextModule(source,{context,identifier:'local-client.js'});
 await module.link(()=>new vm.SyntheticModule(['oralCall'],function(){this.setExport('oralCall',call);},{context}));
 await module.evaluate();
 const channel=window.QihangOralClient.createSocket();channel.onmessage=e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));};
 async function until(condition){const end=performance.now()+5000;while(!condition()){assert.ok(performance.now()<end,'test condition timed out');await new Promise(r=>setTimeout(r,5));}}
 async function command(action,expected='ack'){const request=webcrypto.randomUUID();channel.send(JSON.stringify({action,request,mode:'practice',part:'intro'}));await until(()=>messages.some(m=>m.request===request));const reply=messages.find(m=>m.request===request);assert.equal(reply.type,expected,reply.message);}
 await until(()=>channel.readyState===1);if(!options.skipStart){await command('start');await until(()=>!channel.inFlight);}
 return{channel,messages,polls,sent,sessions,until,command};
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
console.log(`Local client: ${passed} groups passed; isolated native bridge, no personal data.`);
