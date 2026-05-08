# Deye Battery Optimization Setup

## Understanding Your Deye Timer Programs

Your Deye inverter has **6 programmable time slots** (Prog1-6). Each program controls:

1. **Start Time** (`select.deye_prog1_time`) - When this program activates
2. **Target Capacity** (`number.deye_prog1_capacity`) - Target battery SOC (%)
3. **Power Limit** (`number.deye_prog1_power`) - Max charge/discharge rate (W)
4. **Charge Mode** (`select.deye_prog1_charge`) - Grid charging allowed?
   - `No Grid or Gen` - Only solar can charge battery
   - `Allow Grid` - Can charge from grid + solar
   - `Allow Gen` - Generator charging
   - `Allow Grid & Gen` - Both allowed

**How it works:**
- Programs run in sequence throughout the 24h day
- When Prog1 time arrives, it becomes active until Prog2 time
- Battery will charge/discharge to reach the target capacity
- Power limit controls how fast

---

## Recommended Strategy for Australian Market

### Typical Tariff Structure:
- **Off-Peak**: 12am-6am (~$0.15/kWh) → CHARGE from grid
- **Shoulder**: 6am-4pm & 9pm-12am (~$0.25/kWh) → USE battery
- **Peak**: 4pm-9pm (~$0.50/kWh) → DISCHARGE battery, avoid grid

### Optimal Program Configuration:

```yaml
# Prog1: 1:00 AM - Off-Peak Charging
select.deye_prog1_time: "1:00"
select.deye_prog1_charge: "Allow Grid"
number.deye_prog1_capacity: 95  # Charge to 95%
number.deye_prog1_power: 5000   # 5kW charge rate

# Prog2: 5:00 AM - Stop Grid Charging (just before off-peak ends)
select.deye_prog2_time: "5:00"
select.deye_prog2_charge: "No Grid or Gen"
number.deye_prog2_capacity: 95  # Maintain level
number.deye_prog2_power: 3000   # Moderate rate

# Prog3: 9:00 AM - Daytime Solar (allow charging from solar)
select.deye_prog3_time: "9:00"
select.deye_prog3_charge: "No Grid or Gen"
number.deye_prog3_capacity: 100 # Accept all solar
number.deye_prog3_power: 5000   # 5kW charge rate

# Prog4: 1:00 PM - Afternoon (prepare for peak)
select.deye_prog4_time: "13:00"
select.deye_prog4_charge: "No Grid or Gen"
number.deye_prog4_capacity: 100 # Keep full if possible
number.deye_prog4_power: 5000

# Prog5: 5:00 PM - Peak Time (discharge battery)
select.deye_prog5_time: "17:00"
select.deye_prog5_charge: "No Grid or Gen"
number.deye_prog5_capacity: 30  # Discharge to 30%
number.deye_prog5_power: 8000   # Fast discharge (avoid grid)

# Prog6: 9:00 PM - Evening Shoulder (conserve remaining battery)
select.deye_prog6_time: "21:00"
select.deye_prog6_charge: "No Grid or Gen"
number.deye_prog6_capacity: 30  # Don't discharge below 30%
number.deye_prog6_power: 3000   # Slow discharge
```

**Master Switches:**
```yaml
switch.deye_use_timer: on              # Enable timer programs
switch.deye_grid_charge_enabled: on    # Allow grid charging during off-peak
select.deye_load_limit: "Zero Export"  # Don't export to grid (unless you get paid well)
switch.deye_solar_export: off          # Keep solar for yourself
switch.deye_priority_load: on          # Prioritize loads over export
```

---

## Home Assistant Automation Setup

### Method 1: One-Time Manual Configuration

Run this script once to set up the programs:

```yaml
# scripts.yaml
deye_setup_energy_optimization:
  alias: "Deye: Setup Energy Optimization"
  sequence:
    # Enable master switches
    - service: switch.turn_on
      target:
        entity_id:
          - switch.deye_use_timer
          - switch.deye_grid_charge_enabled
          - switch.deye_priority_load
    - service: switch.turn_off
      target:
        entity_id: switch.deye_solar_export
    
    # Set load limit
    - service: select.select_option
      target:
        entity_id: select.deye_load_limit
      data:
        option: "Zero Export"
    
    # Prog1: Off-Peak Charging (1am)
    - service: select.select_option
      target:
        entity_id: select.deye_prog1_time
      data:
        option: "1:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog1_charge
      data:
        option: "Allow Grid"
    - service: number.set_value
      target:
        entity_id: number.deye_prog1_capacity
      data:
        value: 95
    - service: number.set_value
      target:
        entity_id: number.deye_prog1_power
      data:
        value: 5000
    
    # Prog2: Stop Grid Charging (5am)
    - service: select.select_option
      target:
        entity_id: select.deye_prog2_time
      data:
        option: "5:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog2_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog2_capacity
      data:
        value: 95
    - service: number.set_value
      target:
        entity_id: number.deye_prog2_power
      data:
        value: 3000
    
    # Prog3: Daytime Solar (9am)
    - service: select.select_option
      target:
        entity_id: select.deye_prog3_time
      data:
        option: "9:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog3_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog3_capacity
      data:
        value: 100
    - service: number.set_value
      target:
        entity_id: number.deye_prog3_power
      data:
        value: 5000
    
    # Prog4: Afternoon (1pm)
    - service: select.select_option
      target:
        entity_id: select.deye_prog4_time
      data:
        option: "13:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog4_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog4_capacity
      data:
        value: 100
    - service: number.set_value
      target:
        entity_id: number.deye_prog4_power
      data:
        value: 5000
    
    # Prog5: Peak Discharge (5pm)
    - service: select.select_option
      target:
        entity_id: select.deye_prog5_time
      data:
        option: "17:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog5_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_capacity
      data:
        value: 30
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_power
      data:
        value: 8000
    
    # Prog6: Evening Shoulder (9pm)
    - service: select.select_option
      target:
        entity_id: select.deye_prog6_time
      data:
        option: "21:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog6_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog6_capacity
      data:
        value: 30
    - service: number.set_value
      target:
        entity_id: number.deye_prog6_power
      data:
        value: 3000
```

