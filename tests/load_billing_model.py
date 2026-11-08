"""Load the pure billing model module without Home Assistant imports."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "solar_charge"
    / "billing_model.py"
)

spec = importlib.util.spec_from_file_location("solar_charge_billing_model", MODULE_PATH)
assert spec is not None
assert spec.loader is not None

billing_model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = billing_model
spec.loader.exec_module(billing_model)
