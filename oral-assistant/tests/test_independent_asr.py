import asyncio,hashlib,struct,unittest
import test_core as core
from exam import task_context
from fake_primary_asr import FakePrimaryASR


class IndependentASRTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=core.IntegrationTests.asyncSetUp
    asyncTearDown=core.IntegrationTests.asyncTearDown
    connect=core.IntegrationTests.connect
    command=core.IntegrationTests.command
    async def wait_idle(self):
        async with asyncio.timeout(3):
            while self.app['bridge'].busy or self.app['bridge'].asr_task:
                await asyncio.sleep(.01)

    async def begin(self,confirm=False):
        await self.app['french_asr'].close()
        self.asr=FakePrimaryASR();self.app['french_asr']=self.asr
        for name in ('contexts','received_audio','listen_states'):self.fake_runner.app[name]=[]
        await self.connect()
        result=await self.command('start',mode='practice',part='full',recognition_mode='independent_fr',confirm_transcript=confirm)
        self.assertEqual(result['type'],'ack');await self.wait_idle()

    async def record(self):
        self.assertEqual((await self.command('record_start'))['type'],'ack')
        self.pcm=b''.join(struct.pack('<h',i%3000) for i in range(8000))
        await self.ws.send_bytes(self.pcm)
        self.assertEqual((await self.command('record_stop'))['type'],'ack')
        return self.app['bridge'].session['messages'][-1]

    async def until(self,condition):
        async with asyncio.timeout(3):
            while not condition():await asyncio.sleep(.01)

    async def test_all_three_stages_send_text_context_and_no_vendor_audio(self):
        await self.begin()
        for stage in ('intro','exchange','roleplay'):
            row=await self.record();await self.wait_idle()
            self.assertEqual(row['stage'],stage)
            self.assertEqual(row['text'],self.asr.text)
            self.assertEqual(row['transcript_source'],'whisper_fr')
            self.assertNotIn('confirmed_text',row)
            self.assertNotIn('revisions',row)
            self.assertEqual(self.asr.calls[-1],self.pcm)
            context=self.fake_runner.app['contexts'][-1]
            self.assertEqual(context['recent_dialogue'][-1]['text'],self.asr.text)
            self.assertIn('不要重新开场',context['instruction'])
            self.assertEqual(self.fake_runner.app['received_audio'],[])
            self.assertTrue(all(s=='detect' for s in self.fake_runner.app['listen_states']))
            if stage!='roleplay':await self.command('next');await self.wait_idle()
        await self.command('end')

    async def test_optional_confirmation_keeps_raw_audio_and_corrected_context(self):
        await self.begin(confirm=True);row=await self.record()
        await self.until(lambda:self.app['bridge'].session.get('awaiting_confirmation'))
        session=self.app['bridge'].session
        self.assertEqual(len([m for m in session['messages'] if m['role']=='assistant']),1)
        path=self.app['store'].folder(session['id'])/row['audio'];digest=hashlib.sha256(path.read_bytes()).hexdigest()
        await self.command('confirm_transcript',row=row['id'],text='Je suis étudiant.');await self.wait_idle()
        self.assertEqual(self.fake_runner.app['contexts'][-1]['recent_dialogue'][-1]['text'],'Je suis étudiant.')
        self.assertEqual(row['text'],self.asr.text)
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),digest)

    async def test_empty_and_failure_do_not_fall_back_to_vendor(self):
        await self.begin()
        for error in (None,'模拟识别连接失败'):
            self.asr.text='';self.asr.error=error
            row=await self.record()
            await self.until(lambda:self.app['bridge'].session.get('awaiting_confirmation'))
            self.assertEqual(row['recognition_status'],'failed' if error else 'empty')
            self.assertEqual(self.fake_runner.app['received_audio'],[])
            self.assertEqual(len(self.fake_runner.app['contexts']),1)
            # A failed examiner connection must not prevent retrying local audio.
            self.app['provider'].fail_connect=True
            self.assertEqual((await self.command('retry_recognition',row=row['id']))['type'],'ack')
            self.app['provider'].fail_connect=False
        self.asr.text='Bonjour.';self.asr.error=None
        await self.record();await self.wait_idle()

    async def test_pending_is_responsive_and_abort_prevents_late_reply(self):
        await self.begin();self.asr.delay=.2;row=await self.record()
        self.assertEqual((await self.command('next'))['type'],'error')
        self.assertEqual((await self.command('record_start'))['type'],'error')
        self.assertEqual((await self.command('abort'))['type'],'ack')
        await asyncio.sleep(.3)
        self.assertEqual(row['recognition_status'],'cancelled')
        self.assertEqual(len(self.fake_runner.app['contexts']),1)
        self.assertEqual(row['text'],'')
        self.assertTrue((self.app['store'].folder(self.app['bridge'].session['id'])/row['audio']).exists())

    async def test_end_cancels_recognition_and_keeps_wave(self):
        await self.begin();self.asr.delay=.2;row=await self.record();sid=self.app['bridge'].session['id']
        await self.command('end');await asyncio.sleep(.3)
        saved=self.app['store'].load(sid)
        self.assertEqual(saved['phase'],'ended');self.assertEqual(row['recognition_status'],'cancelled')
        self.assertEqual(len(self.fake_runner.app['contexts']),1)

    async def test_browser_disconnect_can_restore_pending_audio(self):
        await self.begin();self.asr.delay=.3;row=await self.record();sid=self.app['bridge'].session['id']
        await self.ws.close();await self.until(lambda:self.app['bridge'] is None)
        await self.connect();result=await self.command('restore',id=sid)
        self.assertEqual(result['session']['awaiting_confirmation'],row['id'])
        self.assertEqual((await self.command('confirm_transcript',row=row['id'],text='Bonjour.'))['type'],'ack')
        await self.wait_idle()

    async def test_examiner_failure_keeps_successful_recognition_for_resume(self):
        await self.begin();self.app['provider'].fail_connect=True;row=await self.record()
        await self.until(lambda:self.app['bridge'].asr_task is None)
        self.assertEqual(row['recognition_status'],'recognized')
        self.assertEqual(task_context(self.app['bridge'].session)['recent_dialogue'][-1]['text'],self.asr.text)
        self.app['provider'].fail_connect=False
        await self.command('resume');await self.wait_idle()
        self.assertEqual(self.fake_runner.app['contexts'][-1]['recent_dialogue'][-1]['text'],self.asr.text)

    async def test_unavailable_service_rejects_start_without_creating_record(self):
        await self.begin();await self.command('end');before=len(self.app['store'].listing())
        self.asr.state.update(available=False,message='模型未就绪')
        self.assertEqual((await self.command('start',mode='practice',part='intro',recognition_mode='independent_fr'))['type'],'error')
        self.assertEqual(len(self.app['store'].listing()),before)


if __name__=='__main__':unittest.main()
