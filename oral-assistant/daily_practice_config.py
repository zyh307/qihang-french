"""Offline defaults and local feature flags for the daily speaking modes."""
from dataclasses import dataclass, fields
import json
import math
from pathlib import Path

from practice_records import Mode


@dataclass(frozen=True)
class FluencyRules:
    min_coverage: float = 0.80
    min_word_probability: float = 0.55
    min_hits_per_group: int = 1
    words_per_minute: tuple[float, float] = (55, 145)
    max_internal_pause_seconds: float = 0.75
    max_boundary_pause_seconds: float = 1.20
    max_restarts_per_group: int = 1


@dataclass(frozen=True)
class SlotRules:
    min_frame_coverage: float = 0.70
    min_frame_probability: float = 0.50
    min_target_probability: float = 0.68
    min_opposite_probability: float = 0.75
    min_release_seconds: float = 1.2


@dataclass(frozen=True)
class ModeSettings:
    enabled: bool
    window_seconds: int
    rules: FluencyRules | SlotRules
    release_seconds: float


def rule_settings(cls, overrides):
    if isinstance(overrides, dict):
        # Old desktop settings and saved rounds may still carry the retired gate.
        overrides = {name:value for name, value in overrides.items() if name != "min_speech_seconds"}
    if not isinstance(overrides, dict) or overrides.keys() - {f.name for f in fields(cls)}:
        raise ValueError("日常口语规则名称无效")
    values = {}
    for name, value in overrides.items():
        if name == "words_per_minute":
            if (not isinstance(value, list) or len(value) != 2
                    or not all(type(v) in (int, float) and math.isfinite(v) for v in value)
                    or not 0 < value[0] <= value[1]):
                raise ValueError("语速范围无效")
            value = tuple(value)
        elif (type(value) not in (int, float) or not math.isfinite(value) or value < 0
              or name.endswith(("probability", "coverage")) and value > 1
              or name in ("min_hits_per_group", "max_restarts_per_group") and type(value) is not int
              or name == "min_hits_per_group" and value == 0):
            raise ValueError(f"日常口语规则值无效：{name}")
        values[name] = value
    return cls(**values)


def load_settings(data_dir, *, enabled_by_default=False):
    path = Path(data_dir) / "daily-practice.json"
    units = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    if not isinstance(units, dict) or units.keys() - {Mode.FLUENCY, Mode.SLOT}:
        raise ValueError("日常口语配置需要 fluency 或 slot")
    result = {}
    defaults = ((Mode.FLUENCY, 12, FluencyRules), (Mode.SLOT, 6, SlotRules))
    for mode, seconds, cls in defaults:
        unit = units.get(mode, {})
        if not isinstance(unit, dict) or unit.keys() - {"enabled", "window_seconds", "rules", "release_seconds"}:
            raise ValueError(f"日常口语配置无效：{mode}")
        enabled = unit.get("enabled", enabled_by_default)
        seconds = unit.get("window_seconds", seconds)
        if type(enabled) is not bool or type(seconds) is not int or not 1 <= seconds <= 30:
            raise ValueError(f"日常口语开关或窗口无效：{mode}")
        rules = rule_settings(cls, unit.get("rules", {}))
        if mode is Mode.SLOT and "release_seconds" in unit:
            raise ValueError("换一格的放行秒数请用 rules.min_release_seconds")
        release = unit.get("release_seconds", 1.5) if mode is Mode.FLUENCY else rules.min_release_seconds
        if type(release) not in (int, float) or not 0 < release <= seconds:
            raise ValueError(f"日常口语发声秒数超出窗口：{mode}")
        result[mode] = ModeSettings(enabled, seconds, rules, release)
    return result