**To run:** Developer Tools > Services > `script.deye_setup_energy_optimization` > Call Service

---

### Method 2: Dynamic Automation (Advanced)

Automatically adjust based on conditions:

```yaml
# automations.yaml

# Skip grid charging if battery already full
- alias: "Deye: Skip off-peak charge if battery full"
  trigger:
    - platform: time
      at: "00:30:00"  # Before Prog1 activates
  condition:
    - condition: numeric_state
      entity_id: sensor.deye_battery_soc
      above: 90
  action:
    - service: select.select_option
      target:
        entity_id: select.deye_prog1_charge
      data:
        option: "No Grid or Gen"

# Extend discharge during peak if solar was good
- alias: "Deye: Aggressive peak discharge if battery high"
  trigger:
    - platform: time
      at: "16:45:00"  # Just before peak
  condition:
    - condition: numeric_state
      entity_id: sensor.deye_battery_soc
      above: 80
  action:
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_capacity
      data:
        value: 20  # Discharge more aggressively

# Conserve battery if solar was poor
- alias: "Deye: Conservative discharge if battery low"
  trigger:
    - platform: time
      at: "16:45:00"
  condition:
    - condition: numeric_state
      entity_id: sensor.deye_battery_soc
      below: 60
  action:
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_capacity
      data:
        value: 40  # Keep more reserve

# Coordinate with EV charging
- alias: "Deye: Boost battery if EV charging tonight"
  trigger:
    - platform: time
      at: "12:00:00"  # Noon check
  condition:
    # Check if EV plugged in and needs charging
    - condition: state
      entity_id: binary_sensor.ev_charger_connected
      state: "on"
    - condition: numeric_state
      entity_id: sensor.ev_battery_level
      below: 80
  action:
    # Reduce peak discharge to save for EV
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_capacity
      data:
        value: 50  # Keep 50% for EV charging later
```

---

## Expected Savings

### Current Usage:
- Day grid import: 19.7 kWh
- Day grid export: 3.3 kWh
- Day PV energy: 19.3 kWh

### With Optimization (estimated):
- Off-peak charging: 10 kWh @ $0.15 = **$1.50**
- Peak avoidance: Save 5 kWh @ $0.50 = **Save $2.50**
- Net daily saving: **~$1.00**
- **Monthly: ~$30 saved**
- **Yearly: ~$365 saved**

Plus battery wear is minimized by staying in 30-95% range!

---

## Monitoring Dashboard

Add this to see your optimization working:

```yaml
type: vertical-stack
cards:
  # Current Program Status
  - type: entities
    title: Active Deye Program
    entities:
      - entity: switch.deye_use_timer
        name: Timer Enabled
      - entity: switch.deye_grid_charge_enabled
        name: Grid Charge Allowed
      - entity: select.deye_load_limit
        name: Load Limit Mode
      - type: divider
      - entity: sensor.deye_battery_soc
        name: Battery SOC
      - entity: sensor.deye_battery_power
        name: Battery Power
      - entity: sensor.deye_grid_power
        name: Grid Power
  
  # Program Schedule
  - type: entities
    title: Program Schedule
    entities:
      - type: section
        label: "Prog1: Off-Peak Charge"
      - entity: select.deye_prog1_time
      - entity: number.deye_prog1_capacity
      - entity: select.deye_prog1_charge
      
      - type: section
        label: "Prog5: Peak Discharge"
      - entity: select.deye_prog5_time
      - entity: number.deye_prog5_capacity
      - entity: number.deye_prog5_power
```

---

## Next Steps

1. **Copy the script** to your `scripts.yaml`
2. **Run the setup script** once
3. **Monitor for 2-3 days** to see the pattern
4. **Adjust times/capacities** based on your actual usage
5. **Optional: Add dynamic automations** for fine-tuning

Let me know how it works!
