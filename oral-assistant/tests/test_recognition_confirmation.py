import asyncio,hashlib,struct,unittest
import test_core as core
from exam import task_context


class RecognitionConfirmationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=core.IntegrationTests.asyncSetUp
    asyncTearDown=core.IntegrationTests.asyncTearDown
    connect=core.IntegrationTests.connect
    command=core.IntegrationTests.command
    wait_idle=core.IntegrationTests.wait_idle

    async def record(self,omit=False,await_offer=True):
        self.fake_runner.app['asr_text']="J'étais aussi à l'université."
        self.fake_runner.app['contexts']=[]
        self.fake_runner.app['omit_stt']=omit
        await self.connect()
        start=await self.command('start',mode='practice',part='intro',confirm_transcript=True)
        await self.wait_idle()
        await self.command('record_start')
        await self.ws.send_bytes(b''.join(struct.pack('<h',i%3000) for i in range(5000)))
        await self.command('record_stop')
        if not await_offer:
            session=self.app['bridge'].session
            return session,next(m for m in session['messages'] if m['role']=='user')
        if omit:self.app['bridge'].start_timeout(.03)
        async with asyncio.timeout(3):
            while not (self.app['bridge'].session.get('awaiting_confirmation') and self.app['bridge'].up is None):
                await asyncio.sleep(.01)
        session=self.app['bridge'].session
        row=next(m for m in session['messages'] if m.get('id')==session['awaiting_confirmation'])
        return session,row

    async def test_correct_before_reply_preserves_raw_and_sends_confirmed_context(self):
        session,row=await self.record()
        path=self.app['store'].folder(session['id'])/row['audio']
        before=hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(sum(m['role']=='assistant' for m in session['messages']),1)
        self.assertEqual(task_context(session)['recent_dialogue'][-1]['role'],'assistant')
        self.assertEqual((await self.command('next'))['type'],'error')
        self.assertEqual((await self.command('record_start'))['type'],'error')
        corrected="J'étudie à l'université."
        ack=await self.command('confirm_transcript',row=row['id'],text=corrected)
        self.assertEqual(ack['type'],'ack')
        await self.wait_idle()
        self.assertEqual(row['text'],"J'étais aussi à l'université.")
        self.assertEqual(row['revisions'][-1]['source'],'learner_confirmation')
        context=self.fake_runner.app['contexts'][-1]
        self.assertEqual(context['recent_dialogue'][-1]['text'],corrected)
        self.assertIn('不要重新开场',context['instruction'])
        self.assertEqual(before,hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual((await self.command('confirm_transcript',row=row['id'],text=corrected))['type'],'error')

    async def test_retry_retains_audio_and_excludes_cancelled_words(self):
        session,row=await self.record()
        self.assertEqual((await self.command('retry_recognition',row=row['id']))['type'],'ack')
        self.assertEqual(row['confirmation_status'],'cancelled')
        self.assertTrue((self.app['store'].folder(session['id'])/row['audio']).is_file())
        self.assertFalse(any(m['role']=='user' for m in task_context(session)['recent_dialogue']))
        self.assertEqual((await self.command('record_start'))['type'],'ack')
        await self.command('abort')

    async def test_pending_survives_reconnect_and_failed_confirm(self):
        session,row=await self.record();sid=session['id'];rid=row['id']
        await self.ws.close()
        async with asyncio.timeout(2):
            while self.app['bridge'] is not None:await asyncio.sleep(.01)
        await self.connect()
        restored=await self.command('restore',id=sid)
        self.assertEqual(restored['session']['awaiting_confirmation'],rid)
        for text in ['',42,'a'*2001]:
            self.assertEqual((await self.command('confirm_transcript',row=rid,text=text))['type'],'error')
        self.app['provider'].fail_connect=True
        self.assertEqual((await self.command('confirm_transcript',row=rid,text='Je suis étudiant.'))['type'],'error')
        self.assertEqual(self.app['bridge'].session['awaiting_confirmation'],rid)
        self.app['provider'].fail_connect=False
        self.assertEqual((await self.command('end'))['type'],'ack')
        saved=self.app['store'].load(sid)
        self.assertEqual(next(m for m in saved['messages'] if m['id']==rid)['confirmation_status'],'cancelled')

    async def test_missing_stt_allows_manual_confirmation_without_inventing_asr(self):
        session,row=await self.record(omit=True)
        self.assertEqual(row['text'],'')
        self.assertEqual((await self.command('confirm_transcript',row=row['id'],text="J'étudie à l'université."))['type'],'ack')
        await self.wait_idle()
        self.assertEqual(self.fake_runner.app['contexts'][-1]['recent_dialogue'][-1]['text'],"J'étudie à l'université.")
        self.assertEqual(row['text'],'')

    async def test_disconnect_before_stt_preserves_confirmation_and_audio(self):
        session,row=await self.record(omit=True,await_offer=False)
        sid=session['id'];await self.ws.close()
        async with asyncio.timeout(2):
            while self.app['bridge'] is not None:await asyncio.sleep(.01)
        await self.connect()
        restored=await self.command('restore',id=sid)
        self.assertEqual(restored['session']['awaiting_confirmation'],row['id'])
        self.assertTrue((self.app['store'].folder(sid)/row['audio']).is_file())
        self.assertEqual((await self.command('end'))['type'],'ack')
        self.assertTrue(all(m.get('confirmation_status')!='pending' for m in self.app['store'].load(sid)['messages']))


if __name__=='__main__':unittest.main()
