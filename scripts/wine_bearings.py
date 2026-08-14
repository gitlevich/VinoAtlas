"""Wine descriptor bearings in a space that is not made of words.

Everything the wine side has established so far rests on words agreeing with
other words. The cannabis work only became falsifiable once each descriptor
could be given a bearing in a measured space, and wine has one such space
already in the corpus: what the bottle is and how old it was when tasted.
Neither coordinate was derived from anybody's description.

    grounded features   bottle age at the moment of tasting, the grape variety,
                        and the calendar year of the review
    bearing             how a descriptor's use varies across those, fitted over
                        every review at once

Calendar year has to be in the model rather than left out. Within a single wine
tasted repeatedly, age and the date are the same variable, so a descriptor that
merely came into fashion would otherwise read as a maturation effect.

Three operations follow, the same three that worked on cannabis: drop the
descriptors with no bearing, merge the ones whose bearings are parallel, and
report what survives. A word that points nowhere in this space is not
meaningless -- it may name something age and variety do not touch -- but it is
not a distinction this instrument can confirm.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "data" / "corpus"
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bearings")

MIN_RATE = 0.004        # a descriptor must appear in this share of reviews
TOP_VARIETIES = 24
FOLDS = 5


def vocabulary():
    """Wine descriptor terms harvested syntactically, in extract_domains.py."""
    frame = pd.read_parquet(LEX / "domain_doc_terms.parquet")
    frame = frame[frame["domain"].astype(str) == "wine"]
    terms = frame["term"].astype(str)
    counts = terms.value_counts()
    return sorted(t for t in counts.index if " " not in t and len(t) > 2)


def corpus():
    columns = ["text", "variety", "bottle_age", "review_year", "wine_id"]
    frame = pd.read_parquet(CORPUS / "cellartracker.parquet", columns=columns)
    frame = frame.dropna(subset=["text", "bottle_age", "review_year", "wine_id"])
    frame = frame[frame["variety"].notna() & (frame["variety"].astype(str) != "")]
    log.info("reviews with age, date, wine and variety: %d", len(frame))
    return frame


def design(frame):
    """Grounded features only: age, calendar year, and which grape it is."""
    top = frame["variety"].value_counts().head(TOP_VARIETIES).index
    log.info("varieties kept: %d covering %.0f%% of reviews",
             len(top), 100 * frame["variety"].isin(top).mean())

    age = frame["bottle_age"].to_numpy(float)
    year = frame["review_year"].to_numpy(float)
    blocks = [np.ones((len(frame), 1)),
              ((age - age.mean()) / age.std()).reshape(-1, 1),
              ((year - year.mean()) / year.std()).reshape(-1, 1)]
    for name in top:
        blocks.append((frame["variety"] == name).to_numpy(float).reshape(-1, 1))
    names = ["intercept", "bottle_age", "review_year"] + [str(v) for v in top]
    return np.hstack(blocks), names


def mentions(frame, terms):
    vectoriser = CountVectorizer(vocabulary=terms, binary=True, lowercase=True,
                                 token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b")
    matrix = vectoriser.transform(frame["text"])
    rate = np.asarray(matrix.mean(axis=0)).ravel()
    keep = rate >= MIN_RATE
    log.info("descriptors at rate >= %.1f%%: %d of %d", 100 * MIN_RATE, keep.sum(), len(terms))
    return matrix[:, keep].astype(np.float32), [t for t, k in zip(terms, keep) if k]


def fit(features, matrix):
    """All descriptors solved at once: one normal equation, many right sides."""
    gram = features.T @ features
    moment = np.asarray(features.T @ matrix)
    return np.linalg.solve(gram + 1e-6 * np.eye(features.shape[1]), moment)


def grounded(features, matrix, frame, folds=FOLDS):
    """Out-of-sample correlation, split by wine so no wine spans the split."""
    wines = frame["wine_id"].to_numpy()
    unique = np.unique(wines)
    rng = np.random.default_rng(0)
    assignment = pd.Series(rng.integers(0, folds, len(unique)), index=unique)
    fold_of = assignment.reindex(wines).to_numpy()

    predicted = np.zeros(matrix.shape, dtype=np.float32)
    for fold in range(folds):
        train, test = fold_of != fold, fold_of == fold
        coefficients = fit(features[train], matrix[train])
        predicted[test] = features[test] @ coefficients

    scores = []
    for column in range(matrix.shape[1]):
        actual = np.asarray(matrix[:, column].todense()).ravel() if sparse.issparse(matrix) else matrix[:, column]
        scores.append(np.corrcoef(predicted[:, column], actual)[0, 1])
    return np.array(scores)


if __name__ == "__main__":
    frame = corpus()
    terms = vocabulary()
    matrix, terms = mentions(frame, terms)
    features, names = design(frame)

    coefficients = fit(features, matrix)
    scores = grounded(features, matrix, frame)

    # Null: the same fit against wines' features shuffled between wines, which
    # keeps every marginal intact and destroys only the correspondence.
    rng = np.random.default_rng(1)
    order = rng.permutation(len(frame))
    null = grounded(features[order], matrix, frame)
    cutoff = float(np.nanpercentile(null, 95))

    table = pd.DataFrame(coefficients[1:], index=names[1:], columns=terms).T
    table["rho"] = scores
    table["grounded"] = table["rho"] > cutoff
    table.index.name = "term"
    table.to_parquet(LEX / "wine_bearings.parquet", compression="zstd")

    log.info("null 95th percentile: %.4f", cutoff)
    log.info("grounded descriptors: %d of %d", int(table["grounded"].sum()), len(table))
    log.info("strongest:\n%s", table.sort_values("rho", ascending=False)
             [["rho", "bottle_age", "review_year"]].head(20).round(3).to_string())
    log.info("no bearing:\n%s", ", ".join(table.sort_values("rho").head(25).index))
