"""Grow a tree of distinctions over the wines you can actually buy.

Root is wine. Every branch is one contrast, and a contrast may only be used
where two conditions hold at once:

  people agree on it   Only distinctions that two disjoint halves of a tasting
                       panel rank the same way are allowed to split anything
                       (panel_reliability.parquet). Sour, bitter and green are
                       excluded on that ground -- agreement near zero -- along
                       with the rest of the aroma-wheel vocabulary.
  it varies here       A contrast that is constant inside a node tells a
                       taster nothing at that node. Tannin does not divide
                       white wines; sweetness barely divides reds. So each
                       node picks its own next contrast from what actually
                       splits its own wines.

The second rule is the lexical-scoping claim made concrete: a distinction is
only available inside the region where it does work, so the tree does not
apply one fixed order everywhere.

Growth stops when a node is small, when no allowed contrast divides it, or
when a split would leave a side too thin to be worth naming. Whatever depth
results is the depth the catalogue supports.
"""

import json
import logging
import re
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CATALOG = Path("/Users/vlad/wines.csv")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tree")

MIN_NODE = 25
MIN_SIDE = 0.15      # a split must leave at least this share on the smaller side
MAX_DEPTH = 5

# Distinction -> (catalogue field, how its words map to an ordered scale).
# Agreement figures are the panel judge-split reliabilities that admit each one.
SCALES = {
    "weight":     ("body", {"light": 0, "light to medium": 1, "medium": 2, "medium-bodied": 2,
                            "medium to full": 3, "full": 4, "full-bodied": 4}),
    "grip":       ("tannin", {"none": 0, "low": 1, "medium": 2, "medium to high": 3,
                              "medium-high": 3, "high": 4}),
    "oak":        ("oak_influence", {"none": 0, "minimal": 1, "low": 1, "moderate": 2,
                                     "medium": 2, "significant": 3, "high": 4, "yes": 3}),
    "sweetness":  ("sweetness", {"dry": 0, "brut": 0, "low": 0, "off-dry": 1, "medium": 2,
                                 "sweet": 3}),
}

FRUIT = {
    "dark fruit": r"blackberry|black fruit|dark fruit|cassis|blackcurrant|plum|blueberry",
    "red fruit": r"red fruit|cherry|raspberry|strawberry|cranberry|redcurrant",
    "citrus and orchard": r"citrus|lemon|lime|grapefruit|apple|pear|quince",
    "tropical and stone": r"tropical|pineapple|mango|peach|apricot|melon|passion",
}


def normalise(value):
    return re.sub(r"\s+", " ", str(value).strip().lower())


def load():
    frame = pd.read_csv(CATALOG)
    rows = []
    for name, blob in zip(frame["wine_name"], frame["research_json"]):
        try:
            research = json.loads(blob).get("researched", {}) or {}
        except (json.JSONDecodeError, TypeError):
            research = {}
        research = {k.lower().replace(" ", "_"): v for k, v in research.items()}
        row = {"wine": name, "variety": normalise(research.get("grape_variety", ""))}
        for distinction, (field, scale) in SCALES.items():
            row[distinction] = scale.get(normalise(research.get(field, "")))
        text = f"{research.get('nose','')} {research.get('palate','')}".lower()
        row["fruit"] = next((k for k, pattern in FRUIT.items() if re.search(pattern, text)), None)
        row["fizz"] = "sparkling" if re.search(
            r"sparkling|spritz", normalise(research.get("carbonation", ""))) else "still"
        row["colour"] = colour(row["variety"], text)
        rows.append(row)
    return pd.DataFrame(rows)


WHITE = ("chardonnay", "riesling", "sauvignon blanc", "chenin", "semillon", "viognier",
         "gewurztraminer", "pinot gris", "pinot grigio", "albarino", "gruner", "muscat",
         "verdejo", "vermentino", "fiano", "greco", "moscato", "trebbiano", "white")


def colour(variety, text):
    if "rosé" in variety or "rose" in variety.split() or "rosado" in variety:
        return "rosé"
    if any(w in variety for w in WHITE):
        return "white"
    if variety:
        return "red"
    return "white" if re.search(r"citrus|lemon|green apple|crisp white", text) else "red"


