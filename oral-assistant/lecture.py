"""Local Piste playback, reading attempts, review queue and recording archive."""
import asyncio
from collections import Counter
import io
import json
import re
import time
from pathlib import Path
from tempfile import SpooledTemporaryFile
from uuid import uuid4
import wave
from zipfile import ZipFile, ZIP_DEFLATED

from aiohttp import web
from lecture_alignment import compare
import lecture_desktop
import guided_reading
import reading_library
from store import Store

MEDIA = Path(__file__).parent/".media/lecture"


def pcm_wav(data):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setparams((1,2,16000,0,"NONE",""))
        out.writeframes(data)
    return buffer.getvalue()


def read_pack(path):
    p = json.loads(path.read_text(encoding="utf-8"))
    if p["id"] != path.stem or not re.fullmatch(r"[a-z0-9-]+", p["id"]):
        raise ValueError("课文编号与文件名不一致")
    ids = set()
    for s in p["sentences"]:
        if (not re.fullmatch(r"[a-z0-9-]+", s["id"]) or s["id"] in ids or s["id"] == "full"
                or type(s["piste"]) is not int or not 0 <= s["start"] < s["end"]
                or s["end"]-s["start"] > 60 or not s["fr"].strip()):
            raise ValueError("课文句号、时间或文本无效")
        ids.add(s["id"])
    if not ids or any(s["piste"] != p["piste"] for s in p["sentences"]):
        raise ValueError("每篇课文需对应一条完整音轨")
    return p


def catalog(media, playable=False):
    packs = {}
    for path in sorted(media.glob("*.json")):
        try:
            p = read_pack(path)
            if playable:
                p["contentRevision"] = reading_library.revision(p, media)
        except (OSError, ValueError, KeyError, TypeError, EOFError, wave.Error):
            if playable:
                continue
            raise
        packs[p["id"]] = p
    return packs


def report(s):
    if s.get("layout") == "guided":
        return guided_reading.report(s)
    if s.get("layout") == "desktop":
        return lecture_desktop.summary(s)
    latest = {}
    for a in s["attempts"]:
        if a["result"]["status"] != "uncertain":
            latest[a["step"]] = a["result"]
    missing = Counter(e["ref"] for a in s["attempts"] if a["step"] != "full"
                      for e in a["result"]["edits"] if e["op"] == "missing")
    ids = [line["id"] for line in s["text"]["sentences"]]
    attempted = {a["step"] for a in s["attempts"]} & set(ids)
    return {"recorded":len(attempted), "scores":latest, "missing":missing.most_common(5),
            "wrong":[k for k in ids if latest.get(k,{}).get("status") in ("retry","border")],
            "ungraded":[k for k in ids if k not in latest]}


