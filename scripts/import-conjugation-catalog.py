"""Refresh conjugations strictly from the original 法语变位器3.0 word lists."""
from pathlib import Path
import argparse
import hashlib
import json

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=root.parents[2] / '法语变位器3.0/src/generated/wordlists.json')
args = parser.parse_args()
raw = args.source.read_bytes()
wordlists = json.loads(raw)
result = {}
for group in wordlists.values():
    for tense, verbs in group.items():
        if tense not in ['现在时', '复合过去时', '未完成过去时']:
            continue
        for lemma, forms in verbs.items():
            previous = result.setdefault(lemma, {}).get(tense)
            if previous is not None and previous != forms:
                raise ValueError(f'Conflicting source forms: {lemma} / {tense}')
            result[lemma][tense] = forms
if not result:
    raise ValueError('No conjugations in the source')
# Keep the existing correction to the source app's spelling typo.
if result.get('prendre', {}).get('现在时', {}).get('vous') == 'prennez':
    result['prendre']['现在时']['vous'] = 'prenez'
target = root / 'src/conjugation/source-catalog.json'
if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != result:
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
metadata = {'source': '法语变位器3.0', 'sourceFile': 'src/generated/wordlists.json', 'sourceLicense': 'MIT', 'verbs': len(result), 'sourceSHA256': hashlib.sha256(raw).hexdigest(), 'tenses': ['现在时', '复合过去时', '未完成过去时'], 'corrections': [{'lemma': 'prendre', 'tense': '现在时', 'person': 'vous', 'from': 'prennez', 'to': 'prenez'}]}
(root / 'src/conjugation/sources.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Original conjugation catalog: {len(result)} verbs.')
