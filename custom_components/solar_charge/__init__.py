"""Solar Charge integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_ENTRY_ID,
    ATTR_MODE,
    DOMAIN,
    MODES,
    PLATFORMS,
    SERVICE_APPLY_NOW,
    SERVICE_FORCE_UPDATE,
    SERVICE_SET_MODE,
    SERVICE_STOP_CHARGING,
)
from .coordinator import SolarChargeCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up integration-wide services."""

    hass.data.setdefault(DOMAIN, {})

    if hass.services.has_service(DOMAIN, SERVICE_FORCE_UPDATE):
        return True

    async def _matching_coordinators(call: ServiceCall) -> list[SolarChargeCoordinator]:
        entry_id = call.data.get(ATTR_ENTRY_ID)
        coordinators = hass.data.get(DOMAIN, {})

        if entry_id:
            coordinator = coordinators.get(entry_id)
            if coordinator is None:
                raise HomeAssistantError(f"Unknown Solar Charge entry: {entry_id}")
            return [coordinator]

        return list(coordinators.values())

    async def _handle_force_update(call: ServiceCall) -> None:
        for coordinator in await _matching_coordinators(call):
            await coordinator.async_request_refresh()

    async def _handle_apply_now(call: ServiceCall) -> None:
        for coordinator in await _matching_coordinators(call):
            await coordinator.async_request_refresh()
            await coordinator.controller.async_apply_decision(force=True)

    async def _handle_stop_charging(call: ServiceCall) -> None:
        for coordinator in await _matching_coordinators(call):
            await coordinator.controller.async_stop_charging(reason="Stop service called")

    async def _handle_set_mode(call: ServiceCall) -> None:
        mode = call.data[ATTR_MODE]
        for coordinator in await _matching_coordinators(call):
            await coordinator.async_set_config_value(ATTR_MODE, mode)

    entry_id_schema = vol.Optional(ATTR_ENTRY_ID)

    hass.services.async_register(
        DOMAIN,
        SERVICE_FORCE_UPDATE,
        _handle_force_update,
        schema=vol.Schema({entry_id_schema: cv.string}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_APPLY_NOW,
        _handle_apply_now,
        schema=vol.Schema({entry_id_schema: cv.string}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_CHARGING,
        _handle_stop_charging,
        schema=vol.Schema({entry_id_schema: cv.string}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_MODE,
        _handle_set_mode,
        schema=vol.Schema(
            {
                entry_id_schema: cv.string,
                vol.Required(ATTR_MODE): vol.In(MODES),
            }
        ),
    )

    return True


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Set up Solar Charge from a config entry."""

    coordinator = SolarChargeCoordinator(hass, entry)
    entry.runtime_data = coordinator
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    _LOGGER.debug("Solar Charge entry %s set up", entry.entry_id)

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Unload a config entry."""

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unload_ok


async def _async_update_listener(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> None:
    """Refresh coordinator after options change."""

    if coordinator := hass.data.get(DOMAIN, {}).get(entry.entry_id):
        coordinator.refresh_settings()
        await coordinator.async_request_refresh()
