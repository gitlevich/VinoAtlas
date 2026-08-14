"""Vlad's own effect vocabulary, found by keyness rather than by a checklist.

Scoring his recordings on Leafly's thirteen effect words would repeat the
mistake the population analysis already exposed: that vocabulary is valence and
arousal, and the dimension he actually reports -- the grain of attention, the
narrative switching off or not -- has no word in it.

So the words are taken from him. Recordings that mention cannabis are compared
against the rest of his corpus, and a term counts as his effect vocabulary when
it is over-represented in the cannabis sessions by log-likelihood. His baseline
is 540k words of dictation about everything else, which is what makes the
comparison mean something: these are words he uses *here* and not elsewhere.
"""

import logging
import re
import sqlite3
from collections import Counter
from math import log as ln
from pathlib import Path

DB = Path("/Users/vlad/Documents/Codex/2026-07-30/a/outputs/plaud-topic-index/plaud_corpus.sqlite")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("personal")

CANNABIS = re.compile(
    r"\b(weed|cannabis|smoked?|smoking|sativa|indica|strain|stoned|joint|mini|minis|"
    r"vape[ds]?|dispensary|terpene|thc|preroll|pipe|hit[s]?|inhale)\b", re.I)

# Grammar and dictation filler carry no content and would dominate any keyness list.
STOP = set("""the a an and or but if then so of to in on at for with by from as is are was were
be been being it its this that these those i me my mine you your he she they them we us our
have has had do does did not no yes just like really very much more most some any all one two
know think mean going gonna get got go went can could would should will shall now here there
what which who when where why how out up down about into over again still even also than too
because okay ok well yeah yep right thing things kind sort lot bit little actually maybe
probably sure quite pretty something anything nothing someone everyone say said says saying
see saw seen make made take took put back come came want wanted need needed use used
time day today tomorrow yesterday year years thats im ive dont doesnt didnt cant its
""".split())

MIN_COUNT = 8


def words(text):
    return [w.lower() for w in re.findall(r"[a-zA-Z']{3,}", text)]


def keyness(target, reference, total_target, total_reference):
    """Log-likelihood that a word is over-represented in the target corpus."""
    expected_target = total_target * (target + reference) / (total_target + total_reference)
    expected_reference = total_reference * (target + reference) / (total_target + total_reference)
    value = 0.0
    if target:
        value += 2 * target * ln(target / expected_target)
    if reference:
        value += 2 * reference * ln(reference / expected_reference)
    return value if target / total_target > reference / max(total_reference, 1) else -value


def run():
    connection = sqlite3.connect(DB)
    rows = connection.execute(
        "select r.id, r.name, group_concat(u.text, ' ') "
        "from recordings r join utterances u on u.recording_id = r.id group by r.id").fetchall()

    session, baseline = Counter(), Counter()
    n_session = 0
    for _, name, text in rows:
        blob = f"{name} {text}"
        # A session counts as cannabis-related when the subject comes up repeatedly,
        # not when it is mentioned once in passing.
        if len(CANNABIS.findall(blob)) >= 3:
            session.update(words(text))
            n_session += 1
        else:
            baseline.update(words(text))

    total_session, total_baseline = sum(session.values()), sum(baseline.values())
    log.info("%d cannabis sessions (%d words) vs %d other recordings (%d words)",
             n_session, total_session, len(rows) - n_session, total_baseline)

    scored = []
    for word, count in session.items():
        if count < MIN_COUNT or word in STOP:
            continue
        scored.append((keyness(count, baseline.get(word, 0), total_session, total_baseline),
                       word, count, baseline.get(word, 0)))
    scored.sort(reverse=True)

    log.info("")
    log.info("%-16s %8s %7s %7s", "word", "keyness", "here", "elsewhere")
    for value, word, count, other in scored[:45]:
        log.info("%-16s %8.1f %7d %7d", word, value, count, other)
    return scored


if __name__ == "__main__":
    run()
