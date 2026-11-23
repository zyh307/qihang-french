"""One resumable rhythm demo lesson, with state and decisions stored locally."""
from dataclasses import asdict
import json
from pathlib import Path
import time
from uuid import NAMESPACE_URL, uuid4, uuid5

from aiohttp import web

from daily_practice_config import FluencyRules, ModeSettings, rule_settings
from daily_practice_summary import note, select_review, speech_intervals
from fluency_rules import score
from game_practice import adventure_request, tag
from daily_content import daily_packs, lesson_choices, select_lesson
from practice_records import Mode, PracticeJournal, Verdict, record, update_clock
from recording_window import SAMPLE_RATE, receive_window
from store import Store

DEMO_PACK = Path(__file__).parent / ".media/daily-practice/inspire1-u5-l16/chains.json"
BASE = "/api/daily-practice/fluency"


def rollup(session):
    active = session["active_ms"] / 1000
    ratio = min(1, session["speech_seconds"] / active) if active else 0
    return {"active_seconds": active, "speech_seconds": session["speech_seconds"],
            "speech_ratio": ratio, "effective": ratio >= .50,
            "due": [outcome["item"] for outcome in session["outcomes"] if outcome["needs_practice"]]}


def install(app, data_dir, settings, pack_path=DEMO_PACK):
    if not settings.enabled:
        return
    store = Store(Path(data_dir) / "daily-speaking/v1/fluency")
    journal = PracticeJournal(store.root / "decisions")
    busy = set()

    def packs():
        return daily_packs(pack_path, DEMO_PACK)

    def view(session):
        return web.json_response({**session, "summary": rollup(session)})

    def save(session):
        session["revision"] += 1
        store.save(session)
        return view(session)

    def current(request):
        session = store.load(request.match_info["sid"])
        if session["id"] in busy:
            raise web.HTTPConflict(text="本轮正在识别，请稍后重试")
        revision = int(request.match_info["rev"])
        if revision > session["revision"]:
            raise ValueError("练习版本无效")
        return session, revision == session["revision"]

    async def catalog(request):
        lessons = packs()
        _, content = select_lesson(lessons, request.query.get('lesson'))
        recent = next((row for row in store.listing(regular=True) if row["part"] == content["lesson_id"]), None)
        return web.json_response({"lesson": content, "lessons":lesson_choices(lessons), "recent": recent,
                                  "window_seconds": settings.window_seconds})

    async def start(request):
        body = await request.json()
        game, previous = adventure_request(store, body, "fluency")
        if previous:
            return view(previous)
        _, content = select_lesson(packs(), body.get("lesson"))
        if game:
            content = {**content, "chains":content["chains"][:3]}
        review = body.get("review")
        if review is not None:
            content, existing = select_review(store, content, "chains", review)
            if existing:
                return view(existing)
        session = {"id": uuid4().hex, "mode": Mode.FLUENCY, "created": time.time(), "phase": "active",
                   "part": content["lesson_id"], "lesson": content, "stage": "full" if review else "chunks",
                   "position": 0, "level": 0, "revision": 0, "last": None, "outcomes": [],
                   "log_ids": [], "reliable_retries": 0, "active_ms": 0, "speech_seconds": 0,
                   "window_seconds": settings.window_seconds, "release_seconds": settings.release_seconds,
                   "rules": asdict(settings.rules)}
        tag(session, game)
        if review:
            session["review_item"] = review["item"]
        store.save(session)
        return view(session)

    async def resume(request):
        return view(store.load(request.match_info["sid"]))

    async def audio(request):
        name = request.match_info["file"]
        if Path(name).name != name or '\\' in name:
            raise web.HTTPNotFound()
        for path, lesson in packs().values():
            if any(name in (row['demo_wav'], row['short_demo_wav']) for row in lesson['chains']):
                return web.FileResponse(path.parent / name)
        raise web.HTTPNotFound()

    async def submit(request):
        session, fresh = current(request)
        if not fresh:
            return view(session)
        stage = session["stage"]
        if session["phase"] != "active" or stage not in ("chunks", "full"):
            raise ValueError("请先进入可录音的步骤")
        sid = session["id"]
        key = uuid5(NAMESPACE_URL, f"daily-speaking/fluency/{sid}/{session['revision']}").hex
        update_clock(session, int(request.query.get("active_ms", "0")))
        busy.add(sid)
        try:
            window = await receive_window(request, session["window_seconds"])
            received = time.time()
            decision = journal.get(Mode.FLUENCY, key) if stage == "full" else None
            if decision is None:
                asr = await app["french_asr"].transcribe_wav(window.wav(), word_evidence=True)
                speech = asr["speech_seconds"]
                intervals = speech_intervals(asr.get("speech_spans", []), received, window.timing()["seconds"])
                if stage == "full":
                    chain = session["lesson"]["chains"][session["position"]]
                    frozen = ModeSettings(True, session["window_seconds"], rule_settings(FluencyRules, session["rules"]),
                                          session["release_seconds"])
                    capped = (request.query.get("capped") == "1"
                              or window.end_sample == session["window_seconds"] * SAMPLE_RATE)
                    verdict, evidence = score(chain, window.timing(), asr, frozen, session["level"] == 2,
                                              capped=capped)
                    evidence.update(session=sid, level=session["level"], content_version=session["lesson"]["version"],
                                    speech_intervals=intervals)
                    decision = journal.append(key, record(Mode.FLUENCY, f'{session["part"]}/{chain["id"]}',
                                                          verdict, evidence))
            else:
                speech = decision["evidence"]["speech_seconds"]
                intervals = decision["evidence"].get("speech_intervals", [])

            session["speech_seconds"] += speech
            session.setdefault("speech_intervals", []).extend(intervals)
            if stage == "chunks":
                session["stage"] = "full"
            else:
                session["stage"] = "feedback"
                session["log_ids"].append(key)
                session["last"] = {"verdict": decision["verdict"], "rule": decision["evidence"]["rule"]}
                if decision["verdict"] == Verdict.RETRY:
                    session["reliable_retries"] += 1
            return save(session)
        finally:
            busy.discard(sid)

    async def advance(request):
        session, fresh = current(request)
        if not fresh:
            return view(session)
        body = await request.json()
        # Reading the small action body yields to possible submissions in a second tab.
        session, fresh = current(request)
        if not fresh:
            return view(session)
        update_clock(session, body.get("active_ms", 0))
        action, stage = body.get("action"), session["stage"]
        if session["phase"] != "active":
            raise ValueError("本轮已经结束")
        if action == "skip_chunks" and stage == "chunks":
            session["stage"] = "full"
            return save(session)
        if stage != "feedback":
            raise ValueError("请先完成录音")
        verdict = session["last"]["verdict"]
        if action == "hint" and verdict != Verdict.PASS and session["level"] < 2:
            session.update(stage="full", level=session["level"] + 1, last=None)
            return save(session)
        if action != "next":
            raise ValueError("无效的练习操作")
        chain = session["lesson"]["chains"][session["position"]]
        due = verdict == Verdict.RELEASE or (verdict != Verdict.PASS and session["reliable_retries"] >= 2)
        at = time.time()
        session["outcomes"].append({"item": chain["id"], **session["last"], "needs_practice": due, "at":at})
        if session.get("game"):
            session["outcomes"][-1].update(retries=session["reliable_retries"], level=session["level"])
        if due or verdict == Verdict.PASS:
            session.setdefault("notebook_outcomes", []).append(note(
                Mode.FLUENCY, chain["id"], verdict, "queued" if due else "cleared", session["last"]["rule"], ts=at))
        session.update(position=session["position"] + 1, stage="chunks",
                       level=0, last=None, reliable_retries=0)
        if session["position"] == len(session["lesson"]["chains"]):
            session.update(phase="ended", stage="report", ended=time.time())
        return save(session)

    async def log(request):
        session = store.load(request.match_info["sid"])
        rows = [journal.get(Mode.FLUENCY, key) for key in session["log_ids"]]
        text = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows if row is not None)
        return web.Response(text=text, content_type="application/x-ndjson",
                            headers={"Content-Disposition": 'attachment; filename="fluency.jsonl"'})

    app.router.add_get(BASE, catalog)
    app.router.add_post(BASE, start)
    app.router.add_get(BASE + "/audio/{file}", audio)
    app.router.add_get(BASE + "/{sid}", resume)
    app.router.add_get(BASE + "/{sid}/log", log)
    app.router.add_post(BASE + r"/{sid}/{rev:\d+}/record", submit)
    app.router.add_post(BASE + r"/{sid}/{rev:\d+}/advance", advance)
