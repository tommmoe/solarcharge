"""Pure calculation engine for Solar Charge."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from math import floor

MODE_OFF = "off"
MODE_FREE_HOURS_ONLY = "free_hours_only"
MODE_SOLAR_ONLY = "solar_only"
MODE_FREE_HOURS_OR_SOLAR = "free_hours_or_solar"
MODE_FORCE_CHARGE = "force_charge"
MODE_MANUAL = "manual"


@dataclass(slots=True)
class ChargeInputs:
    """Input values converted to internal units."""

    grid_power_w: float | None
    charger_power_w: float | None
    charger_current_a: float | None
    charger_voltage_v: float | None
    pv_power_w: float | None = None
    battery_soc_pct: float | None = None
    battery_power_w: float | None = None
    now: datetime | None = None


@dataclass(slots=True)
class ChargeSettings:
    """User-configurable charge calculation settings."""

    breaker_limit_amps: float = 50
    safety_margin_amps: float = 5
    voltage_v: float = 230
    grid_buffer_w: float = 500
    min_charge_amps: int = 6
    max_charge_amps: int = 16
    current_change_threshold_amps: int = 2
    free_window_start: time = time(11, 0)
    free_window_end: time = time(14, 0)
    mode: str = MODE_FREE_HOURS_OR_SOLAR
    battery_reserve_pct: float | None = None


@dataclass(slots=True)
class ChargeDecision:
    """Calculated charging decision."""

    allowed: bool
    target_amps: int
    spare_capacity_w: float
    safe_limit_w: float
    base_grid_import_w: float
    charger_power_w: float
    reason: str
    emergency_stop: bool = False


def is_in_time_window(
    now: datetime | None,
    start: time,
    end: time,
) -> bool:
    """Return whether a datetime is inside a daily time window."""

    if now is None:
        now = datetime.now()

    current = now.timetz().replace(tzinfo=None)

    if start == end:
        return True

    if start < end:
        return start <= current < end

    return current >= start or current < end


def calculate_charge_decision(
    inputs: ChargeInputs,
    settings: ChargeSettings,
) -> ChargeDecision:
    """Calculate whether charging is allowed and the safe current target."""

    voltage_v = max(float(settings.voltage_v), 1.0)
    safe_limit_w = max(
        0.0,
        (float(settings.breaker_limit_amps) - float(settings.safety_margin_amps))
        * voltage_v,
    )

    if inputs.grid_power_w is None:
        return ChargeDecision(
            allowed=False,
            target_amps=0,
            spare_capacity_w=0.0,
            safe_limit_w=safe_limit_w,
            base_grid_import_w=0.0,
            charger_power_w=_estimate_charger_power(inputs),
            reason="Grid power unavailable",
            emergency_stop=True,
        )

    charger_power_w = _estimate_charger_power(inputs)
    grid_power_w = float(inputs.grid_power_w)
    base_grid_import_w = grid_power_w - charger_power_w
    spare_capacity_w = safe_limit_w - base_grid_import_w - float(settings.grid_buffer_w)
    breaker_target_amps = _clamp_target_amps(
        floor(spare_capacity_w / voltage_v),
        settings.min_charge_amps,
        settings.max_charge_amps,
    )
    in_window = is_in_time_window(
        inputs.now,
        settings.free_window_start,
        settings.free_window_end,
    )
    emergency_stop = grid_power_w > safe_limit_w

    if settings.mode == MODE_OFF:
        return _decision(
            False,
            0,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Mode is off",
            emergency_stop,
        )

    if settings.mode == MODE_MANUAL:
        return _decision(
            False,
            0,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Manual mode active",
            emergency_stop,
        )

    if settings.mode == MODE_FORCE_CHARGE:
        if breaker_target_amps <= 0:
            return _decision(
                False,
                0,
                spare_capacity_w,
                safe_limit_w,
                base_grid_import_w,
                charger_power_w,
                "Force charge active but breaker protection leaves no capacity",
                emergency_stop,
            )
        return _decision(
            True,
            breaker_target_amps,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Force charge active, limited by breaker protection",
            emergency_stop,
        )

    if settings.mode == MODE_FREE_HOURS_ONLY:
        if not in_window:
            return _decision(
                False,
                0,
                spare_capacity_w,
                safe_limit_w,
                base_grid_import_w,
                charger_power_w,
                "Outside free hours",
                emergency_stop,
            )
        return _capacity_decision(
            breaker_target_amps,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Free window active",
            emergency_stop,
        )

    if settings.mode == MODE_SOLAR_ONLY:
        return _solar_decision(
            inputs,
            settings,
            breaker_target_amps,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            emergency_stop,
        )

    if settings.mode == MODE_FREE_HOURS_OR_SOLAR:
        if in_window:
            return _capacity_decision(
                breaker_target_amps,
                spare_capacity_w,
                safe_limit_w,
                base_grid_import_w,
                charger_power_w,
                "Free window active",
                emergency_stop,
            )
        return _solar_decision(
            inputs,
            settings,
            breaker_target_amps,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            emergency_stop,
        )

    return _decision(
        False,
        0,
        spare_capacity_w,
        safe_limit_w,
        base_grid_import_w,
        charger_power_w,
        f"Unsupported mode: {settings.mode}",
        emergency_stop,
    )


def _estimate_charger_power(inputs: ChargeInputs) -> float:
    direct_power_w = _positive_or_zero(inputs.charger_power_w)

    current_power_w = 0.0
    if inputs.charger_current_a is not None and inputs.charger_voltage_v is not None:
        current_power_w = _positive_or_zero(
            float(inputs.charger_current_a) * float(inputs.charger_voltage_v)
        )

    return max(direct_power_w, current_power_w)


def _positive_or_zero(value: float | None) -> float:
    if value is None:
        return 0.0
    return max(float(value), 0.0)


def _clamp_target_amps(
    raw_target_amps: int,
    min_charge_amps: int,
    max_charge_amps: int,
) -> int:
    if raw_target_amps < int(min_charge_amps):
        return 0
    return min(int(raw_target_amps), int(max_charge_amps))


def _capacity_decision(
    target_amps: int,
    spare_capacity_w: float,
    safe_limit_w: float,
    base_grid_import_w: float,
    charger_power_w: float,
    allowed_reason: str,
    emergency_stop: bool,
) -> ChargeDecision:
    if target_amps <= 0:
        return _decision(
            False,
            0,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Not enough safe capacity",
            emergency_stop,
        )
    return _decision(
        True,
        target_amps,
        spare_capacity_w,
        safe_limit_w,
        base_grid_import_w,
        charger_power_w,
        allowed_reason,
        emergency_stop,
    )


def _solar_decision(
    inputs: ChargeInputs,
    settings: ChargeSettings,
    breaker_target_amps: int,
    spare_capacity_w: float,
    safe_limit_w: float,
    base_grid_import_w: float,
    charger_power_w: float,
    emergency_stop: bool,
) -> ChargeDecision:
    if (
        settings.battery_reserve_pct is not None
        and inputs.battery_soc_pct is not None
        and float(inputs.battery_soc_pct) < float(settings.battery_reserve_pct)
    ):
        return _decision(
            False,
            0,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "Battery reserve not met",
            emergency_stop,
        )

    voltage_v = max(float(settings.voltage_v), 1.0)
    solar_surplus_w = max(0.0, -base_grid_import_w)
    solar_target_amps = _clamp_target_amps(
        floor((solar_surplus_w - float(settings.grid_buffer_w)) / voltage_v),
        settings.min_charge_amps,
        settings.max_charge_amps,
    )
    target_amps = min(solar_target_amps, breaker_target_amps)

    if target_amps <= 0:
        return _decision(
            False,
            0,
            spare_capacity_w,
            safe_limit_w,
            base_grid_import_w,
            charger_power_w,
            "No solar surplus available",
            emergency_stop,
        )

    return _decision(
        True,
        target_amps,
        spare_capacity_w,
        safe_limit_w,
        base_grid_import_w,
        charger_power_w,
        "Solar surplus available",
        emergency_stop,
    )


def _decision(
    allowed: bool,
    target_amps: int,
    spare_capacity_w: float,
    safe_limit_w: float,
    base_grid_import_w: float,
    charger_power_w: float,
    reason: str,
    emergency_stop: bool,
) -> ChargeDecision:
    if emergency_stop and target_amps <= 0:
        reason = f"Breaker import limit exceeded; {reason.lower()}"

    return ChargeDecision(
        allowed=allowed,
        target_amps=target_amps,
        spare_capacity_w=round(spare_capacity_w, 3),
        safe_limit_w=round(safe_limit_w, 3),
        base_grid_import_w=round(base_grid_import_w, 3),
        charger_power_w=round(charger_power_w, 3),
        reason=reason,
        emergency_stop=emergency_stop,
    )

