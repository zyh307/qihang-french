"""Append previously uncovered French headwords with aligned Chinese examples."""
import argparse
import bz2
import gzip
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".lexicon-work"
OUTPUT = ROOT / "src/static/lexicon"
sys.path.insert(0, str(WORK / "python"))
from opencc import OpenCC
from wordfreq import zipf_frequency

POS = {"noun": "n.", "verb": "v.", "adj": "adj.", "adv": "adv.", "prep": "prép.",
       "prep_phrase": "loc.", "phrase": "loc.", "pron": "pron.", "article": "art.",
       "det": "art.", "conj": "conj.", "intj": "interj.", "num": "num."}
SENSE_TAGS = {"obsolete", "archaic", "misspelling", "nonstandard", "alternative", "form-of"}
CHINESE = re.compile(r"[\u3400-\u9fff]")
TOKEN = re.compile(r"[a-zà-öø-ÿœæ]+(?:[-'][a-zà-öø-ÿœæ]+)*")
HEADWORD = re.compile(r"[a-zàâäæçéèêëîïôöœùûüÿ][a-zàâäæçéèêëîïôöœùûüÿ' -]{1,58}")
convert = OpenCC("t2s").convert


def spelling(text):
    return unicodedata.normalize("NFC", text.strip().lower().replace("’", "'"))


def contains_word(sentence, word):
    return bool(re.search(r"(?<![a-zà-öø-ÿœæ])" + re.escape(word) + r"(?![a-zà-öø-ÿœæ])", spelling(sentence)))


def senses(row):
    return [sense for sense in row.get("senses", [])
            if sense.get("glosses") and not sense.get("form_of") and not SENSE_TAGS.intersection(sense.get("tags", []))]


def ipa(row):
    return next((sound["ipa"].replace("\\", "/") for sound in row.get("sounds", []) if sound.get("ipa")), "")


def chinese_headwords(existing):
    candidates = defaultdict(dict)
    for name in ("zh-simp.jsonl", "zh-trad.jsonl"):
        with (WORK / name).open(encoding="utf-8") as stream:
            for line in stream:
                row = json.loads(line)
                word, pos = spelling(row.get("word", "")), POS.get(row.get("pos"))
                if row.get("lang_code") != "fr" or not pos or word in existing or not HEADWORD.fullmatch(word):
                    continue
                for sense in senses(row):
                    for raw in sense["glosses"]:
                        gloss = convert(raw).strip().strip("。")
                        if not CHINESE.search(gloss) or not 1 <= len(gloss) <= 85 or any(ch in gloss for ch in ("Template:", "{{", "[[", "\n")):
                            continue
                        if re.match(r"^(?:见|同|为|參見|参见).{0,10}(?:的复数|的阴性|的阳性|拼写|变位)", gloss):
                            continue
                        record = candidates[(word, pos)].setdefault(gloss, {})
                        record.update({"ipa": record.get("ipa") or ipa(row), "source": row["word"]})
                        for item in sense.get("examples", []):
                            fr, zh = item.get("text", "").strip(), item.get("translation", "").strip()
                            if 10 <= len(fr) <= 150 and CHINESE.search(zh) and contains_word(fr, word):
                                record["example"] = {"fr": fr, "zh": convert(zh), "source": "Wiktionnaire · 汉语版",
                                                     "url": "https://zh.wiktionary.org/wiki/" + quote(row["word"])}
                                if item.get("ref"):
                                    record["example"]["source"] += " · " + item["ref"]
                                break
    return candidates


