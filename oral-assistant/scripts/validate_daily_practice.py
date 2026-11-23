"""Validate one local chains.json or frames.json without loading the ASR model."""
import argparse
from collections import Counter
from itertools import accumulate
import json
from pathlib import Path
import re
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from word_alignment import tokens


def require(ok, message):
    if not ok:
        raise ValueError(message)


def text(value):
    require(isinstance(value, str) and value.strip() and not re.search(
        r"\b(?:todo|tbd|placeholder)\b|待填|待补|占位|<[^>]+>|\{[^}]*\}", value, re.I),
        "要求真实、非占位文本")
    return value


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", value), "ID 无效")
    return value


def unique(rows):
    ids = [identifier(row["id"]) for row in rows]
    require(len(set(ids)) == len(ids), "ID 重复")
    return ids


def audio(root, name):
    path = (root / text(name)).resolve()
    require(path.is_relative_to(root) and not Path(name).is_absolute()
            and path.suffix.lower() == ".wav" and path.is_file(), "缺少课包内的本地 WAV")
    with wave.open(str(path), "rb") as wav:
        require((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) ==
                (1, 2, 16_000, "NONE"), "音频需要 16 kHz 单声道 PCM")
        frames = wav.getnframes()
        require(frames > 0 and len(wav.readframes(frames)) == frames * 2, "音频为空或不完整")


def chain(row, root):
    groups = row["groups"]
    require(isinstance(groups, list) and 2 <= len(groups) <= 3, "链需要 2–3 个意群")
    counts = [len(tokens(text(group))) for group in groups]
    require(all(counts) and 9 <= sum(counts) <= 14, "链需要 9–14 个词")
    boundaries = row["pause_after_words"]
    require(isinstance(boundaries, list) and all(type(index) is int for index in boundaries)
            and boundaries == list(accumulate(counts))[:-1], "停顿边界和意群切分不一致")
    short = row["short_groups"]
    require(short == groups[:2], "短版应为前两个意群")
    for name in ("demo_wav", "short_demo_wav"):
        audio(root, row[name])


def frame(row, stage, root):
    template = row["template"]
    require(isinstance(template, str) and template.count("{slot}") == 1, "句框需要一个 {slot}")
    prefix, suffix = template.split("{slot}")
    require(not any(char.isalpha() for char in (prefix[-1:] + suffix[:1]))
            and len(tokens(text(prefix + suffix))) > 0, "固定框架或槽位边界不完整")
    candidates = row["candidates"]
    require(isinstance(candidates, list) and len(candidates) == 2, "每个句框需要两个候选")
    candidate_ids = unique(candidates)
    forms = [tokens(text(candidate["form"])) for candidate in candidates]
    pronunciations = [text(candidate["pronunciation"]).strip() for candidate in candidates]
    require(all(forms) and forms[0] != forms[1] and pronunciations[0] != pronunciations[1],
            "两个形式和发音标注必须有区别")
    for candidate in candidates:
        text(candidate["condition"])
        if "demo_wav" in candidate:
            audio(root, candidate["demo_wav"])
    prompts = row["prompts"]
    require(isinstance(prompts, list) and len(prompts) == 4, "需要 4 张提示卡")
    unique(prompts)
    expected = {prompt["id"]: prompt["target"] for prompt in prompts}
    require(Counter(expected.values()) == {candidate: 2 for candidate in candidate_ids}, "每种候选必须出现两次")
    for prompt in prompts:
        text(prompt["cue"])
    examples = set()
    for example in row["examples"]:
        expected_id = expected[example["prompt"]]
        spoken = example["spoken_candidate"]
        require(spoken in candidate_ids and type(example["accepted"]) is bool
                and example["accepted"] == (expected_id == spoken), "正反例与目标不一致")
        examples.add((expected_id, example["accepted"]))
    require(examples == {(candidate, accepted) for candidate in candidate_ids for accepted in (False, True)},
            "每个候选都需要通过和反例")
    validation = row["validation"]
    status = validation["blind_test"]
    require(status in ("未测", "通过", "淘汰"), "需要真人盲测状态")
    require(type(validation["listened"]) is bool, "需要人工试听标记")
    if validation["asr_hits"] is not None:
        text(validation["asr_hits"])
    require(stage != "demo" or validation["listened"] and status != "淘汰", "Demo 只收已试听且未淘汰的对子")
    require(stage != "formal" or status == "通过" and validation["listened"] and validation["asr_hits"],
            "正式内容需要真人盲测通过及 ASR 试跑记录")


def validate(path, stage="schema"):
    path = Path(path).resolve()
    pack = json.loads(path.read_text(encoding="utf-8"))
    identifier(pack["lesson_id"])
    require(type(pack["version"]) is int and pack["version"] >= 1, "课包版本无效")
    kind = {"chains.json": "chains", "frames.json": "frames"}.get(path.name)
    require(kind, "课包应命名为 chains.json 或 frames.json")
    rows = pack[kind]
    require(isinstance(rows, list) and rows, "课包必须包含条目")
    unique(rows)
    for row in rows:
        try:
            chain(row, path.parent) if kind == "chains" else frame(row, stage, path.parent)
        except (ValueError, KeyError, TypeError, wave.Error, EOFError) as exc:
            raise ValueError(f'{row["id"]}：{exc}') from exc
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packs", nargs="+", type=Path)
    parser.add_argument("--stage", choices=("schema", "demo", "formal"), default="schema")
    args = parser.parse_args()
    for pack in args.packs:
        try:
            print(f"{pack}：{validate(pack, args.stage)} 条通过")
        except (ValueError, KeyError, TypeError, OSError) as exc:
            parser.exit(1, f"{pack}：{exc}\n")


if __name__ == "__main__":
    main()
