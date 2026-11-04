"""Load the pure overnight model module without Home Assistant imports."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "solar_charge"
    / "overnight_model.py"
)

spec = importlib.util.spec_from_file_location("solar_charge_overnight_model", MODULE_PATH)
assert spec is not None
assert spec.loader is not None

overnight_model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = overnight_model
spec.loader.exec_module(overnight_model)
