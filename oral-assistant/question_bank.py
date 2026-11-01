"""Versioned original A1 practice material, informed by FEI public demo tasks.

No claim to reproduce a complete/live examination bank. Session cards are snapshots.
"""
import random

VERSION = '20261031-a1-bank-1'
SOURCES = [
    {'title': 'FEI · DELF A1 tout public 公开口试样题', 'url': 'https://www.france-education-international.fr/document/delf-dalf-a1-tp-examinateur-sujet-demo0'},
    {'title': 'FEI · A1 口语评价标准', 'url': 'https://www.france-education-international.fr/document/grille-po-a1'},
    {'title': 'FEI · A1 / Pré-A1 能力描述', 'url': 'https://www.france-education-international.fr/document/cecrldescripteursa1pre-a1'},
]

# One of three phrasings per topic; different topics and order for each session.
INTRO = [
 ('identity', r'appell|prenom|nom\b|presente', ['Comment vous appelez-vous ?', 'Pouvez-vous vous présenter simplement ?', 'Quel est votre prénom ?']),
 ('home', r'habit|ville|venez|viv|logement|maison|appartement', ['Où habitez-vous maintenant ?', 'Comment est votre logement ?', 'Qu’aimez-vous dans votre ville ?']),
 ('study', r'etudi|ecole|universit|travail|profession|metier', ['Qu’est-ce que vous étudiez ou quel est votre travail ?', 'Où étudiez-vous ou travaillez-vous ?', 'Vous aimez vos études ou votre travail ?']),
 ('family', r'famille|frere|sœur|soeur|parent|mere|pere|enfant', ['Avec qui habitez-vous ?', 'Pouvez-vous parler un peu de votre famille ?', 'Vous avez des frères et sœurs ?']),
 ('leisure', r'loisir|libre|lire|lecture|musique|film|cinema', ['Que faites-vous pendant votre temps libre ?', 'Vous préférez lire ou regarder des films ?', 'Quelle musique aimez-vous ?']),
 ('routine', r'matin|journee|levez|leve|dejeuner|soir|heure', ['À quelle heure vous levez-vous ?', 'Qu’est-ce que vous faites le soir ?', 'Pouvez-vous décrire une journée habituelle ?']),
 ('origin', r'nationalit|origine|pays|venez', ['De quel pays venez-vous ?', 'Quelle est votre nationalité ?', 'Quelle est votre ville d’origine ?']),
 ('languages', r'langue|appren|apprend|parlez|parle|francais', ['Quelles langues parlez-vous ?', 'Où apprenez-vous le français ?', 'Avec qui pratiquez-vous le français ?']),
 ('food', r'mang|cuisin|plat|aliment|restaurant|repas', ['Quel est votre plat préféré ?', 'Vous aimez cuisiner ?', 'Vous mangez souvent au restaurant ?']),
 ('sport', r'sport|nager|natation|velo|football|marche', ['Vous faites du sport ?', 'Quel sport aimez-vous regarder ?', 'Avec qui faites-vous du sport ?']),
 ('weekend', r'week.end|samedi|dimanche', ['Que faites-vous le dimanche ?', 'Vous sortez souvent le week-end ?', 'Avec qui passez-vous le week-end ?']),
 ('holidays', r'vacance|voyag|mer|montagne', ['Où aimez-vous passer vos vacances ?', 'Vous préférez la mer ou la montagne ?', 'Avec qui partez-vous en vacances ?']),
 ('transport', r'transport|bus|train|pied|voiture', ['Comment allez-vous à l’école ou au travail ?', 'Vous prenez souvent le bus ?', 'Vous préférez marcher ou prendre le vélo ?']),
 ('friends', r'\bamis?\b|\bamies?\b|copain|copine', ['Que faites-vous avec vos amis ?', 'Où retrouvez-vous vos amis ?', 'Pouvez-vous parler d’un ami ?']),
]

WORD_GROUPS = {
 'identité': ['prénom', 'nationalité', 'date de naissance', 'âge', 'nom', 'anniversaire'],
 'famille': ['famille', 'frères et sœurs', 'parents', 'enfants', 'amis', 'animaux'],
 'logement': ['adresse', 'appartement', 'maison', 'ville', 'quartier'],
 'études et travail': ['travail', 'bureau', 'secrétaire', 'école', 'études', 'ordinateur'],
 'loisirs': ['danser', 'livre', 'sortir', 'musique', 'cinéma', 'sport', 'loisirs'],
 'vie quotidienne': ['heure', 'téléphone', 'stylo', 'restaurant', 'repas', 'week-end', 'petit déjeuner'],
 'déplacements': ['voiture', 'train', 'vacances', 'vélo', 'bus'],
 'lieux et langues': ['bibliothèque', 'parc', 'piscine', 'banque', 'langue', 'magasin'],
}
KEYWORDS = [w for words in WORD_GROUPS.values() for w in words]


def draw_keywords():
    # Six topics rather than six synonyms for the same thing.
    return [random.choice(WORD_GROUPS[group]) for group in random.sample(list(WORD_GROUPS), 6)]


def draw_intro():
    return [{'topic': key, 'question': random.choice(questions)}
            for key, _, questions in random.sample(INTRO, len(INTRO))]


