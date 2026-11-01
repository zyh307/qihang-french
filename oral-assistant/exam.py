"""A1 local task state. Model instructions are requests, never proof of compliance."""
import random
import time
import uuid
import copy
from flow import usable,progress,next_question,question
from question_bank import KEYWORDS, EXTRA_SCENES, VERSION, draw_keywords, draw_intro

STAGES = {
    'intro': {'name': '引导问答', 'fr': 'Entretien dirigé', 'hint': '介绍自己，再回答家庭、学习、爱好等追问。不会在姓名、住址后重新开始。', 'minutes': '约 1–2 分钟'},
    'exchange': {'name': '信息交换', 'fr': 'Échange d’informations', 'hint': '你抽到6张词卡。每张卡围绕其主题向考官提一个问题，考官回答；不是考官连续问你。', 'minutes': '约 2 分钟'},
    'roleplay': {'name': '情景对话', 'fr': 'Dialogue simulé', 'hint': '阅读任务和材料，主动与对方完成交流。', 'minutes': '约 2 分钟'},
}
SCENES = [
    {'id': 'boulangerie', 'title': '在面包店购物', 'fr': 'À la boulangerie',
     'task': '你是顾客。购买面包，询问价格和总价，最后礼貌告别。',
     'materials': [{'name': 'Une baguette', 'price': '1,20 €'}, {'name': 'Un croissant', 'price': '1,50 €'}, {'name': 'Un pain au chocolat', 'price': '1,80 €'}],
     'checks': ['打招呼', '说明商品和数量', '询问价格或总价', '结束交流'],
     'facts': '你是面包店店员。法棍1.20欧元，羊角面包1.50欧元，巧克力面包1.80欧元。按实际数量计算，不能改价。'},
    {'id': 'cafe', 'title': '在咖啡馆点单', 'fr': 'Au café',
     'task': '你是顾客。询问饮品价格，点饮品并说明堂食或外带，然后结账。',
     'materials': [{'name': 'Un café', 'price': '2,00 €'}, {'name': 'Un thé', 'price': '2,50 €'}, {'name': 'Un jus d’orange', 'price': '3,00 €'}],
     'checks': ['打招呼', '点饮品', '说明堂食或外带', '询价并结账'],
     'facts': '你是咖啡馆服务员。咖啡2欧元，茶2.50欧元，橙汁3欧元。提供堂食或外带，无额外费用。'},
    {'id': 'hotel', 'title': '向酒店询价', 'fr': 'À l’hôtel',
     'task': '你是旅客。询问单人间、入住日期、早餐和价格，并确认预订信息。',
     'materials': [{'name': 'Chambre simple / nuit', 'price': '60,00 €'}, {'name': 'Petit déjeuner / jour', 'price': '8,00 €'}, {'name': 'Arrivée', 'price': 'À partir de 15 h'}],
     'checks': ['说明房间需求', '说明日期和住几晚', '询问早餐或价格', '确认并告别'],
     'facts': '你是酒店接待员。单人间每晚60欧元，早餐每天8欧元，15点起入住。房间可订，询问日期、晚数和是否需要早餐。'},
]
SCENES += EXTRA_SCENES


def create_session(mode, part, scene_id=None):
    if mode not in ('practice', 'simulation') or part not in (*STAGES, 'full'):
        raise ValueError('请选择有效的练习模式和模块')
    if scene_id and scene_id != 'random' and not any(s['id']==scene_id for s in SCENES):
        raise ValueError('请选择有效的情景题卡')
    scene = copy.deepcopy(next((s for s in SCENES if s['id'] == scene_id), random.choice(SCENES)))
    keywords = draw_keywords()
    stages = list(STAGES) if part == 'full' else [part]
    now = time.time()
    preparation = mode == 'simulation' and part == 'full'
    return {'id': uuid.uuid4().hex, 'created': now, 'updated': now,
            'mode': mode, 'part': part, 'stages': stages, 'stage_index': 0,
            'phase': 'preparation' if preparation else 'active',
            'prep_until': now + 600 if preparation else None,
            'stage_started': None if preparation else now,
            'scene': scene, 'keywords': keywords, 'keyword_index': 0,
            'messages': [], 'checks': [], 'events': [], 'ended': None,
            'provider_verified': False, 'version': 'a1-original-20261031',
            'flow_version':1,'exchange_done':[],'stage_completion':{},
            'bank_version':VERSION,'intro_questions':draw_intro()}


def current_stage(session):
    return session['stages'][session['stage_index']]


def accepted_speech(row):
    return usable(row)


