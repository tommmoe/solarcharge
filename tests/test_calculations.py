from datetime import datetime, time

import pytest

from load_calculations import (
    ChargeInputs,
    ChargeSettings,
    calculate_charge_decision,
)


def settings(**overrides):
    values = {
        "breaker_limit_amps": 50,
        "safety_margin_amps": 5,
        "voltage_v": 230,
        "grid_buffer_w": 500,
        "min_charge_amps": 6,
        "max_charge_amps": 16,
        "free_window_start": time(11, 0),
        "free_window_end": time(14, 0),
        "mode": "free_hours_or_solar",
    }
    values.update(overrides)
    return ChargeSettings(**values)


def test_free_window_no_ev_charging():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=7110,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 12, 0),
        ),
        settings(),
    )

    assert decision.allowed is True
    assert decision.target_amps == 11
    assert decision.safe_limit_w == 10350
    assert decision.base_grid_import_w == 7110


def test_free_window_ev_already_charging_subtracts_ev_load():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=9700,
            charger_power_w=None,
            charger_current_a=11,
            charger_voltage_v=237,
            now=datetime(2026, 1, 1, 12, 0),
        ),
        settings(),
    )

    assert decision.allowed is True
    assert decision.charger_power_w == 2607
    assert decision.base_grid_import_w == pytest.approx(7093)
    assert decision.spare_capacity_w == pytest.approx(2757)
    assert decision.target_amps == 11


def test_too_much_import_below_minimum_capacity():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=10300,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 12, 0),
        ),
        settings(),
    )

    assert decision.allowed is False
    assert decision.target_amps == 0


def test_clamps_to_max_charge_current():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=1000,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 12, 0),
        ),
        settings(),
    )

    assert decision.allowed is True
    assert decision.target_amps == 16


def test_below_minimum_charge_current_returns_zero():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=8700,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 12, 0),
        ),
        settings(),
    )

    assert decision.allowed is False
    assert decision.target_amps == 0


def test_outside_free_window_no_solar_not_allowed():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=1000,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 16, 0),
        ),
        settings(mode="free_hours_or_solar"),
    )

    assert decision.allowed is False
    assert decision.target_amps == 0


def test_outside_free_window_solar_export_allowed():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=-2500,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 16, 0),
        ),
        settings(mode="solar_only"),
    )

    assert decision.allowed is True
    assert decision.target_amps == 8


def test_force_charge_is_still_limited_by_breaker_protection():
    decision = calculate_charge_decision(
        ChargeInputs(
            grid_power_w=10300,
            charger_power_w=0,
            charger_current_a=None,
            charger_voltage_v=None,
            now=datetime(2026, 1, 1, 16, 0),
        ),
        settings(mode="force_charge"),
    )

    assert decision.allowed is False
    assert decision.target_amps == 0
