"""Coordinator for Solar Charge."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, time
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import HomeAssistant, State
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .calculations import (
    ChargeDecision,
    ChargeInputs,
    ChargeSettings,
    calculate_charge_decision,
    is_in_time_window,
)
from .const import (
    CONF_BATTERY_CHARGING_POSITIVE,
    CONF_BATTERY_POWER_ENTITY,
    CONF_BATTERY_POWER_MULTIPLIER,
    CONF_BATTERY_RESERVE_PCT,
    CONF_BATTERY_SOC_ENTITY,
    CONF_BREAKER_LIMIT_AMPS,
    CONF_CHARGER_CHARGE_CONTROL_ENTITY,
    CONF_CHARGER_CURRENT_ENTITY,
    CONF_CHARGER_CURRENT_LIMIT_ENTITY,
    CONF_CHARGER_CURRENT_OFFERED_ENTITY,
    CONF_CHARGER_POWER_ENTITY,
    CONF_CHARGER_POWER_MULTIPLIER,
    CONF_CHARGER_POWER_UNIT,
    CONF_CHARGER_STATUS_ENTITY,
    CONF_CHARGER_VOLTAGE_ENTITY,
    CONF_CONTROL_INTERVAL_SECONDS,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
    CONF_ENABLED,
    CONF_FREE_WINDOW_END,
    CONF_FREE_WINDOW_START,
    CONF_GRID_BUFFER_WATTS,
    CONF_GRID_IMPORT_POSITIVE,
    CONF_GRID_POWER_ENTITY,
    CONF_GRID_POWER_MULTIPLIER,
    CONF_LOAD_POWER_ENTITY,
    CONF_MAX_CHARGE_AMPS,
    CONF_MIN_CHARGE_AMPS,
    CONF_MODE,
    CONF_NAME,
    CONF_PV_POWER_ENTITIES,
    CONF_PV_POWER_MULTIPLIER,
    CONF_SAFETY_MARGIN_AMPS,
    CONF_SENSOR_STALE_SECONDS,
    CONF_VOLTAGE,
    DEFAULTS,
    DOMAIN,
    POWER_UNIT_AUTO,
    POWER_UNIT_KW,
    POWER_UNIT_W,
)
from .control import ChargeController

_LOGGER = logging.getLogger(__name__)


class SolarChargeCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Read HA entity states and calculate charge decisions."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self._settings: dict[str, Any] = {}
        self.latest_raw_states: dict[str, dict[str, Any] | None] = {}
        self.latest_converted_values: dict[str, Any] = {}
        self.sensor_ages: dict[str, float | None] = {}
        self.last_error: str | None = None
        self.refresh_settings()

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            config_entry=entry,
            update_interval=timedelta(
                seconds=float(self._settings[CONF_CONTROL_INTERVAL_SECONDS])
            ),
        )
        self.controller = ChargeController(hass, self)

    @property
    def title(self) -> str:
        """Return the configured integration title."""

        return str(self._settings.get(CONF_NAME) or self.entry.title)

    @property
    def settings(self) -> dict[str, Any]:
        """Return merged settings."""

        return self._settings

    def refresh_settings(self) -> None:
        """Refresh cached merged settings from config entry data and options."""

        self._settings = {**DEFAULTS, **self.entry.data, **self.entry.options}

    async def async_set_config_value(self, key: str, value: Any) -> None:
        """Persist a runtime config value and refresh."""

        options = dict(self.entry.options)
        options[key] = value
        self.hass.config_entries.async_update_entry(self.entry, options=options)
        self.refresh_settings()
        self.update_interval = timedelta(
            seconds=float(self._settings[CONF_CONTROL_INTERVAL_SECONDS])
        )
        await self.async_request_refresh()

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch state data and calculate the latest decision."""

        try:
            self.refresh_settings()
            self.last_error = None
            now = dt_util.now()
            stale_after_s = float(self._settings[CONF_SENSOR_STALE_SECONDS])

            grid_state = self._state(self._settings.get(CONF_GRID_POWER_ENTITY))
            grid_power_w = self._numeric_state(
                grid_state,
                multiplier=float(self._settings[CONF_GRID_POWER_MULTIPLIER]),
            )
            if grid_power_w is not None and not self._settings[CONF_GRID_IMPORT_POSITIVE]:
                grid_power_w *= -1

            pv_power_w = self._sum_states(
                self._settings.get(CONF_PV_POWER_ENTITIES) or [],
                multiplier=float(self._settings[CONF_PV_POWER_MULTIPLIER]),
            )

            battery_power_w = self._numeric_state(
                self._state(self._settings.get(CONF_BATTERY_POWER_ENTITY)),
                multiplier=float(self._settings[CONF_BATTERY_POWER_MULTIPLIER]),
            )
            if (
                battery_power_w is not None
                and not self._settings[CONF_BATTERY_CHARGING_POSITIVE]
            ):
                battery_power_w *= -1

            battery_soc_pct = self._numeric_state(
                self._state(self._settings.get(CONF_BATTERY_SOC_ENTITY))
            )
            load_power_w = self._numeric_state(
                self._state(self._settings.get(CONF_LOAD_POWER_ENTITY))
            )
            charger_power_w = self._charger_power_w()
            charger_current_a = self._numeric_state(
                self._state(self._settings.get(CONF_CHARGER_CURRENT_ENTITY))
            )
            charger_voltage_v = self._numeric_state(
                self._state(self._settings.get(CONF_CHARGER_VOLTAGE_ENTITY))
            )
            charger_offered_current_a = self._numeric_state(
                self._state(self._settings.get(CONF_CHARGER_CURRENT_OFFERED_ENTITY))
            )
            charger_status = self._state_value(
                self._state(self._settings.get(CONF_CHARGER_STATUS_ENTITY))
            )

            grid_sensor_ok = self._state_ok(grid_state) and not self._is_stale(
                grid_state, stale_after_s
            )
            current_limit_ok = self._state_ok(
                self._state(self._settings.get(CONF_CHARGER_CURRENT_LIMIT_ENTITY))
            )
            charge_control_ok = self._state_ok(
                self._state(self._settings.get(CONF_CHARGER_CHARGE_CONTROL_ENTITY))
            )
            charger_sensor_ok = current_limit_ok and charge_control_ok

            settings = self._charge_settings()
            if not grid_sensor_ok:
                calc_grid_power_w = None
            else:
                calc_grid_power_w = grid_power_w

            decision = calculate_charge_decision(
                ChargeInputs(
                    grid_power_w=calc_grid_power_w,
                    charger_power_w=charger_power_w,
                    charger_current_a=charger_current_a,
                    charger_voltage_v=charger_voltage_v,
                    pv_power_w=pv_power_w,
                    battery_soc_pct=battery_soc_pct,
                    battery_power_w=battery_power_w,
                    now=now,
                ),
                settings,
            )

            if not self._settings[CONF_ENABLED]:
                decision = ChargeDecision(
                    allowed=False,
                    target_amps=0,
                    spare_capacity_w=decision.spare_capacity_w,
                    safe_limit_w=decision.safe_limit_w,
                    base_grid_import_w=decision.base_grid_import_w,
                    charger_power_w=decision.charger_power_w,
                    reason="Integration disabled",
                    emergency_stop=decision.emergency_stop,
                )

            in_window = is_in_time_window(
                now,
                settings.free_window_start,
                settings.free_window_end,
            )
            breaker_limit_ok = (
                grid_sensor_ok
                and grid_power_w is not None
                and grid_power_w <= decision.safe_limit_w
            )

            self.latest_converted_values = {
                "grid_power_w": grid_power_w,
                "pv_power_w": pv_power_w,
                "battery_power_w": battery_power_w,
                "battery_soc_pct": battery_soc_pct,
                "load_power_w": load_power_w,
                "charger_power_w": charger_power_w,
                "charger_current_a": charger_current_a,
                "charger_voltage_v": charger_voltage_v,
                "charger_offered_current_a": charger_offered_current_a,
                "charger_status": charger_status,
            }

            data = {
                **self.latest_converted_values,
                "decision": decision,
                "decision_dict": asdict(decision),
                "allowed_to_charge": decision.allowed,
                "target_amps": decision.target_amps,
                "safe_limit_w": decision.safe_limit_w,
                "base_grid_import_w": decision.base_grid_import_w,
                "spare_capacity_w": decision.spare_capacity_w,
                "reason": decision.reason,
                "in_free_window": in_window,
                "grid_sensor_ok": grid_sensor_ok,
                "charger_sensor_ok": charger_sensor_ok,
                "current_limit_ok": current_limit_ok,
                "charge_control_ok": charge_control_ok,
                "breaker_limit_ok": breaker_limit_ok,
                "status": self._status(decision, grid_sensor_ok),
            }

            await self.controller.async_apply_decision(data=data)
            data["last_control_action"] = self.controller.last_action
            data["last_error"] = self.last_error

            _LOGGER.debug(
                "Read grid=%sW, charger=%sW, base=%sW",
                grid_power_w,
                decision.charger_power_w,
                decision.base_grid_import_w,
            )
            _LOGGER.debug(
                "safe_limit=%sW, spare=%sW, target=%sA",
                decision.safe_limit_w,
                decision.spare_capacity_w,
                decision.target_amps,
            )
            _LOGGER.debug(
                "mode=%s, in_window=%s, allowed=%s, reason=%s",
                self._settings[CONF_MODE],
                in_window,
                decision.allowed,
                decision.reason,
            )

            return data
        except Exception as err:  # noqa: BLE001
            self.last_error = str(err)
            raise UpdateFailed(str(err)) from err

    def _charge_settings(self) -> ChargeSettings:
        return ChargeSettings(
            breaker_limit_amps=float(self._settings[CONF_BREAKER_LIMIT_AMPS]),
            safety_margin_amps=float(self._settings[CONF_SAFETY_MARGIN_AMPS]),
            voltage_v=float(self._settings[CONF_VOLTAGE]),
            grid_buffer_w=float(self._settings[CONF_GRID_BUFFER_WATTS]),
            min_charge_amps=int(float(self._settings[CONF_MIN_CHARGE_AMPS])),
            max_charge_amps=int(float(self._settings[CONF_MAX_CHARGE_AMPS])),
            current_change_threshold_amps=int(
                float(self._settings[CONF_CURRENT_CHANGE_THRESHOLD_AMPS])
            ),
            free_window_start=_parse_time(str(self._settings[CONF_FREE_WINDOW_START])),
            free_window_end=_parse_time(str(self._settings[CONF_FREE_WINDOW_END])),
            mode=str(self._settings[CONF_MODE]),
            battery_reserve_pct=_optional_float(
                self._settings.get(CONF_BATTERY_RESERVE_PCT)
            ),
        )

    def _state(self, entity_id: str | None) -> State | None:
        if not entity_id:
            return None
        state = self.hass.states.get(entity_id)
        self.latest_raw_states[entity_id] = _state_as_dict(state)
        self.sensor_ages[entity_id] = self._state_age_seconds(state)
        return state

    def _numeric_state(
        self,
        state: State | None,
        multiplier: float = 1.0,
    ) -> float | None:
        if not self._state_ok(state):
            return None
        try:
            return float(state.state) * multiplier
        except (TypeError, ValueError):
            return None

    def _sum_states(self, entity_ids: list[str], multiplier: float) -> float | None:
        total = 0.0
        found = False
        for entity_id in entity_ids:
            value = self._numeric_state(self._state(entity_id), multiplier=multiplier)
            if value is None:
                continue
            total += value
            found = True
        return total if found else None

    def _charger_power_w(self) -> float | None:
        state = self._state(self._settings.get(CONF_CHARGER_POWER_ENTITY))
        value = self._numeric_state(
            state,
            multiplier=float(self._settings[CONF_CHARGER_POWER_MULTIPLIER]),
        )
        if value is None:
            return None

        configured_unit = self._settings[CONF_CHARGER_POWER_UNIT]
        if configured_unit == POWER_UNIT_KW or (
            configured_unit == POWER_UNIT_AUTO
            and str(state.attributes.get("unit_of_measurement", "")).lower() == "kw"
        ):
            return value * 1000
        if configured_unit == POWER_UNIT_W or configured_unit == POWER_UNIT_AUTO:
            return value
        return value

    def _state_value(self, state: State | None) -> str | None:
        if not self._state_ok(state):
            return None
        return state.state

    def _state_ok(self, state: State | None) -> bool:
        return state is not None and state.state not in {STATE_UNKNOWN, STATE_UNAVAILABLE}

    def _is_stale(self, state: State | None, stale_after_s: float) -> bool:
        age = self._state_age_seconds(state)
        return age is None or age > stale_after_s

    def _state_age_seconds(self, state: State | None) -> float | None:
        if state is None:
            return None
        updated = state.last_updated
        now = dt_util.utcnow()
        if updated.tzinfo is not None:
            now = dt_util.now()
        return max(0.0, (now - updated).total_seconds())

    def _status(self, decision: ChargeDecision, grid_sensor_ok: bool) -> str:
        if not grid_sensor_ok:
            return "Fault"
        if not self._settings[CONF_ENABLED]:
            return "Disabled"
        if decision.allowed and decision.target_amps > 0:
            return "Charging allowed"
        if decision.emergency_stop:
            return "Breaker protection"
        return "Waiting"


def _parse_time(value: str) -> time:
    if not value:
        return time(0, 0)
    parts = value.split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _state_as_dict(state: State | None) -> dict[str, Any] | None:
    if state is None:
        return None
    return {
        "entity_id": state.entity_id,
        "state": state.state,
        "attributes": dict(state.attributes),
        "last_updated": state.last_updated.isoformat(),
    }