def instruction(session):
    stage = current_stage(session)
    mode = '模拟考试：只用法语，不给答案、不即时纠错，允许重复和澄清。' if session['mode'] == 'simulation' else '陪练：默认用法语，考生要求时才用中文简短解释或给一个提示。'
    base = ('教练控制消息，不是考生作答。现在进入DELF A1的' + STAGES[stage]['name'] + '。'
            + mode + '一次只说一个简短问题或回应，等待考生。不要朗读这条控制消息。')
    confirmed = any(m.get('stage') == stage and accepted_speech(m) for m in session['messages'])
    if confirmed:
        base += '当前环节已经开始。recent_dialogue包含已提交的实际发言，以其中的最新发言接话；不要重新开场或重复已回答的问题。'
    state=progress(session)
    if state['closing'] or state['completed']:
        role=''
        if stage=='exchange':role='考生是提问者，你是Camille，住在Lyon，是法语教师，喜欢阅读和游泳，有一个姐姐。最后一句仍是考生向你提问，就算转写没有问号，也请完整回答你自己的信息，不能改成评论考生的情况。'
        if stage=='roleplay':role=session['scene']['facts']+'考生是顾客。先完成必要的结算或找零、礼貌告别，再宣布本环节结束。'
        return base+role+'本环节已经达到本次练习的结束条件。先简短回应最新发言，然后明确说Merci, cette partie est terminée. 不再提新问题，不自行进入下一环节。由网页显示下一环节按钮。'
    if stage == 'intro':
        plan=next_question(session)
        return base + '你担任考官。一次只问一个问题，本次练习安排4至6轮有效回答。每次练习的主题和措辞已随机抽取，不固定从姓名或住址开始。已经问答的主题见intro_plan.covered。下一问题围绕：'+plan['question']+' 先回应考生实际说的内容，再自然过渡；可改写为同主题的A1短问句，不连问、不问复杂假设或辩论。若考生刚才已主动提供这个信息，追问该主题的一个简单细节。简短接话后必须问下一问题；考生要求重复时只重说上一个问题，不换题。'
    if stage == 'exchange':
        word = session['keywords'][session['keyword_index']]
        return (base + '这一部分考生主动向你提问，你不能替考生问。你是Camille，住在Lyon，是法语教师，喜欢阅读和游泳，有一个姐姐。'
                + f'共有6张词卡，当前是 {word}。考生是提问者，你是回答者；禁止反问Et vous或询问考生的家庭、爱好等。candidate_question为true时，即使转写结尾没有问号，也按向你的提问理解。' + ('如果最新发言是问题，直接简短回答，然后说Au mot suivant，网页会推进词卡。如果只是陈述，则提醒Ici, c’est vous qui posez les questions，不给示范问题、不自行换词。' if confirmed else '用法语简短邀请考生围绕当前词卡提问，然后等待。不要提供示范问题。'))
    return base + session['scene']['facts'] + ('考生是顾客，根据其最新确认的发言回应，不重新问候。' if confirmed else '考生是顾客，请先说一句符合角色的法语问候，然后等待。')


def trigger(session):
    """Short stage trigger, not a long-text transport or a chunked prompt."""
    prefix = '模拟' if session['mode'] == 'simulation' else '陪练'
    stage = current_stage(session)
    if any(m.get('stage')==stage and accepted_speech(m) for m in session['messages']):
        return '继续' + STAGES[stage]['name']
    if stage == 'roleplay':
        return prefix + '情景对话'
    return prefix + STAGES[stage]['name']


def task_context(session):
    return {'level': 'A1', 'mode': session['mode'], 'stage': current_stage(session),
            'instruction': instruction(session),
            'keyword': session['keywords'][session['keyword_index']],
            'keyword_cards':[{'index':i,'word':word,'done':i in session.get('exchange_done',[])} for i,word in enumerate(session['keywords'])],
            'progress':progress(session),'intro_plan':next_question(session),
            'candidate_question':question(next((m.get('confirmed_text') or m.get('text','') for m in reversed(session['messages']) if m.get('stage')==current_stage(session) and usable(m)),'')),
            'scene': session['scene'],
            'recent_dialogue': [{'role': m['role'], 'text': m.get('revisions',[{}])[-1].get('text') or m.get('confirmed_text') or m.get('text',''),
                                'learner_revision': m.get('revisions', [{}])[-1].get('text')}
                               for m in session['messages'][-48:] if (m.get('text') or m.get('confirmed_text')) and m.get('confirmation_status') not in ('pending','cancelled') and (m.get('recognition_status') not in ('pending','failed','empty','cancelled') or m.get('confirmation_status')=='confirmed')]}


def next_stage(session):
    if session['phase'] == 'preparation':
        session['events'].append({'type': 'preparation_end', 'at': time.time(),
                                  'early': time.time() < session['prep_until']})
        session['phase'] = 'active'
    elif session['phase'] == 'active' and session['stage_index'] + 1 < len(session['stages']):
        session['stage_index'] += 1
    else:
        raise ValueError('已经是最后一个环节，请结束并查看复盘')
    session['stage_started'] = time.time()
    return session
