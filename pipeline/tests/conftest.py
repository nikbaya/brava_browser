"""Shared pytest config/fixtures for the BRaVa ETL tests.

Adds the pipeline dir to sys.path (so `import common` works when pytest is run
from anywhere) and exposes the built-data dir, skipping data-dependent tests
gracefully when the local build hasn't been run.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PIPELINE))

BUILD = PIPELINE / "build"


@pytest.fixture(scope="session")
def build_dir() -> Path:
    """Path to the locally-built data (pipeline/build); skip if absent."""
    if not (BUILD / "meta" / "phenotypes.json").exists():
        pytest.skip("no local build/ — run `make full` (or `make sample`) first")
    return BUILD
