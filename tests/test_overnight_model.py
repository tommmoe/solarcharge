from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from load_inverter_schedule import inverter_schedule
from load_overnight_model import overnight_model as om

TZ = timezone(timedelta(hours=11))
CAP = 48.0


def dt(day: int, hh: int, mm: int = 0, ss: int = 0) -> datetime:
    return datetime(2026, 11, day, hh, mm, ss, tzinfo=TZ)


def run_night(
    acc,
    start: datetime,
    end: datetime,
    soc_fn,
    grid_fn,
    step=timedelta(seconds=60),
    skip=None,
):
    """Feed samples from start to end; return finished records."""
    out = []
    t = start
    while t <= end:
        if skip is None or not skip(t):
            rec = acc.update(t, soc_fn(t), grid_fn(t))
            if rec is not None:
                out.append(rec)
        t += step
    return out


def linear_soc(start_soc: float, end_soc: float, start: datetime, end: datetime):
    total = (end - start).total_seconds()

    def f(t: datetime) -> float:
        frac = min(1.0, max(0.0, (t - start).total_seconds() / total))
        return start_soc + (end_soc - start_soc) * frac

    return f


# ---------------------------------------------------------------------------
# Night measurement
# ---------------------------------------------------------------------------


def test_normal_night_battery_only() -> None:
    acc = om.NightAccumulator()
    start, end = dt(4, 21), dt(5, 11)
    recs = run_night(acc, dt(4, 20, 58), dt(5, 11, 1), linear_soc(50, 30, start, end), lambda t: 0.0)
    assert len(recs) == 1
    r = recs[0]
    assert r.valid and r.date == "2026-11-04"
    assert r.consumption_kwh(CAP) == pytest.approx(20 / 100 * CAP, abs=0.05)


def test_battery_ran_flat_grid_covered_rest_is_counted() -> None:
    """The old tracker under-counted these nights (only saw the SOC drop)."""
    acc = om.NightAccumulator()
    start, end = dt(4, 21), dt(5, 11)
    flat_at = dt(5, 6)

    def soc(t):
        return 25 - 15 * min(1, (t - start) / (flat_at - start)) if t < flat_at else 10.0

    def grid(t):  # 1.2 kW from grid once the battery is at its floor
        return 1200.0 if t >= flat_at else 0.0

    recs = run_night(acc, dt(4, 21), dt(5, 11, 1), soc, grid)
    used = recs[0].consumption_kwh(CAP)
    assert used == pytest.approx(15 / 100 * CAP + 1.2 * 5, abs=0.1)


def test_grid_top_up_overnight_is_not_double_counted() -> None:
    """Grid energy that went into the battery shows as import AND SOC gain."""
    acc = om.NightAccumulator()

    def soc(t):  # use 20 %, then a 07:00–08:00 top-up adds 10 %
        if t < dt(5, 7):
            return 60 - 20 * (t - dt(4, 21)) / (dt(5, 7) - dt(4, 21))
        if t < dt(5, 8):
            return 40 + 10 * (t - dt(5, 7)) / timedelta(hours=1)
        return 50.0

    def grid(t):  # 4.8 kWh into the battery over the hour
        return 4800.0 if dt(5, 7) <= t < dt(5, 8) else 0.0

    recs = run_night(acc, dt(4, 21), dt(5, 11, 1), soc, grid)
    # Net SOC drop 10 % (4.8 kWh) + 4.8 kWh import = 9.6 kWh = the 20 % used
    assert recs[0].consumption_kwh(CAP) == pytest.approx(9.6, abs=0.1)


def test_overnight_export_is_subtracted() -> None:
    acc = om.NightAccumulator()
    recs = run_night(
        acc, dt(4, 21), dt(5, 11, 1),
        linear_soc(60, 30, dt(4, 21), dt(5, 11)),
        lambda t: -2000.0 if t < dt(4, 22) else 0.0,  # 2 kWh exported 21–22
    )
    assert recs[0].consumption_kwh(CAP) == pytest.approx(30 / 100 * CAP - 2.0, abs=0.1)


def test_late_start_within_grace_is_valid_and_counts_gap() -> None:
    acc = om.NightAccumulator()
    recs = run_night(acc, dt(4, 21, 10), dt(5, 11, 1), lambda t: 40.0, lambda t: 500.0)
    assert recs[0].valid
    assert recs[0].gap_s == pytest.approx(600, abs=1)


def test_start_after_grace_skips_night() -> None:
    acc = om.NightAccumulator()
    recs = run_night(acc, dt(4, 21, 20), dt(5, 11, 1), lambda t: 40.0, lambda t: 0.0)
    assert recs == []
    assert acc.active is None


