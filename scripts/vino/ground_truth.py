"""Unify perceptual ground truth from independent studies into one schema.

Each study touched a different part of the elephant. Napping asked people to
place wines on a sheet by similarity. Free sorting asked them to put wines into
groups. Descriptive analysis asked trained panels to rate fixed attributes. The
methods disagree about almost everything - vocabulary, scale, training, whether
a word is used at all - but they answer one question in common:

    which wines did people perceive as alike?

That question has a method-independent answer shape: a distance between two
samples. Everything below is converted to it, so a distinction can be checked
against several studies at once rather than trusting any single one.

Distances are scaled to [0, 1] within each study, since a tablecloth's
centimetres, a sorting task's co-occurrence rate and a rating scale's units are
not comparable otherwise. Panels are kept separate where a study distinguishes
them: whether experts and novices carve the space the same way is exactly what
we want to measure, not something to average away.
"""

import logging
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SENSORY = ROOT / "data" / "raw" / "sensory"
OUT = ROOT / "data" / "corpus"

log = logging.getLogger(__name__)


def _long(dataset, method, panel, names, matrix, observations=1):
    """Square distance matrix to long form, scaled to [0, 1] within the study."""
    finite = matrix[np.isfinite(matrix)]
    scale = finite.max() if len(finite) and finite.max() > 0 else 1.0
    rows = []
    for i, j in combinations(range(len(names)), 2):
        value = matrix[i, j]
        if not np.isfinite(value):
            continue
        rows.append({
            "dataset": dataset, "method": method, "panel": panel,
            "sample_a": str(names[i]), "sample_b": str(names[j]),
            "distance": float(value / scale), "n_observations": observations,
        })
    return rows


def loire_napping():
    """10 Loire wines, 11 panelists, tablecloth coordinates (SensoMineR)."""
    import pyreadr

    data = pyreadr.read_r(str(SENSORY / "SensoMineR" / "data" / "napping.rda"))
    coords = data["napping.don"]
    names = list(coords.index) if coords.index.dtype == object else [f"wine{i}" for i in range(len(coords))]

    panelists = len(coords.columns) // 2
    total = np.zeros((len(coords), len(coords)))
    for p in range(panelists):
        xy = coords.iloc[:, [2 * p, 2 * p + 1]].to_numpy(dtype=float)
        spread = np.linalg.norm(xy - xy.mean(axis=0), axis=1).max() or 1.0
        diff = xy[:, None, :] - xy[None, :, :]
        total += np.linalg.norm(diff, axis=-1) / spread
    log.info("loire napping: %d wines, %d panelists", len(coords), panelists)
    return _long("loire_napping", "napping", "consumers", names, total / panelists, panelists)


def sorting_wines():
    """18 wines smelled blind under red light; experts and novices sorted apart."""
    import rdata

    data = rdata.read_rda(str(SENSORY / "DistatisR" / "data" / "sortingWines.rda"))["sortingWines"]
    description = data["winesDescription"]
    names = [str(n) for n in description.index]

    rows = []
    for key, panel in (("freeSortExperts", "experts"),
                       ("ternarySortExperts", "experts_ternary"),
                       ("ternarySortNovices", "novices")):
        table = np.asarray(data[key], dtype=float)
        judges = table.shape[1]
        # Two wines placed in one group by a judge are, for that judge, identical.
        together = np.zeros((len(names), len(names)))
        for j in range(judges):
            labels = table[:, j]
            together += (labels[:, None] == labels[None, :]).astype(float)
        distance = 1.0 - together / judges
        log.info("sorting %s: %d wines, %d judges", panel, len(names), judges)
        rows += _long("sorting_wines", "free_sorting", panel, names, distance, judges)
    return rows, description


