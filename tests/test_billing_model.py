from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from load_billing_model import billing_model as bm

TZ = timezone(timedelta(hours=11))
T = bm.Tariff()


def dt(day: int, hh: int, mm: int = 0) -> datetime:
    return datetime(2026, 11, day, hh, mm, tzinfo=TZ)


def test_periods_match_bill():
    from datetime import time

    assert bm.import_period(time(10, 59)) == "shoulder"
    assert bm.import_period(time(11, 0)) == "offpeak"
    assert bm.import_period(time(14, 0)) == "shoulder"
    assert bm.import_period(time(16, 0)) == "peak"
    assert bm.import_period(time(22, 59)) == "peak"
    assert bm.import_period(time(23, 0)) == "shoulder"


def test_october_bill_reproduced():
    """Quantities from the 04-31 Oct 2026 bill price to its $30.71 total."""
    days = []
    for i in range(28):
        d = bm.DayUsage(date=f"2026-10-{i + 4:02d}", window_closed=True)
        d.import_peak_kwh = 17.10 / 28
        d.import_offpeak_kwh = 496.00 / 28
        d.import_shoulder_kwh = 39.04 / 28
        d.export_peak_kwh = 262.97 / 28
        d.export_other_kwh = 28.37 / 28
        d.export_window_kwh = 251.51 / 28
        d.window_import_kwh = 0.0 if i < 17 else 0.5
        days.append(d)
    out = bm.total(days, T)
    assert out["net"] == pytest.approx(30.71, abs=0.02)
    assert out["spent"] == pytest.approx(47.74 + 9.03 + 16.32, abs=0.02)
    assert out["zerohero_days"] == 17


def test_counter_deltas_land_in_current_period():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 12, 0), 100.0, 50.0, None, None)  # baseline
    acc.update(dt(8, 12, 1), 100.2, 50.0, None, None)  # offpeak import
    acc.update(dt(8, 17, 0), 100.2, 50.0, None, None)
    acc.update(dt(8, 17, 1), 100.3, 50.0, None, None)  # peak import (gap > 30 min was before)
    day = acc.day(date(2026, 11, 8))
    assert day.import_offpeak_kwh == pytest.approx(0.2)
    # 12:01 -> 17:00 gap exceeds the limit, delta (0) dropped; 17:01 counted
    assert day.import_peak_kwh == pytest.approx(0.1)


def test_long_gap_is_skipped_not_guessed():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 1, 0), 100.0, 0.0, None, None)
    acc.update(dt(8, 3, 0), 105.0, 0.0, None, None)
    day = acc.day(date(2026, 11, 8))
    assert day.import_kwh == 0
    assert day.skipped_kwh == pytest.approx(5.0)


def test_counter_reset_rebaselines():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 1, 0), 100.0, 0.0, None, None)
    acc.update(dt(8, 1, 1), 0.0, 0.0, None, None)
    acc.update(dt(8, 1, 2), 0.1, 0.0, None, None)
    assert acc.day(date(2026, 11, 8)).import_shoulder_kwh == pytest.approx(0.1)


def test_export_window_and_super_export_cap():
    acc = bm.BillAccumulator()
    t = dt(8, 18, 0)
    acc.update(t, 0.0, 0.0, None, 0.0)
    exp = 0.0
    for _ in range(180):  # 3 h at 6 kW; the 21:00 tick is outside the window
        t += timedelta(minutes=1)
        exp += 0.1
        acc.update(t, 0.0, exp, None, 0.0)
    acc.update(dt(8, 21, 30), 0.0, exp, None, 0.0)
    day = acc.day(date(2026, 11, 8))
    bill = day.bill(T)
    assert day.export_window_kwh == pytest.approx(17.9)
    assert bill["super_export_kwh"] == pytest.approx(15.0)
    assert bill["super_export"] == pytest.approx(15 * 0.08)
    assert bill["feed_in"] == pytest.approx(18 * 0.02)
    assert bill["zerohero"] == 1.0


def test_zerohero_lost_when_window_import_over_limit():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 18, 0), 0.0, 0.0, None, 0.0)
    acc.update(dt(8, 20, 0), 0.0, 0.0, None, 0.2)
    acc.update(dt(8, 21, 5), 0.0, 0.0, None, 0.2)
    day = acc.day(date(2026, 11, 8))
    assert day.zerohero(T) is False
    assert day.bill(T)["zerohero"] == 0.0