def test_long_outage_invalidates_night_instead_of_undercounting() -> None:
    acc = om.NightAccumulator()
    recs = run_night(
        acc, dt(4, 21), dt(5, 11, 1),
        lambda t: 40.0, lambda t: 300.0,
        skip=lambda t: dt(5, 2) <= t < dt(5, 2, 20),  # HA down 20 min
    )
    assert len(recs) == 1
    assert not recs[0].valid
    assert recs[0].consumption_kwh(CAP) is None
    assert "unmeasured" in recs[0].reason


def test_short_outage_is_tolerated() -> None:
    acc = om.NightAccumulator()
    recs = run_night(
        acc, dt(4, 21), dt(5, 11, 1),
        lambda t: 40.0, lambda t: 300.0,
        skip=lambda t: dt(5, 2) <= t < dt(5, 2, 4),
    )
    assert recs[0].valid


def test_unknown_grid_power_counts_as_gap() -> None:
    acc = om.NightAccumulator()
    recs = run_night(
        acc, dt(4, 21), dt(5, 11, 1),
        lambda t: 40.0,
        lambda t: None if dt(5, 3) <= t < dt(5, 3, 30) else 0.0,
    )
    assert not recs[0].valid


def test_restart_mid_night_resumes_from_persisted_state() -> None:
    soc = linear_soc(50, 30, dt(4, 21), dt(5, 11))
    grid = lambda t: 200.0  # noqa: E731

    reference = om.NightAccumulator()
    ref = run_night(reference, dt(4, 21), dt(5, 11, 1), soc, grid)[0]

    acc = om.NightAccumulator()
    run_night(acc, dt(4, 21), dt(5, 1), soc, grid)
    saved = acc.as_dict()
    restored = om.NightAccumulator.from_dict(saved)  # HA restart, 2 min down
    recs = run_night(restored, dt(5, 1, 3), dt(5, 11, 1), soc, grid)

    assert recs[0].valid
    assert recs[0].consumption_kwh(CAP) == pytest.approx(
        ref.consumption_kwh(CAP), abs=0.05
    )


def test_missed_end_reading_invalidates() -> None:
    acc = om.NightAccumulator()
    run_night(acc, dt(4, 21), dt(5, 10, 50), lambda t: 40.0, lambda t: 0.0)
    rec = acc.update(dt(5, 11, 30), 38.0, 0.0)  # HA was down over 11:00
    assert rec is not None and not rec.valid
    assert "11:00" in rec.reason


def test_end_waits_for_soc_within_grace() -> None:
    acc = om.NightAccumulator()
    run_night(acc, dt(4, 21), dt(5, 10, 59), lambda t: 40.0, lambda t: 0.0)
    assert acc.update(dt(5, 11, 0), None, 0.0) is None
    rec = acc.update(dt(5, 11, 5), 30.0, 0.0)
    assert rec is not None and rec.valid and rec.soc_end == 30.0


def test_one_night_per_day_and_next_night_starts() -> None:
    acc = om.NightAccumulator()
    soc = lambda t: 40.0  # noqa: E731
    run_night(acc, dt(4, 21), dt(5, 11, 1), soc, lambda t: 0.0)
    run_night(acc, dt(5, 21), dt(6, 11, 1), soc, lambda t: 0.0)
    assert [n.date for n in acc.nights] == ["2026-11-04", "2026-11-05"]


def test_implausible_night_rejected() -> None:
    rec = om.NightRecord(date="x", soc_start=30, soc_end=60, valid=True)
    assert rec.consumption_kwh(CAP) is None  # SOC rose with no import


def test_corrupt_storage_is_tolerated() -> None:
    acc = om.NightAccumulator.from_dict(
        {"nights": [{"bad": 1}, {"date": "2026-11-01", "valid": True,
                                 "soc_start": 50, "soc_end": 30}],
         "active": {"date": "2026-11-02"}}
    )
    assert len(acc.nights) == 1 and acc.active is None


# ---------------------------------------------------------------------------
# Reserve sizing
# ---------------------------------------------------------------------------


def test_percentile_matches_numpy_linear() -> None:
    assert om.percentile([1, 2, 3, 4, 5], 80) == pytest.approx(4.2)
    assert om.percentile([7.0], 80) == 7.0


def test_design_needs_three_nights() -> None:
    assert om.design_night_kwh([9.0, 9.0]) is None
    assert om.design_night_kwh([9.0, 9.0, 9.0]) == 9.0


def test_design_uses_heavy_night_not_average() -> None:
    nights = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 12, 12, 8]  # recent first
    design = om.design_night_kwh(nights)
    assert design > sum(nights) / len(nights)
    # With the default 20 % margin even the two heavy nights are covered
    assert design * 1.2 >= 12


def test_cold_snap_reflected_next_evening() -> None:
    nights = [15.0] + [8.0] * 13  # last night was cold
    assert om.design_night_kwh(nights) == 15.0


