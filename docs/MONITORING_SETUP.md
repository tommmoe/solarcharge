# Energy Monitoring Setup - Data Collection Phase

## Goal

Collect 1-2 weeks of data to understand:
1. **Evening load (6pm-9pm)** - How much power you actually need
2. **Battery discharge patterns** - How fast battery drains
3. **Solar production** - Daily generation patterns
4. **Grid usage** - When and how much you import
5. **Safety margins** - How much reserve you need for nights

---

## Quick Setup (No InfluxDB Needed Yet)

### Option A: Home Assistant History (Quick Start)

Home Assistant already stores 10 days of history. No setup needed!

**To view your patterns:**

1. Go to **History** in Home Assistant sidebar
2. Select these entities:
   - `sensor.deye_battery_power`
   - `sensor.deye_battery_soc`
   - `sensor.deye_grid_power`
   - `sensor.deye_load_power`
   - `sensor.solar_charge_pv_power`
3. Set date range: Last 24 hours
4. Observe patterns

**Key questions to answer:**
- What's your typical evening load (6pm-9pm)?
- How much battery SOC do you have at 6pm?
- How much battery SOC remains at 9pm?
- Do you import grid power after 9pm?

---

### Option B: Energy Dashboard (Better Visualization)

Home Assistant has a built-in Energy Dashboard!

**Setup:**

1. Go to **Settings > Dashboards > Energy**
2. Click **Add Energy Source**

**Configure:**

**Grid Consumption:**
- Entity: `sensor.deye_day_grid_import`
- Cost entity: Create input_number for tariff

**Grid Return:**
- Entity: `sensor.deye_day_grid_export`
- Compensation entity: Create for feed-in tariff

**Solar Production:**
- Entity: `sensor.deye_day_pv_energy`

**Battery:**
- Entity: `sensor.deye_battery_soc`
- Energy going in: `sensor.deye_day_battery_charge`
- Energy going out: `sensor.deye_day_battery_discharge`

**Individual Devices:**
- Add Solar Charge: Create energy sensor from power

**This gives you:**
- Daily/weekly/monthly energy flow diagrams
- Cost tracking
- Solar self-consumption %
- Battery cycles

---

## Monitoring Dashboard - Individual Cards

Add these cards one at a time to your dashboard. For each card:
1. Click **"Add Card"** on your dashboard
2. Search for **"Manual"** or scroll to bottom
3. Click **"Manual Card"**
4. Delete the example YAML
5. Copy/paste the card YAML below
6. Click **"Save"**

---

### Card 1: Live Power Flow (Last 24h)
```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Live Power Flow (Last 24h)
  show_states: true
graph_span: 24h
series:
  - entity: sensor.deye_load_power
    name: Load
    color: red
    type: area
  - entity: sensor.solar_charge_pv_power
    name: Solar
    color: orange
    type: area
  - entity: sensor.deye_battery_power
    name: Battery
    color: green
    type: line
  - entity: sensor.deye_grid_power
    name: Grid
    color: blue
    type: line
yaxis:
  - min: ~-2000
    max: ~10000
```

**What it shows:** Real-time power from all sources over the last 24 hours

---

### Card 2: Battery SOC (Last 7 Days)

```yaml
type: custom:apexcharts-card
header:
  title: Battery SOC (Last 7 days)
graph_span: 7d
series:
  - entity: sensor.deye_battery_soc
    name: SOC
    color: green
    stroke_width: 2
yaxis:
  - min: 0
    max: 100
```

**What it shows:** Battery charge percentage over the last week

---

### Card 3: Evening Grid Import (Super Simple)

**Note:** Just shows your grid usage. Watch the 6pm-9pm section - needs to stay under 30W!

```yaml
type: custom:apexcharts-card
header:
  title: Grid Import (Last 24h)
  show_states: true
graph_span: 24h
series:
  - entity: sensor.deye_grid_power
    name: Grid Import
    color: blue
    type: line
    stroke_width: 2
yaxis:
  - min: -500
    max: 2000
```

**What it shows:** Grid import over 24h. Look at the 6pm-9pm section and check if it stays below 30W!

---

### Card 4: Daily Energy Summary

```yaml
type: entities
title: Today's Energy Summary
entities:
  - entity: sensor.deye_day_pv_energy
    name: Solar Generated
    icon: mdi:solar-power
  - entity: sensor.deye_day_battery_charge
    name: Battery Charged
    icon: mdi:battery-charging
  - entity: sensor.deye_day_battery_discharge
    name: Battery Discharged
    icon: mdi:battery-minus
  - entity: sensor.deye_day_grid_import
    name: Grid Import
    icon: mdi:transmission-tower-import
  - entity: sensor.deye_day_grid_export
    name: Grid Export
    icon: mdi:transmission-tower-export
  - entity: sensor.deye_day_load_energy
    name: Total Load
    icon: mdi:home-lightning-bolt
```

**What it shows:** Today's energy totals in a simple list

---

### Card 5: Current Status

```yaml
type: entities
title: Current Status
entities:
  - entity: sensor.deye_battery_soc
    name: Battery SOC
  - entity: sensor.deye_battery_power
    name: Battery Power
    secondary_info: last-changed
  - entity: sensor.deye_grid_power
    name: Grid Power
    secondary_info: last-changed
  - entity: sensor.deye_load_power
    name: Load Power
    secondary_info: last-changed
  - entity: sensor.solar_charge_pv_power
    name: Solar Power
    secondary_info: last-changed
```

**What it shows:** Current real-time values for all power sources

---

### Card 6: Solar vs Load (Simple)

