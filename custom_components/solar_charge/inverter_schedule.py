"""Inverter schedule calculations for Solar Charge.

Calculates the 6-slot Deye/Sunsynk program schedule optimised for the
GloBird Zero Hero tariff (Sydney):

  00:00 – 11:00  Shoulder (46.2c)  — coast overnight on battery
  11:00 – 14:00  FREE (0c)         — fill battery from grid
  14:00 – 16:00  Shoulder (46.2c)  — hold charge
  16:00 – 18:00  Peak (57.2c)      — use battery for house
  18:00 – 21:00  Peak + ZeroHero + Super Export — export to grid
  21:00 – 00:00  Peak → Shoulder   — hold overnight reserve

This module has zero Home Assistant dependencies and is fully unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time

# ---------------------------------------------------------------------------
# Deye entity option strings
# ---------------------------------------------------------------------------

CHARGE_NO_GRID = "No Grid or Gen"
CHARGE_ALLOW_GRID = "Allow Grid"
CHARGE_ALLOW_GEN = "Allow Gen"
CHARGE_ALLOW_GRID_AND_GEN = "Allow Grid & Gen"

LOAD_LIMIT_ALLOW_EXPORT = "Allow Export"
LOAD_LIMIT_ESSENTIALS = "Essentials"
LOAD_LIMIT_ZERO_EXPORT = "Zero Export"

OVERNIGHT_FLOOR_PCT = 10
"""Lowest SOC the overnight slots discharge to. Deye shutdown is 7 %."""


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class InverterSlot:
    """Configuration for a single Deye program time slot."""

    start_time: time
    """When this slot becomes active (local time)."""

    charge_mode: str
    """Deye charge source option string."""

    capacity_pct: int
    """Minimum battery SOC floor (%) — inverter won't discharge below this."""

    power_w: int
    """Maximum charge / discharge power limit (W)."""

    load_limit: str
    """Deye load-limit option string (controls export behaviour)."""

    sell: bool = False
    """Per-slot "sell" flag (bit 0x40 of the slot's charge register).

    The battery only exports in Allow Export mode when the active slot has
    this flag set — without it the inverter idles and the house runs on grid.
    """


@dataclass(frozen=True)
class InverterScheduleInputs:
    """Runtime inputs fed into schedule calculation."""

    overnight_reserve_pct: int = 25
    """SOC % the house needs overnight (from OvernightTracker). Informational
    here: the export guard uses it to decide when export stops."""

    export_allowed: bool = True
    """False once the evening export must stop to keep the overnight reserve.
    The export slot then behaves like Zero Export: the battery keeps powering
    the house but sends nothing to the grid."""


# ---------------------------------------------------------------------------
# Schedule calculation
# ---------------------------------------------------------------------------


def calculate_inverter_schedule(inputs: InverterScheduleInputs) -> list[InverterSlot]:
    """Return 6 Deye program slots optimised for GloBird Zero Hero.

    Slots are returned in ascending start-time order (prog1 → prog6).
    Every discharge slot runs down to OVERNIGHT_FLOOR_PCT. The overnight
    reserve is protected by *stopping export* (``export_allowed``), not by a
    slot floor: a floor would also stop the battery powering the house and
    put it on peak-rate grid, losing the ZeroHero credit.
    """
    export = inputs.export_allowed

    return [
        # ── Slot 1 ── Midnight → 11am ─────────────────────────────────────
        # Coast overnight on battery, down to the hard floor.
        InverterSlot(
            start_time=time(0, 0),
            charge_mode=CHARGE_NO_GRID,
            capacity_pct=OVERNIGHT_FLOOR_PCT,
            power_w=12000,
            load_limit=LOAD_LIMIT_ZERO_EXPORT,
        ),
        # ── Slot 2 ── 11am → 2pm ──────────────────────────────────────────
        # Deye constrains prog2 to 01:00-09:00. Repeat the overnight policy
        # so prog3 can begin the free window at 11:00.
        InverterSlot(
            start_time=time(9, 0),
            charge_mode=CHARGE_NO_GRID,
            capacity_pct=OVERNIGHT_FLOOR_PCT,
            power_w=12000,
            load_limit=LOAD_LIMIT_ZERO_EXPORT,
        ),
        # ── Slot 3 ── 2pm → 4pm ───────────────────────────────────────────
        # FREE electricity window. Pull from grid + solar to fill battery.
        InverterSlot(
            start_time=time(11, 0),
            charge_mode=CHARGE_ALLOW_GRID_AND_GEN,
            capacity_pct=100,
            power_w=12000,
            load_limit=LOAD_LIMIT_ZERO_EXPORT,
        ),
        # ── Slot 4 ── 4pm → 6pm ───────────────────────────────────────────
        # Paid rates resume. Use battery for the house; no export yet.
        InverterSlot(
            start_time=time(14, 0),
            charge_mode=CHARGE_NO_GRID,
            capacity_pct=20,
            power_w=12000,
            load_limit=LOAD_LIMIT_ZERO_EXPORT,
        ),
        # ── Slot 5 ── 6pm → 9pm ───────────────────────────────────────────
        # ZeroHero + Super Export window.
        #   • Allow Export → battery pushes power to grid
        #   • Export stops (export_allowed=False) once SOC reaches floor +
        #     overnight need + rest-of-evening house load; the battery then
        #     keeps carrying the house to 21:00 and through the night
        #   • Earning up to 15c + 5c = 20c/kWh on first 15 kWh exported
        #   • Keeping grid import ≤ 0.09 kWh total earns the $1/day credit
        #   • sell=True is required: without the slot's sell flag the battery
        #     idles in Allow Export and the house runs on grid (3-4 Nov).
        InverterSlot(
            start_time=time(18, 0),
            charge_mode=CHARGE_NO_GRID,
            capacity_pct=OVERNIGHT_FLOOR_PCT,
            power_w=12000,
            load_limit=LOAD_LIMIT_ALLOW_EXPORT if export else LOAD_LIMIT_ZERO_EXPORT,
            sell=export,
        ),
        # ── Slot 6 ── 9pm → midnight ──────────────────────────────────────
        # Export window closed. Battery carries the house overnight, down to
        # the hard floor; the export floor above left enough for this.
        InverterSlot(
            start_time=time(21, 0),
            charge_mode=CHARGE_NO_GRID,
            capacity_pct=OVERNIGHT_FLOOR_PCT,
            power_w=12000,
            load_limit=LOAD_LIMIT_ZERO_EXPORT,
        ),
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def format_slot_time(t: time) -> str:
    """Format a time for the Deye select entity option (H:MM, no zero-pad hour)."""
    return f"{t.hour}:{t.minute:02d}"


def current_slot_index(now_time: time, slots: list[InverterSlot]) -> int:
    """Return the 0-based index of the slot currently active.

    The active slot is the last one whose start_time is ≤ now_time.
    """
    active = 0
    for i, slot in enumerate(slots):
        if slot.start_time <= now_time:
            active = i
    return active


def next_slot_start(now_time: time, slots: list[InverterSlot]) -> time:
    """Return the start time of the next slot after the current one."""
    idx = current_slot_index(now_time, slots)
    next_idx = (idx + 1) % len(slots)
    return slots[next_idx].start_time
