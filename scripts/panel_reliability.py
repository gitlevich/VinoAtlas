"""Judge-split reliability for every route-separated attribute in the panel data.

Consumes the WineAtlas evidence model (model/observations.jsonl) and writes one
row per (dataset, modality, term): can two disjoint halves of the panel rank
the wines the same way on that attribute?

Three requirements from the WineAtlas audit of the first version, all binding:

  repeats     a (wine, judge, modality, term) cell may hold several repeated
              measurements (Loire 2, chemistry 3, QTL up to 4); they are
              averaged, never last-write-wins.
  statistic   the score is a PEARSON correlation of half-panel wine means --
              location- and scale-invariant, but not rank-based, and not
              described as such.
  partitions  every attribute within a dataset is scored on the same 30
              precomputed partitions of the dataset's judge universe,
              restricted per attribute to the judges who rated it. The output
              records how many splits were usable and how many wines each
              contributed, so `splits` means what it says.

Percepts are keyed by (modality, term), never by term alone: the chemistry
panel measures each name on two routes, and collapsing them scrambles both.
"""

import json
import logging
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

OBSERVATIONS = Path("/Users/vlad/WineAtlas/model/observations.jsonl")
OUT = Path(__file__).resolve().parent.parent / "data" / "lexicon" / "panel_reliability.parquet"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("panel")

DATASETS = ("red_wine_sensory_chemistry_2018", "nz_pinot_noir_2020",
            "wine_qtl_sensory_2026", "loire_chenin_2016")
SPLITS = 30
MIN_JUDGES = 4
MIN_WINES = 8


def load(dataset):
    """Cell means over repeated measurements: (wine, judge) -> key -> value."""
    totals = defaultdict(lambda: defaultdict(float))
    counts = defaultdict(lambda: defaultdict(int))
    for line in open(OBSERVATIONS):
        record = json.loads(line)
        if record["dataset_id"] != dataset:
            continue
        if not isinstance(record.get("value"), (int, float)):
            continue
        cell = (record["wine_id"], record["observer_id"])
        key = (record["modality"], record["normalized_term"])
        totals[cell][key] += record["value"]
        counts[cell][key] += 1
    return {cell: {key: totals[cell][key] / counts[cell][key] for key in totals[cell]}
            for cell in totals}


def judge_partitions(judges, splits=SPLITS, seed=0):
    """Fixed partitions of the dataset's full judge universe, shared by all attributes."""
    rng = np.random.default_rng(seed)
    return [rng.permutation(judges).tolist() for _ in range(splits)]


def reliability(cells, key, partitions):
    triples = [(w, j, values[key]) for (w, j), values in cells.items() if key in values]
    wines = sorted({w for w, _, _ in triples})
    judges = {j for _, j, _ in triples}
    if len(judges) < MIN_JUDGES or len(wines) < MIN_WINES:
        return None, 0, len(wines), len(judges), 0.0

    row = {w: i for i, w in enumerate(wines)}
    column = {j: i for i, j in enumerate(sorted(judges))}
    matrix = np.full((len(wines), len(column)), np.nan)
    for w, j, value in triples:
        matrix[row[w], column[j]] = value

    correlations, wines_used = [], []
    for order in partitions:
        present = [j for j in order if j in judges]
        half = len(present) // 2
        if half < MIN_JUDGES // 2:
            continue
        a = np.nanmean(matrix[:, [column[j] for j in present[:half]]], axis=1)
        b = np.nanmean(matrix[:, [column[j] for j in present[half:]]], axis=1)
        both = ~(np.isnan(a) | np.isnan(b))
        if both.sum() < MIN_WINES or a[both].std() == 0 or b[both].std() == 0:
            continue
        correlations.append(np.corrcoef(a[both], b[both])[0, 1])
        wines_used.append(int(both.sum()))

    if not correlations:
        return None, 0, len(wines), len(judges), 0.0
    return (float(np.median(correlations)), len(correlations),
            len(wines), len(judges), float(np.mean(wines_used)))


if __name__ == "__main__":
    previous = pd.read_parquet(OUT).set_index(["dataset", "modality", "term"]) \
        if OUT.exists() else None

    rows = []
    for dataset in DATASETS:
        cells = load(dataset)
        keys = sorted({key for values in cells.values() for key in values})
        partitions = judge_partitions(sorted({j for _, j in cells}))
        for modality, term in keys:
            score, used, wines, judges, mean_wines = reliability(
                cells, (modality, term), partitions)
            rows.append(dict(dataset=dataset, modality=modality, term=term,
                             judge_split_r=score, splits_used=used,
                             wines=wines, judges=judges,
                             mean_wines_per_split=round(mean_wines, 1)))
        log.info("%s: %d route-separated attributes", dataset, len(keys))

    frame = pd.DataFrame(rows)
    frame.to_parquet(OUT, compression="zstd", index=False)
    log.info("wrote %s (%d rows, %d scored)", OUT, len(frame),
             int(frame["judge_split_r"].notna().sum()))

    if previous is not None and "judge_split_r" in previous:
        merged = frame.set_index(["dataset", "modality", "term"]).join(
            previous["judge_split_r"].rename("old"), how="left")
        delta = (merged["judge_split_r"] - merged["old"]).dropna()
        log.info("audit vs previous artifact: %d comparable, %d moved by >0.05, "
                 "max %+.3f / %+.3f", len(delta), int((delta.abs() > 0.05).sum()),
                 delta.max(), delta.min())
        moved = merged.loc[delta.abs().sort_values(ascending=False).head(6).index]
        log.info("largest moves:\n%s",
                 moved[["old", "judge_split_r"]].round(3).to_string())
