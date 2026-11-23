import {NODES, TILE, ZONES} from './world.js'

const DIRECTIONS = ['down', 'left', 'right', 'up']
const palettes = {
  hair: ['#463141', '#742f39'], shirt: ['#32775e', '#b55263'], pants: ['#3b5375', '#775247'],
  skin: ['#edb48a', '#ae735b'], shoes: ['#302a36', '#344e40'],
}
const fill = (ctx, color, x, y, width, height) => {
  ctx.fillStyle = color
  ctx.fillRect(x, y, width, height)
}
const pixels = (ctx, color, x, y, rects) => {
  for (const [dx, dy, w, h] of rects) fill(ctx, color, x + dx, y + dy, w, h)
}

export async function loadArt(assetSource) {
  if (assetSource !== 'private' || window.QihangOralClient ||
      !['localhost', '127.0.0.1'].includes(location.hostname)) return {}
  const prefix = '/api/game/local-art'
  try {
    const response = await fetch(prefix)
    if (!response.ok) return {}
    const {files} = await response.json()
    const ready = await Promise.all(files.map(name => new Promise(resolve => {
      const image = new Image()
      image.onload = () => resolve([name, image])
      image.onerror = () => resolve([name, null])
      image.src = prefix + '/' + encodeURIComponent(name)
    })))
    return Object.fromEntries(ready)
  } catch {
    return {}
  }
}

export function drawAvatar(ctx, feetX, feetY, appearance, facing, frame, art = {}) {
  const x = Math.round(feetX) - 8, y = Math.round(feetY) - 22
  const side = facing === 'left' ? -1 : facing === 'right' ? 1 : 0
  const bounce = [0, 1, 0, 1][frame], left = [0, -1, 0, 1][frame], right = -left
  const blocks = {
    skin: [[4 + side, 4 + bounce, 8, 7], [3, 12 + bounce, 10, 3]],
    pants: [[5, 15 + left, 3, 5], [8, 15 + right, 3, 5]],
    shoes: [[4, 20 + left, 4, 2], [8, 20 + right, 4, 2]],
    shirt: [[4, 11 + bounce, 8, 6], [3, 12 + bounce, 1, 3], [12, 12 + bounce, 1, 3]],
    hair: [[4, 3 + bounce, 8, 2], [4 + side, 5 + bounce, side ? 5 : 8, 1],
      ...(appearance.hair ? [[side < 0 ? 10 : 3, 5 + bounce, 2, 6]] : [])],
  }
  for (const layer of ['skin', 'pants', 'shoes', 'shirt', 'hair']) {
    const image = art[layer + '-' + (appearance[layer] + 1) + '.png']
    if (image?.naturalWidth === 64 && image.naturalHeight === 96) {
      ctx.drawImage(image, frame * 16, DIRECTIONS.indexOf(facing) * 24, 16, 24, x, y - 2, 16, 24)
    } else {
      pixels(ctx, palettes[layer][appearance[layer]], x, y, blocks[layer])
      if (layer === 'skin' && facing !== 'up') {
        pixels(ctx, '#392a37', x, y, side ? [[8 + side * 2, 7 + bounce, 1, 1]] : [[6, 7 + bounce, 1, 1], [9, 7 + bounce, 1, 1]])
      }
    }
  }
}

function terrain(ctx, zoneId) {
  const zone = ZONES[zoneId]
  const indoor = zoneId === 'shop'
  for (let row = 0; row < zone.rows; row++) {
    for (let col = 0; col < zone.cols; col++) {
      const x = col * TILE, y = row * TILE
      const grain = (row * 13 + col * 17 + row * col * 3) % 7
      const track = zoneId === 'field' ? (row >= 10 && row <= 11) ||
        (row >= 6 && (col === 5 || col === 11 || col === 18)) : col >= 9 && col <= 11
      const edge = row === 0 || col === 0 || row === zone.rows - 1 || col === zone.cols - 1
      const tones = indoor ? ['#cd9d71', '#d4a578', '#c59870'] :
        track ? ['#cbb584', '#d2bd8e', '#ccb888'] : edge ? ['#719157', '#769856', '#789655'] :
          ['#99ac67', '#a3b36d', '#9eaf6b']
      fill(ctx, tones[grain % 3], x, y, TILE, TILE)
      if (indoor) {
        fill(ctx, '#ba875c', x, y + 15, TILE, 1)
      } else if (!track && grain < 3) {
        pixels(ctx, edge ? '#587843' : '#829a54', x, y, [[3, 4, 2, 1], [10, 12, 2, 2], [11, 10, 1, 2]])
        if (grain === 0) fill(ctx, '#e7c88d', x + 3, y + 3, 2, 2)
      }
    }
  }
  for (const box of zone.props) drawProp(ctx, box)
  for (const door of zone.doors) {
    const x = door.x * TILE, y = door.y * TILE
    pixels(ctx, '#483b43', x, y, [[1, 0, 14, 15]])
    pixels(ctx, '#d4a366', x, y, [[2, 1, 2, 13], [12, 1, 2, 13], [4, 1, 8, 2]])
    pixels(ctx, '#f3d49a', x, y, [[4, 13, 8, 2], [7, 6, 2, 5], [5, 8, 6, 1]])
  }
}

