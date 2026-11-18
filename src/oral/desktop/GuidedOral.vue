<script setup>
import {computed, onMounted, onBeforeUnmount, ref} from 'vue'
import ReadingShelf from './ReadingShelf.vue'
import WordLine from './WordLine.vue'
import {openMicrophone} from './microphone.js'

const base='/api/lecture', scopeKey='qihang-oral-scope-v2'
const view=ref('home'), packs=ref([]), selected=ref(''), queue=ref([]), s=ref(null)
const loading=ref(false), error=ref(''), mic=ref(''), sound=ref(''), heard=ref(false), elapsed=ref(0), celebration=ref(null)
const inProgress=ref({}), records=ref({}), batch=ref([]), batchSize=ref(0), notice=ref('')
const chunkIndex=ref(0)
let chunkTimer
let epoch=0, player, audioURL, recorder, pointer, sessionReady, tick, lastTime=0, closeTimer, feedbackTimer, sending=false
const pack=computed(()=>packs.value.find(p=>p.id===selected.value))
const lines=computed(()=>s.value?.text.sentences||pack.value?.sentences||[])
const key=computed(()=>s.value?.queue[0]||lines.value[0]?.id)
const full=computed(()=>s.value?.phase==='full')
const line=computed(()=>full.value?{fr:lines.value.map(l=>l.fr).join(' ')}:lines.value.find(l=>l.id===key.value)||lines.value[0])
const rows=computed(()=>s.value?.attempts.filter(a=>a.visit===s.value.visit)||[])
const latest=computed(()=>rows.value.at(-1)?.result)
const count=computed(()=>rows.value.length)
const maySkip=computed(()=>count.value>=3)
const stage=computed(()=>maySkip.value?'retry':full.value?'full':count.value===2||s.value?.reviewRound&&!count.value?'listen':count.value||s.value?.shortMode?'chunks':'blind')
const report=computed(()=>s.value?.report)
const shortOffer=computed(()=>!count.value&&!s.value?.shortMode&&s.value?.outcomes.length>=2&&s.value.outcomes.slice(-2).every(r=>r.status==='consolidate'&&r.reason!=='audio'))
const isReader=computed(()=>view.value==='read')
const shown=computed(()=>celebration.value?.line||line.value)
const evidence=computed(()=>celebration.value?.result||latest.value)
const chunks=computed(()=>line.value?.chunks||[line.value?.fr])
const shortDisplay=computed(()=>s.value?.shortMode&&stage.value==='chunks'&&!celebration.value&&(!latest.value||mic.value==='live'))
function paceChunks(){
  clearTimeout(chunkTimer)
  if(!shortDisplay.value||mic.value!=='live'||chunkIndex.value>=chunks.value.length-1)return
  const words=chunks.value[chunkIndex.value].split(/\s+/).length
  chunkTimer=setTimeout(()=>{chunkIndex.value++;paceChunks()},Math.max(2000,words*650))
}
const progress=computed(()=>{
  if(celebration.value)return celebration.value.progress
  const total=report.value?.roundTotal??lines.value.length
  const remaining=s.value?.queue.length??total
  const completed=total-remaining
  if(batchSize.value && s.value?.origin==='notebook'){
    const left=remaining+batch.value.length, done=batchSize.value-left
    return {total:batchSize.value,remaining:left,completed:done,position:Math.min(batchSize.value,done+1),full:false}
  }
  return {total,remaining,completed,position:Math.min(total,completed+1),full:full.value}
})
const bookmarkKey=id=>'qihang-guided-position:'+id
const notebookKey='qihang-guided-notebook-v1'
const notebookBookmark=ref(null), positions=ref({})
function get(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
function position(state){
  if(state.phase==='offer')return '篇末复习选择'
  if(state.phase==='full')return '整段连读'
  if(state.phase==='ended')return '本课报告'
  const total=state.report.roundTotal
  return (state.reviewRound?'复练第 ':'第 ')+(total-state.queue.length+1)+' / '+total+' 句'
}
function remember(state){
  if(state.origin==='notebook'){
    const remaining=batch.value.map(({textId,sentenceId})=>({textId,sentenceId}))
    if(state.phase==='ended'&&!remaining.length){
      notebookBookmark.value=null
      return put(notebookKey,null)
    }
    const mark={id:state.id,part:state.part,version:state.text.contentRevision,remaining,total:batchSize.value}
    notebookBookmark.value=mark
    return put(notebookKey,mark)
  }
  const total=state.report.roundTotal
  const mark={id:state.id,label:position(state),completed:total-state.queue.length,total}
  return put(bookmarkKey(state.part),mark)
}
const pct=n=>n==null?'—':Math.round(n*100)+'%'
const apiPost=b=>({method:'POST',headers:{'Content-Type':'application/json','X-Oral-Client':'web'},body:JSON.stringify(b)})
async function response(path,options){
  const res=await (window.QihangOralClient?.fetch||fetch)(path,options)
  if(!res.ok) throw Error((await res.json().catch(()=>({}))).error||'口语服务暂时没有回应。')
  return res
}
async function api(path,options){return (await response(path,options)).json()}
async function catalog(){
  const data=await api(base+'?layout=guided')
  if(!Array.isArray(data.reviewQueue))throw Error('请打开本版桌面预览。')
  packs.value=data.texts; queue.value=data.reviewQueue;records.value=data.lessons||{};inProgress.value=data.inProgress||{}
  positions.value={}
  for(const [part,id] of Object.entries(inProgress.value)){
    const mark=get(bookmarkKey(part))
    if(mark?.id===id)positions.value[part]=mark
  }
  const mark=get(notebookKey)
  notebookBookmark.value=mark?.id && Array.isArray(mark.remaining) &&
    packs.value.some(p=>p.id===mark.part&&p.contentRevision===mark.version)?mark:null
  if(!pack.value)selected.value=packs.value.find(p=>p.id===get(scopeKey))?.id||
    packs.value.find(p=>p.featured)?.id||packs.value[0]?.id||''
}
function stopSound(){if(player){player.onended=player.onerror=null;player.pause();player=null}if(audioURL)URL.revokeObjectURL(audioURL);audioURL='';sound.value=''}
function stopMic(){clearTimeout(closeTimer);clearTimeout(chunkTimer);recorder?.close();recorder=null;pointer=undefined;mic.value=''}
const timeKey=()=>s.value?'qihang-guided-ms:'+s.value.id+':'+s.value.visit:null
function checkpoint(){
  if(lastTime && timeKey()){
    const now=performance.now();elapsed.value+=Math.max(0,now-lastTime);put(timeKey(),elapsed.value)
    lastTime=now
  }
}
function pauseClock(){checkpoint();lastTime=0}
function resetClock(){
  elapsed.value=get(timeKey())||0
  lastTime=view.value==='read'&&!document.hidden&&!celebration.value&&!maySkip.value?performance.now():0
}
function clean(){
  pauseClock();++epoch;clearTimeout(feedbackTimer);celebration.value=null;stopSound();stopMic()
  loading.value=false;sending=false;sessionReady=null;heard.value=false;error.value=''
}
function nav(where,push=true){
  clean();view.value=where
  if(push&&history.state?.atelier!==where) history.pushState({atelier:where},'','')
  window.scrollTo(0,0)
}
async function shelf(where='scope',push=true){
  nav(where,push);s.value=null;batch.value=[];batchSize.value=0
  const v=epoch;loading.value=true
  try{await catalog()}catch(e){if(v===epoch)error.value=e.message}
  finally{if(v===epoch)loading.value=false}
}
function scope(){notice.value='';return shelf()}
async function recover(v){
  const id=inProgress.value[selected.value]
  if(!id)return
  const state=await api(base+'/'+id).catch(e=>{if(!e.message.includes('没有找到'))throw e})
  if(v===epoch && state?.layout==='guided' && state.phase!=='ended' && state.origin!=='notebook')s.value=state
}
async function openLesson(id){
  nav('read');selected.value=id;put(scopeKey,id);s.value=null
  const v=epoch;loading.value=true
  try{await recover(v);if(v===epoch && !s.value)await ensure();if(v===epoch)present()}
  catch(e){if(v===epoch)error.value=e.message}finally{if(v===epoch)loading.value=false}
}
async function ensure(){
  if(s.value)return s.value
  const v=epoch
  const result=await api(base,apiPost({text:selected.value,layout:'guided'}))
  if(v===epoch)s.value=result
  return result
}
async function nextNote(){
  const item=batch.value[0]
  if(!item){
    const part=selected.value
    put(notebookKey,null);notebookBookmark.value=null
    await shelf('notebook')
    if(view.value==='notebook'&&!error.value)notice.value=!queue.value.length?'✓ 这一轮收好了，需练习本已清空。':
      queue.value.some(r=>r.textId===part)?'这一轮已结束，待练句已保存。':'✓ 这一课的待练句已读完。'
    return
  }
  const v=++epoch;loading.value=true
  try{
    const result=await api(base,apiPost({layout:'guided',text:item.textId,warmup:true,steps:[item.sentenceId]}))
    if(v!==epoch)return
    batch.value.shift();selected.value=item.textId;s.value=result;present()
  }catch(e){if(v===epoch){await shelf('notebook');error.value=e.message}}
  finally{if(v===epoch)loading.value=false}
}
function practice(items){
  nav('read');s.value=null;batch.value=[...items];batchSize.value=items.length;notice.value='';nextNote()
}
async function resumeNotebook(){
  const mark=notebookBookmark.value
  if(!mark)return
  nav('read');s.value=null;const v=epoch;loading.value=true
  try{
    const state=await api(base+'/'+mark.id)
    if(v!==epoch)return
    if(state.origin!=='notebook'||state.part!==mark.part||state.text.contentRevision!==mark.version)
      throw Error('课文版本已更新，请从需练习本重新选句。')
    batch.value=mark.remaining.filter(item=>queue.value.some(r=>r.textId===item.textId&&r.sentenceId===item.sentenceId))
    selected.value=state.part;batchSize.value=mark.total;s.value=state;present()
  }catch(e){if(v===epoch){await shelf('notebook');error.value=e.message}}
  finally{if(v===epoch)loading.value=false}
}
function present(){
  clearTimeout(feedbackTimer);celebration.value=null;heard.value=false;chunkIndex.value=0;stopSound()
  remember(s.value)
  if(s.value.phase==='ended'&&s.value.origin==='notebook'&&batchSize.value){nextNote();return}
  if(s.value.phase==='offer'||s.value.phase==='ended'){
    pauseClock();view.value=s.value.phase==='offer'?'offer':'report';return
  }
  resetClock()
  if(stage.value==='listen'&&view.value==='read') play(1)
}
async function play(rate){
  if(!s.value||mic.value||stage.value==='blind')return
  stopSound();error.value='';const audio=new Audio();player=audio;sound.value='正在准备原声…'
  try{
    const blob=await (await response(base+'/'+s.value.id+'/clip/'+key.value)).blob()
    if(player!==audio)return
    audioURL=URL.createObjectURL(blob);audio.src=audioURL;audio.playbackRate=rate
    audio.onended=()=>{sound.value='';heard.value=true}
    audio.onerror=()=>{sound.value='';error.value='原声未能播放，点「重播原声」再试。'}
    await audio.play();if(player===audio)sound.value='正在听教材原声…'
  }catch{if(player===audio){sound.value='';error.value='请点「重播原声」开始播放。'}}
}
async function action(name){
  if(loading.value && name!=='timeout')return
  const old=s.value;if(!old)return
  const v=++epoch;pauseClock();stopMic();stopSound();clearTimeout(feedbackTimer);celebration.value=null;loading.value=true;error.value=''
  try{
    const result=await api(base+'/'+old.id+'/'+old.revision+'/advance',apiPost({action:name}))
    if(v!==epoch)return
    s.value=result;view.value='read';present()
  }catch(e){
    if(v===epoch){error.value=e.message;const fresh=await api(base+'/'+old.id).catch(()=>null)
      if(v===epoch&&fresh){s.value=fresh;present()}}
  }finally{if(v===epoch){loading.value=false;sending=false}}
}
function clock(){
  if(view.value!=='read'||!s.value||celebration.value||document.hidden||loading.value||mic.value||maySkip.value)return
  if(!lastTime)lastTime=performance.now()
  checkpoint()
  if(elapsed.value>=90000)action('timeout')
}
function visibility(){if(document.hidden){pauseClock();if(['open','live'].includes(mic.value))stopMic()}else if(view.value==='read')resetClock()}
const locked=computed(()=>loading.value||!!sound.value||sending&&mic.value==='sending'||!!celebration.value||stage.value==='listen'&&!heard.value)
async function press(){
  if(!isReader.value||locked.value||mic.value)return
  error.value='';const v=epoch
  if(!s.value)return
  mic.value='open';const c=openMicrophone();recorder=c
  sessionReady=ensure()
  try{
    await Promise.all([c.ready,sessionReady])
    if(v!==epoch||c!==recorder)return
    if(!lastTime)resetClock()
    chunkIndex.value=0;mic.value='live';paceChunks();closeTimer=setTimeout(release,full.value?85000:45000)
  }catch(e){if(v===epoch){stopMic();error.value=e.name==='NotAllowedError'?'请在地址栏允许使用麦克风。':e.message}}
}
async function release(){
  if(!recorder||sending)return
  if(mic.value==='open'){stopMic();error.value='麦克风准备好后，再按住读一遍。';return}
  pauseClock();sending=true;mic.value='sending';clearTimeout(closeTimer)
  const v=epoch,c=recorder,old=s.value,oldLine=line.value,oldProgress=progress.value
  try{
    const blob=await c.finish()
    if(v!==epoch)return
    if(!blob||blob.size<3200)throw Error('这段录音太短，请按住读完再松开。')
    const result=await api(base+'/'+old.id+'/'+old.revision+'/record?attempt='+crypto.randomUUID(),{method:'POST',headers:{'X-Oral-Client':'web'},body:blob})
    if(v!==epoch)return
    pauseClock();s.value=result;remember(result);stopMic();sending=false
    if(result.visit!==old.visit){
      const a=result.attempts.at(-1)
      if(a?.visit===old.visit&&a.result.status==='pass'){
        const completed=oldProgress.completed+1
        celebration.value={line:oldLine,result:a.result,assisted:a.stage!=='blind',
          progress:{...oldProgress,completed,remaining:oldProgress.total-completed}}
        feedbackTimer=setTimeout(present,1800)
      }else present()
    }else present()
  }catch(e){if(v===epoch)error.value=e.message}
  finally{if(v===epoch){sending=false;stopMic()}}
}
function down(e){if(e.button!==0||locked.value||mic.value)return;pointer=e.pointerId;e.currentTarget.setPointerCapture(pointer);press()}
function up(e){if(pointer===e.pointerId){pointer=undefined;release()}}
function click(e){if(e.detail===0){if(mic.value==='live')release();else press()}}
const canSave=computed(()=>s.value&&['read','offer'].includes(view.value)&&s.value.phase!=='ended')
const exitBusy=computed(()=>loading.value||!!mic.value)
async function saveExit(){
  if(!canSave.value||exitBusy.value)return
  const state=s.value, notebook=state.origin==='notebook'
  if(!remember(state)&&notebook){error.value='无法保存本轮复习位置，请允许浏览器使用本地存储后重试。';return}
  notice.value=notebook?'复习进度已保存。':('第 '+state.text.lesson+' 课进度已保存 · '+position(state))
  await shelf(notebook?'notebook':'scope')
}
function beforeUnload(e){
  if(mic.value){e.preventDefault();e.returnValue=''}
}
function back(){
  if(['scope','notebook','read','offer','report'].includes(view.value)){
    if(view.value==='scope')nav('games')
    else shelf(view.value==='read'&&batchSize.value?'notebook':'scope')
  }else nav('home')
}
function pop(e){
  const route=e.state?.atelier
  if(route==='scope'||route==='notebook'||route==='read'||route==='report')shelf(route==='notebook'?'notebook':'scope',false)
  else nav(route==='games'?'games':'home',false)
}
function blur(){if(['open','live'].includes(mic.value))stopMic()}
async function lastReport(p){
  const v=epoch
  try{const result=await api(base+'/'+records.value[p.id].sessionId)
    if(v!==epoch)return
    nav('report');selected.value=p.id;s.value=result}
  catch(e){if(v===epoch)error.value=e.message}
}
async function exportLibrary(){
  try{const blob=await (await response(base+'/library/backup')).blob(),a=document.createElement('a')
    a.href=URL.createObjectURL(blob);a.download='朗读学习记录.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)}
  catch(e){error.value=e.message}
}
async function download(){
  try{const blob=await (await response(base+'/'+s.value.id+'/export')).blob(),a=document.createElement('a')
    a.href=URL.createObjectURL(blob);a.download='Lecture-'+s.value.id+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)
  }catch(e){error.value=e.message}
}
const message=computed(()=>{
  if(mic.value==='live')return '正在录音，松手识别。'
  if(mic.value==='open')return '正在准备麦克风…'
  if(mic.value==='sending')return '正在本机识别…'
  if(celebration.value){
    if(celebration.value.assisted)return '✓ 跟着提示，你把整句读下来了。'
    let run=0
    for(const row of [...s.value.outcomes].reverse()){
      if(row.reason==='audio')continue
      if(row.passKind!=='independent')break
      run++
    }
    return run>1?'✓ 连续独立读准 '+run+' 句。':'✓ 这句读全了。'
  }
  if(sound.value)return sound.value
  if(stage.value==='retry')return '你可以继续读，也可以跳过，篇末再练。'
  if(stage.value==='listen')return '先听示范，再看着原句跟读。'
  if(stage.value==='chunks'){
    const words=latest.value?.words?.filter(w=>w.mark==='bad').map(w=>w.text)||[]
    return latest.value?.status==='uncertain'?'刚才没听清，不计分。这次按词组读。':words.length?'再留意 '+words.join('、')+'，分小段连起来读。':'照着词组读，组与组之间可以停一下。'
  }
  return full.value?'看着整篇原文，连起来读一遍。':'直接读，松手后看哪些词读准了。'
})
const stats=computed(()=>{const data=Object.values(report.value?.lines||{});return [
  ['独立通过',data.filter(r=>r.passKind==='independent').length],['辅助通过',data.filter(r=>r.passKind==='assisted').length],
  ['待巩固',report.value?.due.length],['首读准确率',pct(report.value?.accuracy)]]})
function exam(){location.assign(window.QihangOralClient?'index.html?from=atelier':'/?from=atelier')}
onMounted(()=>{history.replaceState({atelier:'home'},'','');window.addEventListener('popstate',pop);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',clean);tick=setInterval(clock,400)
 window.addEventListener('beforeunload',beforeUnload)
 if(new URLSearchParams(location.search).has('read'))scope()})
onBeforeUnmount(()=>{clearInterval(tick);clean();window.removeEventListener('popstate',pop);window.removeEventListener('blur',blur);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',clean)})
</script>
<template><main class="desk guided">
<header class="mast"><div class="brand"><span class="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>启航法语<span class="divider"/>口语练习</div><nav v-if="view!=='home'"><button v-if="canSave" class="secondary" :disabled="exitBusy" @click="saveExit">保存并退出</button><button v-else-if="view!=='games'" class="back" @click="back">← {{view==='scope'?'日常练习':view==='read'&&batchSize?'需练习本':'课次列表'}}</button><button class="back" :disabled="canSave&&exitBusy" @click="nav('home')">模式选择</button></nav></header>
<p class="alert" role="alert" v-if="error">{{error}} <button v-if="['scope','notebook'].includes(view)" @click="shelf(view,false)">重试</button></p>
<section v-if="view==='home'" class="landing"><p class="overline">Atelier de français</p><h1>口语练习室</h1><div class="mode-grid">
<button class="mode daily" @click="nav('games')"><span class="card-fr">Pratique</span><span class="bars" aria-hidden="true"><i v-for="(h,i) in [25,45,68,43,80,96,72,47,68,40,24]" :key="i" :style="{'--bar':h+'%'}"/></span><strong>日常练习</strong><span class="card-foot">跟着课本，练好每一句。<b>↗</b></span></button>
<button class="mode exam" @click="exam"><span class="card-fr">Examen</span><span class="exam-label">DELF A1</span><strong>考试模拟</strong><span class="card-foot">进入考场，完成三项口试。<b>↗</b></span></button></div></section>
<section v-else-if="view==='games'" class="landing"><p class="overline">Pratique</p><h1>日常练习</h1><div class="games paire"><button class="game live" @click="scope()"><i class="glyph">Aa</i><em>已上线</em><span>Lecture</span><strong>读课文</strong><small>选一课，看着原文开口。</small></button><article class="game future"><i class="glyph">···</i><em>待开发</em><span>À venir</span><strong>其他模式</strong><small>更多听说练习正在筹备中。</small></article></div></section>
<template v-else-if="view==='scope'||view==='notebook'"><p v-if="loading" class="muted" role="status">正在读取朗读记录…</p>
<ReadingShelf v-else :key="view" :packs="packs" :lessons="records" :selected="get(scopeKey)" :in-progress="inProgress" :positions="positions" :resume-notes="!!notebookBookmark" :queue="queue" :notebook="view==='notebook'" :notice="notice"
  @open="openLesson" @report="lastReport" @notebook="notice='';shelf('notebook')" @resume="resumeNotebook" @practice="practice" @export="exportLibrary"/></template>
<section v-else-if="isReader" class="reader"><p v-if="!s" class="muted">正在准备课文…</p>
<template v-if="pack&&s"><div class="track-head"><span>{{pack.title.zh}} · {{pack.title.fr}}</span><span v-if="progress.full">整段连读</span><span v-else-if="!progress.remaining&&!celebration">本轮已读完 · 待练 0 句</span><span v-else>{{s?.reviewRound?'复练':'本轮'}}第 {{progress.position}} / {{progress.total}} 句 · 待练 {{progress.remaining}} 句</span></div>
<div class="track" role="progressbar" aria-label="本轮已完成" :aria-valuenow="progress.completed" :aria-valuemax="progress.total" aria-valuemin="0"><i :style="{transform:'scaleX('+progress.completed/progress.total+')'}"/></div>
<div class="sentence-box"><p class="overline">{{shown?.role||'Lecture'}} <small v-if="shortDisplay">· {{chunkIndex+1}} / {{chunks.length}}</small></p><h1 :class="{long:full}"><WordLine v-if="shown" :key="s?.revision" :text="shortDisplay?chunks[chunkIndex]:shown.fr" :result="shortDisplay?null:evidence"/></h1><p class="translation">{{shown?.zh}}</p>
<p v-if="!shortDisplay&&!celebration&&['chunks','listen'].includes(stage)&&chunks.length>1" class="chunks" lang="fr"><span v-for="(c,i) in chunks" :key="i">{{c}}</span></p></div>
<div class="controls"><p class="prompt" role="status">{{message}}</p>
<button v-if="['chunks','listen','retry'].includes(stage)&&!celebration" class="secondary" :disabled="!!mic" @click="play(.8)">▷ {{stage==='listen'&&!heard?'重播原声':'慢听 0.8×'}}</button>
<button class="speak" :class="{recording:mic==='live'}" :disabled="locked" @pointerdown="down" @pointerup="up" @pointercancel="stopMic" @click="click">{{mic==='live'?'松手识别':mic==='sending'?'识别中…':maySkip?'按住继续读':stage==='chunks'?'按词组读':stage==='listen'?'按住跟读':'按住说话'}}</button>
<button v-if="maySkip&&!celebration" class="text-link" :disabled="loading||!!mic" @click="action('skip')">先跳过这句 →</button>
<p v-if="!celebration&&!maySkip&&elapsed>=45000" class="muted">{{elapsed>=70000?'这句会替你留到下次。':'可以分小段读，稍后也能回来看。'}}</p>
<button v-if="shortOffer&&!mic&&!celebration" class="text-link" @click="action('short')">接下来按短句练</button>
</div></template></section>
<section v-else-if="view==='offer'&&report" class="landing narrow"><p class="overline">{{pack.title.fr}}</p><h1>要再读一遍吗？</h1><p>整篇已经读完，还有 {{report.due.length}} 句待巩固。只练这几句，先听原声再读。</p><ol class="list"><li v-for="id in report.due" :key="id"><strong>{{lines.find(l=>l.id===id)?.fr}}</strong></li></ol><div class="actions"><button class="speak" :disabled="loading" @click="action('review')">好，再试一次</button><button class="secondary" :disabled="loading" @click="action('finish')">先看报告</button></div></section>
<section v-else-if="view==='report'&&report" class="landing narrow"><p class="overline">Bilan · {{s.text.title.fr}}</p><h1>本课朗读报告</h1><div class="metrics"><div v-for="[label,value] in stats" :key="label"><small>{{label}}</small><strong>{{value}}</strong></div></div>
<p class="muted">有效首读 {{report.valid}} / {{lines.length}} 句 · 首读覆盖率 {{pct(report.coverage)}} · 本轮独立连击 {{report.best}} 句</p><p v-if="report.words.length">重点词　{{report.words.map(([w])=>w).join(' · ')}}</p>
<ol class="list"><li v-for="l in lines" :key="l.id"><strong>{{l.fr}}</strong><span>{{report.lines[l.id]?.status==='passed'?(report.lines[l.id].passKind==='independent'?'独立通过':'辅助通过'):report.lines[l.id]?'待巩固':'本轮未练'}} · 首读 {{pct(report.first[l.id]?.accuracy)}}</span></li></ol>
<div class="actions"><button class="speak" @click="scope()">换一课</button><button v-if="s.phase==='ended'" class="secondary" :disabled="loading" @click="action('full')">整段连读</button><button class="text-link" @click="download">导出记录</button></div></section>
</main></template>
<style scoped>
.paire{grid-template-columns:1fr 1fr}.future{border:1px dashed #afc4b5;background:#f1f5ef}.scope-intro,.warm{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.scope-intro{padding:5px 0 22px}.scope-intro h1{font-size:30px}.warm{background:#e7efe5;border-radius:12px;padding:0 14px;margin-top:14px}.chunks{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}.chunks span{background:#e6efe4;border-radius:8px;padding:7px 11px;font:18px Georgia,serif}.guided .sentence-box{padding:clamp(24px,5vh,50px) 0 14px}.game.live em{color:#28583d}.controls>.text-link{display:block;margin:auto}.scope-intro .scope select{max-width:240px}
</style>
