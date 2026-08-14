"""Unify all raw wine-review datasets into a single corpus.

Outputs (data/corpus/):
  reviews.parquet   - one row per review: source, family, text, wine metadata.
                      Exact-duplicate texts are dropped within each family so
                      mirrors of the same publication collapse to one copy.
  keywords.parquet  - Vivino per-wine flavor-keyword counts (their internal
                      taxonomy groups), one row per (wine, group, keyword).
"""

import json
import logging
from pathlib import Path

import pandas as pd

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = RAW.parent / "corpus"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("build_corpus")

META = ["wine", "winery", "country", "region", "variety", "year", "rating", "price"]


def frame(df, source, family, text_col, mapping):
    out = pd.DataFrame()
    out["text"] = df[text_col].astype("string")
    for target in META:
        src = mapping.get(target)
        out[target] = df[src] if src in df.columns else pd.NA
    out["source"] = source
    out["family"] = family
    return out


def load_sources():
    parts = []

    # WineEnthusiast, Kaggle mirror (130k v2 + 150k v1 concatenated -> heavy internal duplication)
    wm = pd.concat(
        pd.read_parquet(p) for p in (RAW / "spawn99_wine-reviews" / "data").glob("*.parquet")
    )
    parts.append(frame(wm, "winemag_kaggle", "winemag", "description",
                       {"wine": "title", "winery": "winery", "country": "country",
                        "region": "province", "variety": "variety", "rating": "points", "price": "price"}))

    # WineEnthusiast, independent Feb-2019 scrape (has alcohol + deeper region fields)
    wm19 = pd.concat(
        pd.read_csv(p, on_bad_lines="skip") for p in (RAW / "psiyum_winemag-feb-2019").glob("*.csv")
    )
    parts.append(frame(wm19, "winemag_2019", "winemag", "description",
                       {"wine": "title", "winery": "winery", "country": "country",
                        "region": "region", "variety": "varietal", "year": "vintage",
                        "rating": "rating", "price": "price"}))

    # WineSensed: ~1M Vivino community reviews, multilingual
    ws = pd.read_parquet(RAW / "winesensed_text.parquet")
    parts.append(frame(ws, "winesensed", "vivino", "review",
                       {"wine": "wine", "country": "country", "region": "region",
                        "variety": "grape", "year": "year", "rating": "rating", "price": "price"}))

    # wine.com-style catalogs: professional/marketing notes
    wt = pd.read_parquet(RAW / "cipher982_wine-text-126k" / "wine_text_126k.parquet")
    parts.append(frame(wt, "winecom_126k", "catalog", "description",
                       {"wine": "name", "region": "region", "variety": "category", "price": "price"}))

    ar = pd.concat(
        pd.read_csv(RAW / "alfredodeza_wine-ratings" / f"{s}.csv") for s in ("train", "validation", "test")
    )
    parts.append(frame(ar, "wine_ratings_33k", "catalog", "notes",
                       {"wine": "name", "region": "region", "variety": "variety", "rating": "rating"}))

    return parts


def build_reviews():
    parts = load_sources()
    df = pd.concat(parts, ignore_index=True)
    df = df.dropna(subset=["text"])
    df = df[df["text"].str.len() >= 20]
    before = len(df)
    df = df.drop_duplicates(subset=["family", "text"])
    log.info("dropped %d duplicate texts within families", before - len(df))
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "reviews.parquet", compression="zstd", index=False)
    log.info("reviews.parquet: %d rows", len(df))
    log.info("per source:\n%s", df["source"].value_counts().to_string())


def build_keywords():
    rows = []
    specs = [
        ("Mr-Bridge_vivino-bordeaux-wines-2026/data.csv", "tasteProfile", "wineId", "fullName", "vivino_fr"),
        ("Mr-Bridge_vivino-bourgogne-wines-2026/data.csv", "tasteProfile", "wineId", "fullName", "vivino_fr"),
        ("Mr-Bridge_vivino-champagne-2026/data.csv", "tasteProfile", "wineId", "fullName", "vivino_fr"),
    ]
    for path, col, id_col, name_col, source in specs:
        df = pd.read_csv(RAW / path)
        for _, r in df.iterrows():
            try:
                groups = json.loads(r[col]) if pd.notna(r[col]) else []
            except (json.JSONDecodeError, TypeError):
                continue
            for g in groups:
                for kw in g.get("primaryKeywords", []):
                    rows.append({"wine_id": r[id_col], "wine": r[name_col], "group": g["group"],
                                 "keyword": kw["name"], "count": kw["count"], "source": source})

    famous = pd.read_csv(RAW / "Mr-Bridge_vivino-famous-wines-taste-profiles-2026/data.csv")
    for _, r in famous.iterrows():
        try:
            profile = json.loads(r["taste_profile"]) if pd.notna(r["taste_profile"]) else {}
        except (json.JSONDecodeError, TypeError):
            continue
        for kw in profile.get("flavor_notes", []) or []:
            rows.append({"wine_id": r["wineId"], "wine": r["name"], "group": pd.NA,
                         "keyword": kw, "count": 1, "source": "vivino_en"})

    kw = pd.DataFrame(rows)
    kw.to_parquet(OUT / "keywords.parquet", compression="zstd", index=False)
    log.info("keywords.parquet: %d rows, %d distinct keywords, groups: %s",
             len(kw), kw["keyword"].nunique(), sorted(kw["group"].dropna().unique()))


if __name__ == "__main__":
    build_reviews()
    build_keywords()
