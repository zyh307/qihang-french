import asyncio,struct,unittest
import test_core as core
from exam import create_session,instruction,task_context
from flow import progress,next_question,finish_reply
from fake_primary_asr import FakePrimaryASR


def learner(s,text,card=None):
    row={'id':str(len(s['messages'])),'role':'user','stage':s['stages'][s['stage_index']],
         'text':text,'recognition_status':'recognized'}
    if card is not None:row['card_index']=card
    s['messages'].append(row);return row


class FlowTests(unittest.TestCase):
    def test_intro_two_answers_never_restart_or_end(self):
        s=create_session('practice','intro');learner(s,"Je m'appelle Alex.");learner(s,"J'habite à Hangzhou.")
        self.assertFalse(progress(s,now=s['stage_started']+900)['closing'])
        self.assertNotIn(next_question(s)['topic'],('identity','home'))
        self.assertIn('4至6轮',instruction(s))
        self.assertNotIn('先用简单法语问候',instruction(s))

    def test_intro_six_rounds_close_and_clarification_is_not_answer(self):
        s=create_session('practice','intro')
        for _ in range(5):learner(s,'Je suis étudiant.')
        learner(s,'Pouvez-vous répéter ?');self.assertEqual(progress(s)['answers'],5);self.assertFalse(progress(s)['closing'])
        row=learner(s,"J'aime lire.");self.assertTrue(progress(s)['closing']);finish_reply(s,row['id'],True)
        self.assertTrue(progress(s)['completed']);self.assertIn('不再提新问题',instruction(s))

    def test_six_cards_mark_only_after_reply_and_never_twice(self):
        s=create_session('practice','exchange')
        for i in range(6):
            row=learner(s,'Avez-vous des frères ?',i)
            self.assertEqual(len(s['exchange_done']),i)
            closing=progress(s)['closing'];self.assertEqual(closing,i==5)
            finish_reply(s,row['id'],closing);finish_reply(s,row['id'],closing)
            self.assertEqual(len(s['exchange_done']),i+1)
        self.assertTrue(progress(s)['completed'])
        self.assertIn('有一个姐姐',instruction(s))

    def test_exchange_statement_does_not_consume_card(self):
        s=create_session('practice','exchange');row=learner(s,"J'aime lire.",0)
        finish_reply(s,row['id'],False);self.assertEqual(s['exchange_done'],[])
        self.assertIn('禁止反问Et vous',instruction(s))

    def test_roleplay_goodbye_closes_after_exchange_not_at_hello(self):
        s=create_session('practice','roleplay','boulangerie');row=learner(s,'Au revoir.');self.assertFalse(progress(s)['closing'])
        row=learner(s,'Merci, au revoir.');self.assertTrue(progress(s)['closing'])
        self.assertIn('找零',instruction(s));self.assertIn('1.20',instruction(s))

    def test_old_records_keep_manual_flow(self):
        s=create_session('practice','intro');s.pop('flow_version')
        for _ in range(7):learner(s,'Bonjour.')
        self.assertFalse(progress(s)['closing'])


class FlowIntegrationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=core.IntegrationTests.asyncSetUp
    asyncTearDown=core.IntegrationTests.asyncTearDown
    connect=core.IntegrationTests.connect
    command=core.IntegrationTests.command

    async def until(self,condition):
        async with asyncio.timeout(5):
            while not condition():await asyncio.sleep(.01)

    async def begin(self,part='intro'):
        await self.app['french_asr'].close();self.asr=FakePrimaryASR();self.app['french_asr']=self.asr
        self.fake_runner.app['flow_replies']=True;self.fake_runner.app['contexts']=[]
        await self.connect();self.assertEqual((await self.command('start',mode='practice',part=part,recognition_mode='independent_fr'))['type'],'ack')

    async def idle(self):await self.until(lambda:not self.app['bridge'].busy and not self.app['bridge'].asr_task and self.app['bridge'].up is not None)

    async def record(self,text):
        self.asr.text=text;self.assertEqual((await self.command('record_start'))['type'],'ack')
        await self.ws.send_bytes(struct.pack('<h',3000)*1600);await self.command('record_stop');await self.idle()

    async def test_intro_six_turns_continue_past_name_city_and_close(self):
        await self.begin();await self.idle()
        for text in ["Je m'appelle Alex.","J'habite à Hangzhou.",'Je suis étudiant.','J’ai une sœur.',"J'aime lire.",'Je me lève à huit heures.']:
            await self.record(text)
        contexts=self.fake_runner.app['contexts'];self.assertNotIn(contexts[2]['intro_plan']['topic'],('identity','home'))
        self.assertTrue(progress(self.app['bridge'].session)['completed'])
        self.assertEqual((await self.command('record_start'))['type'],'error')
        self.assertEqual(len([m for m in self.app['bridge'].session['messages'] if m['role']=='assistant']),7)

    async def test_exchange_all_six_cards_advance_then_complete(self):
        await self.begin('exchange');await self.idle()
        for i in range(6):
            self.assertEqual(self.app['bridge'].session['keyword_index'],i)
            await self.record('Est-ce que vous aimez lire ?')
            self.assertEqual(len(self.app['bridge'].session['exchange_done']),i+1)
        self.assertTrue(progress(self.app['bridge'].session)['completed'])

    async def test_missing_context_reply_is_blocked_and_retried(self):
        self.fake_runner.app['skip_context']=1
        await self.begin();await self.until(lambda:self.app['provider'].connections>=2 and not self.app['bridge'].busy and any(m['role']=='assistant' for m in self.app['bridge'].session['messages']))
        self.assertNotIn('WRONG-OPENING',str(self.app['bridge'].session['messages']))
        self.assertEqual(sum(e['type']=='missing_task_context' for e in self.app['bridge'].session['events']),1)

    async def test_missing_context_has_bounded_retries_and_keeps_raw(self):
        await self.begin();await self.idle();self.fake_runner.app['omit_context']=True
        await self.command('record_start');await self.ws.send_bytes(struct.pack('<h',3000)*1600);await self.command('record_stop')
        await self.until(lambda:self.app['bridge'].up is None and self.app['bridge'].context_retries==3)
        s=self.app['bridge'].session;row=next(m for m in s['messages'] if m['role']=='user')
        self.assertEqual(row['text'],self.asr.text);self.assertTrue((self.app['store'].folder(s['id'])/row['audio']).exists())
        self.assertNotIn('WRONG-OPENING',str(s['messages']))

    async def test_example_range_and_whitelist(self):
        # Transport fixture only: no third-party recording is distributed.
        from pathlib import Path
        example_root=Path(self.temp.name)/'example_fixture';example_root.mkdir()
        (example_root/'intro.mp4').write_bytes(b'\x00\x00\x00\x18ftypisom'+b'\x00'*256)
        self.app['examples_root']=example_root
        response=await self.http.get(self.base+'/examples/intro.mp4',headers={'Range':'bytes=0-127'})
        self.assertEqual(response.status,206);self.assertEqual(len(await response.read()),128)
        self.assertIn(b'ftyp',await (await self.http.get(self.base+'/examples/intro.mp4',headers={'Range':'bytes=0-63'})).read())
        self.assertEqual((await self.http.get(self.base+'/examples/sources.json')).status,404)

    async def test_missing_examples_keep_guide_and_practice_available(self):
        response=await self.http.get(self.base+'/api/bootstrap');data=await response.json()
        self.assertEqual(data['examples']['intro'],{'video':False,'poster':False})
        self.assertEqual((await self.http.get(self.base+'/examples/intro.mp4')).status,404)
        await self.begin();await self.idle()
        self.assertTrue(any(m['role']=='assistant' for m in self.app['bridge'].session['messages']))

    async def test_task_tools_register_before_first_control(self):
        self.fake_runner.app['require_handshake']=True
        self.app['provider'].mcp_handshake_required=True
        await self.begin();await self.idle()
        self.assertEqual(sum(e['type']=='task_tools_registered' for e in self.app['bridge'].session['events']),1)

    async def test_card_selection_checks_indices_and_context(self):
        await self.begin('exchange');await self.idle()
        for index in (-1,6,True,'0'):
            self.assertEqual((await self.command('select_keyword',index=index))['type'],'error')
        self.assertEqual((await self.command('select_keyword',index=3))['type'],'ack');await self.idle()
        context=self.fake_runner.app['contexts'][-1]
        self.assertEqual(len(context['keyword_cards']),6)
        self.assertEqual(context['keyword'],self.app['bridge'].session['keywords'][3])


if __name__=='__main__':unittest.main()
