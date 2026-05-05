"""Switches for Solar Charge."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_CONTROL_ENABLED, CONF_ENABLED, DOMAIN
from .coordinator import SolarChargeCoordinator


@dataclass(frozen=True, kw_only=True)
class SolarChargeSwitchDescription(SwitchEntityDescription):
    """Description for a Solar Charge switch."""

    config_key: str


SWITCHES: tuple[SolarChargeSwitchDescription, ...] = (
    SolarChargeSwitchDescription(
        key="enabled",
        translation_key="enabled",
        config_key=CONF_ENABLED,
    ),
    SolarChargeSwitchDescription(
        key="control_enabled",
        translation_key="control_enabled",
        config_key=CONF_CONTROL_ENABLED,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge switches."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities(
        SolarChargeSwitch(coordinator, entry, description) for description in SWITCHES
    )


class SolarChargeSwitch(CoordinatorEntity[SolarChargeCoordinator], SwitchEntity):
    """Solar Charge switch."""

    entity_description: SolarChargeSwitchDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SolarChargeCoordinator,
        entry: ConfigEntry,
        description: SolarChargeSwitchDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": coordinator.title,
            "manufacturer": "Solar Charge",
        }

    @property
    def is_on(self) -> bool:
        """Return whether the switch is on."""

        return bool(self.coordinator.settings[self.entity_description.config_key])

    async def async_turn_on(self, **kwargs: object) -> None:
        """Turn the switch on."""

        await self.coordinator.async_set_config_value(
            self.entity_description.config_key,
            True,
        )

    async def async_turn_off(self, **kwargs: object) -> None:
        """Turn the switch off."""

        await self.coordinator.async_set_config_value(
            self.entity_description.config_key,
            False,
        )

