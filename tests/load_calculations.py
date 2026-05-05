"""Load the pure calculation module without importing Home Assistant modules."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "solar_charge"
    / "calculations.py"
)

spec = importlib.util.spec_from_file_location("solar_charge_calculations", MODULE_PATH)
assert spec is not None
assert spec.loader is not None

calculations = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = calculations
spec.loader.exec_module(calculations)

ChargeInputs = calculations.ChargeInputs
ChargeSettings = calculations.ChargeSettings
calculate_charge_decision = calculations.calculate_charge_decision
is_in_time_window = calculations.is_in_time_window

