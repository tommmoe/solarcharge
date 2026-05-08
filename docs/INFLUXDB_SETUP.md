# InfluxDB Setup for Solar Charge

## Install InfluxDB Add-on

1. Open Home Assistant
2. Go to **Settings > Add-ons > Add-on Store**
3. Search for **"InfluxDB"**
4. Click **Install**
5. After installation, click **Start**
6. Enable **"Start on boot"**

## Configure InfluxDB

1. In the InfluxDB add-on, go to **Configuration** tab
2. Set a password or leave default
3. Click **Save**
4. Go to **Info** tab and click **Open Web UI**
5. Create your database:
   - Database name: `homeassistant`
   - Retention policy: `autogen` (or customize)

## Add InfluxDB Integration to Home Assistant

Add this to your `configuration.yaml`:

```yaml
# InfluxDB Configuration
influxdb:
  host: a0d7b954-influxdb  # Default add-on hostname
  port: 8086
  database: homeassistant
  username: homeassistant
  password: homeassistant  # Change this in production!
  max_retries: 3
  default_measurement: state
  
  # Include specific Solar Charge and Deye sensors
  include:
    entities:
      # Solar Charge sensors
      - sensor.solar_charge_pv_power
      - sensor.solar_charge_grid_import
      - sensor.solar_charge_charger_power
      - sensor.solar_charge_base_grid_import
      - sensor.solar_charge_safe_import_limit
      - sensor.solar_charge_spare_capacity
      - sensor.solar_charge_target_amps
      - sensor.solar_charge_actual_current
      - sensor.solar_charge_offered_current
      
      # Deye inverter sensors
      - sensor.deye_battery_power
      - sensor.deye_battery_soc
      - sensor.deye_battery_voltage
      - sensor.deye_battery_current
      - sensor.deye_grid_power
      - sensor.deye_grid_voltage
      - sensor.deye_grid_current
      - sensor.deye_pv1_power
      - sensor.deye_pv2_power
      - sensor.deye_pv3_power
      - sensor.deye_inverter_power
      - sensor.deye_load_power
      - sensor.deye_essential_power
      - sensor.deye_non_essential_power
      
      # Energy totals
      - sensor.deye_day_pv_energy
      - sensor.deye_day_battery_charge
      - sensor.deye_day_battery_discharge
      - sensor.deye_day_grid_import
      - sensor.deye_day_grid_export
      - sensor.deye_day_load_energy

  # Optional: Tag entities for easier querying
  tags:
    source: homeassistant
    location: home
```

After adding this:
1. **Check Configuration**: Settings > System > Check Configuration
2. **Restart Home Assistant**: Settings > System > Restart

## Verify Data is Being Stored

1. Open InfluxDB Web UI from the add-on
2. Go to **Data Explorer**
3. Select database: `homeassistant`
4. Query: `SELECT * FROM "W" WHERE entity_id = 'solar_charge_pv_power' ORDER BY time DESC LIMIT 10`

You should see data points being recorded!
