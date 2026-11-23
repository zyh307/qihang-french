"""Project completed practice units and today's activity from the local session stores."""
import json
from pathlib import Path
import time

from practice_records import Mode, PracticeJournal, Verdict


def sessions(root):
    for path in Path(root).glob("sessions/*/session.json"):
        try:
            yield json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue


def select_review(store, lesson, field, review):
    if not isinstance(review, dict) or review.get("version") != lesson["version"]:
        raise ValueError("课包版本已更新，请从需练习本重新选择")
    item = review.get("item")
    unit = next((unit for unit in lesson[field] if unit["id"] == item), None)
    if unit is None:
        raise ValueError("找不到这条待练内容")
    for session in sorted(sessions(store.root), key=lambda row:row["created"], reverse=True):
        if (session["phase"] == "active" and session.get("review_item") == item
                and session["part"] == lesson["lesson_id"] and session["lesson"]["version"] == lesson["version"]):
            return {**lesson, field:[unit]}, session
    return {**lesson, field:[unit]}, None


def note(mode, item, verdict, status, reason, *, ts=None):
    return {"mode":mode, "item":item, "verdict":verdict, "ts":time.time() if ts is None else ts,
            "evidence":{"status":status, "reason":reason}}


def slot_results(session):
    """One disposition per frame, based on its committed non-supplement answers."""
    grouped = {}
    for row in session["rows"]:
        if not row.get("supplement"):
            grouped.setdefault(row.get("frame_id", session["frame"]["id"]), []).append(row)
    results = {}
    for frame in session["lesson"]["frames"]:
        key = frame["id"]
        rows = grouped.get(key, [])
        latest = {row["prompt"]["id"]:row for row in rows}
        pending = {prompt for prompt, row in latest.items() if row["verdict"] != Verdict.PASS}
        reliable_retries = [row for row in rows if row["verdict"] == Verdict.RETRY and row["prompt"]["id"] in pending]
        releases = [row for row in latest.values() if row["verdict"] == Verdict.RELEASE]
        independent = {row["prompt"]["target"] for row in rows
                       if row["level"] == 0 and row["verdict"] == Verdict.PASS}
        both = {candidate["id"] for candidate in frame["candidates"]} <= independent
        results[key] = {"passes":sum(row["verdict"] == Verdict.PASS for row in latest.values()),
                        "both":both, "due":bool(releases or len(reliable_retries) >= 2),
                        "reason":(releases or reliable_retries or [{}])[-1]}
    return results


def dispositions(mode, session, journal):
    current = {row["item"]:row for row in session.get("notebook_outcomes", [])}
    fallback = session.get("ended", session["created"])
    if mode == Mode.FLUENCY:
        logs = {}
        if any("at" not in out for out in session.get("outcomes", [])):
            for key in session.get("log_ids", []):
                decision = journal.get(mode, key)
                if decision:
                    logs[decision["item"].rsplit("/", 1)[-1]] = decision["ts"]
        for out in session.get("outcomes", []):
            if out["item"] in current:
                continue
            if out["verdict"] == Verdict.PASS or out["needs_practice"]:
                status = "cleared" if out["verdict"] == Verdict.PASS else "queued"
                current[out["item"]] = note(mode, out["item"], out["verdict"], status, out["rule"],
                                             ts=out.get("at", logs.get(out["item"], fallback)))
    elif session["phase"] == "ended":
        summary = session.get("summary", {})
        due = summary.get("due_frames", [session["frame"]["id"]] if summary.get("needs_practice") else [])
        for item, state in slot_results(session).items():
            if item in current:
                continue
            if item in due:
                reason = state["reason"]
                current[item] = note(mode, item, reason.get("verdict", Verdict.RETRY), "queued",
                                     reason.get("rule", "review"), ts=fallback)
            elif state["both"]:
                current[item] = note(mode, item, Verdict.PASS, "cleared", "target_form", ts=fallback)
    return current.values()


def notebook(root, packs):
    events = []
    for mode in packs:
        journal = PracticeJournal(root / mode / "decisions")
        for session in sessions(root / mode):
            if session.get("game"):
                continue
            for row in dispositions(mode, session, journal):
                events.append((row["ts"], session["created"], mode, session, row))
    entries = {}
    for ts, _, mode, state, row in sorted(events, key=lambda event:event[:2]):
        unit_id = row["item"]
        version = state["lesson"]["version"]
        key = mode, state["part"], unit_id, version
        status = row["evidence"]["status"]
        if status == "cleared":
            entries.pop(key, None)
            continue
        field = "chains" if mode == Mode.FLUENCY else "frames"
        unit = next((unit for unit in state["lesson"][field] if unit["id"] == unit_id), None)
        if not unit:
            continue
        current = packs[mode]
        if current and 'lesson_id' not in current:
            current = current.get(state['part'])
        is_current = (current and current["lesson_id"] == state["part"] and version == current["version"]
                      and any(part["id"] == unit_id for part in current[field]))
        title = " ".join(unit["groups"]) if mode == Mode.FLUENCY else unit["template"].replace("{slot}", "…")
        entries[key] = {**row, "lessonId":state["part"], "unitId":unit_id, "contentRevision":version,
                        "title":title, "forms":[item["form"] for item in unit.get("candidates", [])],
                        "lessonLabel":state["lesson"].get("label", state["part"]),
                        "reason":row["evidence"]["reason"], "lastAttemptAt":ts, "status":status,
                        "oldVersion":not is_current}
    return sorted(entries.values(), key=lambda item:item["lastAttemptAt"])


def speech_intervals(spans, received, duration):
    anchor = received - duration
    return [[anchor + max(0, span["start"]), anchor + min(duration, span["end"])]
            for span in spans if max(0, span["start"]) < min(duration, span["end"])]


def today(data_dir, root, modes, start, end):
    def counts(voice):
        return {"completed":0, "short":0, "speech_seconds":0 if voice else None}

    items = {}
    for mode in modes:
        total = items[mode] = counts(True)
        for session in sessions(root / mode):
            if session["phase"] == "ended" and start <= session.get("ended", 0) < end:
                effective = (session["speech_seconds"] * 2000 >= session["active_ms"] > 0
                             if mode == Mode.FLUENCY else session["summary"]["effective"])
                total["completed" if effective else "short"] += 1
            spans = session.get("speech_intervals", [])
            total["speech_seconds"] += sum(max(0, min(end, right) - max(start, left)) for left, right in spans)
            if start <= session["created"] <= session.get("updated", session["created"]) < end:
                accounted = sum(right - left for left, right in spans)
                total["speech_seconds"] += max(0, session["speech_seconds"] - accounted)
        total["speech_seconds"] = round(total["speech_seconds"], 3)
    for label, location, accepted in ((Mode.LECTURE, data_dir / "lecture/v1", "lecture-guided"),
                                      ("exam", data_dir, "simulation")):
        total = items[label] = counts(False)
        total["completed"] = sum(session.get("mode") == accepted and session.get("phase") == "ended"
                                 and start <= session.get("ended", 0) < end for session in sessions(location))
    return items
