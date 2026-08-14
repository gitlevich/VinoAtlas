"""Place every catalogue wine in a space you can point at.

Five coordinates, and only five, because these are the distinctions two
disjoint halves of a tasting panel rank the same way (panel_reliability.parquet).
Sour, bitter, green and acidity are left out: agreement on them runs 0.05 to
0.35, so a control for them would return noise.

  weight      body, light to full
  grip        tannin, none to high
  oak         none to high
  fruit       citrus and orchard, through tropical and red, to dark
  maturity    how far into its drinking window the bottle is now

Maturity is age divided by the wine's stated aging potential, so a five-year
Beaujolais and a five-year Barolo do not land in the same place.

Pointing is done by moving five sliders or by naming wines already liked, in
which case the point is their centroid. What comes back is the nearest wines
by weighted distance, each with the one coordinate that differs most from the
point, so the answer says why it is near.

Writes data/lexicon/wine_space.json: one record per wine, five coordinates on
0 to 1, plus the fields needed to explain a match.
"""

import json
import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CATALOG = Path("/Users/vlad/wines.csv")
OUT = ROOT / "data" / "lexicon" / "wine_space.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("space")

WEIGHT = {"light": 0.0, "light to medium": 0.25, "light-medium": 0.25, "medium": 0.5,
          "medium-bodied": 0.5, "moderate": 0.5, "medium to full": 0.75,
          "medium-full": 0.75, "full": 1.0, "full-bodied": 1.0, "rich": 1.0}
GRIP = {"none": 0.0, "very low": 0.1, "low": 0.25, "low to medium": 0.35, "medium": 0.5,
        "moderate": 0.5, "medium to high": 0.75, "medium-high": 0.75, "high": 1.0,
        "very high": 1.0, "firm": 0.8}
OAK = {"none": 0.0, "no": 0.0, "minimal": 0.15, "light": 0.25, "low": 0.25, "subtle": 0.25,
       "moderate": 0.5, "medium": 0.5, "yes": 0.6, "significant": 0.8, "high": 1.0,
       "heavy": 1.0, "pronounced": 0.9}

# Fruit runs on one line from pale to dark; the ends are the two things
# tasters separate most reliably (floral/citrus against dark fruit).
FRUIT_POLES = [
    (0.00, r"lemon|lime|citrus|green apple|grapefruit|gooseberry|lemongrass"),
    (0.20, r"apple|pear|quince|white flower|floral|acacia|honeysuckle|chamomile"),
    (0.40, r"peach|apricot|melon|pineapple|mango|passion|tropical|lychee"),
    (0.60, r"strawberry|raspberry|red cherry|cranberry|red fruit|redcurrant|rose"),
    (0.80, r"cherry|plum|red and black|black cherry|blueberry|violet"),
    (1.00, r"blackberry|blackcurrant|cassis|dark fruit|black fruit|prune|fig|tar|leather"),
]

AGING = re.compile(r"(\d+)\s*(?:-|to|–)\s*(\d+)\s*year|(\d+)\s*\+?\s*year")
AGING_WORDS = {"low": 4, "short": 4, "medium": 8, "moderate": 8, "high": 18,
               "long": 18, "very high": 30, "excellent": 25}


def norm(v):
    return re.sub(r"\s+", " ", str(v).strip().lower())


def scale(value, table):
    v = norm(value)
    if v in table:
        return table[v]
    for key in sorted(table, key=len, reverse=True):
        if key and key in v:
            return table[key]
    return None


def fruit_axis(text):
    text = text.lower()
    hits = [(w, len(re.findall(p, text))) for w, p in FRUIT_POLES]
    total = sum(n for _, n in hits)
    if not total:
        return None
    return sum(w * n for w, n in hits) / total


def window_years(value):
    v = norm(value)
    m = AGING.search(v)
    if m:
        a, b, c = m.groups()
        return (int(a) + int(b)) / 2 if a else int(c)
    for word, years in AGING_WORDS.items():
        if word in v:
            return years
    return None


def build():
    frame = pd.read_csv(CATALOG)
    rows = []
    for name, blob in zip(frame["wine_name"], frame["research_json"]):
        try:
            r = json.loads(blob)
        except (json.JSONDecodeError, TypeError):
            continue
        res = {k.lower().replace(" ", "_"): v for k, v in (r.get("researched") or {}).items()}
        fields = r.get("custom_fields") or {}

        vintage = re.search(r"\b(19[0-9]{2}|20[0-2][0-9])\b", str(name))
        vintage = int(vintage.group(1)) if vintage else None
        window = window_years(res.get("aging_potential", ""))
        maturity = None
        if vintage and window:
            maturity = min(max((2026 - vintage) / window, 0), 1.4) / 1.4

        record = dict(
            id=str(r.get("item_id", "")), name=str(name),
            variety=str(res.get("grape_variety") or fields.get("Varietal") or "").strip(),
            region=str(fields.get("Region") or res.get("appellation") or "").strip(),
            vintage=vintage,
            weight=scale(res.get("body", ""), WEIGHT),
            grip=scale(res.get("tannin", ""), GRIP),
            oak=scale(res.get("oak_influence", ""), OAK),
            fruit=fruit_axis(f"{res.get('nose','')} {res.get('palate','')}"),
            maturity=maturity,
            nose=str(res.get("nose", "")), palate=str(res.get("palate", "")),
            sparkling=bool(re.search(r"sparkl|spritz", norm(res.get("carbonation", "")))),
        )
        rows.append(record)

    data = pd.DataFrame(rows)
    axes = ["weight", "grip", "oak", "fruit", "maturity"]
    # A wine needs at least three of five to be placeable; the rest are filled
    # with the catalogue median so one missing field does not exile it.
    known = data[axes].notna().sum(axis=1)
    data = data[known >= 3].copy()
    for axis in axes:
        data[axis] = data[axis].fillna(data[axis].median())
        data[f"{axis}_known"] = True

    log.info("placed %d of %d wines", len(data), len(rows))
    for axis in axes:
        log.info("  %-9s median %.2f  spread %.2f", axis, data[axis].median(), data[axis].std())

    OUT.write_text(json.dumps(dict(
        axes=axes,
        labels=dict(weight="Weight in the mouth", grip="Tannin grip", oak="Oak",
                    fruit="Fruit character", maturity="How far into its window"),
        ends=dict(weight=["light", "full"], grip=["soft", "firm"], oak=["none", "heavy"],
                  fruit=["citrus, orchard", "dark fruit"], maturity=["young", "at peak or past"]),
        wines=data[["id", "name", "variety", "region", "vintage", "nose", "palate",
                    "sparkling"] + axes].to_dict(orient="records"),
    ), separators=(",", ":")))
    log.info("wrote %s", OUT)
    return data


if __name__ == "__main__":
    build()
