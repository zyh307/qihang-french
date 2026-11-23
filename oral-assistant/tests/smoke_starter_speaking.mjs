import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'

const origin = process.env.QIHANG_TEST_ORIGIN
assert.match(origin || '', /^http:\/\/127\.0\.0\.1:\d+$/, 'Set QIHANG_TEST_ORIGIN to an isolated local test service')
assert.equal(process.env.QIHANG_E2E_DATA, 'isolated', 'This script writes practice data. Use a fresh isolated service.')
const {chromium} = createRequire(import.meta.url)(process.env.QIHANG_PLAYWRIGHT || 'playwright-core')
const daily = '/api/daily-practice'
const browser = await chromium.launch({channel:'msedge', headless:true, args:['--autoplay-policy=no-user-gesture-required']})
try {
  const context = await browser.newContext({viewport:{width:1200,height:850}})
  let outgoing = 0
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    outgoing++
    return route.abort()
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async () => {
      const audio = new AudioContext({sampleRate:16000})
      await audio.resume()
      const output = audio.createMediaStreamDestination()
      window.feedSpeakingTest = async base64 => {
        const raw = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
        const data = new Int16Array(raw.buffer)
        const buffer = audio.createBuffer(1,data.length,16000)
        buffer.copyToChannel(Float32Array.from(data, sample => sample/32768),0)
        const source = audio.createBufferSource()
        source.buffer = buffer
        source.connect(output)
        await new Promise(resolve => {
          source.onended = resolve
          source.start(audio.currentTime+.15)
        })
      }
      const track = output.stream.getAudioTracks()[0]
      const stop = track.stop.bind(track)
      track.stop = () => {stop();void audio.close().catch(() => {})}
      return output.stream
    }})
  })

  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const button = (name) => page.getByRole('button',{name,exact:typeof name==='string'})
  const heading = (name) => page.getByRole('heading',{name,exact:typeof name==='string'})
  const games = origin+'/?desktop=1&daily=1'
  async function json(path, data) {
    const response = data === undefined ? await context.request.get(origin+path) :
      await context.request.post(origin+path,{data,headers:{Origin:origin,'X-Oral-Client':'web',
        'Content-Type':Buffer.isBuffer(data)?'application/octet-stream':'application/json'}})
    assert.ok(response.ok(), path + ' · ' + (await response.text()).slice(0,240))
    return response.json()
  }
  async function pcm(path) {
    const result = await context.request.get(origin+path)
    assert.ok(result.ok(),path)
    const wav = await result.body()
    assert.equal(wav.toString('ascii',36,40),'data')
    return wav.subarray(44)
  }
  const attempt = (base,state,action,data) => json(base+'/'+state.id+'/'+state.revision+'/'+action,data)
  function responseFor(path) {
    return page.waitForResponse(res => new URL(res.url()).pathname.startsWith(path) &&
      res.request().method()==='POST' && res.ok())
  }
  const feed = raw => page.evaluate(data => window.feedSpeakingTest(data), raw.toString('base64'))

  await page.goto(games)
  await heading('日常练习').waitFor()
  assert.equal((await json(daily)).recognizer_ready,true)
  await button('项目概览').click()
  await heading('启航法语 · 项目概览').waitFor()
  await button('进入日常练习').click()
  await button('读课文').click()
  const lectureBase = '/api/lecture'
  const texts = (await json(lectureBase+'?layout=guided')).texts
  assert.equal(texts.length,8)
  assert.ok(texts.every(row=>row.id.startsWith('studio-')))
  const opened = responseFor(lectureBase)
  await button(/初次见面与课堂/).click()
  let reading = await (await opened).json()
  const clip = line => pcm(lectureBase+'/'+reading.id+'/clip/'+line)
  const firstLine = reading.queue[0]
  const audio = await clip(firstLine)
  const readButton = button('按住说话')
  await readButton.press('Enter')
  await button('松手识别').waitFor()
  await feed(audio)
  const recorded = responseFor(lectureBase+'/'+reading.id)
  await button('松手识别').press('Enter')
  reading = await (await recorded).json()
  assert.equal(reading.attempts.length,1)
  assert.ok(reading.attempts[0].heard)
  await page.reload()
  await button('读课文').click()
  await button(/初次见面与课堂/).click()
  await button('保存并退出').waitFor()
  assert.equal((await json(lectureBase+'/'+reading.id)).attempts.length,1)
  for (let step=0; reading.phase !== 'offer' && reading.phase !== 'ended' && step<9;step++) {
    const before = reading.queue[0]
    reading = await attempt(lectureBase,reading,'record?attempt='+randomUUID(),await clip(before))
    if (reading.queue[0]===before) reading = await attempt(lectureBase,reading,'advance',{action:'timeout'})
  }
  if (reading.phase==='offer') reading=await attempt(lectureBase,reading,'advance',{action:'finish'})
  assert.equal(reading.phase,'ended')
  console.log('Reading completed and refresh restored the saved session.')

  await page.goto(games)
  await button('接拍串说').click()
  const fluency = daily+'/fluency'
  const genres = await json(fluency)
  assert.equal(genres.lessons.length,8)
  await page.getByLabel('练习课次').selectOption('studio-u08')
  await heading('查询信息与确认路线').waitFor()
  const firstStart = responseFor(fluency)
  await button('开始练习').click()
  let rhythm = await (await firstStart).json()
  assert.equal(rhythm.part,'studio-u08')
  await page.reload()
  await button('直接连起来说').click()
  await button('开始录音').click()
  await button('停止录音').waitFor()
  await feed(await pcm(fluency+'/audio/'+rhythm.lesson.chains[0].demo_wav))
  const firstRhythm = responseFor(fluency+'/'+rhythm.id)
  await button('停止录音').click()
  rhythm = await (await firstRhythm).json()
  assert.equal(rhythm.stage,'feedback')
  const firstRule = rhythm.last.rule
  for (let index=0;index<6;index++){
    if (rhythm.stage==='chunks') {
      rhythm=await attempt(fluency,rhythm,'advance',{action:'skip_chunks'})
      rhythm=await attempt(fluency,rhythm,'record?active_ms='+((index+1)*7000),
        await pcm(fluency+'/audio/'+rhythm.lesson.chains[index].demo_wav))
    }
    assert.equal(rhythm.stage,'feedback')
    rhythm=await attempt(fluency,rhythm,'advance',{action:'next'})
  }
  assert.equal(rhythm.phase,'ended')
  assert.equal(rhythm.outcomes.length,6)
  assert.ok(rhythm.outcomes.some(row=>row.verdict==='pass'))
  await page.reload()
  await button('查看上次结果').click()
  await button('下载判定日志').waitFor()
  console.log('Rhythm lesson U8 completed and the report reopened.')

  await page.goto(games)
  await button('看提示换一格').click()
  const slot = daily+'/slot'
  const slotStart = responseFor(slot)
  await button('开始练习').click()
  let slots = await (await slotStart).json()
  const slotPcm = (row) => {
    const candidate = slots.frame.candidates.find(c=>c.id===row.prompt.target)
    return pcm(slot+'/audio/'+candidate.demo_wav)
  }
  assert.equal(slots.lesson.frames.length,3)
  await button('开始口答').click()
  for (let card=0;card<4;card++){
    const finish = button(card===3?'录完了，看反馈':'下一张')
    await finish.waitFor()
    await feed(await slotPcm(slots.tasks[card]))
    await finish.click()
  }
  await heading('组末反馈').waitFor()
  slots = await json(slot+'/'+slots.id)
  const firstBlock=slots.rows.map(row=>row.verdict)
  for (const action of ['next_frame','next_frame']){
    slots=await attempt(slot,slots,'advance',{action})
    for (const task of slots.tasks) slots=await attempt(slot,slots,'record?active_ms=45000',await slotPcm(task))
    slots=await attempt(slot,slots,'grade',{})
  }
  slots=await attempt(slot,slots,'advance',{action:'finish'})
  assert.equal(slots.phase,'ended')
  assert.equal(slots.rows.length,12)
  assert.ok(slots.rows.every(row=>row.verdict==='pass'),JSON.stringify(slots.rows.map(row=>[row.frame_id,row.rule,row.recognized])))

  await page.goto(games)
  await button('看提示换一格').click()
  await button('查看上次结果').click()
  await button('下载判定日志').waitFor()
  await page.goto(games)
  await page.getByText('今日练习',{exact:true}).first().waitFor()
  await button('读课文').click()
  await button(/需练习本/).click()
  await heading('需练习本').waitFor()

  await page.goto(games)
  await button(/^游戏模式/).click()
  await page.getByLabel('角色 ID').fill('IrisTest')
  await button('创建并出发').click()
  await button('跳过开场').click()
  await heading('家').waitFor()
  await button('电台面板').click()
  await page.getByText('默认电台暂不可用',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  assert.equal(outgoing,0)
  console.log(JSON.stringify({lecture:{attempts:reading.attempts.length, independent:reading.outcomes.filter(row=>row.passKind==='independent').length},
    fluency:{items:rhythm.outcomes.length, firstRule, pass:rhythm.outcomes.filter(row=>row.verdict==='pass').length},
    slot:{items:slots.rows.length, firstBlock, pass:slots.summary.passes},outgoing}))
} finally { await browser.close() }
