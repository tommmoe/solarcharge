"""Binary sensors for Solar Charge."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .coordinator import SolarChargeCoordinator
from .const import DOMAIN


@dataclass(frozen=True, kw_only=True)
class SolarChargeBinarySensorDescription(BinarySensorEntityDescription):
    """Description for a Solar Charge binary sensor."""

    value_fn: Callable[[dict[str, Any]], bool | None]


BINARY_SENSORS: tuple[SolarChargeBinarySensorDescription, ...] = (
    SolarChargeBinarySensorDescription(
        key="allowed_to_charge",
        translation_key="allowed_to_charge",
        value_fn=lambda data: data.get("allowed_to_charge"),
    ),
    SolarChargeBinarySensorDescription(
        key="in_free_window",
        translation_key="in_free_window",
        value_fn=lambda data: data.get("in_free_window"),
    ),
    SolarChargeBinarySensorDescription(
        key="grid_sensor_ok",
        translation_key="grid_sensor_ok",
        value_fn=lambda data: data.get("grid_sensor_ok", False),
    ),
    SolarChargeBinarySensorDescription(
        key="charger_sensor_ok",
        translation_key="charger_sensor_ok",
        value_fn=lambda data: data.get("charger_sensor_ok", False),
    ),
    SolarChargeBinarySensorDescription(
        key="breaker_limit_ok",
        translation_key="breaker_limit_ok",
        value_fn=lambda data: data.get("breaker_limit_ok", False),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solar Charge binary sensors."""

    coordinator: SolarChargeCoordinator = entry.runtime_data
    async_add_entities(
        SolarChargeBinarySensor(coordinator, entry, description)
        for description in BINARY_SENSORS
    )


class SolarChargeBinarySensor(
    CoordinatorEntity[SolarChargeCoordinator],
    BinarySensorEntity,
):
    """Solar Charge binary sensor."""

    entity_description: SolarChargeBinarySensorDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SolarChargeCoordinator,
        entry: ConfigEntry,
        description: SolarChargeBinarySensorDescription,
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
    def is_on(self) -> bool | None:
        """Return the binary sensor state."""

        if not self.coordinator.data:
            return None
        return self.entity_description.value_fn(self.coordinator.data)
