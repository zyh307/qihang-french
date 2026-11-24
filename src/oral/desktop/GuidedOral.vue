<script setup>
import {computed, onMounted, onBeforeUnmount, ref, shallowRef} from 'vue'
import ReadingShelf from './ReadingShelf.vue'
import FluencyDemo from './FluencyDemo.vue'
import SlotDemo from './SlotDemo.vue'
import PracticeSkills from './PracticeSkills.vue'
import WordLine from './WordLine.vue'
import GameMode from '../../game/GameMode.vue'
import {createRadioPlayer} from '../../game/radioPlayer.js'
import {loadSave as loadGameSave} from '../../game/save.js'
import {beginAdventure, makePracticeRequest, matchesRun, onPracticeEnter, onPracticeExit, pendingAdventure, portalTitle,
  recoverAdventure, settleAdventure} from '../../game/practiceBridge.js'
import {acquirePracticeLease, canPlayPracticeAudio, registerPlayer} from '../../../oral-assistant/web/practice-audio-gate.js'
import {openMicrophone} from './microphone.js'

const base='/api/lecture', scopeKey='qihang-oral-scope-v2'
const dailyBase='/api/daily-practice'
const lectureCard={id:'lecture',title:'读课文',french:'Lecture',description:'逐句读课文，听原声，把容易读错的词读清楚。',
  focus:['发音清晰'],support:['停顿节奏']}
