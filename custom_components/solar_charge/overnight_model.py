"""Pure overnight-energy model for Solar Charge (no Home Assistant imports).

Measures what the house actually uses between 21:00 and 11:00 the next
morning, sizes the battery reserve needed to get through the night, and
decides when the 18:00–21:00 export must stop so that reserve is kept.

Night consumption = battery energy drawn + grid import − grid export, so
nights where the battery ran flat (and the grid covered the rest) or the
battery was topped up from the grid are still measured correctly.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta, tzinfo
import math
from typing import Any

# ── Night window ────────────────────────────────────────────────────────
NIGHT_START = time(21, 0)
NIGHT_END = time(11, 0)  # next morning
START_GRACE = timedelta(minutes=15)
"""A night may start this late (e.g. HA restarting at 21:00); lateness counts as gap."""
END_GRACE = timedelta(minutes=15)
"""The 11:00 SOC reading may be taken this late; later and the night is dropped."""
MAX_SAMPLE_GAP = timedelta(minutes=5)
"""Samples further apart than this are not integrated (counted as gap)."""
MAX_TOTAL_GAP = timedelta(minutes=15)
"""A night with more unmeasured time than this is discarded, not under-counted."""

# ── Reserve sizing ──────────────────────────────────────────────────────
MIN_NIGHTS = 3
"""Valid nights needed before the measured reserve replaces the fallback."""
PERCENTILE = 90.0
"""Plan for a heavy night, not a typical one: running short costs ~42c/kWh
of grid, holding back too much only ~10c/kWh of lost export."""
RECENT_NIGHTS = 3
"""The worst of the last few nights is also honoured, so a cold snap is
reflected the next evening rather than weeks later."""
RESERVE_MIN_PCT = 10
RESERVE_MAX_PCT = 60
MAX_STORED_NIGHTS = 30

# ── Export guard ────────────────────────────────────────────────────────
OVERNIGHT_FLOOR_PCT = 10
"""Lowest SOC the battery is run down to. Deye battery shutdown is 7 %."""
EXPORT_WINDOW_START = time(18, 0)
EXPORT_WINDOW_END = time(21, 0)
MIN_HOUSE_KW = 1.0
"""Floor on the evening house-load estimate (never assume the house is idle)."""
DEFAULT_HOUSE_KW = 3.0
"""House load assumed when it can't be measured."""
SOC_HOLD = timedelta(minutes=10)
"""How long an unknown SOC keeps the previous export decision."""
HOUSE_EMA_ALPHA = 0.2
"""Smoothing for the house-load estimate (≈5 min at a 60 s cycle), so a
kettle doesn't end the export early."""


# ---------------------------------------------------------------------------
# Night records
# ---------------------------------------------------------------------------


@dataclass
class NightRecord:
    """One completed (or abandoned) night, keyed by the date it started."""

    date: str
    soc_start: float | None = None
    soc_end: float | None = None
    import_kwh: float = 0.0
    export_kwh: float = 0.0
    gap_s: float = 0.0
    valid: bool = False
    reason: str = ""

    def consumption_kwh(self, capacity_kwh: float) -> float | None:
        """House energy used overnight, or None if the night isn't usable."""
        if not self.valid or self.soc_start is None or self.soc_end is None:
            return None
        battery_kwh = (self.soc_start - self.soc_end) / 100.0 * capacity_kwh
        total = battery_kwh + self.import_kwh - self.export_kwh
        if total <= 0 or total > capacity_kwh * 2:
            return None  # physically implausible — sensor glitch
        return total

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> NightRecord:
        return cls(
            date=str(d["date"]),
            soc_start=_opt_float(d.get("soc_start")),
            soc_end=_opt_float(d.get("soc_end")),
            import_kwh=float(d.get("import_kwh", 0.0)),
            export_kwh=float(d.get("export_kwh", 0.0)),
            gap_s=float(d.get("gap_s", 0.0)),
            valid=bool(d.get("valid", False)),
            reason=str(d.get("reason", "")),
        )


