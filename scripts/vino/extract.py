"""Extract candidate perceptual vocabulary from wine reviews.

Three products, written to data/lexicon/:

  terms.parquet   Candidate descriptor terms (ADJ / NOUN lemmas) with per-family
                  document frequencies.
  frames.parquet  (modifier, head) pairs. The head noun names a distinction the
                  discourse has already lexicalised ("tannins", "acidity",
                  "finish"); the modifiers filling its slot are that
                  distinction's value space. This is where named contrasts come
                  from: the names are taken from the discourse, not imposed.
  aromas.parquet  Noun phrases appearing in aroma frames ("notes of X",
                  "aromas of X"), including conjuncts, which is where the
                  referential vocabulary (blackberry, cigar box) concentrates.

Nothing is discarded on perceptual grounds here. Extraction stays permissive
and the taxonomy step decides what is a percept; the provenance flag is
computed separately from wine metadata so that judgement stays reviewable.
"""

import logging
from collections import Counter
from pathlib import Path

import pandas as pd
import spacy

from .lang import is_english

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "data" / "corpus"
OUT = ROOT / "data" / "lexicon"

log = logging.getLogger(__name__)

# Nouns that introduce an aroma/flavour referent via "of".
AROMA_CUES = frozenset("""
note notes aroma aromas scent scents flavor flavors flavour flavours hint hints
nuance nuances touch touches whiff whiffs undertone undertones overtone overtones
accent accents tone tones streak streaks layer layers wave waves burst bursts
character nose palate suggestion suggestions trace traces dose element
""".split())

# Heads whose modifier slot is structural rather than perceptual; keeping them
# would fill the frame table with provenance and commerce talk.
FRAME_HEAD_BLOCK = frozenset("""
wine wines winery vineyard vineyards vintage bottle bottles case cases price value
producer estate region appellation blend grape grapes year years decade
label glass gift pack collection edition release cuvee style styles version
""".split())

MIN_TOKEN_LEN = 3


def _clean(token):
    """Lemma if the token is a plausible vocabulary item, else None."""
    if token.is_stop or token.is_punct or token.is_space or token.like_num:
        return None
    lemma = token.lemma_.lower().strip("-'")
    if len(lemma) < MIN_TOKEN_LEN or not lemma.isalpha():
        return None
    return lemma


def _conjuncts(token):
    """A token and everything coordinated with it ("X, Y and Z")."""
    yield token
    for child in token.conjuncts:
        yield child


def _phrase(token):
    """Compound-inclusive phrase for a head noun: 'cigar box', 'forest floor'."""
    parts = [c for c in token.lefts if c.dep_ == "compound" and not c.is_stop]
    words = [p.lemma_.lower() for p in parts] + [token.lemma_.lower()]
    phrase = " ".join(w for w in words if w.isalpha())
    return phrase if phrase and len(phrase) >= MIN_TOKEN_LEN else None


