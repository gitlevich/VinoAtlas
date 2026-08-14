"""Collect characteristic words and score how stable each one is.

The working assumption, adopted deliberately: if two words are used alike, the
wine characteristic they name is alike. This is a modelling choice, not a
finding — the model being built is a model of the discourse, of what
distinctions people name and how those names relate. Grounding happens
per-person on the tasting side, not by consensus.

What that leaves to measure is stability. A word's meaning here is its
neighbourhood: the company it keeps. If a word keeps the same company across
communities that never read each other, it names something the communities
arrived at independently. If its neighbourhood scrambles between corpora, it is
local habit, or a word doing different jobs in different places.

So each discourse family gets its own co-occurrence geometry, computed
separately, and a term is scored by how much of its neighbourhood survives the
move between them. Nothing is thrown away on a low score — an unstable word is
still a word people use, and where it is unstable is itself informative.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

ROOT = Path(__file__).resolve().parents[2]
LEX = ROOT / "data" / "lexicon"

log = logging.getLogger(__name__)

NEIGHBOURS = 25
MIN_DOCS_PER_FAMILY = 30


def _ppmi_neighbours(X, k=NEIGHBOURS):
    """Top-k co-occurrence neighbours for every term within one corpus."""
    X = X.astype(np.float64)
    n_docs = X.shape[0]
    co = (X.T @ X).toarray()
    counts = np.diag(co).copy()
    np.fill_diagonal(co, 0)

    expected = np.outer(counts, counts) / max(n_docs, 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        pmi = np.log2((co + 0.5) / (expected + 0.5))
    pmi = np.nan_to_num(pmi)

    order = np.argsort(-pmi, axis=1)[:, :k]
    return order, counts


def run(k=NEIGHBOURS):
    vocab = pd.read_parquet(LEX / "vocab_classified.parquet")
    doc_term = sparse.load_npz(LEX / "doc_term.npz").tocsr()
    meta = pd.read_parquet(LEX / "doc_meta.parquet")
    surfaces = vocab["surface"].to_numpy()

    families = [f for f in meta["family"].unique() if (meta["family"] == f).sum() > 5000]
    log.info("families: %s", families)

    neighbours, present = {}, {}
    for family in families:
        rows = np.flatnonzero((meta["family"] == family).to_numpy())
        block = doc_term[rows]
        order, counts = _ppmi_neighbours(block, k)
        neighbours[family] = order
        present[family] = counts >= MIN_DOCS_PER_FAMILY
        log.info("%s: %d reviews, %d terms above floor", family, len(rows), present[family].sum())

    pairs = [(a, b) for i, a in enumerate(families) for b in families[i + 1:]]
    scores = np.full((len(surfaces), len(pairs)), np.nan)
    for p, (a, b) in enumerate(pairs):
        both = present[a] & present[b]
        for i in np.flatnonzero(both):
            first, second = set(neighbours[a][i]), set(neighbours[b][i])
            scores[i, p] = len(first & second) / len(first | second)

    out = pd.DataFrame({"surface": surfaces})
    for p, (a, b) in enumerate(pairs):
        out[f"stability_{a}_{b}"] = scores[:, p]
    out["stability"] = np.nanmean(scores, axis=1)
    out["n_corpora"] = sum(present[f] for f in families)

    out = out.merge(vocab[["surface", "class", "is_percept", "groundable", "df_total",
                           "critic_lift", "referent_n"]], on="surface", how="left")
    out.to_parquet(LEX / "persistence.parquet", compression="zstd", index=False)

    scored = out[out["stability"].notna()]
    log.info("scored %d terms present in at least two corpora", len(scored))
    log.info("stability by class:\n%s",
             scored.groupby("class")["stability"].agg(["count", "mean"]).round(3)
             .sort_values("mean", ascending=False).to_string())
    return out
