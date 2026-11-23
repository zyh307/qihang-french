"""Offline textbook speaking tasks. All writable files live under unit-practice/v1."""
import asyncio
import json
from pathlib import Path
import re
import time
from uuid import uuid4
import wave

from aiohttp import web
from flow import normalized
from store import Store

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 60 * 16000 * 2


def words(text):
    return " " + " ".join(re.findall(r"[a-z0-9œ]+", normalized(text))) + " "


def feedback(card, text):
    utterance = words(text)
    hit, missing = [], []
    for label, forms in card["criteria"]:
        matched = any(words(form) in utterance for form in forms)
        (hit if matched else missing).append(label)
    return {"status": "pass" if not missing else "borderline" if hit else "retry",
            "hit": hit, "missing": missing, "model": card["model"]}


def install(app, data_dir):
    storage = Store(Path(data_dir)/"unit-practice/v1")
    running = set()

    def packs():
        return {p.stem: json.loads(p.read_text(encoding="utf8"))
                for p in sorted((ROOT/"units").glob("*.json"))}

    async def catalog(request):
        return web.json_response({"units": list(packs().values()), "history": storage.listing()})

    async def start(request):
        unit = (await request.json()).get("unit")
        pack = packs().get(unit)
        if pack is None:
            raise ValueError("未知单元")
        session = {"schema": 1, "id": uuid4().hex, "created": time.time(), "part": unit,
                   "mode": "unit", "phase": "practice", "cards": pack["cards"], "retell": pack["retell"],
                   "rows": [], "previous_attempts": []}
        storage.save(session)
        return web.json_response(session)

    async def read(request):
        return web.json_response(storage.load(request.match_info["sid"]))

    def current(request):
        session = storage.load(request.match_info["sid"])
        for card in session["cards"]:
            if card["id"] == request.match_info["card"]:
                return session, card
        raise ValueError("未知任务卡")

    def pending(session, card):
        index = len(session["rows"])
        if index >= len(session["cards"]) or session["cards"][index]["id"] != card["id"]:
            raise ValueError("任务卡进度已变化，请重新打开记录")

    async def recognize(request):
        session, card = current(request)
        pending(session, card)
        sid = session["id"]
        if sid in running:
            raise ValueError("此轮正在识别")
        running.add(sid)
        try:
            # Stream with a route-specific cap; retain the exam API's 64 KiB limit.
            pcm = bytearray()
            async for chunk in request.content.iter_chunked(16384):
                pcm.extend(chunk)
                if len(pcm) > MAX_BYTES:
                    raise ValueError("每张卡最多录一分钟")
            if len(pcm) < 3200 or len(pcm) % 2:
                raise ValueError("录音为空或不完整")
            ref = uuid4().hex + ".wav"
            path = storage.folder(sid)/ref
            with wave.open(str(path), "wb") as wav:
                wav.setparams((1, 2, 16000, 0, "NONE", ""))
                wav.writeframes(pcm)
            draft = {"card": card["id"], "audio": ref, "seconds": len(pcm)/32000,
                     "text": "", "uncertain": True}
            if session.get("draft"):
                session.setdefault("previous_attempts", []).append(session["draft"])
            session["draft"] = draft
            storage.save(session)
            try:
                result = await app["french_asr"].transcribe(path)
            except (ValueError, asyncio.TimeoutError) as error:
                draft["error"] = str(error) or "识别超时"
            else:
                segments = result.get("segments") or []
                draft["text"] = result["text"]
                draft["uncertain"] = not segments or not result["text"].strip() or any(
                    s.get("avg_logprob", -2) < -1 or s.get("no_speech_prob", 1) > .6 for s in segments)
                draft["speech_seconds"] = sum(max(0, s["end"]-s["start"]) for s in segments)
            storage.save(session)
            return web.json_response(draft)
        finally:
            running.discard(sid)

    async def audio(request):
        session = storage.load(request.match_info["sid"])
        name = request.match_info["name"]
        if not re.fullmatch(r"[0-9a-f]{32}\.wav", name):
            raise web.HTTPNotFound()
        return web.FileResponse(storage.folder(session["id"])/name)

    async def confirm(request):
        body = await request.json()
        session, card = current(request)
        pending(session, card)
        draft = session.get("draft", {})
        if session["id"] in running or draft.get("card") != card["id"] or draft.get("audio") != body.get("audio"):
            raise ValueError("请先完成本卡录音")
        text = body.get("text")
        if not isinstance(text, str) or not 0 < len(text.strip()) <= 1500:
            raise ValueError("请确认你实际说的话")
        session["rows"].append({**draft, "confirmed": text.strip(), **feedback(card, text)})
        session.pop("draft")
        if len(session["rows"]) == len(session["cards"]):
            session.update(phase="ended", ended=time.time())
        storage.save(session)
        return web.json_response(session)

    async def repeat(request):
        body = await request.json()
        session, card = current(request)
        previous = session["rows"][-1] if session["rows"] else {}
        if (session["id"] in running or session.get("draft") or
                previous.get("card") != card["id"] or previous.get("audio") != body.get("audio")):
            raise ValueError("任务进度已变化，请重新打开记录")
        session.setdefault("previous_attempts", []).append(session["rows"].pop())
        session.pop("ended", None)
        session["phase"] = "practice"
        storage.save(session)
        return web.json_response(session)

    prefix = "/api/unit-practice"
    app.router.add_get(prefix, catalog)
    app.router.add_post(prefix, start)
    app.router.add_get(prefix+"/{sid}", read)
    app.router.add_get(prefix+"/{sid}/audio/{name}", audio)
    app.router.add_post(prefix+"/{sid}/{card}/record", recognize)
    app.router.add_post(prefix+"/{sid}/{card}/confirm", confirm)
    app.router.add_post(prefix+"/{sid}/{card}/repeat", repeat)