def _harvest(doc, family, terms, frames, aromas, adverbs, doc_id=None, records=None, coords=None):
    """Accumulate counts; when doc_id is given, also keep per-review frame records.

    Aggregate counts cannot tell whether two modifiers ever described the same
    thing. Opposition is precisely that question, so the review-level records
    and the coordination pairs below are what the axis search actually runs on.
    """
    slot = {}

    for token in doc:
        lemma = _clean(token)

        if lemma and token.pos_ in ("ADJ", "NOUN"):
            terms[(lemma, token.pos_, family)] += 1

        # Attributive modification: "soft tannins", "searing acidity".
        if token.pos_ == "ADJ" and token.dep_ == "amod":
            head = _clean(token.head)
            if head and token.head.pos_ == "NOUN" and head not in FRAME_HEAD_BLOCK:
                mod = _clean(token)
                if mod:
                    frames[(mod, head, "amod", family)] += 1
                    slot.setdefault(head, []).append((mod, token))

        # Predicative: "the tannins are firm", "acidity is bright".
        if token.pos_ == "ADJ" and token.dep_ in ("acomp", "ROOT"):
            verb = token.head if token.dep_ == "acomp" else token
            subjects = [c for c in verb.children if c.dep_ in ("nsubj", "nsubjpass")]
            for subj in subjects:
                head = _clean(subj)
                mod = _clean(token)
                if head and mod and subj.pos_ == "NOUN" and head not in FRAME_HEAD_BLOCK:
                    frames[(mod, head, "pred", family)] += 1
                    slot.setdefault(head, []).append((mod, token))

        # Degree marking on adjectives: "very ripe", "slightly green".
        if token.pos_ == "ADV" and token.dep_ == "advmod" and token.head.pos_ == "ADJ":
            adv, adj = _clean(token), _clean(token.head)
            if adv and adj:
                adverbs[(adv, adj, family)] += 1

        # Aroma frames: "notes of X, Y and Z".
        if token.dep_ == "pobj" and token.head.lemma_ == "of":
            cue = token.head.head
            if cue.lemma_.lower() in AROMA_CUES:
                for ref in _conjuncts(token):
                    phrase = _phrase(ref)
                    if phrase:
                        aromas[(phrase, cue.lemma_.lower(), family)] += 1

    if records is None:
        return

    for head, fillers in slot.items():
        for mod, _ in fillers:
            records.append((doc_id, mod, head, family))

    # Coordination tells the two cases apart directly: "soft and silky" joins
    # compatible descriptions, "soft yet firm" marks a contrast the writer
    # thought worth flagging.
    for head, fillers in slot.items():
        for i, (mod_a, token_a) in enumerate(fillers):
            for mod_b, token_b in fillers[i + 1:]:
                if mod_a == mod_b:
                    continue
                conjunction = _coordinator(token_a, token_b)
                pair = tuple(sorted((mod_a, mod_b)))
                coords[(pair[0], pair[1], head, conjunction, family)] += 1


CONTRASTIVE = frozenset({"but", "yet", "though", "although", "however", "while"})


def _coordinator(token_a, token_b):
    """How two modifiers of one head were joined: contrastive, additive, or neither."""
    if token_b in token_a.conjuncts or token_a in token_b.conjuncts:
        for token in (token_a, token_b):
            for child in token.children:
                if child.dep_ == "cc":
                    return "contrast" if child.lemma_.lower() in CONTRASTIVE else "additive"
        return "additive"
    return "same_slot"


def run(limit=None, n_process=10, batch_size=500):
    df = pd.read_parquet(CORPUS / "reviews.parquet", columns=["text", "family", "source"])
    if limit:
        df = df.sample(limit, random_state=0)
    log.info("loaded %d reviews", len(df))

    mask = df["text"].map(is_english)
    df = df[mask]
    log.info("english subset: %d reviews", len(df))

    nlp = spacy.load("en_core_web_sm", exclude=["ner"])
    terms, frames, aromas, adverbs, coords = (Counter() for _ in range(5))
    records = []

    pairs = ((t, f) for t, f in zip(df["text"], df["family"]))
    done = 0
    for doc, family in nlp.pipe(pairs, as_tuples=True, n_process=n_process, batch_size=batch_size):
        _harvest(doc, family, terms, frames, aromas, adverbs, done, records, coords)
        done += 1
        if done % 100_000 == 0:
            log.info("processed %d/%d docs", done, len(df))

    OUT.mkdir(parents=True, exist_ok=True)
    _write(terms, ["term", "pos", "family"], "terms.parquet")
    _write(frames, ["modifier", "head", "relation", "family"], "frames.parquet")
    _write(aromas, ["phrase", "cue", "family"], "aromas.parquet")
    _write(adverbs, ["adverb", "adjective", "family"], "adverbs.parquet")
    _write(coords, ["term_a", "term_b", "head", "conjunction", "family"], "coordinations.parquet")

    slots = pd.DataFrame(records, columns=["doc_id", "modifier", "head", "family"])
    for column in ("modifier", "head", "family"):
        slots[column] = slots[column].astype("category")
    slots.to_parquet(OUT / "slot_records.parquet", compression="zstd", index=False)
    log.info("slot_records.parquet: %d rows", len(slots))
    return len(df)


def _write(counter, columns, name):
    df = pd.DataFrame([(*k, v) for k, v in counter.items()], columns=[*columns, "n"])
    df = df.sort_values("n", ascending=False)
    df.to_parquet(OUT / name, compression="zstd", index=False)
    log.info("%s: %d rows, %d total occurrences", name, len(df), df["n"].sum())
