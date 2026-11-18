"""French spoken forms used only for textbook reading. Keep display-word provenance."""

from dataclasses import dataclass
from functools import lru_cache
import re
import unicodedata

LEX = re.compile(r"[^\W_]+|€", re.UNICODE)
SMALL = "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split()
TENS = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def cardinal(n):
    if n < 17:
        return SMALL[n]
    if n < 20:
        return "dix " + SMALL[n - 10]
    if n < 70:
        q, r = divmod(n, 10)
        return TENS[q] + (" et un" if r == 1 else " " + SMALL[r] if r else "")
    if n < 80:
        return "soixante " + ("et " if n == 71 else "") + cardinal(n - 60)
    if n < 100:
        return "quatre vingt" + (" " + cardinal(n - 80) if n > 80 else "")
    q, r = divmod(n, 100)
    return (SMALL[q] + " " if q > 1 else "") + "cent" + (" " + cardinal(r) if r else "")


NUMBERS = {tuple(cardinal(n).split()): n for n in range(1000)}
for decade, stem in ((70, "septante"), (80, "huitante"), (90, "nonante")):
    NUMBERS[(stem,)] = decade
    for unit in range(1, 10):
        NUMBERS[(stem, "et", "un") if unit == 1 else (stem, SMALL[unit])] = (
            decade + unit
        )
MAX_FORM = max(map(len, NUMBERS))
ORDINAL = {}
for n in range(2, 101):
    stem = cardinal(n).removesuffix("e")
    if stem.endswith("cinq"):
        stem += "u"
    if stem.endswith("neuf"):
        stem = stem[:-1] + "v"
    ORDINAL[tuple((stem + "ième").split())] = n
ORDINAL.update({("premier",): 1, ("première",): 1, ("second",): 2, ("seconde",): 2})


@lru_cache(maxsize=1024)
def folded(word):
    return "".join(
        c
        for c in unicodedata.normalize("NFD", word.casefold())
        if not unicodedata.combining(c)
    )


# Attested names in the course. Additional spellings are local to name positions.
NAMES = set(
    "juan pablo antonio adam nina ying aïcha doris angelica javier gonzalez dumont louis matthieu chedid anna joseph andrée marianne émilie beryl élisabeth billie julie david danny chiara kathy florence bertrand brad pitt marc betty kim isabelle faure patrick cécile medhi éric antoine stéphane lucas redouane fontes hippolyte tissot victor sophie omid jordan nour legrand thauvin lamouric".split()
)
ALIASES = {
    "ying": {"yin", "ayin"},
    "nina": {"anina"},
    "aicha": {"acha", "aycha"},
    "juan": {"jouan"},
    "gonzalez": {"gonzales"},
    "danny": {"dany"},
    "kathy": {"cathy"},
    "billie": {"billy"},
    "medhi": {"mehdi"},
}
NAME_KEYS = {folded(w) for w in NAMES} | {"mathieu"}


@lru_cache(maxsize=1024)
def name_sound(word):
    key = (
        folded(word)
        .replace("ph", "f")
        .replace("th", "t")
        .replace("ck", "k")
        .replace("y", "i")
    )
    if key.endswith("c"):
        key = key[:-1] + "k"
    return re.sub(r"(.)\1+", r"\1", key)


@dataclass(frozen=True)
class Atom:
    key: str
    indices: tuple
    name: bool = False


def equal(a, b):
    if a.key == b.key:
        return True
    if (
        a.key == "#1"
        and b.key in ("un", "une")
        or b.key == "#1"
        and a.key in ("un", "une")
    ):
        return True
    if a.name and b.key.isalpha():
        return name_sound(a.key) == name_sound(b.key) or folded(b.key) in ALIASES.get(
            folded(a.key), ()
        )
    return False


