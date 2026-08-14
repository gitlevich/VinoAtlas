"""Profile candidate terms: usage across discourse families, distributional
geometry from co-occurrence, and semantic geometry from a language model.

The two geometries are kept separate on purpose. Semantic embeddings say how
words relate in general language; co-occurrence says how this domain actually
deploys them. A distinction that shows up in only one of them is not yet
evidence of anything.

The family split carries the perceptibility signal. A term used by community
tasters as readily as by critics is more likely to name something perceivable
without training; critic-only vocabulary is suspect as jargon until shown
otherwise.
"""

import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import CountVectorizer

from .lang import is_english

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "data" / "corpus"
LEX = ROOT / "data" / "lexicon"
RAW = ROOT / "data" / "raw"

log = logging.getLogger(__name__)

MIN_COUNT = 40           # a term must be used this often to be worth modelling
SVD_DIMS = 128
TEMPLATES = [
    "The wine is {}.",
    "aromas of {} on the nose",
    "a {} character on the palate",
]


def candidate_vocabulary(min_count=MIN_COUNT):
    """Single-word terms plus multiword aroma referents, above a frequency floor."""
    terms = pd.read_parquet(LEX / "terms.parquet")
    single = terms.groupby(["term", "pos"], as_index=False)["n"].sum()
    single = single[single["n"] >= min_count]
    # Keep the dominant part of speech per surface form.
    single = single.sort_values("n", ascending=False).drop_duplicates("term")

    aromas = pd.read_parquet(LEX / "aromas.parquet")
    multi = aromas[aromas["phrase"].str.contains(" ")]
    multi = multi.groupby("phrase", as_index=False)["n"].sum()
    multi = multi[multi["n"] >= min_count]

    vocab = pd.concat([
        single.rename(columns={"term": "surface"})[["surface", "pos", "n"]],
        multi.rename(columns={"phrase": "surface"}).assign(pos="NOUN_PHRASE")[["surface", "pos", "n"]],
    ], ignore_index=True)
    vocab = vocab.drop_duplicates("surface").reset_index(drop=True)
    log.info("candidate vocabulary: %d terms (min_count=%d)", len(vocab), min_count)
    return vocab


def _analyzer_factory(vocab_set, max_phrase_len=3):
    """Match vocabulary against review text, including multiword phrases.

    The vocabulary holds lemmas, so plurals must be folded back - but only when
    the singular is itself a vocabulary word, otherwise "citrus" becomes
    "citru" and stops matching anything. Multiword scanning starts only at
    words that actually begin a known phrase, which keeps this pass cheap.
    """
    token_re = re.compile(r"[a-z]+")
    words_in_vocab = {w for s in vocab_set for w in s.split()}
    starters = {s.split()[0] for s in vocab_set if " " in s}
    max_len = min(max_phrase_len, max((len(s.split()) for s in vocab_set), default=1))

    def fold(word):
        if word in words_in_vocab:
            return word
        if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
            for candidate in (word[:-1], word[:-2] if word.endswith("es") else None):
                if candidate and candidate in words_in_vocab:
                    return candidate
        return word

    def analyze(text):
        words = [fold(w) for w in token_re.findall(text.lower())]
        found = [w for w in words if w in vocab_set]
        for i, word in enumerate(words):
            if word not in starters:
                continue
            for size in range(2, max_len + 1):
                if i + size > len(words):
                    break
                gram = " ".join(words[i:i + size])
                if gram in vocab_set:
                    found.append(gram)
        return found

    return analyze


def build(min_count=MIN_COUNT, svd_dims=SVD_DIMS):
    vocab = candidate_vocabulary(min_count)
    vocab_set = set(vocab["surface"])

    reviews = pd.read_parquet(CORPUS / "reviews.parquet", columns=["text", "family", "rating"])
    reviews = reviews[reviews["text"].map(is_english)].reset_index(drop=True)
    log.info("counting over %d english reviews", len(reviews))

    vectorizer = CountVectorizer(
        analyzer=_analyzer_factory(vocab_set),
        vocabulary={s: i for i, s in enumerate(vocab["surface"])},
        binary=True,
        dtype=np.int32,
    )
    X = vectorizer.transform(reviews["text"])
    log.info("doc-term matrix: %s, %d nonzeros", X.shape, X.nnz)

    # Per-family document frequency: the perceptibility proxy.
    for family in reviews["family"].unique():
        rows = np.flatnonzero((reviews["family"] == family).to_numpy())
        vocab[f"df_{family}"] = np.asarray(X[rows].sum(axis=0)).ravel()
    vocab["df_total"] = np.asarray(X.sum(axis=0)).ravel()

    for family in ("winemag", "vivino", "catalog"):
        n_docs = int((reviews["family"] == family).sum())
        vocab[f"rate_{family}"] = vocab[f"df_{family}"] / n_docs

    # Odds of a term being used by critics rather than the community, corrected
    # for the different base rates of the two corpora.
    eps = 1e-9
    vocab["critic_lift"] = np.log2((vocab["rate_winemag"] + eps) / (vocab["rate_vivino"] + eps))

    distributional = _distributional(X, svd_dims)
    semantic = _semantic(vocab["surface"].tolist())

    LEX.mkdir(parents=True, exist_ok=True)
    vocab.to_parquet(LEX / "vocab.parquet", compression="zstd", index=False)
    np.save(LEX / "vec_distributional.npy", distributional)
    np.save(LEX / "vec_semantic.npy", semantic)
    sparse.save_npz(LEX / "doc_term.npz", X.tocsr())
    reviews[["family", "rating"]].to_parquet(LEX / "doc_meta.parquet", index=False)
    log.info("wrote vocab.parquet (%d terms) and both embedding matrices", len(vocab))
    return vocab


def _distributional(X, dims):
    """PPMI over term-term co-occurrence within reviews, reduced by SVD."""
    X = X.tocsc().astype(np.float64)
    n_docs = X.shape[0]
    co = (X.T @ X).toarray()
    counts = np.diag(co).copy()
    np.fill_diagonal(co, 0)

    p_xy = co / max(n_docs, 1)
    p_x = counts / max(n_docs, 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        pmi = np.log2(p_xy / (p_x[:, None] * p_x[None, :]))
    ppmi = np.nan_to_num(pmi, nan=0.0, posinf=0.0, neginf=0.0)
    np.maximum(ppmi, 0, out=ppmi)

    dims = min(dims, min(ppmi.shape) - 1)
    svd = TruncatedSVD(n_components=dims, random_state=0)
    vectors = svd.fit_transform(ppmi)
    log.info("distributional: %s, explained variance %.2f",
             vectors.shape, svd.explained_variance_ratio_.sum())
    return _normalize(vectors)


def _semantic(surfaces):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-mpnet-base-v2", device="mps")
    stacked = []
    for template in TEMPLATES:
        sentences = [template.format(s) for s in surfaces]
        stacked.append(model.encode(sentences, batch_size=256, show_progress_bar=False,
                                    convert_to_numpy=True, normalize_embeddings=True))
    vectors = np.mean(stacked, axis=0)
    log.info("semantic: %s", vectors.shape)
    return _normalize(vectors)


def _normalize(v):
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    return v / np.maximum(norms, 1e-12)
