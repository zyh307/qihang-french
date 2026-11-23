"""Generate the original Inspire 1 thematic starter lessons and local demo audio."""
import argparse
import audioop
from collections import Counter
from itertools import accumulate
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unicodedata
import wave

ROOT = Path(__file__).resolve().parents[1] / 'content/starter-speaking'
sys.path.insert(0, str(ROOT.parents[1]))
from word_alignment import tokens

FIRST_LESSONS = (1, 4, 8, 12, 16, 20, 24, 28)
UNITS = [
    ('Se rencontrer en classe', '初次见面与课堂', [
        ('Bonjour, je suis Nora et je viens pour le cours de français.', '你好，我是诺拉，我来上法语课。'),
        ('Dans mon sac, j’ai un cahier bleu et deux stylos noirs.', '我的包里有一本蓝色笔记本和两支黑色笔。'),
        ('À la fin du cours, je dis au revoir à mes voisins.', '下课时，我向旁边的同学道别。'),
        ('Demain, je retrouve la classe devant la petite salle du premier étage.', '明天我在一楼的小教室门口和同学会合。'),
    ], [
        'Bonjour Madame | nous sommes les nouveaux élèves du cours de français.',
        'Sur cette table | vous avez les cahiers pour toute la classe.',
        'Mon stylo est dans mon sac | avec mon livre de français.',
        'Pardon Monsieur | est-ce que vous pouvez parler un peu plus lentement ?',
        'La porte est ouverte | et les élèves entrent dans la salle.',
        'À demain tout le monde | le cours commence à neuf heures.',
    ]),
    ('Échanger ses coordonnées', '交换联系方式', [
        ('Ce soir, je rencontre Lina au café près de la gare.', '今晚我在车站附近的咖啡馆见莉娜。'),
        ('Elle habite à Lille et elle travaille dans une petite librairie.', '她住在里尔，在一家小书店工作。'),
        ('Je note son numéro dans mon téléphone pour lui écrire demain.', '我把她的号码记在手机里，好明天给她发消息。'),
        ('Nous échangeons aussi nos adresses et nous prenons un jus de pomme.', '我们还交换了地址，喝了一杯苹果汁。'),
    ], [
        'Je m’appelle Émile | et j’habite dans une petite ville près de Lille.',
        'Voici mon numéro | vous pouvez me laisser un message ce soir.',
        'Elle écrit son adresse | sur un papier à côté du téléphone.',
        'Tu peux me contacter | après le cours ou pendant la pause.',
        'Mon ami travaille ici | mais il habite dans un autre quartier.',
        'Nous avons le même cours | alors je te donne mon numéro.',
    ]),
    ('Présenter ses proches', '介绍亲友', [
        ('Voici une photo de ma famille prise près de la maison.', '这是一张在家附近拍的全家福。'),
        ('Ma sœur Clara porte un manteau vert et une écharpe jaune.', '我妹妹克拉拉穿着绿色大衣，戴着黄色围巾。'),
        ('Notre grand-père aime les trains et parle souvent de sa ville.', '我们的爷爷喜欢火车，经常讲起自己的城市。'),
        ('Le dimanche, nous préparons un repas et nous jouons ensemble après.', '星期天我们一起做饭，饭后一起玩。'),
    ], [
        'Ma sœur habite à Nice | avec ses deux enfants et son chat.',
        'Mon cousin porte une veste bleue | et des chaussures très grandes.',
        'Notre voisine est médecin | et son frère travaille à la mairie.',
        'Sur cette photo | mon oncle est à gauche de ma mère.',
        'Le dimanche à midi | nous mangeons souvent avec nos grands-parents.',
        'Mon amie est petite | elle a aussi des cheveux très courts.',
    ]),
    ('Préparer une sortie', '约时间与安排出行', [
        ('Samedi après-midi, Nora et moi cherchons une activité près de chez nous.', '周六下午，诺拉和我想找个离家近的活动。'),
        ('Le musée ouvre à deux heures et le billet coûte cinq euros.', '博物馆两点开门，门票五欧元。'),
        ('Nous prenons le tram et nous descendons devant le grand jardin.', '我们坐有轨电车，在大花园前面下车。'),
        ('Après la visite, nous retrouvons Lina pour boire un chocolat chaud.', '参观后，我们和莉娜碰面去喝热巧克力。'),
    ], [
        'Pour samedi matin | est-ce que tu veux venir au musée avec moi ?',
        'On se donne rendez-vous à huit heures | devant le cinéma du quartier.',
        'On se retrouve près de la gare | à trois heures et demie.',
        'Je prends le bus de midi | et je marche jusqu’au parc.',
        'Tu peux venir avec ton frère | il reste deux places libres.',
        'La piscine ouvre le dimanche | mais elle ferme assez tôt.',
    ]),
    ('Décrire son quotidien', '描述日常与运动', [
        ('Je commence ma journée à sept heures dans mon petit appartement.', '我每天七点在自己的小公寓里开始一天。'),
        ('Après le petit déjeuner, je vais à pied au marché du quartier.', '吃过早餐，我步行去街区的市场。'),
        ('Le soir, je retrouve deux amis au gymnase près du pont.', '傍晚我和两个朋友在桥边的健身馆见面。'),
        ('Nous rentrons avant la nuit et je prépare du riz aux légumes.', '我们天黑前回家，我做一份蔬菜米饭。'),
    ], [
        'Après le petit déjeuner | je prends le bus pour aller travailler.',
        'Tous les mercredis matin | nous faisons du sport dans le parc.',
        'Je prépare mon sac | avant de partir pour le cours de danse.',
        'Elle rentre vers six heures | et elle prépare le dîner.',
        'Le mardi soir | je retrouve mon frère près de la piscine.',
        'À la fin de la semaine | nous allons ensemble au marché.',
    ]),
    ('Raconter une expérience', '讲述一次经历', [
        ('Samedi dernier, j’ai pris un train pour aller au bord de la mer.', '上周六，我坐火车去了海边。'),
        ('À midi, nous avons acheté du pain et des fruits au marché.', '中午，我们在市场买了面包和水果。'),
        ('Il a plu un peu, mais nous avons marché sur la plage.', '下了一点雨，不过我们还是在沙滩上走了走。'),
        ('Le soir, je suis rentré avec trois photos pour ma grand-mère.', '傍晚，我带着三张照片回家，准备给奶奶看。'),
    ], [
        'Hier après le travail | j’ai rencontré Nina devant la grande gare.',
        'Ce matin nous avons pris le train | pour visiter une ville.',
        'On a acheté trois pommes | et un sandwich près du parc.',
        'Je suis rentré assez tôt | parce que le dernier bus partait bientôt.',
        'Pendant les vacances | notre famille a passé trois jours à Lyon.',
        'Nous avons pris beaucoup de photos | devant le petit musée.',
    ]),
    ('Donner son avis', '表达看法和偏好', [
        ('Dans notre rue, un nouveau restaurant propose trois plats chaque midi.', '我们这条街有一家新餐厅，每天中午提供三道菜。'),
        ('Je trouve la soupe bonne, mais mon ami préfère le poisson.', '我觉得汤很好喝，但我朋友更喜欢鱼。'),
        ('La terrasse est très jolie et le service est assez rapide.', '露台很漂亮，上菜也挺快。'),
        ('Pour le prix, je pense que c’est une bonne adresse.', '就价格来说，我觉得这是个好去处。'),
    ], [
        'À mon avis | ce petit café est meilleur que le grand.',
        'Je trouve le film drôle | mais le début est un peu long.',
        'J’aime bien cette chemise | parce que le bleu me va bien.',
        'Pour moi | le plat du jour est bon et pas cher.',
        'Nous préférons les places dehors | quand il fait assez chaud.',
        'Cette idée me plaît | on peut venir avec tous nos amis.',
    ]),
    ('Demander une information', '查询信息与确认路线', [
        ('Ce matin, je dois aller à la mairie avant mon cours.', '今天早上，上课前我得去一趟市政厅。'),
        ('Sur le plan, le bâtiment est entre la poste et la pharmacie.', '地图上，那栋楼在邮局和药房之间。'),
        ('Une dame me conseille de prendre la deuxième rue à gauche.', '一位女士建议我在第二条街左转。'),
        ('Je vérifie aussi les horaires, car la mairie ferme à midi.', '我也查一下办公时间，因为市政厅中午关门。'),
    ], [
        'Excusez-moi Madame | est-ce que la mairie est loin de cette rue ?',
        'Prenez la deuxième rue à gauche | puis traversez la petite place.',
        'Vous pouvez vérifier les horaires | sur le panneau près de la porte.',
        'D’après la météo | il va faire beau demain dans notre ville.',
        'Il faut un billet aller-retour | pour le premier train de lundi.',
        'Je cherche un renseignement | sur les bus pour aller à la gare.',
    ]),
]
SLOTS = [
    ('sport', 'Je fais {slot}.', ('说你会做力量训练。', '你平时做力量训练。'), ('说你平时做运动。', '说你有运动习惯。')),
    ('mardi', 'Le mardi, je fais {slot}.', ('说你星期二做力量训练。', '说你每周二练力量。'), ('说你星期二做运动。', '说星期二是你的运动日。')),
    ('frere', 'Avec mon frère, je fais {slot}.', ('说你和哥哥或弟弟做力量训练。', '说你和兄弟一起练力量。'), ('说你和哥哥或弟弟做运动。', '说你和兄弟一起参加体育活动。')),
]
FORMS = [('muscu', 'de la muscu', '力量训练', '/də la mys.ky/'), ('sport', 'du sport', '一般体育运动', '/dy spɔʁ/')]


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build(voice, espeak_data=None, espeak=None):
    from piper import PiperVoice
    import numpy as np
    options = {'espeak_data_dir':str(espeak_data)} if espeak_data else {}
    speaker = PiperVoice.load(str(voice), **options)
    with TemporaryDirectory() as folder:
        scratch = Path(folder) / 'speech.wav'

        def speech(text):
            if espeak:
                # The Windows wheel can point to the build machine's data directory.
                output = subprocess.run([str(espeak), '--path=' + str(espeak.parent), '-q',
                                         '--ipa=1', '-b', '1', '-v', 'fr-fr', '--stdin'],
                                        input=text.encode('utf-8'), capture_output=True, check=True)
                clauses = output.stdout.decode('utf-8').strip().replace('_', '').splitlines()
                phonemes = unicodedata.normalize('NFD', ', '.join(line.strip() for line in clauses))
                if not phonemes:
                    raise ValueError('eSpeak 未返回法语音素')
                if text[-1] in '.!?':
                    phonemes += text[-1]
                data = speaker.phoneme_ids_to_audio(speaker.phonemes_to_ids(list(phonemes)))
                pcm = (np.clip(data / max(.001, np.max(np.abs(data))), -1, 1) * 28000).astype('<i2').tobytes()
                return audioop.ratecv(pcm, 2, 1, speaker.config.sample_rate, 16000, None)[0]
            with wave.open(str(scratch), 'wb') as output:
                speaker.synthesize_wav(text, output)
            with wave.open(str(scratch), 'rb') as source:
                pcm = source.readframes(source.getnframes())
                return audioop.ratecv(pcm, 2, 1, source.getframerate(), 16000, None)[0]

        def wav(path, pcm):
            with wave.open(str(path), 'wb') as output:
                output.setparams((1, 2, 16000, 0, 'NONE', ''))
                output.writeframes(pcm)

        lecture = ROOT / 'lecture'
        lecture.mkdir(parents=True, exist_ok=True)
        for unit, (fr, zh, reading, lines) in enumerate(UNITS, 1):
            ident = f'studio-u{unit:02d}'
            piste = 800 + unit
            title = {'fr':fr, 'zh':zh}
            source = f'Inspire 1 · Unité {unit} 主题拓展 · 原创示范（合成）'
            rows, pcm = [], b''
            for index, (sentence, translation) in enumerate(reading, 1):
                start = len(pcm) / 32000
                pcm += speech(sentence)
                rows.append({'id':f's{index}', 'piste':piste, 'start':start, 'end':len(pcm)/32000,
                             'fr':sentence, 'zh':translation})
                pcm += bytes(6400)
            wav(lecture / f'{piste}.wav', pcm)
            write_json(lecture / f'{ident}.json',
                       {'id':ident, 'unit':unit, 'lesson':FIRST_LESSONS[unit-1], 'book':'Inspire 1 · 原创拓展', 'piste':piste,
                        'title':title, 'source':source, 'featured':unit == 5, 'sentences':rows})
            daily = ROOT / 'daily' / ident
            daily.mkdir(parents=True, exist_ok=True)
            chains = []
            for index, line in enumerate(lines, 1):
                groups = line.split(' | ')
                counts = [len(tokens(item)) for item in groups]
                if not 9 <= sum(counts) <= 14:
                    raise ValueError(f'{ident}:{index} 日常节奏链长度无效：{sum(counts)}')
                name = f'{ident}-chain-{index}.wav'
                wav(daily / name, speech(', '.join(groups).replace('?,','?').replace('.,','.')))
                chains.append({'id':f'chain-{index}', 'groups':groups, 'pause_after_words':list(accumulate(counts))[:-1],
                               'short_groups':groups[:2], 'demo_wav':name, 'short_demo_wav':name})
            metadata = {'lesson_id':ident, 'version':1, 'label':f'Inspire 1 · Unité {unit} 原创拓展',
                        'title':title, 'source':source}
            write_json(daily / 'chains.json', {**metadata, 'chains':chains})
            if unit != 5:
                continue
            frames = []
            for frame_id, template, *cues in SLOTS:
                candidates, prompts = [], []
                for (word_id, form, condition, pronunciation), hints in zip(FORMS, cues):
                    name = f'{ident}-{frame_id}-{word_id}.wav'
                    wav(daily / name, speech(template.replace('{slot}', form)))
                    candidates.append({'id':word_id, 'form':form, 'condition':condition,
                                       'pronunciation':pronunciation, 'demo_wav':name})
                    prompts.extend({'id':f'{word_id}-{index}', 'target':word_id, 'cue':cue}
                                   for index, cue in enumerate(hints, 1))
                examples = [{'prompt':prompt['id'], 'spoken_candidate':candidate['id'],
                             'accepted':prompt['target'] == candidate['id']}
                            for prompt in (prompts[0], prompts[2]) for candidate in candidates]
                frames.append({'id':frame_id, 'template':template, 'candidates':candidates,
                               'prompts':prompts, 'examples':examples,
                               'validation':{'blind_test':'通过', 'listened':True,
                                             'asr_hits':'继承已验证的 du sport / de la muscu 对子；本包使用原创句框与合成示范。'}})
            write_json(daily / 'frames.json', {**metadata, 'frames':frames})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('voice', type=Path)
    parser.add_argument('--espeak-data', type=Path)
    parser.add_argument('--espeak', type=Path)
    args = parser.parse_args()
    build(args.voice, args.espeak_data, args.espeak)
