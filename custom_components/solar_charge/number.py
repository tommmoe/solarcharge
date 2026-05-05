"""Number entities for Solar Charge."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.number import NumberEntity, NumberEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    UnitOfElectricCurrent,
    UnitOfElectricPotential,
    UnitOfPower,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CONF_BREAKER_LIMIT_AMPS,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
    CONF_GRID_BUFFER_WATTS,
    CONF_MAX_CHARGE_AMPS,
    CONF_MIN_CHARGE_AMPS,
    CONF_SAFETY_MARGIN_AMPS,
    CONF_VOLTAGE,
    DOMAIN,
)
from .coordinator import SolarChargeCoordinator


@dataclass(frozen=True, kw_only=True)
class SolarChargeNumberDescription(NumberEntityDescription):
    """Description for a Solar Charge number."""

    config_key: str


NUMBERS: tuple[SolarChargeNumberDescription, ...] = (
    SolarChargeNumberDescription(
        key="breaker_limit_amps",
        translation_key="breaker_limit_amps",
        config_key=CONF_BREAKER_LIMIT_AMPS,
        native_min_value=1,
        native_max_value=200,
        native_step=0.5,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
    ),
    SolarChargeNumberDescription(
        key="safety_margin_amps",
        translation_key="safety_margin_amps",
        config_key=CONF_SAFETY_MARGIN_AMPS,
        native_min_value=0,
        native_max_value=100,
        native_step=0.5,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
    ),
    SolarChargeNumberDescription(
        key="grid_buffer_watts",
        translation_key="grid_buffer_watts",
        config_key=CONF_GRID_BUFFER_WATTS,
        native_min_value=0,
        native_max_value=10000,
        native_step=50,
        native_unit_of_measurement=UnitOfPower.WATT,
    ),
    SolarChargeNumberDescription(
        key="min_charge_amps",
        translation_key="min_charge_amps",
        config_key=CONF_MIN_CHARGE_AMPS,
        native_min_value=0,
        native_max_value=80,
        native_step=1,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
    ),
    SolarChargeNumberDescription(
        key="max_charge_amps",
        translation_key="max_charge_amps",
        config_key=CONF_MAX_CHARGE_AMPS,
        native_min_value=1,
        native_max_value=80,
        native_step=1,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
    ),
    SolarChargeNumberDescription(
        key="voltage",
        translation_key="voltage",
        config_key=CONF_VOLTAGE,
        native_min_value=100,
        native_max_value=280,
        native_step=1,
        native_unit_of_measurement=UnitOfElectricPotential.VOLT,
    ),
    SolarChargeNumberDescription(
        key="current_change_threshold_amps",
        translation_key="current_change_threshold_amps",
        config_key=CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
        native_min_value=1,
        native_max_value=20,
        native_step=1,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge number entities."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities(
        SolarChargeNumber(coordinator, entry, description) for description in NUMBERS
    )


class SolarChargeNumber(CoordinatorEntity[SolarChargeCoordinator], NumberEntity):
    """Solar Charge number entity."""

    entity_description: SolarChargeNumberDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SolarChargeCoordinator,
        entry: ConfigEntry,
        description: SolarChargeNumberDescription,
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
    def native_value(self) -> float:
        """Return current setting value."""

        return float(self.coordinator.settings[self.entity_description.config_key])

    async def async_set_native_value(self, value: float) -> None:
        """Set setting value."""

        await self.coordinator.async_set_config_value(
            self.entity_description.config_key,
            value,
        )
