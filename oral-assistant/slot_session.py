"""Persist completed cards immediately and score their isolated audio at group end."""
from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from random import sample
import time
from uuid import NAMESPACE_URL, uuid4, uuid5

from aiohttp import web

from daily_practice_config import ModeSettings, SlotRules, rule_settings
from daily_practice_summary import note, select_review, slot_results, speech_intervals
from game_practice import adventure_request, tag
from daily_content import daily_packs, lesson_choices, select_lesson
from practice_records import Mode, PracticeJournal, Verdict, record, update_clock
from recording_window import RecordingWindow, SAMPLE_BYTES, SAMPLE_RATE, receive_window
from scripts.validate_daily_practice import validate
from slot_rules import score
from store import Store, atomic_json

DEMO_PACK = Path(__file__).parent / ".media/daily-practice/inspire1-u5-l16/frames.json"
BASE = "/api/daily-practice/slot"
LEADING_SAMPLES = 2688
TRAILING_SAMPLES = 3072
MAX_CUE_LEAD_SAMPLES = SAMPLE_RATE // 4
REDECODE_RULES = {"frame_coverage", "slot_anchor", "missing_slot", "low_slot_confidence"}
REDECODE_CONTEXT_SAMPLES = 3840
CONTINUOUS_PADDING = (1600, 2560)
CORROBORATING_SLOT_PROBABILITY = .62


def redecode_window(window, spans, settings, *, continuous):
    """Keep the continuous speech and its quiet edges, with no inserted speech."""
    start, end = 0, len(window.pcm) // SAMPLE_BYTES
    lead, tail = LEADING_SAMPLES, TRAILING_SAMPLES
    if continuous:
        start = max(0, int(spans[0]["start"] * SAMPLE_RATE) - REDECODE_CONTEXT_SAMPLES)
        end = min(end, round(spans[-1]["end"] * SAMPLE_RATE) + REDECODE_CONTEXT_SAMPLES)
        lead, tail = CONTINUOUS_PADDING
    pcm = window.pcm[start * SAMPLE_BYTES:end * SAMPLE_BYTES]
    adjusted = RecordingWindow.select(bytes(lead * SAMPLE_BYTES) + pcm + bytes(tail * SAMPLE_BYTES),
                                      settings.window_seconds + 1)
    timing = {**adjusted.timing(), "start":lead / SAMPLE_RATE, "end":(lead + end - start) / SAMPLE_RATE}
    return adjusted, timing, (lead - start) / SAMPLE_RATE, end * SAMPLE_BYTES == len(window.pcm)


def decode_evidence(profile, decision, asr):
    metrics = decision["metrics"]
    text = " ".join(asr.get("text", "").split())[:160]
    return {"profile":profile, "rule":decision["rule"], "hit_rate":decision["hit_rate"],
            "recognized":text,
            "heard_forms":metrics.get("heard_forms", {}), "frame_words":metrics.get("frame_words", []),
            "slot_probabilities":metrics["slot_probabilities"], "boundary_words":metrics["boundary_words"]}


