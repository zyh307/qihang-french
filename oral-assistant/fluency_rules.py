"""Judge only the rhythm of a sufficiently well-recognized fluency chain."""
from dataclasses import asdict

from practice_records import Verdict
from word_alignment import Word, align, tokens, words_in_window

NO_SPEECH_LIMIT = 0.60
TRUNCATION_MARGIN = 0.08


def score(chain, window, asr, settings, assisted=False, *, capped=False):
    rule = settings.rules
    speech = asr["speech_seconds"]
    metrics = {"capped": capped}
    evidence = {
        "window": window, "speech_seconds": speech, "hit_rate": None,
        "thresholds": {**asdict(rule), "release_seconds": settings.release_seconds,
                       "no_speech_limit": NO_SPEECH_LIMIT, "truncation_margin_seconds": TRUNCATION_MARGIN},
        "metrics": metrics,
    }

    def result(verdict, reason):
        return verdict, {**evidence, "rule": reason}

    if assisted:
        if speech >= settings.release_seconds:
            return result(Verdict.RELEASE, "assisted_speech")
        return result(Verdict.UNDETERMINED, "insufficient_assisted_speech")

    limit = window["seconds"]
    spans = asr["speech_spans"]
    tail_active = capped and bool(spans) and spans[-1]["end"] > limit - TRUNCATION_MARGIN
    metrics["tail_activity"] = tail_active
    if speech <= 0 or not spans or not spans[0]["start"] < spans[-1]["end"]:
        return result(Verdict.UNDETERMINED, "voice_timing_unavailable")

    try:
        words = [
            Word(row["text"], row["start"], row["end"], row["probability"])
            for row in asr["words"]
            if asr["segments"][row["segment"]]["no_speech_prob"] < NO_SPEECH_LIMIT
        ]
        inside, crossing = words_in_window(words, 0, limit)
        # Some decoders timestamp a token at a single point. It may help a transcription,
        # but should not anchor a decision about a learner's rhythm.
        inside = tuple(word for word in inside if word.start < word.end)
        match = align(" ".join(chain["groups"]), inside, rule.min_word_probability)
    except (ValueError, TypeError, KeyError, IndexError):
        return result(Verdict.UNDETERMINED, "word_timing_unavailable")

    boundaries = [0, *chain["pause_after_words"], len(match.matches)]
    groups = [
        [word for word in match.matches[left:right] if word.status == "hit"]
        for left, right in zip(boundaries, boundaries[1:])
    ]
    evidence["hit_rate"] = match.coverage
    metrics.update(hits_per_group=[len(group) for group in groups],
                   cross_window_words=[word.text for word in crossing])
    if tail_active:
        final = match.matches[-1]
        if final.status != "hit" or final.word.end > limit - TRUNCATION_MARGIN:
            return result(Verdict.UNDETERMINED, "window_ended_mid_chain")
    if match.coverage < rule.min_coverage or any(len(group) < rule.min_hits_per_group for group in groups):
        return result(Verdict.UNDETERMINED, "insufficient_word_evidence")

    speed = sum(map(len, groups)) * 60 / (spans[-1]["end"] - spans[0]["start"])
    metrics["words_per_minute"] = speed
    anchors = [((hit.word.start + hit.word.end) / 2, index)
               for index, group in enumerate(groups) for hit in group]
    pauses = {"internal": [], "boundary": [], "unlocated": []}
    for pause in asr["pause_spans"]:
        # Timestamps can drift into silence. Only use anchors outside the actual pause.
        left = next((group for center, group in reversed(anchors) if center <= pause["start"]), None)
        right = next((group for center, group in anchors if center >= pause["end"]), None)
        if left is None or right is None:
            pauses["unlocated"].append(pause)
        elif left == right:
            pauses["internal"].append(pause)
        elif left + 1 == right:
            pauses["boundary"].append(pause)
        else:
            pauses["unlocated"].append(pause)

    observed = [(token if word.probability >= rule.min_word_probability else None, i)
                for i, word in enumerate(inside) for token in tokens(word.text)]
    restarts = []
    for i, group in enumerate(groups):
        start = groups[i - 1][-1].heard_index + 1 if i else 0
        stop = groups[i + 1][0].heard_index if i + 1 < len(groups) else len(inside)
        prefix = tokens(chain["groups"][i])[:2]
        section = [token for token, index in observed if start <= index < stop]
        occurrences = sum(section[j:j + len(prefix)] == prefix for j in range(len(section)))
        restarts.append(max(0, occurrences - 1))
    metrics.update(pauses=pauses, restarts_per_group=restarts)

    issues = []
    for kind, threshold in (("internal", rule.max_internal_pause_seconds),
                            ("boundary", rule.max_boundary_pause_seconds)):
        length = max((pause["seconds"] for pause in pauses[kind]), default=0)
        if length > threshold:
            issues.append((length / max(.01, threshold), f"{kind}_pause"))
    if max(restarts) > rule.max_restarts_per_group:
        issues.append(((max(restarts) + 1) / (rule.max_restarts_per_group + 1), "group_restarts"))
    low, high = rule.words_per_minute
    metrics["rate_reference"] = "below" if speed < low else "above" if speed > high else "within"
    if issues:
        return result(Verdict.RETRY, max(issues, key=lambda issue: issue[0])[1])
    if any(pause["seconds"] > rule.max_internal_pause_seconds for pause in pauses["unlocated"]):
        return result(Verdict.UNDETERMINED, "pause_location_unavailable")
    return result(Verdict.PASS, "rhythm_within_limits")
