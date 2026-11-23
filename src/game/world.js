export const TILE = 16
export const SPEED = 3.8
export const START = {zone: 'home', x: 10.5, y: 9.25, facing: 'down'}

export const ZONES = {
  home: {
    title: '家', subtitle: 'MAISON', cols: 20, rows: 12,
    doors: [
      {x: 10, y: 0, label: '去野外', to: 'field', arrival: [1.65, 11.5, 'right']},
      {x: 10, y: 11, label: '去商店', to: 'shop', arrival: [10.5, 2.25, 'down']},
    ],
    props: [
      {x: 2, y: 2, w: 7, h: 4, kind: 'cabin', label: '小屋'},
      {x: 3, y: 6, w: 2, h: 2, kind: 'bed', label: '床'},
      {x: 14, y: 3, w: 4, h: 4, kind: 'farm', label: '农田'},
    ],
  },
  field: {
    title: '野外', subtitle: 'CLAIRIÈRE', cols: 24, rows: 14,
    doors: [
      {x: 0, y: 11, label: '回家', to: 'home', arrival: [10.5, 2.25, 'down']},
      {x: 23, y: 11, label: '去商店', to: 'shop', arrival: [10.5, 9.5, 'up']},
    ],
    props: [
      {x: 1, y: 2, w: 3, h: 3, kind: 'grove'},
      {x: 20, y: 3, w: 3, h: 3, kind: 'grove'},
      {x: 10, y: 1, w: 3, h: 2, kind: 'pond'},
    ],
  },
  shop: {
    title: '商店', subtitle: 'BOUTIQUE', cols: 20, rows: 12,
    doors: [
      {x: 10, y: 0, label: '回家', to: 'home', arrival: [START.x, START.y, 'up']},
      {x: 10, y: 11, label: '去野外', to: 'field', arrival: [22.35, 11.5, 'left']},
    ],
    props: [
      {x: 3, y: 2, w: 6, h: 3, kind: 'shelf', label: '种子'},
      {x: 11, y: 2, w: 6, h: 3, kind: 'shelf', label: '水'},
      {x: 7, y: 6, w: 3, h: 2, kind: 'counter', label: '柜台'},
    ],
  },
}

export const NODES = [
  {id: 'rift-west', x: 5.5, y: 6.2},
  {id: 'rift-center', x: 11.5, y: 5.3},
  {id: 'rift-east', x: 18.5, y: 6.2},
]
export const NODE_RADIUS = 1.55
const BODY = 0.25
const doorsAt = zone => ZONES[zone].doors
const squares = (x, y, box) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h
const free = (zone, x, y) => x >= 0 && y >= 0 && x < zone.cols && y < zone.rows &&
  !zone.props.some(box => squares(x, y, box))

export function canStand(zoneId, x, y) {
  const zone = ZONES[zoneId]
  return Boolean(zone) && [-BODY, BODY].every(dx => [-BODY, BODY].every(dy => free(zone, x + dx, y + dy)))
}

export function movement(player, x, y, seconds) {
  const length = Math.hypot(x, y)
  if (!length) return player
  const delta = SPEED * Math.min(Math.max(seconds, 0), 0.05) / length
  const next = {...player, facing: y ? (y < 0 ? 'up' : 'down') : (x < 0 ? 'left' : 'right')}
  if (canStand(next.zone, next.x + x * delta, next.y)) next.x += x * delta
  if (canStand(next.zone, next.x, next.y + y * delta)) next.y += y * delta
  return next
}

export function doorUnder({zone, x, y}) {
  return doorsAt(zone).find(door => squares(x, y, {...door, w: 1, h: 1}))
}

export function transition({to, arrival: [x, y, facing]}) {
  return {zone: to, x, y, facing}
}

export function nearby({zone, x, y}) {
  if (zone !== 'field') return null
  return NODES.find(node => Math.hypot(node.x - x, node.y - y) <= NODE_RADIUS) || null
}
