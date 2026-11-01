import asyncio
import copy
import json
import random
import unittest
from unittest.mock import patch
import test_core as core
from exam import create_session, SCENES, trigger
from flow import next_question
from question_bank import INTRO, KEYWORDS, WORD_GROUPS
from evaluation import context, validate, fingerprint


def sample():
    s=create_session('practice','intro');s['phase']='ended';s['ended']=s['created']+60
    s['messages']=[{'id':'a','role':'assistant','stage':'intro','text':'Où habitez-vous ?'},
        {'id':'u','role':'user','stage':'intro','text':"J'habite à Lyon.",'recognition_status':'recognized'},
        {'id':'bad','role':'user','stage':'intro','text':'INJECTED','confirmation_status':'cancelled'}]
    return s


def report(s):
    row=context(s)['learner_rows'][0]
    return {'summary':'能回答简单问题。','stages':[{'stage':'intro','task':'能介绍住所。','interaction':'能回答。',
        'vocabulary':'使用居住词汇。','grammar':'使用简单句。',
        'strengths':[{'row':row['id'],'quote':row['text'],'comment':'给出居住信息。'}],
        'improvements':[],'practice':['加一句介绍你的房间。']}]}


class BankTests(unittest.TestCase):
    def test_large_varied_and_balanced_draw(self):
        self.assertEqual(sum(len(q) for _,_,q in INTRO),42)
        self.assertGreaterEqual(len(KEYWORDS),45);self.assertEqual(len(KEYWORDS),len(set(KEYWORDS)))
        draws=[create_session('practice','intro') for _ in range(60)]
        self.assertGreater(len({tuple(s['keywords']) for s in draws}),50)
        self.assertGreater(len({s['intro_questions'][0]['topic'] for s in draws}),7)
        self.assertGreater(len({s['intro_questions'][0]['question'] for s in draws}),15)
        for s in draws:
            self.assertEqual(len(s['keywords']),6);self.assertEqual(len(set(s['keywords'])),6)
            groups=[next(k for k,v in WORD_GROUPS.items() if w in v) for w in s['keywords']]
            self.assertEqual(len(set(groups)),6)

    def test_stable_session_plan_skip_answered_and_repeat_request(self):
        s=sample();plan=copy.deepcopy(s['intro_questions']);a=next_question(s)
        self.assertEqual(a,next_question(s));self.assertNotEqual(a['topic'],'home')
        s['messages'].append({'id':'r','role':'user','stage':'intro','text':'Pouvez-vous répéter ?'})
        self.assertEqual(a,next_question(s));self.assertEqual(s['intro_questions'],plan)

    def test_short_answer_still_consumes_the_asked_topic(self):
        s=create_session('practice','intro');q=s['intro_questions'][0]
        s['messages']=[{'role':'assistant','stage':'intro','text':q['question']},
            {'id':'u','role':'user','stage':'intro','text':'Oui, beaucoup.'}]
        self.assertNotEqual(next_question(s)['topic'],q['topic'])

    def test_scene_snapshots_and_all_triggers(self):
        self.assertEqual(len(SCENES),12);self.assertEqual(len({s['id'] for s in SCENES}),12)
        for scene in SCENES:
            s=create_session('practice','roleplay',scene['id'])
            self.assertLessEqual(len(trigger(s)),12)
            self.assertTrue(s['scene']['materials']);s['scene']['materials'][0]['price']='CHANGED'
            self.assertNotEqual(scene['materials'][0]['price'],'CHANGED')
        with self.assertRaises(ValueError):create_session('practice','roleplay','missing')

    def test_legacy_without_plan_keeps_original_path(self):
        s=sample();s.pop('intro_questions');self.assertIn(next_question(s)['topic'],('identity','study','family','leisure','routine'))


