# Solar Charge Power Flow Card

A custom Home Assistant Lovelace card that displays your solar charging system with a visual power flow diagram.

## Features

- **Power Flow Visualization**: Shows real-time power flow between solar panels, grid, battery/EV charger, and home load
- **Animated Flow Lines**: Animated indicators show the direction of power flow
- **Comprehensive Metrics**: Display all important values like grid import, charger power, spare capacity, etc.
- **Control Interface**: Buttons to change charging mode and enable/disable control
- **Safety Indicators**: Visual indicators for sensor status and system health

## Installation

The card is automatically built to `custom_components/solar_charge/frontend/solar-charge-card.js` when you run:

```bash
cd frontend
npm run build
```

Home Assistant will automatically serve the card from the custom component's frontend folder.

## Usage

Add the card to your Lovelace dashboard using the UI or YAML:

### Using the UI

1. Edit your dashboard
2. Add a new card
3. Search for "Solar Charge" in the custom cards list
4. Configure your entity

### Using YAML

```yaml
type: custom:solar-charge-card
entity: sensor.solar_charge_status
title: "EV Charging"
show_controls: true
```

### Advanced Configuration

You can override specific entities if your setup uses different naming:

```yaml
type: custom:solar-charge-card
title: "Garage EV Charging"
show_controls: true
entities:
  status: sensor.my_custom_status
  pvPower: sensor.solar_panels_power
  gridImport: sensor.grid_power
  chargerPower: sensor.ev_charger_power
  loadPower: sensor.home_load
  batterySoc: sensor.battery_percentage
  mode: select.charging_mode
  controlEnabled: switch.charging_control
```

## Power Flow Diagram

The power flow diagram shows:

- **Solar Production**: Shows current PV power generation (top left)
- **Grid**: Shows grid import/export (top right) 
  - Blue when exporting to grid
  - Green when importing from grid
- **Home**: Central hub showing your home (center)
- **EV Charger**: Shows charging power with battery icon and SOC% (bottom left)
- **Home Load**: Shows current household consumption (bottom right)

Flow lines are animated when power is actively flowing in that direction.

### Visual Indicators

- **Green glow**: Active power flow
- **Blue glow**: Exporting power to grid
- **Animated lines**: Direction and presence of power flow
- **Values**: Real-time power readings in W or kW

## Development

To work on the card:

```bash
cd frontend
npm install
npm run build
```

The TypeScript source is in `solar-charge-card.ts` and builds to `../custom_components/solar_charge/frontend/solar-charge-card.js`.

## Card Sections

1. **Header**: Title, status, and status pill indicator
2. **Power Flow**: Visual power flow diagram (new!)
3. **Mode Row**: Current mode, control status, and car connection
4. **Primary Metrics**: Grid, EV charging, and target current
5. **Detailed Metrics**: All sensor values in a grid
6. **Reason**: Explanation of current charging decision
7. **Safety**: Status indicators for sensors and free window
8. **Controls**: Mode selection buttons and control toggle

## Responsive Design

The card adapts to different screen sizes:
- Desktop: 3-column grid for metrics, full power flow
- Mobile: 2-column grid, smaller power flow icons
