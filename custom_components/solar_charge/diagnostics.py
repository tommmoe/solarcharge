"""Diagnostics for Solar Charge."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""

    coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)

    diagnostics: dict[str, Any] = {
        "entry": {
            "entry_id": entry.entry_id,
            "title": entry.title,
            "data": dict(entry.data),
            "options": dict(entry.options),
        }
    }

    if coordinator is None:
        diagnostics["coordinator"] = None
        return diagnostics

    diagnostics["coordinator"] = {
        "latest_raw_states": coordinator.latest_raw_states,
        "latest_converted_values": coordinator.latest_converted_values,
        "latest_decision": (coordinator.data or {}).get("decision_dict"),
        "last_control_action": coordinator.controller.last_action,
        "last_error": coordinator.last_error,
        "sensor_ages": coordinator.sensor_ages,
    }

    return diagnostics