async def assess(client, frame, target, window, settings, *, assisted, capped, lead_samples=0):
    timing = window.timing()
    if lead_samples:
        timing.update(limit_seconds=settings.window_seconds, pre_cue_seconds=lead_samples / SAMPLE_RATE)
    original = await client.transcribe_wav(window.wav(), word_evidence=True)
    verdict, evidence = score(frame, target, timing, original, settings, assisted=assisted, capped=capped)
    if (assisted or verdict != Verdict.UNDETERMINED or evidence["rule"] not in REDECODE_RULES
            or not evidence["metrics"].get("allow_redecode") or not original["speech_spans"]):
        return verdict, evidence

    # No expected words go to the recognizer. Keep the first measurement and the answer boundary.
    profiles = [decode_evidence("original", evidence, original)]
    evidence["metrics"]["decodes"] = profiles
    evidence["thresholds"]["corroborating_slot_probability"] = CORROBORATING_SLOT_PROBABILITY
    corroborated = profiles[0]["heard_forms"].get(target, 0) >= CORROBORATING_SLOT_PROBABILITY
    strong_initial_slot = profiles[0]["heard_forms"].get(target, 0) >= evidence["thresholds"]["clear_slot_probability"]
    alternate = getattr(client, "transcribe_alternate_wav", None)
    paths = ("padded", "continuous", "alternate") if alternate else ("padded", "continuous")
    for profile in paths:
        continuous = profile != "padded"
        adjusted, answer_window, shift, full_tail = redecode_window(
            window, original["speech_spans"], settings, continuous=continuous)
        try:
            if profile == "alternate":
                second = await alternate(adjusted.wav())
            elif continuous:
                second = await client.transcribe_wav(adjusted.wav(), word_evidence=True, continuous=True)
            else:
                second = await client.transcribe_wav(adjusted.wav(), word_evidence=True)
        except ValueError:
            profiles.append({"profile":profile, "rule":"decoder_unavailable"})
            continue
        leading_silence = answer_window["start"]
        # The ASR may round the first word start into our synthetic prefix. There
        # is no audio from another card there. Discard any word entirely in it.
        second = {**second,
                  "words":[{**word, "start":max(word["start"], leading_silence)}
                           for word in second["words"] if word["end"] > leading_silence],
                  "speech_spans":[{"start":span["start"] + shift, "end":span["end"] + shift}
                                  for span in original["speech_spans"]]}
        check, recovered = score(frame, target, answer_window, second, settings, capped=capped and full_tail)
        diagnostic = decode_evidence(profile, recovered, second)
        profiles.append(diagnostic)
        forms = diagnostic["heard_forms"]
        if (len(forms) > 1 or
                any(p >= settings.rules.min_opposite_probability for key, p in forms.items() if key != target)):
            break
        needed = (settings.rules.min_target_probability if corroborated
                  else recovered["thresholds"]["clear_slot_probability"])
        metrics = recovered["metrics"]
        clear_answer = check == Verdict.PASS and recovered["hit_rate"] == 1
        if clear_answer and profile == "alternate":
            needed = recovered["thresholds"]["clear_slot_probability"]
            # Both models must independently hear a strong slot before admitting
            # a complete answer with extra trailing text from the review.
            clear_answer = metrics["exact_answer"] or (strong_initial_slot and metrics["starts_with_answer"])
        elif clear_answer:
            clear_answer = metrics["exact_answer"]
        if clear_answer and min(metrics["slot_probabilities"]) >= needed:
            recovered.update(window=timing, speech_seconds=evidence["speech_seconds"], speech_spans=original["speech_spans"],
                             rule="target_form_redecoded")
            recovered["thresholds"]["corroborating_slot_probability"] = CORROBORATING_SLOT_PROBABILITY
            metrics.update(answer_end=metrics["answer_end"] - shift, first_rule=evidence["rule"],
                           recovered_by=profile, decodes=profiles, redecode_min_slot_probability=needed)
            return check, recovered
        corroborated |= forms.get(target, 0) >= CORROBORATING_SLOT_PROBABILITY
    return verdict, evidence