def install(app, data_dir, media=MEDIA):
    store = Store(Path(data_dir)/"lecture/v1")
    busy = set()
    def result(s):
        return web.json_response({**s, "report":report(s)})

    async def menu(req):
        if req.query.get("layout") == "guided":
            packs = catalog(media, playable=True)
            return web.json_response({"texts":list(packs.values()), **reading_library.index(store, packs)})
        mode = "lecture-desktop" if req.query.get("layout") == "desktop" else "lecture"
        return web.json_response({"texts":list(catalog(media).values()),
                                  "history":[s for s in store.listing() if s["mode"] == mode]})

    async def start(req):
        body = await req.json()
        packs = catalog(media, playable=body.get("layout") == "guided")
        pack = packs.get(body.get("text"))
        if not pack:
            raise ValueError("找不到课文资料")
        session = {"schema":1,"id":uuid4().hex,"created":time.time(),"phase":"listen","mode":"lecture",
                   "part":pack["id"],"text":pack,"queue":[x["id"] for x in pack["sentences"]],
                   "attempts":[],"skipped":[],"revision":0}
        if body.get("review"):
            previous = store.load(body["review"])
            if previous["part"] != pack["id"] or not report(previous)["wrong"]:
                raise ValueError("本课暂无待重读句子")
            session.update(text=previous["text"],queue=report(previous)["wrong"],phase="review")
        if body.get("layout") == "guided":
            due = [r["sentenceId"] for r in reading_library.index(store, packs)["reviewQueue"]
                   if r["textId"] == pack["id"]] if body.get("warmup") else []
            if body.get("warmup") and not due:
                raise ValueError("本课没有待巩固句子")
            if body.get("steps") is not None:
                steps = body["steps"]
                if not isinstance(steps, list) or not steps or any(k not in due for k in steps):
                    raise ValueError("复习清单已更新，请重新打开")
                due = list(dict.fromkeys(steps))
            session["origin"] = "notebook" if due else "lesson"
            guided_reading.start(session,due)
        if body.get("layout") == "desktop":
            if body.get("review"):
                raise ValueError("请从本轮报告进入精练")
            session.update(layout="desktop",mode="lecture-desktop",phase="lines")
        store.save(session)
        return result(session)

    async def read(req):
        return result(store.load(req.match_info["sid"]))

    def current(req, reopen=False, abandon=False):
        s = store.load(req.match_info["sid"])
        if ((s["id"] in busy and not (abandon and s.get("layout") == "guided")) or
                str(s["revision"]) != req.match_info["rev"] or
                s["phase"] == "ended" and not (
                    reopen == "full" and s.get("layout") == "guided" or
                    reopen == "drill" and s.get("layout") == "desktop")):
            raise ValueError("进度已更新，请重新打开本轮")
        return s

    def save(s):
        s["revision"] += 1
        store.save(s)
        return result(s)

    async def advance(req):
        body = await req.json()
        action = body.get("action")
        s = current(req, reopen=action, abandon=action=="timeout")
        if s.get("layout") == "guided":
            guided_reading.advance(s,action)
            return save(s)
        if s.get("layout") == "desktop":
            lecture_desktop.advance(s, action, body.get("step"))
            return save(s)
        if s["phase"] == "listen":
            s["phase"] = "lines"
        else:
            step = s["queue"][0]
            if action == "skip":
                s["skipped"].append({"phase":s["phase"],"step":step})
            elif action != "next" or not any(a["revision"] == s["revision"] and
                    a["result"]["status"] != "uncertain" for a in s["attempts"]):
                raise ValueError("请先跟读，或点击跳过")
            s["queue"].pop(0)
            if not s["queue"] and s["phase"] == "lines":
                s["phase"],s["queue"] = "review",report(s)["wrong"]
            if not s["queue"] and s["phase"] == "review":
                s["phase"],s["queue"] = "full",["full"]
            elif not s["queue"] and s["phase"] == "full":
                s.update(phase="ended",ended=time.time())
        return save(s)

    async def record(req):
        saved = store.load(req.match_info["sid"])
        attempt_id = req.query.get("attempt","")
        if saved.get("layout") == "guided":
            if not re.fullmatch(r"[0-9a-f-]{32,36}",attempt_id):
                raise ValueError("录音编号无效")
            if any(a["attemptId"] == attempt_id for a in saved["attempts"]):
                return result(saved)
        s = current(req)
        if not s["queue"] or s["phase"] not in ("lines", "review", "full"):
            raise ValueError("请先进入本句朗读")
        key = s["queue"][0]
        lines = s["text"]["sentences"]
        line = next((x for x in lines if x["id"] == key),None)
        if key == "full":
            line = {"fr":" ".join(x["fr"] for x in lines)}
        busy.add(s["id"])
        try:
            pcm = bytearray()
            async for chunk in req.content.iter_chunked(16384):
                pcm.extend(chunk)
                if len(pcm) > (180 if key == "full" else 60)*32000:
                    raise ValueError("录音超长")
            if len(pcm) < 3200 or len(pcm)%2:
                raise ValueError("录音不完整，请再读一次")
            path = store.folder(s["id"])/(uuid4().hex+".wav")
            path.write_bytes(pcm_wav(pcm))
            try:
                asr = await app["french_asr"].transcribe(path)
                if s.get("layout") in ("desktop","guided"):
                    prior = next((a["result"] for a in reversed(s["attempts"]) if a["step"] == key), None)
                    feedback = lecture_desktop.evaluate(line, asr, prior)
                else:
                    feedback = compare(line,asr)
            except (ValueError,asyncio.TimeoutError) as exc:
                asr = {"text":"","error":str(exc)}
                feedback = compare(line,{})
            row = {"step":key,"phase":s["phase"],"revision":s["revision"]+1,"at":time.time(),
                                  "audio":path.name,"seconds":len(pcm)/32000,"heard":asr["text"],
                                  "error":asr.get("error"),"result":feedback}
            if s.get("layout") == "guided":
                latest = store.load(s["id"])
                if latest["revision"] != s["revision"]:
                    path.unlink(missing_ok=True)
                    return result(latest)
                guided_reading.record(s,row,attempt_id)
            else:
                s["attempts"].append(row)
            return save(s)
        finally:
            busy.discard(s["id"])

    async def clip(req):
        s = store.load(req.match_info["sid"])
        lines = s["text"]["sentences"]
        key = req.match_info["step"]
        selected = lines if key == "full" else [x for x in lines if x["id"] == key]
        if not selected:
            raise web.HTTPNotFound()
        path = media/("%03d.wav" % selected[0]["piste"])
        if not path.is_file():
            raise ValueError("缺少本机教材音轨 "+path.name)
        with wave.open(str(path),"rb") as src:
            if (src.getframerate(),src.getnchannels(),src.getsampwidth()) != (16000,1,2):
                raise ValueError("教材音轨须为16 kHz单声道 PCM16 WAV")
            first,last = int(16000*selected[0]["start"]),int(16000*selected[-1]["end"])
            if last > src.getnframes():
                raise ValueError("句尾越过音轨末尾")
            src.setpos(first)
            return web.Response(body=pcm_wav(src.readframes(last-first)),content_type="audio/wav")

    async def export(req):
        s = store.load(req.match_info["sid"])
        archive = io.BytesIO()
        with ZipFile(archive,"w",ZIP_DEFLATED) as z:
            z.writestr("lecture.json",json.dumps(s,ensure_ascii=False))
            for a in s["attempts"]:
                z.write(store.folder(s["id"])/a["audio"],a["audio"])
        return web.Response(body=archive.getvalue(),content_type="application/zip",
                            headers={"Content-Disposition":'attachment; filename="lecture-'+s["id"]+'.zip"'})

    def build_backup():
        archive = SpooledTemporaryFile(max_size=2**20)
        try:
            packs = catalog(media, playable=True)
            with ZipFile(archive, "w", ZIP_DEFLATED) as z:
                library = reading_library.index(store, packs)
                z.writestr("reading-index.json", json.dumps({"schema":1, **library}, ensure_ascii=False))
                for path in store.sessions.glob("*/session.json"):
                    raw = path.read_bytes()
                    record = json.loads(raw)
                    if record.get("layout") != "guided":
                        continue
                    folder = store.folder(record["id"])
                    prefix = "lecture/v1/sessions/" + record["id"] + "/"
                    z.writestr(prefix + "session.json", raw)
                    for name in {a.get("audio", "") for a in record["attempts"]}:
                        if re.fullmatch(r"[0-9a-f]{32}[.]wav", name) and (folder/name).is_file():
                            z.write(folder/name, prefix + name)
            archive.seek(0)
            return archive
        except BaseException:
            archive.close()
            raise

    async def library_backup(req):
        archive = await asyncio.to_thread(build_backup)
        async def chunks():
            with archive:
                while data := archive.read(256*1024):
                    yield data
        return web.Response(body=chunks(), content_type="application/zip",
                            headers={"Content-Disposition":'attachment; filename="lecture-library.zip"'})

    base = "/api/lecture"
    app.router.add_get(base,menu)
    app.router.add_post(base,start)
    app.router.add_get(base+"/library/backup",library_backup)
    app.router.add_get(base+"/{sid}",read)
    app.router.add_get(base+"/{sid}/clip/{step}",clip)
    app.router.add_get(base+"/{sid}/export",export)
    app.router.add_post(base+"/{sid}/{rev}/advance",advance)
    app.router.add_post(base+"/{sid}/{rev}/record",record)
