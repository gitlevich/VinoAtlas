"""Build the descriptor hierarchy under a branching budget.

The hierarchy is a zoom interface, not a reference catalog, so width is the
expensive dimension: at any one node the reader should face only a few choices.
Splits are therefore kept as narrow as the data allows - k=2 unless a wider
split is clearly better - and depth is spent freely instead.

Each node is named by its most central, most widely used member. Where no
member is general enough to name the group, the node is left unnamed and
flagged: a distinction the discourse groups together but has never lexicalised
is a gap worth reporting, not a defect to paper over.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

ROOT = Path(__file__).resolve().parents[2]
LEX = ROOT / "data" / "lexicon"

log = logging.getLogger(__name__)

MAX_CHILDREN = 4
LEAF_SIZE = 5
SILHOUETTE_TOLERANCE = 0.03   # accept a narrower split this close to the best


@dataclass
class Node:
    terms: list
    name: str = ""
    named: bool = True
    depth: int = 0
    children: list = field(default_factory=list)

    def to_dict(self):
        return {
            "name": self.name,
            "named": self.named,
            "depth": self.depth,
            "size": len(self.terms),
            "terms": self.terms if not self.children else [],
            "children": [c.to_dict() for c in self.children],
        }


def _choose_k(vectors, max_children=MAX_CHILDREN):
    """Smallest k whose split is nearly as good as the best available."""
    n = len(vectors)
    limit = min(max_children, n - 1)
    if limit < 2:
        return None, None

    scored = []
    for k in range(2, limit + 1):
        labels = KMeans(n_clusters=k, n_init=5, random_state=0).fit_predict(vectors)
        if len(set(labels)) < 2:
            continue
        scored.append((k, silhouette_score(vectors, labels), labels))
    if not scored:
        return None, None

    best = max(s for _, s, _ in scored)
    for k, score, labels in scored:            # ascending k: first acceptable wins
        if score >= best - SILHOUETTE_TOLERANCE:
            return k, labels
    return None, None


def _name_node(terms, vectors, frequency, generality, taken=()):
    """Name a group by its most central widely-used member.

    Generality matters more than raw frequency: "citrus" should win over
    "grapefruit" even when grapefruit is said more often, because the node
    stands for the whole group. Names already used by an ancestor are skipped -
    a child that repeats its parent's name tells the reader nothing about what
    the step down the tree bought them.
    """
    centroid = vectors.mean(axis=0)
    centroid /= max(np.linalg.norm(centroid), 1e-12)
    centrality = vectors @ centroid

    scores = []
    for i, term in enumerate(terms):
        score = centrality[i] + 0.5 * generality.get(term, 0.0) + 0.2 * frequency.get(term, 0.0)
        scores.append((score, centrality[i], term))
    scores.sort(reverse=True)

    for _, best_centrality, term in scores:
        if term not in taken:
            # A name that does not sit near the middle of its own group is not a name.
            return term, bool(best_centrality >= 0.55)
    return scores[0][2], False


def build(vectors, terms, frequency, generality, max_children=MAX_CHILDREN, leaf_size=LEAF_SIZE):
    index = {t: i for i, t in enumerate(terms)}

    def grow(members, depth, taken=frozenset()):
        rows = np.array([index[t] for t in members])
        sub = vectors[rows]
        name, named = _name_node(members, sub, frequency, generality, taken)
        node = Node(terms=list(members), name=name, named=named, depth=depth)
        taken = taken | {name}

        if len(members) <= leaf_size:
            return node

        k, labels = _choose_k(sub, max_children)
        if k is None:
            return node

        for label in range(k):
            group = [m for m, l in zip(members, labels) if l == label]
            if group:
                node.children.append(grow(group, depth + 1, taken))

        # A split that merely renames its parent is not worth a level.
        if len(node.children) == 1:
            node.children = []
        return node

    root = grow(terms, 0)
    log.info("hierarchy: %d terms, depth %d, %d nodes",
             len(terms), _depth(root), _count(root))
    return root


def _depth(node):
    return 1 + max((_depth(c) for c in node.children), default=0)


def _count(node):
    return 1 + sum(_count(c) for c in node.children)


def describe(node, width=0):
    """Branching profile: how much choice the reader faces at each level."""
    rows = []

    def walk(n):
        if n.children:
            rows.append((n.depth, len(n.children)))
            for c in n.children:
                walk(c)

    walk(node)
    df = pd.DataFrame(rows, columns=["depth", "children"])
    return df.groupby("depth")["children"].agg(["count", "mean", "max"])
