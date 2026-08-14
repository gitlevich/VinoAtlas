"""How many reproducible dimensions each domain's descriptor space has.

Same instrument for every domain: the union lexicon from extract_domains.py,
so no domain is scored on another's vocabulary. Same sample size for every
domain too, since the number of axes you can recover grows with the number of
documents and the corpora differ by two orders of magnitude.

A dimension counts as real only if it survives being found twice. The documents
are split at random into halves and each half gets its own SVD. Comparing the
k-th axis of one half against the k-th of the other is too strict: when two
singular values are close their axes swap freely between halves, and a genuine
pair of dimensions reads as two failures. What is shared is a subspace, not an
ordered list, so the halves are compared by canonical correlation instead --
see reproducible() for how the width is chosen.

Rare terms are dropped before standardising. A term in 25 of 5,000 documents
becomes a high-variance spike once its column is scaled to unit variance, and
those spikes dominate the leading axes without carrying anything.

The count depends on how many documents you have, so it is reported as a curve
against sample size rather than as one number. A curve still climbing at the
end of the corpus means the domain has more structure than the data can show,
which is a different situation from a curve that has flattened.

This replaces the earlier per-domain figures, which all ran through wine's
587-term lexicon and so measured the instrument as much as the domain.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.optimize import linear_sum_assignment

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dimensionality")

AGREEMENT = 0.7
MAX_AXES = 60
COMMON_N = 5_000
SAMPLE_SIZES = (2_500, 5_000, 10_000, 20_000, 40_000, 80_000, 120_000)
SPLITS = 5
MIN_RATE = 0.005  # a term must appear in this fraction of a domain's documents


def incidence(frame, vocab):
    """Binary doc x term matrix over a fixed vocabulary."""
    index = {term: i for i, term in enumerate(vocab)}
    docs = frame["doc_id"].to_numpy()
    order = {doc: i for i, doc in enumerate(np.unique(docs))}
    rows = np.fromiter((order[d] for d in docs), dtype=np.int32, count=len(docs))
    cols = np.fromiter((index[t] for t in frame["term"]), dtype=np.int32, count=len(frame))
    data = np.ones(len(frame), dtype=np.float32)
    return sparse.csr_matrix((data, (rows, cols)), shape=(len(order), len(vocab)))


def _axes(matrix, k):
    """Right singular vectors of a column-standardised matrix."""
    dense = np.asarray(matrix.todense(), dtype=np.float64)
    dense -= dense.mean(axis=0)
    scale = dense.std(axis=0)
    dense /= np.where(scale > 0, scale, 1.0)
    _, singular, vt = np.linalg.svd(dense, full_matrices=False)
    return vt[:k], singular[:k]


def _split_once(matrix, rng, width):
    """Best one-to-one pairing between the two halves' axes, strongest first."""
    n = matrix.shape[0]
    order = rng.permutation(n)
    va, sa = _axes(matrix[order[: n // 2]], width)
    vb, _ = _axes(matrix[order[n // 2 :]], width)

    similarity = np.abs(va @ vb.T)
    rows, columns = linear_sum_assignment(-similarity)
    matched = np.sort(similarity[rows, columns])[::-1]
    return matched, (sa ** 2) / (sa ** 2).sum()


def reproducible(matrix, rng, splits=SPLITS):
    """How many directions two independent halves of the documents both find.

    Each half's axes are paired with the other's one-to-one, by the assignment
    that maximises total similarity, and a dimension counts when its pair is
    similar enough. Pairing rather than position tolerates the axis swapping
    that close singular values cause. Pairing one-to-one rather than comparing
    whole subspaces is what keeps the measure honest: two subspaces of any
    real width overlap substantially by geometry alone, which the shuffled
    null shows plainly, whereas two individual unit vectors in a space this
    size do not.

    Several splits are averaged so the count does not depend on which shuffle
    it happened to get.
    """
    n = matrix.shape[0]
    width = min(MAX_AXES, matrix.shape[1] // 4, n // 20)
    if width < 2:
        return 0, np.zeros(1), np.zeros(1)

    counts, matches = [], []
    for _ in range(splits):
        matched, variance = _split_once(matrix, rng, width)
        counts.append(int((matched >= AGREEMENT).sum()))
        matches.append(matched)
    return int(np.median(counts)), np.median(matches, axis=0), variance


def shuffled_null(matrix, rng):
    """Same measurement on a matrix whose columns have been independently shuffled.

    Destroys co-occurrence while preserving every term's marginal frequency, so
    whatever agreement survives is what the procedure grants for free.
    """
    dense = np.asarray(matrix.todense())
    for column in range(dense.shape[1]):
        rng.shuffle(dense[:, column])
    count, agreement, _ = reproducible(sparse.csr_matrix(dense), rng)
    return count, agreement


def measure(frame, vocab, rng, n=None, label=""):
    docs = frame["doc_id"].unique()
    if n and len(docs) > n:
        keep = set(rng.choice(docs, n, replace=False))
        frame = frame[frame["doc_id"].isin(keep)]
    matrix = incidence(frame, vocab)
    rate = np.asarray(matrix.mean(axis=0)).ravel()
    matrix = matrix[:, rate >= MIN_RATE]
    count, agreement, variance = reproducible(matrix, rng)
    log.info("%-28s docs=%6d terms=%4d dims=%2d  matched[0:6]=%s  var[0:3]=%s",
             label, matrix.shape[0], matrix.shape[1], count,
             np.round(agreement[:6], 2), np.round(variance[:3] * 100, 1))
    return count, matrix


if __name__ == "__main__":
    rng = np.random.default_rng(0)
    doc_terms = pd.read_parquet(LEX / "domain_doc_terms.parquet")
    doc_terms["domain"] = doc_terms["domain"].astype(str)
    doc_terms["term"] = doc_terms["term"].astype(str)

    vocab = sorted(doc_terms["term"].unique())
    log.info("union lexicon: %d terms", len(vocab))
    per_domain = doc_terms.groupby("domain")["term"].nunique()
    log.info("own-vocabulary sizes: %s", per_domain.to_dict())

    log.info("--- per domain, union lexicon, %d docs each ---", COMMON_N)
    results = {}
    for domain, frame in doc_terms.groupby("domain"):
        count, _ = measure(frame, vocab, rng, n=COMMON_N, label=domain)
        results[domain] = count

    log.info("--- dimensions against sample size ---")
    curves = {}
    for domain, frame in doc_terms.groupby("domain"):
        available = frame["doc_id"].nunique()
        counts = []
        for n in SAMPLE_SIZES:
            if n > available:
                break
            count, _ = measure(frame, vocab, rng, n=n, label=f"{domain} n={n}")
            counts.append((n, count))
        curves[domain] = counts

    log.info("--- pooled: all domains stacked ---")
    pooled = doc_terms.copy()
    pooled["doc_id"] = pooled["domain"] + ":" + pooled["doc_id"].astype(str)
    sample = pooled.groupby("domain", group_keys=False).apply(
        lambda g: g[g["doc_id"].isin(rng.choice(g["doc_id"].unique(),
                    min(COMMON_N, g["doc_id"].nunique()), replace=False))])
    pooled_count, matrix = measure(sample, vocab, rng, label="pooled (6 domains)")

    log.info("--- null ---")
    null_count, null_agreement = shuffled_null(matrix[:4000], rng)
    log.info("shuffled columns: dims=%d matched[0:5]=%s",
             null_count, np.round(null_agreement[:5], 2))

    for domain, counts in curves.items():
        log.info("%-10s %s", domain, " ".join(f"{n//1000 or n}k:{c}" if n >= 1000
                                              else f"{n}:{c}" for n, c in counts))
    log.info("pooled=%d", pooled_count)