class EvaluationTests(unittest.TestCase):
    def test_evidence_excludes_cancelled_and_uses_confirmed_not_later_revision(self):
        s=sample();s['messages'][1].update(confirmed_text='Je vis à Lyon.',revisions=[{'text':'FAKE LATER'}])
        c=context(s);self.assertEqual(len(c['learner_rows']),1);self.assertEqual(c['learner_rows'][0]['text'],'Je vis à Lyon.')
        self.assertNotIn('INJECTED',json.dumps(c));self.assertNotIn('FAKE LATER',json.dumps(c))

    def test_grounding_and_stage_validation(self):
        s=sample();r=report(s);self.assertEqual(validate(r,s),r)
        for key,value in [('row','a'),('row','foreign'),('quote','Made up text')]:
            bad=copy.deepcopy(r);bad['stages'][0]['strengths'][0][key]=value
            with self.assertRaises(ValueError):validate(bad,s)
        for stages in ([],r['stages']*2,[{**r['stages'][0],'stage':'exchange'}]):
            with self.assertRaises(ValueError):validate({**r,'stages':stages},s)

    def test_no_score_fields_and_hash_changes_with_evaluated_text(self):
        s=sample();r=report(s);r['score']=25
        self.assertNotIn('score',validate(r,s));before=fingerprint(s)
        s['messages'][1]['confirmed_text']='Je vis à Paris.';self.assertNotEqual(before,fingerprint(s))

    def test_intro_rejects_role_reversal_advice(self):
        s=sample();r=report(s);r['stages'][0]['improvements']=[{'row':'u','quote':"J'habite à Lyon.",'better':"J'habite à Lyon. Et vous ?",'reason':'反问'}]
        with self.assertRaises(ValueError):validate(r,s)


class EvaluationIntegrationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=core.IntegrationTests.asyncSetUp
    asyncTearDown=core.IntegrationTests.asyncTearDown
    connect=core.IntegrationTests.connect
    command=core.IntegrationTests.command

    async def wait_result(self):
        async with asyncio.timeout(5):
            while self.app['evaluator'].busy:await asyncio.sleep(.01)

    async def post(self,s):
        return await self.http.post(self.base+f'/api/sessions/{s["id"]}/evaluation',json={},headers={'Origin':self.base,'X-Oral-Client':'web'})

    async def test_auto_end_generate_retains_records_and_persists_after_disconnect(self):
        await self.connect();s=sample();s['phase']='active';self.app['bridge'].session=s
        self.app['store'].save(s);original=copy.deepcopy(s['messages'])
        self.assertEqual((await self.command('end'))['type'],'ack');await self.ws.close();await self.wait_result()
        saved=self.app['store'].load(s['id']);self.assertEqual(saved['evaluation']['status'],'ready')
        self.assertEqual(saved['messages'],original);self.assertEqual(len(saved['evaluation_history']),1)

    async def test_pending_blocks_concurrent_start_and_duplicate_and_retains_edits(self):
        s=sample();self.app['store'].save(s);self.fake_runner.app['evaluation_delay']=.2
        self.assertEqual((await self.post(s)).status,200)
        self.assertEqual((await self.post(s)).status,400)
        await self.connect();self.assertEqual((await self.command('start',mode='practice',part='intro'))['type'],'error')
        url=self.base+f'/api/sessions/{s["id"]}/revision'
        await self.http.post(url,json={'row':'u','text':'Later edit'},headers={'Origin':self.base,'X-Oral-Client':'web'})
        await self.wait_result();saved=self.app['store'].load(s['id'])
        self.assertEqual(saved['messages'][1]['revisions'][0]['text'],'Later edit')
        self.assertEqual(saved['evaluation']['status'],'ready')
        await self.post(s);await self.wait_result();self.assertEqual(len(self.app['store'].load(s['id'])['evaluation_history']),2)

    async def test_failure_retry_and_no_success_fabrication(self):
        s=sample();self.app['store'].save(s);self.app['provider'].fail_connect=True
        await self.post(s);await self.wait_result();saved=self.app['store'].load(s['id'])
        self.assertEqual(saved['evaluation']['status'],'error');self.assertNotIn('evaluation_history',saved)
        self.app['provider'].fail_connect=False;await self.post(s);await self.wait_result()
        self.assertEqual(self.app['store'].load(s['id'])['evaluation']['status'],'ready')

    async def test_empty_and_unfinished(self):
        s=sample();s['phase']='active';self.app['store'].save(s);self.assertEqual((await self.post(s)).status,400)
        s['phase']='ended';s['messages']=[];self.app['store'].save(s)
        self.assertEqual((await (await self.post(s)).json())['status'],'empty');self.assertFalse(self.app['evaluator'].busy)

    async def test_actual_mcp_initialization_before_evaluation(self):
        self.fake_runner.app['require_handshake']=True;self.app['provider'].mcp_handshake_required=True
        s=sample();self.app['store'].save(s);await self.post(s);await self.wait_result()
        self.assertEqual(self.app['store'].load(s['id'])['evaluation']['status'],'ready')


if __name__=='__main__':unittest.main()
