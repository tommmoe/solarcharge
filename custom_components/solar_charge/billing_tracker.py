"""Bill estimate tracker for Solar Charge (Home Assistant wrapper).

All logic lives in ``billing_model`` (pure, unit-tested). This class feeds it
live readings, persists it, and produces the today / month summaries.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .billing_model import WINDOW_END, WINDOW_START, BillAccumulator, Tariff, total

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "solar_charge_billing"
STORAGE_VERSION = 1
SAVE_DELAY_S = 120
HISTORY_DAYS = 14


class BillingTracker:
    """Track spend and earnings per day against the configured tariff."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry_id}")
        self.acc = BillAccumulator()
        self._loaded = False

    async def async_load(self) -> None:
        self.acc = BillAccumulator.from_dict(await self._store.async_load())
        self._loaded = True

    def update(
        self,
        now: datetime,
        import_total_kwh: float | None,
        export_total_kwh: float | None,
        grid_power_w: float | None,
        zerohero_import_kwh: float | None,
    ) -> None:
        if not self._loaded:
            return
        if self.acc.update(
            now, import_total_kwh, export_total_kwh, grid_power_w, zerohero_import_kwh
        ):
            self._store.async_delay_save(self.acc.as_dict, SAVE_DELAY_S)

    async def async_backfill(
        self,
        hass: HomeAssistant,
        start: date,
        now: datetime,
        import_entity: str | None,
        export_entity: str | None,
        grid_power_entity: str | None,
    ) -> dict[str, Any]:
        """Fill days from ``start`` to today from recorder statistics.

        Hourly ``change`` of the cumulative counters prices each hour;
        5-minute means of the import-positive grid power decide ZeroHero
        (counters only resolve 0.1 kWh, the limit is 0.09 kWh).
        """
        if not self._loaded or not import_entity or not export_entity:
            return {"backfilled": [], "reason": "no energy counters configured"}

        from homeassistant.components.recorder import get_instance
        from homeassistant.components.recorder.statistics import (
            statistics_during_period,
        )
        from homeassistant.util import dt as dt_util

        tz = now.tzinfo
        start_dt = datetime.combine(start, datetime.min.time(), tzinfo=tz)
        recorder = get_instance(hass)
        hourly = await recorder.async_add_executor_job(
            statistics_during_period,
            hass, dt_util.as_utc(start_dt), dt_util.as_utc(now),
            {import_entity, export_entity}, "hour", None, {"change"},
        )
        five_min: dict[str, list[dict[str, Any]]] = {}
        if grid_power_entity:
            five_min = await recorder.async_add_executor_job(
                statistics_during_period,
                hass, dt_util.as_utc(start_dt), dt_util.as_utc(now),
                {grid_power_entity}, "5minute", None, {"mean"},
            )

        def row_start(row: dict[str, Any]) -> datetime:
            raw = row["start"]
            when = (
                datetime.fromtimestamp(raw, tz=dt_util.UTC)
                if isinstance(raw, (int, float))
                else raw
            )
            return dt_util.as_local(when)

        by_hour: dict[datetime, list[float]] = {}
        for idx, entity in enumerate((import_entity, export_entity)):
            for row in hourly.get(entity, []):
                if row.get("change") is None:
                    continue
                by_hour.setdefault(row_start(row), [0.0, 0.0])[idx] = float(row["change"])

        window_import: dict[date, float] = {}
        for row in five_min.get(grid_power_entity or "", []):
            mean = row.get("mean")
            when = row_start(row)
            t = when.timetz().replace(tzinfo=None)
            if mean is None or not WINDOW_START <= t < WINDOW_END:
                continue
            window_import[when.date()] = window_import.get(when.date(), 0.0) + (
                max(0.0, float(mean)) / 1000 * (5 / 60)
            )

        # Without 5-minute data, fall back to the counters' window change.
        counter_window: dict[date, float] = {}
        for when, (imp, _exp) in by_hour.items():
            t = when.timetz().replace(tzinfo=None)
            if WINDOW_START <= t < WINDOW_END:
                counter_window[when.date()] = counter_window.get(when.date(), 0.0) + imp

        done: list[str] = []
        day = start
        while day <= now.date():
            hours = [(h, v[0], v[1]) for h, v in sorted(by_hour.items()) if h.date() == day]
            if hours:
                window = window_import.get(day, counter_window.get(day))
                if self.acc.backfill_day(day, hours, window, now):
                    done.append(day.isoformat())
            day += timedelta(days=1)

        if done:
            self._store.async_delay_save(self.acc.as_dict, 1)
            _LOGGER.info("Backfilled bill estimate for %s", ", ".join(done))
        return {"backfilled": done}

    def summary(self, now: datetime, tariff: Tariff) -> dict[str, Any]:
        today = now.date()
        yesterday = today - timedelta(days=1)
        month_start = today.replace(day=1)
        today_usage = self.acc.days.get(today.isoformat())
        history = [
            {"date": d.date, **{k: round(v, 3) for k, v in d.bill(tariff).items()
                                if k in ("spent", "earned", "net")}}
            for d in self.acc.days_between(today - timedelta(days=HISTORY_DAYS - 1), today)
        ]
        return {
            "bill_today": total(self.acc.days_between(today, today), tariff),
            "bill_yesterday": total(self.acc.days_between(yesterday, yesterday), tariff),
            "bill_month": total(self.acc.days_between(month_start, today), tariff),
            "bill_history": history,
            "bill_zerohero_today": (
                today_usage.zerohero(tariff) if today_usage else None
            ),
            "bill_skipped_kwh_today": round(today_usage.skipped_kwh, 3) if today_usage else 0.0,
            "tariff": tariff.as_dict(),
        }
