"""Post-hoc tests of the lexical-scoping prediction.

Nothing here feeds back into how the lexicon or hierarchy is built. The
structure is derived first, from usage alone; these tests then ask whether the
predicted shape happens to be present in it. Keeping the order that way is the
whole point - a hierarchy built to be sight-first would prove nothing by coming
out sight-first.

Three questions:

  scope breadth   Is a term used about every kind of wine, or only within one?
                  A term whose use is confined to a subregion is a distinction
                  drawn inside that region rather than across the whole domain,
                  which is what scoping means operationally. Containment of
                  scopes yields a hierarchy from data instead of by fiat.

  re-scoping      Does a contrast keep its meaning across contexts? The
                  vocabulary surrounding "acidity" is compared between red and
                  white subcorpora. Divergence means the distinction is drawn
                  differently depending on where you stand.

  mention order   Where in a note does a term first appear? Critics are trained
                  to write appearance, then nose, then palate, so their order
                  proves nothing. Community writers follow no template, which
                  makes them the informative case.

Wine colour is derived empirically from X-Wines rather than hand-assigned, so
no judgement about which grapes are red enters through the back door.
"""

import logging
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
LEX = ROOT / "data" / "lexicon"
CORPUS = ROOT / "data" / "corpus"

log = logging.getLogger(__name__)


def grape_colour_map():
    """Grape -> wine colour, learned from 100k labelled wines."""
    path = RAW / "xwines" / "X-Wines_Official_Repository" / "last" / "XWines_Full_100K_wines.csv"
    df = pd.read_csv(path, usecols=["Grapes", "Type"])
    tally = {}
    for grapes, wine_type in zip(df["Grapes"], df["Type"]):
        if not isinstance(grapes, str):
            continue
        for grape in re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' \-]+", grapes):
            key = grape.strip().strip("'\" ").lower()
            if len(key) < 3:
                continue
            tally.setdefault(key, Counter())[str(wine_type).lower()] += 1

    mapping = {}
    for grape, counts in tally.items():
        colour, n = counts.most_common(1)[0]
        if n / sum(counts.values()) >= 0.6:
            mapping[grape] = colour
    log.info("grape colour map: %d grapes", len(mapping))
    return mapping


def label_colours(reviews, mapping):
    """Colour per review, from its grape/variety metadata only."""
    variety = reviews["variety"].fillna("").astype(str).str.lower()

    # Some sources say only "red_wine" / "white wine" rather than naming a grape.
    explicit = {"red": "red", "white": "white", "rose": "rose", "rosé": "rose",
                "sparkling": "sparkling", "port": "dessert", "dessert": "dessert"}

    def colour_of(text):
        if not text:
            return None
        if text in mapping:
            return mapping[text]
        words = re.split(r"[^a-zà-ÿ]+", text)
        for word in words:
            if word in explicit:
                return explicit[word]
        for grape, colour in mapping.items():
            if len(grape) > 4 and grape in text:
                return colour
        return None

    unique = {v: colour_of(v) for v in variety.unique()}
    labels = variety.map(unique)
    log.info("colour coverage: %s", labels.value_counts(dropna=False).head(6).to_dict())
    return labels


def scope_breadth(doc_term, colours, surfaces, min_docs=50):
    """Per term: usage rate within each colour, and how evenly it spreads."""
    groups = [c for c in ("red", "white", "sparkling", "rose", "dessert") if (colours == c).sum() >= 500]
    rates = {}
    for colour in groups:
        rows = np.flatnonzero((colours == colour).to_numpy())
        rates[colour] = np.asarray(doc_term[rows].sum(axis=0)).ravel() / len(rows)

    matrix = np.vstack([rates[c] for c in groups])
    totals = np.asarray(doc_term.sum(axis=0)).ravel()

    share = matrix / np.maximum(matrix.sum(axis=0, keepdims=True), 1e-12)
    with np.errstate(divide="ignore", invalid="ignore"):
        entropy = -(share * np.log2(np.maximum(share, 1e-12))).sum(axis=0)
    entropy = np.nan_to_num(entropy) / np.log2(len(groups))

    df = pd.DataFrame({"surface": surfaces, "df_total": totals, "scope_breadth": entropy})
    for i, colour in enumerate(groups):
        df[f"rate_{colour}"] = matrix[i]
    return df[df["df_total"] >= min_docs].reset_index(drop=True)


