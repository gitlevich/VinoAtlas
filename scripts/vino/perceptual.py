"""Test descriptor terms against what tasters actually perceived.

WineSensed ran napping sessions: participants placed wines on a sheet by
perceived similarity, with no vocabulary imposed. 568 sessions cover 109 wines
that also carry roughly 50,000 written reviews. That combination allows the
question the whole project turns on to be asked empirically rather than
assumed.

For a term, take the wines whose reviews use it most and ask whether tasters
placed those wines near each other. If they did, the term tracks a real
perceptual regularity. If the wines are scattered, the term is a convention of
the discourse - people say it, but it does not correspond to anything a taster
groups by. Significance comes from a permutation null over wine labels, so a
term applied to many wines is not rewarded for breadth alone.

The sheets differ in size and orientation between sessions, so each session's
distances are scaled to its own diameter before being pooled. Orientation never
matters because only distances are used.
"""

import logging
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.manifold import MDS

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
LEX = ROOT / "data" / "lexicon"

log = logging.getLogger(__name__)

MIN_WINES_PER_TERM = 5
N_PERMUTATIONS = 2000


def consensus_space():
    """Pooled perceptual distances between wines, plus a 2D consensus layout."""
    nap = pd.read_parquet(RAW / "winesensed_napping.parquet")
    wines = sorted(nap["experiment_id"].unique())
    position = {w: i for i, w in enumerate(wines)}

    total = np.zeros((len(wines), len(wines)))
    seen = np.zeros_like(total)

    for _, sheet in nap.groupby(["event_name", "experiment_no"]):
        if len(sheet) < 3:
            continue
        coords = sheet[["coor1", "coor2"]].to_numpy(dtype=float)
        ids = sheet["experiment_id"].to_numpy()
        spread = np.linalg.norm(coords - coords.mean(axis=0), axis=1).max()
        if spread <= 0:
            continue
        for (a, ca), (b, cb) in combinations(zip(ids, coords), 2):
            d = np.linalg.norm(ca - cb) / spread
            i, j = position[a], position[b]
            total[i, j] += d
            total[j, i] += d
            seen[i, j] += 1
            seen[j, i] += 1

    with np.errstate(invalid="ignore", divide="ignore"):
        distances = np.where(seen > 0, total / np.maximum(seen, 1), np.nan)
    observed = np.isfinite(distances)
    np.fill_diagonal(distances, 0.0)

    # Fill unobserved pairs with the global mean so MDS has a complete matrix;
    # all statistics below use the observed entries only.
    filled = np.where(np.isfinite(distances), distances, np.nanmean(distances))
    layout = MDS(n_components=2, dissimilarity="precomputed", random_state=0,
                 normalized_stress="auto").fit_transform(filled)

    coverage = observed.sum() / (len(wines) * (len(wines) - 1))
    log.info("napping: %d wines, %d sessions, %.0f%% of pairs observed",
             len(wines), nap.groupby(["event_name", "experiment_no"]).ngroups, 100 * coverage)
    return wines, distances, layout


def wine_term_rates(wines, min_reviews=30):
    """How often each term is used about each napping wine."""
    from .lang import is_english
    from scipy import sparse

    vocab = pd.read_parquet(LEX / "vocab.parquet")
    reviews = pd.read_parquet(ROOT / "data" / "raw" / "winesensed_text.parquet",
                              columns=["review", "experiment_id"])
    reviews = reviews[reviews["experiment_id"].isin(wines)]
    reviews = reviews[reviews["review"].notna() & reviews["review"].map(is_english)]
    log.info("napping wines: %d english reviews", len(reviews))

    from .profile import _analyzer_factory
    from sklearn.feature_extraction.text import CountVectorizer

    vectorizer = CountVectorizer(
        analyzer=_analyzer_factory(set(vocab["surface"])),
        vocabulary={s: i for i, s in enumerate(vocab["surface"])},
        binary=True, dtype=np.int32,
    )
    X = vectorizer.transform(reviews["review"])

    rates, counts, kept = [], [], []
    for wine in wines:
        rows = np.flatnonzero((reviews["experiment_id"] == wine).to_numpy())
        if len(rows) < min_reviews:
            continue
        rates.append(np.asarray(X[rows].sum(axis=0)).ravel() / len(rows))
        counts.append(len(rows))
        kept.append(wine)

    log.info("wines with >=%d reviews: %d", min_reviews, len(kept))
    return kept, np.array(rates), np.array(counts), vocab["surface"].tolist()


def coherence(distances, wine_index, rates, surfaces, top_k=8, rng=None):
    """Per term: are its wines closer together than a random set of the same size?"""
    rng = rng or np.random.default_rng(0)
    n = len(wine_index)
    observed = np.isfinite(distances)

    def mean_within(idx):
        pairs = [(i, j) for i, j in combinations(idx, 2) if observed[i, j]]
        if len(pairs) < 3:
            return np.nan
        return float(np.mean([distances[i, j] for i, j in pairs]))

    # Null distribution depends only on group size, so it is sampled once per size.
    null_cache = {}

    def null_for(size):
        if size not in null_cache:
            samples = [mean_within(rng.choice(n, size, replace=False)) for _ in range(N_PERMUTATIONS)]
            null_cache[size] = np.array([s for s in samples if np.isfinite(s)])
        return null_cache[size]

    rows = []
    for t, surface in enumerate(surfaces):
        used_by = rates[:, t]
        if (used_by > 0).sum() < MIN_WINES_PER_TERM:
            continue
        size = min(top_k, int((used_by > 0).sum()))
        if size < MIN_WINES_PER_TERM:
            continue
        top = np.argsort(used_by)[::-1][:size]
        value = mean_within(top)
        if not np.isfinite(value):
            continue
        null = null_for(size)
        if len(null) < 100:
            continue
        rows.append({
            "surface": surface,
            "n_wines": int((used_by > 0).sum()),
            "within_distance": value,
            "null_mean": float(null.mean()),
            # Negative effect = tighter than chance = tracks something tasters grouped by.
            "effect": float((value - null.mean()) / (null.std() + 1e-9)),
            "p_value": float((null <= value).mean()),
        })

    df = pd.DataFrame(rows).sort_values("effect")
    log.info("scored %d terms against perceptual space", len(df))
    return df


def run():
    wines, distances, layout = consensus_space()
    kept, rates, counts, surfaces = wine_term_rates(wines)
    index = [wines.index(w) for w in kept]
    sub = distances[np.ix_(index, index)]

    scores = coherence(sub, kept, rates, surfaces)
    scores.to_parquet(LEX / "perceptual_coherence.parquet", compression="zstd", index=False)

    pd.DataFrame({"experiment_id": wines, "x": layout[:, 0], "y": layout[:, 1]}).to_parquet(
        LEX / "napping_layout.parquet", index=False)
    return scores
