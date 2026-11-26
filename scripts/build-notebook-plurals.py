"""Keep the Lexique 3.83 plural forms for headwords the app can display."""
import argparse
import csv
import io
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_POS = {"NOM": "n", "ADJ": "adj"}
ARTICLE = re.compile(r"^(?:de la |de l['’]|l['’]|(?:un|une|le|la|les|des|du) +)")


def spelling(text):
    return unicodedata.normalize("NFC", text.strip().lower()).replace("œ", "oe").replace("æ", "ae")


def headwords():
    dictionary = ROOT / "src/static/lexicon/french.json"
    yield from json.loads(dictionary.read_text(encoding="utf-8"))["entries"]
    for name in ("inspire1", "inspire2", "inspire3", "inspire4", "fos1"):
        with zipfile.ZipFile(ROOT / f"src/static/content/{name}.zip") as book:
            for lesson in json.loads(book.read("manifest.json"))["library"]:
                yield from lesson["words"]


def build(archive):
    available = set()
    for entry in headwords():
        pos = entry.get("pos", "").split(".", 1)[0]
        if pos not in SOURCE_POS.values():
            continue
        forms = [entry.get("word", ""), *entry.get("aliases", []), *(form["text"] for form in entry.get("forms", []))]
        for text in forms:
            available.add((pos, ARTICLE.sub("", spelling(text))))

    result = defaultdict(set)
    with zipfile.ZipFile(archive) as dataset:
        with io.TextIOWrapper(dataset.open("Lexique383.tsv"), encoding="utf-8-sig", newline="") as table:
            for row in csv.DictReader(table, delimiter="\t"):
                pos, lemma, form = SOURCE_POS.get(row["cgram"]), spelling(row["lemme"]), spelling(row["ortho"])
                if row["nombre"] == "p" and form != lemma and (pos, lemma) in available:
                    result[pos + ":" + lemma].add(form)
    return {key: sorted(result[key]) for key in sorted(result)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", type=Path, default=ROOT / ".lexicon-work/Lexique383.zip")
    args = parser.parse_args()
    plurals = build(args.archive)
    target = ROOT / "src/lexicon/notebook-plurals.json"
    target.write_text(json.dumps(plurals, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(plurals)} headwords, {sum(map(len, plurals.values()))} plural forms")
