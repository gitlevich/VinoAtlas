"""Assemble the cannabis sigil: a zoom structure whose every split is checkable.

The rule that makes this different from a taxonomy is that a distinction earns
a place only if the chemistry supports it. At each node the strains are cut in
two along their terpene composition, and the cut has to pass three tests:

  reproducible   fit the split on half the strains, apply it to the other half,
                 and the flavour difference must survive. A cut that only
                 exists in the strains it was fitted on is a cut in the noise.
  nameable       the two sides must differ in which flavour words they attract,
                 against a permutation null. A real chemical boundary nobody
                 can name is not a perceptual distinction, and this structure
                 is for percepts.
  narrow         as few children as the material allows. Two was the intended
                 rule, and the data refused it: cannabis's first distinction is
                 four-way, and forcing it binary collapses the nameable words
                 from seventeen to three. Branching is therefore chosen per
                 node, by the smallest number of children that captures most of
                 what can be named at that node.

Nodes carry an invariant (what holds throughout, and so is not the question at
this depth) and a frontier (the contrast that is the question). Descent order
is the prerequisite graph: you cannot use a distinction until you can make the
one above it, because below the parent cut the child cut is what remains.

Bearings are directions, not compounds. Nothing here is named after a molecule,
because the grounding analysis found the percepts are profiles: blueberry
reaches rho=0.28 from the nine terpenes together while no single one of them
passes 0.10, and alpha-pinene predicts the word "pine" at 0.00.
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import kruskal
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sigil")

MIN_NODE = 40          # strains below which a node cannot be split further
MAX_DEPTH = 4
MAX_BRANCH = 5         # widest division considered before nameability decides
NAME_ALPHA = 0.01      # per-flavour significance for naming a side
MIN_NAMES = 1          # a side must attract at least this many distinctive words
PERMUTATIONS = 500


def _flavour_names(flavours, mask, rng):
    """Flavour words that distinguish one side of a cut from the other."""
    named = []
    for column in flavours.columns:
        left = flavours.loc[mask, column].to_numpy()
        right = flavours.loc[~mask, column].to_numpy()
        if (left > 0).sum() < 5 and (right > 0).sum() < 5:
            continue
        statistic = mannwhitneyu(left, right, alternative="two-sided")
        if statistic.pvalue < NAME_ALPHA:
            side = "left" if left.mean() > right.mean() else "right"
            effect = 2 * statistic.statistic / (len(left) * len(right)) - 1
            named.append((column, side, abs(effect), statistic.pvalue))

    # The null asks how many words this many comparisons yield by chance, with
    # the flavour table's own correlation structure left intact.
    spurious = []
    for _ in range(PERMUTATIONS // 10):
        shuffled = rng.permutation(mask)
        count = 0
        for column in flavours.columns:
            left = flavours.loc[shuffled, column].to_numpy()
            right = flavours.loc[~shuffled, column].to_numpy()
            if (left > 0).sum() < 5 and (right > 0).sum() < 5:
                continue
            if mannwhitneyu(left, right, alternative="two-sided").pvalue < NAME_ALPHA:
                count += 1
        spurious.append(count)
    return named, float(np.percentile(spurious, 95))


def _nameable(flavours, labels, groups):
    """Flavours whose rate differs across the groups, and which group owns each."""
    named = {}
    for column in flavours.columns:
        parts = [flavours[column].to_numpy()[labels == i] for i in range(groups)]
        if min(len(part) for part in parts) < 10:
            continue
        if kruskal(*parts).pvalue < NAME_ALPHA:
            named[column] = int(np.argmax([part.mean() for part in parts]))
    return named


def _cut(chem, flavours, rng):
    """Group the strains, with the branching factor the material supports.

    The chemistry is genuinely clustered -- silhouette runs 19 to 42 standard
    deviations above a covariance-matched null -- so the groups are found in
    the chemistry and then asked whether anyone can tell them apart in words.
    Branching stops widening as soon as another child stops paying for itself.
    """
    best = None
    for groups in range(2, MAX_BRANCH + 1):
        if len(chem) < groups * MIN_NODE:
            break
        labels = KMeans(groups, n_init=20, random_state=0).fit_predict(chem)
        named = _nameable(flavours, labels, groups)
        null = np.percentile([len(_nameable(flavours, rng.permutation(labels), groups))
                              for _ in range(40)], 95)
        gain = len(named) - null
        if best is None or gain > best[0] + 1:
            best = (gain, groups, labels, named, null)
    return best


def _reproducible(chem, flavours, labels, groups, rng, folds=5):
    """Fraction of a division's words that still lean the same way on held-out strains.

    The grouping is refitted on half the strains and carried to the other half.
    A division judged on the strains it was fitted to would agree with itself by
    construction.
    """
    held = []
    for _ in range(folds):
        order = rng.permutation(len(chem))
        fit, test = order[: len(order) // 2], order[len(order) // 2 :]
        model = KMeans(groups, n_init=10, random_state=0).fit(chem[fit])
        inside = _nameable(flavours.iloc[fit].reset_index(drop=True), model.labels_, groups)
        if not inside:
            continue
        outside = model.predict(chem[test])
        agreed = 0
        for word, owner in inside.items():
            values = flavours[word].to_numpy()[test]
            if (values > 0).sum() < 5:
                continue
            agreed += int(np.argmax([values[outside == i].mean() if (outside == i).any()
                                     else -1 for i in range(groups)]) == owner)
        held.append(agreed / len(inside))
    return float(np.mean(held)) if held else 0.0


def split(chem, flavours, rng, depth=0, path="root"):
    node = {"path": path, "strains": int(len(chem)), "depth": depth}

    # The invariant: what everything here attracts, and so is not in question.
    presence = (flavours > 0).mean()
    node["invariant"] = sorted(presence[presence >= 0.6].index.tolist())

    if len(chem) < MIN_NODE or depth >= MAX_DEPTH:
        node["leaf"] = True
        node["character"] = presence.sort_values(ascending=False).head(4).index.tolist()
        return node

    found = _cut(chem, flavours, rng)
    if found is None:
        node["leaf"] = True
        node["reason"] = "too few strains to divide"
        node["character"] = presence.sort_values(ascending=False).head(4).index.tolist()
        return node

    gain, groups, labels, named, null = found
    if gain <= 0:
        node["leaf"] = True
        node["reason"] = f"no nameable division ({len(named)} words vs {null:.0f} by chance)"
        node["character"] = presence.sort_values(ascending=False).head(4).index.tolist()
        return node

    holds = _reproducible(chem, flavours, labels, groups, rng)
    node["frontier"] = {
        "branches": groups, "words": len(named),
        "expected_by_chance": round(null, 1), "holds_out_of_sample": round(holds, 2),
    }
    node["children"] = []
    for group in range(groups):
        mask = labels == group
        owns = sorted(word for word, owner in named.items() if owner == group)
        child = split(chem[mask], flavours[mask], rng, depth + 1,
                      f"{path}/{'+'.join(owns[:2]) or 'unnamed'}")
        child["distinctive"] = owns
        node["children"].append(child)
    return node


def show(node, indent=0):
    pad = "  " * indent
    label = ", ".join(node.get("distinctive", [])) or node["path"].split("/")[-1]
    if "frontier" in node:
        f = node["frontier"]
        log.info("%s%d strains | %s", pad, node["strains"], label)
        log.info("%s  -> %d branches, %d words vs %.0f by chance, %.0f%% hold out of sample",
                 pad, f["branches"], f["words"], f["expected_by_chance"],
                 100 * f["holds_out_of_sample"])
        for child in node["children"]:
            show(child, indent + 1)
    else:
        log.info("%s%d strains | %s  [leaf: %s]", pad, node["strains"], label,
                 node.get("reason", "too small"))


VOCABULARIES = {"flavour": "cannabis_strain_flavor.parquet",
                "effect": "cannabis_strain_effect.parquet"}


if __name__ == "__main__":
    import sys

    which = sys.argv[1] if len(sys.argv) > 1 else "flavour"
    chem = pd.read_parquet(LEX / "cannabis_strain_chem.parquet")
    words = pd.read_parquet(LEX / VOCABULARIES[which])
    words.columns = [c.replace("flavor_", "").replace("effect_", "").replace("_score", "")
                     for c in words.columns]
    shared = chem.index.intersection(words.index)
    chem, words = chem.loc[shared], words.loc[shared]

    values = chem.to_numpy(float)
    values = (values - values.mean(0)) / values.std(0)

    log.info("naming vocabulary: %s (%d words, %d strains)", which, words.shape[1], len(chem))
    rng = np.random.default_rng(0)
    tree = split(values, words.reset_index(drop=True), rng)
    show(tree)

    (LEX / f"cannabis_sigil_{which}.json").write_text(json.dumps(tree, indent=2))
    log.info("wrote cannabis_sigil_%s.json", which)