def parse(text, reference=False):
    text = unicodedata.normalize("NFC", text)
    found = list(LEX.finditer(text))
    words = []
    items = []
    for match in found:
        raw = match[0]
        key = raw.casefold().replace("œ", "oe")
        if raw == "€":
            items.append(
                (key, max(0, len(words) - 1), False, match.start(), match.end())
            )
            continue
        pos = len(words)
        words.append(key)
        name = reference and (
            folded(key) in NAME_KEYS
            or (
                raw[0].isupper()
                and pos
                and words[pos - 1] in ("appelle", "madame", "monsieur", "mme")
            )
        )
        items.append((key, pos, bool(name), match.start(), match.end()))
    keys = [r[0] for r in items]
    forms = [{"vingts": "vingt", "cents": "cent", "une": "un"}.get(k, k) for k in keys]
    units = []

    def emit(key, start, end, name=False):
        units.append(
            Atom(key, tuple(dict.fromkeys(row[1] for row in items[start:end])), name)
        )

    def number(i):
        if i >= len(keys):
            return None
        if re.fullmatch(r"[0-9]{1,15}", keys[i]):
            return keys[i], i + 1
        for end in range(min(i + MAX_FORM, len(keys)), i, -1):
            n = NUMBERS.get(tuple(forms[i:end]))
            if n is not None:
                return str(n), end
        return None

    i = 0
    while i < len(items):
        k = keys[i]
        compact = re.fullmatch(r"([0-9]{1,2})h([0-9]{0,2})", k)
        ordinal = re.fullmatch(r"([0-9]+)(?:er|re|ère|e|ème|eme)", k)
        housing = re.fullmatch(r"t([0-9]+)", k)
        if compact:
            emit("#" + str(int(compact[1])), i, i + 1)
            emit("heure", i, i + 1)
            if compact[2] and int(compact[2]):
                emit("#" + str(int(compact[2])), i, i + 1)
            i += 1
            continue
        if housing:
            emit("t", i, i + 1)
            emit("#" + housing[1], i, i + 1)
            i += 1
            continue
        if ordinal:
            emit("ord:" + str(int(ordinal[1])), i, i + 1)
            i += 1
            continue
        for end in range(min(i + MAX_FORM, len(keys)), i, -1):
            n = ORDINAL.get(tuple(forms[i:end]))
            if n is not None:
                break
        if n is not None:
            emit("ord:" + str(n), i, end)
            i = end
            continue
        numeric = number(i)
        if numeric or k == "mille":
            value, end = numeric or ("1", i)
            if end < len(keys) and keys[end] == "mille" and int(value) < 1000:
                tail = number(end + 1)
                value = str(int(value) * 1000 + (int(tail[0]) if tail else 0))
                end = tail[1] if tail else end + 1
            # Preserve a French phone written 07.22.63.10.07 as five groups.
            fraction = None
            if end < len(keys) and keys[end] == "virgule":
                tail = number(end + 1)
                if tail:
                    fraction, end = tail
                    if fraction == "0":
                        tail = number(end)
                        if tail:
                            fraction, end = "0" + tail[0], tail[1]
            elif (
                end < len(keys)
                and k.isdigit()
                and keys[end].isdigit()
                and text[items[end - 1][4] : items[end][3]] in (",", ".")
                and not (
                    i
                    and keys[i - 1].isdigit()
                    and text[items[i - 1][4] : items[i][3]] == "."
                )
                and not (
                    end + 1 < len(keys)
                    and keys[end + 1].isdigit()
                    and text[items[end][4] : items[end + 1][3]] == "."
                )
            ):
                fraction = keys[end]
                end += 1
            if fraction is not None:
                if len(fraction) <= 2 and keys[end : end + 1] in (
                    ["€"],
                    ["euro"],
                    ["euros"],
                ):
                    emit(
                        "eur:" + str(100 * int(value) + int(fraction.ljust(2, "0"))),
                        i,
                        end + 1,
                    )
                    end += 1
                else:
                    digits = fraction.rstrip("0")
                    emit("#" + value + ("." + digits if digits else ""), i, end)
                i = end
                continue
            if end < len(keys) and keys[end] in ("€", "euro", "euros"):
                after = end + 1
                cent_start = after + 1 if keys[after : after + 1] == ["et"] else after
                cents = number(cent_start)
                if (
                    cent_start != after
                    and cents
                    and keys[cents[1] : cents[1] + 1] not in (["centime"], ["centimes"])
                ):
                    cents = None
                if cents and int(cents[0]) < 100:
                    after = cents[1]
                    if after < len(keys) and keys[after] in ("centime", "centimes"):
                        after += 1
                    amount = int(cents[0])
                else:
                    amount = 0
                emit("eur:" + str(100 * int(value) + amount), i, after)
                i = after
                continue
            if (
                end < len(keys)
                and k.isdigit()
                and keys[end].isdigit()
                and text[items[end - 1][4] : items[end][3]] == ":"
                and int(value) < 24
                and int(keys[end]) < 60
            ):
                emit("#" + value, i, end)
                emit("heure", i, end + 1)
                if int(keys[end]):
                    emit("#" + str(int(keys[end])), end, end + 1)
                i = end + 1
                continue
            emit(k if k in ("un", "une") and end == i + 1 else "#" + value, i, end)
            if end < len(keys) and keys[end] in ("h", "heure", "heures"):
                emit("heure", end, end + 1)
                end += 1
                if end < len(keys) and keys[end] == "00":
                    end += 1
                    units[-1] = Atom("heure", units[-1].indices + (items[end - 1][1],))
            i = end
            continue
        emit("enchanté" if k == "enchantée" else k, i, i + 1, items[i][2])
        i += 1
    return words, units


