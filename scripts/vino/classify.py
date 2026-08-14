"""Separate perceptual vocabulary from everything else, and score how likely a
term is to name something a person can actually feel.

Most of what fills a tasting note is not a distinction of the wine. It is
praise ("lovely"), provenance ("french oak"), commerce ("gift"), or discourse
("drink"). Only a fraction names a sensation. Three measurements, none of which
requires trusting the expert vocabulary, separate them:

  groundability   The term appears as the object of an aroma frame - "notes of
                  cedar". You can hand someone a cedar shaving. You cannot hand
                  them an "elegant". Ostensive terms are learnable by anyone
                  with a nose; abstract ones must be taken on authority.

  evaluative load Correlation with the review score, after normalising each
                  family's scale. Praise tracks the score; a description of
                  what is in the glass mostly should not.

  critic lift     How much more often critics use the term than the community.
                  Community tasters are largely untrained, so a term they reach
                  for unprompted is likelier to name something perceivable
                  without training. Critic-only vocabulary is suspect.

Class assignment starts from small hand-written seed sets and propagates by
semantic similarity. Seeds encode a judgement and are meant to be read and
argued with, which is why they are listed here rather than inferred.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

ROOT = Path(__file__).resolve().parents[2]
LEX = ROOT / "data" / "lexicon"
RAW = ROOT / "data" / "raw"

log = logging.getLogger(__name__)

SEEDS = {
    "evaluation": """
        good great nice excellent lovely beautiful wonderful amazing fantastic perfect
        delicious enjoyable pleasant decent solid impressive outstanding superb
        poor bad disappointing mediocre awful terrible boring bland forgettable
        favorite best worst recommended overrated underrated value
    """,
    "structure": """
        tannin acidity body finish structure texture balance length weight
        intensity concentration complexity depth grip astringency
    """,
    "provenance": """
        french american hungarian slavonian organic biodynamic natural sustainable
        estate reserve barrel oaked aged vintage varietal blend vineyard cellar
        harvest fermentation malolactic filtration sulfite yeast vine terroir
    """,
    "commerce": """
        price gift pack case bottle magnum label packaging discount deal
        collection edition allocation release retail cellar
    """,
    "discourse": """
        drink pair serve decant enjoy recommend buy order taste try
        food meal dinner cheese steak pasta dessert
    """,
    "sight": """
        color golden amber ruby garnet purple crimson opaque translucent
        cloudy clear pale bright hue tint
    """,
    "aroma": """
        aroma nose bouquet fragrance perfume scent floral fruity smoky earthy
        cherry blackberry vanilla cedar leather tobacco violet citrus
    """,
    "taste": """
        sweet sour bitter salty savory tart acidic sugary umami
    """,
    "touch": """
        silky velvety chewy grippy creamy smooth rough coarse thick thin
        viscous watery fizzy prickly astringent drying round supple
    """,
    "chemesthetic": """
        hot warming burning cooling menthol tingling numbing peppery
    """,
}

PERCEPT_CLASSES = ("sight", "aroma", "taste", "touch", "chemesthetic")


def _seed_centroids(vocab, semantic, index):
    centroids, present = {}, {}
    for label, words in SEEDS.items():
        rows = [index[w] for w in words.split() if w in index]
        if not rows:
            continue
        centroid = semantic[rows].mean(axis=0)
        centroids[label] = centroid / max(np.linalg.norm(centroid), 1e-12)
        present[label] = len(rows)
    log.info("seed coverage: %s", present)
    return centroids


def _evaluative_load(doc_term, meta):
    """Point-biserial correlation of each term with the normalised score."""
    rating = pd.to_numeric(meta["rating"], errors="coerce")
    z = rating.groupby(meta["family"]).transform(lambda s: (s - s.mean()) / (s.std() + 1e-9))
    usable = z.notna().to_numpy()
    z = np.nan_to_num(z.to_numpy())[usable]

    X = doc_term[usable].astype(np.float64)
    n = X.shape[0]
    counts = np.asarray(X.sum(axis=0)).ravel()
    sums = np.asarray(X.T @ z).ravel()

    with np.errstate(divide="ignore", invalid="ignore"):
        mean_with = sums / counts
        mean_without = (z.sum() - sums) / (n - counts)
        load = mean_with - mean_without
    return np.nan_to_num(load)


def _provenance_vocabulary():
    """Words that name a cause rather than a percept, taken from wine metadata."""
    words = set()
    xwines = RAW / "xwines" / "X-Wines_Official_Repository" / "last" / "XWines_Full_100K_wines.csv"
    if xwines.exists():
        df = pd.read_csv(xwines, usecols=["WineName", "Grapes", "RegionName", "Country", "WineryName"])
        for col in df.columns:
            for value in df[col].dropna().astype(str):
                words.update(w.lower().strip("[]'\",") for w in value.split())
    log.info("provenance vocabulary: %d tokens", len(words))
    return {w for w in words if w.isalpha() and len(w) > 2}


def run():
    vocab = pd.read_parquet(LEX / "vocab.parquet")
    semantic = np.load(LEX / "vec_semantic.npy")
    doc_term = sparse.load_npz(LEX / "doc_term.npz")
    meta = pd.read_parquet(LEX / "doc_meta.parquet")
    aromas = pd.read_parquet(LEX / "aromas.parquet")
    index = {s: i for i, s in enumerate(vocab["surface"])}

    centroids = _seed_centroids(vocab, semantic, index)
    labels = list(centroids)
    matrix = np.vstack([centroids[l] for l in labels])
    similarity = semantic @ matrix.T
    vocab["class"] = [labels[i] for i in similarity.argmax(axis=1)]
    vocab["class_margin"] = np.sort(similarity, axis=1)[:, -1] - np.sort(similarity, axis=1)[:, -2]

    # Ostensive grounding: does the term ever appear as the thing being smelled?
    referent_counts = aromas.groupby("phrase")["n"].sum()
    vocab["referent_n"] = vocab["surface"].map(referent_counts).fillna(0)
    vocab["groundable"] = vocab["referent_n"] >= 10

    vocab["evaluative_load"] = _evaluative_load(doc_term, meta)

    provenance = _provenance_vocabulary()
    vocab["in_metadata"] = vocab["surface"].map(lambda s: any(w in provenance for w in s.split()))

    vocab["is_percept"] = vocab["class"].isin(PERCEPT_CLASSES)

    # A single readable score: grounded, score-neutral, not critic-only.
    ground = vocab["groundable"].astype(float)
    neutral = 1.0 - vocab["evaluative_load"].abs().clip(0, 1)
    shared = 1.0 - vocab["critic_lift"].clip(0, 6) / 6.0
    vocab["perceptibility"] = (0.4 * ground + 0.3 * neutral + 0.3 * shared).round(3)

    vocab.to_parquet(LEX / "vocab_classified.parquet", compression="zstd", index=False)
    log.info("class distribution:\n%s", vocab["class"].value_counts().to_string())
    return vocab
