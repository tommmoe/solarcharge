"""Sensors for Solar Charge."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfElectricCurrent, UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .coordinator import SolarChargeCoordinator
from .const import DOMAIN


@dataclass(frozen=True, kw_only=True)
class SolarChargeSensorDescription(SensorEntityDescription):
    """Description for a Solar Charge sensor."""

    value_fn: Callable[[dict[str, Any]], Any]


SENSORS: tuple[SolarChargeSensorDescription, ...] = (
    SolarChargeSensorDescription(
        key="grid_import",
        translation_key="grid_import",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("grid_power_w"),
    ),
    SolarChargeSensorDescription(
        key="charger_power",
        translation_key="charger_power",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("charger_power_w"),
    ),
    SolarChargeSensorDescription(
        key="base_grid_import",
        translation_key="base_grid_import",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("base_grid_import_w"),
    ),
    SolarChargeSensorDescription(
        key="safe_import_limit",
        translation_key="safe_import_limit",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("safe_limit_w"),
    ),
    SolarChargeSensorDescription(
        key="spare_capacity",
        translation_key="spare_capacity",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("spare_capacity_w"),
    ),
    SolarChargeSensorDescription(
        key="target_amps",
        translation_key="target_amps",
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
        device_class=SensorDeviceClass.CURRENT,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("target_amps"),
    ),
    SolarChargeSensorDescription(
        key="actual_current",
        translation_key="actual_current",
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
        device_class=SensorDeviceClass.CURRENT,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("charger_current_a"),
    ),
    SolarChargeSensorDescription(
        key="offered_current",
        translation_key="offered_current",
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
        device_class=SensorDeviceClass.CURRENT,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("charger_offered_current_a"),
    ),
    SolarChargeSensorDescription(
        key="pv_power",
        translation_key="pv_power",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.get("pv_power_w"),
    ),
    SolarChargeSensorDescription(
        key="battery_soc",
        translation_key="battery_soc",
        native_unit_of_measurement="%",
        value_fn=lambda data: data.get("battery_soc_pct"),
    ),
    SolarChargeSensorDescription(
        key="reason",
        translation_key="reason",
        value_fn=lambda data: data.get("reason"),
    ),
    SolarChargeSensorDescription(
        key="status",
        translation_key="status",
        value_fn=lambda data: data.get("status"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge sensors."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities(
        SolarChargeSensor(coordinator, entry, description) for description in SENSORS
    )


class SolarChargeSensor(CoordinatorEntity[SolarChargeCoordinator], SensorEntity):
    """Solar Charge sensor."""

    entity_description: SolarChargeSensorDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SolarChargeCoordinator,
        entry: ConfigEntry,
        description: SolarChargeSensorDescription,
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
    def native_value(self) -> Any:
        """Return the current value."""

        if not self.coordinator.data:
            return None
        return self.entity_description.value_fn(self.coordinator.data)

