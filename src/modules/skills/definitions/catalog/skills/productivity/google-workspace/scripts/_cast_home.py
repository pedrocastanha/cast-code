"""Resolve CAST_HOME for standalone skill scripts.

Skill scripts may run outside the Cast process (e.g. system Python,
nix env, CI) where ``cast_constants`` is not importable.  This module
provides the same ``get_cast_home()`` and ``display_cast_home()``
contracts as ``cast_constants`` without requiring it on ``sys.path``.

When ``cast_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``cast_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``CAST_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from cast_constants import display_cast_home as display_cast_home
    from cast_constants import get_cast_home as get_cast_home
except (ModuleNotFoundError, ImportError):

    def get_cast_home() -> Path:
        """Return the Cast home directory (default: ~/.cast).

        Mirrors ``cast_constants.get_cast_home()``."""
        val = os.environ.get("CAST_HOME", "").strip()
        return Path(val) if val else Path.home() / ".cast"

    def display_cast_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``cast_constants.display_cast_home()``."""
        home = get_cast_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
