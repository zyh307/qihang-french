"""Decide only an acoustically supported form in its expected slot."""
from dataclasses import asdict

from practice_records import Verdict
from word_alignment import Word, align, tokens, words_in_window

NO_SPEECH_LIMIT = .60
TRUNCATION_MARGIN = .08
CLEAR_SLOT_PROBABILITY = .85
WEAK_FRAME_PROBABILITY = .20
# Silero reports speech boundaries in 512-sample steps at 16 kHz.
VAD_STEP_SECONDS = .032
HESITATIONS = {"euh", "heu"}


def score(frame, target, window, asr, settings, *, assisted=False, capped=False):
    start, end = window["start"], window["end"]
    speech = sum(max(0, min(end, span["end"]) - max(start, span["start"])) for span in asr["speech_spans"])
    rule = settings.rules
    metrics = {"candidate": None, "slot_probabilities": [], "boundary_words": []}
    evidence = {"window":window, "speech_seconds":speech, "speech_spans":asr["speech_spans"], "hit_rate":None,
                "thresholds":{**asdict(rule), "no_speech_limit":NO_SPEECH_LIMIT,
                              "clear_slot_probability":CLEAR_SLOT_PROBABILITY,
                              "weak_frame_probability":WEAK_FRAME_PROBABILITY,
                              "vad_step_seconds":VAD_STEP_SECONDS},
                "metrics":metrics}

    def result(verdict, reason):
        return verdict, {**evidence, "rule":reason}

    if assisted:
        if speech >= rule.min_release_seconds:
            return result(Verdict.RELEASE, "assisted_speech")
        if speech < rule.min_release_seconds - VAD_STEP_SECONDS:
            return result(Verdict.UNDETERMINED, "insufficient_assisted_speech")
    elif speech <= 0:
        return result(Verdict.UNDETERMINED, "voice_timing_unavailable")
    tail_active = capped and any(end - TRUNCATION_MARGIN < span["end"] and span["start"] < end
                                 for span in asr["speech_spans"])
    metrics["tail_activity"] = tail_active
    try:
        words = [Word(word["text"], word["start"], word["end"], word["probability"])
                 for word in asr["words"]
                 if asr["segments"][word["segment"]]["no_speech_prob"] < NO_SPEECH_LIMIT]
        inside, crossing = words_in_window(words, start, end)
        inside = tuple(word for word in inside if word.start < word.end)
        metrics["boundary_words"] = [word.text for word in crossing]
        if crossing:
            return result(Verdict.UNDETERMINED, "cross_window")
        before, after = frame["template"].split("{slot}")
        prefix_count = len(tokens(before))
        aligned = align(" ".join((before, after)), inside, rule.min_frame_probability)
    except (ValueError, TypeError, KeyError, IndexError):
        return result(Verdict.UNDETERMINED, "word_timing_unavailable")

    evidence["hit_rate"] = aligned.coverage
    heard = [(token, word.probability) for word in inside for token in tokens(word.text)
             if token not in HESITATIONS]
    all_terms = [word for word, _ in heard]
    bare_slot, heard_forms = False, {}
    for form in frame["candidates"]:
        terms = tokens(form["form"])
        bare_slot |= bool(prefix_count and all_terms[:len(terms)] == terms)
        matches = [min(p for _, p in heard[i:i + len(terms)])
                   for i in range(len(heard) - len(terms) + 1) if all_terms[i:i + len(terms)] == terms]
        if matches:
            heard_forms[form["id"]] = max(matches)
    metrics["heard_forms"] = heard_forms
    metrics["allow_redecode"] = (not bare_slot and len(heard_forms) < 2
                                 and not any(p >= rule.min_opposite_probability
                                             for key, p in heard_forms.items() if key != target))
    metrics["frame_words"] = [{"expected": match.target, "state": match.status,
                               "probability": match.word.probability if match.word else None}
                              for match in aligned.matches]
    weak_frame = aligned.coverage < rule.min_frame_coverage
    if weak_frame and not all(match.word and match.word.probability >= WEAK_FRAME_PROBABILITY
                              for match in aligned.matches):
        return result(Verdict.UNDETERMINED, "frame_coverage")
    left_index, right_index = 0, len(inside)
    if prefix_count:
        anchor = aligned.matches[prefix_count - 1]
        if anchor.status != "hit":
            return result(Verdict.UNDETERMINED, "slot_anchor")
        left_index = anchor.heard_index + 1
    if prefix_count < len(aligned.matches):
        anchor = aligned.matches[prefix_count]
        if anchor.status != "hit":
            return result(Verdict.UNDETERMINED, "slot_anchor")
        right_index = anchor.heard_index

    observed = [(token, word) for word in inside[left_index:right_index]
                for token in tokens(word.text)]
    while observed and observed[0][0] in HESITATIONS:
        observed = observed[1:]
    terms = [token for token, _ in observed]
    full, at_slot = set(), []
    for candidate in frame["candidates"]:
        expected = tokens(candidate["form"])
        for i in range(len(terms) - len(expected) + 1):
            if terms[i:i + len(expected)] == expected:
                full.add(candidate["id"])
                if i == 0:
                    at_slot.append((candidate, [word for _, word in observed[:len(expected)]]))
    if len(full) > 1:
        return result(Verdict.UNDETERMINED, "competing_forms")
    if len(at_slot) != 1:
        return result(Verdict.UNDETERMINED, "missing_slot")
    candidate, slot_words = at_slot[0]
    probabilities = [word.probability for word in slot_words]
    answer_terms = tokens(before) + tokens(candidate["form"]) + tokens(after)
    exact_answer = all_terms == answer_terms
    metrics.update(candidate=candidate["form"], slot_probabilities=probabilities, exact_answer=exact_answer,
                   starts_with_answer=all_terms[:len(answer_terms)] == answer_terms)
    suffix = aligned.matches[prefix_count:]
    last_word = suffix[-1].word if suffix else slot_words[-1]
    metrics["answer_end"] = last_word.end if last_word is not None else None
    if tail_active and (last_word is None or last_word.end > end - TRUNCATION_MARGIN):
        return result(Verdict.UNDETERMINED, "end_of_window_unconfirmed")
    if assisted:
        if (aligned.coverage == 1 and candidate["id"] == target
                and min(probabilities) >= CLEAR_SLOT_PROBABILITY):
            return result(Verdict.RELEASE, "assisted_speech_within_vad_step")
        return result(Verdict.UNDETERMINED, "insufficient_assisted_speech")
    if weak_frame:
        if candidate["id"] == target and min(probabilities) >= CLEAR_SLOT_PROBABILITY:
            return result(Verdict.PASS, "clear_slot_with_weak_frame_word")
        return result(Verdict.UNDETERMINED, "frame_coverage")
    if candidate["id"] == target and min(probabilities) >= rule.min_target_probability:
        return result(Verdict.PASS, "target_form")
    if candidate["id"] != target and min(probabilities) >= rule.min_opposite_probability:
        return result(Verdict.RETRY, "opposite_form")
    return result(Verdict.UNDETERMINED, "low_slot_confidence")