def test_zerohero_settled_next_day_without_post_window_reading():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 18, 0), 0.0, 0.0, None, 0.0)
    acc.update(dt(8, 20, 59), 0.0, 0.0, None, 0.01)
    assert acc.day(date(2026, 11, 8)).bill(T)["zerohero"] == 0.0  # provisional
    acc.update(dt(9, 0, 5), 0.0, 0.0, None, 0.01)
    assert acc.day(date(2026, 11, 8)).bill(T)["zerohero"] == 1.0


def test_power_fallback_integration():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 9, 0), None, None, 1200.0, None)
    acc.update(dt(8, 9, 1), None, None, 1200.0, None)  # 1.2 kW for 1 min
    acc.update(dt(8, 9, 2), None, None, -600.0, None)  # export 0.6 kW for 1 min
    day = acc.day(date(2026, 11, 8))
    assert day.import_shoulder_kwh == pytest.approx(0.02)
    assert day.export_other_kwh == pytest.approx(0.01)


def test_counter_dropout_not_double_counted():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 9, 0), 100.0, 0.0, 1200.0, None)
    acc.update(dt(8, 9, 1), None, None, 1200.0, None)  # counters unavailable
    acc.update(dt(8, 9, 2), None, None, 1200.0, None)
    acc.update(dt(8, 9, 3), 100.1, 0.0, 1200.0, None)
    assert acc.day(date(2026, 11, 8)).import_kwh == pytest.approx(0.1)


def test_round_trip():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 12, 0), 100.0, 50.0, None, None)
    acc.update(dt(8, 12, 1), 100.5, 50.0, None, None)
    again = bm.BillAccumulator.from_dict(acc.as_dict())
    again.update(dt(8, 12, 2), 100.7, 50.0, None, None)
    assert again.day(date(2026, 11, 8)).import_offpeak_kwh == pytest.approx(0.7)


def test_backfill_whole_past_day():
    acc = bm.BillAccumulator()
    hours = [(dt(7, h), 1.0, 0.5) for h in range(24)]
    assert acc.backfill_day(date(2026, 11, 7), hours, 0.0, dt(8, 9))
    day = acc.day(date(2026, 11, 7))
    assert day.import_offpeak_kwh == pytest.approx(3.0)
    assert day.import_peak_kwh == pytest.approx(7.0)
    assert day.import_shoulder_kwh == pytest.approx(14.0)
    assert day.export_window_kwh == pytest.approx(1.5)
    assert day.export_peak_kwh == pytest.approx(3.5)
    assert day.bill(T)["zerohero"] == 1.0
    # second run is a no-op
    assert not acc.backfill_day(date(2026, 11, 7), hours, 0.0, dt(8, 9))
    assert day.import_kwh == pytest.approx(24.0)


def test_backfill_stops_where_live_tracking_began():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 22, 45), 100.0, 50.0, None, None)  # live from 22:45
    acc.update(dt(8, 22, 46), 100.1, 50.0, None, None)
    hours = [(dt(8, h), 1.0, 0.0) for h in range(23)]  # through 22:00-23:00
    acc.backfill_day(date(2026, 11, 8), hours, 0.5, dt(8, 23, 5))
    day = acc.day(date(2026, 11, 8))
    # 16..21 full peak hours (6) + 0.75 of 22:00 + live 0.1
    assert day.import_peak_kwh == pytest.approx(6.75 + 0.1)
    assert day.zerohero(T) is False


def test_legacy_day_cleared_on_load():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 22, 45), 100.0, 50.0, None, None)
    acc.update(dt(8, 22, 46), 100.3, 50.0, None, None)
    data = acc.as_dict()
    for d in data["days"]:
        del d["tracked_from"]
        del d["backfilled"]
    again = bm.BillAccumulator.from_dict(data)
    assert again.day(date(2026, 11, 8)).import_kwh == 0
    assert again.day(date(2026, 11, 8)).tracked_from is None


def test_tracked_from_uses_baseline_after_short_restart():
    acc = bm.BillAccumulator()
    acc.update(dt(8, 22, 40), 100.0, 50.0, None, None)
    data = acc.as_dict()
    data["days"] = []
    again = bm.BillAccumulator.from_dict(data)
    again.update(dt(8, 22, 50), 100.2, 50.0, None, None)
    day = again.day(date(2026, 11, 8))
    assert day.tracked_from == dt(8, 22, 40).isoformat()
    assert day.import_peak_kwh == pytest.approx(0.2)
