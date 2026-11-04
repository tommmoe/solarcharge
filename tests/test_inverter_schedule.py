from datetime import time

from load_inverter_schedule import (
    InverterScheduleInputs,
    calculate_inverter_schedule,
)


def test_schedule_fits_deye_program_row_time_ranges() -> None:
    slots = calculate_inverter_schedule(InverterScheduleInputs(overnight_reserve_pct=24))

    assert [slot.start_time for slot in slots] == [
        time(0, 0),
        time(9, 0),
        time(11, 0),
        time(14, 0),
        time(18, 0),
        time(21, 0),
    ]
    assert slots[2].charge_mode == "Allow Grid & Gen"
    assert all(slot.charge_mode == "No Grid or Gen" for slot in slots[:2])
    assert all(slot.charge_mode == "No Grid or Gen" for slot in slots[3:])
    # Only the export slot sells; without the flag the battery idles
    assert [slot.sell for slot in slots] == [False, False, False, False, True, False]


def test_export_preserves_dynamic_overnight_reserve() -> None:
    slots = calculate_inverter_schedule(InverterScheduleInputs(overnight_reserve_pct=24))

    # Export stops with the overnight need left above the hard floor
    assert slots[4].capacity_pct == 10 + 24
    # Overnight slots may use that energy, down to the hard floor
    assert slots[5].capacity_pct == 10
    assert slots[0].capacity_pct == 10
    assert slots[1].capacity_pct == 10


def test_only_paid_export_window_allows_export() -> None:
    slots = calculate_inverter_schedule(InverterScheduleInputs(overnight_reserve_pct=24))

    assert slots[4].load_limit == "Allow Export"
    assert all(slot.load_limit == "Zero Export" for slot in slots[:4])
    assert slots[5].load_limit == "Zero Export"


def test_export_floor_is_capped() -> None:
    slots = calculate_inverter_schedule(InverterScheduleInputs(overnight_reserve_pct=90))
    assert slots[4].capacity_pct == 70
