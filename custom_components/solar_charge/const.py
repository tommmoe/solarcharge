"""Constants for Solar Charge."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "solar_charge"
VERSION = "1.0.1"
DEFAULT_NAME = "Solar Charge"
FRONTEND_PATH = f"/{DOMAIN}"
FRONTEND_CARD_FILENAME = "solar-charge-card.js"
FRONTEND_CARD_URL = f"{FRONTEND_PATH}/{FRONTEND_CARD_FILENAME}"

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SWITCH,
    Platform.SELECT,
    Platform.NUMBER,
]

MODE_OFF = "off"
MODE_FREE_HOURS_ONLY = "free_hours_only"
MODE_SOLAR_ONLY = "solar_only"
MODE_FREE_HOURS_OR_SOLAR = "free_hours_or_solar"
MODE_FORCE_CHARGE = "force_charge"
MODE_MANUAL = "manual"

MODES: tuple[str, ...] = (
    MODE_OFF,
    MODE_FREE_HOURS_ONLY,
    MODE_SOLAR_ONLY,
    MODE_FREE_HOURS_OR_SOLAR,
    MODE_FORCE_CHARGE,
    MODE_MANUAL,
)

MODE_NAMES: dict[str, str] = {
    MODE_OFF: "Off",
    MODE_FREE_HOURS_ONLY: "Free hours only",
    MODE_SOLAR_ONLY: "Solar only",
    MODE_FREE_HOURS_OR_SOLAR: "Free hours or solar",
    MODE_FORCE_CHARGE: "Force charge",
    MODE_MANUAL: "Manual",
}

CONF_NAME = "name"
CONF_MODE = "mode"
CONF_ENABLED = "enabled"
CONF_CONTROL_ENABLED = "control_enabled"

CONF_GRID_POWER_ENTITY = "grid_power_entity"
CONF_GRID_POWER_MULTIPLIER = "grid_power_multiplier"
CONF_GRID_IMPORT_POSITIVE = "grid_import_positive"

CONF_PV_POWER_ENTITIES = "pv_power_entities"
CONF_PV_POWER_MULTIPLIER = "pv_power_multiplier"

CONF_BATTERY_POWER_ENTITY = "battery_power_entity"
CONF_BATTERY_POWER_MULTIPLIER = "battery_power_multiplier"
CONF_BATTERY_CHARGING_POSITIVE = "battery_charging_positive"
CONF_BATTERY_SOC_ENTITY = "battery_soc_entity"
CONF_LOAD_POWER_ENTITY = "load_power_entity"

CONF_CHARGER_CURRENT_LIMIT_ENTITY = "charger_current_limit_entity"
CONF_CHARGER_CHARGE_CONTROL_ENTITY = "charger_charge_control_entity"
CONF_CHARGER_AVAILABILITY_ENTITY = "charger_availability_entity"
CONF_CHARGER_POWER_ENTITY = "charger_power_entity"
CONF_CHARGER_POWER_MULTIPLIER = "charger_power_multiplier"
CONF_CHARGER_POWER_UNIT = "charger_power_unit"
CONF_CHARGER_CURRENT_ENTITY = "charger_current_entity"
CONF_CHARGER_VOLTAGE_ENTITY = "charger_voltage_entity"
CONF_CHARGER_CURRENT_OFFERED_ENTITY = "charger_current_offered_entity"
CONF_CHARGER_STATUS_ENTITY = "charger_status_entity"

CONF_BREAKER_LIMIT_AMPS = "breaker_limit_amps"
CONF_SAFETY_MARGIN_AMPS = "safety_margin_amps"
CONF_VOLTAGE = "voltage"
CONF_GRID_BUFFER_WATTS = "grid_buffer_watts"
CONF_MIN_CHARGE_AMPS = "min_charge_amps"
CONF_MAX_CHARGE_AMPS = "max_charge_amps"
CONF_CURRENT_CHANGE_THRESHOLD_AMPS = "current_change_threshold_amps"
CONF_CONTROL_INTERVAL_SECONDS = "control_interval_seconds"
CONF_SENSOR_STALE_SECONDS = "sensor_stale_seconds"
CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS = "current_update_min_interval_seconds"

CONF_FREE_WINDOW_START = "free_window_start"
CONF_FREE_WINDOW_END = "free_window_end"
CONF_BATTERY_RESERVE_PCT = "battery_reserve_pct"
CONF_START_DELAY_SECONDS = "start_delay_seconds"
CONF_STOP_DELAY_SECONDS = "stop_delay_seconds"

DEFAULTS: dict[str, object] = {
    CONF_NAME: DEFAULT_NAME,
    CONF_MODE: MODE_FREE_HOURS_OR_SOLAR,
    CONF_ENABLED: True,
    CONF_CONTROL_ENABLED: False,
    CONF_GRID_POWER_MULTIPLIER: 1.0,
    CONF_GRID_IMPORT_POSITIVE: True,
    CONF_PV_POWER_ENTITIES: [],
    CONF_PV_POWER_MULTIPLIER: 1.0,
    CONF_BATTERY_POWER_MULTIPLIER: 1.0,
    CONF_BATTERY_CHARGING_POSITIVE: True,
    CONF_CHARGER_POWER_MULTIPLIER: 1.0,
    CONF_CHARGER_POWER_UNIT: "auto",
    CONF_BREAKER_LIMIT_AMPS: 50.0,
    CONF_SAFETY_MARGIN_AMPS: 5.0,
    CONF_VOLTAGE: 230.0,
    CONF_GRID_BUFFER_WATTS: 500.0,
    CONF_MIN_CHARGE_AMPS: 6,
    CONF_MAX_CHARGE_AMPS: 16,
    CONF_CURRENT_CHANGE_THRESHOLD_AMPS: 2,
    CONF_CONTROL_INTERVAL_SECONDS: 60,
    CONF_SENSOR_STALE_SECONDS: 120,
    CONF_CURRENT_UPDATE_MIN_INTERVAL_SECONDS: 60,
    CONF_FREE_WINDOW_START: "11:00",
    CONF_FREE_WINDOW_END: "14:00",
    CONF_BATTERY_RESERVE_PCT: None,
    CONF_START_DELAY_SECONDS: 0,
    CONF_STOP_DELAY_SECONDS: 0,
}

POWER_UNIT_AUTO = "auto"
POWER_UNIT_W = "W"
POWER_UNIT_KW = "kW"
POWER_UNITS = (POWER_UNIT_AUTO, POWER_UNIT_W, POWER_UNIT_KW)

SERVICE_FORCE_UPDATE = "force_update"
SERVICE_APPLY_NOW = "apply_now"
SERVICE_STOP_CHARGING = "stop_charging"
SERVICE_SET_MODE = "set_mode"

ATTR_ENTRY_ID = "entry_id"
ATTR_MODE = "mode"
