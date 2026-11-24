"""Extract the -ir verbs already present in the app from Verbiste 0.1.49."""
from collections import Counter
from hashlib import sha256
from pathlib import Path
import io
import json
import re
import sys
import tarfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = 'verbiste-0.1.49'
SOURCE_SHA256 = '4a756133c0eba27b1a8e236dae53ae17325605ba486fe6cb2eb2be9966683fa5'
PERSONS = ('je', 'tu', 'il', 'nous', 'vous', 'ils')
AVOIR = ('ai', 'as', 'a', 'avons', 'avez', 'ont')
ETRE = ('suis', 'es', 'est', 'sommes', 'êtes', 'sont')
REFLEXIVE = ('me', 'te', 'se', 'nous', 'vous', 'se')
# Intransitive uses retained in the lesson convention. Other additions use avoir.
WITH_ETRE = {'advenir', 'intervenir', 'parvenir', 'provenir', 'repartir', 'ressortir', 'survenir'}
REFLEXIVE_ONLY = {'abstenir', 'enfuir', 'entresouvenir', 'évanouir', 'repentir', 'souvenir'}
TEMPLATE_OVERRIDES = {'raidir': 'fin:ir', 'faillir': 'fin:ir'}
VERB = re.compile(r"(?:se |s')?([^\W\d_]+[iï]r)$", re.UNICODE)

def normalized(value):
    return unicodedata.normalize('NFC', value).replace('’', "'").strip().lower()

def with_reflexive(form, index):
    pronoun = REFLEXIVE[index]
    if pronoun in ('me', 'te', 'se') and form[0] in 'aàâeéèêëiîïoôuùûüœy':
        return pronoun[0] + "'" + form
    return pronoun + ' ' + form

def eligible():
    dictionary = json.loads((ROOT / 'src/static/lexicon/french.json').read_text(encoding='utf-8'))
    candidates = {normalized(row['word']) for row in dictionary['entries'] if row['pos'].startswith('v.')}
    for book in ('inspire1', 'inspire2', 'inspire3', 'inspire4', 'fos1'):
        with zipfile.ZipFile(ROOT / f'src/static/content/{book}.zip') as archive:
            lessons = json.loads(archive.read('manifest.json'))['library']
        for lesson in lessons:
            for word in lesson['words']:
                if word['pos'].startswith('v.'):
                    candidates.update(normalized(f['text']) for f in word['forms'])
    return {word for word in candidates if VERB.fullmatch(word) and not word.endswith('oir')}

def read_tables(archive):
    raw = archive.read_bytes()
    if sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError('Unexpected Verbiste source archive')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as source:
        def xml(filename):
            return ET.fromstring(source.extractfile(f'{RELEASE}/data/{filename}').read())
        verbs = {normalized(node.findtext('i')): node.findtext('t') for node in xml('verbs-fr.xml')}
        templates = {node.attrib['name']: node for node in xml('conjugation-fr.xml')}
    return verbs, templates

def forms(stem, template, path):
    return [stem + (person.findtext('i') or '') if person.find('i') is not None else '—'
            for person in template.findall(path)]

def paradigm(word, template_name, templates):
    bare = VERB.fullmatch(word)[1]
    reflexive = word != bare
    if bare in REFLEXIVE_ONLY and not reflexive:
        return None
    suffix = template_name.split(':', maxsplit=1)[1]
    if not bare.endswith(suffix):
        raise ValueError(f'Template {template_name} does not match {word}')
    stem = bare[:-len(suffix)] if suffix else bare
    template = templates[template_name]
    present = forms(stem, template, 'indicative/present/p')
    imperfect = forms(stem, template, 'indicative/imperfect/p')
    participles = forms(stem, template, 'participle/past-participle/p')
    if len(present) != 6 or len(imperfect) != 6 or not participles:
        return None
    past = []
    use_etre = reflexive or bare in WITH_ETRE
    auxiliary = ETRE if use_etre else AVOIR
    for index, verb in enumerate(auxiliary):
        plural = participles[1] if len(participles) > 1 else participles[0] + 's'
        participle = plural if use_etre and index >= 3 else participles[0]
        past.append(verb + ' ' + participle)
        if reflexive:
            present[index] = with_reflexive(present[index], index) if present[index] != '—' else '—'
            imperfect[index] = with_reflexive(imperfect[index], index) if imperfect[index] != '—' else '—'
            past[index] = with_reflexive(past[index], index)
        persons_unavailable = (bare == 'advenir' and index not in (2, 5)) or (word == "s'agir" and index != 2)
        if present[index] == '—' or persons_unavailable:
            present[index] = imperfect[index] = past[index] = '—'
    return {name: dict(zip(PERSONS, values)) for name, values in (
        ('现在时', present), ('复合过去时', past), ('未完成过去时', imperfect))}

def main():
    verbs, templates = read_tables(Path(sys.argv[1]))
    original = json.loads((ROOT / 'src/conjugation/source-catalog.json').read_text(encoding='utf-8'))
    result = {}
    skipped = []
    models = Counter()
    for word in sorted(eligible() - original.keys()):
        bare = VERB.fullmatch(word)[1]
        model = TEMPLATE_OVERRIDES.get(bare) or verbs.get(bare)
        tenses = paradigm(word, model, templates) if model else None
        if tenses:
            result[word] = tenses
            models[model] += 1
        else:
            skipped.append(word)
    assert result['finir']['现在时'] == dict(zip(PERSONS, ('finis','finis','finit','finissons','finissez','finissent')))
    target = ROOT / 'src/conjugation/ir-catalog.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'lemmas':len(result), 'models':models, 'skipped':skipped}, ensure_ascii=False))

if __name__ == '__main__':
    main()