def scene(sid, title, fr, task, items, facts, checks):
    return {'id': sid, 'title': title, 'fr': fr, 'task': task,
            'materials': [{'name': n, 'price': p} for n, p in items],
            'facts': facts + ' 考生是顾客或服务使用者；按题卡计算费用和找零，不更改价格。',
            'checks': checks, 'source': SOURCES[0]['url'], 'material_type': '原创练习题卡'}


EXTRA_SCENES = [
 scene('clothes', '在服装店购物', 'Au magasin de vêtements', '给自己或家人选购衣服，询问尺码、颜色和价格，选择并付款。',
       [('Un tee-shirt / S, M, L', '12,00 €'), ('Un pantalon / 36–44', '25,00 €'), ('Une veste / S, M, L', '38,00 €')],
       '你是服装店店员。T恤12欧、裤子25欧、外套38欧，均有蓝色和黑色，题卡尺码都有货。', ['打招呼', '说明商品和尺码', '询问颜色或价格', '选择并付款']),
 scene('market', '在市场买水果蔬菜', 'Au marché', '买水果或蔬菜，问每公斤价格，说明重量，结账并告别。',
       [('Pommes / kg', '2,50 €'), ('Tomates / kg', '3,00 €'), ('Carottes / kg', '1,80 €')],
       '你是市场摊主。苹果每公斤2.50欧、番茄每公斤3欧、胡萝卜每公斤1.80欧，可买半公斤。', ['询问单价', '说明品种和重量', '确认总价', '付款告别']),
 scene('holiday_club', '在度假俱乐部订活动', 'Au club de vacances', '询问活动、时间和价格，预订一项活动并付款。',
       [('Location de vélo / jour · 9 h–18 h', '15,00 €'), ('Tennis / heure · 10 h–17 h', '8,00 €'), ('Piscine / entrée · 9 h–19 h', '5,00 €')],
       '你是度假俱乐部接待员。自行车每天15欧（9至18点），网球每小时8欧（10至17点），泳池每次5欧（9至19点）。均可预订。', ['询问活动', '确认日期和时段', '询问价格', '预订付款']),
 scene('theatre', '买演出票', 'Au théâtre', '询问节目、开演时间和票价，选择演出并购买指定张数的票。',
       [('Concert · vendredi 20 h', '18,00 €'), ('Comédie · samedi 19 h', '15,00 €'), ('Danse · dimanche 16 h', '12,00 €')],
       '你是剧院售票员。周五20点音乐会每张18欧，周六19点喜剧15欧，周日16点舞蹈12欧。都有余票。', ['询问演出和时间', '选择演出', '说明票数', '确认总价并付款']),
 scene('station', '在车站买火车票', 'À la gare', '询问目的地、出发时间和票价，买一张或多张单程票。',
       [('Paris → Lyon · 10 h', '35,00 €'), ('Paris → Bordeaux · 11 h 30', '45,00 €'), ('Paris → Lille · 14 h', '25,00 €')],
       '你是车站售票员。每天从巴黎出发，10点去里昂单程35欧，11点30去波尔多45欧，14点去里尔25欧，均有票。', ['说明目的地和日期', '询问时间', '确认张数和票价', '付款告别']),
 scene('office_shop', '购买办公用品', 'Au magasin de fournitures', '为办公桌选购文具，询问商品和价格，说明数量并付款。',
       [('Un cahier', '2,00 €'), ('Un stylo', '1,50 €'), ('Une lampe de bureau', '20,00 €')],
       '你是文具店店员。笔记本每本2欧，笔每支1.50欧，台灯每盏20欧，都有货，笔有蓝色和黑色。', ['说明需要的商品', '询问商品信息', '说明数量', '结算付款']),
 scene('school', '为孩子咨询课程', 'À l’école', '为孩子询问课程、上课时间和费用，选择一门课程，提供姓名并报名付款。',
       [('Dessin · mercredi 14 h–15 h / mois', '25,00 €'), ('Musique · samedi 10 h–11 h / mois', '30,00 €'), ('Sport · samedi 15 h–16 h / mois', '20,00 €')],
       '你是学校接待员。绘画课周三14至15点每月25欧，音乐课周六10至11点30欧，体育课周六15至16点20欧，均有名额。报名需要孩子姓名和年龄。', ['说明报名需求', '询问课程和时间', '确认费用', '提供信息并报名']),
 scene('bookshop', '在书店买书', 'À la librairie', '说出想看的主题，询问书籍和价格，选一本或几本书并结账。',
       [('Découvrir la France', '12,00 €'), ('La cuisine facile', '10,00 €'), ('Les animaux', '8,00 €')],
       '你是书店店员。法国旅行书12欧，简单烹饪书10欧，动物书8欧，都是法语书且有货。', ['说明阅读主题', '询问书籍信息', '选择书籍和数量', '付款告别']),
 scene('restaurant', '在餐厅点餐', 'Au restaurant', '询问菜单，点一道菜和饮料，最后要账单并付款。',
       [('Une salade', '7,00 €'), ('Un poulet avec du riz', '12,00 €'), ('Une eau minérale', '2,00 €')],
       '你是餐厅服务员。沙拉7欧，鸡肉配米饭12欧，矿泉水2欧，白水免费，无其他收费。', ['问候并点菜', '询问菜品或价格', '点饮料', '要账单并付款']),
]
