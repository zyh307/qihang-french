"""Canonical decision record and atomic JSONL journal, partitioned by mode."""
from enum import StrEnum
import json
import math
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
import time


class Mode(StrEnum):
    FLUENCY = "fluency"
    SLOT = "slot"
    LECTURE = "lecture"


class Verdict(StrEnum):
    PASS = "pass"
    RETRY = "retry"
    RELEASE = "release"
    UNDETERMINED = "undetermined"


def update_clock(session, milliseconds):
    if type(milliseconds) is not int or milliseconds < 0:
        raise ValueError("练习用时无效")
    session["active_ms"] = max(session["active_ms"], milliseconds)


def record(mode, item, verdict, evidence, *, ts=None):
    mode = Mode(mode)
    if not isinstance(item, str) or not item.strip() or not isinstance(evidence, dict):
        raise ValueError("练习条目和判定证据无效")
    if mode is not Mode.LECTURE:
        keys = {"window", "speech_seconds", "hit_rate", "rule", "thresholds", "metrics"}
        if not keys <= evidence.keys() or not isinstance(evidence["rule"], str) or not evidence["rule"].strip():
            raise ValueError("日常口语判定需保留窗口、阈值和触发规则以供复查")
    ts = time.time() if ts is None else ts
    if type(ts) not in (int, float) or not math.isfinite(ts) or ts < 0:
        raise ValueError("判定时间无效")
    return dict(mode=mode.value, item=item, verdict=Verdict(verdict).value, evidence=evidence, ts=ts)


class PracticeJournal:
    """One immutable JSONL line per attempt (a separate file keeps retries atomic)."""

    def __init__(self, root):
        self.root = Path(root)

    def _path(self, mode, attempt_id):
        if not isinstance(attempt_id, str) or not re.fullmatch(r"[0-9a-f]{32}", attempt_id):
            raise ValueError("无效的练习尝试编号")
        return self.root / Mode(mode).value / (attempt_id + ".jsonl")

    def get(self, mode, attempt_id):
        try:
            return json.loads(self._path(mode, attempt_id).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    def append(self, attempt_id, decision):
        decision = record(**decision)
        final = self._path(decision["mode"], attempt_id)
        folder = final.parent
        folder.mkdir(parents=True, exist_ok=True)
        line = json.dumps(decision, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
        decision = json.loads(line)
        pending = NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=folder,
                                     suffix=".tmp", delete=False)
        temporary = Path(pending.name)
        try:
            with pending:
                pending.write(line)
                pending.flush()
                os.fsync(pending.fileno())
            try:
                os.link(temporary, final)
            except FileExistsError:
                previous = json.loads(final.read_text(encoding="utf-8"))
                if (previous["item"], previous["verdict"], previous["evidence"]) != (
                        decision["item"], decision["verdict"], decision["evidence"]):
                    raise ValueError("尝试编号已用于另一条判定")
                return previous
            return decision
        finally:
            temporary.unlink(missing_ok=True)

    def records(self, mode):
        folder = self.root / Mode(mode).value
        rows = [json.loads(path.read_text(encoding="utf-8")) for path in folder.glob("*.jsonl")]
        return sorted(rows, key=lambda row: row["ts"])
