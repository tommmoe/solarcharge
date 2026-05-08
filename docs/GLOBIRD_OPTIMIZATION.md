# GloBird Energy Optimization Strategy

## Your Amazing Plan Benefits

### 🎁 Free Electricity Window
**11am-2pm: FREE (0c/kWh)**
- Charge everything during this time!
- Battery, EV, hot water, pool pump, etc.

### 💰 ZEROHERO Bonus
**$1/day ($365/year) if grid import ≤0.03kWh/hour between 6pm-9pm**
- **Critical**: Must use <30Wh per hour (basically zero)
- Use battery/solar only during this window
- **This is your #1 priority!**

### ⚡ Super Export Bonus
**15c/kWh for first 15kWh exported between 6pm-9pm**
- Export your solar/battery during evening peak
- 3x better than normal 5c feed-in
- Worth $2.25/day if you export 15kWh

### 📊 Regular Rates
- **Peak (4pm-11pm)**: 51.7c/kWh 💸 AVOID!
- **Shoulder (2pm-4pm, 11pm-11am)**: 37.4c/kWh
- **Off-Peak (11am-2pm)**: 0c/kWh 🎉 FREE!

### 🚀 Potential Earnings
- ZEROHERO: **$365/year** for zero import 6pm-9pm
- Super Export: **$821/year** (15kWh × 15c × 365 days)
- Critical Peak events: **Variable**
- **Total potential: $1,186+/year!**

---

## Optimal Strategy

### Phase 1: 11am-2pm (FREE POWER!)
**Priority: Charge everything from grid**
```
Grid (free) → Battery (charge to 100%)
Grid (free) → EV (charge as much as possible)
Grid (free) → Load (run heavy appliances)
Solar → Export (5c feed-in, not great but why not)
```

### Phase 2: 2pm-4pm (Shoulder, 37.4c)
**Priority: Save battery for evening**
```
Solar → Battery (top up if needed)
Solar → Load
Battery → Only if solar insufficient
Grid → Avoid
```

### Phase 3: 4pm-6pm (Peak starts, 51.7c)
**Priority: Prepare for ZEROHERO window**
```
Solar → Load
Battery → Load (avoid grid at 51.7c!)
Solar → Battery (if excess)
Grid → AVOID
```

### Phase 4: 6pm-9pm (ZEROHERO WINDOW + Super Export)
**Priority: ZERO grid import + Maximum export**
```
Battery → Load (keep grid import <30W/hour)
Battery → Export (up to 15kWh for 15c bonus)
Solar → Export (if any)
Grid → MUST BE ZERO (for $1 bonus)
```

**Target:**
- Import: <0.03kWh/hour (basically 0W) ✅ $1 bonus
- Export: 15kWh total ✅ $2.25 bonus
- **Daily bonus: $3.25!**

### Phase 5: 9pm-11pm (Peak ends, still 51.7c)
**Priority: Conserve remaining battery**
```
Battery → Load (slow discharge)
Grid → Only if battery low
```

### Phase 6: 11pm-11am (Shoulder, 37.4c)
**Priority: Coast until free window**
```
Solar → Load + Battery (morning sun)
Battery → Load (maintain)
Grid → Minimal (37.4c acceptable if needed)
```

---

## Deye Program Configuration for GloBird

```yaml
# Prog1: 11:00 AM - FREE POWER! (Charge from grid)
select.deye_prog1_time: "11:00"
select.deye_prog1_charge: "Allow Grid"
number.deye_prog1_capacity: 100  # Charge to full
number.deye_prog1_power: 12000   # MAX POWER (it's free!)

# Prog2: 2:00 PM - Shoulder Start (Solar only)
select.deye_prog2_time: "14:00"
select.deye_prog2_charge: "No Grid or Gen"
number.deye_prog2_capacity: 100  # Maintain full
number.deye_prog2_power: 5000

# Prog3: 4:00 PM - Peak Start (Battery mode)
select.deye_prog3_time: "16:00"
select.deye_prog3_charge: "No Grid or Gen"
number.deye_prog3_capacity: 100
number.deye_prog3_power: 5000

# Prog4: 6:00 PM - ZEROHERO WINDOW! (Aggressive discharge + export)
select.deye_prog4_time: "18:00"
select.deye_prog4_charge: "No Grid or Gen"
number.deye_prog4_capacity: 40  # Discharge significantly (for export)
number.deye_prog4_power: 12000  # MAX discharge for export

# Prog5: 9:00 PM - Peak Still Active (Conserve)
select.deye_prog5_time: "21:00"
select.deye_prog5_charge: "No Grid or Gen"
number.deye_prog5_capacity: 40  # Hold at 40%
number.deye_prog5_power: 3000   # Slow discharge

# Prog6: 11:00 PM - Shoulder Night (Minimal)
select.deye_prog6_time: "23:00"
select.deye_prog6_charge: "No Grid or Gen"
number.deye_prog6_capacity: 30  # Reserve for morning
number.deye_prog6_power: 2000
```

**Key Settings:**
```yaml
switch.deye_use_timer: on
switch.deye_grid_charge_enabled: on  # For 11am-2pm free charging
select.deye_load_limit: "Allow Export"  # IMPORTANT: Must export for bonuses!
switch.deye_solar_export: on  # ENABLE EXPORT!
switch.deye_priority_load: off  # Allow export during 6-9pm
```

