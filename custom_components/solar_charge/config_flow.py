"""Config flow for Solar Charge."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_BATTERY_CHARGING_POSITIVE,
    CONF_BATTERY_POWER_ENTITY,
    CONF_BATTERY_POWER_MULTIPLIER,
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
    CONF_CONTROL_INTERVAL_SECONDS,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
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
    CONF_NAME,
    CONF_PV_POWER_ENTITIES,
    CONF_PV_POWER_MULTIPLIER,
    CONF_SAFETY_MARGIN_AMPS,
    CONF_SENSOR_STALE_SECONDS,
    CONF_VOLTAGE,
    DEFAULTS,
    DEFAULT_NAME,
    DOMAIN,
    MODE_FREE_HOURS_OR_SOLAR,
    MODE_NAMES,
    MODES,
    POWER_UNITS,
)
from .options_flow import OptionsFlowHandler


class SolarChargeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Solar Charge."""

    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> OptionsFlowHandler:
        """Create the options flow."""

        return OptionsFlowHandler(config_entry)

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Collect name and mode."""

        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_site()

        schema = vol.Schema(
            {
                vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                vol.Required(CONF_MODE, default=MODE_FREE_HOURS_OR_SOLAR): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            {"value": mode, "label": MODE_NAMES[mode]}
                            for mode in MODES
                        ]
                    )
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    async def async_step_site(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Collect site and inverter entities."""

        if user_input is not None:
            self._data.update(_drop_empty(user_input))
            return await self.async_step_charger()

        schema = vol.Schema(
            {
                vol.Required(CONF_GRID_POWER_ENTITY): _entity_selector("sensor"),
                vol.Required(
                    CONF_GRID_POWER_MULTIPLIER,
                    default=DEFAULTS[CONF_GRID_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_GRID_IMPORT_POSITIVE,
                    default=DEFAULTS[CONF_GRID_IMPORT_POSITIVE],
                ): bool,
                vol.Optional(CONF_PV_POWER_ENTITIES, default=[]): _entity_selector(
                    "sensor", multiple=True
                ),
                vol.Optional(
                    CONF_PV_POWER_MULTIPLIER,
                    default=DEFAULTS[CONF_PV_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Optional(CONF_BATTERY_POWER_ENTITY): _entity_selector("sensor"),
                vol.Optional(
                    CONF_BATTERY_POWER_MULTIPLIER,
                    default=DEFAULTS[CONF_BATTERY_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_BATTERY_CHARGING_POSITIVE,
                    default=DEFAULTS[CONF_BATTERY_CHARGING_POSITIVE],
                ): bool,
                vol.Optional(CONF_BATTERY_SOC_ENTITY): _entity_selector("sensor"),
                vol.Optional(CONF_LOAD_POWER_ENTITY): _entity_selector("sensor"),
            }
        )
        return self.async_show_form(step_id="site", data_schema=schema)

    async def async_step_charger(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Collect charger entities."""

        if user_input is not None:
            self._data.update(_drop_empty(user_input))
            return await self.async_step_safety()

        schema = vol.Schema(
            {
                vol.Required(CONF_CHARGER_CURRENT_LIMIT_ENTITY): _entity_selector("number"),
                vol.Required(CONF_CHARGER_CHARGE_CONTROL_ENTITY): _entity_selector("switch"),
                vol.Optional(CONF_CHARGER_AVAILABILITY_ENTITY): _entity_selector("switch"),
                vol.Optional(CONF_CHARGER_POWER_ENTITY): _entity_selector("sensor"),
                vol.Required(
                    CONF_CHARGER_POWER_MULTIPLIER,
                    default=DEFAULTS[CONF_CHARGER_POWER_MULTIPLIER],
                ): _number_selector(-1000, 1000, 0.01),
                vol.Required(
                    CONF_CHARGER_POWER_UNIT,
                    default=DEFAULTS[CONF_CHARGER_POWER_UNIT],
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=list(POWER_UNITS))
                ),
                vol.Optional(CONF_CHARGER_CURRENT_ENTITY): _entity_selector("sensor"),
                vol.Optional(CONF_CHARGER_VOLTAGE_ENTITY): _entity_selector("sensor"),
                vol.Optional(CONF_CHARGER_CURRENT_OFFERED_ENTITY): _entity_selector("sensor"),
                vol.Optional(CONF_CHARGER_STATUS_ENTITY): _entity_selector("sensor"),
            }
        )
        return self.async_show_form(step_id="charger", data_schema=schema)

    async def async_step_safety(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Collect safety settings."""

        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_window()

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_BREAKER_LIMIT_AMPS,
                    default=DEFAULTS[CONF_BREAKER_LIMIT_AMPS],
                ): _number_selector(1, 200, 0.5, "A"),
                vol.Required(
                    CONF_SAFETY_MARGIN_AMPS,
                    default=DEFAULTS[CONF_SAFETY_MARGIN_AMPS],
                ): _number_selector(0, 100, 0.5, "A"),
                vol.Required(CONF_VOLTAGE, default=DEFAULTS[CONF_VOLTAGE]): _number_selector(
                    100, 280, 1, "V"
                ),
                vol.Required(
                    CONF_GRID_BUFFER_WATTS,
                    default=DEFAULTS[CONF_GRID_BUFFER_WATTS],
                ): _number_selector(0, 10000, 50, "W"),
                vol.Required(
                    CONF_MIN_CHARGE_AMPS,
                    default=DEFAULTS[CONF_MIN_CHARGE_AMPS],
                ): _number_selector(0, 80, 1, "A"),
                vol.Required(
                    CONF_MAX_CHARGE_AMPS,
                    default=DEFAULTS[CONF_MAX_CHARGE_AMPS],
                ): _number_selector(1, 80, 1, "A"),
                vol.Required(
                    CONF_CURRENT_CHANGE_THRESHOLD_AMPS,
                    default=DEFAULTS[CONF_CURRENT_CHANGE_THRESHOLD_AMPS],
                ): _number_selector(1, 20, 1, "A"),
                vol.Required(
                    CONF_CONTROL_INTERVAL_SECONDS,
                    default=DEFAULTS[CONF_CONTROL_INTERVAL_SECONDS],
                ): _number_selector(10, 3600, 5, "s"),
                vol.Required(
                    CONF_SENSOR_STALE_SECONDS,
                    default=DEFAULTS[CONF_SENSOR_STALE_SECONDS],
                ): _number_selector(10, 3600, 5, "s"),
            }
        )
        return self.async_show_form(step_id="safety", data_schema=schema)

    async def async_step_window(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        """Collect free charging window."""

        if user_input is not None:
            self._data.update(user_input)
            return self.async_create_entry(
                title=self._data.get(CONF_NAME, DEFAULT_NAME),
                data=self._data,
            )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_FREE_WINDOW_START,
                    default=DEFAULTS[CONF_FREE_WINDOW_START],
                ): selector.TimeSelector(),
                vol.Required(
                    CONF_FREE_WINDOW_END,
                    default=DEFAULTS[CONF_FREE_WINDOW_END],
                ): selector.TimeSelector(),
            }
        )
        return self.async_show_form(step_id="window", data_schema=schema)


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


def _drop_empty(data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in data.items()
        if value is not None and value != "" and value != []
    }

