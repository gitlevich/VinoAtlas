"""Discover named contrasts from the modifier slots of head nouns.

A head noun that attracts many modifiers ("tannins", "acidity", "finish") is a
distinction the discourse has already named. The modifiers filling its slot are
that distinction's value space, and recovering the axis means finding the
bipolar structure inside it.

Opposition is measured inside the slot and nowhere else. Two words are opposed
when they rarely describe *the same tannins* - not when they rarely appear in
the same review, which mostly measures whether a writer is casual or florid.
Two independent signals, both local to the slot:

  exclusion       Co-occurrence as fillers of one head in one review, against
                  what their separate rates predict. Compatible descriptions
                  stack ("soft, ripe tannins"); opposed ones do not.

  coordination    How the writer joined them. "soft yet firm" is a contrast
                  flagged by the author; "soft and silky" is a list. This is
                  sparse but nearly noise-free where it exists.

Evaluative vocabulary is removed first. Praise is a real dimension of tasting
notes and a strong one, which is exactly why it must be kept out: it is a
judgement of the wine, not a distinction within it, and left in it swamps
every slot with pleasant-versus-unpleasant.

Each axis is recomputed separately in the critic and community subcorpora. An
axis that both discourses draw the same way is a candidate for something real;
one that only critics draw is a candidate for convention.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
LEX = ROOT / "data" / "lexicon"

log = logging.getLogger(__name__)

MIN_HEAD_DOCS = 400        # reviews that must modify the head at all
MIN_MODIFIER_DOCS = 25     # reviews that must use a given modifier on it
MIN_SLOT_SIZE = 6
EXCLUDED_CLASSES = ("evaluation", "commerce", "discourse", "provenance")
SMOOTHING = 2.0


def _association(observed, marginal, n_docs):
    """Log-odds of two modifiers filling the same slot in the same review."""
    expected = np.outer(marginal, marginal) / max(n_docs, 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        assoc = np.log2((observed + SMOOTHING) / (expected + SMOOTHING))
    np.fill_diagonal(assoc, 0.0)
    return np.nan_to_num(assoc)


def _coordination_bonus(terms, subset):
    """Author-flagged contrast, where the corpus happens to record it."""
    bonus = np.zeros((len(terms), len(terms)))
    if subset is None or subset.empty:
        return bonus
    position = {t: i for i, t in enumerate(terms)}
    for row in subset.itertuples():
        i, j = position.get(row.term_a), position.get(row.term_b)
        if i is None or j is None:
            continue
        weight = np.log1p(row.n)
        value = weight if row.conjunction == "contrast" else -weight
        bonus[i, j] += value
        bonus[j, i] += value
    return bonus


def _split(terms, assoc, opposition):
    """Pick the most opposed pair, then let every filler take a side."""
    i, j = np.unravel_index(np.argmax(opposition), opposition.shape)
    if opposition[i, j] <= 0:
        return None

    # A filler belongs with whichever anchor it keeps company with.
    side = assoc[:, i] - assoc[:, j]
    side[i], side[j] = 1.0, -1.0
    group_a = [terms[k] for k in np.argsort(side)[::-1] if side[k] > 0]
    group_b = [terms[k] for k in np.argsort(side) if side[k] < 0]
    if len(group_a) < 2 or len(group_b) < 2:
        return None
    return group_a, group_b


def _coherence(terms, assoc, group_a, group_b):
    """Within-group company minus across-group company; 0 means no structure."""
    position = {t: i for i, t in enumerate(terms)}
    a = [position[t] for t in group_a]
    b = [position[t] for t in group_b]
    within = (assoc[np.ix_(a, a)].sum() + assoc[np.ix_(b, b)].sum()) / max(len(a) ** 2 + len(b) ** 2, 1)
    across = assoc[np.ix_(a, b)].mean()
    return float(within - across)


def _slot_stats(subset):
    """Per-review fillers of one head, as a document-by-modifier incidence matrix."""
    from scipy import sparse

    if subset.empty:
        return None, None, None, 0

    counts = subset.groupby("modifier", observed=True)["doc_id"].nunique()
    counts = counts[counts >= MIN_MODIFIER_DOCS]
    if len(counts) < MIN_SLOT_SIZE:
        return None, None, None, 0

    subset = subset[subset["modifier"].isin(counts.index)]
    terms = counts.index.tolist()
    position = {t: i for i, t in enumerate(terms)}

    doc_codes, docs = pd.factorize(subset["doc_id"])
    mod_codes = subset["modifier"].map(position).to_numpy()
    incidence = sparse.csr_matrix(
        (np.ones(len(subset)), (doc_codes, mod_codes)),
        shape=(len(docs), len(terms)),
    )
    incidence.data[:] = 1.0
    incidence.sum_duplicates()
    incidence.data[:] = 1.0

    observed = (incidence.T @ incidence).toarray()
    marginal = observed.diagonal().copy()
    np.fill_diagonal(observed, 0.0)
    return terms, observed, marginal, len(docs)


def _axis_for(subset, coordination):
    terms, observed, marginal, n_docs = _slot_stats(subset)
    if terms is None:
        return None
    assoc = _association(observed, marginal, n_docs)
    counts = dict(zip(terms, marginal.astype(int)))
    opposition = -assoc + _coordination_bonus(terms, coordination)
    np.fill_diagonal(opposition, -np.inf)

    split = _split(terms, assoc, opposition)
    if split is None:
        return None
    group_a, group_b = split
    return {
        "terms": terms,
        "assoc": assoc,
        "group_a": group_a,
        "group_b": group_b,
        "counts": counts,
        "coherence": _coherence(terms, assoc, group_a, group_b),
        "n_docs": n_docs,
    }


def _agreement(reference, other):
    """Share of shared vocabulary placed on the same side by both discourses."""
    if other is None:
        return np.nan
    ref_a, ref_b = set(reference["group_a"]), set(reference["group_b"])
    oth_a, oth_b = set(other["group_a"]), set(other["group_b"])
    shared = (ref_a | ref_b) & (oth_a | oth_b)
    if len(shared) < 4:
        return np.nan
    same = sum(1 for t in shared if (t in ref_a) == (t in oth_a))
    # Pole labels are arbitrary, so a consistent flip counts as agreement.
    return max(same, len(shared) - same) / len(shared)


def discover():
    vocab = pd.read_parquet(LEX / "vocab_classified.parquet")
    records = pd.read_parquet(LEX / "slot_records.parquet")
    coordinations = pd.read_parquet(LEX / "coordinations.parquet")
    coordinations = coordinations.groupby(["term_a", "term_b", "head", "conjunction"],
                                          as_index=False)["n"].sum()

    allowed = set(vocab.loc[~vocab["class"].isin(EXCLUDED_CLASSES), "surface"])
    log.info("modifier vocabulary after removing %s: %d terms", EXCLUDED_CLASSES, len(allowed))

    head_docs = records.groupby("head", observed=True)["doc_id"].nunique()
    heads = head_docs[head_docs >= MIN_HEAD_DOCS].index.tolist()
    log.info("candidate heads: %d", len(heads))

    records = records[records["modifier"].isin(allowed)]
    by_head = dict(tuple(records.groupby("head", observed=True)))
    coordination_by_head = dict(tuple(coordinations.groupby("head")))

    rows = []
    for head in heads:
        subset = by_head.get(head)
        if subset is None:
            continue
        coordination = coordination_by_head.get(head)
        axis = _axis_for(subset, coordination)
        if axis is None or axis["coherence"] <= 0:
            continue

        counts = axis["counts"]
        name_a = max(axis["group_a"], key=lambda t: counts[t])
        name_b = max(axis["group_b"], key=lambda t: counts[t])

        rows.append({
            "head": head,
            "pole_a": name_a,
            "pole_b": name_b,
            "terms_a": axis["group_a"][:20],
            "terms_b": axis["group_b"][:20],
            "coherence": round(axis["coherence"], 3),
            "n_docs": axis["n_docs"],
            "slot_size": len(counts),
            "critic_agreement": _agreement(axis, _axis_for(subset[subset["family"] == "winemag"], coordination)),
            "community_agreement": _agreement(axis, _axis_for(subset[subset["family"] == "vivino"], coordination)),
        })

    df = pd.DataFrame(rows).sort_values("n_docs", ascending=False)
    df.to_parquet(LEX / "axes.parquet", compression="zstd", index=False)
    log.info("discovered %d axes with positive coherence", len(df))
    return df
