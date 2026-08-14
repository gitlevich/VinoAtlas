"""Did anything measurable change in Vlad's dictation at the announced boundary?

He said when he was going to smoke, dictated one more turn, and left a nine
minute gap. That makes the transcript a natural experiment with exactly one
observation, and the honest way to read it is not pre-versus-post -- a
conversation drifts on its own, and this one drifted toward phenomenology right
at that point partly because he had just said it would.

So the test is not whether the two halves differ. It is whether the change AT
the announced boundary is larger than the change at every other point in the
conversation. If the boundary is unremarkable among all possible cut points,
whatever difference exists is the conversation's own arc.

Even passing, this establishes almost nothing on its own: one boundary, one
person, no blinding, no control, and the topic changed at the same moment.
"""

import json
import glob
import logging
import re
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("boundary")

PROJECT = Path("/Users/vlad/.claude/projects/-Users-vlad-research-VinoAtlas")
SMOKE_ANNOUNCED = "gonna go smoke some now"

# Words that mark reasoning being chained rather than asserted.
CONNECTIVE = re.compile(r"\b(so|because|therefore|thus|which means|that is|hence|since)\b", re.I)
# First-person perceptual report, the thing he says changes.
PERCEPT = re.compile(r"\b(i see|i feel|i notice|i experience|my attention|i sense|when i close)\b", re.I)
ABSTRACT = re.compile(r"\b(structure|structural|invariant|resolution|attention|relevance|"
                      r"geometry|space|scale|frame|render|lossy|compress|sigil|abstract)\w*\b", re.I)


def messages():
    seen, rows = set(), []
    for path in glob.glob(str(PROJECT / "*.jsonl")):
        for line in open(path):
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("type") != "user":
                continue
            content = record.get("message", {}).get("content")
            if isinstance(content, list):
                content = " ".join(part.get("text", "") for part in content
                                   if isinstance(part, dict) and part.get("type") == "text")
            if not isinstance(content, str) or not content.strip():
                continue
            if content.startswith("<") or "local-command" in content[:60]:
                continue
            if "Base directory for this skill" in content[:60]:
                continue
            key = content[:200]
            if key in seen:
                continue
            seen.add(key)
            rows.append((record.get("timestamp", ""), content))
    rows.sort()
    return rows


def features(text):
    words = re.findall(r"[a-zA-Z']+", text)
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    if not words:
        return None
    return {
        "words": len(words),
        "sentence_length": len(words) / max(len(sentences), 1),
        "lexical_variety": len(set(w.lower() for w in words)) / len(words),
        "connectives": 100 * len(CONNECTIVE.findall(text)) / len(words),
        "perceptual_report": 100 * len(PERCEPT.findall(text)) / len(words),
        "abstract_terms": 100 * len(ABSTRACT.findall(text)) / len(words),
    }


def boundary_extremity(values, cut, minimum=6):
    """Where does the step at `cut` rank among steps at every other cut point?"""
    def step(k):
        before, after = values[:k], values[k:]
        pooled = np.sqrt((before.var() + after.var()) / 2) or 1e-9
        return abs(after.mean() - before.mean()) / pooled

    candidates = [k for k in range(minimum, len(values) - minimum)]
    observed = step(cut)
    stronger = sum(step(k) >= observed for k in candidates)
    return observed, stronger / len(candidates)


if __name__ == "__main__":
    rows = messages()
    announced = next(i for i, (_, text) in enumerate(rows) if SMOKE_ANNOUNCED in text)
    # He dictated one further turn before leaving, so the break follows it.
    cut = announced + 2
    log.info("%d messages | announced at %d (%s) | first message after the gap: %d (%s)",
             len(rows), announced, rows[announced][0][11:16], cut, rows[cut][0][11:16])
    log.info("gap before message %d: %s -> %s", cut, rows[cut - 1][0][11:19], rows[cut][0][11:19])

    table = [features(text) for _, text in rows]
    keep = [i for i, f in enumerate(table) if f]
    log.info("")
    log.info("%-20s %8s %8s %8s   %s", "feature", "before", "after", "step", "cut points with a bigger step")
    for name in table[keep[0]]:
        values = np.array([table[i][name] for i in keep], float)
        observed, fraction = boundary_extremity(values, cut)
        log.info("%-20s %8.2f %8.2f %8.2f   %.0f%%",
                 name, values[:cut].mean(), values[cut:].mean(), observed, 100 * fraction)
