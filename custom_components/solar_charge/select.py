"""Select entities for Solar Charge."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_MODE, DOMAIN, MODE_NAMES, MODES
from .coordinator import SolarChargeCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge selects."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities([SolarChargeModeSelect(coordinator, entry)])


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

