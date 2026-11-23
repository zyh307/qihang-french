"""Order-preserving word evidence for short, scripted practice prompts."""
from dataclasses import dataclass
import math
import re
import unicodedata

TOKEN_LIMIT = 256


def tokens(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFC", text.casefold()).replace("œ", "oe"))


@dataclass(frozen=True)
class Word:
    text: str
    start: float
    end: float
    probability: float

    def __post_init__(self):
        if (not isinstance(self.text, str) or not self.text.strip()
                or not all(math.isfinite(v) for v in (self.start, self.end, self.probability))
                or not 0 <= self.start <= self.end or not 0 <= self.probability <= 1):
            raise ValueError("无效的逐词识别证据")


def words_in_window(words, start, end):
    """Assign whole ASR words to a half-open window and return boundary overlaps separately."""
    if not 0 <= start < end:
        raise ValueError("无效的逐词对齐窗口")
    inside, boundary = [], []
    for word in words:
        if (word.end <= start and word.start < start) or word.start >= end:
            continue
        if word.start < start or word.end > end:
            boundary.append(word)
        else:
            inside.append(word)
    return tuple(inside), tuple(boundary)


@dataclass(frozen=True)
class Match:
    index: int
    target: str
    heard_index: int | None
    word: Word | None
    status: str


@dataclass(frozen=True)
class Alignment:
    matches: tuple[Match, ...]
    extras: tuple[tuple[int, Word], ...]

    @property
    def coverage(self):
        return sum(match.status == "hit" for match in self.matches) / len(self.matches)


def align(reference, words, min_probability):
    """Match confident words first, then preserve matching low-confidence evidence."""
    targets = tokens(reference)
    observed = [(token, index, word) for index, word in enumerate(words) for token in tokens(word.text)]
    n, m = len(targets), len(observed)
    if not 0 < n <= TOKEN_LIMIT or m > TOKEN_LIMIT or not 0 <= min_probability <= 1:
        raise ValueError("逐词对齐范围或置信度无效")

    scores = [[(0, 0)] * (m + 1) for _ in range(n + 1)]
    choices = [["missing"] * (m + 1) for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            token, _, word = observed[j]
            candidates = []
            if targets[i] == token:
                high, total = scores[i + 1][j + 1]
                candidates.append(((high + (word.probability >= min_probability), total + 1), "match"))
            candidates.extend(((scores[i + 1][j], "missing"), (scores[i][j + 1], "extra")))
            scores[i][j], choices[i][j] = max(candidates, key=lambda candidate: candidate[0])

    matches, extras = [], []
    i = j = 0
    while i < n or j < m:
        choice = choices[i][j] if i < n else "extra"
        if choice == "match":
            _, index, word = observed[j]
            status = "hit" if word.probability >= min_probability else "low_confidence"
            matches.append(Match(i, targets[i], index, word, status))
            i += 1
            j += 1
        elif choice == "missing":
            matches.append(Match(i, targets[i], None, None, "missing"))
            i += 1
        else:
            _, index, word = observed[j]
            extras.append((index, word))
            j += 1
    return Alignment(tuple(matches), tuple(extras))
