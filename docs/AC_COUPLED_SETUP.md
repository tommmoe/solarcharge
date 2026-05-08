# AC-Coupled Solar Setup Guide

## Overview

This guide explains how to configure Solar Charge when you have an **AC-coupled solar system**, where your solar panels are connected to a separate solar inverter rather than directly to your battery inverter (like a Deye/Sunsynk).

## What is AC Coupling?

In an AC-coupled system:
- **Solar panels** → **Solar inverter** (e.g., Fronius, SolarEdge, Enphase) → AC power
- **Battery inverter** (e.g., Deye/Sunsynk) is connected to the AC side
- Solar power feeds into your home's AC distribution, not the battery inverter's DC inputs

### Why PV Power Sensors Show 0W

If you have a Deye/Sunsynk inverter in an AC-coupled configuration:
- `sensor.deye_pv1_power`, `sensor.deye_pv2_power`, `sensor.deye_pv3_power` will always be **0W**
- The PV voltages will be near 0V (e.g., 0.7V, 1.7V)
- This is **normal** - there are no DC-coupled panels on those inputs!

## Solution: Calculate Solar Power from Energy Accumulation

Since the Deye inverter doesn't expose a direct "solar power" sensor for AC-coupled systems, we can calculate it from the daily energy counter using a **derivative sensor**.

### How It Works

1. The Deye tracks total solar energy in `sensor.deye_day_pv_energy` (accumulates throughout the day)
2. A derivative sensor calculates the **rate of change** (kWh/hour → kW)
3. A template sensor converts it to Watts and makes it available for Solar Charge

### Configuration

Add this to your `configuration.yaml`:

```yaml
# Derivative sensor to calculate solar power from energy accumulation
sensor:
  - platform: derivative
    source: sensor.deye_day_pv_energy
    name: "Solar Power from Energy"
    unit_time: h
    time_window: "00:02:00"  # 2 minute average for smoothing
    unit: kW

template:
  - sensor:
      - name: "Solar Power"
        unique_id: solar_power_w
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        state: >
          {% set derivative = states('sensor.solar_power_from_energy') | float(0) %}
          {{ (derivative * 1000) | round(0) }}
        availability: >
          {{ states('sensor.solar_power_from_energy') not in ['unknown', 'unavailable'] }}
```

### After Adding Configuration

1. **Check Configuration**: Settings → System → Check Configuration
2. **Restart Home Assistant**
3. **Wait 2-5 minutes** for the derivative sensor to collect enough data points
4. **Verify**: Check that `sensor.solar_power` shows your current production

## Configure Solar Charge

Once your solar power sensor is working:

1. Go to **Settings** → **Devices & Services** → **Solar Charge**
2. Click **Configure**
3. In **PV Power Entities**:
   - Remove any `sensor.deye_pv1_power`, `sensor.deye_pv2_power`, `sensor.deye_pv3_power` entries
   - Add `sensor.solar_power`
4. Save and verify the Lovelace card shows solar production

## Verification

After configuration, your Solar Charge card should show:

```
SOLAR
2.4 kW        (or your current production)
PV power
```

And `sensor.solar_charge_pv_power` should match your actual solar production.

## Troubleshooting

### Sensor Shows "unavailable"

**Cause**: The derivative sensor needs at least 2 data points within the time window.

**Solution**: 
- Wait 2-5 minutes after restart
- Check that `sensor.deye_day_pv_energy` is available and updating
- Verify the derivative sensor `sensor.solar_power_from_energy` has a value

### Solar Power Reading is Too Smooth/Delayed

**Cause**: The time window is too large (5 minutes).

**Solution**: Reduce the time window in your configuration:

```yaml
sensor:
  - platform: derivative
    source: sensor.deye_day_pv_energy
    name: "Solar Power from Energy"
    unit_time: h
    time_window: "00:01:00"  # 1 minute for faster response
    unit: kW
```

### Solar Power Reading is Too Noisy/Jumpy

**Cause**: The time window is too small (1 minute).

**Solution**: Increase the time window for better smoothing:

```yaml
sensor:
  - platform: derivative
    source: sensor.deye_day_pv_energy
    name: "Solar Power from Energy"
    unit_time: h
    time_window: "00:05:00"  # 5 minutes for smoother readings
    unit: kW
```

### Reading is Negative or Shows Large Spikes

**Cause**: The daily energy counter resets at midnight, or there are gaps in data.

**Solution**: The derivative sensor should handle resets automatically, but if you see issues:

1. Check Home Assistant logs for derivative sensor errors
2. Ensure your Deye/Sunsynk addon is reading the energy sensor regularly
3. Consider using a statistics sensor as an intermediate step:

```yaml
sensor:
  - platform: statistics
    name: "Solar Energy Stats"
    entity_id: sensor.deye_day_pv_energy
    state_characteristic: change
    sampling_size: 10
    max_age:
      minutes: 10
```

## Alternative: Use Your Solar Inverter's Sensor

If you have your solar inverter integrated into Home Assistant, you can use its power sensor directly instead of calculating from the Deye energy counter.

### Fronius
```yaml
# Use the Fronius sensor directly
PV Power Entities: sensor.fronius_power_photovoltaics
```

### SolarEdge
```yaml
# Use the SolarEdge sensor directly
PV Power Entities: sensor.solaredge_current_power
```

### Enphase
```yaml
# Use the Enphase Envoy sensor directly
PV Power Entities: sensor.envoy_current_power_production
```

This approach provides more accurate, real-time readings without derivative calculations.

## Understanding the Energy Flow

In an AC-coupled system with Deye:

```
[Solar Panels] → [Solar Inverter] → [AC Distribution]
                                           ↓
                    [Grid] ←→ [AC Distribution] ←→ [Loads]
                                           ↓
                                    [Deye Battery Inverter] ←→ [Battery]
```

The Deye monitors:
- **Grid CT Power**: Net import/export at the grid connection point
- **Battery Power**: Charging/discharging
- **Load Power**: Total home consumption
- **Day PV Energy**: Total solar production (calculated from grid + battery + loads)

Since solar comes in on the AC side, the Deye calculates total solar production indirectly rather than measuring it directly from DC strings.

## Benefits of Derivative Approach

1. **Works without solar inverter integration**: Only needs Deye sensors
2. **Accurate over time**: Energy counters are more reliable than instantaneous power
3. **No additional hardware**: Uses existing sensors
4. **Handles multiple solar inverters**: If you have multiple AC-coupled solar inverters, the Deye sees total production

## Notes

- The derivative sensor will show 0W when solar production is stable (no change in energy counter)
- During very low production (clouds, morning/evening), readings may fluctuate more
- The time window parameter balances responsiveness vs. smoothness - adjust to your preference
- The sensor will automatically reset at midnight when `sensor.deye_day_pv_energy` resets

## Related Documentation

- [Main README](../README.md) - Solar Charge integration overview
- [Dashboard Cards](DASHBOARD_CARDS.md) - Lovelace card configuration
- [Monitoring Setup](MONITORING_SETUP.md) - Advanced monitoring with InfluxDB
- [Energy Optimization](ENERGY_OPTIMIZATION.md) - Optimization strategies

## Support

If you encounter issues with AC-coupled setups:

1. Check that `sensor.deye_day_pv_energy` is updating (should increase when solar is producing)
2. Verify the derivative sensor `sensor.solar_power_from_energy` shows a value (in kW)
3. Check Home Assistant logs for any derivative platform errors
4. Open an issue on GitHub with your configuration and sensor states

---

*Last updated: May 8, 2026*
