"""Select entities for Solar Charge."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_platform
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    ATTR_MINUTES,
    CONF_MODE,
    DOMAIN,
    MODE_NAMES,
    MODES,
    SERVICE_CANCEL_SNOOZE,
    SERVICE_SNOOZE,
)
from .coordinator import SolarChargeCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge selects."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities([SolarChargeModeSelect(coordinator, entry)])

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        SERVICE_SNOOZE,
        {
            vol.Optional(ATTR_MINUTES, default=5): vol.All(
                vol.Coerce(float), vol.Range(min=1, max=1440)
            )
        },
        "async_snooze",
    )
    platform.async_register_entity_service(SERVICE_CANCEL_SNOOZE, None, "async_cancel_snooze")


class SolarChargeModeSelect(CoordinatorEntity[SolarChargeCoordinator], SelectEntity):
    """Mode selector."""

    _attr_has_entity_name = True
    _attr_translation_key = "mode"

    def __init__(self, coordinator: SolarChargeCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_mode"
        self._attr_options = [MODE_NAMES[mode] for mode in MODES]
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": coordinator.title,
            "manufacturer": "Solar Charge",
        }

    @property
    def current_option(self) -> str:
        """Return current selected mode."""

        return MODE_NAMES[str(self.coordinator.settings[CONF_MODE])]

    async def async_select_option(self, option: str) -> None:
        """Set mode."""

        reverse = {name: mode for mode, name in MODE_NAMES.items()}
        await self.coordinator.async_set_config_value(CONF_MODE, reverse[option])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose the active snooze so dashboards can show a countdown."""

        until = self.coordinator.snooze_until
        previous = self.coordinator.snooze_previous_mode
        return {
            "snooze_until": until.isoformat() if until else None,
            "snooze_previous_mode": MODE_NAMES.get(previous) if previous else None,
        }

    async def async_snooze(self, minutes: float) -> None:
        """Turn charging off for a while, then restore the current mode."""

        await self.coordinator.async_snooze(minutes)

    async def async_cancel_snooze(self) -> None:
        """End the snooze now and restore the previous mode."""

        await self.coordinator.async_end_snooze()
