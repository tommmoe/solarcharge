"""Load the pure session engine module without importing Home Assistant."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "solar_charge"
    / "session_engine.py"
)

spec = importlib.util.spec_from_file_location("solar_charge_session_engine", MODULE_PATH)
assert spec is not None
assert spec.loader is not None

session_engine = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = session_engine
spec.loader.exec_module(session_engine)

SessionEngine = session_engine.SessionEngine
ChargeSession = session_engine.ChargeSession
EVENT_STARTED = session_engine.EVENT_STARTED
EVENT_ENDED = session_engine.EVENT_ENDED
