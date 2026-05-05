from datetime import datetime

from load_calculations import is_in_time_window


def test_time_window_crossing_midnight():
    assert is_in_time_window(
        datetime(2026, 1, 1, 23, 30),
        start=datetime(2026, 1, 1, 22, 0).time(),
        end=datetime(2026, 1, 1, 6, 0).time(),
    )
    assert is_in_time_window(
        datetime(2026, 1, 1, 5, 30),
        start=datetime(2026, 1, 1, 22, 0).time(),
        end=datetime(2026, 1, 1, 6, 0).time(),
    )
    assert not is_in_time_window(
        datetime(2026, 1, 1, 12, 0),
        start=datetime(2026, 1, 1, 22, 0).time(),
        end=datetime(2026, 1, 1, 6, 0).time(),
    )
