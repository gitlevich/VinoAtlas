"""Consensus perceptual dimensionality of the QTL wine panel, repeat-safe.

Source: WineAtlas evidence model, dataset wine_qtl_sensory_2026 (Heinekamp et
al. 2026, Frontiers in Plant Science, DOI 10.3389/fpls.2026.1851889, sensory
sheet s006, CC BY 4.0). 1,332 wines x 56 judges x 17 fields on the released
matrix; repeated evaluations (up to 4 per cell) are averaged, never
last-write-wins.

The question: how many directions in wine-attribute space do two disjoint
halves of the judge panel both find? Halves are compared by one-to-one
maximum-similarity assignment between their SVD axes. Assignment prevents axis
reuse but still selects the best available partner for every axis, so chance
alone produces matches: on wine-shuffled data (values permuted within each
judge-attribute vector, preserving marginals, missingness and scales while
destroying shared wine structure) the median matched count at cosine 0.7 is
about two, not zero. An earlier version of this docstring claimed a zero null;
that was true of the sparse text-corpus regime the estimator came from and is
false here. Every count is therefore reported against the shuffled null across
thresholds, and no single number is called THE dimension count.

Only the eleven perceptual fields enter; the six evaluative fields are
excluded by the WineAtlas classification (wineatlas/broad_sources.py:
QTL_MODALITIES) because evaluation is more judge-reliable than perception and
would inflate the count with rating-instrument structure.

Writes data/lexicon/qtl_dimensionality.json with every parameter it used.
"""

import json
import logging
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

OBSERVATIONS = Path("/Users/vlad/WineAtlas/model/observations.jsonl")
OUT = Path(__file__).resolve().parent.parent / "data" / "lexicon" / "qtl_dimensionality.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qtl")

PERCEPTUAL = ["bitter", "floral", "fruity", "green", "intensity A", "intensity T",
              "off flavor", "persistance", "sour", "sweet", "tropical fruit"]
EVALUATIVE = ["genuiness A", "genuiness T", "quality A", "quality T",
              "overall judgment", "total quality score"]
THRESHOLDS = (0.5, 0.6, 0.7, 0.8, 0.9)
AGREEMENT = 0.7          # legacy default; results are reported across THRESHOLDS
SPLITS = 30
# All eleven attribute columns are unconstrained scales; nothing reduces the
# feature rank below 11 when wines >> attributes. The k-1 width used for the
# terpene panel was a simplex constraint (compositions sum to one) and does
# not apply here -- carrying it over capped the estimator artificially.
WIDTH = len(PERCEPTUAL)
SEED = 0


def tensor():
    """wines x judges x attributes, repeated measurements averaged."""
    totals, counts = defaultdict(float), defaultdict(int)
    for line in open(OBSERVATIONS):
        record = json.loads(line)
        if record["dataset_id"] != "wine_qtl_sensory_2026":
            continue
        if not isinstance(record.get("value"), (int, float)):
            continue
        key = (record["wine_id"], record["observer_id"], record["normalized_term"])
        totals[key] += record["value"]
        counts[key] += 1

    wines = sorted({w for w, _, _ in totals})
    judges = sorted({j for _, j, _ in totals})
    index = {name: axis for axis, name in enumerate(PERCEPTUAL)}
    cube = np.full((len(wines), len(judges), len(PERCEPTUAL)), np.nan)
    row = {w: i for i, w in enumerate(wines)}
    col = {j: i for i, j in enumerate(judges)}
    for (w, j, term), total in totals.items():
        if term in index:
            cube[row[w], col[j], index[term]] = total / counts[(w, j, term)]
    return cube, wines, judges


def axes(matrix, k):
    matrix = matrix - matrix.mean(0)
    scale = matrix.std(0)
    matrix = matrix / np.where(scale > 0, scale, 1)
    _, _, vt = np.linalg.svd(matrix, full_matrices=False)
    return vt[:k]


def matched_similarities(a, b, width):
    """Assigned axis-pair similarities, descending."""
    similarity = np.abs(axes(a, width) @ axes(b, width).T)
    rows, cols = linear_sum_assignment(-similarity)
    return np.sort(similarity[rows, cols])[::-1]


def matched(a, b, width, threshold=AGREEMENT):
    return int((matched_similarities(a, b, width) >= threshold).sum())


def shuffle_wines(cube, rng):
    """Permute wine values within every (judge, attribute) vector.

    Preserves each vector's marginal distribution, missingness pattern, judge
    coverage and attribute scale; destroys only the shared wine structure.
    """
    null = cube.copy()
    for j in range(cube.shape[1]):
        for t in range(cube.shape[2]):
            column = null[:, j, t]
            present = ~np.isnan(column)
            values = column[present]
            column[present] = values[rng.permutation(len(values))]
    return null


