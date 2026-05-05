# Solar Charge

Solar Charge is a Home Assistant custom integration for safely managing single-phase EV charging from existing Home Assistant entities.

It calculates an EV charger current limit from live grid import/export, charger load, optional solar and battery sensors, and a configured free/cheap charging window. It is designed for setups such as a Deye/Sunsynk inverter exposed through Home Assistant and an OCPP charger exposed through Home Assistant.

## What It Does

- Reads existing Home Assistant entities only.
- Calculates safe target EV charging amps.
- Subtracts current EV load from measured grid import before calculating spare capacity, preventing charge-current feedback loops.
- Exposes diagnostic sensors for safe limit, base grid import, spare capacity, target amps, and reason.
- Exposes an allowed-to-charge binary sensor.
- Provides a control-enabled switch, default off.
- Writes to charger entities only when control is explicitly enabled.
- Fails safe when required sensors are unavailable, unknown, or stale.

## What It Does Not Do

- It does not implement native OCPP.
- It does not implement native Deye/Sunsynk Modbus.
- It does not replace electrical protection hardware.
- It is not a certified protection device.

## Safety Disclaimer

This integration is a software assistant only. It is not a certified electrical protection device. Breakers, RCDs, wiring, charger settings, and inverter settings must be correctly installed and configured by a qualified electrician.

## Example Hardware Profile

- Deye SUN-10K-SG02LP1-AU-AM3 single-phase hybrid inverter
- Elfin RS485-to-TCP gateway
- ZJ Beny / EVB BCP-A2N-P OCPP charger
- Single-phase EV charging
- C50 breaker with 45 A effective configured import limit

## Required Entities

Site/inverter:

- Grid import/export power sensor

Charger:

- Charger maximum current `number` entity
- Charger charge control `switch` entity

Recommended optional entities:

- PV power sensors
- Battery SOC sensor
- Battery power sensor
- Load/house power sensor
- Charger active import power sensor
- Charger current, voltage, offered current, and status sensors
- Charger availability switch

## Example Entity Mapping

Deye/Sunsynk:

- Grid: `sensor.deye_grid_ct_power_corrected`
- PV: `sensor.deye_pv1_power`, `sensor.deye_pv2_power`, `sensor.deye_pv3_power`
- Battery power: `sensor.deye_battery_power`
- Battery SOC: `sensor.deye_battery_soc`
- Load: `sensor.deye_load_power`

Beny/OCPP:

- Current limit: `number.<charger_id>_maximum_current`
- Charge control: `switch.<charger_id>_charge_control`
- Availability: `switch.<charger_id>_availability`
- Power import: `sensor.<charger_id>_power_active_import`
- Current import: `sensor.<charger_id>_current_import`
- Voltage: `sensor.<charger_id>_voltage`
- Offered current: `sensor.<charger_id>_current_offered`
- Connector status: `sensor.<charger_id>_status_connector`

If a source sensor needs scaling, configure the integration's multiplier instead of creating a template sensor. For example, if a raw Deye grid CT sensor is 10x too low, set the grid multiplier to `10`.

## Installation

### HACS Custom Repository

1. Push this repository to GitHub.
2. Add the GitHub repository URL to HACS as a custom repository.
3. Choose category: Integration.
4. Install Solar Charge.
5. Restart Home Assistant.
6. Add the integration from Settings -> Devices & services.

### Manual

Copy `custom_components/solar_charge` into your Home Assistant `custom_components` directory and restart Home Assistant.

## Configuration

The setup flow asks for:

- Name and charging mode
- Grid, PV, battery, load, and charger entities
- Sensor multipliers and sign direction
- Breaker limit, safety margin, voltage, grid buffer, min/max charge amps
- Daily free/cheap charging window

Default safety values for the first target setup:

- Breaker limit: `50 A`
- Safety margin: `5 A`
- Effective import limit: `45 A`
- Voltage: `230 V`
- Grid buffer: `500 W`
- Min charge: `6 A`
- Max charge: `16 A`
- Control interval: `60 s`
- Sensor stale timeout: `120 s`
- Free window: `11:00` to `14:00`

## Lovelace Card

The repo includes a custom Lovelace card. When installed through HACS as an integration, the card JavaScript is bundled inside `custom_components/solar_charge/frontend/` and served by Home Assistant.

Add this Lovelace resource after installing and restarting Home Assistant:

```yaml
url: /solar_charge/solar-charge-card.js
type: module
```

No manual copy into `/config/www` is needed.

Basic card config:

```yaml
type: custom:solar-charge-card
entity: sensor.solar_charge_status
title: Garage EV Charging
show_controls: true
```

The card derives related entity IDs from the status sensor. For example, `sensor.solar_charge_status` maps to `sensor.solar_charge_target_amps`, `binary_sensor.solar_charge_allowed_to_charge`, `select.solar_charge_mode`, and `switch.solar_charge_control_enabled`.

If Home Assistant assigns different entity IDs, override only the ones that differ:

```yaml
type: custom:solar-charge-card
entity: sensor.solar_charge_status
entities:
  targetAmps: sensor.garage_ev_target_amps
  mode: select.garage_ev_mode
  controlEnabled: switch.garage_ev_control_enabled
```

## Development

Install test dependencies and run:

```bash
pytest
```

The calculation engine lives in `custom_components/solar_charge/calculations.py` and has no Home Assistant imports.

Build the Lovelace card:

```bash
cd frontend
npm install
npm run build
```

The build output is written to `custom_components/solar_charge/frontend/solar-charge-card.js` so HACS includes it with the integration.
