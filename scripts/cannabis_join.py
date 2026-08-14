"""Join what people say about a strain to what the lab measured in it.

Cannabis is the only domain here where both exist for the same material, which
makes it the one place a claimed perceptual distinction can be checked rather
than asserted. Everything else in the project rests on words agreeing with
words; this rests on words agreeing with a gas chromatograph.

Two tables out, both keyed by strain:

  cannabis_strain_text.parquet     rate at which each descriptor appears in
                                   that strain's reviews
  cannabis_strain_chem.parquet     median terpene profile -- each sample scaled
                                   to composition, then median across the
                                   strain's lab samples

Sample names carry preparation prefixes -- "BHO Blackberry 22" is Blackberry as
an extract -- so the join normalises those away. An extract and a flower of the
same strain differ in concentration but not much in composition, and
composition is what the descriptors are about.
"""

import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "cannabis"
CORPUS = ROOT / "data" / "corpus"
LEX = ROOT / "data" / "lexicon"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cannabis")

TERPENES = ["Terpinolene", "Linalool", "alpha-Humulene", "alpha-Pinene",
            "beta-Caryophyllene", "beta-Myrcene", "beta-Pinene", "delta-Limonene",
            "Caryophyllene Oxide"]

PREPARATION = re.compile(
    r"\b(bho|co2|wax|shatter|oil|kief|hash|budder|crumble|live resin|distillate|"
    r"cartridge|pre.?roll|flower|trim|sample|test)\b")

MIN_SAMPLES = 3    # lab samples per strain
MIN_REVIEWS = 15   # reviews per strain


def normalise(name):
    name = PREPARATION.sub(" ", str(name).lower())
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def chemistry():
    frame = pd.read_csv(RAW / "results.csv", low_memory=False)
    frame = frame.dropna(subset=TERPENES)
    frame["strain"] = frame["Sample Name"].map(normalise)
    frame = frame[frame["strain"] != ""]

    # Concentration units vary between providers and preparations; the shape of
    # the terpene profile is what survives that, so each sample is normalised to
    # its own total before anything is averaged.
    values = frame[TERPENES].to_numpy(float)
    total = values.sum(axis=1, keepdims=True)
    frame[TERPENES] = np.divide(values, total, out=np.zeros_like(values), where=total > 0)
    frame = frame[total.ravel() > 0]

    counts = frame.groupby("strain").size()
    frame = frame[frame["strain"].isin(counts[counts >= MIN_SAMPLES].index)]
    profile = frame.groupby("strain")[TERPENES].median()
    log.info("chemistry: %d strains with >=%d samples", len(profile), MIN_SAMPLES)
    return profile


def text():
    reviews = pd.read_parquet(CORPUS / "cannabis_reviews.parquet")
    reviews["strain"] = reviews["strain"].map(normalise)

    doc_terms = pd.read_parquet(LEX / "domain_doc_terms.parquet")
    doc_terms = doc_terms[doc_terms["domain"].astype(str) == "cannabis"]
    doc_terms["term"] = doc_terms["term"].astype(str)

    # domain_doc_terms indexes the english, long-enough subset in corpus order;
    # rebuild that subset the same way so doc_id lines up with a review.
    from vino.lang import is_english
    subset = reviews["text"].dropna().astype(str)
    subset = subset[subset.str.len() >= 40]
    if len(subset) > 150_000:
        subset = subset.sample(150_000, random_state=0)
    subset = subset.reset_index()
    subset = subset[subset["text"].map(is_english)].reset_index(drop=True)
    subset["doc_id"] = np.arange(len(subset))

    subset["strain"] = reviews["strain"].to_numpy()[subset["index"]]
    counts = subset.groupby("strain").size()
    keep = set(counts[counts >= MIN_REVIEWS].index)

    merged = doc_terms.merge(subset[["doc_id", "strain"]], on="doc_id")
    merged = merged[merged["strain"].isin(keep)]
    merged["strain"] = merged["strain"].astype(str)

    # Counted and divided over the same index, built here rather than aligned
    # against a series assembled elsewhere.
    tally = merged.groupby(["strain", "term"], observed=True).size().unstack(fill_value=0)
    rate = tally.div(counts.reindex(tally.index).to_numpy(), axis=0)
    assert not rate.isna().to_numpy().any(), "descriptor rates must be complete"
    log.info("text: %d strains with >=%d reviews, %d descriptors",
             len(rate), MIN_REVIEWS, rate.shape[1])
    return rate, counts.reindex(sorted(keep))


if __name__ == "__main__":
    chem = chemistry()
    rate, reviews_per_strain = text()

    shared = sorted(set(chem.index) & set(rate.index))
    log.info("strains with both chemistry and reviews: %d", len(shared))

    chem = chem.loc[shared]
    rate = rate.loc[shared]
    rate = rate.loc[:, (rate > 0).sum() >= 0.1 * len(shared)]
    log.info("descriptors present in >=10%% of strains: %d", rate.shape[1])

    chem.to_parquet(LEX / "cannabis_strain_chem.parquet", compression="zstd")
    rate.to_parquet(LEX / "cannabis_strain_text.parquet", compression="zstd")
    reviews_per_strain.reindex(shared).to_frame("reviews").to_parquet(
        LEX / "cannabis_strain_reviews.parquet", compression="zstd")
    log.info("median reviews per strain: %.0f", reviews_per_strain.reindex(shared).median())
