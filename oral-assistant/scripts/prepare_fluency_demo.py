"""Build the local fluency chains from this workstation's existing reading pack."""
import json
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from recording_window import RecordingWindow, SAMPLE_RATE
from scripts.validate_daily_practice import validate
from store import atomic_json
from word_alignment import tokens

SOURCE = "inspire1-u5-l16-p078-integral"
PACK = ROOT / ".media/daily-practice/inspire1-u5-l16"
# Split points in the existing text and end times of the second group in each source clip.
SPLITS = {
    "s13": ("Je me douche", "et je me couche", 2.14),
    "s21": ("je m’habille", "et je vais", 1.90),
    "s24": ("le lundi", "et le jeudi", 2.26),
    "s3": ("le soir,", "elle commence", 2.30),
    "s22": ("pour des activités", "de loisirs", 2.31),
    "s27": ("c’est tranquille", "Je fais de la danse", 3.22),
}
# End the last excerpt after the complete activity phrase, before the interrupted continuation.
TRIMMED_END = {"s27": (" et...", 4.78)}


def build():
    library = ROOT / ".media/lecture"
    source = json.loads((library / (SOURCE + ".json")).read_text(encoding="utf-8"))
    order = {row["id"]: row for row in source["sentences"]}
    PACK.mkdir(parents=True, exist_ok=True)
    rows = []
    with wave.open(str(library / "078.wav"), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise ValueError("Piste 78 需要 16 kHz 单声道 PCM")
        for key, (second, third, short_end) in SPLITS.items():
            row = order[key]
            first_split, second_split = row["fr"].index(second), row["fr"].index(third)
            groups = [part.strip() for part in (
                row["fr"][:first_split], row["fr"][first_split:second_split], row["fr"][second_split:],
            )]
            starts = round(row["start"] * SAMPLE_RATE)
            full_end = row["end"]
            if key in TRIMMED_END:
                tail, duration = TRIMMED_END[key]
                if not groups[-1].endswith(tail):
                    raise ValueError("节奏链截取与现有原文不一致")
                groups[-1] = groups[-1].removesuffix(tail) + "."
                full_end = round(row["start"] + duration, 3)
            stops = round(full_end * SAMPLE_RATE)
            for suffix, end in (("full", stops), ("short", starts + round(short_end * SAMPLE_RATE))):
                wav.setpos(starts)
                pcm = wav.readframes(end - starts)
                if len(pcm) != (end - starts) * 2:
                    raise ValueError("Piste 78 切片超出源音频")
                (PACK / f"{key}-{suffix}.wav").write_bytes(RecordingWindow.select(pcm, 12).wav())
            rows.append({"id": key, "groups": groups, "short_groups": groups[:2],
                         "pause_after_words": [len(tokens(" ".join(groups[:i]))) for i in (1, 2)],
                         "demo_wav": f"{key}-full.wav", "short_demo_wav": f"{key}-short.wav",
                         "source": {"id": SOURCE, "sentence": key, "start": row["start"],
                                    "end": full_end, "short_end": round(row["start"] + short_end, 3)}})
    manifest = PACK / "chains.json"
    atomic_json(manifest, {"lesson_id": "inspire1-u5-l16", "version": 2, "title": source["title"],
                           "label": "Inspire 1 · 第 16 课 · Piste 78", "chains": rows})
    print(f"{validate(manifest, 'demo')} 条节奏链：{manifest}")


if __name__ == "__main__":
    build()
