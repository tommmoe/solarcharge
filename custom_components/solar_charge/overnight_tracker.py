"""Overnight energy tracker for Solar Charge (Home Assistant wrapper).

All logic lives in ``overnight_model`` (pure, unit-tested). This class feeds
it live readings, persists its state so restarts don't lose a night in
progress, and tracks grid energy in the GloBird ZeroHero window
(18:00 – 21:00) for the $1/day credit and Super Export.
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .overnight_model import (
    ExportGuard,
    NightAccumulator,
    NightRecord,
    WindowMeter,
    design_night_kwh,
    reserve_pct,
)

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "solar_charge_overnight"
STORAGE_VERSION = 1
SAVE_DELAY_S = 60

# ZeroHero: imports must average ≤ 0.03 kWh/h over 3 hours = 0.09 kWh total
ZEROHERO_MAX_IMPORT_KWH = 0.09


class OvernightTracker:
    """Measure overnight consumption, size the reserve, guard the export.

    Call ``async_load()`` once before the first ``update()``.
    """

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        battery_capacity_kwh: float,
    ) -> None:
        self._hass = hass
        self.battery_capacity_kwh = battery_capacity_kwh
        self._store: Store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry_id}")
        self._loaded = False

        self.nights = NightAccumulator()
        self.export_guard = ExportGuard()

        # ZeroHero / Super Export energy (reset each day at 18:00)
        self.window = WindowMeter()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def async_load(self) -> None:
        """Restore persisted state.

        Data from versions before 1.2.17 (``snapshots``) is discarded on
        purpose: it paired each day's 21:00 SOC with the *same* morning's
        11:00 SOC, so it measured the daytime gain, not overnight use.
        """
        data = await self._store.async_load()
        if isinstance(data, dict):
            self.nights = NightAccumulator.from_dict(data.get("overnight"))
            zh = data.get("zerohero") or {}
            self.window = WindowMeter(
                date=zh.get("date"),
                import_kwh=float(zh.get("import_kwh", 0.0)),
                export_kwh=float(zh.get("export_kwh", 0.0)),
            )
            if "snapshots" in data and "overnight" not in data:
                _LOGGER.info(
                    "Discarding legacy overnight snapshots (measured daytime "
                    "gain, not overnight use); fallback reserve applies until "
                    "3 nights are measured"
                )
        self._loaded = True

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "overnight": self.nights.as_dict(),
            "zerohero": {
                "date": self.window.date,
                "import_kwh": self.window.import_kwh,
                "export_kwh": self.window.export_kwh,
            },
        }

    def _schedule_save(self) -> None:
        # Coalesced write; HA flushes pending delayed saves on shutdown.
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_S)

    # ------------------------------------------------------------------
    # Per-cycle update
    # ------------------------------------------------------------------

    def update(
        self,
        now: datetime,
        battery_soc_pct: float | None,
        grid_power_w: float | None,
    ) -> None:
        """Feed one cycle of readings. Grid power: positive = import."""
        if not self._loaded:
            return

        was_active = self.nights.active is not None
        finished = self.nights.update(now, battery_soc_pct, grid_power_w)
        if finished is not None:
            self._log_night(finished)
        if was_active or self.nights.active is not None or finished is not None:
            self._schedule_save()

        self.record_grid(now, grid_power_w)

    def record_grid(self, now: datetime, grid_power_w: float | None) -> None:
        """Feed a grid-power reading (positive = import) to the window meter.

        Called on every grid sensor state change as well as each cycle, so
        short load spikes are measured at the sensor's own resolution.
        """
        if self._loaded and self.window.add(now, grid_power_w):
            self._schedule_save()

    @property
    def zerohero_import_kwh(self) -> float:
        return self.window.import_kwh

    @property
    def super_export_kwh(self) -> float:
        return self.window.export_kwh

    def sell_limit_w(
        self,
        now: datetime,
        battery_soc_pct: float | None,
        house_w: float | None,
    ) -> int:
        """Paced inverter max sell power (after ``export_allowed``)."""
        return self.export_guard.sell_limit_w(
            now, battery_soc_pct, house_w, self.battery_capacity_kwh
        )

    def export_allowed(
        self,
        now: datetime,
        battery_soc_pct: float | None,
        house_w: float | None,
        reserve: int,
    ) -> bool:
        """Whether the evening export may continue this cycle."""
        allowed = self.export_guard.update(
            now, battery_soc_pct, house_w, reserve, self.battery_capacity_kwh
        )
        return allowed

    # ------------------------------------------------------------------
    # Calculations
    # ------------------------------------------------------------------

    def _recent(self, days: int) -> list[float]:
        return self.nights.consumptions(self.battery_capacity_kwh, days)

    def average_overnight_consumption_kwh(self, days: int = 14) -> float | None:
        """Mean of the last ``days`` measured nights (informational)."""
        recent = self._recent(days)
        if not recent:
            return None
        return round(sum(recent) / len(recent), 2)

    def design_overnight_kwh(self, days: int = 14) -> float | None:
        """Energy the reserve is sized for (a heavy recent night)."""
        value = design_night_kwh(self._recent(days))
        return None if value is None else round(value, 2)

    def last_night_kwh(self) -> float | None:
        recent = self._recent(1)
        return round(recent[0], 2) if recent else None

    def calculate_reserve_pct(
        self,
        margin_pct: float = 20.0,
        days: int = 14,
    ) -> int | None:
        """SOC % to keep for the night, or None until enough nights exist."""
        design = design_night_kwh(self._recent(days))
        if design is None:
            return None
        return reserve_pct(design, self.battery_capacity_kwh, margin_pct)

    @property
    def zerohero_eligible(self) -> bool:
        """True while grid import in 18:00–21:00 is within the 0.09 kWh limit."""
        return self.zerohero_import_kwh <= ZEROHERO_MAX_IMPORT_KWH

    @property
    def snapshot_count(self) -> int:
        """Number of valid measured nights stored."""
        return len(self._recent(10_000))

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _log_night(self, night: NightRecord) -> None:
        used = night.consumption_kwh(self.battery_capacity_kwh)
        if used is not None:
            _LOGGER.info(
                "Night %s: %.2f kWh (SOC %.1f%% → %.1f%%, import %.2f kWh, "
                "export %.2f kWh)",
                night.date,
                used,
                night.soc_start,
                night.soc_end,
                night.import_kwh,
                night.export_kwh,
            )
        else:
            _LOGGER.warning(
                "Night %s not used for reserve sizing: %s",
                night.date,
                night.reason or "implausible reading",
            )