def judge_split(cube, keep, rng, splits=SPLITS):
    counts = []
    for _ in range(splits):
        order = rng.permutation(cube.shape[1])
        half = cube.shape[1] // 2
        a = np.nanmean(cube[:, order[:half], :], axis=1)[keep]
        b = np.nanmean(cube[:, order[half:], :], axis=1)[keep]
        counts.append(matched(a, b, WIDTH))
    return counts


def summarize(counts):
    return dict(median=int(np.median(counts)),
                p10=int(np.percentile(counts, 10)),
                p90=int(np.percentile(counts, 90)))


if __name__ == "__main__":
    cube, wines, judges = tensor()
    means = np.nanmean(cube, axis=1)
    keep = ~np.isnan(means).any(axis=1)
    log.info("tensor %s, usable wines %d", cube.shape, int(keep.sum()))

    rng = np.random.default_rng(SEED)
    partitions = [np.random.default_rng(SEED + 100 + i).permutation(cube.shape[1])
                  for i in range(SPLITS)]

    def split_sims(tensor_):
        sims = []
        for order in partitions:
            half = tensor_.shape[1] // 2
            a = np.nanmean(tensor_[:, order[:half], :], axis=1)[keep]
            b = np.nanmean(tensor_[:, order[half:], :], axis=1)[keep]
            sims.append(matched_similarities(a, b, WIDTH))
        return np.array(sims)

    # Axis semantics. The full-panel SVD supplies axis IDENTITY only; the
    # success test is the direct cosine between the two disjoint halves' axes
    # after each is mapped to the full axis independently. Testing each half
    # against the full reference itself leaks -- the reference contains the
    # half under test -- which an earlier version of this function did
    # (WineAtlas audit, 2026-08-12). Nulls are calibrated over several
    # independently shuffled tensors, not one draw.
    def half_pair_frequency(tensor_, full):
        freq = np.zeros(WIDTH)
        for order in partitions:
            half = tensor_.shape[1] // 2
            va = axes(np.nanmean(tensor_[:, order[:half], :], axis=1)[keep], WIDTH)
            vb = axes(np.nanmean(tensor_[:, order[half:], :], axis=1)[keep], WIDTH)
            mapped = {}
            for side, v in (("a", va), ("b", vb)):
                S = np.abs(full @ v.T)
                r, c = linear_sum_assignment(-S)
                for i, j in zip(r, c):
                    mapped.setdefault(i, {})[side] = v[j]
            for i, pair in mapped.items():
                if "a" in pair and "b" in pair:
                    freq[i] += abs(float(pair["a"] @ pair["b"])) >= AGREEMENT
        return freq / SPLITS

    NULL_TENSORS = 10

    observed_sims = split_sims(cube)
    null_sims = split_sims(shuffle_wines(cube, np.random.default_rng(SEED + 999)))

    calibration = {}
    for threshold in THRESHOLDS:
        obs = (observed_sims >= threshold).sum(axis=1)
        nul = (null_sims >= threshold).sum(axis=1)
        calibration[threshold] = dict(
            observed=summarize(obs.tolist()), null=summarize(nul.tolist()),
            observed_counts=obs.tolist(), null_counts=nul.tolist(),
            null_excess_median=float(np.median(obs) - np.median(nul)))
        log.info("threshold %.1f: observed %s null %s excess %.0f", threshold,
                 summarize(obs.tolist()), summarize(nul.tolist()),
                 calibration[threshold]["null_excess_median"])
    rank_medians = np.median(observed_sims, axis=0)
    log.info("matched similarities by rank: %s", np.round(rank_medians, 3).tolist())
    headline = (observed_sims >= AGREEMENT).sum(axis=1).tolist()

    full_axes = axes(np.nanmean(cube, axis=1)[keep], WIDTH)
    direct = half_pair_frequency(cube, full_axes)
    nulls = np.array([half_pair_frequency(
        shuffle_wines(cube, np.random.default_rng(SEED + 2000 + n)),
        axes(np.nanmean(shuffle_wines(cube, np.random.default_rng(SEED + 2000 + n)),
                        axis=1)[keep], WIDTH))
        for n in range(NULL_TENSORS)])
    axis_block = []
    for i in range(WIDTH):
        loading = {PERCEPTUAL[t]: round(float(full_axes[i, t]), 3)
                   for t in np.argsort(-np.abs(full_axes[i])) if abs(full_axes[i, t]) >= 0.25}
        axis_block.append(dict(
            axis=i + 1,
            direct_half_pair_frequency=round(float(direct[i]), 2),
            null_mean=round(float(nulls[:, i].mean()), 2),
            null_min=round(float(nulls[:, i].min()), 2),
            null_max=round(float(nulls[:, i].max()), 2),
            loadings=loading,
            note="loadings are geometric evidence about relations among "
                 "qualities, not admission of a node"))
        log.info("axis %2d direct %.2f (null %.2f [%.2f-%.2f])  %s",
                 i + 1, direct[i], nulls[:, i].mean(), nulls[:, i].min(),
                 nulls[:, i].max(),
                 ", ".join(f"{k} {v:+.2f}" for k, v in loading.items()))

    wine_curve = {}
    complete = means[keep]
    for n in (100, 200, 400, 800, int(keep.sum())):
        counts = []
        for _ in range(9):
            chosen = rng.choice(len(complete), n, replace=False)
            order = rng.permutation(n)
            counts.append(matched(complete[chosen][order[: n // 2]],
                                  complete[chosen][order[n // 2:]], WIDTH))
        wine_curve[n] = summarize(counts)
        log.info("wine-split, n=%d: %s", n, wine_curve[n])

    # Wine-difference stability after averaging k judges. This is NOT a panel
    # consensus curve: it splits wines, not judges, and says only how stable
    # the wine structure is at a given averaging depth.
    wine_stability_by_averaged_judge_count = {}
    for k in (2, 4, 8, 16, 32, 56):
        counts = []
        for _ in range(9):
            chosen = rng.choice(cube.shape[1], k, replace=False)
            m = np.nanmean(cube[:, chosen, :], axis=1)
            usable = m[~np.isnan(m).any(axis=1)]
            order = rng.permutation(len(usable))
            counts.append(matched(usable[order[: len(usable) // 2]],
                                  usable[order[len(usable) // 2:]], WIDTH))
        wine_stability_by_averaged_judge_count[k] = summarize(counts)

    # Panel-size consensus: two DISJOINT k-judge panels, one matrix each,
    # matched on the wines complete in both. Coverage is part of the result --
    # small panels rate fewer wines in common, and a dimension count without
    # its wine base would overstate what was measured.
    # Panel-size consensus on the SAME 30 judge partitions as the headline:
    # panels are the first k judges of each partition half, so k=28 is exactly
    # the headline construction and must reconcile with it.
    panel_consensus = {}
    for k in (2, 4, 8, 16, 28):
        counts, coverage = [], []
        for order in partitions:
            half = cube.shape[1] // 2
            a = np.nanmean(cube[:, order[:half][:k], :], axis=1)
            b = np.nanmean(cube[:, order[half:][:k], :], axis=1)
            both = ~(np.isnan(a).any(axis=1) | np.isnan(b).any(axis=1))
            if both.sum() < 40:
                counts.append(None); coverage.append(int(both.sum()))
                continue
            counts.append(matched(a[both], b[both], WIDTH))
            coverage.append(int(both.sum()))
        usable = [c for c in counts if c is not None]
        panel_consensus[k] = dict(**summarize(usable), splits=len(usable),
                                  raw_counts=counts, coverage_per_split=coverage)
        log.info("panels of %d (30 shared partitions): %s cov med %d",
                 k, summarize(usable), int(np.median(coverage)))

    OUT.write_text(json.dumps(dict(
        source=dict(dataset="wine_qtl_sensory_2026",
                    doi="10.3389/fpls.2026.1851889", sheet="s006",
                    licence="CC BY 4.0",
                    note="dimensionality estimates are our transformation, "
                         "not a finding reported by the authors"),
        included_attributes=PERCEPTUAL,
        excluded_fields=EVALUATIVE,
        parameters=dict(agreement_threshold=AGREEMENT, width=WIDTH,
                        splits=SPLITS, seed=SEED,
                        repeat_aggregation="mean per (wine, judge, term) cell",
                        matching="one-to-one maximum-similarity assignment "
                                 "between split-half SVD axes"),
        tensor=dict(wines=len(wines), judges=len(judges),
                    attributes=len(PERCEPTUAL), usable_wines=int(keep.sum())),
        judge_split_consensus=dict(
            statement="median eight matched axes at cosine 0.7; shuffled null "
                      "median two; no single threshold-free dimension count "
                      "is claimed",
            at_legacy_threshold=summarize(headline)),
        judge_split_counts=headline,
        null_calibration={str(k): v for k, v in calibration.items()},
        matched_similarities_by_rank=np.round(rank_medians, 4).tolist(),
        axis_semantics=axis_block,
        wine_saturation=wine_curve,
        wine_stability_by_averaged_judge_count=wine_stability_by_averaged_judge_count,
        panel_consensus_by_size=panel_consensus,
    ), indent=1))
    log.info("wrote %s", OUT)
