"""Shared fixtures: the source tables, the pipeline output, and the built page.

The data is fixed, so every one of these is loaded once and reused. A test that
fails here means either the pipeline changed or the tables did -- nothing else
can move.
"""
import json
import pathlib
import re

import numpy as np
import pandas as pd
import pytest

HERE = pathlib.Path(__file__).parent
LEX = HERE.parent / "data" / "lexicon"
PAGE = HERE / "horizon.html"
NAVDATA = HERE / "navdata.json"

# The four words that fail the bearing test. They name a distinction that makes
# no difference here, so they must not reach the page.
DEAD = {"rose", "sage", "spicyHerbal", "tobacco"}
COVERAGE = 0.55                      # a smell must be scored on this share of strains


@pytest.fixture(scope="session")
def tables():
    """Flavour and effect scores, aligned on the strains that have both."""
    if not LEX.exists():
        pytest.skip(f"corpus not present at {LEX}")
    fl = pd.read_parquet(LEX / "cannabis_strain_flavor.parquet")
    ef = pd.read_parquet(LEX / "cannabis_strain_effect.parquet")
    fl.columns = [c.replace("flavor_", "").replace("_score", "") for c in fl.columns]
    fl, ef = fl.align(ef, join="inner", axis=0)
    return fl, ef


@pytest.fixture(scope="session")
def nav():
    """What the pipeline produced."""
    if not NAVDATA.exists():
        pytest.skip("run navdata.py first")
    return json.loads(NAVDATA.read_text())


@pytest.fixture(scope="session")
def page():
    """The built page, as text."""
    if not PAGE.exists():
        pytest.skip("run build_horizon.py first")
    return PAGE.read_text()


@pytest.fixture(scope="session")
def baked(page):
    """The data the page actually carries, dug back out of the script tag."""
    m = re.search(r"^const D = (\{.*\});$", page, re.M)
    assert m, "the page no longer carries its data as `const D = {...};`"
    return json.loads(m.group(1))


def region(scores, index):
    """The strains a word names: its top third, by the same rule the pipeline uses."""
    v = scores.dropna()
    return sorted(int(index.get_loc(i)) for i in v[v >= v.quantile(2 / 3)].index)


def unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n else v


def gap(a, b):
    """Smallest angle between two hues, in degrees."""
    return abs((a - b + 180) % 360 - 180)
