"""Normalized write paths, one module per migration domain (see docs/MIGRATION_PLAN.md).

Each module takes a `cursor` and `T`, the app's `core_table` function, so it never imports `main` (no cycles) and
can be unit-tested with a fake cursor. The LEGACY write code in `main.py` is left exactly as it was; a flag
(`main.normalized_writes(domain)`) chooses which path runs.
"""
