"""Electricity bill estimate for the GloBird ZeroHero plan (pure logic).

Mirrors the line items on a GloBird bill so the dashboard can show what
has been spent and earned without waiting for the bill:

  Daily Charge                      supply_per_day × days
  Peak Usage        16:00 – 23:00   peak_rate      × kWh imported
  Offpeak Usage     11:00 – 14:00   offpeak_rate   × kWh imported
  Shoulder Usage    14:00 – 16:00,
                    23:00 – 11:00   shoulder_rate  × kWh imported
  Feed in (4pm–11pm) 16:00 – 23:00  feed_in_peak_rate × kWh exported
  Feed in (11pm–4pm) 23:00 – 16:00  feed_in_rate      × kWh exported
  Super Export top up 18:00 – 21:00 super_export_rate × first N kWh exported
                                    (paid on top of the 4pm–11pm feed-in)
  ZeroHero          18:00 – 21:00   −credit per day with ≤ 0.09 kWh imported

Only energy (kWh) is stored per day; dollars are priced on read from the
current ``Tariff`` so a corrected rate fixes the history too.

No Home Assistant imports, so it is unit-testable on its own.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time
from typing import Any

PEAK_START = time(16, 0)
PEAK_END = time(23, 0)
OFFPEAK_START = time(11, 0)
OFFPEAK_END = time(14, 0)
WINDOW_START = time(18, 0)  # ZeroHero + Super Export
WINDOW_END = time(21, 0)

MAX_COUNTER_GAP_S = 30 * 60
"""Counter deltas spanning a longer gap can't be placed in a tariff period,
so they are dropped (and counted in ``skipped_kwh``) instead of guessed."""

MAX_POWER_GAP_S = 5 * 60
"""Power samples further apart than this are not integrated."""

MAX_PLAUSIBLE_KW = 40.0
"""Counter jumps implying more than this (plus slack) are treated as glitches."""

KEEP_DAYS = 400


@dataclass(frozen=True)
class Tariff:
    """Plan rates, GST inclusive, in dollars (defaults: Oct 2026 bill)."""

    supply_per_day: float = 1.705
    peak_rate: float = 0.528
    shoulder_rate: float = 0.418
    offpeak_rate: float = 0.0
    feed_in_peak_rate: float = 0.02
    feed_in_rate: float = 0.0
    super_export_rate: float = 0.08
    super_export_cap_kwh: float = 15.0
    zerohero_credit: float = 1.0
    zerohero_max_import_kwh: float = 0.09

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


def import_period(t: time) -> str:
    """Tariff period for grid import at local time ``t``."""
    if PEAK_START <= t < PEAK_END:
        return "peak"
    if OFFPEAK_START <= t < OFFPEAK_END:
        return "offpeak"
    return "shoulder"


def in_window(t: time) -> bool:
    return WINDOW_START <= t < WINDOW_END


@dataclass
class DayUsage:
    """Energy recorded for one local day."""

    date: str
    import_peak_kwh: float = 0.0
    import_shoulder_kwh: float = 0.0
    import_offpeak_kwh: float = 0.0
    export_peak_kwh: float = 0.0  # 16:00 – 23:00 feed-in
    export_other_kwh: float = 0.0  # 23:00 – 16:00 feed-in
    export_window_kwh: float = 0.0  # 18:00 – 21:00 (subset of export_peak)
    window_import_kwh: float | None = None  # None: window not observed
    window_closed: bool = False
    skipped_kwh: float = 0.0

    @property
    def import_kwh(self) -> float:
        return self.import_peak_kwh + self.import_shoulder_kwh + self.import_offpeak_kwh

    @property
    def export_kwh(self) -> float:
        return self.export_peak_kwh + self.export_other_kwh

    def zerohero(self, tariff: Tariff) -> bool | None:
        """True/False once known, None if the window wasn't observed.

        While the window is open this is the provisional result.
        """
        if self.window_import_kwh is None:
            return None
        return self.window_import_kwh <= tariff.zerohero_max_import_kwh

    def bill(self, tariff: Tariff) -> dict[str, Any]:
        """Price this day. Positive ``net`` is money owed."""
        peak = self.import_peak_kwh * tariff.peak_rate
        shoulder = self.import_shoulder_kwh * tariff.shoulder_rate
        offpeak = self.import_offpeak_kwh * tariff.offpeak_rate
        supply = tariff.supply_per_day
        feed_in = (
            self.export_peak_kwh * tariff.feed_in_peak_rate
            + self.export_other_kwh * tariff.feed_in_rate
        )
        super_kwh = min(self.export_window_kwh, tariff.super_export_cap_kwh)
        super_export = super_kwh * tariff.super_export_rate
        zh = self.zerohero(tariff)
        zerohero = tariff.zerohero_credit if (zh and self.window_closed) else 0.0
        spent = supply + peak + shoulder + offpeak
        earned = feed_in + super_export + zerohero
        return {
            "spent": spent,
            "earned": earned,
            "net": spent - earned,
            "supply": supply,
            "usage_peak": peak,
            "usage_shoulder": shoulder,
            "usage_offpeak": offpeak,
            "feed_in": feed_in,
            "super_export": super_export,
            "zerohero": zerohero,
            "import_kwh": self.import_kwh,
            "import_peak_kwh": self.import_peak_kwh,
            "import_shoulder_kwh": self.import_shoulder_kwh,
            "import_offpeak_kwh": self.import_offpeak_kwh,
            "export_kwh": self.export_kwh,
            "super_export_kwh": super_kwh,
            "zerohero_days": 1 if zerohero else 0,
        }

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DayUsage:
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})


SUM_KEYS = (
    "spent", "earned", "net", "supply", "usage_peak", "usage_shoulder",
    "usage_offpeak", "feed_in", "super_export", "zerohero", "import_kwh",
    "import_peak_kwh", "import_shoulder_kwh", "import_offpeak_kwh",
    "export_kwh", "super_export_kwh", "zerohero_days",
)


def total(days: list[DayUsage], tariff: Tariff) -> dict[str, Any]:
    """Sum the priced bills of several days, rounded for display."""
    out: dict[str, Any] = {k: 0.0 for k in SUM_KEYS}
    for day in days:
        bill = day.bill(tariff)
        for k in SUM_KEYS:
            out[k] += bill[k]
    out = {k: round(v, 3) for k, v in out.items()}
    out["zerohero_days"] = int(out["zerohero_days"])
    out["days"] = len(days)
    return out


@dataclass
class _Baseline:
    at: datetime | None = None
    import_total: float | None = None
    export_total: float | None = None


@dataclass
class BillAccumulator:
    """Turn live readings into per-day, per-period energy."""

    days: dict[str, DayUsage] = field(default_factory=dict)
    _base: _Baseline = field(default_factory=_Baseline)
    _power_at: datetime | None = None

    # ------------------------------------------------------------------

    def day(self, d: date | str) -> DayUsage:
        key = d if isinstance(d, str) else d.isoformat()
        if key not in self.days:
            self.days[key] = DayUsage(date=key)
        return self.days[key]

    def update(
        self,
        now: datetime,
        import_total_kwh: float | None,
        export_total_kwh: float | None,
        grid_power_w: float | None,
        zerohero_import_kwh: float | None,
    ) -> bool:
        """Feed one cycle. Returns True if anything changed.

        Cumulative counters are preferred; grid power (import positive) is
        integrated only when counters are unavailable.
        """
        t = now.timetz().replace(tzinfo=None)
        changed = self._close_past_days(now.date())
        today = self.day(now.date())

        imported, exported = self._counter_delta(now, import_total_kwh, export_total_kwh)
        if imported is None and exported is None:
            base_at = self._base.at
            if base_at is not None and (now - base_at).total_seconds() <= MAX_COUNTER_GAP_S:
                # Counters briefly unavailable: their next delta covers this
                # time, so integrating power too would double count.
                imported, exported = 0.0, 0.0
            else:
                imported, exported = self._power_delta(now, grid_power_w)
        else:
            self._power_at = None

        if imported:
            period = import_period(t)
            setattr(
                today,
                f"import_{period}_kwh",
                getattr(today, f"import_{period}_kwh") + imported,
            )
            changed = True
        if exported:
            if PEAK_START <= t < PEAK_END:
                today.export_peak_kwh += exported
            else:
                today.export_other_kwh += exported
            if in_window(t):
                today.export_window_kwh += exported
            changed = True

        if in_window(t) and zerohero_import_kwh is not None:
            if today.window_import_kwh != zerohero_import_kwh:
                today.window_import_kwh = zerohero_import_kwh
                changed = True
        elif t >= WINDOW_END and not today.window_closed:
            today.window_closed = True
            changed = True

        self._prune(now.date())
        return changed

    def _counter_delta(
        self,
        now: datetime,
        import_total: float | None,
        export_total: float | None,
    ) -> tuple[float | None, float | None]:
        base = self._base
        if import_total is None and export_total is None:
            return None, None
        gap_ok = (
            base.at is not None
            and 0 < (now - base.at).total_seconds() <= MAX_COUNTER_GAP_S
        )
        limit = (
            MAX_PLAUSIBLE_KW * (now - base.at).total_seconds() / 3600 + 0.5
            if base.at is not None
            else 0.0
        )

        def delta(cur: float | None, prev: float | None) -> float | None:
            if cur is None or prev is None:
                return None
            d = cur - prev
            if d < 0:  # counter reset
                return None
            if not gap_ok or d > limit:
                self.day(now.date()).skipped_kwh += d
                return None
            return d

        imported = delta(import_total, base.import_total)
        exported = delta(export_total, base.export_total)
        self._base = _Baseline(
            at=now,
            import_total=import_total if import_total is not None else base.import_total,
            export_total=export_total if export_total is not None else base.export_total,
        )
        # Report "counters active" even when the delta was dropped, so power
        # integration doesn't double count.
        return (imported or 0.0), (exported or 0.0)

    def _power_delta(
        self, now: datetime, grid_power_w: float | None
    ) -> tuple[float, float]:
        prev, self._power_at = self._power_at, now
        if grid_power_w is None or prev is None:
            return 0.0, 0.0
        elapsed_h = (now - prev).total_seconds() / 3600
        if not 0 < elapsed_h * 3600 <= MAX_POWER_GAP_S:
            return 0.0, 0.0
        kwh = grid_power_w / 1000 * elapsed_h
        return (kwh, 0.0) if kwh > 0 else (0.0, -kwh)

    def _close_past_days(self, today: date) -> bool:
        """A day's ZeroHero window is settled once the day is over, even if
        no reading arrived after 21:00 (e.g. HA restarted overnight)."""
        key = today.isoformat()
        changed = False
        for k, d in self.days.items():
            if k < key and not d.window_closed:
                d.window_closed = True
                changed = True
        return changed

    def _prune(self, today: date) -> None:
        if len(self.days) <= KEEP_DAYS:
            return
        for key in sorted(self.days)[: len(self.days) - KEEP_DAYS]:
            del self.days[key]

    # ------------------------------------------------------------------

    def days_between(self, start: date, end: date) -> list[DayUsage]:
        """Recorded days with start <= date <= end."""
        lo, hi = start.isoformat(), end.isoformat()
        return [self.days[k] for k in sorted(self.days) if lo <= k <= hi]

    def as_dict(self) -> dict[str, Any]:
        base = self._base
        return {
            "days": [d.as_dict() for _, d in sorted(self.days.items())],
            "baseline": {
                "at": base.at.isoformat() if base.at else None,
                "import_total": base.import_total,
                "export_total": base.export_total,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> BillAccumulator:
        acc = cls()
        if not isinstance(data, dict):
            return acc
        for raw in data.get("days") or []:
            try:
                day = DayUsage.from_dict(raw)
            except (TypeError, ValueError):
                continue
            acc.days[day.date] = day
        base = data.get("baseline") or {}
        try:
            at = datetime.fromisoformat(base["at"]) if base.get("at") else None
        except (TypeError, ValueError):
            at = None
        acc._base = _Baseline(
            at=at,
            import_total=base.get("import_total"),
            export_total=base.get("export_total"),
        )
        return acc
