"""Overnight energy tracker for Solar Charge.

Tracks battery SOC at key points in the day to calculate a rolling average
of overnight energy consumption. This drives the dynamic reserve target
written into the Deye inverter's program slots 1 and 6.

Also accumulates grid import / export energy during the GloBird ZeroHero
window (18:00 – 21:00) to show whether the $1/day credit will be earned
and how much Super Export credit has been accumulated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "solar_charge_overnight"
STORAGE_VERSION = 1

# ZeroHero: imports must average ≤ 0.03 kWh/h over 3 hours = 0.09 kWh total
ZEROHERO_WINDOW_START = time(18, 0)
ZEROHERO_WINDOW_END = time(21, 0)
ZEROHERO_MAX_IMPORT_KWH = 0.09

# Super Export: first 15 kWh exported 6pm–9pm earns 15c/kWh bonus
SUPER_EXPORT_MAX_KWH = 15.0

# Snapshot windows — record SOC within these 2-minute windows each day
SNAPSHOT_2100_START = time(21, 0)
SNAPSHOT_2100_END = time(21, 2)
SNAPSHOT_1100_START = time(11, 0)
SNAPSHOT_1100_END = time(11, 2)

MAX_STORED_DAYS = 30


@dataclass
class OvernightSnapshot:
    """Recorded SOC values for a single day."""

    date: str
    """ISO date string (YYYY-MM-DD)."""

    soc_2100: float | None = None
    """Battery SOC (%) recorded at 21:00 — start of overnight period."""

    soc_1100: float | None = None
    """Battery SOC (%) recorded at 11:00 — end of overnight period."""

    def consumption_kwh(self, capacity_kwh: float) -> float | None:
        """Calculate overnight consumption in kWh. None if data incomplete."""
        if self.soc_2100 is None or self.soc_1100 is None:
            return None
        delta_pct = self.soc_2100 - self.soc_1100
        if delta_pct <= 0:
            # Battery was charged overnight (grid charge or unexpected) — skip
            return None
        return (delta_pct / 100.0) * capacity_kwh


class OvernightTracker:
    """Track overnight battery consumption and ZeroHero window energy.

    Call ``async_load()`` once after instantiation (before the first
    ``update()`` call) to restore persisted data across HA restarts.
    """

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        battery_capacity_kwh: float,
    ) -> None:
        self._hass = hass
        self.battery_capacity_kwh = battery_capacity_kwh
        self._store: Store = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry_id}"
        )
        self._snapshots: list[OvernightSnapshot] = []
        self._loaded = False

        # Track which dates we've already recorded snapshots for
        self._recorded_2100: str | None = None
        self._recorded_1100: str | None = None

        # ZeroHero / Super Export energy accumulators (reset each day at 18:00)
        self._window_date: str | None = None
        self.zerohero_import_kwh: float = 0.0
        self.super_export_kwh: float = 0.0

        # Previous update bookkeeping for energy integration
        self._prev_update_time: datetime | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def async_load(self) -> None:
        """Load persisted snapshots from HA storage."""
        data = await self._store.async_load()
        if data and isinstance(data, dict):
            for item in data.get("snapshots", []):
                try:
                    self._snapshots.append(
                        OvernightSnapshot(
                            date=str(item["date"]),
                            soc_2100=item.get("soc_2100"),
                            soc_1100=item.get("soc_1100"),
                        )
                    )
                except (KeyError, TypeError, ValueError):
                    _LOGGER.warning("Skipping malformed snapshot: %s", item)
            _LOGGER.debug(
                "Loaded %d overnight snapshots from storage", len(self._snapshots)
            )
        self._loaded = True

    # ------------------------------------------------------------------
    # Per-cycle update
    # ------------------------------------------------------------------

    def update(
        self,
        now: datetime,
        battery_soc_pct: float | None,
        grid_power_w: float | None,
    ) -> None:
        """Update tracker with current readings. Call once per coordinator cycle.

        Args:
            now: Current local datetime.
            battery_soc_pct: Current battery SOC (%).
            grid_power_w: Grid power in watts. Positive = import, negative = export.
        """
        if not self._loaded:
            return

        today = now.date().isoformat()
        current_time = now.timetz().replace(tzinfo=None)

        # ── SOC snapshots ─────────────────────────────────────────────
        if battery_soc_pct is not None:
            if (
                SNAPSHOT_2100_START <= current_time < SNAPSHOT_2100_END
                and self._recorded_2100 != today
            ):
                self._record_snapshot(today, soc_2100=battery_soc_pct)
                self._recorded_2100 = today

            if (
                SNAPSHOT_1100_START <= current_time < SNAPSHOT_1100_END
                and self._recorded_1100 != today
            ):
                self._record_snapshot(today, soc_1100=battery_soc_pct)
                self._recorded_1100 = today

        # ── ZeroHero / Super Export energy tracking ───────────────────
        self._update_energy_window(now, today, current_time, grid_power_w)

    # ------------------------------------------------------------------
    # Calculations
    # ------------------------------------------------------------------

    def average_overnight_consumption_kwh(self, days: int = 14) -> float | None:
        """Rolling N-day average overnight consumption in kWh.

        Returns ``None`` if fewer than 2 complete snapshots are available.
        """
        complete = [
            s for s in self._snapshots
            if s.soc_2100 is not None and s.soc_1100 is not None
        ]
        if len(complete) < 2:
            return None

        # Sort by date descending, take the last `days` complete snapshots
        complete.sort(key=lambda s: s.date, reverse=True)
        recent = complete[:days]

        consumptions = [
            c for s in recent
            if (c := s.consumption_kwh(self.battery_capacity_kwh)) is not None
        ]
        if not consumptions:
            return None

        return round(sum(consumptions) / len(consumptions), 2)

    def calculate_reserve_pct(
        self,
        margin_pct: float = 20.0,
        days: int = 14,
    ) -> int | None:
        """Recommended SOC reserve % to set in inverter slots 1 and 6.

        Applies a safety margin on top of the rolling average and clamps
        the result between 10 % and 60 %.

        Returns ``None`` if not enough historical data yet.
        """
        avg_kwh = self.average_overnight_consumption_kwh(days)
        if avg_kwh is None:
            return None

        required_kwh = avg_kwh * (1.0 + margin_pct / 100.0)
        reserve_pct = (required_kwh / self.battery_capacity_kwh) * 100.0
        return int(max(10.0, min(60.0, reserve_pct)))

    @property
    def zerohero_eligible(self) -> bool:
        """True if we are on track to earn the ZeroHero $1/day credit.

        Condition: total grid import during 6pm–9pm ≤ 0.09 kWh.
        Only meaningful during or after the current window.
        """
        return self.zerohero_import_kwh <= ZEROHERO_MAX_IMPORT_KWH

    @property
    def snapshot_count(self) -> int:
        """Number of complete (both values present) overnight snapshots."""
        return sum(
            1 for s in self._snapshots
            if s.soc_2100 is not None and s.soc_1100 is not None
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _update_energy_window(
        self,
        now: datetime,
        today: str,
        current_time: time,
        grid_power_w: float | None,
    ) -> None:
        """Accumulate grid import/export energy during the ZeroHero window."""
        in_window = ZEROHERO_WINDOW_START <= current_time < ZEROHERO_WINDOW_END

        # Reset accumulators at the start of each day's window
        if self._window_date != today and in_window:
            self.zerohero_import_kwh = 0.0
            self.super_export_kwh = 0.0
            self._window_date = today
            _LOGGER.debug("ZeroHero window reset for %s", today)
        elif self._window_date != today and current_time >= ZEROHERO_WINDOW_END:
            # Past today's window — mark so we don't reset tomorrow prematurely
            self._window_date = today

        # Integrate energy only inside the window
        if (
            in_window
            and self._prev_update_time is not None
            and grid_power_w is not None
        ):
            elapsed_h = (now - self._prev_update_time).total_seconds() / 3600.0
            # Sanity-check: ignore gaps > 5 minutes (HA restart, etc.)
            if 0 < elapsed_h < (5 / 60):
                if grid_power_w > 0:
                    self.zerohero_import_kwh += (grid_power_w / 1000.0) * elapsed_h
                elif grid_power_w < 0:
                    # Export (negative grid power)
                    exported = (-grid_power_w / 1000.0) * elapsed_h
                    self.super_export_kwh = min(
                        self.super_export_kwh + exported, SUPER_EXPORT_MAX_KWH
                    )

        self._prev_update_time = now

    def _record_snapshot(
        self,
        date_str: str,
        soc_2100: float | None = None,
        soc_1100: float | None = None,
    ) -> None:
        """Record or update a SOC snapshot for the given date."""
        for snap in self._snapshots:
            if snap.date == date_str:
                if soc_2100 is not None:
                    snap.soc_2100 = soc_2100
                if soc_1100 is not None:
                    snap.soc_1100 = soc_1100
                _LOGGER.info(
                    "Updated snapshot %s: soc_2100=%s%% soc_1100=%s%%",
                    date_str,
                    snap.soc_2100,
                    snap.soc_1100,
                )
                self._schedule_save()
                return

        # New date
        new_snap = OvernightSnapshot(
            date=date_str,
            soc_2100=soc_2100,
            soc_1100=soc_1100,
        )
        self._snapshots.append(new_snap)

        # Prune to most recent MAX_STORED_DAYS
        if len(self._snapshots) > MAX_STORED_DAYS:
            self._snapshots.sort(key=lambda s: s.date)
            self._snapshots = self._snapshots[-MAX_STORED_DAYS:]

        _LOGGER.info(
            "Recorded new snapshot %s: soc_2100=%s%% soc_1100=%s%%",
            date_str,
            soc_2100,
            soc_1100,
        )
        self._schedule_save()

    def _schedule_save(self) -> None:
        """Fire-and-forget save to persistent storage."""
        self._hass.async_create_task(self._async_save())

    async def _async_save(self) -> None:
        """Persist snapshots to HA storage."""
        await self._store.async_save(
            {
                "snapshots": [
                    {
                        "date": s.date,
                        "soc_2100": s.soc_2100,
                        "soc_1100": s.soc_1100,
                    }
                    for s in self._snapshots
                ]
            }
        )
