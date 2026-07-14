from datetime import datetime, timedelta

from load_session_engine import (
    EVENT_ENDED,
    EVENT_STARTED,
    SessionEngine,
)

T0 = datetime(2026, 7, 11, 12, 0)


def run(engine, start, readings, step_s=60):
    """Feed a list of power readings at fixed intervals, return events."""
    events = []
    now = start
    for power in readings:
        events.append(engine.update(now, power))
        now += timedelta(seconds=step_s)
    return events, now


def test_session_starts_and_accumulates_energy():
    engine = SessionEngine()
    events, _ = run(engine, T0, [0, 3600, 3600, 3600])

    assert EVENT_STARTED in events
    assert engine.charging_active
    session = engine.current_session
    assert session is not None
    # Session gets the two full-power minutes; the ramp-up interval
    # (avg 1800 W, before the session flag flipped) counts to daily only.
    assert abs(session.energy_kwh - 0.12) < 1e-6
    assert abs(engine.energy_today_kwh("2026-07-11") - 0.15) < 1e-6


def test_session_ends_after_grace_period():
    engine = SessionEngine()
    # Charge 3 min, then power drops to 0 for > 5 min
    events, _ = run(engine, T0, [3600, 3600, 3600, 0, 0, 0, 0, 0, 0])

    assert EVENT_ENDED in events
    assert not engine.charging_active
    session = engine.last_completed_session
    assert session is not None
    # End recorded at the last above-threshold reading (T0 + 2 min)
    assert session.end == (T0 + timedelta(minutes=2)).isoformat()


def test_brief_dip_does_not_end_session():
    engine = SessionEngine()
    # 2-minute dip (< 300 s grace) mid-charge
    events, _ = run(engine, T0, [3600, 3600, 0, 0, 3600, 3600])

    assert events.count(EVENT_STARTED) == 1
    assert EVENT_ENDED not in events
    assert engine.charging_active
    assert len(engine.sessions) == 1


def test_long_gap_closes_session_without_phantom_energy():
    engine = SessionEngine()
    run(engine, T0, [3600, 3600])
    before = engine.energy_today_kwh("2026-07-11")

    # Next reading arrives an hour later (HA restart)
    event = engine.update(T0 + timedelta(hours=1), 3600)

    assert event == EVENT_ENDED or not engine.charging_active or event == EVENT_STARTED
    # No energy integrated across the gap
    assert engine.energy_today_kwh("2026-07-11") == before
    # The stale session got closed
    assert engine.sessions[0].end is not None


def test_last_charged_reports_session_end():
    engine = SessionEngine()
    assert engine.last_charged is None

    run(engine, T0, [3600, 3600, 3600, 0, 0, 0, 0, 0, 0])
    assert engine.last_charged == (T0 + timedelta(minutes=2)).isoformat()

    # New session in progress reports its start
    engine.update(T0 + timedelta(minutes=20), 3600)
    assert engine.last_charged == (T0 + timedelta(minutes=20)).isoformat()


def test_daily_totals_split_by_date():
    engine = SessionEngine()
    late = datetime(2026, 7, 11, 23, 58)
    run(engine, late, [3600, 3600, 3600, 3600, 3600, 3600])

    assert engine.energy_today_kwh("2026-07-11") > 0
    assert engine.energy_today_kwh("2026-07-12") > 0
    totals = engine.recent_daily_totals(7)
    assert set(totals) == {"2026-07-11", "2026-07-12"}


def test_persistence_roundtrip_closes_open_session():
    engine = SessionEngine()
    run(engine, T0, [3600, 3600, 3600])
    assert engine.charging_active

    restored = SessionEngine.from_dict(engine.to_dict())

    # Open session must be closed conservatively at last known charging time
    assert not restored.charging_active
    assert restored.sessions[-1].end == (T0 + timedelta(minutes=2)).isoformat()
    assert abs(
        restored.sessions[-1].energy_kwh - engine.sessions[-1].energy_kwh
    ) < 0.01
    assert restored.energy_today_kwh("2026-07-11") == engine.energy_today_kwh(
        "2026-07-11"
    )


def test_standby_power_never_starts_session():
    engine = SessionEngine()
    events, _ = run(engine, T0, [120, 150, 100, 130, 90])

    assert events == [None] * 5
    assert not engine.charging_active
    assert engine.sessions == []


def test_session_count_today():
    engine = SessionEngine()
    readings = [3600, 3600, 0, 0, 0, 0, 0, 0] * 2
    run(engine, T0, readings)
    assert engine.session_count_today("2026-07-11") == 2
