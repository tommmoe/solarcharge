# Solar Charge

Solar Charge is a Home Assistant custom integration for safely managing single-phase EV charging from existing Home Assistant entities.

It calculates an EV charger current limit from live grid import/export, charger load, optional solar and battery sensors, and a configured free/cheap charging window. It is designed for setups such as a Deye/Sunsynk inverter exposed through Home Assistant and an OCPP charger exposed through Home Assistant.

## What It Does

- Reads existing Home Assistant entities only.
- Calculates safe target EV charging amps.
- Subtracts current EV load from measured grid import before calculating spare capacity, preventing charge-current feedback loops.
- Exposes diagnostic sensors for safe limit, base grid import, spare capacity, target amps, and reason.
- Tracks EV charge sessions: energy delivered today, last session energy, last-charged timestamp, and a 7-day history shown on the dashboard card, with a warning when the car is plugged in but hasn't charged in over 24 hours.
- Exposes an allowed-to-charge binary sensor.
- Provides a control-enabled switch, default off.
- Writes to charger entities only when control is explicitly enabled.
- Fails safe when required sensors are unavailable, unknown, or stale.
- Checks charger status and only enables charging when a vehicle is connected, preventing unnecessary charger activations.

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
  - **Note**: For AC-coupled solar systems (where panels connect to a separate solar inverter, not the Deye DC inputs), these PV sensors will always be 0W. See [AC-Coupled Setup Guide](docs/AC_COUPLED_SETUP.md) for configuration.
- Battery power: `sensor.deye_battery_power`
- Battery SOC: `sensor.deye_battery_soc`
- Load: `sensor.deye_load_power`

Inverter control (18:00–21:00 export) also needs the Sunsynk add-on to poll
the per-slot sell flags. Add these to the add-on's `SENSORS` list:
`prog1_sell` … `prog6_sell` and `max_sell_power`. Without `prog5_sell` the
battery idles in Allow Export mode and the house runs on grid. Without
`max_sell_power` the export isn't paced (see below).

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

## Overnight Reserve and Evening Export

The 18:00–21:00 export must leave enough battery to carry the house to the
11:00 free window. Solar Charge measures and protects this automatically:

- **Measuring a night (21:00 → 11:00 next day):** usage = battery energy drawn
  + grid import − grid export. Nights where the battery ran flat or was topped
  up from the grid are measured correctly. A night with more than 15 minutes
  unmeasured (HA down, sensors unavailable) is discarded rather than
  under-counted. The night in progress is saved, so restarts don't lose it.
- **Sizing the reserve:** the larger of the 90th-percentile night of the last
  14 and the worst of the last 3, plus the configured margin (default 20 %),
  rounded up. It rises within a night of a cold snap. Until 3 nights have been
  measured the fallback reserve (default 30 %) is used.
- **Stopping export:** all discharge slots run down to a 10 % hard floor
  (Deye shutdown is 7 %). Export switches off for the evening once SOC reaches
  10 % + reserve + the house load still expected before 21:00. The battery
  then keeps powering the house, so the grid isn't used and the ZeroHero
  credit is kept.
- **Pacing the export:** the Deye's max sell power caps the inverter's total
  output (house + export). Each cycle it is set to the house load plus an
  export that spreads the energy above the stop SOC evenly until 21:00, and
  never less than 2.5 kW of export (12 kW outside the window). The grid keeps
  exporting for the whole window, so when a load switches on it is fed from
  the export, not from the grid. (11 Nov 2026: a cap that ignored house load
  let a 4 kW oven pull from the grid.) Exporting flat out and then sitting at Zero
  Export for the last hour let a cycling oven import 0.17 kWh on 10 Nov 2026
  and lose the credit.
- **Metering the window:** ZeroHero import and Super Export are integrated on
  every grid sensor change, not once per control cycle, so a few-second spike
  isn't counted as a whole minute.

Sensors: *Overnight planned usage*, *Last night usage*, *Overnight reserve*,
*Export stop SOC*, *Export sell limit*, *House power*, *Overnight nights measured*, and binary
sensors *Evening export allowed* / *Overnight reserve using fallback*.

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

The integration registers the Lovelace resource for you on startup, as `/solar_charge/solar-charge-card.js?v=<version>`, and updates the `?v=` on every release so browsers fetch the new card. No manual copy into `/config/www` is needed.

If your dashboards are in YAML mode, add the resource yourself (bump `?v=` after each update):

```yaml
url: /solar_charge/solar-charge-card.js?v=1.2.13
type: module
```

Basic card config:

```yaml
type: custom:solar-charge-card
entity: sensor.solar_charge_status
title: Garage EV Charging
show_controls: true
```

The card derives related entity IDs from the status sensor. For example, `sensor.solar_charge_status` maps to `sensor.solar_charge_target_amps`, `sensor.solar_charge_charger_status`, `binary_sensor.solar_charge_allowed_to_charge`, `select.solar_charge_mode`, and `switch.solar_charge_control_enabled`.

The card displays:
- Current charging status and mode
- Car connection status (detected from charger status sensor)
- Real-time power and current metrics
- Grid, charger, and breaker safety indicators
- Interactive mode controls (when `show_controls: true`)

If Home Assistant assigns different entity IDs, override only the ones that differ:

```yaml
type: custom:solar-charge-card
entity: sensor.solar_charge_status
entities:
  targetAmps: sensor.garage_ev_target_amps
  mode: select.garage_ev_mode
  controlEnabled: switch.garage_ev_control_enabled
```

## Documentation

- [AC-Coupled Solar Setup Guide](docs/AC_COUPLED_SETUP.md) - Configure Solar Charge with AC-coupled solar systems
- [Dashboard Cards Configuration](docs/DASHBOARD_CARDS.md) - Lovelace card examples and customization
- [Energy Optimization Strategies](docs/ENERGY_OPTIMIZATION.md) - Optimize your solar and battery usage
- [InfluxDB Setup Guide](docs/INFLUXDB_SETUP.md) - Set up long-term data collection and analysis
- [Monitoring Setup Guide](docs/MONITORING_SETUP.md) - Monitor and analyze your energy patterns

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
