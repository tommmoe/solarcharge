"""Load the pure inverter schedule module without Home Assistant imports."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "solar_charge"
    / "inverter_schedule.py"
)

spec = importlib.util.spec_from_file_location("solar_charge_inverter_schedule", MODULE_PATH)
assert spec is not None
assert spec.loader is not None

inverter_schedule = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = inverter_schedule
spec.loader.exec_module(inverter_schedule)

InverterScheduleInputs = inverter_schedule.InverterScheduleInputs
calculate_inverter_schedule = inverter_schedule.calculate_inverter_schedule

