# Solar Charge Dashboard Cards

## Prerequisites

Install these from HACS (Home Assistant Community Store):
1. **ApexCharts Card** - Beautiful, customizable charts
2. **Mini Graph Card** - Lightweight, simple graphs

Go to HACS > Frontend > Search for "ApexCharts" and "Mini Graph Card"

---

## Card 1: Power Flow Overview (ApexCharts)

Shows Solar, Grid, Battery, and EV charging power over time.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Power Flow
  show_states: true
  colorize_states: true
graph_span: 12h
span:
  start: day
all_series_config:
  stroke_width: 2
  opacity: 0.8
  fill_raw: last
series:
  - entity: sensor.solar_charge_pv_power
    name: Solar
    color: orange
    type: area
  - entity: sensor.deye_battery_power
    name: Battery
    color: green
    type: area
    invert: true
  - entity: sensor.solar_charge_grid_import
    name: Grid
    color: blue
    type: line
  - entity: sensor.solar_charge_charger_power
    name: EV Charging
    color: purple
    type: area
```

---

## Card 2: EV Charging Details (ApexCharts)

Shows actual vs target charging current and power.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: EV Charging
  show_states: true
  colorize_states: true
graph_span: 6h
series:
  - entity: sensor.solar_charge_charger_power
    name: Charge Power
    color: purple
    unit: W
    yaxis_id: power
  - entity: sensor.solar_charge_target_amps
    name: Target
    color: orange
    unit: A
    yaxis_id: current
  - entity: sensor.solar_charge_actual_current
    name: Actual
    color: green
    unit: A
    yaxis_id: current
yaxis:
  - id: power
    min: 0
    apex_config:
      tickAmount: 5
  - id: current
    opposite: true
    min: 0
    max: 20
    apex_config:
      tickAmount: 4
```

---

## Card 3: Solar vs Load (Mini Graph Card)

Simple, lightweight graph showing solar production vs consumption.

```yaml
type: custom:mini-graph-card
name: Solar vs Load
hours_to_show: 24
points_per_hour: 4
line_width: 2
entities:
  - entity: sensor.solar_charge_pv_power
    name: Solar
    color: '#ffa500'
  - entity: sensor.deye_load_power
    name: Load
    color: '#0066cc'
  - entity: sensor.solar_charge_charger_power
    name: EV
    color: '#9933ff'
show:
  labels: true
  legend: true
  fill: fade
```

---

## Card 4: Battery State (ApexCharts)

Shows battery SOC, power, and charging/discharging state.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Battery State
  show_states: true
  colorize_states: true
graph_span: 24h
span:
  start: day
series:
  - entity: sensor.deye_battery_soc
    name: SOC
    color: green
    unit: '%'
    yaxis_id: soc
    stroke_width: 3
  - entity: sensor.deye_battery_power
    name: Power
    color: blue
    unit: W
    yaxis_id: power
    type: area
yaxis:
  - id: soc
    min: 0
    max: 100
    apex_config:
      tickAmount: 5
  - id: power
    opposite: true
    apex_config:
      tickAmount: 5
```

---

## Card 5: Grid Import/Export (ApexCharts)

Shows grid usage with positive (import) and negative (export) values.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Grid Power
  show_states: true
  colorize_states: true
graph_span: 24h
span:
  start: day
series:
  - entity: sensor.deye_grid_power
    name: Grid
    color: blue
    stroke_width: 2
    type: area
    data_generator: |
      return entity.attributes.history.map((entry) => {
        return [new Date(entry.last_changed), entry.state];
      });
yaxis:
  - min: ~-5000
    max: ~5000
    apex_config:
      tickAmount: 8
```

---

## Card 6: Daily Energy Summary (Statistics Card)

Shows daily totals for easy tracking.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Today's Energy
  show_states: true
  colorize_states: true
graph_span: 24h
span:
  start: day
series:
  - entity: sensor.deye_day_pv_energy
    name: Solar Generated
    color: orange
    type: column
  - entity: sensor.deye_day_battery_charge
    name: Battery Charged
    color: green
    type: column
  - entity: sensor.deye_day_battery_discharge
    name: Battery Discharged
    color: red
    type: column
  - entity: sensor.deye_day_grid_import
    name: Grid Import
    color: blue
    type: column
  - entity: sensor.deye_day_grid_export
    name: Grid Export
    color: cyan
    type: column
chart_type: bar
```

---

## Card 7: Solar Charge Status (Entities Card)

Quick status overview without graphs.

```yaml
type: entities
title: Solar Charge Status
entities:
  - entity: switch.solar_charge_control
    name: Control Enabled
  - entity: sensor.solar_charge_pv_power
    name: Solar Power
  - entity: sensor.solar_charge_spare_capacity
    name: Spare Capacity
  - entity: sensor.solar_charge_target_amps
    name: Target Current
  - entity: sensor.solar_charge_actual_current
    name: Actual Current
  - type: divider
  - entity: sensor.deye_battery_soc
    name: Battery SOC
  - entity: sensor.deye_grid_power
    name: Grid Power
```

---

## Complete Dashboard Layout

Create a new dashboard view with all cards:

1. Go to **Settings > Dashboards**
2. Click **Add Dashboard**
3. Name it "Solar Charge Monitor"
4. Add a new view
5. Click **Edit Dashboard** (three dots)
6. Add cards in this layout:

```
Row 1 (full width):
- Card 1: Power Flow Overview

Row 2 (50/50):
- Card 2: EV Charging Details
- Card 4: Battery State

Row 3 (50/50):
- Card 3: Solar vs Load
- Card 5: Grid Import/Export

Row 4 (full width):
- Card 6: Daily Energy Summary

Sidebar (optional):
- Card 7: Solar Charge Status
```

---

## Tips

1. **Customize colors** to match your preferences
2. **Adjust time spans** based on what you want to see (6h, 12h, 24h)
3. **Add more sensors** from your Deye inverter as needed
4. **Use conditional cards** to show different views based on time of day
5. **Create automations** to notify you of interesting events

Enjoy your new monitoring dashboard!
