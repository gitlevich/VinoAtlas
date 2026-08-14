"""Longitudinal study of the taster, not the wine.

Every analysis so far conditioned on the object. This one conditions on the
person: reviewers with years of history, ordered by time, asked four questions.

  shape        Fit a preference vector over percept descriptors on a reviewer's
               early years and predict their ratings in later years. If taste
               is a stable region, the early shape should keep working.
  persistence  Is my early shape closer to my late shape than to yours? The
               cosine between coefficient vectors answers whether the region is
               personal and persistent, or generic, or fluid.
  width        Does the active descriptor set widen with experience (distinction
               accumulation) or hold its size and turn over (attention as the
               binding constraint)? The lazy-growth theory predicts widening
               only where attention keeps being paid.
  migration    Do tasters drift through variety space along a common path?

Temporal split, never random: predicting the past from the future is not
prediction. Evaluative words are excluded from the percept set throughout;
consensus quality is reported alongside as the baseline that any personal
model has to justify itself against.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import Ridge

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "data" / "corpus"
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("taster")

MIN_REVIEWS = 150
MIN_SPAN_YEARS = 6
MAX_USERS = 250
TRAIN_SHARE = 0.6
ALPHA = 10.0

EVALUATIVE = set("lovely beautiful great fine nice good excellent wonderful "
                 "amazing awesome superb".split())
GRAPE = set("riesling merlot syrah cab cabernet sangiovese pinot noir chardonnay "
            "zinfandel nebbiolo grenache tempranillo malbec sauvignon blanc "
            "gewurztraminer viognier barbera shiraz gamay chenin semillon muscat "
            "port champagne bordeaux burgundy rhone barolo brunello rioja chianti "
            "cali napa italian french varietal grape wine bottle vintage nose "
            "palate blend".split())


def percept_vocabulary():
    table = pd.read_parquet(LEX / "wine_bearings.parquet")
    keep = table[table["rho"] >= 0.05].index
    return [t for t in keep if t not in GRAPE and t not in EVALUATIVE]


def cohort(frame):
    stats = frame.groupby("user_id").agg(n=("rating", "size"),
                                         lo=("review_year", "min"),
                                         hi=("review_year", "max"))
    chosen = stats[(stats["n"] >= MIN_REVIEWS)
                   & (stats["hi"] - stats["lo"] >= MIN_SPAN_YEARS)]
    chosen = chosen.sort_values("n", ascending=False).head(MAX_USERS)
    log.info("cohort: %d reviewers, %d-%d reviews each, span >= %d years",
             len(chosen), int(chosen["n"].min()), int(chosen["n"].max()), MIN_SPAN_YEARS)
    return chosen.index


def fit_vector(features, ratings):
    model = Ridge(alpha=ALPHA).fit(features, ratings)
    return model, model.coef_ / (np.linalg.norm(model.coef_) or 1.0)


def shape_and_persistence(frame, matrix, wine_mean, wine_count, users):
    own, pooled_scores, consensus_scores, early_vectors, late_vectors = [], [], [], [], []

    # One pooled taste fitted on everyone's early periods together.
    early_mask = np.zeros(len(frame), dtype=bool)
    boundaries = {}
    for user in users:
        rows = np.where((frame["user_id"] == user).to_numpy())[0]
        rows = rows[np.argsort(frame["time"].to_numpy()[rows])]
        cut = int(TRAIN_SHARE * len(rows))
        boundaries[user] = (rows[:cut], rows[cut:])
        early_mask[rows[:cut]] = True
    pooled, _ = fit_vector(matrix[early_mask], frame["rating"].to_numpy()[early_mask])

    for user in users:
        train, test = boundaries[user]
        ratings = frame["rating"].to_numpy()
        if ratings[test].std() < 0.5:
            continue
        model, early_vector = fit_vector(matrix[train], ratings[train])
        predicted = model.predict(matrix[test])
        own.append(np.corrcoef(predicted, ratings[test])[0, 1])
        pooled_scores.append(np.corrcoef(pooled.predict(matrix[test]), ratings[test])[0, 1])

        wines = frame["wine_id"].to_numpy()[test]
        counted = wine_count.reindex(wines).to_numpy()
        usable = counted >= 10
        if usable.sum() >= 15:
            crowd = (wine_mean.reindex(wines).to_numpy()[usable] * counted[usable]
                     - ratings[test][usable]) / (counted[usable] - 1)
            consensus_scores.append(np.corrcoef(crowd, ratings[test][usable])[0, 1])

        _, late_vector = fit_vector(matrix[test], ratings[test])
        early_vectors.append(early_vector)
        late_vectors.append(late_vector)

    early_vectors, late_vectors = np.array(early_vectors), np.array(late_vectors)
    self_cosine = np.einsum("ij,ij->i", early_vectors, late_vectors)
    cross = early_vectors @ late_vectors.T
    np.fill_diagonal(cross, np.nan)

    log.info("--- taste shape, temporal holdout (train early %d%%, test late) ---",
             int(100 * TRAIN_SHARE))
    log.info("own early shape -> later ratings : median r = %+.3f", np.median(own))
    log.info("pooled shape    -> later ratings : median r = %+.3f", np.median(pooled_scores))
    log.info("consensus rating baseline        : median r = %+.3f", np.median(consensus_scores))
    log.info("--- persistence of the shape ---")
    log.info("my early vs MY late vector   : median cosine %+.3f", np.median(self_cosine))
    log.info("my early vs OTHERS' late     : median cosine %+.3f", np.nanmedian(cross))


def width_and_turnover(frame, matrix, users, block=100):
    """Active descriptor set at career start versus career end."""
    widths, turnovers, lengths = [], [], []
    words = frame["text"].str.count(" ").to_numpy() + 1
    for user in users:
        rows = np.where((frame["user_id"] == user).to_numpy())[0]
        rows = rows[np.argsort(frame["time"].to_numpy()[rows])]
        if len(rows) < 2 * block:
            continue
        first, last = rows[:block], rows[-block:]
        used_first = np.asarray(matrix[first].sum(axis=0)).ravel() > 0
        used_last = np.asarray(matrix[last].sum(axis=0)).ravel() > 0
        widths.append((used_first.sum(), used_last.sum()))
        turnovers.append((used_first & used_last).sum()
                         / max((used_first | used_last).sum(), 1))
        lengths.append((words[first].mean(), words[last].mean()))

    widths, lengths = np.array(widths), np.array(lengths)
    log.info("--- active descriptor set, first %d vs last %d reviews ---", block, block)
    log.info("distinct percepts used: %.0f -> %.0f (median)",
             np.median(widths[:, 0]), np.median(widths[:, 1]))
    log.info("review length, words  : %.0f -> %.0f (median)",
             np.median(lengths[:, 0]), np.median(lengths[:, 1]))
    log.info("set overlap first/last (jaccard): median %.2f", np.median(turnovers))
    log.info("reviewers whose set widened: %.0f%%", 100 * (widths[:, 1] > widths[:, 0]).mean())


def migration(frame, users, block=100):
    """Variety shares at career start versus career end, aggregated."""
    deltas = {}
    for user in users:
        person = frame[frame["user_id"] == user].sort_values("time")
        if len(person) < 2 * block:
            continue
        first = person.head(block)["variety"].value_counts(normalize=True)
        last = person.tail(block)["variety"].value_counts(normalize=True)
        for variety in set(first.index) | set(last.index):
            deltas.setdefault(variety, []).append(last.get(variety, 0) - first.get(variety, 0))

    movement = pd.Series({v: np.mean(d) for v, d in deltas.items() if len(d) >= 30})
    movement = movement.sort_values()
    log.info("--- variety migration over a career (mean share change) ---")
    log.info("away from : %s",
             ", ".join(f"{v} {x:+.3f}" for v, x in movement.head(6).items()))
    log.info("toward    : %s",
             ", ".join(f"{v} {x:+.3f}" for v, x in movement.tail(6)[::-1].items()))


if __name__ == "__main__":
    columns = ["text", "rating", "user_id", "wine_id", "variety", "review_year", "time"]
    frame = pd.read_parquet(CORPUS / "cellartracker.parquet", columns=columns)
    frame = frame.dropna(subset=["text", "rating", "user_id", "time"])
    frame = frame[(frame["rating"] >= 50) & (frame["rating"] <= 100)]

    users = cohort(frame)
    frame = frame[frame["user_id"].isin(users)].reset_index(drop=True)
    log.info("cohort reviews: %d", len(frame))

    vocabulary = percept_vocabulary()
    matrix = CountVectorizer(vocabulary=vocabulary, binary=True).transform(
        frame["text"]).astype(np.float32)

    whole = pd.read_parquet(CORPUS / "cellartracker.parquet", columns=["wine_id", "rating"])
    whole = whole.dropna()
    wine_mean = whole.groupby("wine_id")["rating"].mean()
    wine_count = whole.groupby("wine_id")["rating"].size()

    shape_and_persistence(frame, matrix, wine_mean, wine_count, users)
    width_and_turnover(frame, matrix, users)
    migration(frame, users)
