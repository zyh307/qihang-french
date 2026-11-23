"""Prepare the slot exercises from the existing Piste 78 recording."""
import json
from collections import Counter
from array import array
from hashlib import sha256
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from recording_window import RecordingWindow, SAMPLE_RATE
from scripts.validate_daily_practice import validate
from store import atomic_json

SOURCE = "inspire1-u5-l16-p078-integral"
PACK = ROOT / ".media/daily-practice/inspire1-u5-l16"
BLIND_RESULT = ROOT / "content/daily-practice/inspire1-u5-l16/盲测20261122.json"


def validation():
    evidence = {"listened":False, "blind_test":"未测",
                "asr_hits":"本机 Whisper 原声单段复识 2/2，最近四卡浏览器回归 4/4。"}
    if not BLIND_RESULT.is_file():
        return evidence
    raw = BLIND_RESULT.read_bytes()
    result = json.loads(raw)
    expected = {"01":"du", "02":"de la"}
    answers = result["answers"]
    if (result["test"] != "inspire1-u5-l16-p78-articles-v1"
            or Counter(row["clip"] for row in answers) != {"01":2, "02":2}
            or any(row["heard"] != expected[row["clip"]] for row in answers)
            or result["correct"] != len(answers)):
        raise ValueError("真人盲测记录与当前词形对不一致")
    evidence.update(listened=True, blind_test="通过", blind_result_sha256=sha256(raw).hexdigest())
    return evidence


def cut(wav, start, end):
    begin, finish = round(start * SAMPLE_RATE), round(end * SAMPLE_RATE)
    wav.setpos(begin)
    pcm = wav.readframes(finish - begin)
    if len(pcm) != (finish - begin) * 2:
        raise ValueError("试点源音频不完整")
    return pcm


def faded(pcm):
    samples = array("h", pcm)
    for index in range(64):
        samples[index] = round(samples[index] * index / 63)
        samples[-1 - index] = round(samples[-1 - index] * index / 63)
    return samples.tobytes()


def examples_for(prompts, candidates):
    return [
        {"prompt":prompt["id"], "spoken_candidate":candidate["id"],
         "accepted":prompt["target"] == candidate["id"]}
        for prompt in prompts[:2] for candidate in candidates
    ]


def practice_frames(wav, rows, candidates, tested):
    source = rows["s24"]
    specs = (
        ("lundi", "Le lundi, je fais {slot}.", "le lundi", (1.66, 2.35), True,
         ("说你周一做运动。", "说你周一做力量训练。", "周一是运动日。", "周一安排了力量训练。")),
        ("jeudi", "Je fais {slot} le jeudi après-midi.", "le jeudi après-midi", (2.62, 3.95), False,
         ("说你周四下午做运动。", "说你周四下午做力量训练。", "周四下午有运动安排。", "周四下午安排了力量训练。")),
    )
    for key, template, phrase, window, leading, cues in specs:
        begin, end = (round(source["start"] + offset, 3) for offset in window)
        if phrase not in source["fr"] or not source["start"] <= begin < end <= source["end"]:
            raise ValueError("练习句时间词组不在教材原声范围内")
        modifier = faded(cut(wav, begin, end))
        options = []
        for candidate in candidates:
            original = candidate["source"]
            start_trim, end_trim = (.30, 1.47) if candidate["id"] == "sport" else (.12, 1.55 if leading else 1.46)
            start = round(original["start"] + start_trim, 3)
            stop = min(original["end"], round(original["start"] + end_trim, 3))
            activity = faded(cut(wav, start, stop))
            left, right = (modifier, activity) if leading else (activity, modifier)
            gap = bytes(1920 if leading else 960)
            audio = bytes(7200) + left + gap + right + bytes(6400)
            name = f'slot-{key}-{candidate["id"]}.wav'
            (PACK / name).write_bytes(RecordingWindow.select(audio, 6).wav())
            options.append({**candidate, "demo_wav":name, "source":{"id":SOURCE, "sentence":original["sentence"],
                "start":start, "end":stop, "time_phrase":{"sentence":"s24", "start":begin, "end":end}}})
        prompts = [{"id":f"{key}-{i}", "target":candidate["id"], "cue":cue}
                   for i, (candidate, cue) in enumerate(zip(candidates * 2, cues), 1)]
        yield {"id":f"faire-{key}", "template":template, "candidates":options, "prompts":prompts,
               "examples":examples_for(prompts, options), "validation":tested,
               "source_note":"练习句 · 用第 16 课 Piste 78 的活动说法和时间词组编排，示范由原声片段合成。"}


def build():
    library = ROOT / ".media/lecture"
    source = json.loads((library / (SOURCE + ".json")).read_text(encoding="utf-8"))
    rows = {row["id"]: row for row in source["sentences"]}
    PACK.mkdir(parents=True, exist_ok=True)
    candidates = []
    specs = (
        ("sport", "s23", "du sport", "/dy spɔʁ/", "做运动", 85.73, 87.42),
        ("muscu", "s25", "de la muscu", "/də la mysky/", "做力量训练", 91.47, 93.02),
    )
    with wave.open(str(library / "078.wav"), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise ValueError("Piste 78 需要 16 kHz 单声道 PCM")
        for cid, line, form, phonetics, condition, start, end in specs:
            row = rows[line]
            if f"Je fais {form}" not in row["fr"] or not row["start"] <= start < end <= row["end"]:
                raise ValueError("试点与现有原文或切片不一致")
            pcm = cut(wav, start, end)
            file = f"slot-{cid}.wav"
            (PACK / file).write_bytes(RecordingWindow.select(pcm, 6).wav())
            candidates.append({"id":cid, "form":form, "pronunciation":phonetics, "condition":condition,
                               "demo_wav":file, "source":{"id":SOURCE, "sentence":line, "start":start, "end":end}})
    prompts = [
        {"id":"sport-1","target":"sport","cue":"你平时做运动。"},
        {"id":"muscu-1","target":"muscu","cue":"你平时做力量训练。"},
        {"id":"sport-2","target":"sport","cue":"说你有运动习惯。"},
        {"id":"muscu-2","target":"muscu","cue":"说你会做力量训练。"},
    ]
    tested = validation()
    frame = {"id":"faire-activite", "template":"Je fais {slot}.", "candidates":candidates,
             "prompts":prompts, "examples":examples_for(prompts, candidates), "validation":tested,
             "source_note":"教材原声 · Inspire 1 第 16 课 Piste 78。"}
    frames = [frame]
    if tested["blind_test"] == "通过":
        with wave.open(str(library / "078.wav"), "rb") as wav:
            frames.extend(practice_frames(wav, rows, candidates, tested))
    manifest = PACK / "frames.json"
    atomic_json(manifest, {"lesson_id":"inspire1-u5-l16", "version":2 if len(frames) > 1 else 1,
                           "title":{"zh":"日常运动"}, "label":"Inspire 1 · 第 16 课 · Piste 78", "frames":frames})
    print(f"{validate(manifest, 'formal' if len(frames) > 1 else 'schema')} 个句框：{manifest}")


if __name__ == "__main__":
    build()