def identifier_digits(atoms, allow_phone):
    """Preserve identifiers' leading zeros, independently of ASR grouping."""
    result = []
    i = 0
    while i < len(atoms):
        booking = i > 0 and atoms[i - 1].key == "numéro"
        if not atoms[i].key.startswith("#") and not (booking and atoms[i].key == "un"):
            result.append(atoms[i])
            i += 1
            continue
        j = i
        while j < len(atoms) and (atoms[j].key.startswith("#") or atoms[j].key == "un"):
            j += 1
        digits = "".join("1" if a.key == "un" else a.key[1:] for a in atoms[i:j])
        indices = tuple(
            dict.fromkeys(idx for atom in atoms[i:j] for idx in atom.indices)
        )
        if booking:
            result.append(Atom("id:" + digits, indices))
        elif allow_phone and digits.startswith("0"):
            if len(digits) == 10:
                owners = [
                    a.indices
                    for a in atoms[i:j]
                    for _ in ("1" if a.key == "un" else a.key[1:])
                ]
                for p in range(0, 10, 2):
                    result.append(
                        Atom(
                            "tel:" + digits[p : p + 2],
                            tuple(dict.fromkeys(owners[p] + owners[p + 1])),
                        )
                    )
            else:
                result.append(Atom("tel:" + digits + ":incomplet", indices))
        else:
            result.extend(atoms[i:j])
        i = j
    return result


def reservation_spellings(reference, heard):
    """Resolve attested ASR spellings in their textbook context; keep the raw transcript."""
    ref = [atom.key for atom in reference]
    pairs = set(zip(ref, ref[1:]))
    triples = set(zip(ref, ref[1:], ref[2:]))
    keys = [atom.key for atom in heard]
    normalized = []
    i = 0
    while i < len(heard):
        key = keys[i]
        previous = keys[i - 1] if i else None
        end = i + 1
        if (previous == "hôtel" and ("hôtel", "cler") in pairs
                and key in {"clair", "claire", "clerc"}):
            key = "cler"
        elif previous == "sur" and ("sur", "booking", "numéro") in triples:
            # Whisper also inserts an article when it hears the brand as a common noun.
            brand = i + 1 if key == "le" else i
            if (brand + 1 < len(keys) and keys[brand] in {"bouquin", "bouquet"}
                    and keys[brand + 1] == "numéro"):
                key, end = "booking", brand + 1
        elif (previous == "numéro" and key.startswith("id:") and keys[end:end + 1] == ["de"]
                and end + 1 < len(keys)):
            # A clipped final "deux" becomes "de". Require every other digit and
            # the following letter code to be present at this exact reference position.
            suffix = keys[end + 1]
            if suffix == "zm" and ("numéro", key + "2", suffix) in triples:
                key += "2"
                end += 1
        if key == keys[i]:
            normalized.append(heard[i])
        else:
            indices = tuple(idx for atom in heard[i:end] for idx in atom.indices)
            normalized.append(Atom(key, indices))
        i = end
    return normalized