const dailyModes=[
  {id:'fluency',title:'接拍串说',french:'Enchaîner au rythme',description:'把几段短话接起来，练习哪里停、哪里连着说。',
    focus:['停顿节奏'],support:['发音清晰']},
  {id:'slot',title:'看提示换一格',french:'À l’indice, je change un mot',description:'看提示选对词形，再把整句话说出来。',
    focus:['词形准确'],support:['临场应答']},
]
const examSkills={focus:['听题理解','临场应答','组织表达'],support:['词形准确']}
const view=ref('home'), packs=ref([]), selected=ref(''), queue=ref([]), s=ref(null)
const gameAvailable=!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const embedded=window.parent!==window
const gameCharacter=ref(gameAvailable&&loadGameSave().save?.character.id)
const gamePractice=ref(null), gameMapOpen=ref(false), gameReceipt=ref('')
let gameOpening=false, gameSettling=false
const gameRadio=shallowRef(null)
let gameAudioLease, normalAudioLease, unwatchAudio
const normalPractice=ref(null)
function focusPracticeCards(){
  normalPractice.value?.querySelector('button')?.focus()
}
const dailyNotes=ref([]), dailyReview=ref(null), todayRows=ref([])
const dailySettings=ref({})
const dailyCards=computed(()=>dailyModes.filter(mode=>dailySettings.value[mode.id]))
const practiceCards=computed(()=>[lectureCard,...dailyCards.value])
const dailyMode=computed(()=>dailyCards.value.find(mode=>view.value===mode.id))
const loading=ref(false), error=ref(''), mic=ref(''), sound=ref(''), heard=ref(false), elapsed=ref(0), celebration=ref(null)
const inProgress=ref({}), records=ref({}), batch=ref([]), batchSize=ref(0), notice=ref('')
const chunkIndex=ref(0)
let chunkTimer
let epoch=0, player, audioURL, recorder, pointer, sessionReady, tick, lastTime=0, closeTimer, feedbackTimer, sending=false
const pack=computed(()=>gamePractice.value&&s.value?.text||packs.value.find(p=>p.id===selected.value))
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
  if(state.game)return true
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
async function dailyCatalog(){
  const client=window.QihangOralClient
  if(client){
    await client.ready
    if(!client.localService())return
  }
  try{dailySettings.value=(await api(dailyBase)).modes||{}}
  catch{dailySettings.value={}}
}
async function catalog(){
  const [data, notes]=await Promise.all([api(base+'?layout=guided'),api(dailyBase+'/notebook').catch(()=>({items:[]}))])
  if(!Array.isArray(data.reviewQueue))throw Error('请打开本版桌面预览。')
  packs.value=data.texts; queue.value=data.reviewQueue;records.value=data.lessons||{};inProgress.value=data.inProgress||{}
  dailyNotes.value=notes.items
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
  if (where==='adventure') gameRadio.value ??= createRadioPlayer()
  if (where!=='adventure' && !gamePractice.value && view.value==='adventure') gameRadio.value?.cancelPractice()
  if (!['adventure','read','offer','report','fluency','slot'].includes(where) && gameAudioLease) leaveGamePracticeAudio()
  if (!['read','offer','report','fluency','slot'].includes(where)) leaveNormalPracticeAudio()
  clean();dailyReview.value=null;view.value=where
  if(!['read','fluency','slot'].includes(where))gamePractice.value=null
  gameMapOpen.value=false
  gameReceipt.value=''
  if(push&&history.state?.atelier!==where){
    const url=new URL(location.href)
    if(dailyCards.value.some(mode=>mode.id===where))url.searchParams.set('practice',where)
    else url.searchParams.delete('practice')
    if(where==='adventure'||gamePractice.value)url.searchParams.set('game','1')
    else url.searchParams.delete('game')
    if(gamePractice.value)url.searchParams.set('gameRun',gamePractice.value.runId)
    else url.searchParams.delete('gameRun')
    url.searchParams.delete('reviewSession')
    history.pushState({atelier:where},'',url)
  }
  window.scrollTo(0,0)
  if(where==='games')loadToday()
}
function leaveNormalPracticeAudio(){normalAudioLease?.();normalAudioLease=null}
async function enterNormalPracticeAudio(){
  if(normalAudioLease)return true
  const v=epoch
  try {
    const release=await acquirePracticeLease()
    if(v!==epoch){release();return false}
    if(normalAudioLease)release()
    else normalAudioLease=release
    return true
  }catch(err){if(v===epoch)error.value=err.message;return false}
}
function leaveGamePracticeAudio(returning=false){
  const release=gameAudioLease;gameAudioLease=null
  void onPracticeExit(gameRadio.value,release,returning)
}
function returnGame(message='',push=true){
  nav('adventure',push)
  gameMapOpen.value=true
  gameReceipt.value=message
  leaveGamePracticeAudio(true)
}
async function openGamePractice(run,push=true){
  if(run.mode!=='lecture'&&!dailySettings.value[run.mode]){
    returnGame('这个黑洞的练习暂未启用。')
    return
  }
  leaveNormalPracticeAudio()
  const previous=epoch
  if (!gameAudioLease) {
    try {
      const release=await onPracticeEnter(gameRadio.value)
      if (previous!==epoch) { release(); return }
      gameAudioLease ??= release
      if (gameAudioLease!==release) release()
    } catch (err) {
      if (previous===epoch) { leaveGamePracticeAudio(true);error.value=err.message }
      return
    }
  }
  gamePractice.value=run
  s.value=null;batch.value=[];batchSize.value=0
  nav(run.mode==='lecture'?'read':run.mode,push)
  if(!push)history.replaceState({atelier:view.value},'','')
  if(run.mode!=='lecture')return
  const v=epoch
  loading.value=true
  try{
    let state=await recoverAdventure(api,base,run)
    if(v!==epoch)return
    if(!state){
      const {texts}=await api(base+'?layout=guided')
      if(v!==epoch)return
      const lesson=texts.find(text=>text.id==='inspire1-u5-l16-p078-integral')||
        texts.find(text=>text.featured)||texts[0]
      if(!lesson)throw Error('没有可播放的课文，请安装课文后再来。')
      state=await api(base,apiPost({...run,text:lesson.id,layout:'guided'}))
    }
    if(v!==epoch)return
    if(!matchesRun(state,run))throw Error('服务没有返回本次冒险的记录。')
    s.value=state;present()
  }catch(err){if(v===epoch)error.value=err.message}
  finally{if(v===epoch)loading.value=false}
}
async function startGamePractice(nodeId){
  if(gameOpening)return
  const v=epoch
  gameOpening=true
  try{
    const {mode}=makePracticeRequest(nodeId)
    if(mode!=='lecture'&&!dailySettings.value[mode])throw Error('这个黑洞的练习暂未启用。')
    const run=await beginAdventure(nodeId)
    if(v===epoch)await openGamePractice(run)
  }catch(err){if(v===epoch)error.value=err.message}
  finally{gameOpening=false}
}
async function finishGamePractice(state){
  const run=gamePractice.value
  if(!run||gameSettling)return
  gameSettling=true
  try{
    const award=await settleAdventure(state,run)
    if(gamePractice.value?.runId!==run.runId)return
    const name=portalTitle(run.nodeId,[run.nodeId])
    const message=award.coins ? `获得 ${award.coins} 金币${award.unlocked ? ' · 解锁「'+name+'」' : ''}` :
      award.reason==='no-pass' ? '这轮暂无独立通过，冒险可以再试。' :
      award.reason==='daily-limit' ? '冒险完成。这个黑洞今天的金币已领取。' : '这轮冒险已结算。'
    returnGame(message)
  }catch(err){if(gamePractice.value?.runId===run.runId)error.value=err.message}
  finally{gameSettling=false}
}
async function loadToday(){
  const client=window.QihangOralClient
  const v=epoch
  if(client){await client.ready;if(!client.localService())return}
  const now=new Date()
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()/1000
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime()/1000
  try{
    const {modes}=await api(dailyBase+'/today?'+new URLSearchParams({start,end}))
    const labels=[{id:'lecture',title:'读课文'},...dailyModes,{id:'exam',title:'考试模拟'}]
    if(v===epoch)todayRows.value=labels.filter(item=>modes[item.id]).map(item=>({...item,...modes[item.id]}))
  }catch{if(v===epoch)todayRows.value=[]}
}
async function openDailyMode(mode,push=true){
  if(!await enterNormalPracticeAudio())return false
  nav(mode,push)
  return true
}
async function practiceDaily(item){
  if(!await openDailyMode(item.mode))return
  dailyReview.value=item
}
function rememberDailyReview(id){
  if(!dailyReview.value)return
  dailyReview.value={...dailyReview.value,sessionId:id}
  const url=new URL(location.href)
  url.searchParams.set('reviewSession',id)
  history.replaceState({atelier:view.value},'',url)
}
function restoreDailyReview(){
  const id=new URLSearchParams(location.search).get('reviewSession')
  if(id&&dailyMode.value)dailyReview.value={sessionId:id}
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
  if(!await enterNormalPracticeAudio())return
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
async function practice(items){
  if(!await enterNormalPracticeAudio())return
  nav('read');s.value=null;batch.value=[...items];batchSize.value=items.length;notice.value='';nextNote()
}
async function resumeNotebook(){
  const mark=notebookBookmark.value
  if(!mark)return
  if(!await enterNormalPracticeAudio())return
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
  if(!s.value||mic.value||stage.value==='blind'||!canPlayPracticeAudio())return
  stopSound();error.value='';const audio=new Audio();player=audio;sound.value='正在准备原声…'
  try{
    const blob=await (await response(base+'/'+s.value.id+'/clip/'+key.value)).blob()
    if(player!==audio||!canPlayPracticeAudio())return
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
  if(gamePractice.value){returnGame('本轮进度已保存，从原黑洞可以继续。');return}
  const state=s.value, notebook=state.origin==='notebook'
  if(!remember(state)&&notebook){error.value='无法保存本轮复习位置，请允许浏览器使用本地存储后重试。';return}
  notice.value=notebook?'复习进度已保存。':('第 '+state.text.lesson+' 课进度已保存 · '+position(state))
  await shelf(notebook?'notebook':'scope')
}
function beforeUnload(e){
  if(mic.value){e.preventDefault();e.returnValue=''}
}
function back(){
  if(gamePractice.value)returnGame('从原黑洞可以继续这轮冒险。')
  else if(view.value==='adventure')nav('games')
  else if(dailyMode.value)dailyReview.value?shelf('notebook'):nav('games')
  else if(['scope','notebook','read','offer','report'].includes(view.value)){
    if(view.value==='scope')nav('games')
    else shelf(view.value==='read'&&batchSize.value?'notebook':'scope')
  }else nav('home')
}
function pop(e){
  const params=new URLSearchParams(location.search)
  if(gameAvailable&&params.get('game')==='1'){
    const run=pendingAdventure(params.get('gameRun'))
    if(run)openGamePractice(run,false)
    else returnGame('',false)
    return
  }
  if (gamePractice.value || gameAudioLease) leaveGamePracticeAudio()
  gamePractice.value=null
  const route=e.state?.atelier
  if(route==='scope'||route==='notebook'||route==='read'||route==='report')shelf(route==='notebook'?'notebook':'scope',false)
  else if(dailyCards.value.some(mode=>mode.id===route))openDailyMode(route,false).then(entered=>{if(entered)restoreDailyReview()})
  else{
    nav(route==='games'||(route==='adventure'&&gameAvailable)?route:'home',false)
  }
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
function pagehide(){clean();leaveNormalPracticeAudio();if(gamePractice.value||gameAudioLease)leaveGamePracticeAudio()}
onMounted(()=>{unwatchAudio=registerPlayer(stopSound);history.replaceState({atelier:'home'},'','');window.addEventListener('popstate',pop);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);tick=setInterval(clock,400)
 window.addEventListener('beforeunload',beforeUnload)
 const params=new URLSearchParams(location.search)
 const enterGame=gameAvailable&&params.get('game')==='1'
 dailyCatalog().then(async()=>{
   if(enterGame){
     const run=pendingAdventure(params.get('gameRun'))
     if(run&&view.value==='adventure')openGamePractice(run,false)
     return
   }
   const mode=params.get('practice')
   if(!enterGame&&dailyCards.value.some(card=>card.id===mode)){
     if(await openDailyMode(mode,false)){history.replaceState({atelier:mode},'','');restoreDailyReview()}
   }
 })
 if(enterGame){
   nav('adventure',false);history.replaceState({atelier:'adventure'},'','')
 }
 else if(params.has('read'))scope()
 else if(params.has('daily')){
   nav('games',false);history.replaceState({atelier:'games'},'','')
 }})
onBeforeUnmount(()=>{clearInterval(tick);pagehide();gameRadio.value?.dispose();unwatchAudio?.();window.removeEventListener('popstate',pop);window.removeEventListener('blur',blur);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide)})
</script>
<template><main class="desk guided" :class="{'town-desk':embedded&&view==='adventure'}">
<header v-if="!embedded||(view!=='games'&&view!=='adventure')" class="mast"><div v-if="!embedded" class="brand"><span class="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>启航法语<span class="divider"/>口语练习</div><nav v-if="view!=='home'"><button v-if="canSave" class="secondary" :disabled="exitBusy" @click="saveExit">{{gamePractice?'保存并回地图':'保存并退出'}}</button><button v-else-if="view!=='games'&&!(embedded&&view==='scope')" class="back" @click="back">← {{gamePractice?'返回地图':dailyReview||view==='read'&&batchSize?'需练习本':view==='scope'||view==='adventure'||dailyMode?'日常练习':'课次列表'}}</button><button v-if="!embedded" class="back" :disabled="canSave&&exitBusy" @click="nav('home')">模式选择</button></nav></header>
<p class="alert" role="alert" v-if="error">{{error}} <button v-if="['scope','notebook'].includes(view)" @click="shelf(view,false)">重试</button><button v-else-if="gamePractice?.mode==='lecture'&&!s" @click="openGamePractice(gamePractice,false)">重试</button></p>
<section v-if="view==='home'" class="landing"><p class="overline">Atelier de français</p><h1>口语练习室</h1><div class="mode-grid">
<button class="mode daily" @click="nav('games')"><span class="card-fr">Pratique</span><span class="bars" aria-hidden="true"><i v-for="(h,i) in [25,45,68,43,80,96,72,47,68,40,24]" :key="i" :style="{'--bar':h+'%'}"/></span><strong>日常练习</strong><span class="card-foot">跟着课本，练好每一句。<b>↗</b></span></button>
<button class="mode exam exam-practice" aria-labelledby="exam-title" aria-describedby="exam-skills exam-summary" @click="exam">
  <span class="card-fr" lang="fr">Examen</span><span class="exam-label">DELF A1</span><strong id="exam-title">考试模拟</strong>
  <PracticeSkills id="exam-skills" v-bind="examSkills"/>
  <span class="skill-key">外圈主练 · 内圈兼练</span>
  <span id="exam-summary" class="card-foot">听考官提问，练习问答和情景互动。<b aria-hidden="true">↗</b></span>
</button></div></section>
<section v-else-if="view==='games'" class="landing"><p class="overline">Pratique</p><h1>日常练习</h1>
  <div v-if="gameAvailable&&!embedded" class="practice-launches">
    <button class="game-launch normal-launch" @click="focusPracticeCards">
      <span><strong>正常开始</strong><small>直接选择练习</small></span><b aria-hidden="true">↓</b>
    </button>
    <button class="game-launch" @click="nav('adventure')">
      <span><strong>游戏模式</strong><small>{{ gameCharacter ? gameCharacter+' · 继续冒险' : '首次进入 · 创建角色' }}</small></span>
      <b aria-hidden="true">↗</b>
    </button>
  </div>
  <p class="skill-key">口语训练侧重 · 外圈主练 · 内圈兼练</p>
  <div ref="normalPractice" class="games daily-grid">
    <button v-for="mode in practiceCards" :key="mode.id" class="game live radar-card"
      :aria-labelledby="mode.id+'-title'" :aria-describedby="mode.id+'-skills '+mode.id+'-summary'"
      @click="mode.id==='lecture'?scope():openDailyMode(mode.id)">
      <span lang="fr">{{ mode.french }}</span><strong :id="mode.id+'-title'">{{ mode.title }}</strong>
      <PracticeSkills :id="mode.id+'-skills'" :focus="mode.focus" :support="mode.support"/>
      <small :id="mode.id+'-summary'">{{ mode.description }}</small><b class="go" aria-hidden="true">↗</b>
    </button>
  </div>
  <section v-if="todayRows.length" class="today-practice">
    <h2>今日练习</h2>
    <ul>
      <li v-for="row in todayRows" :key="row.id">
        <strong>{{row.title}}</strong>
        <span>完成 {{row.completed}} 轮<template v-if="row.short"> · 短练 {{row.short}} 轮</template></span>
        <span>开口 {{row.speech_seconds === null ? '未记录' : (row.speech_seconds / 60).toFixed(1) + ' 分钟'}}</span>
      </li>
    </ul>
  </section>
</section>
<GameMode v-else-if="view==='adventure'" :auto-enter="gameMapOpen" :return-message="gameReceipt" :radio="gameRadio" :immersive="embedded"
  @adventure="startGamePractice" @leave="nav('games')" @created="id=>gameCharacter=id"/>
<FluencyDemo v-else-if="dailyMode?.id==='fluency'" :request="response" :review="dailyReview" :adventure="gamePractice"
  @game-end="finishGamePractice" @review-session="rememberDailyReview" @return-notebook="shelf('notebook')"/>
<SlotDemo v-else-if="dailyMode?.id==='slot'" :request="response" :review="dailyReview" :adventure="gamePractice"
  @game-end="finishGamePractice" @review-session="rememberDailyReview" @return-notebook="shelf('notebook')"/>
<template v-else-if="view==='scope'||view==='notebook'"><p v-if="loading" class="muted" role="status">正在读取朗读记录…</p>
<ReadingShelf v-else :key="view" :packs="packs" :lessons="records" :selected="get(scopeKey)" :in-progress="inProgress" :positions="positions" :resume-notes="!!notebookBookmark" :queue="queue" :daily-notes="dailyNotes" :daily-modes="dailyCards" :notebook="view==='notebook'" :notice="notice"
  @open="openLesson" @report="lastReport" @notebook="notice='';shelf('notebook')" @resume="resumeNotebook" @practice="practice" @practice-daily="practiceDaily" @export="exportLibrary"/></template>
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
<div class="actions"><button v-if="gamePractice" class="speak" @click="finishGamePractice(s)">结算并返回地图</button>
<template v-else><button class="speak" @click="scope()">换一课</button><button v-if="s.phase==='ended'" class="secondary" :disabled="loading" @click="action('full')">整段连读</button></template><button class="text-link" @click="download">导出记录</button></div></section>
</main></template>
<style scoped>
.today-practice{margin-top:28px}.today-practice ul{list-style:none;padding:0;margin:0}.today-practice li{display:flex;flex-wrap:wrap;gap:8px 18px;padding:9px 0;border-bottom:1px solid var(--line)}.today-practice strong{min-width:120px}.today-practice span{color:var(--sub)}
.skill-key{font-size:13px;line-height:1.5;color:var(--sub);margin:10px 0 0}
.practice-launches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:20px 0 18px}
.game-launch{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:14px 18px;border:1px solid var(--ui-97b8daef3114,#c2d1b5);border-radius:12px;background:var(--ui-e9df8f700601,#e9efdc);color:var(--ui-6277d66cf008,#224b38);text-align:left}
.normal-launch{background:var(--ui-6258ea8d076f,#fffdf6)}
.game-launch strong{font-size:19px;margin-right:14px}.game-launch small{color:var(--ui-d405619ed96c,#405743)}.game-launch>b{font-size:19px}
@media(max-width:550px){.practice-launches{grid-template-columns:1fr;gap:8px}}
.daily-grid{margin-top:16px;grid-template-columns:repeat(3,minmax(0,1fr))}
.daily-grid .radar-card{background:var(--ui-5f87c6bf1465,#f2f7ef);padding:18px 15px;min-width:0}
.radar-card>span[lang]{margin:0;padding-right:35px;font-size:14px;line-height:1.35}
.radar-card>strong{margin:5px 0 10px;line-height:1.25;padding-right:30px}
.radar-card .practice-skills{margin:0 0 11px;background:var(--ui-20366e05df9b,#fcfdfb);border:1px solid var(--ui-99a562a6aa0d,#dce8da);border-radius:12px}
.radar-card small{font-size:14px}
.radar-card .go{right:14px;top:16px}
.exam-practice{--skill-ink:var(--ui-38b6ee1dadec,#384960)}
.exam-practice>strong{margin-top:4px}
.exam-practice .practice-skills{margin-top:8px;background:var(--ui-a814ced23185,#f9fbfe);border:1px solid var(--ui-309774c5c0f8,#dce5ee);border-radius:12px}
.exam-practice .skill-key{align-self:center;margin:6px 0 8px}
@media(max-width:880px){.daily-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.daily-grid{grid-template-columns:1fr}}
.scope-intro,.warm{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.scope-intro{padding:5px 0 22px}.scope-intro h1{font-size:30px}.warm{background:var(--ui-6b55521b9e07,#e7efe5);border-radius:12px;padding:0 14px;margin-top:14px}.chunks{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}.chunks span{background:var(--ui-e876c0c3dea8,#e6efe4);border-radius:8px;padding:7px 11px;font:18px Georgia,serif}.guided .sentence-box{padding:clamp(24px,5vh,50px) 0 14px}.game.live em{color:var(--ui-2e0345654e82,#28583d)}.controls>.text-link{display:block;margin:auto}.scope-intro .scope select{max-width:240px}
</style>
