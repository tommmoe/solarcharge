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


def test_export_preserves_dynamic_overnight_reserve() -> None:
    slots = calculate_inverter_schedule(InverterScheduleInputs(overnight_reserve_pct=24))

    assert slots[4].capacity_pct == 24
    assert slots[5].capacity_pct == 24
