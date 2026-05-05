"""Options flow for Solar Charge."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_BATTERY_CHARGING_POSITIVE,
    CONF_BATTERY_POWER_ENTITY,
    CONF_BATTERY_POWER_MULTIPLIER,
    CONF_BATTERY_RESERVE_PCT,
    CONF_BATTERY_SOC_ENTITY,
    CONF_BREAKER_LIMIT_AMPS,
    CONF_CHARGER_AVAILABILITY_ENTITY,
    CONF_CHARGER_CHARGE_CONTROL_ENTITY,
    CONF_CHARGER_CURRENT_ENTITY,
    CONF_CHARGER_CURRENT_LIMIT_ENTITY,
    CONF_CHARGER_CURRENT_OFFERED_ENTITY,
    CONF_CHARGER_POWER_ENTITY,
    CONF_CHARGER_POWER_MULTIPLIER,
    CONF_CHARGER_POWER_UNIT,
    CONF_CHARGER_STATUS_ENTITY,
    CONF_CHARGER_VOLTAGE_ENTITY,
    CONF_CONTROL_ENABLED,
    CONF_CONTROL_INTERVAL_SECONDS,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
    CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS,
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
    CONF_PV_POWER_ENTITIES,
    CONF_PV_POWER_MULTIPLIER,
    CONF_SAFETY_MARGIN_AMPS,
    CONF_SENSOR_STALE_SECONDS,
    CONF_START_DELAY_SECONDS,
    CONF_STOP_DELAY_SECONDS,
    CONF_VOLTAGE,
    DEFAULTS,
    MODES,
    POWER_UNITS,
)


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle Solar Charge options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Manage integration options."""

        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        values = {**DEFAULTS, **self.config_entry.data, **self.config_entry.options}

        schema = vol.Schema(
            {
                vol.Required(CONF_ENABLED, default=values[CONF_ENABLED]): bool,
                vol.Required(
                    CONF_CONTROL_ENABLED,
                    default=values[CONF_CONTROL_ENABLED],
                ): bool,
                vol.Required(CONF_MODE, default=values[CONF_MODE]): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=list(MODES))
                ),
                vol.Required(
                    CONF_GRID_POWER_ENTITY,
                    default=values.get(CONF_GRID_POWER_ENTITY),
                ): _entity_selector("sensor"),
                vol.Required(
                    CONF_GRID_POWER_MULTIPLIER,
                    default=values[CONF_GRID_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_GRID_IMPORT_POSITIVE,
                    default=values[CONF_GRID_IMPORT_POSITIVE],
                ): bool,
                vol.Optional(
                    CONF_PV_POWER_ENTITIES,
                    default=values.get(CONF_PV_POWER_ENTITIES, []),
                ): _entity_selector("sensor", multiple=True),
                vol.Optional(
                    CONF_PV_POWER_MULTIPLIER,
                    default=values[CONF_PV_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Optional(
                    CONF_BATTERY_POWER_ENTITY,
                    default=values.get(CONF_BATTERY_POWER_ENTITY),
                ): _entity_selector("sensor"),
                vol.Optional(
                    CONF_BATTERY_POWER_MULTIPLIER,
                    default=values[CONF_BATTERY_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_BATTERY_CHARGING_POSITIVE,
                    default=values[CONF_BATTERY_CHARGING_POSITIVE],
                ): bool,
                vol.Optional(
                    CONF_BATTERY_SOC_ENTITY,
                    default=values.get(CONF_BATTERY_SOC_ENTITY),
                ): _entity_selector("sensor"),
                vol.Optional(
                    CONF_LOAD_POWER_ENTITY,
                    default=values.get(CONF_LOAD_POWER_ENTITY),
                ): _entity_selector("sensor"),
                vol.Required(
                    CONF_CHARGER_CURRENT_LIMIT_ENTITY,
                    default=values.get(CONF_CHARGER_CURRENT_LIMIT_ENTITY),
                ): _entity_selector("number"),
                vol.Required(
                    CONF_CHARGER_CHARGE_CONTROL_ENTITY,
                    default=values.get(CONF_CHARGER_CHARGE_CONTROL_ENTITY),
                ): _entity_selector("switch"),
                vol.Optional(
                    CONF_CHARGER_AVAILABILITY_ENTITY,
                    default=values.get(CONF_CHARGER_AVAILABILITY_ENTITY),
                ): _entity_selector("switch"),
                vol.Optional(
                    CONF_CHARGER_POWER_ENTITY,
                    default=values.get(CONF_CHARGER_POWER_ENTITY),
                ): _entity_selector("sensor"),
                vol.Required(
                    CONF_CHARGER_POWER_MULTIPLIER,
                    default=values[CONF_CHARGER_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_CHARGER_POWER_UNIT,
                    default=values[CONF_CHARGER_POWER_UNIT],
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=list(POWER_UNITS))
                ),
                vol.Optional(
                    CONF_CHARGER_CURRENT_ENTITY,
                    default=values.get(CONF_CHARGER_CURRENT_ENTITY),
                ): _entity_selector("sensor"),
                vol.Optional(
                    CONF_CHARGER_VOLTAGE_ENTITY,
                    default=values.get(CONF_CHARGER_VOLTAGE_ENTITY),
                ): _entity_selector("sensor"),
                vol.Optional(
                    CONF_CHARGER_CURRENT_OFFERED_ENTITY,
                    default=values.get(CONF_CHARGER_CURRENT_OFFERED_ENTITY),
                ): _entity_selector("sensor"),
                vol.Optional(
                    CONF_CHARGER_STATUS_ENTITY,
                    default=values.get(CONF_CHARGER_STATUS_ENTITY),
                ): _entity_selector("sensor"),
                vol.Required(
                    CONF_BREAKER_LIMIT_AMPS,
                    default=values[CONF_BREAKER_LIMIT_AMPS],
                ): _number_selector(1, 200, 0.5, "A"),
                vol.Required(
                    CONF_SAFETY_MARGIN_AMPS,
                    default=values[CONF_SAFETY_MARGIN_AMPS],
                ): _number_selector(0, 100, 0.5, "A"),
                vol.Required(CONF_VOLTAGE, default=values[CONF_VOLTAGE]): _number_selector(
                    100, 280, 1, "V"
                ),
                vol.Required(
                    CONF_GRID_BUFFER_WATTS,
                    default=values[CONF_GRID_BUFFER_WATTS],
                ): _number_selector(0, 10000, 50, "W"),
                vol.Required(
                    CONF_MIN_CHARGE_AMPS,
                    default=values[CONF_MIN_CHARGE_AMPS],
                ): _number_selector(0, 80, 1, "A"),
                vol.Required(
                    CONF_MAX_CHARGE_AMPS,
                    default=values[CONF_MAX_CHARGE_AMPS],
                ): _number_selector(1, 80, 1, "A"),
                vol.Required(
                    CONF_FREE_WINDOW_START,
                    default=values[CONF_FREE_WINDOW_START],
                ): selector.TimeSelector(),
                vol.Required(
                    CONF_FREE_WINDOW_END,
                    default=values[CONF_FREE_WINDOW_END],
                ): selector.TimeSelector(),
                vol.Optional(
                    CONF_BATTERY_RESERVE_PCT,
                    default=values.get(CONF_BATTERY_RESERVE_PCT),
                ): _number_selector(0, 100, 1, "%"),
                vol.Required(
                    CONF_START_DELAY_SECONDS,
                    default=values[CONF_START_DELAY_SECONDS],
                ): _number_selector(0, 3600, 5, "s"),
                vol.Required(
                    CONF_STOP_DELAY_SECONDS,
                    default=values[CONF_STOP_DELAY_SECONDS],
                ): _number_selector(0, 3600, 5, "s"),
                vol.Required(
                    CONF_CONTROL_INTERVAL_SECONDS,
                    default=values[CONF_CONTROL_INTERVAL_SECONDS],
                ): _number_selector(10, 3600, 5, "s"),
                vol.Required(
                    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
                    default=values[CONF_CURRENT_CHANGE_THRESHOLD_AMPS],
                ): _number_selector(1, 20, 1, "A"),
                vol.Required(
                    CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS,
                    default=values[CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS],
                ): _number_selector(10, 3600, 5, "s"),
                vol.Required(
                    CONF_SENSOR_STALE_SECONDS,
                    default=values[CONF_SENSOR_STALE_SECONDS],
                ): _number_selector(10, 3600, 5, "s"),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)


def _entity_selector(domain: str, multiple: bool = False) -> selector.EntitySelector:
    return selector.EntitySelector(
        selector.EntitySelectorConfig(domain=domain, multiple=multiple)
    )


def _number_selector(
    minimum: float,
    maximum: float,
    step: float,
    unit: str | None = None,
) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=minimum,
            max=maximum,
            step=step,
            mode=selector.NumberSelectorMode.BOX,
            unit_of_measurement=unit,
        )
    )

