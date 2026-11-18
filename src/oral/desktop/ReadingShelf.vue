<script setup>
import {computed, nextTick, onMounted, ref} from 'vue'
const props=defineProps({packs:Array, lessons:Object, inProgress:Object, positions:Object, resumeNotes:Boolean, queue:Array, selected:String, notebook:Boolean, notice:String})
const emit=defineEmits(['open','report','notebook','practice','resume','export'])
const tab=ref('daily'), shelf=ref(null)
const grouped=computed(()=>{
  const groups=new Map()
  for(const p of [...props.packs].sort((a,b)=>a.unit-b.unit||a.lesson-b.lesson)){
    const name=p.book?.fr||p.book||p.source?.split(' · ')[0]||'Inspire 1'
    const label=name+' · Unité '+p.unit
    if(!groups.has(label))groups.set(label,[])
    groups.get(label).push(p)
  }
  return groups
})
const dueGroups=computed(()=>props.packs.map(pack=>({pack,items:props.queue.filter(r=>r.textId===pack.id)})).filter(g=>g.items.length))
const date=n=>new Date(n*1000).toLocaleDateString('zh-CN')
const pct=n=>n==null?'—':Math.round(n*100)+'%'
function progressWidth(id){
  if(!props.inProgress[id])return props.lessons[id]?.completed?'100%':'0%'
  const saved=props.positions[id]
  return saved?.total?pct(saved.completed/saved.total):'0%'
}
onMounted(async()=>{
  await nextTick()
  const last=shelf.value?.querySelector('[data-last="true"]')
  if(last && last.getBoundingClientRect().bottom>innerHeight)last.scrollIntoView({block:'center'})
})
</script>
<template>
<section ref="shelf" class="library landing narrow">
  <header class="lib-heading"><div><p class="overline">{{notebook?'Carnet de lecture':'Lecture'}}</p><h1>{{notebook?'需练习本':'读课文'}}</h1></div>
    <button v-if="!notebook" class="secondary booklet" @click="emit('notebook')">需练习本 <b>{{queue.length}}</b> ↗</button>
    <button v-else class="text-link" @click="emit('export')">导出朗读记录 ↓</button>
  </header>
  <p v-if="notice" class="notice" role="status">{{notice}}</p>
  <template v-if="!notebook">
    <p v-if="!packs.length" class="muted">本机还没有可朗读的课文。</p>
    <section v-for="[label,items] in grouped" :key="label" class="lesson-group">
      <h2 class="lesson-group-heading">{{label}} <small>{{items.length}} 篇</small></h2>
      <article v-for="p in items" :key="p.id" class="lesson-card glass" :data-last="selected===p.id">
        <button class="lesson-select-main" @click="emit('open',p.id)">
          <span class="lesson-number">Leçon <b>{{p.lesson}}</b></span>
          <span class="lesson-title"><strong lang="fr">{{p.title.fr}}</strong><small>{{p.title.zh}} · {{p.sentences.length}} 句</small></span>
          <span v-if="lessons[p.id]?.crown" class="crown" title="本版课文曾在一轮首读中全词读准">♛ 全对</span>
          <span class="row-tail">{{inProgress[p.id]?'继续朗读':lessons[p.id]?.completed?'再读':'去朗读'}} →</span>
        </button>
        <div class="thin-progress" aria-hidden="true"><i :style="{width:progressWidth(p.id)}"/></div>
        <div class="lesson-card-actions" v-if="lessons[p.id]"><span>上次 {{date(lessons[p.id].at)}} · 覆盖 {{pct(lessons[p.id].coverage)}} · 准确 {{pct(lessons[p.id].accuracy)}} · 红句 {{lessons[p.id].red}}</span>
          <button class="text-link" :aria-label="'查看 Leçon '+p.lesson+' 的上次报告'" @click="emit('report',p)">查看 ↗</button></div>
        <div v-if="inProgress[p.id]&&positions[p.id]" class="lesson-card-actions"><span>上次停在{{positions[p.id].label}}</span></div>
        <div class="lesson-card-actions" v-else-if="!lessons[p.id]"><span>{{inProgress[p.id]?'练习进行中':'尚无完整报告'}}</span></div>
      </article>
    </section>
  </template>
  <template v-else>
    <div class="sections"><button v-for="[id,title] in [['daily','日常'],['exam','考试']]" :aria-pressed="tab===id" :key="id" @click="tab=id">{{title}}</button></div>
    <section v-if="tab==='exam'" class="quiet"><h2>考试复习 <small>待开发</small></h2><p>计划收录 DELF 口语复盘中，你主动选来重练的表达。</p></section>
    <template v-else><div class="lib-heading"><h2>课文朗读 <small>{{queue.length}} 句</small></h2>
      <button v-if="resumeNotes" class="speak batch" @click="emit('resume')">继续上次复习</button>
      <button v-else-if="queue.length" class="speak batch" @click="emit('practice',queue.slice(0,5))">练最久未练的 {{Math.min(queue.length,5)}} 句</button></div>
      <div v-if="!queue.length" class="quiet"><strong>✓ 当前没有待练句</strong><p>同一句练三次还需要提示时，会自动收在这里。</p></div>
      <section v-for="{pack,items} in dueGroups" :key="pack.id" class="lesson-group">
        <h3>Leçon {{pack.lesson}} · {{pack.title.zh}} <small>{{items.length}} 句</small></h3>
        <button v-for="item in items" :key="item.sentenceId" class="note-row" @click="emit('practice',[item])">
          <span><strong lang="fr">{{pack.sentences.find(l=>l.id===item.sentenceId)?.fr}}</strong>
            <small>{{item.focusWords.length?'留意 '+item.focusWords.join(' · '):item.uncertain?'上次收音待确认':'听原声再跟读'}} · 有效未通过 {{item.failures}} 次</small></span><b>听读 →</b>
        </button></section>
    </template>
  </template>
