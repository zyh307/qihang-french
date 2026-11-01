<template>
  <view class="grammar-mode">
    <!-- 范围选择 -->
    <template v-if="screen==='home'">
      <view class="grammar-head">
        <view class="grammar-intro">
          <text class="grammar-title">语法练习<text class="grammar-title-fr" lang="fr">Grammaire</text></text>
          <text class="grammar-sub">Inspire 1 · Leçon 1–14 · {{ stats.points }} 个语法点 · {{ stats.questions }} 道题</text>
        </view>
        <view class="grammar-kpi">
          <view class="kpi"><strong>{{ stats.done }}</strong><Bi zh="已练点" fr="Points vus" small /></view>
          <view class="kpi"><strong>{{ stats.accuracy }}%</strong><Bi zh="正确率" fr="Réussite" small /></view>
        </view>
      </view>

      <view class="unit-tabs" role="tablist">
        <button hover-class="none" v-for="tab in unitTabs" :key="tab.id" :class="['unit-tab',{active:unitId===tab.id}]" @click="unitId=tab.id"><Bi :zh="tab.zh" :fr="tab.fr" small /></button>
      </view>

      <view class="lesson-grid">
        <button hover-class="none" v-for="lesson in visibleLessons" :key="lesson.id" :class="['glass','lesson-card',{empty:!lesson.points.length}]" @click="startLesson(lesson)">
          <view class="lesson-top">
            <text class="lesson-id">{{ lesson.id==='Summary' ? 'Résumé' : lesson.id }}</text>
            <view v-if="lesson.points.length" class="lesson-progress"><view class="lesson-progress-bar" :style="{width:lessonPct(lesson)+'%'}" /></view>
            <Icon :name="lesson.points.length?'arrow':'info'" />
          </view>
          <text class="lesson-title" lang="fr">{{ lesson.subtitle || lesson.title }}</text>
          <text class="lesson-meta">{{ lessonMeta(lesson) }}</text>
        </button>
      </view>

      <view class="grammar-actions">
        <button hover-class="none" class="button primary" :disabled="!stats.questions" @click="startMixed"><Icon name="list" /><Bi zh="综合练习 · 10 题" fr="Entraînement mixte" small /></button>
        <button hover-class="none" v-if="wrongPool.length" class="button secondary" @click="startWrong"><Icon name="star" /><Bi zh="只练错题" fr="Mes erreurs" small /></button>
      </view>
      <text class="grammar-note">题目由《Inspire 1 语法整理》例句与常见错误生成，答错会立即给出规则说明。</text>
    </template>

    <!-- 答题 -->
    <template v-else-if="screen==='quiz' && current">
      <view class="quiz-bar">
        <button hover-class="none" class="icon-button" @click="quit" aria-label="退出练习 / Quitter"><Icon name="back" /></button>
        <view class="quiz-progress"><view class="quiz-progress-bar" :style="{width:((index+1)/questions.length*100)+'%'}" /></view>
        <text class="quiz-count">{{ index+1 }} / {{ questions.length }}</text>
      </view>

      <view class="glass quiz-card">
        <view class="quiz-tag">
          <text class="tag-type">{{ current.type==='translate'?'选出正确法语 · Traduire':'判断对错 · Vrai ou faux' }}</text>
          <text class="tag-src">{{ current.lessonId }} · {{ current.point.title }}</text>
        </view>

        <view v-if="current.type==='translate'" class="quiz-prompt">
          <text class="prompt-zh">{{ current.prompt }}</text>
          <text class="prompt-hint">选出最恰当的法语表达</text>
        </view>
        <view v-else class="quiz-prompt">
          <text class="prompt-fr" lang="fr">{{ current.prompt }}</text>
          <text class="prompt-hint">这句话符合语法规则吗？</text>
        </view>

        <view class="options">
          <button hover-class="none" v-for="(opt,i) in current.options" :key="opt.id" :class="['option',optionClass(opt)]" :disabled="answered" @click="choose(opt)">
            <text class="option-key">{{ 'ABCD'[i] }}</text>
            <text class="option-text" lang="fr">{{ opt.text }}</text>
            <Icon v-if="answered && opt.correct" name="check" />
            <Icon v-else-if="answered && opt.picked && !opt.correct" name="close" />
          </button>
        </view>

        <view v-if="answered" :class="['feedback',lastCorrect?'ok':'no']">
          <view class="feedback-head"><Icon :name="lastCorrect?'check':'info'" /><Bi :zh="lastCorrect?'答对了':'再看一眼规则'" :fr="lastCorrect?'Correct':'À revoir'" small /></view>
          <text v-if="current.type==='translate'" class="feedback-answer">正确说法：<text lang="fr">{{ current.answer }}</text></text>
          <text class="feedback-rule">{{ current.explain }}</text>
          <view v-if="current.point" class="feedback-hook"><text lang="fr">{{ current.point.hook }}</text></view>
        </view>

        <view class="quiz-actions">
          <button v-if="!answered" hover-class="none" class="button primary" :disabled="!picked" @click="submit"><Bi zh="确认" fr="Valider" small /></button>
          <button v-else hover-class="none" class="button primary" @click="next"><Bi :zh="index+1<questions.length?'下一题':'看结果'" :fr="index+1<questions.length?'Suivant':'Résultat'" small /><Icon name="arrow" /></button>
        </view>
      </view>
    </template>

    <!-- 结果 -->
    <template v-else-if="screen==='result'">
      <view class="glass result-card">
        <view class="result-ring" :style="{background:`conic-gradient(var(--accent) ${accuracy}%, #e6ecf6 0)`}"><view class="result-inner"><strong>{{ accuracy }}%</strong><text>{{ correctCount }}/{{ questions.length }}</text></view></view>
        <text class="result-title">{{ resultTitle }}</text>
        <text class="result-sub">{{ resultSub }}</text>
        <view v-if="wrongList.length" class="wrong-list">
          <text class="wrong-title">需要复习的 {{ wrongList.length }} 题</text>
          <view v-for="(item,i) in wrongList.slice(0,5)" :key="i" class="wrong-item">
            <text class="wrong-fr" lang="fr">{{ item.prompt }}</text>
            <text class="wrong-answer" lang="fr">→ {{ item.answer }}</text>
          </view>
        </view>
        <view class="result-actions">
          <button hover-class="none" v-if="wrongList.length" class="button primary" @click="retryWrong"><Icon name="star" /><Bi zh="重练错题" fr="Refaire" small /></button>
          <button hover-class="none" class="button secondary" @click="backHome"><Bi zh="返回范围选择" fr="Retour" small /></button>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import Bi from './Bi.vue';
