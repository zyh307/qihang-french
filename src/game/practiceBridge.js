import {changeSave, loadSave} from './save.js'
import {acquirePracticeLease} from '../../oral-assistant/web/practice-audio-gate.js'

export async function onPracticeEnter(radio) {
  const wasPlaying = radio?.stopForPractice()
  const release = await acquirePracticeLease()
  if (wasPlaying) await new Promise(resolve => setTimeout(resolve, 150))
  return release
}

export async function onPracticeExit(radio, release, returningToMap) {
  if (returningToMap) {
    await release?.()
    return radio?.resumeAfterPractice()
  }
  radio?.cancelPractice()
  release?.()
}

const PORTALS = {
  'rift-west': {mode:'lecture', title:'读课文'},
  'rift-center': {mode:'fluency', title:'接拍串说'},
  'rift-east': {mode:'slot', title:'看提示换一格'},
}

export const portalTitle = (nodeId, unlocked) => unlocked.includes(nodeId) ? PORTALS[nodeId].title : '？？？'

export function makePracticeRequest(nodeId) {
  if (!Object.hasOwn(PORTALS, nodeId)) throw new Error('未知冒险入口')
  return {origin:'game', nodeId, mode:PORTALS[nodeId].mode}
}

export function beginAdventure(nodeId) {
  const request = makePracticeRequest(nodeId)
  return changeSave(save => {
    const existing = save.pending[nodeId]
    if (existing) return existing
    const run = {...request, runId:crypto.randomUUID().replaceAll('-', '')}
    save.pending[nodeId] = run
    return run
  })
}

export function pendingAdventure(runId) {
  if (!runId) return null
  return Object.values(loadSave().save?.pending || {}).find(run => run.runId === runId) || null
}

export function matchesRun(session, run) {
  return session?.id === run.runId && session.game?.runId === run.runId &&
    session.game.origin === 'game' && session.game.mode === run.mode && session.game.nodeId === run.nodeId
}

export async function recoverAdventure(getJson, base, run) {
  const state = await getJson(base + '/' + run.runId).catch(err => {
    if (!err.message.includes('没有找到这次练习记录')) throw err
    return null
  })
  if (state && !matchesRun(state, run)) throw new Error('无法匹配这次冒险的练习记录。')
  return state
}

function counts(mode, session) {
  if (mode === 'lecture') {
    return {
      itemCount:session.text.sentences.length,
      passed:session.outcomes.filter(row => row.passKind === 'independent').map(row => row.step),
      retried:session.attempts.filter(row => ['retry','border'].includes(row.result.status)).map(row => row.step),
      durationMs:session.attempts.reduce((total, row) => total + (row.seconds || 0) * 1000, 0),
    }
  }
  if (mode === 'fluency') {
    return {
      itemCount:session.lesson.chains.length,
      passed:session.outcomes.filter(row => row.verdict === 'pass' && row.level === 0).map(row => row.item),
      retried:session.outcomes.filter(row => row.retries || row.verdict === 'retry').map(row => row.item),
      durationMs:session.active_ms,
    }
  }
  const rows = session.rows.filter(row => !row.supplement)
  const itemKey = row => row.frame_id + '/' + row.prompt.id
  return {
    itemCount:session.lesson.frames.reduce((total, frame) => total + frame.prompts.length, 0),
    passed:rows.filter(row => row.verdict === 'pass' && row.level === 0).map(itemKey),
    retried:rows.filter(row => row.verdict === 'retry').map(itemKey),
    durationMs:session.active_ms,
  }
}

export function adventureResult(session, run) {
  if (!matchesRun(session, run) || session.phase !== 'ended') throw new Error('请先完成本次冒险。')
  const {itemCount, passed, retried, durationMs} = counts(run.mode, session)
  const pass = new Set(passed).size, retry = new Set(retried).size
  return {mode:run.mode, itemCount, pass, retry,
    accuracy:(pass || retry) && itemCount > 0 ? pass / itemCount : null,
    durationMs:Math.max(0, Math.round(durationMs || 0))}
}

function localDay(now) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function settleAdventure(session, run, now = new Date()) {
  const result = adventureResult(session, run)
  return changeSave(save => {
    const {nodeId, runId} = run
    if (save.pending[nodeId]?.runId !== runId) return {result, coins:0, reason:'settled'}
    delete save.pending[nodeId]
    if (!result.pass) return {result, coins:0, reason:'no-pass'}

    const unlocked = !save.unlocked.includes(nodeId)
    if (unlocked) save.unlocked.push(nodeId)
    const today = localDay(now)
    if (today <= (save.rewardedDays[nodeId] || '')) return {result, unlocked, coins:0, reason:'daily-limit'}
    const coins = 12 + Math.min(result.pass, 3) * 2 + (result.accuracy >= .8 ? 3 : 0)
    save.coins += coins
    save.rewardedDays[nodeId] = today
    return {result, unlocked, coins}
  })
}
