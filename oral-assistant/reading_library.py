"""Read-only projections of the desktop reading journal. Never rescore old recordings."""
from functools import lru_cache
from hashlib import sha256
import json
import wave


@lru_cache(maxsize=64)
def audio_info(path, size, modified):
    with wave.open(str(path), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError("需要 16 kHz 单声道 PCM 音轨")
        frames = audio.getnframes()
        payload = audio.readframes(frames)
        if len(payload) != 2 * frames:
            raise ValueError("教材音轨不完整")
        return frames / 16000, sha256(payload).hexdigest()


def text_signature(pack):
    rows = [[r.get(k) for k in ("id", "fr", "piste", "start", "end", "variants")]
            for r in pack["sentences"]]
    return sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()


def revision(pack, media):
    path = media / ("%03d.wav" % pack["piste"])
    stat = path.stat()
    length, digest = audio_info(path, stat.st_size, stat.st_mtime_ns)
    if max(s["end"] for s in pack["sentences"]) > length:
        raise ValueError("教材音轨缺少句尾")
    return sha256((text_signature(pack) + digest).encode()).hexdigest()[:24]


def lesson_result(s):
    """Use only the initial lesson visits, excluding later notebook or assisted review rounds."""
    ids = [x["id"] for x in s["text"]["sentences"]]
    outcomes = s["outcomes"][:len(ids)]
    if (s.get("origin") == "notebook" or [x["step"] for x in outcomes] != ids
            or not s.get("origin") and s["attempts"] and s["attempts"][0]["stage"] == "listen"):
        return None
    visits = {r["visit"] for r in outcomes}
    first = {a["step"]: a["result"] for a in s["attempts"]
             if a["visit"] in visits and a["slot"] == 1 and a["stage"] == "blind"}
    valid = [r for r in first.values() if r["accuracy"] is not None]
    red = len({a["step"] for a in s["attempts"] if a["visit"] in visits
               and a["result"]["accuracy"] is not None
               and (any(w["mark"] == "bad" for w in a["result"].get("words", []))
                    or a["result"].get("extras"))})
    perfect = len(valid) == len(ids) and all(
        r["accuracy"] == r["coverage"] == 1 and r["status"] == "pass" and r.get("words")
        and all(w["mark"] == "good" for w in r["words"]) and not r.get("extras") for r in valid)
    return dict(sessionId=s["id"], at=outcomes[-1]["at"], completed=True, red=red,
                accuracy=sum(r["accuracy"] for r in valid)/len(valid) if valid else None,
                coverage=sum(r["coverage"] for r in valid)/len(valid) if valid else None,
                perfect=perfect, valid=len(valid))


def index(store, packs):
    events, reports = [], []
    recent = {}
    for path in store.sessions.glob("*/session.json"):
        s = json.loads(path.read_text(encoding="utf-8"))
        pack = packs.get(s.get("part"))
        if s.get("layout") != "guided" or not pack:
            continue
        version = s["text"].get("contentRevision")
        if version and version != pack["contentRevision"]:
            continue
        if not version and text_signature(s["text"]) != text_signature(pack):
            continue
        notebook = s.get("origin") == "notebook" or (
            not s.get("origin") and s["reviewRound"] and
            (not s["attempts"] or s["attempts"][0]["stage"] == "listen"))
        if not notebook and (s["created"], s["id"]) > recent.get(s["part"], (0,"",False))[:2]:
            recent[s["part"]] = s["created"], s["id"], s["phase"] != "ended"
        summary = lesson_result(s)
        if summary:
            reports.append((summary["at"], s["part"], summary, bool(version)))
        for a in s["attempts"]:
            if a["step"] != "full":
                events.append((a["at"], 0, s["id"], s["part"], a))
        for out in s["outcomes"]:
            events.append((out["at"], 1, s["id"], s["part"], out))
    lessons, active, counts = {}, {}, {}
    for _, part, summary, version_known in sorted(reports, key=lambda e:(e[0],e[2]["sessionId"])):
        crown = lessons.get(part, {}).get("crown", False)
        if summary["perfect"] and version_known:
            crown = True
        elif summary["red"]:
            crown = False
        lessons[part] = {**summary, "crown": crown}
    for at, outcome, sid, part, r in sorted(events, key=lambda e:e[:3]):
        key = part, r["step"]
        if outcome and r["status"] == "passed":
            active.pop(key, None)
            counts.pop(key, None)
            continue
        entry = counts.setdefault(key, dict(textId=part, sentenceId=r["step"], failures=0,
                                            uncertain=0, words=[], focusWords=[]))
        if not outcome:
            res = r["result"]
            if res["status"] == "pass":
                continue
            entry["words"] = res.get("words", [])
            entry["reason"] = res["status"]
            if res["accuracy"] is None:
                entry["uncertain"] += 1
            else:
                entry["failures"] += 1
                entry["focusWords"] = [w["text"] for w in entry["words"] if w["mark"] == "bad"]
            if r["slot"] < 3 and key not in active:
                continue
        entry.setdefault("queuedAt", at)
        entry["lastReviewedAt"] = at
        active[key] = entry
        if len(active) > 100:
            oldest = min(active, key=lambda k:active[k]["lastReviewedAt"])
            del active[oldest]
    return {"lessons": lessons, "inProgress": {part:sid for part, (_,sid,open_) in recent.items() if open_},
            "reviewQueue": sorted(active.values(), key=lambda r:r["lastReviewedAt"])}