import Icon from './Icon.vue';
import grammarData from '../grammar/grammar-data.json';

const emit = defineEmits(['notice']);

const STORE_KEY = 'qihang-grammar-progress-v1';
const ROUND_SIZE = 10;

/* ---------- 进度 ---------- */
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { saved = {}; }
const progress = ref(saved && typeof saved === 'object' ? saved : {});

function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress.value)); } catch { /* 存储不可用时忽略 */ }
}

function pointStat(id) {
  return progress.value[id] || { r: 0, w: 0 };
}

function pointMastered(id) {
  const s = pointStat(id);
  return s.r + s.w >= 2 && s.r / (s.r + s.w) >= 0.6;
}

function recordAnswer(id, correct) {
  const s = pointStat(id);
  progress.value = { ...progress.value, [id]: { r: s.r + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1), at: Date.now() } };
  saveProgress();
}

/* ---------- 题池 ---------- */
const units = grammarData.units;

const allLessons = computed(() => units.flatMap((u) => u.lessons.map((l) => ({ ...l, unitId: u.id, unitTitle: u.title }))));

const allPoints = computed(() => allLessons.value.flatMap((l) => l.points.map((p) => ({ ...p, lessonId: l.id }))));

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uniqueBy(list, keyFn) {
  const seen = new Set();
  return list.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 由语法点的例句与易错项生成两类题目 */
function questionsOf(points) {
  const pool = [];
  for (const point of points) {
    const { lessonId } = point;
    const wrongs = uniqueBy((point.mistakes || []).map((m) => m.wrong).filter(Boolean), (x) => x);
    const base = {
      pointId: point.id,
      lessonId,
      point,
      explain: point.hook || (point.rules || [])[0] || '',
    };

    // 中译选句：中文题干，正确句 + 教材里的典型错句作干扰
    for (const ex of point.examples || []) {
      const [fr, zh] = ex;
      if (!fr || !zh || wrongs.length === 0) continue;
      const distractors = shuffle(wrongs.filter((w) => w !== fr)).slice(0, 2);
      if (!distractors.length) continue;
      const options = shuffle([fr, ...distractors]).map((text) => ({ text, correct: text === fr }));
      pool.push({
        ...base,
        type: 'translate',
        prompt: zh,
        answer: fr,
        options: options.map((o, i) => ({ ...o, id: `${point.id}-t${i}-${o.text.length}` })),
        explain: base.explain || (point.mistakes[0] && point.mistakes[0].why) || '',
      });
    }

    // 判断正误：教材易错里的错句（false）与正确改写（true）
    for (const m of point.mistakes || []) {
      if (m.wrong) {
        pool.push({
          ...base,
          type: 'judge',
          prompt: m.wrong,
          answer: false,
          options: [
            { id: `${point.id}-j-${m.wrong.length}-0`, text: '正确 · Correct', correct: false },
            { id: `${point.id}-j-${m.wrong.length}-1`, text: '错误 · Incorrect', correct: true },
          ],
          explain: [m.right ? `正确说法：${m.right}` : '', m.why].filter(Boolean).join('　') || base.explain,
        });
      }
      if (m.right) {
        pool.push({
          ...base,
          type: 'judge',
          prompt: m.right,
          answer: true,
          options: [
            { id: `${point.id}-jr-${m.right.length}-0`, text: '正确 · Correct', correct: true },
            { id: `${point.id}-jr-${m.right.length}-1`, text: '错误 · Incorrect', correct: false },
          ],
          explain: m.why || base.explain,
        });
      }
    }
  }
  return uniqueBy(pool, (q) => `${q.type}|${q.prompt}`);
}

const poolByPoint = computed(() => {
  const map = new Map();
  for (const p of allPoints.value) map.set(p.id, questionsOf([p]));
  return map;
});

/* ---------- 概览统计 ---------- */
const stats = computed(() => {
  const points = allPoints.value;
  const total = points.length;
  const done = points.filter((p) => pointMastered(p.id)).length;
  let r = 0;
  let w = 0;
  for (const p of points) {
    const s = pointStat(p.id);
    r += s.r;
    w += s.w;
  }
  return {
    points: total,
    questions: points.reduce((sum, p) => sum + (poolByPoint.value.get(p.id) || []).length, 0),
    done,
    accuracy: r + w ? Math.round((r / (r + w)) * 100) : 0,
  };
});

const unitTabs = computed(() => [
  { id: 'all', zh: '全部', fr: 'Tout' },
  ...units.map((u) => ({ id: u.id, zh: u.id.replace('U', '第') + '单元', fr: u.title })),
]);

const unitId = ref('all');
const visibleLessons = computed(() => (unitId.value === 'all' ? allLessons.value : allLessons.value.filter((l) => l.unitId === unitId.value)));

function lessonPct(lesson) {
  const pts = lesson.points || [];
  if (!pts.length) return 0;
  return Math.round((pts.filter((p) => pointMastered(p.id)).length / pts.length) * 100);
}

function lessonMeta(lesson) {
  if (lesson.kind === 'technique') return '技巧课 · 无新语法，复习本单元前几课';
  if (lesson.kind === 'summary') return `单元小结 · ${(lesson.phrases || []).length} 个实用句型`;
  const pts = lesson.points || [];
  const mastered = pts.filter((p) => pointMastered(p.id)).length;
  return `${pts.length} 个语法点 · 已掌握 ${mastered}`;
}

/* ---------- 答题状态 ---------- */
const screen = ref('home');
const questions = ref([]);
const index = ref(0);
const picked = ref(null);
const answered = ref(false);
const lastCorrect = ref(false);
const results = ref([]);
const scopePoints = ref([]);

const current = computed(() => questions.value[index.value] || null);

function begin(points, size) {
  const pool = questionsOf(points);
  if (!pool.length) {
    emit('notice', '这部分暂无可用题目 / Aucune question disponible.');
    return;
  }
  questions.value = shuffle(pool).slice(0, size || pool.length);
  index.value = 0;
  picked.value = null;
  answered.value = false;
  results.value = [];
  scopePoints.value = points;
  screen.value = 'quiz';
}

function startLesson(lesson) {
  if (!lesson.points.length) {
    emit('notice', lesson.kind === 'technique' ? `${lesson.id} 是技巧课，没有独立语法点；请先练本单元前几课。` : `${lesson.id} 是单元小结，没有独立语法点。`);
    return;
  }
  begin(lesson.points.map((p) => ({ ...p, lessonId: lesson.id })), ROUND_SIZE);
}

function startMixed() {
  begin(allPoints.value, ROUND_SIZE);
}

function startWrong() {
  const pool = wrongPool.value;
  if (!pool.length) return;
  questions.value = shuffle(pool).slice(0, ROUND_SIZE);
  index.value = 0;
  picked.value = null;
  answered.value = false;
  results.value = [];
  screen.value = 'quiz';
}

const wrongPool = computed(() => {
  const list = [];
  for (const p of allPoints.value) {
    const s = pointStat(p.id);
    if (s.w > 0 && !pointMastered(p.id)) list.push(...(poolByPoint.value.get(p.id) || []));
  }
  return list;
});

function choose(opt) {
  if (answered.value) return;
  picked.value = opt;
}

function optionClass(opt) {
  if (!answered.value) return { selected: picked.value && picked.value.id === opt.id };
  if (opt.correct) return { correct: true };
  if (picked.value && picked.value.id === opt.id) return { wrong: true };
  return { dim: true };
}

function submit() {
  if (!picked.value) return;
  answered.value = true;
  lastCorrect.value = !!picked.value.correct;
  recordAnswer(current.value.pointId, lastCorrect.value);
  results.value = [...results.value, { ...current.value, pickedId: picked.value.id, correct: lastCorrect.value }];
}

function next() {
  if (index.value + 1 < questions.value.length) {
    index.value += 1;
    picked.value = null;
    answered.value = false;
    return;
  }
  screen.value = 'result';
}

function quit() {
  screen.value = 'home';
  questions.value = [];
}

function backHome() {
  screen.value = 'home';
  questions.value = [];
}

const correctCount = computed(() => results.value.filter((r) => r.correct).length);
const accuracy = computed(() => (results.value.length ? Math.round((correctCount.value / results.value.length) * 100) : 0));
const wrongList = computed(() => results.value.filter((r) => !r.correct));
const resultTitle = computed(() => (accuracy.value >= 90 ? '这一轮几乎全对' : accuracy.value >= 70 ? '基本掌握，个别点还需巩固' : '先把规则再看一遍'));
const resultSub = computed(() => `本轮 ${results.value.length} 题，答对 ${correctCount.value} 题`);

function retryWrong() {
  const list = wrongList.value;
  if (!list.length) return;
  questions.value = shuffle(list);
  index.value = 0;
  picked.value = null;
  answered.value = false;
  results.value = [];
  screen.value = 'quiz';
}
</script>

<style scoped>
.grammar-mode{height:100%;min-height:0;display:flex;flex-direction:column;gap:14px;width:100%;max-width:1100px;margin:0 auto;padding:4px 21px 24px;overflow-y:auto}
.grammar-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
.grammar-intro{display:flex;flex-direction:column;gap:5px;min-width:0}
.grammar-title{font-size:22px;font-weight:650;letter-spacing:-.4px;color:var(--ink)}
.grammar-title-fr{font-family:Georgia,serif;font-style:italic;font-size:15px;font-weight:400;color:#8b96ae;margin-left:9px}
.grammar-sub{font-size:12px;color:var(--muted)}
.grammar-kpi{display:flex;gap:10px}
.kpi{min-width:82px;padding:9px 13px;border-radius:14px;background:#f8faffb8;border:1px solid #e2e9f4;display:flex;flex-direction:column;gap:2px;align-items:center}
.kpi strong{font-size:18px;color:#5d72a7;letter-spacing:-.3px}
.unit-tabs{display:flex;gap:8px;flex-wrap:wrap}
.unit-tab{padding:8px 13px;border-radius:12px;border:1px solid #dbe4f1;background:#ffffffb8;color:#8c9db8}
.unit-tab.active{background:#e7eefb;border-color:#a8bbda;color:#5f7da7}
.lesson-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:12px}
.lesson-card{padding:14px 15px;display:flex;flex-direction:column;gap:6px;text-align:left;border-radius:19px}
.lesson-card.empty{opacity:.72}
.lesson-top{display:flex;align-items:center;gap:9px}
.lesson-id{font-size:11px;font-weight:650;letter-spacing:.5px;color:#7e93bb;background:#eef3fb;border-radius:7px;padding:2px 7px}
.lesson-progress{flex:1;height:4px;border-radius:4px;background:#e8eefa;overflow:hidden}
.lesson-progress-bar{height:100%;background:#9db2d8;border-radius:4px}
.lesson-top .icon{width:15px;height:15px;color:#b3bfd3}
.lesson-title{font-size:15px;color:var(--ink);font-weight:600;line-height:1.35}
.lesson-meta{font-size:11px;color:var(--muted)}
.grammar-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px}
.grammar-note{font-size:11px;color:#9aa5b8;line-height:1.6}
.quiz-bar{display:flex;align-items:center;gap:12px}
.quiz-progress{flex:1;height:5px;border-radius:5px;background:#e6ecf6;overflow:hidden}
.quiz-progress-bar{height:100%;background:var(--accent);border-radius:5px;transition:width .3s}
.quiz-count{font-size:12px;color:var(--muted)}
.quiz-card{padding:20px;display:flex;flex-direction:column;gap:15px}
.quiz-tag{display:flex;flex-direction:column;gap:2px}
.tag-type{font-size:11px;color:#7e93bb;letter-spacing:.4px}
.tag-src{font-size:11px;color:#a6b0c2}
.quiz-prompt{display:flex;flex-direction:column;gap:7px;padding:14px 15px;border-radius:16px;background:#f7f9fef2;border:1px solid #e6edf8}
.prompt-zh{font-size:23px;font-weight:600;letter-spacing:-.4px;line-height:1.4}
.prompt-fr{font-size:21px;font-weight:600;line-height:1.45;color:#3c4f75}
.prompt-hint{font-size:11px;color:#9aa5b8}
.options{display:flex;flex-direction:column;gap:9px}
.option{display:flex;align-items:center;gap:11px;padding:13px 14px;border-radius:15px;border:1px solid #e0e8f4;background:#ffffffcc;color:#4c5f83;font-size:15px;line-height:1.4}
.option .option-key{width:22px;height:22px;border-radius:50%;background:#eef3fb;color:#8ba0c4;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.option .option-text{flex:1}
.option.selected{border-color:#9db2d8;background:#eff4fdf2}
.option.correct{border-color:#a9c9b8;background:#eff8f2;color:#3f6a55}
.option.correct .option-key{background:#d8ecdf;color:#4c7a62}
.option.wrong{border-color:#e2b7b2;background:#fdf1ef;color:#8c5147}
.option.wrong .option-key{background:#f3dcd8;color:#92574d}
.option.dim{opacity:.55}
.feedback{padding:13px 15px;border-radius:16px;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.6}
.feedback.ok{background:#f0f8f3;border:1px solid #d9ecdf;color:#42684f}
.feedback.no{background:#fdf4f2;border:1px solid #f0dcd7;color:#8a5349}
.feedback-head{display:flex;align-items:center;gap:8px}
.feedback-head .icon{width:17px;height:17px}
.feedback-answer{font-weight:600}
.feedback-rule{color:#5c6b85}
.feedback-hook{font-size:12px;color:#8b7a52;background:#fdf9ee;border-radius:11px;padding:8px 11px;line-height:1.55}
.quiz-actions{display:flex;justify-content:flex-end;gap:10px}
.result-card{padding:26px;display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center}
.result-ring{width:132px;height:132px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.result-inner{width:104px;height:104px;border-radius:50%;background:#fbfcff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.result-inner strong{font-size:29px;color:#526a9b;letter-spacing:-1px}
.result-inner text{font-size:11px;color:var(--muted)}
.result-title{font-size:17px;font-weight:620;margin-top:5px}
.result-sub{font-size:12px;color:var(--muted)}
.wrong-list{width:100%;margin-top:9px;padding:13px 14px;border-radius:16px;background:#fbfcffb8;border:1px solid #eaeff8;display:flex;flex-direction:column;gap:8px;text-align:left}
.wrong-title{font-size:11px;color:#9aa5b8;letter-spacing:.3px}
.wrong-item{display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:1.5}
.wrong-fr{color:#8a5349}
.wrong-answer{color:#42684f}
.result-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px}
@media(max-width:720px){
  .grammar-mode{padding:4px 15px 20px;gap:11px}
  .grammar-title{font-size:19px}
  .grammar-kpi{width:100%;justify-content:space-between}
  .kpi{flex:1}
  .lesson-grid{grid-template-columns:1fr}
  .prompt-zh{font-size:20px}
  .prompt-fr{font-size:18px}
  .quiz-card{padding:15px;gap:12px}
  .result-card{padding:19px}
}
@media(prefers-reduced-motion:reduce){.quiz-progress-bar{transition:none}}
</style>
