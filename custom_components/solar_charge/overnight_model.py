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

# ── Export pacing ───────────────────────────────────────────────────────
MAX_SELL_W = 12000
"""Inverter max sell power outside the paced window (its normal setting)."""
STEP_HEADROOM_W = 2500
"""Minimum export while pacing, i.e. inverter output kept above the house
load. Max sell power
caps the inverter's *total* output (house + export), not just the export, so
a load switching on is only covered by this headroom until the next cycle
re-reads the house load (11 Nov: a 3 kW cap with a 4 kW oven imported
0.08 kWh in 6 min)."""
SELL_STEP_W = 250
"""Sell limit is rounded up to this step so it isn't rewritten every cycle."""

# ── ZeroHero window meter ───────────────────────────────────────────────
ZEROHERO_WINDOW_START = time(18, 0)
ZEROHERO_WINDOW_END = time(21, 0)
SUPER_EXPORT_MAX_KWH = 15.0
METER_MAX_GAP = timedelta(minutes=5)
"""Readings further apart than this are not integrated."""


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

    def sell_limit_w(
        self,
        now: datetime,
        soc_pct: float | None,
        house_w: float | None,
        capacity_kwh: float,
    ) -> int:
        """Inverter max sell power for this cycle (call after ``update``)."""
        if self.latched_date == now.date().isoformat():
            return MAX_SELL_W  # export stopped: slot is Zero Export anyway
        return paced_sell_limit_w(
            now, soc_pct, self.last_stop_soc, house_w, capacity_kwh
        )


def paced_sell_limit_w(
    now: datetime,
    soc_pct: float | None,
    stop_soc: float | None,
    house_w: float | None,
    capacity_kwh: float,
) -> int:
    """Inverter output cap that spreads the export over 18:00–21:00.

    Exporting flat out empties the export budget early and leaves the house
    on Zero Export for the rest of the window, where every load step is
    briefly fed from the grid (10 Nov: 0.17 kWh, ZeroHero lost). Pacing keeps
    the grid exporting until 21:00, so steps eat into the export instead.

    The Deye's max sell power caps total inverter output, so the limit is
    house load + export, and the export (the margin a load step can use
    before the grid does) is never below ``STEP_HEADROOM_W``. ``stop_soc``
    already reserves the house load until 21:00, so the energy above it is
    all exportable.
    """
    start = datetime.combine(now.date(), EXPORT_WINDOW_START, tzinfo=now.tzinfo)
    end = datetime.combine(now.date(), EXPORT_WINDOW_END, tzinfo=now.tzinfo)
    if not start <= now < end or soc_pct is None or stop_soc is None:
        return MAX_SELL_W
    remaining_h = max((end - now).total_seconds() / 3600.0, 1 / 60)
    spare_kwh = max(0.0, (soc_pct - stop_soc) / 100.0 * capacity_kwh)
    house = house_w if house_w is not None and house_w >= 0 else DEFAULT_HOUSE_KW * 1000
    watts = house + max(spare_kwh / remaining_h * 1000.0, STEP_HEADROOM_W)
    watts = math.ceil(watts / SELL_STEP_W) * SELL_STEP_W
    return int(min(MAX_SELL_W, watts))


# ---------------------------------------------------------------------------
# ZeroHero window meter
# ---------------------------------------------------------------------------


@dataclass
class WindowMeter:
    """Grid import / export in the 18:00–21:00 window.

    Fed on every grid-power reading (state changes plus the control cycle),
    each reading held until the next. Sampling only once a minute counted a
    few-second load spike as a whole minute of import (10 Nov: 0.229 kWh vs
    GloBird's 0.173 kWh).
    """

    date: str | None = None
    import_kwh: float = 0.0
    export_kwh: float = 0.0
    last_at: datetime | None = None
    last_w: float | None = None

    def add(self, now: datetime, grid_w: float | None) -> bool:
        """Record a reading (import positive). Returns True if totals changed."""
        changed = False
        today = now.date().isoformat()
        start = datetime.combine(now.date(), ZEROHERO_WINDOW_START, tzinfo=now.tzinfo)
        end = datetime.combine(now.date(), ZEROHERO_WINDOW_END, tzinfo=now.tzinfo)
        if self.date != today and now >= start:
            self.date = today
            self.import_kwh = 0.0
            self.export_kwh = 0.0
            changed = True

        prev_at, prev_w = self.last_at, self.last_w
        if (
            prev_at is not None
            and prev_w is not None
            and self.date == today
            and timedelta(0) < now - prev_at <= METER_MAX_GAP
        ):
            lo, hi = max(prev_at, start), min(now, end)
            if hi > lo:
                kwh = prev_w / 1000.0 * (hi - lo).total_seconds() / 3600.0
                if kwh > 0:
                    self.import_kwh += kwh
                    changed = True
                elif kwh < 0:
                    self.export_kwh = min(self.export_kwh - kwh, SUPER_EXPORT_MAX_KWH)
                    changed = True

        if prev_at is None or now >= prev_at:
            self.last_at, self.last_w = now, grid_w
        return changed


def _opt_float(value: Any) -> float | None:
    return None if value is None else float(value)
