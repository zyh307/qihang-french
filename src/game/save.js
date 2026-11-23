import {START, canStand} from './world.js'
import {emptyFarm, validFarm} from './farm.js'

export const SAVE_KEY = 'qihang-daily-game'
const VERSION = 4
const emptyAdventure = () => ({coins:0, unlocked:[], rewardedDays:{}, pending:{}})
const newPreferences = () => ({introSeen:false, assetSource:'private'})
export const LAYERS = [
  {id: 'hair', label: '发型', options: ['短发', '束发']},
  {id: 'shirt', label: '上衣', options: ['松绿', '莓红']},
  {id: 'pants', label: '裤子', options: ['靛蓝', '栗棕']},
  {id: 'skin', label: '肤色', options: ['浅杏', '暖棕']},
  {id: 'shoes', label: '鞋子', options: ['深棕', '苔绿']},
]
export const defaultAppearance = () => Object.fromEntries(LAYERS.map(layer => [layer.id, 0]))
export const validName = name => typeof name === 'string' && /^[\p{Script=Han}A-Za-z0-9_]{2,12}$/u.test(name)

function validAppearance(appearance) {
  return appearance && LAYERS.every(({id, options}) =>
    Number.isInteger(appearance[id]) && appearance[id] >= 0 && appearance[id] < options.length)
}

export function makeSave(id, appearance) {
  if (!validName(id) || !validAppearance(appearance)) throw new Error('角色资料无效')
  return {version: VERSION, character: {id, appearance: {...appearance}}, position: {...START},
    ...emptyAdventure(), ...emptyFarm(), ...newPreferences()}
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return {save: null}
    let save = JSON.parse(raw)
    if (save?.version === 1) save = {...save, version:2, ...emptyAdventure()}
    if (save?.version === 2) save = {...save, version:3, ...emptyFarm()}
    if (save?.version === 3) save = {...save, version:VERSION, ...newPreferences()}
    if (save?.version !== VERSION || !validName(save.character?.id) || !validAppearance(save.character?.appearance)) {
      return {save: null, error: '这个角色存档需要对应版本才能打开。'}
    }
    if (!Number.isSafeInteger(save.coins) || save.coins < 0 || !Array.isArray(save.unlocked) ||
        !save.rewardedDays || !save.pending || !validFarm(save) ||
        typeof save.introSeen !== 'boolean' || !['private', 'cc0'].includes(save.assetSource)) {
      return {save:null, error:'冒险存档格式无效。'}
    }
    const p = save.position
    if (!p || !canStand(p.zone, p.x, p.y) || !['down', 'left', 'right', 'up'].includes(p.facing)) save.position = {...START}
    return {save}
  } catch {
    return {save: null, error: '读取角色存档失败，请检查浏览器本地存储。'}
  }
}

export function persist(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

export async function changeSave(update) {
  const edit = () => {
    const {save} = loadSave()
    if (!save) throw new Error('找不到角色存档。')
    const result = update(save)
    if (!persist(save)) throw new Error('暂时无法保存，请检查浏览器存储。')
    return result
  }
  return globalThis.navigator?.locks ? navigator.locks.request(SAVE_KEY, edit) : edit()
}
