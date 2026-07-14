"""Pure charge-session engine for Solar Charge.

Detects EV charging sessions from the charger power sensor, integrates
delivered energy, and keeps a rolling daily total. No Home Assistant
imports so the engine can be unit tested standalone.

A session starts when charger power rises above START_THRESHOLD_W and
ends once power has stayed below the threshold for END_GRACE_S seconds
(the recorded end time is the last moment power was above threshold).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

START_THRESHOLD_W = 800.0
"""Charger power above this counts as actively charging.

Lowest real charge rate is min_charge_amps (6 A) * ~230 V = ~1380 W, so
800 W separates charging from standby/electronics load with margin.
"""

END_GRACE_S = 300.0
"""Seconds below threshold before a session is considered ended."""

MAX_GAP_S = 300.0
"""Ignore energy integration across update gaps longer than this (HA restart)."""

INTEGRATE_MIN_W = 50.0
"""Ignore power readings below this when integrating energy (sensor noise)."""

MAX_SESSIONS = 20
MAX_DAYS = 14

EVENT_STARTED = "started"
EVENT_ENDED = "ended"


@dataclass
class ChargeSession:
    """One EV charging session."""

    start: str
    """ISO datetime when charging began."""

    end: str | None
    """ISO datetime when charging ended; None while in progress."""

    energy_kwh: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "energy_kwh": round(self.energy_kwh, 3),
        }


class SessionEngine:
    """Track EV charging sessions and daily delivered energy."""

    def __init__(self) -> None:
        self.sessions: list[ChargeSession] = []
        self.daily_kwh: dict[str, float] = {}
        self._active = False
        self._last_above: datetime | None = None
        self._prev_time: datetime | None = None
        self._prev_power_w: float | None = None

    # ------------------------------------------------------------------
    # Per-cycle update
    # ------------------------------------------------------------------

    def update(self, now: datetime, charger_power_w: float | None) -> str | None:
        """Process one reading. Returns EVENT_STARTED/EVENT_ENDED or None."""

        event: str | None = None
        today = now.date().isoformat()

        gap_s = None
        if self._prev_time is not None:
            gap_s = (now - self._prev_time).total_seconds()

        # A long gap means HA was down — close any open session at the last
        # known charging time rather than pretending it ran the whole time.
        if self._active and gap_s is not None and gap_s > MAX_GAP_S:
            self._close_session()
            event = EVENT_ENDED

        # Energy integration (trapezoidal) across a sane, contiguous interval.
        if (
            charger_power_w is not None
            and self._prev_power_w is not None
            and gap_s is not None
            and 0 < gap_s <= MAX_GAP_S
        ):
            avg_w = (charger_power_w + self._prev_power_w) / 2.0
            if avg_w >= INTEGRATE_MIN_W:
                kwh = (avg_w / 1000.0) * (gap_s / 3600.0)
                self.daily_kwh[today] = self.daily_kwh.get(today, 0.0) + kwh
                if self._active and self.sessions:
                    self.sessions[-1].energy_kwh += kwh

        # Session state machine.
        if charger_power_w is not None and charger_power_w >= START_THRESHOLD_W:
            self._last_above = now
            if not self._active:
                self._active = True
                self.sessions.append(
                    ChargeSession(start=now.isoformat(), end=None)
                )
                self._trim_sessions()
                event = EVENT_STARTED
        elif self._active and self._last_above is not None:
            below_s = (now - self._last_above).total_seconds()
            if below_s >= END_GRACE_S:
                self._close_session()
                event = EVENT_ENDED

        self._prune_daily()
        self._prev_time = now
        self._prev_power_w = charger_power_w
        return event

    # ------------------------------------------------------------------
    # Derived values
    # ------------------------------------------------------------------

    @property
    def charging_active(self) -> bool:
        return self._active

    @property
    def current_session(self) -> ChargeSession | None:
        if self._active and self.sessions and self.sessions[-1].end is None:
            return self.sessions[-1]
        return None

    @property
    def last_completed_session(self) -> ChargeSession | None:
        for session in reversed(self.sessions):
            if session.end is not None:
                return session
        return None

    @property
    def last_session(self) -> ChargeSession | None:
        """Session in progress if any, else most recent completed one."""
        return self.current_session or self.last_completed_session

    @property
    def last_charged(self) -> str | None:
        """ISO time of most recent charging activity (start if in progress)."""
        current = self.current_session
        if current is not None:
            return current.start
        completed = self.last_completed_session
        return completed.end if completed is not None else None

    def energy_today_kwh(self, today: str) -> float:
        return round(self.daily_kwh.get(today, 0.0), 3)

    def session_count_today(self, today: str) -> int:
        return sum(1 for s in self.sessions if s.start[:10] == today)

    def recent_daily_totals(self, days: int = 7) -> dict[str, float]:
        """Most recent N recorded days, oldest first."""
        recent = sorted(self.daily_kwh)[-days:]
        return {d: round(self.daily_kwh[d], 3) for d in recent}

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return {
            "sessions": [s.as_dict() for s in self.sessions],
            "daily_kwh": {d: round(v, 4) for d, v in self.daily_kwh.items()},
            "last_above": (
                self._last_above.isoformat() if self._last_above else None
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SessionEngine:
        engine = cls()
        for item in data.get("sessions", []):
            try:
                engine.sessions.append(
                    ChargeSession(
                        start=str(item["start"]),
                        end=item.get("end"),
                        energy_kwh=float(item.get("energy_kwh", 0.0)),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        for day, kwh in (data.get("daily_kwh") or {}).items():
            try:
                engine.daily_kwh[str(day)] = float(kwh)
            except (TypeError, ValueError):
                continue

        # A session left open across a restart cannot be trusted to still be
        # running — close it at the last known charging moment.
        if engine.sessions and engine.sessions[-1].end is None:
            last_above = data.get("last_above") or engine.sessions[-1].start
            engine.sessions[-1].end = str(last_above)

        engine._prune_daily()
        engine._trim_sessions()
        return engine

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _close_session(self) -> None:
        self._active = False
        if self.sessions and self.sessions[-1].end is None:
            end = self._last_above or self._prev_time
            self.sessions[-1].end = (
                end.isoformat() if end else self.sessions[-1].start
            )
        self._last_above = None

    def _trim_sessions(self) -> None:
        if len(self.sessions) > MAX_SESSIONS:
            self.sessions = self.sessions[-MAX_SESSIONS:]

    def _prune_daily(self) -> None:
        if len(self.daily_kwh) > MAX_DAYS:
            for day in sorted(self.daily_kwh)[:-MAX_DAYS]:
                del self.daily_kwh[day]
