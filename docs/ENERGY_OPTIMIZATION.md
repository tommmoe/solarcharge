# Energy Optimization System

## Overview

This system will automatically:
1. **Charge battery from solar** when excess is available
2. **Discharge battery during peak times** to avoid grid import
3. **Import from grid** when cheap (off-peak)
4. **Export to grid** when profitable (if enabled)
5. **Coordinate with EV charging** via Solar Charge

---

## Step 1: Check Available Deye Controls

Go to **Developer Tools > States** and search for entities starting with:
- `number.deye_` (battery charge/discharge limits)
- `switch.deye_` (modes, grid control)
- `select.deye_` (operation modes)

Common Deye controls:
- `number.deye_battery_charge_limit` - Max charge power (W)
- `number.deye_battery_discharge_limit` - Max discharge power (W)
- `number.deye_battery_soc_limit` - Target SOC (%)
- `select.deye_work_mode` - Operating mode (Self-use, Battery first, etc.)
- `switch.deye_grid_charge` - Allow charging from grid
- `number.deye_max_soc_grid_charge` - Max SOC when charging from grid

**Action Required**: List the entities you have available.

---

## Step 2: Define Your Energy Strategy

### Typical Strategy (Australian market):

**Time Periods:**
- **Off-Peak** (12am-6am): ~$0.15/kWh → Charge battery from grid
- **Shoulder** (6am-4pm, 9pm-12am): ~$0.25/kWh → Use solar + battery
- **Peak** (4pm-9pm): ~$0.50/kWh → Discharge battery, avoid grid

**Priority:**
1. Use solar first (always)
2. Store excess in battery
3. Use battery during peak
4. Import from grid only when necessary
5. Charge EV when solar/battery available

### Your Custom Strategy:

Fill in your tariff times and prices:
```yaml
# Define in configuration.yaml
input_datetime:
  off_peak_start:
    name: Off-peak Start
    has_time: true
    initial: "00:00"
  off_peak_end:
    name: Off-peak End
    has_time: true
    initial: "06:00"
  peak_start:
    name: Peak Start
    has_time: true
    initial: "16:00"
  peak_end:
    name: Peak End
    has_time: true
    initial: "21:00"

input_number:
  off_peak_rate:
    name: Off-peak Rate
    min: 0
    max: 1
    step: 0.01
    initial: 0.15
    unit_of_measurement: "$/kWh"
  peak_rate:
    name: Peak Rate
    min: 0
    max: 2
    step: 0.01
    initial: 0.50
    unit_of_measurement: "$/kWh"
  shoulder_rate:
    name: Shoulder Rate
    min: 0
    max: 1
    step: 0.01
    initial: 0.25
    unit_of_measurement: "$/kWh"
```

---

## Step 3: Battery Reserve Strategy

How much battery to keep for emergencies?
```yaml
input_number:
  battery_min_soc:
    name: Minimum Battery SOC
    min: 10
    max: 50
    step: 5
    initial: 20
    unit_of_measurement: "%"
    
  battery_charge_target_offpeak:
    name: Target SOC (Off-peak)
    min: 50
    max: 100
    step: 5
    initial: 95
    unit_of_measurement: "%"
```

---

## Step 4: Implementation Options

### Option A: Simple Automations (Start Here)

Basic automations using Home Assistant's built-in automation system.

**Pros:**
- Easy to understand
- Quick to implement
- No coding required

**Cons:**
- Less sophisticated
- Manual coordination
- Limited optimization

### Option B: Custom Integration (Advanced)

Build a "Solar Battery Manager" integration similar to Solar Charge.

**Pros:**
- Sophisticated algorithms
- Real-time optimization
- Predictive control (using forecast)
- Automatic coordination
- ML-based learning

**Cons:**
- Takes time to develop
- Requires Python knowledge
- More complex to maintain

---

## Which approach do you want?

**For Quick Results:** Start with Option A (automations) - I'll create ready-to-use automations

**For Best Performance:** Option B (custom integration) - I'll help you build a smart battery manager

Let me know which path you prefer, or we can start simple and upgrade later!

---

## Next Steps

1. **List your available Deye control entities** (number.deye_*, select.deye_*, etc.)
2. **Define your tariff structure** (times and prices)
3. **Choose Option A or B**
4. I'll create the implementation for you!