```yaml
type: history-graph
title: Solar vs Load (48h)
hours_to_show: 48
entities:
  - entity: sensor.solar_charge_pv_power
    name: Solar
  - entity: sensor.deye_load_power
    name: Load
  - entity: sensor.deye_grid_power
    name: Grid
```

**What it shows:** Simple line graph comparing solar production vs consumption

---

## Recommended Order to Add:

1. **Card 5** (Current Status) - Start here, easiest
2. **Card 4** (Daily Summary) - Also easy
3. **Card 6** (Simple graph) - Uses built-in card
4. **Card 2** (Battery SOC) - First ApexCharts
5. **Card 1** (Power Flow) - Most useful
6. **Card 3** (Skip for now if it errors)

---

## If a Card Errors:

- Check the entity names match yours exactly
- Try removing `secondary_info: last-changed` lines
- Skip that card and try the next one

Let me know which cards work and which don't!

---

## Data Collection Template (for you to fill out)

After 1-2 weeks, collect this data and send it to me:

### Daily Averages:
```
Solar Generation:
- Daily average: ___ kWh
- Best day: ___ kWh
- Worst day: ___ kWh

Load Consumption:
- Daily average: ___ kWh
- Evening (6pm-9pm): ___ kWh
- Night (9pm-6am): ___ kWh
- Morning (6am-11am): ___ kWh
- Free window (11am-2pm): ___ kWh

Battery:
- SOC at 6pm (average): ___ %
- SOC at 9pm (average): ___ %
- SOC at 6am (average): ___ %
- Average daily discharge: ___ kWh

Grid:
- Current evening import (6pm-9pm): ___ kWh
- Current night import (9pm-6am): ___ kWh
```

### Key Questions:
```
1. What's your typical evening load during 6pm-9pm?
   Answer: ___ W average

2. How much battery capacity do you have left at 9pm?
   Answer: ___ % average

3. Do you ever run out of battery before morning?
   Answer: Yes/No, frequency: ___

4. What appliances run during evening (6pm-9pm)?
   Answer: (list them)

5. Can you shift any loads to the free window (11am-2pm)?
   Answer: (list possibilities)
```

---

## Optional: Enhanced Monitoring with Template Sensors

Add these to your `configuration.yaml` for better tracking:

```yaml
template:
  - sensor:
      # Evening grid import (6pm-9pm only)
      - name: "Evening Grid Import"
        unique_id: evening_grid_import
        unit_of_measurement: "W"
        state: >
          {% set hour = now().hour %}
          {% if 18 <= hour < 21 %}
            {{ states('sensor.deye_grid_power') | float(0) }}
          {% else %}
            0
          {% endif %}
        device_class: power
        state_class: measurement
      
      # ZEROHERO compliance tracker
      - name: "ZEROHERO Status"
        unique_id: zerohero_status
        state: >
          {% set hour = now().hour %}
          {% if 18 <= hour < 21 %}
            {% set grid = states('sensor.deye_grid_power') | float(0) %}
            {% if grid <= 30 %}
              ✅ Compliant
            {% else %}
              ⚠️ Over limit ({{ grid }}W)
            {% endif %}
          {% else %}
            Outside window
          {% endif %}
      
      # Daily cost estimator
      - name: "Today's Grid Cost"
        unique_id: todays_grid_cost
        unit_of_measurement: "$"
        state: >
          {% set peak = states('sensor.deye_day_grid_import') | float(0) %}
          {{ (peak * 0.45) | round(2) }}
        # This is simplified - you'd need to track by time period
      
      # Battery reserve for evening
      - name: "Battery Reserve (6pm-9pm)"
        unique_id: battery_reserve_evening
        unit_of_measurement: "kWh"
        state: >
          {% set soc = states('sensor.deye_battery_soc') | float(0) %}
          {% set capacity = 15 %}  # Your battery capacity in kWh
          {{ ((soc / 100) * capacity) | round(1) }}
        device_class: energy
```

---

## Screenshot Guide

Take these screenshots daily and save them:

### Day 1-7:
1. **6pm**: Battery SOC, Grid power, Load power
2. **9pm**: Same readings
3. **11am**: Before free window starts
4. **2pm**: After free window ends

### Or use Home Assistant's built-in recorder:

The data is already being collected! After 1-2 weeks:

1. Go to **Developer Tools > Statistics**
2. Select sensor: `sensor.deye_battery_soc`
3. Export data for analysis

---

## Simple Daily Log (No Tech Required)

If you want to keep it simple, just note down:

```
Date: ___/___/___
Weather: Sunny/Cloudy/Rainy

6:00 PM:
- Battery: ____%
- Grid import: ___ W

9:00 PM:
- Battery: ____%  
- Grid import: ___ W (Did I stay under 30W?)

Next morning:
- Battery: ____%
- Did I import overnight? Yes/No
```

Do this for 7-14 days, then send me the data!

---

## What I'll Do With Your Data

Once you send me your usage patterns, I'll:

1. **Calculate exact discharge rates** for 6pm-9pm export
2. **Determine safety margins** (how much battery to keep)
3. **Optimize program capacities** (30%? 40%? 50%?)
4. **Set optimal power limits** (fast discharge vs slow)
5. **Fine-tune free window usage**
6. **Create custom automations** for your specific patterns

---

## Next Steps

1. ✅ Set up the monitoring dashboard (copy/paste the YAML)
2. ✅ Check Energy Dashboard is configured
3. ✅ Monitor for 1-2 weeks (business as usual)
4. ✅ Fill out the data collection template
5. ✅ Send me the data
6. ✅ I'll create your customized optimization plan!

**No changes to your system yet** - just observe and collect data! 📊
