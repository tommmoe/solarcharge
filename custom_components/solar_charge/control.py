"""Charger control logic for Solar Charge."""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any

from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .calculations import ChargeDecision
from .const import (
    CONF_CHARGER_CHARGE_CONTROL_ENTITY,
    CONF_CHARGER_CURRENT_LIMIT_ENTITY,
    CONF_CONTROL_ENABLED,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
    CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS,
    CONF_ENABLED,
)

_LOGGER = logging.getLogger(__name__)


class ChargeController:
    """Apply charge decisions to Home Assistant charger entities."""

    def __init__(self, hass: HomeAssistant, coordinator: Any) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.last_action: dict[str, Any] | None = None
        self._last_current_update: datetime | None = None
        self._last_written_amps: int | None = None

    async def async_apply_decision(
        self,
        force: bool = False,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Apply the latest decision to the charger when control is enabled."""

        data = data or self.coordinator.data or {}
        settings = self.coordinator.settings
        decision: ChargeDecision | None = data.get("decision")

        if decision is None:
            self._record("No decision available")
            return

        if not settings[CONF_ENABLED]:
            self._record("Integration disabled; no charger writes")
            return

        if not settings[CONF_CONTROL_ENABLED]:
            self._record("Control disabled; no charger writes")
            return

        if not data.get("grid_sensor_ok", False):
            _LOGGER.debug("Fail-safe: grid sensor stale or unavailable, stopping charger")
            await self.async_stop_charging(
                reason="Fail-safe: grid sensor stale or unavailable",
                respect_control_enabled=False,
            )
            return

        if decision.emergency_stop:
            _LOGGER.debug(
                "Grid import exceeds safe limit; target=%sA", decision.target_amps
            )

        if not decision.allowed or decision.target_amps <= 0:
            await self.async_stop_charging(
                reason=decision.reason,
                respect_control_enabled=False,
            )
            return

        # Check if car is connected before attempting to enable charging
        charger_status = data.get("charger_status")
        if charger_status and not self._is_car_connected(charger_status):
            self._record(f"Car not connected (status: {charger_status})")
            return

        if not await self._set_current_if_needed(decision, force):
            return
        await self._turn_charge_control_on()

    async def async_stop_charging(
        self,
        reason: str,
        respect_control_enabled: bool = True,
    ) -> None:
        """Turn off charge control when permitted."""

        settings = self.coordinator.settings
        if respect_control_enabled and not settings[CONF_CONTROL_ENABLED]:
            self._record(f"{reason}; control disabled so no charger write")
            return

        entity_id = settings.get(CONF_CHARGER_CHARGE_CONTROL_ENTITY)
        if not entity_id:
            self._record(f"{reason}; charge control entity missing")
            return

        state = self.hass.states.get(entity_id)
        if state is None:
            self._record(f"{reason}; charge control entity unavailable")
            return

        if state is not None and state.state == STATE_OFF:
            self._record(f"{reason}; charge control already off")
            return

        if state is not None and state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
            self._record(f"{reason}; charge control unavailable")
            return

        await self.hass.services.async_call(
            "switch",
            "turn_off",
            {"entity_id": entity_id},
            blocking=True,
        )
        self._record(reason, service="switch.turn_off", entity_id=entity_id)
        _LOGGER.debug("Turned charge control off: %s", reason)

    async def _set_current_if_needed(
        self,
        decision: ChargeDecision,
        force: bool,
    ) -> bool:
        settings = self.coordinator.settings
        entity_id = settings.get(CONF_CHARGER_CURRENT_LIMIT_ENTITY)
        if not entity_id:
            self.coordinator.last_error = "Current limit entity missing"
            self._record("Current limit entity missing")
            return False

        state = self.hass.states.get(entity_id)
        current_limit = _float_state(state)
        if current_limit is None:
            self.coordinator.last_error = "Current limit entity unavailable"
            self._record("Current limit entity unavailable")
            return False

        target_amps = int(decision.target_amps)
        diff = abs(target_amps - current_limit)
        threshold = float(settings[CONF_CURRENT_CHANGE_THRESHOLD_AMPS])
        emergency_down = decision.emergency_stop and target_amps < current_limit

        if not force and not emergency_down and diff < threshold:
            self._record(
                f"Current unchanged; diff {diff:.1f}A below threshold {threshold:.1f}A"
            )
            return True

        if not force and not emergency_down and not self._current_update_due():
            self._record("Current unchanged; rate limit active")
            return True

        if self._last_written_amps == target_amps and diff < 0.5:
            self._record("Current unchanged; target already written")
            return True

        await self.hass.services.async_call(
            "number",
            "set_value",
            {
                "entity_id": entity_id,
                "value": target_amps,
            },
            blocking=True,
        )
        self._last_current_update = dt_util.utcnow()
        self._last_written_amps = target_amps
        self._record(
            f"Set charger max current {current_limit:g}A -> {target_amps}A",
            service="number.set_value",
            entity_id=entity_id,
            value=target_amps,
        )
        _LOGGER.debug("Set charger max current %sA -> %sA", current_limit, target_amps)
        return True

    async def _turn_charge_control_on(self) -> None:
        entity_id = self.coordinator.settings.get(CONF_CHARGER_CHARGE_CONTROL_ENTITY)
        if not entity_id:
            self.coordinator.last_error = "Charge control entity missing"
            self._record("Charge control entity missing")
            return

        state = self.hass.states.get(entity_id)
        if state is None:
            self.coordinator.last_error = "Charge control entity unavailable"
            self._record("Charge control entity unavailable")
            return

        if state is not None and state.state == STATE_ON:
            self._record("Charge control already on")
            return

        if state is not None and state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
            self.coordinator.last_error = "Charge control entity unavailable"
            self._record("Charge control entity unavailable")
            return

        await self.hass.services.async_call(
            "switch",
            "turn_on",
            {"entity_id": entity_id},
            blocking=True,
        )
        self._record(
            "Turned charge control on",
            service="switch.turn_on",
            entity_id=entity_id,
        )
        _LOGGER.debug("Turned charge control on")

    def _current_update_due(self) -> bool:
        if self._last_current_update is None:
            return True
        interval = float(
            self.coordinator.settings[CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS]
        )
        elapsed = (dt_util.utcnow() - self._last_current_update).total_seconds()
        return elapsed >= interval

    def _is_car_connected(self, charger_status: str) -> bool:
        """Check if charger status indicates a car is connected.
        
        For OCPP chargers:
        - "Available" = no car connected
        - "Preparing", "Charging", "SuspendedEV", "SuspendedEVSE", "Finishing" = car connected
        
        Also handles common non-OCPP status values.
        """
        if not charger_status:
            # If no status available, assume car might be connected to avoid beeping
            return True
        
        status_lower = str(charger_status).lower()
        
        # OCPP status indicating NO car connected
        if status_lower == "available":
            return False
        
        # Common status values indicating car is NOT connected
        disconnected_states = {
            "unavailable",
            "disconnected",
            "not connected",
            "idle",
            "ready",
        }
        if status_lower in disconnected_states:
            return False
        
        # All other statuses likely indicate a car is connected
        # (Preparing, Charging, SuspendedEV, SuspendedEVSE, Finishing, etc.)
        return True

    def _record(self, message: str, **extra: Any) -> None:
        self.last_action = {
            "time": dt_util.utcnow().isoformat(),
            "message": message,
            **extra,
        }


def _float_state(state: Any) -> float | None:
    if state is None or state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
        return None
    try:
        return float(state.state)
    except (TypeError, ValueError):
        return None