</section>
</template>
<style scoped>
.lib-heading,.lesson-select-main,.lesson-card-actions,.lesson-group-heading,.note-row,.sections{display:flex;align-items:center;gap:14px}.lib-heading,.lesson-card-actions,.note-row{justify-content:space-between}.library{padding-bottom:40px}.lib-heading{margin-bottom:24px}.lib-heading h1{font-size:40px}.booklet{margin:0;font-size:15px}.booklet b{background:var(--mint);padding:3px 8px;border-radius:10px}.library h2,.library h3{font-weight:600}.lesson-group-heading{font-size:18px;margin:25px 0 12px}.library small{color:var(--sub);font:normal 13px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}.lesson-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:13px 16px;margin:10px 0;box-shadow:0 3px 12px #19382906}.lesson-card:hover,.note-row:hover{border-color:#94b49d}.lesson-select-main{border:0;background:transparent;width:100%;min-height:60px;text-align:left;padding:2px 0}.lesson-number{font:17px Georgia,serif;white-space:nowrap;min-width:74px}.lesson-number b{font-size:24px}.lesson-title,.note-row>span{display:grid;gap:5px}.lesson-title strong,.note-row strong{font:22px/1.25 Georgia,serif}.row-tail{margin-left:auto;white-space:nowrap;color:var(--forest);font-size:14px}.crown{color:#795a17;background:#fbefcb;padding:4px 8px;border-radius:8px;font-size:13px}.thin-progress{height:3px;border-radius:4px;background:#e7ede7;margin:9px 0}.thin-progress i{display:block;background:#659273;height:100%}.lesson-card-actions{min-height:33px;color:var(--sub);font-size:13px}.lesson-card-actions button{min-height:36px}.sections{margin:8px 0 26px;border-bottom:1px solid var(--line)}.sections button{min-width:80px;min-height:45px;background:transparent}.sections [aria-pressed=true]{font-weight:bold;border-bottom:3px solid var(--forest)}.note-row{width:100%;border:1px solid var(--line);border-radius:14px;background:white;padding:16px;text-align:left;margin:8px 0}.note-row b{color:var(--forest);font-size:14px;white-space:nowrap}.quiet,.notice{padding:22px;border-radius:16px;background:var(--mint)}.quiet p{color:var(--sub);margin-bottom:0}.batch{font-size:14px;min-height:44px}
.lesson-card{position:relative}.lesson-select-main::after{content:'';position:absolute;inset:0;border-radius:18px}.lesson-card-actions button{position:relative;z-index:1}.lesson-select-main:focus-visible::after{outline:3px solid var(--forest);outline-offset:3px}
</style>
