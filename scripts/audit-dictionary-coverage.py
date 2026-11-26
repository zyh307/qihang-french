"""Find frequent French headwords missing from the learner dictionary."""
import argparse
import csv
import gzip
import io
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".lexicon-work"
POS = {"NOM": "n.", "VER": "v.", "ADJ": "adj.", "ADV": "adv."}
WIKTIONARY_POS = {"noun": "n.", "verb": "v.", "adj": "adj.", "adv": "adv."}
SKIP_SENSES = {"obsolete", "archaic", "dated", "rare", "form-of", "misspelling", "alternative"}
WORD = re.compile("[a-zàâäæçéèêëîïôöœùûüÿ-]{2,}")


def key(word):
    return unicodedata.normalize("NFC", word.strip().casefold()).replace("’", "'").replace("œ", "oe").replace("æ", "ae")


def ranked_headwords(archive, count):
    entries = {}
    with zipfile.ZipFile(archive) as source:
        with io.TextIOWrapper(source.open("Lexique383.tsv"), encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream, delimiter="\t"):
                word, pos = row["lemme"], POS.get(row["cgram"])
                if row["islem"] != "1" or not pos or not WORD.fullmatch(word):
                    continue
                frequency = max(float(row["freqlemfilms2"]), float(row["freqlemlivres"]))
                if frequency <= 0:
                    continue
                identity = (key(word), pos)
                if identity not in entries or entries[identity][0] < frequency:
                    entries[identity] = (frequency, word, pos)
    return sorted(entries.values(), key=lambda entry: (-entry[0], entry[1], entry[2]))[:count]


def modern_entries(archive, candidates):
    attested = {}
    first_field = re.compile(r'^\{"word"\s*:\s*("(?:[^"\\]|\\.)*")')
    with gzip.open(archive, "rt", encoding="utf-8") as stream:
        for line in stream:
            match = first_field.match(line)
            if match and key(json.loads(match[1])) not in candidates:
                continue
            row = json.loads(line)
            word, pos = row.get("word", ""), WIKTIONARY_POS.get(row.get("pos"))
            identity = (key(word), pos)
            if row.get("lang_code") != "fr" or identity[0] not in candidates or not pos:
                continue
            if any(sense.get("glosses") and not sense.get("form_of")
                   and not SKIP_SENSES.intersection(sense.get("tags", [])) for sense in row.get("senses", [])):
                attested[identity] = word
    return attested


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=15000, help="Number of ranked Lexique headword and part-of-speech pairs to scan.")
    parser.add_argument("--lexique", type=Path, default=WORK / "Lexique383.zip")
    parser.add_argument("--wiktionary", type=Path, default=WORK / "fr-fr.jsonl.gz")
    parser.add_argument("--output", type=Path, help="Optional JSON report path.")
    args = parser.parse_args()
    dictionary = json.loads((ROOT / "src/static/lexicon/french.json").read_text(encoding="utf-8"))
    present = {(key(name), entry["pos"]) for entry in dictionary["entries"]
               for name in [entry["word"], *entry.get("aliases", [])]}
    ranked = ranked_headwords(args.lexique, args.top)
    attested = modern_entries(args.wiktionary, {key(word) for _, word, _ in ranked})
    verified = [((key(word), pos), frequency) for frequency, word, pos in ranked if (key(word), pos) in attested]
    missing = [{"word": attested[identity], "pos": identity[1], "frequency": frequency,
                "source": "https://fr.wiktionary.org/wiki/" + quote(attested[identity])}
               for identity, frequency in verified if identity not in present]
    summary = {"lexiquePairsScanned": len(ranked), "modernFrenchPairs": len(verified),
               "presentPairs": len(verified) - len(missing), "missingPairs": len(missing)}
    if args.output:
        args.output.write_text(json.dumps({"summary": summary, "missing": missing}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