@dataclass
class ActiveNight:
    """The night currently being measured."""

    date: str
    soc_start: float
    last_ts: datetime
    import_kwh: float = 0.0
    export_kwh: float = 0.0
    gap_s: float = 0.0

    def end_dt(self, tz: tzinfo | None) -> datetime:
        """11:00 the morning after, in the live timezone (DST-safe)."""
        start_day = date.fromisoformat(self.date)
        return datetime.combine(start_day + timedelta(days=1), NIGHT_END, tzinfo=tz)

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["last_ts"] = self.last_ts.isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ActiveNight:
        return cls(
            date=str(d["date"]),
            soc_start=float(d["soc_start"]),
            last_ts=datetime.fromisoformat(str(d["last_ts"])),
            import_kwh=float(d.get("import_kwh", 0.0)),
            export_kwh=float(d.get("export_kwh", 0.0)),
            gap_s=float(d.get("gap_s", 0.0)),
        )


@dataclass
class NightAccumulator:
    """State machine that measures each night. Call ``update`` every cycle."""

    nights: list[NightRecord] = field(default_factory=list)
    active: ActiveNight | None = None
    last_started: str | None = None

    def update(
        self,
        now: datetime,
        soc_pct: float | None,
        grid_w: float | None,
    ) -> NightRecord | None:
        """Advance the model. Returns a NightRecord when a night finishes."""
        finished: NightRecord | None = None

        if self.active is not None:
            self._integrate(now, grid_w)
            finished = self._maybe_finish(now, soc_pct)

        if self.active is None:
            self._maybe_start(now, soc_pct)

        return finished

    # -- internals ---------------------------------------------------------

    def _maybe_start(self, now: datetime, soc_pct: float | None) -> None:
        today = now.date().isoformat()
        if self.last_started == today or soc_pct is None:
            return
        start_dt = datetime.combine(now.date(), NIGHT_START, tzinfo=now.tzinfo)
        if not start_dt <= now < start_dt + START_GRACE:
            return
        self.active = ActiveNight(
            date=today,
            soc_start=float(soc_pct),
            last_ts=now,
            # Time missed since 21:00 is unmeasured usage
            gap_s=(now - start_dt).total_seconds(),
        )
        self.last_started = today

    def _integrate(self, now: datetime, grid_w: float | None) -> None:
        night = self.active
        assert night is not None
        end = night.end_dt(now.tzinfo)
        until = min(now, end + END_GRACE)
        dt = until - night.last_ts
        if dt <= timedelta(0):
            return
        hours = dt.total_seconds() / 3600.0
        if dt > MAX_SAMPLE_GAP or grid_w is None:
            night.gap_s += dt.total_seconds()
        elif grid_w > 0:
            night.import_kwh += grid_w / 1000.0 * hours
        elif grid_w < 0:
            night.export_kwh += -grid_w / 1000.0 * hours
        night.last_ts = until

    def _maybe_finish(
        self, now: datetime, soc_pct: float | None
    ) -> NightRecord | None:
        night = self.active
        assert night is not None
        end = night.end_dt(now.tzinfo)
        if now < end:
            return None

        record = NightRecord(
            date=night.date,
            soc_start=night.soc_start,
            import_kwh=round(night.import_kwh, 4),
            export_kwh=round(night.export_kwh, 4),
            gap_s=round(night.gap_s, 1),
        )
        if now <= end + END_GRACE:
            if soc_pct is None:
                return None  # wait for a reading within the grace period
            record.soc_end = float(soc_pct)
            if night.gap_s > MAX_TOTAL_GAP.total_seconds():
                record.reason = f"{night.gap_s / 60:.0f} min unmeasured"
            else:
                record.valid = True
        else:
            record.reason = "missed 11:00 reading"

        self.active = None
        self._add(record)
        return record

    def _add(self, record: NightRecord) -> None:
        self.nights = [n for n in self.nights if n.date != record.date]
        self.nights.append(record)
        self.nights.sort(key=lambda n: n.date)
        self.nights = self.nights[-MAX_STORED_NIGHTS:]

    # -- persistence --------------------------------------------------------

    def as_dict(self) -> dict[str, Any]:
        return {
            "nights": [n.as_dict() for n in self.nights],
            "active": self.active.as_dict() if self.active else None,
            "last_started": self.last_started,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> NightAccumulator:
        acc = cls()
        if not d:
            return acc
        for item in d.get("nights") or []:
            try:
                acc.nights.append(NightRecord.from_dict(item))
            except (KeyError, TypeError, ValueError):
                continue
        try:
            if d.get("active"):
                acc.active = ActiveNight.from_dict(d["active"])
        except (KeyError, TypeError, ValueError):
            acc.active = None
        acc.last_started = d.get("last_started")
        acc.nights.sort(key=lambda n: n.date)
        return acc

    # -- queries ------------------------------------------------------------

    def consumptions(self, capacity_kwh: float, days: int) -> list[float]:
        """Valid night consumptions, most recent first, at most ``days``."""
        out: list[float] = []
        for night in reversed(self.nights):
            c = night.consumption_kwh(capacity_kwh)
            if c is not None:
                out.append(c)
            if len(out) >= days:
                break
        return out


# ---------------------------------------------------------------------------
# Reserve sizing
# ---------------------------------------------------------------------------


def percentile(values: list[float], pct: float) -> float:
    """Linear-interpolated percentile (same as numpy's default)."""
    if not values:
        raise ValueError("no values")
    ordered = sorted(values)
    k = (len(ordered) - 1) * pct / 100.0
    lo = math.floor(k)
    hi = math.ceil(k)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


def design_night_kwh(recent_first: list[float]) -> float | None:
    """Energy to plan for tonight: a heavy recent night, not the average."""
    if len(recent_first) < MIN_NIGHTS:
        return None
    return max(percentile(recent_first, PERCENTILE), max(recent_first[:RECENT_NIGHTS]))


def reserve_pct(design_kwh: float, capacity_kwh: float, margin_pct: float) -> int:
    """SOC % to hold back for the night (above the hard floor), rounded up."""
    needed = design_kwh * (1.0 + margin_pct / 100.0) / capacity_kwh * 100.0
    return int(max(RESERVE_MIN_PCT, min(RESERVE_MAX_PCT, math.ceil(needed - 1e-9))))


# ---------------------------------------------------------------------------
# Export guard
# ---------------------------------------------------------------------------


def export_stop_soc(
    now: datetime,
    reserve: int,
    house_kw: float,
    capacity_kwh: float,
) -> float:
    """SOC at which the evening export must stop.

    = hard floor + overnight reserve + what the house will still draw
    between now and 21:00 once export stops.
    """
    start = datetime.combine(now.date(), EXPORT_WINDOW_START, tzinfo=now.tzinfo)
    end = datetime.combine(now.date(), EXPORT_WINDOW_END, tzinfo=now.tzinfo)
    ref = max(now, start)  # before 18:00: preview tonight's threshold
    remaining_h = max(0.0, (end - ref).total_seconds() / 3600.0)
    evening_pct = remaining_h * max(house_kw, MIN_HOUSE_KW) / capacity_kwh * 100.0
    return OVERNIGHT_FLOOR_PCT + reserve + evening_pct


@dataclass
class ExportGuard:
    """Decides whether the battery may export right now.

    Once export is stopped for the evening it stays stopped (latched) until
    the next day, so the decision can't flap around the threshold.
    """

    latched_date: str | None = None
    house_kw_ema: float | None = None
    last_stop_soc: float | None = None
    last_soc_at: datetime | None = None
    last_allowed: bool = False

    def update(
        self,
        now: datetime,
        soc_pct: float | None,
        house_w: float | None,
        reserve: int,
        capacity_kwh: float,
    ) -> bool:
        """Return True if export is allowed this cycle."""
        if house_w is not None and house_w >= 0:
            kw = house_w / 1000.0
            self.house_kw_ema = (
                kw
                if self.house_kw_ema is None
                else self.house_kw_ema + HOUSE_EMA_ALPHA * (kw - self.house_kw_ema)
            )
        house_kw = self.house_kw_ema if self.house_kw_ema is not None else DEFAULT_HOUSE_KW

        self.last_stop_soc = round(export_stop_soc(now, reserve, house_kw, capacity_kwh), 1)

        today = now.date().isoformat()
        t = now.timetz().replace(tzinfo=None)
        if not EXPORT_WINDOW_START <= t < EXPORT_WINDOW_END:
            return True  # only consulted for the export slot
        if self.latched_date == today:
            return False
        if soc_pct is None:
            # Brief dropouts (add-on restart) keep the last decision so the
            # inverter isn't flipped in and out of export; a longer one fails
            # safe. Not latched — export resumes when SOC is back.
            if (
                self.last_soc_at is not None
                and now - self.last_soc_at <= SOC_HOLD
            ):
                return self.last_allowed
            return False
        self.last_soc_at = now
        if soc_pct <= self.last_stop_soc:
            self.latched_date = today
            self.last_allowed = False
            return False
        self.last_allowed = True
        return True


def _opt_float(value: Any) -> float | None:
    return None if value is None else float(value)
