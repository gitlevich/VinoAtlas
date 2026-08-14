"""Parse the CellarTracker dump into the project corpus schema.

Keeps reviewer identity and review date, which turn a pile of notes into two
longitudinal datasets nothing else in the project can supply:

  bottle age   review year minus vintage, for the same wine tasted repeatedly
               over sixteen years. Descriptors can then be watched moving as a
               wine develops, rather than inferred from a snapshot of different
               wines at different stages.

  palate age   one reviewer's vocabulary tracked across their own history. If
               distinctions accumulate, the active set widens; if attention is
               the binding constraint, the set holds its size and its contents
               turn over instead.
"""

import gzip
import html
import logging
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "corpus"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cellartracker")

FIELDS = {
    "wine/name": "wine",
    "wine/wineId": "wine_id",
    "wine/variant": "variety",
    "wine/year": "year",
    "review/points": "rating",
    "review/time": "time",
    "review/userId": "user_id",
    "review/text": "text",
}


def parse(path, min_chars=20):
    records, current = [], {}
    line_re = re.compile(r"^([\w/]+):\s?(.*)$")

    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if not line.strip():
                if current.get("text"):
                    records.append(current)
                current = {}
                continue
            match = line_re.match(line)
            if not match:
                continue
            field = FIELDS.get(match.group(1))
            if field:
                current[field] = html.unescape(match.group(2)).strip()
    if current.get("text"):
        records.append(current)

    df = pd.DataFrame(records)
    df = df[df["text"].str.len() >= min_chars]
    for column in ("rating", "year", "time", "user_id", "wine_id"):
        df[column] = pd.to_numeric(df.get(column), errors="coerce")

    df["review_year"] = pd.to_datetime(df["time"], unit="s", errors="coerce").dt.year
    df["bottle_age"] = df["review_year"] - df["year"]
    # Non-vintage bottlings and typos produce impossible ages.
    df.loc[(df["bottle_age"] < 0) | (df["bottle_age"] > 60), "bottle_age"] = pd.NA

    df["source"] = "cellartracker"
    df["family"] = "cellartracker"
    return df


if __name__ == "__main__":
    df = parse(RAW / "cellartracker.txt.gz")
    log.info("parsed %d reviews", len(df))
    before = len(df)
    df = df.drop_duplicates(subset=["text"])
    log.info("dropped %d duplicate texts", before - len(df))

    columns = ["text", "wine", "wine_id", "variety", "year", "rating", "time",
               "review_year", "bottle_age", "user_id", "source", "family"]
    df[columns].to_parquet(OUT / "cellartracker.parquet", compression="zstd", index=False)

    log.info("wrote %d reviews | %d wines | %d users | years %s-%s",
             len(df), df["wine_id"].nunique(), df["user_id"].nunique(),
             int(df["review_year"].min()), int(df["review_year"].max()))
    log.info("bottle age known for %d reviews (median %.0f yrs)",
             df["bottle_age"].notna().sum(), df["bottle_age"].median())
