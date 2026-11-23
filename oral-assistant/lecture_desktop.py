"""Desktop blind reading. Confidence describes transcription, not pronunciation."""
from collections import Counter
from datetime import date, datetime
import time
from lecture_alignment import compare


def evaluate(line, asr, previous=None):
    base = compare(line, asr, for_display=True)
    if base["status"] == "uncertain":
        return {**base, "words": [], "extras": [], "edge": []}
    reliable = all(s["avg_logprob"] >= -.70 and s["no_speech_prob"] <= .35
                   for s in asr["segments"])
    edits = base["edits"]
    words, extras = [], []
    for edit in edits:
        if edit["op"] == "extra":
            extras.append({"at": len(words), "text": edit["heard"]})
            continue
        for word in edit["ref"].split():
            words.append({"text": word, "op": edit["op"]})
    anchors = [i for i, w in enumerate(words) if w["op"] == "match"]
    edge, prior = [], (previous or {}).get("edge", [])
    for i, word in enumerate(words):
        if not reliable:
            word["mark"] = "maybe"
        elif word["op"] == "match":
            word["mark"] = "good"
        elif anchors and anchors[0] < i < anchors[-1]:
            word["mark"] = "bad"
        else:
            fingerprint = [i, word["op"]]
            edge.append(fingerprint)
            word["mark"] = "bad" if fingerprint in prior else "maybe"
    uncertain = not reliable or any(w["mark"] == "maybe" for w in words)
    if uncertain:
        for word in words:
            if word["mark"] == "bad":
                word["mark"] = "maybe"
    red = sum(w["mark"] == "bad" for w in words)
    accuracy = max(0, 1 - (red + len(extras)) / len(words))
    coverage = 1 - sum(w["op"] == "missing" for w in words) / len(words)
    status = ("uncertain" if uncertain else "retry" if red >= 2 or accuracy < .80
              else "pass" if not red and accuracy >= .90 and coverage >= .95 else "border")
    return {"status": status, "accuracy": None if uncertain else accuracy,
            "coverage": None if uncertain else coverage, "edits": edits,
            "words": words, "extras": extras if reliable else [], "edge": edge}


def summary(session):
    ids = [s["id"] for s in session["text"]["sentences"]]
    scores, wrong, streaks, errors = {}, {}, Counter(), Counter()
    blind, first_seen = [], set()
    for a in session["attempts"]:
        key, res = a["step"], a["result"]
        if res["status"] == "uncertain":
            continue
        scores[key] = res
        if key == "full":
            continue
        bad = [w["text"] for w in res["words"] if w["mark"] == "bad"]
        bad.extend("+" + e["text"] for e in res["extras"])
        errors.update(bad)
        if a["phase"] == "lines":
            if res["status"] == "retry":
                wrong[key] = bad
            if key not in first_seen:
                blind.append((key, a.get("at", 0), res["status"]))
                first_seen.add(key)
        if a["phase"] == "review":
            streaks[key] = streaks[key] + 1 if res["status"] == "pass" else 0
            if streaks[key] >= 2:
                wrong.pop(key, None)
            elif bad:
                wrong[key] = bad
    run = best = 0
    last = -2
    for key, at, status in blind:
        index = ids.index(key)
        if last + 1 != index:
            run = 0
        run = run + 1 if datetime.fromtimestamp(at).date() == date.today() and status == "pass" else 0
        best, last = max(best, run), index
    return {"scores": scores, "wrong": list(wrong), "redWords": wrong,
            "streaks": dict(streaks), "frequent": errors.most_common(3), "todayBest": best,
            "recorded": sum(k in scores for k in ids),
            "cleared": all(scores.get(k, {}).get("status") == "pass" for k in ids + ["full"]) and not wrong}


def advance(session, action, step=None):
    phase, queue = session["phase"], session["queue"]
    result = summary(session)
    if phase in ("list", "ended"):
        if action == "drill" and result["wrong"]:
            key = step or result["wrong"][0]
            if key not in result["wrong"]:
                raise ValueError("该句未在红句清单中")
            session.pop("ended", None)
            session.update(phase="review", queue=[key])
        elif action == "full":
            session.update(phase="full", queue=["full"])
        elif action == "finish":
            session.update(phase="ended", ended=time.time())
        else:
            raise ValueError("请选择一项练习")
        return
    key = queue[0]
    if action == "skip":
        session["skipped"].append({"step": key, "phase": phase})
    elif action == "next":
        last = session["attempts"][-1] if session["attempts"] else {}
        if last.get("revision") != session["revision"] or last["result"]["status"] == "uncertain":
            raise ValueError("请先完成本句朗读")
        if phase == "review" and key in result["wrong"]:
            raise ValueError("再连续读对两次，即可移出精练清单")
    else:
        raise ValueError("未知操作")
    queue.pop(0)
    if phase == "full":
        session.update(phase="ended", ended=time.time())
    elif not queue or phase == "review":
        session.update(phase="list", queue=[])
