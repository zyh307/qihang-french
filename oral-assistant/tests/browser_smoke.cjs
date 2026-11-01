// Isolated fixture only. No binding identity, real voice, downloaded model or public tunnel.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.QIHANG_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QIHANG_TEST_URL||'http://127.0.0.1:8137';
(async()=>{
 const options={headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']};
 if(process.env.QIHANG_BROWSER_EXECUTABLE)options.executablePath=process.env.QIHANG_BROWSER_EXECUTABLE;
 const browser=await chromium.launch(options),context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.locator('#home').waitFor();await page.waitForFunction(()=>!!S.boot);
  const info=await (await context.request.get(base+'/test-info')).json();assert.equal(info.test_only,true);
  const boot=await page.evaluate(()=>S.boot);assert.deepEqual([boot.bank.intro_questions,boot.bank.keywords,boot.bank.scenes],[42,48,12]);results.push('Public bank contains 42 questions, 48 cards and 12 scenes');
  await page.locator('[data-part=intro]').click();await page.locator('#guideDialog').waitFor();assert.equal(await page.locator('#guideVideo').isVisible(),false);assert.equal(await page.locator('#guideVideo').getAttribute('src'),null);assert.match(await page.locator('#guideVideoError').innerText(),/原视频链接/);assert.equal(await page.locator('#guideSteps li').count(),2);results.push('No unlicensed media request; original link and textual guide remain');
  await page.locator('#guideTabs button').nth(2).click();assert.equal(await page.evaluate(()=>S.guidePart),'roleplay');await page.locator('#guideClose').click();
  const before=await page.evaluate(()=>fetch('/api/bootstrap').then(r=>r.json()));assert.equal(before.sessions.length,0);results.push('Opening and closing guides creates no practice record');
  await page.selectOption('#scene','station');await page.locator('[data-part=roleplay]').click();await page.locator('#guideStart').click();await page.waitForFunction(()=>!document.querySelector('#mic').disabled);assert.match(await page.locator('#sceneTitle').innerText(),/gare/);assert.match(await page.locator('#materials').innerText(),/35,00/);results.push('New scene can start directly without a video');
  await page.locator('#mic').click();await page.waitForFunction(()=>document.querySelector('#micLabel').textContent==='我说完了');await page.waitForTimeout(400);await page.locator('#mic').click();await page.waitForFunction(()=>document.querySelector('#transcript').textContent.includes('测试转写'));await page.waitForFunction(()=>!document.querySelector('#mic').disabled);results.push('Fixture recording, transcript and examiner reply work');
  await page.locator('#finish').click();await page.locator('#review').waitFor();await page.locator('.evaluation-stage').waitFor();assert.match(await page.locator('#evaluationContent').innerText(),/测试AI评价/);assert.equal(await page.locator('#reviewTranscript audio').count(),1);results.push('End saves original audio and generates evidence-based evaluation');
  const job=await page.evaluate(()=>S.review.evaluation.job);await page.locator('#evaluate').click();await page.waitForFunction(old=>S.review.evaluation.job!==old&&S.review.evaluation.status==='ready',job);results.push('Regenerate waits for a different completed evaluation job');
  const exported=await page.evaluate(()=>evaluationLines(S.review.evaluation).join('\n'));assert.match(exported,/AI口语复盘/);assert.match(exported,/下一步/);results.push('Export includes the evaluation and actionable practice');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);results.push('390px layout has no horizontal overflow or JS error');
  console.log(JSON.stringify({passed:results.length,results,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