def rescoping(doc_term, colours, surfaces, heads, top_n=25):
    """How differently a term's companions behave in red versus white contexts."""
    index = {s: i for i, s in enumerate(surfaces)}
    red = np.flatnonzero((colours == "red").to_numpy())
    white = np.flatnonzero((colours == "white").to_numpy())

    # Raw companion counts are dominated by whatever the subcorpus talks about
    # anyway - everything in a red review sits near "black" and "plum". What
    # matters is the company a term keeps *beyond* that background, so each
    # profile is divided by the subcorpus base rate before the two are compared.
    background = {}
    for name, subset in (("red", red), ("white", white)):
        counts = np.asarray(doc_term[subset].sum(axis=0)).ravel().astype(float)
        background[name] = counts / max(len(subset), 1)

    rows = []
    for head in heads:
        if head not in index:
            continue
        col = index[head]
        lift, common = {}, None
        for name, subset in (("red", red), ("white", white)):
            block = doc_term[subset]
            mentions = np.flatnonzero(block[:, col].toarray().ravel())
            if len(mentions) < 200:
                lift = {}
                break
            rate = np.asarray(block[mentions].sum(axis=0)).ravel() / len(mentions)
            with np.errstate(divide="ignore", invalid="ignore"):
                lift[name] = np.log2((rate + 1e-4) / (background[name] + 1e-4))
            lift[name][col] = 0.0
        if not lift:
            continue

        # Compare only vocabulary both contexts actually use, so the score
        # reflects re-scoping rather than one side's vocabulary being absent.
        # A floor on both base rates: lift over a near-zero denominator is
        # noise, and comparing noise to noise looks like a real difference.
        usable = (background["red"] > 0.002) & (background["white"] > 0.002)
        p, q = lift["red"][usable], lift["white"][usable]
        names = np.array(surfaces)[usable]
        correlation = float(np.corrcoef(p, q)[0, 1]) if len(p) > 2 else np.nan

        top_red = {names[i] for i in np.argsort(p)[::-1][:top_n]}
        top_white = {names[i] for i in np.argsort(q)[::-1][:top_n]}
        overlap = len(top_red & top_white) / len(top_red | top_white)

        rows.append({
            "head": head,
            "profile_correlation": correlation,
            "companion_overlap": float(overlap),
            "only_red": ", ".join(sorted(top_red - top_white)[:8]),
            "only_white": ", ".join(sorted(top_white - top_red)[:8]),
        })
    return pd.DataFrame(rows).sort_values("profile_correlation")


def mention_position(surfaces, families=("vivino", "winemag"), sample=60000):
    """Normalised position of a term's first mention within a note."""
    from .lang import is_english

    reviews = pd.read_parquet(CORPUS / "reviews.parquet", columns=["text", "family"])
    reviews = reviews[reviews["text"].map(is_english)]
    token_re = re.compile(r"[a-z]+")
    vocab = set(surfaces)

    out = {}
    for family in families:
        subset = reviews[reviews["family"] == family]["text"]
        subset = subset.sample(min(sample, len(subset)), random_state=0)
        positions, counts = Counter(), Counter()
        for text in subset:
            words = token_re.findall(text.lower())
            if len(words) < 6:
                continue
            seen = set()
            for i, word in enumerate(words):
                if word in vocab and word not in seen:
                    seen.add(word)
                    positions[word] += i / len(words)
                    counts[word] += 1
        out[family] = pd.DataFrame({
            "surface": list(counts),
            f"position_{family}": [positions[w] / counts[w] for w in counts],
            f"n_{family}": [counts[w] for w in counts],
        })
    merged = out[families[0]]
    for family in families[1:]:
        merged = merged.merge(out[family], on="surface", how="outer")
    return merged


def run():
    vocab = pd.read_parquet(LEX / "vocab_classified.parquet")
    doc_term = sparse.load_npz(LEX / "doc_term.npz").tocsr()
    surfaces = vocab["surface"].tolist()

    reviews = pd.read_parquet(CORPUS / "reviews.parquet", columns=["text", "variety", "family"])
    from .lang import is_english
    reviews = reviews[reviews["text"].map(is_english)].reset_index(drop=True)

    colours = label_colours(reviews, grape_colour_map())

    breadth = scope_breadth(doc_term, colours, surfaces)
    breadth = breadth.merge(vocab[["surface", "class", "is_percept", "groundable"]], on="surface", how="left")
    breadth.to_parquet(LEX / "scope_breadth.parquet", compression="zstd", index=False)

    heads = pd.read_parquet(LEX / "axes.parquet")["head"].tolist() if (LEX / "axes.parquet").exists() else []
    shifts = rescoping(doc_term, colours, surfaces, heads)
    shifts.to_parquet(LEX / "rescoping.parquet", compression="zstd", index=False)

    positions = mention_position(surfaces)
    positions = positions.merge(vocab[["surface", "class"]], on="surface", how="left")
    positions.to_parquet(LEX / "mention_position.parquet", compression="zstd", index=False)

    log.info("scope breadth by class:\n%s",
             breadth.groupby("class")["scope_breadth"].agg(["count", "mean"]).to_string())
    return breadth, shifts, positions
