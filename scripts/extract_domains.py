"""Harvest descriptor vocabulary from every domain on its own terms.

Every dimensionality figure measured so far ran through wine's 587-term
lexicon, which gives wine a home-field advantage: it has no slot for diesel,
skunk, gas or kush, so cannabis was scored on an instrument built for
something else. This script builds each domain's vocabulary from that domain's
own text, using the syntax rather than a seed list, so the union lexicon that
follows is not any one domain's projection of the others.

A term counts as a descriptor when the grammar treats it as one:

  modifier   it modifies a noun attributively ("skunky nose") or predicatively
             ("the finish is long")
  referent   it is the object of an aroma cue ("notes of diesel")

Both tests are structural. Neither consults a list of words anyone expects to
find, which is the whole point -- the vocabulary has to be allowed to surprise
us or the measurement is circular.

Domains whose data is already a tag list (chocolate, cheese, coffee's descriptor
columns) skip the parse: those words were entered as descriptors by whoever
filled the field, and re-deriving that from syntax would only lose them.

Writes data/lexicon/domain_doc_terms.parquet -- (domain, doc_id, term) -- which
is both the vocabulary and the incidence matrix the dimensionality measurement
needs.
"""

import logging
import re
from collections import Counter
from pathlib import Path

import pandas as pd
import spacy

from vino.extract import AROMA_CUES, FRAME_HEAD_BLOCK, _clean, _conjuncts, _phrase
from vino.lang import is_english

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "data" / "corpus"
ADJACENT = ROOT / "data" / "raw" / "adjacent"
OUT = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("domains")

MIN_DF = 25
MAX_DOCS = 150_000


def _sample(series, limit=MAX_DOCS):
    series = series.dropna().astype(str)
    series = series[series.str.len() >= 40]
    if len(series) > limit:
        series = series.sample(limit, random_state=0)
    return series.reset_index(drop=True)


def load_text_domains():
    """Domains with free-text reviews, which get parsed."""
    wine = pd.read_parquet(CORPUS / "reviews.parquet", columns=["text"])["text"]
    cellar = pd.read_parquet(CORPUS / "cellartracker.parquet", columns=["text"])["text"]
    cannabis = pd.read_parquet(CORPUS / "cannabis_reviews.parquet", columns=["text"])["text"]
    tea = pd.read_csv(ADJACENT / "steepster_reviews.csv")["review_text"]
    coffee = pd.read_csv(ADJACENT / "coffeereview.csv")["all_text"]
    return {
        "wine": _sample(pd.concat([wine, cellar], ignore_index=True)),
        "cannabis": _sample(cannabis),
        "tea": _sample(tea),
        "coffee": _sample(coffee),
    }


TAG_SPLIT = re.compile(r"[,;/|]| and ")


def _tags(frame, columns):
    """One row's descriptor columns as a set of lowercase terms."""
    docs = []
    for _, row in frame.iterrows():
        terms = set()
        for column in columns:
            value = row.get(column)
            if not isinstance(value, str):
                continue
            for part in TAG_SPLIT.split(value.lower()):
                part = part.strip().strip(".")
                if 3 <= len(part) <= 24 and all(c.isalpha() or c == " " for c in part):
                    terms.add(part)
        if terms:
            docs.append(terms)
    return docs


def load_tag_domains():
    """Domains stored as curated descriptor fields, which skip the parse."""
    chocolate = pd.read_csv(ADJACENT / "chocolate.csv")
    cheese = pd.read_csv(ADJACENT / "cheeses.csv")
    return {
        "chocolate": _tags(chocolate, ["most_memorable_characteristics"]),
        "cheese": _tags(cheese, ["texture", "flavor", "aroma"]),
    }


def parse_domain(name, texts, nlp):
    """Descriptor terms per document, via modifier slots and aroma frames."""
    english = texts[texts.map(is_english)]
    log.info("%s: %d docs (%d english)", name, len(texts), len(english))

    docs = []
    for doc in nlp.pipe(english, n_process=8, batch_size=400):
        terms = set()
        for token in doc:
            if token.pos_ == "ADJ" and token.dep_ in ("amod", "acomp", "ROOT"):
                head = token.head if token.dep_ != "ROOT" else token
                if head.pos_ == "NOUN" and _clean(head) in FRAME_HEAD_BLOCK:
                    continue
                lemma = _clean(token)
                if lemma:
                    terms.add(lemma)
            if token.dep_ == "pobj" and token.head.lemma_ == "of":
                if token.head.head.lemma_.lower() in AROMA_CUES:
                    for ref in _conjuncts(token):
                        phrase = _phrase(ref)
                        if phrase:
                            terms.add(phrase)
        if terms:
            docs.append(terms)
    return docs


def to_frame(name, docs):
    counts = Counter(term for terms in docs for term in terms)
    keep = {term for term, n in counts.items() if n >= MIN_DF}
    rows = [(name, i, term) for i, terms in enumerate(docs) for term in terms & keep]
    log.info("%s: %d docs, %d terms at df>=%d", name, len(docs), len(keep), MIN_DF)
    return pd.DataFrame(rows, columns=["domain", "doc_id", "term"])


if __name__ == "__main__":
    nlp = spacy.load("en_core_web_sm", exclude=["ner"])
    frames = []

    for name, texts in load_text_domains().items():
        frames.append(to_frame(name, parse_domain(name, texts, nlp)))
    for name, docs in load_tag_domains().items():
        frames.append(to_frame(name, docs))

    out = pd.concat(frames, ignore_index=True)
    for column in ("domain", "term"):
        out[column] = out[column].astype("category")
    out.to_parquet(OUT / "domain_doc_terms.parquet", compression="zstd", index=False)

    union = out["term"].astype(str).nunique()
    log.info("union lexicon: %d terms across %d domains", union, out["domain"].nunique())
