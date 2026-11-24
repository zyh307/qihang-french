// Persisted, platform-independent matching session. All scoring stays in the controller.
import {groupSize} from '../domain/group-size.js';
const clone = x => JSON.parse(JSON.stringify(x));
export const wordKey = e => `${e.verbe}|${e.temps}`;
const taskKey = e => `${wordKey(e)}|${e.personne}`;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
export function mix(items) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const MATCH_BOARD_SIZE=6;
function mixedTasks(tasks,limit,seed=[]){
  const waiting=mix(tasks),result=[],persons=new Map(),verbs=new Map();
  const remember=task=>{persons.set(task.personne,(persons.get(task.personne)||0)+1);const key=wordKey(task);verbs.set(key,(verbs.get(key)||0)+1);};
  for(const task of seed)remember(task);
  while(result.length<limit&&waiting.length){
    // Spread both person labels and verbs instead of taking the first person
    // from every verb bucket (which could produce a board full of je or tu).
    const score=task=>(persons.has(task.personne)?100:0)+(verbs.get(wordKey(task))||0)*10+(persons.get(task.personne)||0);
    let index=0;for(let i=1;i<waiting.length;i++)if(score(waiting[i])<score(waiting[index]))index=i;
    const [task]=waiting.splice(index,1);result.push(task);remember(task);
  }
  return result;
}
export function smallGroups(items,limit=3) {
  const groups=[],waiting=[...items],size=groupSize(limit,3);
  while(waiting.length){const group=[],lemmas=new Set();for(let i=0;i<waiting.length&&group.length<size;){const entry=waiting[i];if(lemmas.has(entry.verbe)){i++;continue;}group.push(entry);lemmas.add(entry.verbe);waiting.splice(i,1);}groups.push(group);}
  return groups;
}
const require = (ok, text) => { if (!ok) throw new Error(text); };
export class MatchSession {
  constructor(state, env) {
    this.s = state; this.env = env;
    if(state.board&&state.phase==='match'){
      state.board.rule=3;
      if(state.question?.board?.id===state.board.id)state.question.board.rule=3;
    }
    if (state.game_version < 2) {
      state.match_rounds = Math.max(state.phase === 'match' ? state.cycle : 0, state.mode === 'review' || state.entries?.every(e => e.reviewed) ? 1 : 2);
      state.game_version = 2;
      if (state.question) state.question.match_rounds = state.match_rounds;
    }
  }
  static create(entries, options, env) {
    const groups=smallGroups(entries,options.groupSize||3).map(group=>({entries:clone(group)}));
    const s = { game: true, game_version: 1, mode: options.mode || 'learn', direct: Boolean(options.direct), source: options.source || 'learn', level: options.level || '', temps: options.tense || entries[0]?.temps || '现在时', settings: clone(options.settings || {}), groups, cursor: -1, done: 0, completed_words: [], question: null };
    s.game_version = 2;
    s.match_rounds = s.mode === 'review' || entries.every(e => e.reviewed) ? 1 : 2;
    return new MatchSession(s, env);
  }
  activate() {
    const s = this.s;
    if(s.cursor+1>=s.groups.length&&s.learningTailEntries?.length){s.groups.push(...smallGroups(s.learningTailEntries,this.env.groupSize||3).map(entries=>({entries})));s.learningTailEntries=[];s.tailRound=true;}
    if(s.cursor>=0&&this.env.groupSize&&!s.tailRound&&!s.groups.slice(s.cursor+1).some(g=>g.continuation)){const future=s.groups.slice(s.cursor+1).flatMap(group=>group.entries);s.groups.splice(s.cursor+1,Infinity,...smallGroups(future,this.env.groupSize).map(entries=>({entries})));}
    if (++s.cursor >= s.groups.length) return false;
    s.entries = clone(s.groups[s.cursor].entries); s.batch_done = 0; s.decisions = {};
    s.match_rounds = s.mode === 'review' || s.entries.every(e => e.reviewed) ? 1 : 2;
    s.judges = s.entries.map(wordKey);
    s.phase = 'judge'; s.cycle = 0; s.pending = []; s.board = null;
    s.match_retry = {}; s.fill_retry = {}; s.repeating = false;
    const continuation=s.groups[s.cursor].continuation;
    if(continuation){
      Object.assign(s,clone(continuation),{board:null,question:null});
      const keys=new Set(s.entries.map(wordKey));s.pending=s.pending.filter(e=>keys.has(wordKey(e)));s.judges=s.judges.filter(id=>keys.has(id));
      s.match_retry=Object.fromEntries(Object.entries(s.match_retry).filter(([,e])=>keys.has(wordKey(e))));
      s.fill_retry=Object.fromEntries(Object.entries(s.fill_retry).filter(([id])=>keys.has(id.split('|').slice(0,2).join('|'))));
      delete s.groups[s.cursor].continuation;
    }
    return true;
  }
  regroup(limit=3){
    const s=this.s,size=groupSize(limit,3),current=s.groups[s.cursor];
    if(!current||!s.entries?.length)return false;
    const valid=entries=>entries.length<=size&&new Set(entries.map(e=>e.verbe)).size===entries.length;
    // A resumed large group must not replay its already answered person forms.
    // Carry each deferred part at the same phase, match cycle and retry queue.
    if(!valid(s.entries)){
      const active=wordKey(s.question?.verbe?s.question:s.pending?.[0]||s.entries[0]);
      const ordered=[...s.entries].sort((a,b)=>Number(wordKey(b)===active)-Number(wordKey(a)===active));
      const chunks=smallGroups(ordered,size),snapshot={phase:s.phase,cycle:s.cycle,match_rounds:s.match_rounds,repeating:s.repeating,pressureTurn:s.pressureTurn||0};
      const continuation=entries=>{
        const keys=new Set(entries.map(wordKey)),belongs=e=>keys.has(wordKey(e));
        return {...snapshot,judges:(s.judges||[]).filter(id=>keys.has(id)),
          decisions:Object.fromEntries(Object.entries(s.decisions||{}).filter(([id])=>keys.has(id))),
          pending:clone((s.pending||[]).filter(belongs)),
          match_retry:Object.fromEntries(Object.entries(s.match_retry||{}).filter(([,e])=>belongs(e))),
          fill_retry:Object.fromEntries(Object.entries(s.fill_retry||{}).filter(([id])=>keys.has(id.split('|').slice(0,2).join('|'))))};
      };
      const records=chunks.map(entries=>({entries:clone(entries),continuation:continuation(entries)}));
      const first=records.shift();s.entries=first.entries;current.entries=clone(first.entries);
      Object.assign(s,first.continuation);
      if(s.board){
        const keys=new Set(s.entries.map(wordKey));s.board.cards=s.board.cards.filter(e=>keys.has(wordKey(e)));
        const cards=new Set(s.board.cards.map(e=>e.key));
        for(const field of ['left','right','matched_left','matched_right'])s.board[field]=s.board[field].filter(id=>cards.has(id));
        if(s.question?.board)s.question.board=clone(s.board);
      }
      s.groups.splice(s.cursor+1,0,...records);
    }
    const future=s.groups.slice(s.cursor+1),replacement=[];let waiting=[];
    const flush=()=>{replacement.push(...smallGroups(waiting,size).map(entries=>({entries})));waiting=[];};
    for(const group of future){if(group.continuation){flush();for(const entries of smallGroups(group.entries,size)){
      const keys=new Set(entries.map(wordKey)),c=clone(group.continuation);
      c.pending=c.pending.filter(e=>keys.has(wordKey(e)));c.judges=c.judges.filter(id=>keys.has(id));
      c.decisions=Object.fromEntries(Object.entries(c.decisions).filter(([id])=>keys.has(id)));
      c.match_retry=Object.fromEntries(Object.entries(c.match_retry).filter(([,e])=>keys.has(wordKey(e))));
      c.fill_retry=Object.fromEntries(Object.entries(c.fill_retry).filter(([id])=>keys.has(id.split('|').slice(0,2).join('|'))));
      replacement.push({entries,continuation:c});
    }}else waiting.push(...group.entries);}
    flush();s.groups.splice(s.cursor+1,Infinity,...replacement);
    if(s.question){s.question.batch_index=s.cursor+1;s.question.batch_count=s.groups.length;s.question.batch_verbs=s.entries.map(e=>e.verbe);s.question.batch_entries=s.entries.map(e=>({verbe:e.verbe,temps:e.temps}));}
    s.grouping_version=3;return true;
  }
  tasks() { return this.s.entries.filter(e => this.s.decisions[wordKey(e)] !== 1).flatMap(e => e.personnes.map(personne => ({ verbe: e.verbe, temps: e.temps, personne, key: taskKey({ ...e, personne }) }))); }
  matchCards(){
    const chosen=mixedTasks(this.s.pending,MATCH_BOARD_SIZE),used=new Set(chosen.map(e=>e.key));
    const expand=entries=>entries.flatMap(e=>Object.entries(this.env.forms(e.verbe,e.temps)).filter(([,form])=>form&&form!=='—').map(([personne])=>({verbe:e.verbe,temps:e.temps,personne,key:taskKey({...e,personne}),filler:true})));
    const pool=expand(this.s.entries);
    const add=entries=>{const tasks=expand(entries);pool.push(...tasks);for(const task of mixedTasks(tasks.filter(e=>!used.has(e.key)),MATCH_BOARD_SIZE-chosen.length,chosen)){chosen.push(task);used.add(task.key);}};
    if(chosen.length<MATCH_BOARD_SIZE)add(this.s.entries);
    if(chosen.length<MATCH_BOARD_SIZE){
      const verbs=new Set(this.s.entries.map(e=>e.verbe)),extra=[];
      for(const e of [...this.s.groups.flatMap(g=>g.entries),...(this.env.supplementary?.()||[])]){
        if(verbs.has(e.verbe))continue;if(verbs.size>=3)break;verbs.add(e.verbe);extra.push(e);
      }
      add(extra);
    }
    // A retry queue can contain only one person. Keep its tasks pending and
    // replace duplicate-person slots with valid support cards from this group.
    const pending=new Map(this.s.pending.map(task=>[task.key,task])),target=Math.min(3,new Set(pool.map(task=>task.personne)).size,chosen.length);
    while(new Set(chosen.map(task=>task.personne)).size<target){
      const counts=new Map();for(const task of chosen)counts.set(task.personne,(counts.get(task.personne)||0)+1);
      const candidate=mixedTasks(pool.filter(task=>!used.has(task.key)&&!counts.has(task.personne)),1,chosen)[0];
      let index=-1;for(let i=chosen.length-1;i>=0;i--)if(counts.get(chosen[i].personne)>1){index=i;break;}
      if(!candidate||index<0)break;
      used.delete(chosen[index].key);chosen[index]=pending.get(candidate.key)||candidate;used.add(candidate.key);
    }
    return chosen.map(e=>({...e,form:this.env.forms(e.verbe,e.temps)[e.personne]}));
  }
  remaining() {
    const s = this.s, rounds = s.match_rounds + 1;
    const future = s.groups.slice(s.cursor + 1).reduce((n, g) => n + g.entries.length, 0);
    if (s.cursor >= s.groups.length) return 0;
    if (s.phase === 'judge') return future + s.judges.length + this.tasks().filter(t => s.decisions[wordKey(t)] != null || s.direct || s.mode === 'review').length * rounds;
    return future + s.pending.length + (s.phase === 'match' ? this.tasks().length * (s.match_rounds - s.cycle + 1) + (s.repeating ? 0 : Object.keys(s.match_retry || {}).length) : Object.keys(s.fill_retry || {}).length);
  }
  question() {
    const s = this.s;
    while (true) {
      if (s.cursor < 0 && !this.activate() || s.cursor >= s.groups.length) return { completed: true, mode: s.mode, game: true };
      if (s.phase === 'judge' && !s.judges.length) { s.phase = 'match'; s.cycle = 1; s.pending = mix(this.tasks()); }
      const boardUnfinished=s.phase==='match'&&s.board&&s.board.matched_left.length<s.board.cards.length;
      if (s.phase !== 'judge' && !s.pending.length&&!boardUnfinished) {
        if (s.phase === 'match' && s.cycle < s.match_rounds) { s.cycle++; s.pending = mix(this.tasks()); s.board = null; s.repeating = false; }
        else if (s.phase === 'match' && !s.repeating && Object.keys(s.match_retry || {}).length) { s.pending = mix(Object.values(s.match_retry)); s.match_retry = {}; s.repeating = true; s.board = null; }
        else if (s.phase === 'match') { s.phase = 'fill'; s.pending = mix(this.tasks()); s.board = null; }
        else { if (!this.activate()) return { completed: true, mode: s.mode, game: true }; continue; }
        if (!s.pending.length) continue;
      }
      let entry;
      if (s.phase === 'judge') entry = s.entries.find(e => wordKey(e) === s.judges[0]);
      else entry = s.pending[0];
      if (s.phase === 'match') {
        // Saved mixed boards may have stranded forms after an equivalent-form
        // match. Keep completed pairs; put only the unanswered tasks on a new
        // board instead of rewriting the person printed on a remaining card.
        if(s.board){
          const b=s.board,left=b.cards.filter(card=>!b.matched_left.includes(card.key));
          const playable=b.cards.some(card=>!b.matched_right.includes(card.key)&&left.some(slot=>this.env.forms(b.rule===2?slot.verbe:card.verbe,b.rule===2?slot.temps:card.temps)[b.left_persons?.[slot.key]||slot.personne]===card.form));
          if(!playable){s.board=null;if(!s.pending.length)continue;}
        }
        if (!s.board || s.board.matched_left.length === s.board.cards.length) {
          const cards=this.matchCards();
          s.board = { id: uid(),rule:3,cards,left:mix(cards.map(e=>e.key)),right:mix(cards.map(e=>e.key)),left_persons:Object.fromEntries(cards.map(e=>[e.key,e.personne])),matched_left:[],matched_right:[] };
        }
        entry=s.board.cards.find(card=>!(s.board.rule===2?s.board.matched_left:s.board.matched_right).includes(card.key));
      }
      const q = { id: uid(), game: true, mode: s.mode, direct: s.direct, source: s.source, round: s.phase, level: s.level, verbe: entry.verbe, temps: entry.temps, personne: entry.personne, batch_index: s.cursor + 1, batch_count: s.groups.length, batch_verbs: s.entries.map(e => e.verbe), batch_entries: s.entries.map(e => ({ verbe: e.verbe, temps: e.temps })), done: s.done, total: s.done + this.remaining(), group_done: s.batch_done, match_rounds: s.match_rounds, game_round: s.cycle };
      q.is_reinforcement = s.phase === 'match' && Boolean(s.repeating);
      q.preview_only = s.direct || s.mode === 'review';
      if (s.phase === 'judge') q.conjugations = this.env.forms(entry.verbe, entry.temps);
      if (s.phase === 'match') q.board = clone(s.board);
      if (s.phase === 'fill') q.hint = this.env.hint?.(entry.verbe, this.env.forms(entry.verbe, entry.temps)[entry.personne]) || '';
      s.question = q; return q;
    }
  }
  answer(body) {
    const s = this.s, q = s.question;
    require(q && body.id === q.id, '题目已更新，请重新打开练习继续。');
    if (s.phase === 'judge') {
      require([1, 2, 3].includes(body.choice), '请选择掌握程度。');
      const id = s.judges.shift(), entry = s.entries.find(e => wordKey(e) === id);
      s.decisions[id] = body.choice; s.done++; s.batch_done++;
      if (body.choice === 1) this.env.known(entry);
      return { correct: true, judged: true, next: this.question() };
    }
    let entry, correct, expected;
    if (s.phase === 'match') {
      const b = s.board;
      const left = b.cards.find(e => e.key === body.person_key);
      const form = b.cards.find(e => e.key === body.form_key);
      require(left && form && !b.matched_left.includes(left.key) && !b.matched_right.includes(form.key), '请选择两张尚未消除的卡片。');
      b.left_persons ||= Object.fromEntries(b.cards.map(e => [e.key, e.personne]));
      const person = b.left_persons[left.key]||left.personne, forms = this.env.forms(b.rule===2?left.verbe:form.verbe,b.rule===2?left.temps:form.temps);
      expected = forms[person] || form.form;
      correct = forms[person] === form.form;
      // The visible right-hand form owns the task and its error record. A
      // different verb on the hidden left slot never changes its person.
      entry = b.rule===3?form:b.rule===2?{...left,personne:person}:correct || !forms[person] ? form : { ...form, personne: person, key: taskKey({ ...form, personne: person }) };
      if (correct) {
        b.matched_left.push(left.key); b.matched_right.push(form.key);
      } else if (!s.repeating&&!entry.filler) { s.match_retry ||= {}; s.match_retry[entry.key] = clone(entry); }
    } else {
      entry = s.pending[0]; expected = this.env.forms(entry.verbe, entry.temps)[entry.personne];
      require(String(body.answer || '').trim(), '请先输入答案。');
      correct = this.env.check(String(body.answer).trim(), expected, s.settings.fuzzy !== false);
      if (!correct) { s.fill_retry ||= {}; s.fill_retry[entry.key] = 1; }
    }
    const deferred=!correct&&!entry.filler&&this.env.record(correct, entry)===true;
    if(correct&&!entry.filler)this.env.record(correct,entry);
    if(deferred){this.defer(entry);return {correct:false,expected,deferred:true,matched:s.phase==='match',next:this.question()};}
    // Reinforcement is bounded: a lone real task gets this extra attempt,
    // then moves on to spelling even if it is still wrong. Keep the failure
    // recorded; support tiles must never create another retry round.
    if(!correct&&s.phase==='match'&&s.repeating&&!entry.filler&&s.pending.length===1&&s.pending[0].key===entry.key){
      s.pending=[];s.match_retry={};s.board=null;
    }
    if (correct) {
      s.pending = s.pending.filter(e => e.key !== entry.key); s.done++; s.batch_done++;
      if (s.phase === 'fill' && s.fill_retry?.[entry.key]) { delete s.fill_retry[entry.key]; s.pending.push(entry); if (s.pending.length > 1 && s.pending[0].key === entry.key) [s.pending[0], s.pending[1]] = [s.pending[1], s.pending[0]]; }
      if (s.phase === 'fill' && !s.pending.some(e => wordKey(e) === wordKey(entry)) && !s.completed_words.includes(wordKey(entry))) {
        this.env.complete(entry, s);if(s.deferred_words)s.deferred_words=s.deferred_words.filter(id=>id!==wordKey(entry)); if (!s.completed_words.includes(wordKey(entry))) s.completed_words.push(wordKey(entry));
      }
    }
    return { correct, expected, matched: s.phase === 'match', next: this.question() };
  }
  restart(excluded = new Set()) {
    const s = this.s; s.done = Math.max(0, s.done - s.batch_done);
    s.groups[s.cursor].entries = s.entries.filter(e => !excluded.has(wordKey(e)));
    s.cursor--; this.activate(); return this.question();
  }
  defer(entry){
    const s=this.s,id=wordKey(entry),wholeLemma=this.env.deferWholeLemma?.(entry);
    const belongs=e=>wholeLemma?e.verbe===entry.verbe:wordKey(e)===id;
    const removed=new Set([id,...s.groups.flatMap(group=>group.entries.filter(belongs).map(wordKey))]);
    s.deferred_words=[...new Set([...(s.deferred_words||[]),...removed])];
    if(this.env.deferToTail?.(entry)&&!s.tailRound){const source=s.entries.find(e=>wordKey(e)===id);if(source){s.learningTailEntries||=[];if(!s.learningTailEntries.some(e=>wordKey(e)===id))s.learningTailEntries.push(clone(source));}}
    const removeTasks=state=>{
      state.pending=(state.pending||[]).filter(e=>!belongs(e));
      state.judges=(state.judges||[]).filter(key=>!removed.has(key));
      for(const table of [state.match_retry,state.fill_retry]){
        for(const key of Object.keys(table||{}))if(removed.has(key.slice(0,key.lastIndexOf('|'))))delete table[key];
      }
    };
    for(const group of s.groups){
      if(!group.entries.some(belongs))continue;
      group.entries=group.entries.filter(e=>!belongs(e));
      if(group.continuation)removeTasks(group.continuation);
    }
    s.entries=(s.entries||[]).filter(e=>!belongs(e));removeTasks(s);
    s.board=null;s.question=null;
  }
  remove(selected, returned = []) {
    const s = this.s;
    const affected = s.entries?.some(e => selected.has(wordKey(e)));
    for (const g of s.groups) g.entries = g.entries.filter(e => !selected.has(wordKey(e)));
    s.entries = (s.entries || []).filter(e => !selected.has(wordKey(e)));
    s.judges = (s.judges || []).filter(id => !selected.has(id));
    s.pending = (s.pending || []).filter(e => !selected.has(wordKey(e)));
    for (const [key, entry] of Object.entries(s.match_retry || {})) if (selected.has(wordKey(entry))) delete s.match_retry[key];
    for (const key of Object.keys(s.fill_retry || {})) if (selected.has(key.split('|').slice(0, 2).join('|'))) delete s.fill_retry[key];
    if (affected) s.board = null;
    if (returned.length) s.groups.splice(s.cursor + 1, 0, ...smallGroups(returned).map(entries => ({ entries })));
    if (affected) s.question = null;
    else if (s.question) { s.question.total = s.done + this.remaining(); s.question.batch_count = s.groups.length; }
  }
}