def verify_french(candidates):
    names = {word for word, _ in candidates}
    first_field = re.compile(r'^\{"word"\s*:\s*("(?:[^"\\]|\\.)*")')
    verified = {}
    with gzip.open(WORK / "fr-fr.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            match = first_field.match(line)
            if match and spelling(json.loads(match[1])) not in names:
                continue
            row = json.loads(line)
            identity = (spelling(row.get("word", "")), POS.get(row.get("pos")))
            if identity not in candidates or row.get("lang_code") != "fr" or not senses(row):
                continue
            tags = set(row.get("tags", []))
            gender = "m" if "masculine" in tags else "f" if "feminine" in tags else None
            if identity[1] == "n." and not gender:
                continue
            verified[identity] = {"gender": gender, "ipa": ipa(row), "word": row["word"],
                                  "plural": "plural-only" in tags or "plural" in tags}
    return verified


def add_paired_examples(candidates):
    translations = {}
    with bz2.open(WORK / "cmn_sentences.tsv.bz2", "rt", encoding="utf-8") as stream:
        for line in stream:
            number, _, sentence = line.rstrip().split("\t", 2)
            translations[number] = convert(sentence)
    linked = defaultdict(list)
    with bz2.open(WORK / "fra-cmn_links.tsv.bz2", "rt", encoding="utf-8") as stream:
        for line in stream:
            source, target = line.split()
            if target in translations:
                linked[source].append(translations[target])
    by_token = defaultdict(list)
    for (word, pos), definitions in candidates.items():
        for meaning, record in definitions.items():
            # Require a distinctive Chinese expression in the translation.
            anchors = re.findall(r"[\u3400-\u9fff]{2,10}", re.sub(r"（[^）]*）|\([^)]*\)|［[^］]*］", "", meaning))
            if anchors and not record.get("example"):
                by_token[word.split()[0]].append((word, anchors, record))
    with bz2.open(WORK / "fra_sentences_detailed.tsv.bz2", "rt", encoding="utf-8") as stream:
        for line in stream:
            parts = line.rstrip().split("\t")
            if len(parts) < 4 or parts[0] not in linked or not (parts[3] and parts[3] != r"\N"):
                continue
            number, _, fr, author = parts[:4]
            if not 12 <= len(fr) <= 135:
                continue
            tokens = set(TOKEN.findall(spelling(fr))) | set(spelling(fr).replace("'", " ").split())
            for token in tokens:
                for word, anchors, record in by_token.get(token, []):
                    if record.get("example") or not contains_word(fr, word):
                        continue
                    zh = next((text for text in linked[number] if any(anchor in text for anchor in anchors)), None)
                    if zh:
                        record["example"] = {"fr": fr, "zh": zh, "source": f"Tatoeba #{number} · {author} · CC BY 2.0",
                                             "url": f"https://tatoeba.org/en/sentences/show/{number}"}


def prepare(dictionary):
    existing = {spelling(value) for row in dictionary["entries"] for value in [row["word"], *row.get("aliases", [])]}
    existing.update(json.loads((ROOT / "src/lexicon/excluded-words.json").read_text(encoding="utf-8")))
    candidates = chinese_headwords(existing)
    verified = verify_french(candidates)
    add_paired_examples({identity: candidates[identity] for identity in verified})
    rows = []
    for identity, french in verified.items():
        word, pos = identity
        definitions = candidates[identity]
        selected = next(((meaning, quotes) for meaning, quotes in definitions.items() if quotes.get("example")), None)
        if not selected:
            continue
        meaning, quotes = selected
        pronunciation = french["ipa"] or quotes["ipa"]
        if not pronunciation:
            continue
        priority = zipf_frequency(word, "fr")
        audio_optional = priority < 3.8
        source = "https://zh.wiktionary.org/wiki/" + quote(quotes["source"])
        other_meanings = [item for item in definitions if item != meaning and len(item) <= 30]
        identifier = "lex" + hashlib.sha256((word + ":" + pos).encode()).hexdigest()[:20]
        rows.append({"id": identifier, "word": french["word"], "pos": pos, "gender": french["gender"],
                     "meanings": [meaning, *other_meanings[:2]], "primaryMeaning": meaning, "ipa": pronunciation,
                     "example": {**quotes["example"], "meaning": meaning, **({"noAudio": True} if audio_optional else {})},
                     "frequency": priority, "source": "Wiktionnaire", "sourceUrl": source,
                     "frenchSourceUrl": "https://fr.wiktionary.org/wiki/" + quote(french["word"]),
                     "attestedSupplement": 1, "literal": pos != "n.", **({"plural": True} if french["plural"] else {})})
    return sorted(rows, key=lambda row: (-row["frequency"], row["word"], row["pos"])), len(verified)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=Path, default=WORK / "attested-dictionary-supplement.json")
    parser.add_argument("--apply", action="store_true", help="Append the prepared rows without editing existing entries.")
    args = parser.parse_args()
    target = OUTPUT / "french.json"
    dictionary = json.loads(target.read_text(encoding="utf-8"))
    if not args.apply:
        rows, attested = prepare(dictionary)
        args.rows.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{attested} dictionary candidates; {len(rows)} with Chinese definitions, IPA and paired examples.")
        return
    rows = json.loads(args.rows.read_text(encoding="utf-8"))
    ids = {row["id"] for row in dictionary["entries"]}
    existing = {spelling(row["word"]) for row in dictionary["entries"] if not row.get("attestedSupplement")}
    additions = [row for row in rows if row["id"] not in ids and spelling(row["word"]) not in existing]
    dictionary["entries"].extend(additions)
    content = json.dumps(dictionary, ensure_ascii=False, separators=(",", ":")).encode()
    target.write_bytes(content)
    manifest_file = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    manifest["sha256"] = hashlib.sha256(content).hexdigest()
    for field, predicate in {
        "words": lambda row: True, "ipa": lambda row: row.get("ipa"),
        "examples": lambda row: (row.get("example") or {}).get("fr"),
        "translatedExamples": lambda row: (row.get("example") or {}).get("zh"),
        "authoredExamples": lambda row: (row.get("example") or {}).get("authored"),
    }.items():
        manifest["stats"][field] = sum(bool(predicate(row)) for row in dictionary["entries"])
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Added {len(additions)} entries; dictionary now contains {len(dictionary['entries'])} entries.")


if __name__ == "__main__":
    main()