def split_quality(frame, distinction):
    """Best two-way cut of an ordered distinction, scored by balance."""
    values = frame[distinction].dropna()
    if len(values) < MIN_NODE or values.nunique() < 2:
        return None
    best = None
    for cut in sorted(values.unique())[:-1]:
        low = (values <= cut).sum() / len(values)
        if min(low, 1 - low) < MIN_SIDE:
            continue
        balance = min(low, 1 - low)
        if best is None or balance > best[0]:
            best = (balance, cut, len(values) / len(frame))
    return best


def categorical_quality(frame, column):
    counts = frame[column].dropna().value_counts()
    if len(counts) < 2 or counts.iloc[0] / max(counts.sum(), 1) > 0.9:
        return None
    keep = counts[counts >= max(MIN_NODE, MIN_SIDE * len(frame))]
    return list(keep.index) if len(keep) >= 2 else None


LABEL = {"weight": ("lighter", "fuller"), "grip": ("softer", "firmer"),
         "oak": ("unoaked", "oaked"), "sweetness": ("dry", "sweeter")}


def grow(frame, used, depth=0):
    node = {"wines": len(frame)}
    if len(frame) < MIN_NODE * 2 or depth >= MAX_DEPTH:
        node["examples"] = frame["wine"].head(3).tolist()
        return node

    if "fizz" not in used and (frame["fizz"] == "sparkling").mean() >= 0.04:
        groups = {k: g for k, g in frame.groupby("fizz") if len(g) >= MIN_NODE}
        if len(groups) >= 2:
            node["contrast"] = "still or sparkling"
            node["children"] = {k: grow(g, used | {"fizz"}, depth + 1) for k, g in groups.items()}
            return node

    if "colour" not in used:
        groups = {k: g for k, g in frame.groupby("colour") if len(g) >= MIN_NODE}
        if len(groups) >= 2:
            node["contrast"] = "colour"
            node["children"] = {k: grow(g, used | {"colour"}, depth + 1) for k, g in groups.items()}
            return node

    scored = []
    for distinction in SCALES:
        if distinction in used:
            continue
        quality = split_quality(frame, distinction)
        if quality:
            scored.append((quality[0] * quality[2], distinction, quality[1]))
    if "fruit" not in used:
        levels = categorical_quality(frame, "fruit")
        if levels:
            scored.append((0.9 * frame["fruit"].notna().mean(), "fruit", levels))

    if not scored:
        node["examples"] = frame["wine"].head(3).tolist()
        return node

    scored.sort(reverse=True)
    _, distinction, cut = scored[0]
    if distinction == "fruit":
        groups = {k: g for k, g in frame.groupby("fruit") if k in cut}
        node["contrast"] = "which fruit it leads with"
    else:
        low, high = LABEL[distinction]
        mask = frame[distinction] <= cut
        groups = {low: frame[mask], high: frame[~mask & frame[distinction].notna()]}
        groups = {k: g for k, g in groups.items() if len(g) >= MIN_NODE}
        node["contrast"] = distinction
    if len(groups) < 2:
        node["examples"] = frame["wine"].head(3).tolist()
        return node
    node["children"] = {k: grow(g, used | {distinction}, depth + 1) for k, g in groups.items()}
    return node


def show(node, name="wine", indent=0, out=None):
    out = out if out is not None else []
    pad = "   " * indent
    head = f"{pad}{name}  ({node['wines']})"
    if "contrast" in node:
        out.append(f"{head}   — split by {node['contrast']}")
        for child, sub in node["children"].items():
            show(sub, child, indent + 1, out)
    else:
        out.append(head)
        if node.get("examples"):
            out.append(f"{pad}   e.g. {node['examples'][0][:52]}")
    return out


if __name__ == "__main__":
    frame = load()
    log.info("catalogue: %d wines | colour %s | fruit named for %d",
             len(frame), dict(frame["colour"].value_counts()), frame["fruit"].notna().sum())
    tree = grow(frame, set())
    print("\n".join(show(tree)))
    (ROOT / "data" / "lexicon" / "wine_tree.json").write_text(json.dumps(tree, indent=1))