def install(app, data_dir, settings, pack_path=DEMO_PACK):
    if not settings.enabled:
        return
    store = Store(Path(data_dir) / "daily-speaking/v1/slot")
    journal = PracticeJournal(store.root / "decisions")
    audition_note = store.root / "audition.json"
    busy = set()

    def packs():
        return daily_packs(pack_path, DEMO_PACK)

    def content(path, lesson):
        raw = path.read_bytes()
        frames = lesson["frames"]
        if not frames or any(frame["validation"]["blind_test"] == "淘汰" for frame in frames):
            raise ValueError("课包没有可用的词形对")
        if len(frames) > 1:
            validate(path, "formal")
        fingerprint = sha256(raw)
        for item in (item for frame in frames for item in frame["candidates"]):
            fingerprint.update((path.parent / item["demo_wav"]).read_bytes())
        return lesson, fingerprint.hexdigest()

    def confirmed(lesson, fingerprint):
        if all(frame["validation"]["listened"] and frame["validation"]["blind_test"] == "通过"
               for frame in lesson["frames"]):
            return True
        try:
            return json.loads(audition_note.read_text(encoding="utf-8"))["fingerprint"] == fingerprint
        except FileNotFoundError:
            return False

    def view(session):
        return web.json_response(session)

    def commit(session, **receipt):
        session["revision"] += 1
        store.save(session)
        return view({**session, **receipt})

    def current(request):
        session = store.load(request.match_info["sid"])
        if session["id"] in busy:
            raise ValueError("这组正在处理，请稍后重试")
        rev = int(request.match_info["rev"])
        if rev > session["revision"]:
            raise ValueError("练习版本无效")
        return session, rev == session["revision"]

    async def catalog(request):
        lessons = packs()
        lesson, fingerprint = content(*select_lesson(lessons, request.query.get('lesson')))
        recent = next((row for row in store.listing(regular=True) if row["part"] == lesson["lesson_id"]), None)
        return web.json_response({"lesson":lesson, "lessons":lesson_choices(lessons), "recent":recent,
                                  "audition_confirmed":confirmed(lesson, fingerprint), "fingerprint":fingerprint})

    async def audition(request):
        body = await request.json()
        path, lesson = select_lesson(packs(), body.get('lesson'))
        lesson, fingerprint = content(path, lesson)
        ids = [item["id"] for item in lesson["frames"][0]["candidates"]]
        if body.get("fingerprint") != fingerprint or body.get("heard") != ids:
            raise ValueError("请先播放并听完两段原声")
        validate(path)
        atomic_json(audition_note, {"fingerprint":fingerprint, "confirmed_at":time.time()})
        return web.json_response({"confirmed":True})

    async def audio(request):
        name = request.match_info["file"]
        if Path(name).name != name or '\\' in name:
            raise web.HTTPNotFound()
        for path, lesson in packs().values():
            if any(name == item['demo_wav'] for frame in lesson['frames'] for item in frame['candidates']):
                return web.FileResponse(path.parent / name)
        raise web.HTTPNotFound()

    def tasks_for(frame):
        return [{"prompt":item, "level":0} for item in sample(frame["prompts"], k=len(frame["prompts"]))]

    async def start(request):
        body = await request.json()
        game, previous = adventure_request(store, body, "slot")
        if previous:
            return view(previous)
        lesson, fingerprint = content(*select_lesson(packs(), body.get('lesson')))
        if not confirmed(lesson, fingerprint):
            raise ValueError("请先确认已听清两段原声")
        if game:
            lesson = {**lesson, "frames":lesson["frames"][:1]}
        review = body.get("review")
        if review is not None:
            lesson, existing = select_review(store, lesson, "frames", review)
            if existing:
                return view(existing)
        frame = lesson["frames"][0]
        session = {"id":uuid4().hex, "mode":Mode.SLOT, "created":time.time(), "phase":"active",
                   "stage":"record", "part":lesson["lesson_id"], "lesson":lesson, "frame":frame,
                   "frame_index":0, "tasks":tasks_for(frame),
                   "clips":[], "rows":[], "log_ids":[], "revision":0, "active_ms":0, "speech_seconds":0,
                   "window_seconds":settings.window_seconds, "rules":asdict(settings.rules)}
        tag(session, game)
        if review:
            session["review_item"] = review["item"]
        store.save(session)
        return view(session)

    async def resume(request):
        return view(store.load(request.match_info["sid"]))

    async def upload(request):
        session, fresh = current(request)
        if not fresh:
            return view(session)
        if session["stage"] != "record":
            raise ValueError("这组已经录完")
        update_clock(session, int(request.query.get("active_ms", "0")))
        sid = session["id"]
        busy.add(sid)
        try:
            lead = int(request.query.get("lead_samples", "0"))
            if not 0 <= lead <= MAX_CUE_LEAD_SAMPLES:
                raise ValueError("提示音的录音缓冲参数无效")
            seconds = session["window_seconds"]
            window = await receive_window(request, seconds + bool(lead))
            received = time.time()
            if not 0 < window.end_sample - lead <= seconds * SAMPLE_RATE:
                raise ValueError("这张卡的答题录音长度无效")
            name = f'capture-{session["revision"]}.pcm'
            path = store.folder(sid) / name
            pending = path.with_suffix(".tmp")
            pending.write_bytes(window.pcm)
            pending.replace(path)
            session["clips"].append({"name":name, "capped":request.query.get("capped") == "1",
                                     "lead_samples":lead, "received_at":received})
            if len(session["clips"]) == len(session["tasks"]):
                session["stage"] = "pending"
            return commit(session, accepted_clip=name)
        finally:
            busy.discard(sid)

    async def grade(request):
        session, fresh = current(request)
        if not fresh:
            return view(session)
        if session["stage"] != "pending":
            raise ValueError("请先录完这一组")
        sid, rev = session["id"], session["revision"]
        keys = [uuid5(NAMESPACE_URL, f"daily-speaking/slot/{sid}/{rev}/{i}").hex
                for i in range(len(session["clips"]))]
        busy.add(sid)
        try:
            decisions = [journal.get(Mode.SLOT, key) for key in keys]
            frame = session["frame"]
            if any(row is None for row in decisions):
                seconds = session["window_seconds"]
                rules = rule_settings(SlotRules, session["rules"])
                frozen = ModeSettings(True, seconds, rules, rules.min_release_seconds)
                for index, (task, clip) in enumerate(zip(session["tasks"], session["clips"])):
                    if decisions[index] is not None:
                        continue
                    lead = clip.get("lead_samples", 0)
                    window = RecordingWindow.select((store.folder(sid) / clip["name"]).read_bytes(),
                                                    seconds + bool(lead))
                    prompt, level = task["prompt"], task["level"]
                    verdict, evidence = await assess(app["french_asr"], frame, prompt["target"], window, frozen,
                                                     assisted=level == 2, capped=clip["capped"], lead_samples=lead)
                    evidence.update(session=sid, prompt=prompt["id"], target=prompt["target"],
                                    frame=frame["id"],
                                    level=level, content_version=session["lesson"]["version"],
                                    supplement=bool(task.get("supplement")))
                    if "received_at" in clip:
                        evidence["speech_intervals"] = speech_intervals(
                            evidence["speech_spans"], clip["received_at"], window.timing()["seconds"])
                    decision = record(Mode.SLOT, f'{session["part"]}/{frame["id"]}', verdict, evidence)
                    decisions[index] = journal.append(keys[index], decision)
            for key, task, result in zip(keys, session["tasks"], decisions):
                evidence = result["evidence"]
                metrics = evidence["metrics"]
                decodes = metrics.get("decodes")
                session["log_ids"].append(key)
                session["speech_seconds"] += evidence["speech_seconds"]
                session.setdefault("speech_intervals", []).extend(evidence.get("speech_intervals", []))
                session["rows"].append({**task, "frame_id":frame["id"], "verdict":result["verdict"], "rule":evidence["rule"],
                                        "spoken":metrics["candidate"],
                                        "recognized":decodes[0].get("recognized") if decodes and
                                        result["verdict"] == Verdict.UNDETERMINED else None,
                                        "speech_seconds":evidence["speech_seconds"],
                                        "required_seconds":evidence["thresholds"].get(
                                            "min_release_seconds" if task["level"] == 2 else "min_speech_seconds")})
            # Advance before expiring draft audio so interrupted group grading remains retryable.
            old_clips = session["clips"]
            session.update(stage="feedback", clips=[])
            response = commit(session)
            for clip in old_clips:
                try:
                    (store.folder(sid) / clip["name"]).unlink(missing_ok=True)
                except OSError:
                    pass
            return response
        finally:
            busy.discard(sid)

    async def advance(request):
        body = await request.json()
        session, fresh = current(request)
        if not fresh:
            return view(session)
        if session["stage"] != "feedback":
            raise ValueError("请先看完组末反馈")
        update_clock(session, body.get("active_ms", 0))
        frame_id = session["frame"]["id"]
        frame_index = session.get("frame_index", 0)
        frames = session["lesson"]["frames"]
        def row_key(row):
            return row.get("frame_id", frame_id), row["prompt"]["id"]

        judged = [row for row in session["rows"] if not row.get("supplement")]
        latest = {row_key(row):row for row in judged}
        due = [row for (key, _), row in latest.items()
               if key == frame_id and row["verdict"] != Verdict.PASS and row["level"] < 2]
        active = session["active_ms"] / 1000
        ratio = min(1, session["speech_seconds"] / active) if active else 0
        action = body.get("action")
        if action == "retry" and due:
            session.update(stage="record", tasks=[{"prompt":row["prompt"], "level":row["level"]+1} for row in due])
        elif action == "supplement" and ratio < .50 and not session.get("supplement_used"):
            prompts = {item["target"]:item for item in session["frame"]["prompts"]}
            session.update(stage="record", supplement_used=True,
                           tasks=[{"prompt":item, "level":2, "supplement":True} for item in prompts.values()])
        elif action == ("finish" if frame_index + 1 == len(frames) else "next_frame"):
            results = slot_results(session)
            result = results[frame_id]
            if result["both"] or result["due"]:
                verdict, status, reason = (Verdict.PASS, "cleared", "target_form") if result["both"] else (
                    result["reason"]["verdict"], "queued", result["reason"]["rule"])
                session.setdefault("notebook_outcomes", []).append(note(Mode.SLOT, frame_id, verdict, status, reason))
            if action == "next_frame":
                frame = frames[frame_index + 1]
                session.update(stage="record", frame=frame, frame_index=frame_index + 1,
                               tasks=tasks_for(frame), supplement_used=False)
            else:
                needs = [key for key, result in results.items() if result["due"] and not result["both"]]
                session.update(phase="ended", stage="report", ended=time.time(),
                               summary={"speech_ratio":ratio, "speech_seconds":session["speech_seconds"],
                                        "effective":ratio >= .50, "needs_practice":bool(needs), "due_frames":needs,
                                        "passes":sum(result["passes"] for result in results.values())})
        else:
            raise ValueError("无效的练习操作")
        return commit(session)

    async def log(request):
        session = store.load(request.match_info["sid"])
        rows = [journal.get(Mode.SLOT, key) for key in session["log_ids"]]
        return web.Response(text="".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows if row),
                            content_type="application/x-ndjson",
                            headers={"Content-Disposition":'attachment; filename="slot.jsonl"'})

    app.router.add_get(BASE, catalog)
    app.router.add_post(BASE, start)
    app.router.add_post(BASE + "/audition", audition)
    app.router.add_get(BASE + "/audio/{file}", audio)
    app.router.add_get(BASE + "/{sid}", resume)
    app.router.add_get(BASE + "/{sid}/log", log)
    for name, handler in (("record", upload), ("grade", grade), ("advance", advance)):
        app.router.add_post(BASE + r"/{sid}/{rev:\d+}/" + name, handler)