def bourgogne_qda():
    """16 wines rated by 16 panelists on 33 descriptors, several replicates."""
    path = SENSORY / "wine_qda_zenodo.xlsx"
    table = pd.read_excel(path, sheet_name="Sensory_descriptive_analysis")
    names = table["Wine"].astype(str).tolist()
    values = table.drop(columns=["Wine"]).apply(pd.to_numeric, errors="coerce")

    # Each panelist is their own perceptual space; averaging ratings first would
    # impose a consensus that the panel may not have.
    panelists = {}
    for column in values.columns:
        parts = str(column).split("_")
        who = next((p for p in parts if p.lower().startswith("panelist")), None)
        if who:
            panelists.setdefault(who, []).append(column)

    total = np.zeros((len(names), len(names)))
    used = 0
    for columns in panelists.values():
        block = values[columns].to_numpy(dtype=float)
        if np.isnan(block).all():
            continue
        block = np.nan_to_num(block, nan=np.nanmean(block))
        spread = block.std() or 1.0
        diff = block[:, None, :] - block[None, :, :]
        total += np.sqrt((diff ** 2).mean(axis=-1)) / spread
        used += 1
    log.info("bourgogne qda: %d wines, %d panelists, %d columns", len(names), used, values.shape[1])
    return _long("bourgogne_qda", "descriptive_analysis", "trained_panel",
                 names, total / max(used, 1), used)


def loire_qda():
    """21 Loire wines, panel-mean ratings on 29 descriptors (FactoMineR)."""
    import pyreadr

    table = pyreadr.read_r(str(SENSORY / "FactoMineR" / "data" / "wine.rda"))["wine"]
    names = [str(n) for n in table.index]
    values = table.select_dtypes(include=[np.number]).to_numpy(dtype=float)
    values = (values - values.mean(axis=0)) / (values.std(axis=0) + 1e-9)
    diff = values[:, None, :] - values[None, :, :]
    distance = np.sqrt((diff ** 2).mean(axis=-1))
    log.info("loire qda: %d wines, %d descriptors", len(names), values.shape[1])
    return _long("loire_qda", "descriptive_analysis", "panel_mean", names, distance, 1)


def winesensed():
    """The 115 blind-tasted wines already in the project, in the same schema."""
    nap = pd.read_parquet(ROOT / "data" / "raw" / "winesensed_napping.parquet")
    wines = sorted(nap["experiment_id"].unique())
    position = {w: i for i, w in enumerate(wines)}
    total = np.zeros((len(wines), len(wines)))
    seen = np.zeros_like(total)

    for _, sheet in nap.groupby(["event_name", "experiment_no"]):
        if len(sheet) < 3:
            continue
        xy = sheet[["coor1", "coor2"]].to_numpy(dtype=float)
        ids = sheet["experiment_id"].to_numpy()
        spread = np.linalg.norm(xy - xy.mean(axis=0), axis=1).max()
        if spread <= 0:
            continue
        for (a, ca), (b, cb) in combinations(zip(ids, xy), 2):
            d = np.linalg.norm(ca - cb) / spread
            i, j = position[a], position[b]
            total[i, j] += d; total[j, i] += d
            seen[i, j] += 1; seen[j, i] += 1

    with np.errstate(invalid="ignore"):
        distance = np.where(seen > 0, total / np.maximum(seen, 1), np.nan)
    log.info("winesensed: %d wines", len(wines))
    return _long("winesensed", "napping", "consumers", wines, distance, int(seen.max()))


def build():
    rows = []
    rows += loire_napping()
    sorting_rows, description = sorting_wines()
    rows += sorting_rows
    rows += bourgogne_qda()
    rows += loire_qda()
    rows += winesensed()

    df = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "perceptual_distances.parquet", compression="zstd", index=False)
    description.to_parquet(OUT / "sorting_wines_description.parquet")

    log.info("perceptual ground truth:\n%s",
             df.groupby(["dataset", "panel"]).agg(
                 pairs=("distance", "size"),
                 samples=("sample_a", lambda s: len(set(s)) + 1)).to_string())
    return df