function drawProp(ctx, box) {
  const x = box.x * TILE, y = box.y * TILE, w = box.w * TILE, h = box.h * TILE
  const colors = {
    cabin: ['#593c46', '#a45746', '#ddb17e'],
    bed: ['#5d4658', '#a65b6e', '#f2d3a7'],
    farm: ['#6b523e', '#906945', '#cfa779'],
    grove: ['#396342', '#4e7e4b', '#75a358'],
    pond: ['#537b67', '#6d9f99', '#a9c7b0'],
    shelf: ['#6e5045', '#93654f', '#e3bc84'],
    counter: ['#6c4c47', '#9e6d52', '#d8ab72'],
  }
  const [shadow, base, light] = colors[box.kind]
  fill(ctx, shadow, x, y + 3, w, h - 3)
  fill(ctx, base, x + 3, y, w - 6, h - 6)
  if (box.kind === 'farm') {
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const left = x + 5 + col * 29, top = y + 5 + row * 28
      fill(ctx, shadow, left, top, 24, 23)
      for (let i = 1; i < 4; i++) fill(ctx, base, left + 4, top + i * 5, 16, 2)
    }
    return
  }
  const inset = box.kind === 'cabin' ? Math.round(h * 0.43) : 7
  fill(ctx, light, x + 6, y + inset, w - 12, box.kind === 'cabin' ? h - inset - 9 : 4)
  for (let offset = 10; offset < w - 8; offset += 14) fill(ctx, shadow, x + offset, y + h - 13, 5, 3)
}

function rift(ctx, node, now, index) {
  const x = Math.round(node.x * TILE), y = Math.round(node.y * TILE)
  const phase = now * 0.0016 + index * 2
  pixels(ctx, '#604858', x, y, [[-10, 3, 20, 5], [-7, 8, 14, 2]])
  pixels(ctx, '#7a557b', x, y, [[-12, -6, 24, 12], [-8, -9, 16, 18]])
  pixels(ctx, '#303049', x, y, [[-8, -5, 16, 10], [-5, -7, 10, 14]])
  for (let step = 0; step < 6; step++) {
    const angle = phase + step * Math.PI / 3
    const radius = 5 + step
    fill(ctx, step % 2 ? '#dcb9dd' : '#9b79aa', x + Math.round(radius * Math.cos(angle)),
      y + Math.round(radius * 0.72 * Math.sin(angle)), 2, 2)
  }
  for (let step = 0; step < 3; step++) {
    const angle = phase * 0.56 + step * 2.1
    fill(ctx, '#efd4af', x + Math.round(14 * Math.cos(angle)), y + Math.round(11 * Math.sin(angle)), 1, 1)
  }
}

export function makeRenderer(canvas, art) {
  const buffer = document.createElement('canvas')
  const ground = buffer.getContext('2d')
  const ctx = canvas.getContext('2d')
  let previousZone
  return (player, appearance, now, walking) => {
    if (previousZone !== player.zone) {
      previousZone = player.zone
      const {cols, rows} = ZONES[player.zone]
      canvas.width = buffer.width = cols * TILE
      canvas.height = buffer.height = rows * TILE
      ground.imageSmoothingEnabled = ctx.imageSmoothingEnabled = false
      const image = art[player.zone + '.png']
      if (image?.naturalWidth === buffer.width && image.naturalHeight === buffer.height) ground.drawImage(image, 0, 0)
      else terrain(ground, player.zone)
    }
    ctx.drawImage(buffer, 0, 0)
    if (player.zone === 'field') NODES.forEach((node, index) => rift(ctx, node, now, index))
    const x = Math.round(player.x * TILE), y = Math.round(player.y * TILE)
    pixels(ctx, '#545942', x, y, [[-5, -2, 10, 3], [-3, -3, 6, 5]])
    drawAvatar(ctx, x, y, appearance, player.facing, walking ? Math.floor(now / 105) % 4 : 0, art)
  }
}
