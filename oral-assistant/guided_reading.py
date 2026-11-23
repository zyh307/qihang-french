"""Guided practice visits and textbook review, independent of exam records."""
from collections import Counter
from datetime import date, datetime
import time


def start(session, due=None):
    session.update(layout="guided", mode="lecture-guided", schema=2, phase="lines",
                   visit=0, outcomes=[], reviewRound=bool(due), shortMode=False)
    if due:
        session["queue"] = list(due)
    session["roundTotal"] = len(session["queue"])


def round_total(s):
    if "roundTotal" in s:
        return s["roundTotal"]
    if s["phase"] == "full":
        return 1
    # Older sessions have no round size. In a follow-up round each reviewed
    # sentence already has one outcome from the first pass through the text.
    visited = [r["step"] for r in s["outcomes"]]
    distinct = set(visited)
    done = len(visited)
    if s["reviewRound"] and (distinct.intersection(s["queue"]) or len(distinct) < done):
        done -= len(distinct)
    return done + len(s["queue"])


def attempts(s):
    return [a for a in s["attempts"] if a["visit"] == s["visit"]]


def stage(s):
    index = len(attempts(s))
    if s["phase"] == "full":
        return "full"
    if index >= 3:
        return "retry"
    if index == 2 or s["reviewRound"] and not index:
        return "listen"
    return "chunks" if index or s["shortMode"] else "blind"


def focus(a):
    return [w["text"] for w in a["result"].get("words", []) if w["mark"] == "bad"]


def pending(s):
    latest = {row["step"]:row for row in s["outcomes"]}
    return [key for key,row in latest.items() if row["status"] == "consolidate"]


def finish_step(s, reason):
    if "roundTotal" not in s:
        s["roundTotal"] = round_total(s)
    key = s["queue"].pop(0)
    rows = attempts(s)
    passed = reason == "pass"
    if key != "full":
        reliable = [a for a in rows if a["result"]["accuracy"] is not None]
        s["outcomes"].append({"step":key, "visit":s["visit"], "at":time.time(),
            "status":"passed" if passed else "consolidate",
            "reason":reason if passed or reliable or reason == "timeout" else "audio",
            "focusWords":focus(reliable[-1]) if reliable else [],
            "passKind":("independent" if rows[-1]["stage"] == "blind" else "assisted") if passed else None})
    s["visit"] += 1
    if not s["queue"]:
        if key != "full" and not s["reviewRound"] and pending(s):
            s["phase"] = "offer"
        else:
            s.update(phase="ended",ended=time.time())


def advance(s, action):
    if s["phase"] == "offer":
        if action == "review":
            s.update(phase="lines",queue=pending(s),reviewRound=True)
            s["roundTotal"] = len(s["queue"])
        elif action == "finish":
            s.update(phase="ended",ended=time.time())
        else:
            raise ValueError("请选择再读一遍或先看报告")
        return
    if s["phase"] == "ended" and action == "full":
        s.update(phase="full",queue=["full"],roundTotal=1)
        s.pop("ended",None)
        return
    if s["phase"] not in ("lines","full"):
        raise ValueError("本轮已结束")
    if action == "short" and not attempts(s):
        s["shortMode"] = True
        return
    if action == "skip" and len(attempts(s)) < 3:
        raise ValueError("第三次练习结束后可跳过")
    if action not in ("timeout","skip"):
        raise ValueError("无效的练习操作")
    finish_step(s,action)


def record(s, row, attempt_id):
    slot = len(attempts(s)) + 1
    row.update(visit=s["visit"],slot=slot,stage=stage(s),attemptId=attempt_id)
    s["attempts"].append(row)
    if row["result"]["status"] == "pass":
        finish_step(s,"pass")


def report(s):
    latest = {r["step"]:r for r in s["outcomes"]}
    first = {a["step"]:a["result"] for a in s["attempts"] if a["stage"] == "blind" and a["slot"] == 1}
    valid = [r for r in first.values() if r["accuracy"] is not None]
    words = Counter(w for a in s["attempts"] if a["result"]["accuracy"] is not None for w in focus(a))
    best = run = 0
    for r in s["outcomes"]:
        if datetime.fromtimestamp(r["at"]).date() != date.today():
            continue
        if r["passKind"] == "independent":
            run += 1
            best = max(best,run)
        elif r["reason"] != "audio":
            run = 0
    return {"lines":latest,"first":first,"valid":len(valid),"due":pending(s),"roundTotal":round_total(s),
            "accuracy":sum(r["accuracy"] for r in valid)/len(valid) if valid else None,
            "coverage":sum(r["coverage"] for r in valid)/len(valid) if valid else None,
            "words":words.most_common(3),"best":best}
