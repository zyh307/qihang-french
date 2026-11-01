"""Local A1 pacing and card state. These are practice limits, not official scores."""
import re
import time
import unicodedata
from question_bank import INTRO

BUDGETS={'intro':90,'exchange':120,'roleplay':120}
TOPICS=[
 ('identity','Comment vous appelez-vous ?',r'appell|pr[ée]nom|pr[ée]sent|nom\b'),
 ('home','Où habitez-vous ?',r'habit|ville|venez|viv|logement'),
 ('study','Qu’est-ce que vous étudiez ou quel est votre travail ?',r'[ée]tudi|[ée]cole|universit|travail|profession'),
 ('family','Pouvez-vous me parler de votre famille ?',r'famille|fr[èe]re|s[œo]ur|soeur|parent|m[èe]re|p[èe]re'),
 ('leisure','Qu’aimez-vous faire pendant votre temps libre ?',r'aime|loisir|libre|week.end|sport'),
 ('routine','Que faites-vous le matin ?',r'matin|journ[ée]e|levez|petit.d[ée]jeuner'),
]


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.casefold()) if not unicodedata.combining(c))


def clarification(text):
    return bool(re.search(r'repet|plus lent|ne comprends? pas|pas compris|encore une fois|pardon|repeat',normalized(text)))


def usable(row):
    return row.get('role')=='user' and bool(row.get('confirmed_text') or row.get('text','').strip()) and row.get('confirmation_status') not in ('pending','cancelled') and (row.get('recognition_status') not in ('pending','failed','empty','cancelled') or row.get('confirmation_status')=='confirmed')


def question(text):
    text=normalized(text).strip()
    return not clarification(text) and (text.endswith('?') or bool(re.match(r"(qu|quel|comment|combien|pourquoi|ou\b|d'ou|est.ce|avez|etes|aimez|faites|vous\b|tu\b|ton\b|votre\b)",text)))


def rows(session):
    stage=session['stages'][session['stage_index']]
    return [m for m in session['messages'] if m.get('stage')==stage and usable(m) and not clarification(m.get('confirmed_text') or m.get('text',''))]


def progress(session,now=None):
    stage=session['stages'][session['stage_index']];answers=rows(session)
    elapsed=max(0,int((time.time() if now is None else now)-(session.get('stage_started') or time.time())))
    done=set(session.get('exchange_done',[]));pending=next((m for m in reversed(answers) if not m.get('reply_delivered')),None)
    if stage=='exchange' and pending and question(pending.get('confirmed_text') or pending.get('text','')):
        done.add(pending.get('card_index',session['keyword_index']))
    reason=''
    if session.get('flow_version'):
        if stage=='intro' and (len(answers)>=6 or elapsed>=BUDGETS[stage] and len(answers)>=4):reason='已完成本次引导问答'
        if stage=='exchange' and len(done)>=len(session['keywords']):reason='六张词卡已逐一交流'
        if stage=='roleplay' and (len(answers)>=8 or elapsed>=BUDGETS[stage] and len(answers)>=3 or len(answers)>=2 and re.search(r'au revoir|bonne journee|a bientot',normalized(answers[-1].get('confirmed_text') or answers[-1].get('text','')))):reason='本次情景交流已收尾'
    completed=session.get('stage_completion',{}).get(stage)
    return {'stage':stage,'answers':len(answers),'target_seconds':BUDGETS[stage],'elapsed':elapsed,
            'closing':bool(reason),'reason':reason,'completed':bool(completed),
            'cards_done':sorted(session.get('exchange_done',[])),'total_cards':len(session['keywords'])}


def next_question(session):
    topics = [(key, qs[0], pattern) for key, pattern, qs in INTRO] if session.get('intro_questions') else TOPICS
    covered=set();prior=[]
    for m in session['messages']:
        if m.get('stage')!='intro':continue
        if m['role']=='assistant':prior.append(m.get('text',''))
        elif usable(m):
            text=m.get('confirmed_text') or m.get('text','')
            if not clarification(text):
                actual=re.sub(r'\W','',normalized(' '.join(prior)))
                for q in session.get('intro_questions',[]):
                    if re.sub(r'\W','',normalized(q['question'])) in actual:covered.add(q['topic'])
                for key,_,pattern in topics:
                    if re.search(pattern,normalized(' '.join(prior)),re.I) or re.search(pattern,normalized(text),re.I):covered.add(key)
            prior=[]
    plan = [(q['topic'],q['question'],'') for q in session['intro_questions']] if session.get('intro_questions') else TOPICS
    for key,text,_ in plan:
        if key not in covered:return {'topic':key,'question':text,'covered':sorted(covered)}
    return {'topic':'detail','question':'Pouvez-vous me donner un exemple de votre activité préférée ?','covered':sorted(covered)}


def finish_reply(session,row_id,closing):
    stage=session['stages'][session['stage_index']]
    row=next((m for m in session['messages'] if m.get('id')==row_id),None)
    if row and usable(row) and not row.get('reply_delivered'):
        row['reply_delivered']=True
        if stage=='exchange' and question(row.get('confirmed_text') or row.get('text','')):
            done=session.setdefault('exchange_done',[]);index=row.get('card_index',session['keyword_index'])
            if index not in done:done.append(index)
            remaining=[i for i in range(len(session['keywords'])) if i not in done]
            if remaining:session['keyword_index']=remaining[0]
    if closing and session.get('flow_version'):
        session.setdefault('stage_completion',{})[stage]={'at':time.time(),'reason':progress(session)['reason'] or '本环节已完成'}
