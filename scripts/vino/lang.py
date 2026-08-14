"""Fast English detection for short review texts.

langdetect is ~1ms/doc, which is 20 minutes over the corpus. Reviews are
short and formulaic, so a function-word ratio separates English from the
other Vivino languages at a fraction of the cost.
"""

import re

FUNCTION_WORDS = frozenset("""
a an the and or but of in on at to for with from this that these those is are was were be been
it its as by very quite bit not no so too there here what which who when where while
i you he she we they me him her us them my your his their our
has have had do does did will would can could should may might must
than then also just more most much many some any all both each other
good great nice really well like love drink bottle wine
""".split())

TOKEN_RE = re.compile(r"[a-z']+")
LATIN_RE = re.compile(r"[a-zA-Z]")


def is_english(text, min_ratio=0.18, min_tokens=3):
    """True if text looks like English prose.

    Rejects non-Latin scripts outright, then requires a minimum share of
    English function words. Very short texts ("Parfum! Super frumos!") fall
    below min_tokens and are rejected, which is the desired behaviour: they
    carry no extractable descriptor structure anyway.
    """
    if not text or not isinstance(text, str):
        return False
    latin = len(LATIN_RE.findall(text))
    if latin < 0.5 * sum(c.isalpha() for c in text):
        return False
    tokens = TOKEN_RE.findall(text.lower())
    if len(tokens) < min_tokens:
        return False
    hits = sum(1 for t in tokens if t in FUNCTION_WORDS)
    return hits / len(tokens) >= min_ratio
