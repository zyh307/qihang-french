"""Textual evidence for reading aloud, independent of the DELF assessment."""
import math
import re
import unicodedata
from lecture_spoken import equal, identifier_digits, parse, reservation_spellings


def tokens(text):
    value = unicodedata.normalize("NFC", text.casefold()).replace("œ", "oe")
    return re.findall(r"[^\W_]+", value, flags=re.UNICODE)


def split_turn(text, max_words=18):
    """Split one speaker turn. Keep ellipses and French titles inside a phrase."""
    protected = re.sub(
        r"\b(M|Mme|Mlle|Dr|St)\.", lambda m: m[1] + "․", text)
    sentences = re.split(r"(?<=[!?])\s+|(?<=[^.]\.)(?!\.)\s+", protected)
    result = []
    for sentence in sentences:
        sentence = sentence.replace("․", ".").strip()
        if not sentence:
            continue
        if len(tokens(sentence)) <= max_words:
            result.append(sentence)
            continue
        phrase = ""
        for clause in re.split(r"(?<=[,;:])\s+", sentence):
            if len(tokens(clause)) > max_words:
                raise ValueError("长句请按原声停顿标出分句边界")
            if phrase and len(tokens(phrase+" "+clause)) > max_words:
                result.append(phrase)
                phrase = ""
            phrase = (phrase+" "+clause).strip()
        result.append(phrase)
    return result


def align(reference, heard):
    ref_words, a = parse(reference, reference=True)
    heard_words, b = parse(heard)
    phone = any(re.fullmatch(r"0[0-9]{9}|0[0-9]", w) for w in ref_words) or (
        any(w in ref_words for w in ("téléphone","rappeler"))
        or re.search(r"\bzéro[ -]+(?:un|deux|trois|quatre|cinq|six|sept|huit|neuf)\b", reference, re.I))
    a, b = identifier_digits(a, phone), identifier_digits(b, phone)
    b = reservation_spellings(a, b)
    if not ref_words or len(ref_words) > 350 or len(heard_words) > 600 or len(a)>650 or len(b)>850:
        raise ValueError("文本长度超出朗读范围")
    n, m = len(a), len(b)
    costs = [[0]*(m+1) for _ in range(n+1)]
    moves = [[""]*(m+1) for _ in range(n+1)]
    for i in range(1,n+1):
        costs[i][0], moves[i][0] = i, "missing"
    for j in range(1,m+1):
        costs[0][j], moves[0][j] = j, "extra"
    for i in range(1,n+1):
        for j in range(1,m+1):
            same = equal(a[i-1], b[j-1])
            options = [(costs[i-1][j-1]+int(not same), "match" if same else "replace"),
                       (costs[i-1][j]+1, "missing"), (costs[i][j-1]+1, "extra")]
            if not same and i >= 2 and j >= 2 and equal(a[i-2],b[j-1]) and equal(a[i-1],b[j-2]):
                options.insert(0,(costs[i-2][j-2]+1,"order"))
            costs[i][j], moves[i][j] = min(options,key=lambda item:item[0])
    steps = []
    i,j = n,m
    while i or j:
        op = moves[i][j]
        di = 2 if op == "order" else int(op != "extra")
        dj = 2 if op == "order" else int(op != "missing")
        steps.append((op,a[i-di:i],b[j-dj:j]))
        i,j = i-di,j-dj
    # Project semantic matches back onto the exact tokens the page highlights.
    per_word = [[] for _ in ref_words]
    insertions = []
    position = 0
    for op, left, right in reversed(steps):
        indices = sorted({idx for unit in left for idx in unit.indices})
        spoken = " ".join(heard_words[idx] for idx in sorted({idx for unit in right for idx in unit.indices}))
        if not indices:
            insertions.append((position, {"op":"extra","ref":"","heard":spoken}))
        for idx in indices:
            per_word[idx].append((op,spoken))
            position = max(position,idx+1)
    edits = []
    for idx,(word,parts) in enumerate(zip(ref_words,per_word)):
        op = next((code for code,_ in parts if code!="match"),"match")
        edits.append({"op":op,"ref":word,"heard":" ".join(dict.fromkeys(h for _,h in parts if h))})
    for idx,extra in reversed(insertions):
        edits.insert(idx,extra)
    n=len(ref_words)
    # Pair displaced exact tokens across insert/delete operations, once per occurrence.
    extras = [e for e in edits if e["op"] == "extra"]
    for e in edits:
        if e["op"] != "missing":
            continue
        match = next((x for x in extras if x["heard"] == e["ref"]), None)
        if match:
            e.update(op="order", heard=match["heard"])
            extras.remove(match)
            match["op"] = "paired"
    edits = [e for e in edits if e["op"] != "paired"]
    # Two non-adjacent swapped words can be cheaper as two substitutions in DP.
    replacements = [e for e in edits if e["op"] == "replace"]
    for e in replacements:
        if e["op"] == "replace":
            other = next((x for x in replacements if x["op"] == "replace"
                          and x["ref"] == e["heard"] and x["heard"] == e["ref"]), None)
            if other:
                other["op"] = e["op"] = "order"
    coverage = 1 - sum(e["op"] == "missing" for e in edits)/n
    accuracy = max(0, 1 - sum(e["op"] != "match" for e in edits)/n)
    status = "pass" if coverage >= .95 and accuracy >= .90 else "border" if coverage >= .75 and accuracy >= .70 else "retry"
    return {"status":status, "coverage":round(coverage,3), "accuracy":round(accuracy,3), "edits":edits}


def compare(sentence, asr, *, for_display=False):
    segments = asr.get("segments") or []
    if not tokens(asr.get("text","")) or not segments or any(
        not math.isfinite(s.get("avg_logprob",-math.inf)) or s.get("avg_logprob",-2) < -1
        or not 0 <= s.get("no_speech_prob",1) <= .6 for s in segments):
        return {"status":"uncertain","coverage":None,"accuracy":None,"edits":[]}
    original = align(sentence["fr"],asr["text"])
    if original["accuracy"] == 1:
        return original
    best = original
    for variant in sentence.get("variants",[]):
        candidate = align(variant,asr["text"])
        if for_display and candidate["accuracy"] == 1:
            return {**candidate, "edits":[{"op":"match","ref":w,"heard":w} for w in tokens(sentence["fr"])]}
        if not for_display and (candidate["accuracy"],candidate["coverage"]) > (best["accuracy"],best["coverage"]):
            best = candidate
    return best