---

## EV Charging Strategy (Solar Charge)

### Free Window (11am-2pm):
```yaml
# Configure Solar Charge for free window
CONF_FREE_WINDOW_START: "11:00"
CONF_FREE_WINDOW_END: "14:00"
CONF_MODE: "free_hours_or_solar"
```
**Result:** EV charges for FREE during 11am-2pm!

### Evening Strategy:
- **6pm-9pm**: STOP EV charging (need battery for export)
- **After 9pm**: Resume EV if needed (37.4c shoulder)

---

## Setup Script

```yaml
# scripts.yaml
globird_setup_optimization:
  alias: "GloBird: Setup Optimization"
  sequence:
    # Enable export and grid charge
    - service: switch.turn_on
      target:
        entity_id:
          - switch.deye_use_timer
          - switch.deye_grid_charge_enabled
          - switch.deye_solar_export
    
    - service: switch.turn_off
      target:
        entity_id: switch.deye_priority_load
    
    - service: select.select_option
      target:
        entity_id: select.deye_load_limit
      data:
        option: "Allow Export"
    
    # Prog1: 11am FREE POWER
    - service: select.select_option
      target:
        entity_id: select.deye_prog1_time
      data:
        option: "11:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog1_charge
      data:
        option: "Allow Grid"
    - service: number.set_value
      target:
        entity_id: number.deye_prog1_capacity
      data:
        value: 100
    - service: number.set_value
      target:
        entity_id: number.deye_prog1_power
      data:
        value: 12000
    
    # Prog2: 2pm Shoulder
    - service: select.select_option
      target:
        entity_id: select.deye_prog2_time
      data:
        option: "14:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog2_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog2_capacity
      data:
        value: 100
    - service: number.set_value
      target:
        entity_id: number.deye_prog2_power
      data:
        value: 5000
    
    # Prog3: 4pm Peak prep
    - service: select.select_option
      target:
        entity_id: select.deye_prog3_time
      data:
        option: "16:00"
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
    
    # Prog4: 6pm ZEROHERO + EXPORT
    - service: select.select_option
      target:
        entity_id: select.deye_prog4_time
      data:
        option: "18:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog4_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog4_capacity
      data:
        value: 40
    - service: number.set_value
      target:
        entity_id: number.deye_prog4_power
      data:
        value: 12000
    
    # Prog5: 9pm Conserve
    - service: select.select_option
      target:
        entity_id: select.deye_prog5_time
      data:
        option: "21:00"
    - service: select.select_option
      target:
        entity_id: select.deye_prog5_charge
      data:
        option: "No Grid or Gen"
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_capacity
      data:
        value: 40
    - service: number.set_value
      target:
        entity_id: number.deye_prog5_power
      data:
        value: 3000
    
    # Prog6: 11pm Night
    - service: select.select_option
      target:
        entity_id: select.deye_prog6_time
      data:
        option: "23:00"
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
        value: 2000
```

---

## ZEROHERO Monitoring Automation

Track if you're qualifying for the $1 bonus:

```yaml
# automations.yaml
- alias: "GloBird: Monitor ZEROHERO Compliance"
  trigger:
    - platform: time_pattern
      minutes: "/5"  # Check every 5 min
  condition:
    - condition: time
      after: "18:00:00"
      before: "21:00:00"
  action:
    - service: persistent_notification.create
      data:
        title: "ZEROHERO Check"
        message: >
          Grid import: {{ states('sensor.deye_grid_power') }}W
          {% if states('sensor.deye_grid_power')|float > 30 %}
          ⚠️ EXCEEDING 30W! Losing $1 bonus!
          {% else %}
          ✅ On track for $1 bonus
          {% endif %}

# Stop EV charging during ZEROHERO window
- alias: "GloBird: Pause EV during ZEROHERO"
  trigger:
    - platform: time
      at: "17:55:00"
  action:
    - service: switch.turn_off
      target:
        entity_id: switch.solar_charge_control
    - service: notify.mobile_app
      data:
        message: "EV charging paused for ZEROHERO window (6-9pm)"

# Resume EV after ZEROHERO
- alias: "GloBird: Resume EV after ZEROHERO"
  trigger:
    - platform: time
      at: "21:00:00"
  action:
    - service: switch.turn_on
      target:
        entity_id: switch.solar_charge_control
```

---

## Expected Annual Savings

### Current (without optimization):
- Daily grid import: ~20kWh @ average 40c = $8/day
- **Annual: $2,920**

### With GloBird Optimization:
- Free power (11am-2pm): 10kWh @ 0c = $0
- Peak avoided (6pm-9pm): 5kWh saved @ 51.7c = $2.59
- ZEROHERO bonus: $1/day
- Super Export: 15kWh @ 15c = $2.25/day
- **Daily: $5.84 in benefits**
- **Annual: $2,132 in benefits + savings**

### Net Result:
**Save ~$2,132/year** or more!

---

## Next Steps

1. ✅ Run `script.globird_setup_optimization`
2. ✅ Configure Solar Charge free window: 11am-2pm
3. ✅ Monitor grid import during 6pm-9pm (<30W!)
4. ✅ Check you're getting exports during 6-9pm
5. ✅ Track ZEROHERO daily credit on your GloBird bill

This plan is a GAME CHANGER! 🚀
