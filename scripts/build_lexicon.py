"""Turn extracted terms into a classified lexicon, named contrasts, and a
hierarchy. Run after scripts/extract_terms.py."""

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd

from vino import axes, classify, perceptual, profile, taxonomy

LEX = Path(__file__).resolve().parent.parent / "data" / "lexicon"


def main(stages):
    if "profile" in stages:
        profile.build()
    if "classify" in stages:
        classify.run()
    if "axes" in stages:
        axes.discover()
    if "perceptual" in stages:
        perceptual.run()
    if "taxonomy" in stages:
        build_taxonomy()


def build_taxonomy():
    """Hierarchy over the grounded perceptual vocabulary.

    Restricted to terms that name something you could point at, which is the
    part of the space a learner can be walked through by tasting rather than
    by being told.
    """
    vocab = pd.read_parquet(LEX / "vocab_classified.parquet")
    semantic = np.load(LEX / "vec_semantic.npy")
    distributional = np.load(LEX / "vec_distributional.npy")

    # Degree words modulate a distinction without naming one, so they have no
    # place in a hierarchy of distinctions.
    degree = {"slightly", "very", "really", "quite", "fairly", "extremely", "somewhat",
              "little", "bit", "lot", "much", "more", "most", "less", "least", "super",
              "pretty", "rather", "highly", "totally", "absolutely", "overly", "enough"}
    keep = (vocab["is_percept"]
            & (vocab["groundable"] | (vocab["df_total"] >= 500))
            & ~vocab["surface"].isin(degree))
    subset = vocab[keep].reset_index()
    rows = subset["index"].to_numpy()

    combined = np.hstack([semantic[rows], 0.5 * distributional[rows]])
    combined /= np.maximum(np.linalg.norm(combined, axis=1, keepdims=True), 1e-12)

    terms = subset["surface"].tolist()
    frequency = dict(zip(terms, subset["df_total"] / subset["df_total"].max()))
    generality = dict(zip(terms, subset["referent_n"] / max(subset["referent_n"].max(), 1)))

    root = taxonomy.build(combined, terms, frequency, generality)
    (LEX / "taxonomy.json").write_text(json.dumps(root.to_dict(), indent=2))
    logging.info("branching profile by depth:\n%s", taxonomy.describe(root).to_string())
    return root


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stages", nargs="+",
                        default=["profile", "classify", "axes", "perceptual", "taxonomy"])
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main(args.stages)
