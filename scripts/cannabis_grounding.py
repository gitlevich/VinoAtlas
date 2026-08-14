"""Which cannabis descriptors are chemically grounded, and which float free.

For each descriptor, predict how often strains attract that word from their
terpene composition alone, and score the prediction on strains the model never
saw. A word that survives this is anchored to something measurable in the
material. A word that fails is not thereby meaningless -- it may name an
effect, a context, or a distinction the nine reported terpenes miss -- but it
cannot be taught by pointing at the chemistry.

The threshold comes from a permutation null rather than from a table: strain
labels are shuffled between the two tables and the whole procedure repeated, so
the cutoff already contains whatever the pipeline manufactures on its own.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import KFold

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("grounding")

FOLDS = 5
PERMUTATIONS = 200
ALPHAS = np.logspace(-2, 3, 12)


def cross_validated(features, target, rng):
    """Out-of-fold predictions, so nothing is scored on data it was fitted to."""
    predicted = np.zeros(len(target))
    splitter = KFold(FOLDS, shuffle=True, random_state=int(rng.integers(1 << 30)))
    for train, test in splitter.split(features):
        model = RidgeCV(alphas=ALPHAS).fit(features[train], target[train])
        predicted[test] = model.predict(features[test])
    return spearmanr(predicted, target).statistic


def run():
    chem = pd.read_parquet(LEX / "cannabis_strain_chem.parquet")
    text = pd.read_parquet(LEX / "cannabis_strain_text.parquet")
    rng = np.random.default_rng(0)

    features = chem.to_numpy(float)
    features = (features - features.mean(0)) / features.std(0)
    log.info("%d strains, %d terpenes, %d descriptors",
             len(chem), features.shape[1], text.shape[1])

    scores = {}
    for term in text.columns:
        scores[term] = cross_validated(features, text[term].to_numpy(float), rng)
    scores = pd.Series(scores).sort_values(ascending=False)

    # Null: break the correspondence between a strain's words and its chemistry,
    # keeping both tables otherwise intact.
    null = []
    for _ in range(PERMUTATIONS):
        order = rng.permutation(len(chem))
        term = text.columns[rng.integers(text.shape[1])]
        null.append(cross_validated(features, text[term].to_numpy(float)[order], rng))
    cutoff = float(np.percentile(null, 95))
    log.info("null: median %.3f, 95th percentile %.3f", float(np.median(null)), cutoff)

    grounded = scores[scores > cutoff]
    log.info("grounded descriptors: %d of %d (%.0f%%)",
             len(grounded), len(scores), 100 * len(grounded) / len(scores))
    log.info("strongest:\n%s", grounded.head(25).round(3).to_string())
    log.info("weakest:\n%s", scores.tail(12).round(3).to_string())

    out = scores.to_frame("rho")
    out["grounded"] = out["rho"] > cutoff
    out.index.name = "term"
    out.to_parquet(LEX / "cannabis_grounding.parquet", compression="zstd")
    return out


if __name__ == "__main__":
    run()
