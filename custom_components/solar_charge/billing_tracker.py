"""Bill estimate tracker for Solar Charge (Home Assistant wrapper).

All logic lives in ``billing_model`` (pure, unit-tested). This class feeds it
live readings, persists it, and produces the today / month summaries.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .billing_model import BillAccumulator, Tariff, total

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