def test_reserve_rounds_up_and_clamps() -> None:
    # 9.6 kWh × 1.2 = 11.52 kWh = 24.0 % → 24
    assert om.reserve_pct(9.6, CAP, 20) == 24
    # 9.7 × 1.2 / 48 = 24.25 % → 25 (never round down)
    assert om.reserve_pct(9.7, CAP, 20) == 25
    assert om.reserve_pct(0.5, CAP, 20) == om.RESERVE_MIN_PCT
    assert om.reserve_pct(100, CAP, 20) == om.RESERVE_MAX_PCT


# ---------------------------------------------------------------------------
# Export guard
# ---------------------------------------------------------------------------


def test_export_stop_soc_includes_rest_of_evening() -> None:
    # 18:00, 4 kW house, 3 h left = 12 kWh = 25 %; floor 10 + reserve 18
    assert om.export_stop_soc(dt(4, 18), 18, 4.0, CAP) == pytest.approx(53.0)
    # At 20:00 only 1 h left
    assert om.export_stop_soc(dt(4, 20), 18, 4.0, CAP) == pytest.approx(10 + 18 + 4 / 48 * 100)
    # Before the window it previews tonight's threshold, not hours-to-21:00
    assert om.export_stop_soc(dt(4, 12), 18, 4.0, CAP) == pytest.approx(53.0)
    # Never assume an idle house
    assert om.export_stop_soc(dt(4, 18), 18, 0.0, CAP) == pytest.approx(10 + 18 + 3 / 48 * 100)


def test_guard_latches_off_for_the_evening() -> None:
    g = om.ExportGuard()
    assert g.update(dt(4, 19), 80.0, 2000, 18, CAP)
    # 19:30: 10 + 18 + 1.5 h × 2 kW (6.25 %) = 34.25 %
    assert g.update(dt(4, 19, 30), 34.5, 2000, 18, CAP)
    assert not g.update(dt(4, 19, 31), 34.0, 2000, 18, CAP)  # hit threshold
    # SOC can't rise by itself, but even if a reading bounces it stays off
    assert not g.update(dt(4, 19, 31), 90.0, 2000, 18, CAP)
    # Next evening starts fresh
    assert g.update(dt(5, 18), 90.0, 2000, 18, CAP)


def test_guard_fails_safe_on_unknown_soc_without_latching() -> None:
    g = om.ExportGuard()
    assert not g.update(dt(4, 18, 30), None, 2000, 18, CAP)  # never seen SOC
    assert g.update(dt(4, 18, 31), 90.0, 2000, 18, CAP)


def test_guard_rides_through_brief_soc_dropout() -> None:
    g = om.ExportGuard()
    assert g.update(dt(4, 18, 30), 90.0, 2000, 18, CAP)
    assert g.update(dt(4, 18, 35), None, 2000, 18, CAP)  # 5 min: hold
    assert not g.update(dt(4, 18, 45), None, 2000, 18, CAP)  # 15 min: fail safe
    assert g.update(dt(4, 18, 46), 89.0, 2000, 18, CAP)  # not latched


def test_guard_is_permissive_outside_window() -> None:
    g = om.ExportGuard()
    assert g.update(dt(4, 15), 5.0, 2000, 18, CAP)


def test_guard_smooths_house_load_spikes() -> None:
    g = om.ExportGuard()
    for m in range(10):
        g.update(dt(4, 18, m), 90.0, 1500, 18, CAP)
    g.update(dt(4, 18, 10), 90.0, 9000, 18, CAP)  # kettle + oven for a minute
    assert g.house_kw_ema < 3.5


# ---------------------------------------------------------------------------
# Schedule integration
# ---------------------------------------------------------------------------


def test_floor_constant_matches_schedule() -> None:
    assert om.OVERNIGHT_FLOOR_PCT == inverter_schedule.OVERNIGHT_FLOOR_PCT


def test_schedule_export_stopped_keeps_battery_on_house() -> None:
    Inputs = inverter_schedule.InverterScheduleInputs
    slots = inverter_schedule.calculate_inverter_schedule(
        Inputs(overnight_reserve_pct=18, export_allowed=False)
    )
    s5 = slots[4]
    assert s5.load_limit == "Zero Export"
    assert s5.sell is False
    assert s5.capacity_pct == om.OVERNIGHT_FLOOR_PCT  # still powers the house


def test_dst_change_night_ends_at_local_11am() -> None:
    from zoneinfo import ZoneInfo

    syd = ZoneInfo("Australia/Sydney")
    acc = om.NightAccumulator()
    # DST ends 2027-04-04 03:00 → 02:00; night of 3 Apr is 15 h long
    t = datetime(2027, 4, 3, 21, 0, tzinfo=syd)
    acc.update(t, 50.0, 0.0)
    acc = om.NightAccumulator.from_dict(acc.as_dict())  # restart: fixed offset on disk
    assert acc.update(datetime(2027, 4, 4, 10, 59, tzinfo=syd), 30.0, 0.0) is None
    rec = acc.update(datetime(2027, 4, 4, 11, 0, tzinfo=syd), 30.0, 0.0)
    assert rec is not None and rec.soc_end == 30.0
