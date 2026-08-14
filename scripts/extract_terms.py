"""Entry point for descriptor extraction. Must be a real module: spaCy's
n_process uses spawn on macOS, which re-imports the main file."""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vino.extract import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--n-process", type=int, default=10)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(limit=args.limit, n_process=args.n_process)
