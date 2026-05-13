type EntityState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

type HomeAssistant = {
  states: Record<string, EntityState | undefined>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
};

type EntityKey =
  | "status"
  | "reason"
  | "gridImport"
  | "chargerPower"
  | "baseGridImport"
  | "safeImportLimit"
  | "spareCapacity"
  | "targetAmps"
  | "actualCurrent"
  | "offeredCurrent"
  | "pvPower"
  | "loadPower"
  | "batterySoc"
  | "batteryPower"
  | "chargerStatus"
  | "allowedToCharge"
  | "inFreeWindow"
  | "gridSensorOk"
  | "chargerSensorOk"
  | "breakerLimitOk"
  | "mode"
  | "controlEnabled";

type CardConfig = {
  type: string;
  entity?: string;
  title?: string;
  show_controls?: boolean;
  entities?: Partial<Record<EntityKey, string>>;
};

const MODE_OPTIONS = [
  { label: "Off", option: "Off" },
  { label: "Solar", option: "Solar only" },
  { label: "Free", option: "Free hours only" },
  { label: "Hybrid", option: "Free hours or solar" },
  { label: "Force", option: "Force charge" },
];

const ENTITY_SUFFIXES: Record<EntityKey, [string, string]> = {
  status: ["sensor", "status"],
  reason: ["sensor", "reason"],
  gridImport: ["sensor", "grid_import"],
  chargerPower: ["sensor", "charger_power"],
  baseGridImport: ["sensor", "base_grid_import"],
  safeImportLimit: ["sensor", "safe_import_limit"],
  spareCapacity: ["sensor", "spare_capacity"],
  targetAmps: ["sensor", "target_amps"],
  actualCurrent: ["sensor", "actual_current"],
  offeredCurrent: ["sensor", "offered_current"],
  pvPower: ["sensor", "pv_power"],
  loadPower: ["sensor", "load_power"],
  batterySoc: ["sensor", "battery_soc"],
  batteryPower: ["sensor", "battery_power"],
  chargerStatus: ["sensor", "charger_status"],
  allowedToCharge: ["binary_sensor", "allowed_to_charge"],
  inFreeWindow: ["binary_sensor", "in_free_window"],
  gridSensorOk: ["binary_sensor", "grid_sensor_ok"],
  chargerSensorOk: ["binary_sensor", "charger_sensor_ok"],
  breakerLimitOk: ["binary_sensor", "breaker_limit_ok"],
  mode: ["select", "mode"],
  controlEnabled: ["switch", "control_enabled"],
};

class SolarChargeCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: CardConfig;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot?.addEventListener("click", (event) => {
      void this._handleClick(event);
    });
  }

  setConfig(config: CardConfig): void {
    if (!config.entity && !config.entities?.status) {
      throw new Error("Solar Charge card requires an entity or entities.status");
    }
    this._config = {
      title: "Solar Charge",
      show_controls: true,
      ...config,
    };
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._render();
  }

  getCardSize(): number {
    return 6;
  }

  static getStubConfig(): CardConfig {
    return {
      type: "custom:solar-charge-card",
      entity: "sensor.solar_charge_status",
      title: "Garage EV Charging",
      show_controls: true,
    };
  }

  private async _handleClick(event: Event): Promise<void> {
    const target = event
      .composedPath()
      .find(
        (node) => node instanceof HTMLElement && node.dataset.action,
      ) as HTMLElement | undefined;

    if (!target || !this._hass) {
      return;
    }

    const entities = this._entities();
    const action = target.dataset.action;

    if (action === "mode") {
      const option = target.dataset.option;
      if (!option || !entities.mode) {
        return;
      }
      await this._hass.callService("select", "select_option", {
        entity_id: entities.mode,
        option,
      });
      return;
    }

    if (action === "toggle-control" && entities.controlEnabled) {
      const enabled = this._isOn(entities.controlEnabled);
      await this._hass.callService("switch", enabled ? "turn_off" : "turn_on", {
        entity_id: entities.controlEnabled,
      });
    }
  }

  private _render(): void {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    const entities = this._entities();
    const status = this._stateText(entities.status);
    const reason = this._stateText(entities.reason);
    const allowed = this._isOn(entities.allowedToCharge);
    const controlEnabled = this._isOn(entities.controlEnabled);
    const mode = this._stateText(entities.mode);
    const chargerStatus = this._stateText(entities.chargerStatus);
    const carConnected = this._isCarConnected(chargerStatus);
    const grid = this._number(entities.gridImport);
    const safetyOk =
      this._isOn(entities.gridSensorOk) &&
      this._isOn(entities.chargerSensorOk) &&
      this._isOn(entities.breakerLimitOk);
    const statusClass = !safetyOk ? "danger" : allowed ? "active" : "idle";
    const showControls = this._config.show_controls !== false;

    this.shadowRoot.innerHTML = `
      <style>${CARD_CSS}</style>
      <article class="card ${statusClass}">
        <header class="header">
          <div>
            <h2>${escapeHtml(this._config.title || "Solar Charge")}</h2>
            <p>${escapeHtml(status)}</p>
          </div>
          <div class="status-pill ${statusClass}">
            <span></span>
            ${allowed ? "Allowed" : safetyOk ? "Waiting" : "Check"}
          </div>
        </header>

        <section class="power-flow">
          ${this._renderPowerFlow(entities)}
        </section>

        <section class="mode-row">
          <div>
            <span class="label">Mode</span>
            <strong>${escapeHtml(mode)}</strong>
          </div>
          <div>
            <span class="label">Control</span>
            <strong>${controlEnabled ? "Enabled" : "Off"}</strong>
          </div>
          <div>
            <span class="label">Car</span>
            <strong>${carConnected ? "Connected" : "Disconnected"}</strong>
          </div>
        </section>

        <section class="primary">
          ${this._metric("Grid", this._formatPower(entities.gridImport), grid < 0 ? "exporting" : "importing")}
          ${this._metric("EV charging", this._formatPower(entities.chargerPower), "live charger load")}
          ${this._metric("Target", this._formatCurrent(entities.targetAmps), "calculated limit")}
        </section>

        <section class="metrics">
          ${this._metric("Base import", this._formatPower(entities.baseGridImport), "excluding EV")}
          ${this._metric("Safe limit", this._formatPower(entities.safeImportLimit), "breaker protected")}
          ${this._metric("Spare", this._formatPower(entities.spareCapacity), "after buffer")}
          ${this._metric("Actual", this._formatCurrent(entities.actualCurrent), "charger current")}
          ${this._metric("Offered", this._formatCurrent(entities.offeredCurrent), "OCPP limit")}
          ${this._metric("Solar", this._formatPower(entities.pvPower), "PV power")}
          ${this._metric("Load", this._formatPower(entities.loadPower), "house consumption")}
          ${this._metric("Battery", this._formatPercent(entities.batterySoc), "state of charge")}
        </section>

        <section class="reason">
          <span class="label">Reason</span>
          <p>${escapeHtml(reason)}</p>
        </section>

        <section class="safety">
          ${this._safetyItem("Grid sensor", this._isOn(entities.gridSensorOk))}
          ${this._safetyItem("Charger", this._isOn(entities.chargerSensorOk))}
          ${this._safetyItem("Breaker", this._isOn(entities.breakerLimitOk))}
          ${this._safetyItem("Free window", this._isOn(entities.inFreeWindow))}
        </section>

        ${
          showControls
            ? `<section class="controls">
                <div class="mode-buttons">
                  ${MODE_OPTIONS.map(
                    (item) => `
                      <button
                        class="${mode === item.option ? "selected" : ""}"
                        data-action="mode"
                        data-option="${item.option}"
                        type="button"
                      >
                        ${item.label}
                      </button>
                    `,
                  ).join("")}
                </div>
                <button
                  class="control-toggle ${controlEnabled ? "enabled" : ""}"
                  data-action="toggle-control"
                  type="button"
                >
                  ${controlEnabled ? "Disable control" : "Enable control"}
                </button>
              </section>`
            : ""
        }
      </article>
    `;
  }

  private _renderPowerFlow(entities: Record<EntityKey, string | undefined>): string {
    const pvPower = this._number(entities.pvPower);
    const gridPower = this._number(entities.gridImport);
    const batteryPower = this._number(entities.batteryPower);
    const chargerPower = this._number(entities.chargerPower);
    const loadPower = this._number(entities.loadPower);
    const batterySoc = this._number(entities.batterySoc);

    // Determine flow directions
    const pvActive = pvPower > 50;
    const gridActive = Math.abs(gridPower) > 50;
    const gridExporting = gridPower < -50;
    const batteryCharging = batteryPower > 50;
    const batteryDischarging = batteryPower < -50;
    const chargerActive = chargerPower > 50;
    const loadActive = loadPower > 50;

    return `
      <div class="flow-diagram">
        <!-- Solar -->
        <div class="flow-node solar ${pvActive ? 'active' : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <!-- Sun -->
              <circle cx="12" cy="6" r="2.5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="18" y1="6" x2="16.5" y2="6"/>
              <line x1="15.5" y1="3.5" x2="14.5" y2="4.5"/>
              <line x1="15.5" y1="8.5" x2="14.5" y2="7.5"/>
              <line x1="6" y1="6" x2="7.5" y2="6"/>
              <line x1="8.5" y1="3.5" x2="9.5" y2="4.5"/>
              <line x1="8.5" y1="8.5" x2="9.5" y2="7.5"/>
              <!-- Solar panel stand -->
              <path d="M12 11 L12 16"/>
              <path d="M9 16 L15 16"/>
              <path d="M10 16 L10 18"/>
              <path d="M14 16 L14 18"/>
              <path d="M8 18 L16 18"/>
              <!-- Solar panel -->
              <rect x="7" y="9.5" width="10" height="5" rx="0.5"/>
              <line x1="9.5" y1="9.5" x2="9.5" y2="14.5"/>
              <line x1="12" y1="9.5" x2="12" y2="14.5"/>
              <line x1="14.5" y1="9.5" x2="14.5" y2="14.5"/>
              <line x1="7" y1="12" x2="17" y2="12"/>
            </svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.pvPower)}</div>
          <div class="flow-label">Production</div>
        </div>

        <!-- Grid -->
        <div class="flow-node grid ${gridActive ? (gridExporting ? 'exporting' : 'importing') : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <!-- Transmission tower -->
              <path d="M12 2 L12 22"/>
              <!-- Top crossbar -->
              <path d="M6 6 L18 6"/>
              <path d="M6 6 L8 4"/>
              <path d="M18 6 L16 4"/>
              <!-- Power lines from top -->
              <path d="M6 6 L4 7"/>
              <path d="M18 6 L20 7"/>
              <!-- Middle crossbar -->
              <path d="M7 11 L17 11"/>
              <path d="M7 11 L5 12"/>
              <path d="M17 11 L19 12"/>
              <!-- Lower crossbar -->
              <path d="M8 16 L16 16"/>
              <path d="M8 16 L6 17"/>
              <path d="M16 16 L18 17"/>
              <!-- Tower structure -->
              <path d="M10 8 L12 6 L14 8"/>
              <path d="M9.5 13 L12 11 L14.5 13"/>
              <path d="M9 18 L12 16 L15 18"/>
              <!-- Base -->
              <path d="M8 22 L16 22"/>
            </svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.gridImport)}</div>
          <div class="flow-label">${gridExporting ? 'Export' : 'Grid'}</div>
        </div>

        <!-- Center Home -->
        <div class="flow-node home">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <!-- House -->
              <path d="M3 12 L12 3 L21 12"/>
              <path d="M5 10 L5 20 C5 20.5 5.5 21 6 21 L18 21 C18.5 21 19 20.5 19 20 L19 10"/>
              <!-- Chimney -->
              <rect x="15" y="5" width="2" height="3"/>
              <!-- Power plug -->
              <circle cx="12" cy="14" r="3.5" fill="none" stroke-width="1.5"/>
              <rect x="10.5" y="11" width="1" height="1.5" fill="currentColor" stroke="none"/>
              <rect x="12.5" y="11" width="1" height="1.5" fill="currentColor" stroke="none"/>
              <path d="M12 17.5 L12 19.5" stroke-width="1.5"/>
              <path d="M10.5 19.5 L13.5 19.5" stroke-width="1.5"/>
            </svg>
          </div>
        </div>

        <!-- Battery -->
        <div class="flow-node battery ${batteryCharging ? 'active charging' : batteryDischarging ? 'active discharging' : ''}">
          <div class="flow-icon">
            ${this._batteryIcon(batterySoc, batteryCharging, batteryDischarging)}
          </div>
          <div class="flow-value">${this._formatPower(entities.batteryPower)}</div>
          <div class="flow-label">Battery</div>
        </div>

        <!-- EV Charger -->
        <div class="flow-node charger ${chargerActive ? 'active' : ''}">
          <div class="flow-icon">
            ${this._evChargerIcon(chargerActive)}
          </div>
          <div class="flow-value">${this._formatPower(entities.chargerPower)}</div>
          <div class="flow-label">EV Charger</div>
        </div>

        <!-- Load -->
        <div class="flow-node load ${loadActive ? 'active' : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <!-- House outline -->
              <path d="M3 12 L12 3 L21 12 L21 20 C21 20.5 20.5 21 20 21 L4 21 C3.5 21 3 20.5 3 20 Z"/>
              <!-- Power plug in center -->
              <circle cx="12" cy="14" r="3" fill="none"/>
              <rect x="10.8" y="11.5" width="0.8" height="1.2" fill="currentColor" stroke="none"/>
              <rect x="12.4" y="11.5" width="0.8" height="1.2" fill="currentColor" stroke="none"/>
              <line x1="12" y1="17" x2="12" y2="18.5"/>
              <line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>
            </svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.loadPower)}</div>
          <div class="flow-label">Load</div>
        </div>

        <!-- Flow lines -->
        <svg class="flow-lines" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
          <!-- Solar to Home -->
          <line x1="80" y1="75" x2="200" y2="150" class="flow-line ${pvActive ? 'active' : ''}" stroke-dasharray="4 4">
            ${pvActive ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Grid to Home -->
          <line x1="320" y1="75" x2="200" y2="150" class="flow-line ${gridActive && !gridExporting ? 'active' : ''}" stroke-dasharray="4 4">
            ${gridActive && !gridExporting ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Grid (export) -->
          <line x1="200" y1="150" x2="320" y2="75" class="flow-line ${gridExporting ? 'active export' : ''}" stroke-dasharray="4 4">
            ${gridExporting ? '<animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Battery (charging) -->
          <line x1="200" y1="150" x2="80" y2="225" class="flow-line ${batteryCharging ? 'active' : ''}" stroke-dasharray="4 4">
            ${batteryCharging ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Battery to Home (discharging) -->
          <line x1="80" y1="225" x2="200" y2="150" class="flow-line ${batteryDischarging ? 'active' : ''}" stroke-dasharray="4 4">
            ${batteryDischarging ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Charger -->
          <line x1="200" y1="150" x2="200" y2="225" class="flow-line ${chargerActive ? 'active' : ''}" stroke-dasharray="4 4">
            ${chargerActive ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Load -->
          <line x1="200" y1="150" x2="320" y2="225" class="flow-line ${loadActive ? 'active' : ''}" stroke-dasharray="4 4">
            ${loadActive ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
        </svg>
      </div>
    `;
  }

  private _batteryIcon(soc: number, charging: boolean, discharging: boolean): string {
    const socDisplay = `${Math.round(soc)}%`;
    // Calculate how many bars to show (5 bars total)
    const bars = Math.ceil(soc / 20); // 0-20% = 1 bar, 21-40% = 2 bars, etc.
    
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <!-- Battery outline -->
        <rect x="6" y="6" width="13" height="12" rx="1.5" stroke-width="1.8"/>
        <!-- Battery terminal -->
        <path d="M19 10 L21 10 L21 14 L19 14" stroke-width="1.8"/>
        
        <!-- Battery bars (filled based on SOC) -->
        ${bars >= 1 ? '<rect x="7.5" y="15.5" width="2" height="4" fill="currentColor" stroke="none"/>' : ''}
        ${bars >= 2 ? '<rect x="10" y="13.5" width="2" height="6" fill="currentColor" stroke="none"/>' : ''}
        ${bars >= 3 ? '<rect x="12.5" y="11.5" width="2" height="8" fill="currentColor" stroke="none"/>' : ''}
        ${bars >= 4 ? '<rect x="15" y="9.5" width="2" height="10" fill="currentColor" stroke="none"/>' : ''}
        ${bars >= 5 ? '<rect x="17.5" y="7.5" width="2" height="12" fill="currentColor" stroke="none"/>' : ''}
        
        <!-- Charging/Discharging indicator -->
        ${charging ? `
          <path d="M11 3 L9 6 L10.5 6 L9 9 L12 5 L10.5 5 Z" fill="currentColor" stroke="none"/>
        ` : discharging ? `
          <circle cx="10.5" cy="4" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="10.5" cy="6" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="10.5" cy="8" r="0.7" fill="currentColor" stroke="none"/>
        ` : ''}
        
        <!-- SOC percentage -->
        <text x="12.5" y="23.5" text-anchor="middle" font-size="3.5" fill="currentColor" font-weight="bold" stroke="none">${socDisplay}</text>
      </svg>
    `;
  }

  private _evChargerIcon(charging: boolean): string {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <!-- Base platform -->
        <rect x="6" y="19" width="12" height="2" rx="0.5" fill="currentColor" stroke="none"/>
        <!-- Main charger body -->
        <rect x="8" y="8" width="8" height="11" rx="1" stroke-width="1.5"/>
        <!-- Top cap -->
        <path d="M8 8 L8 6 C8 5.5 8.5 5 9 5 L15 5 C15.5 5 16 5.5 16 6 L16 8"/>
        <!-- Display screen -->
        <rect x="9.5" y="9.5" width="5" height="3" rx="0.3"/>
        <!-- Charging cable -->
        <path d="M16 12 Q18 12 18 14 L18 16" stroke-width="1.5"/>
        <circle cx="18" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
        ${charging ? `
          <!-- Lightning bolt when charging -->
          <path d="M13 14 L11 16.5 L12 16.5 L11 19 L14 15.5 L13 15.5 Z" fill="currentColor" stroke="none"/>
        ` : ''}
      </svg>
    `;
  }

  private _entities(): Record<EntityKey, string | undefined> {
    const configured = this._config?.entities || {};
    const base = this._baseObjectId();
    const entities = {} as Record<EntityKey, string | undefined>;

    for (const key of Object.keys(ENTITY_SUFFIXES) as EntityKey[]) {
      const [domain, suffix] = ENTITY_SUFFIXES[key];
      entities[key] = configured[key] || (base ? `${domain}.${base}_${suffix}` : undefined);
    }

    if (this._config?.entity) {
      entities.status = configured.status || this._config.entity;
    }

    return entities;
  }

  private _baseObjectId(): string | undefined {
    const statusEntity = this._config?.entities?.status || this._config?.entity;
    if (!statusEntity) {
      return undefined;
    }

    const objectId = statusEntity.split(".")[1];
    if (!objectId) {
      return undefined;
    }

    return objectId.endsWith("_status")
      ? objectId.slice(0, -"status".length - 1)
      : objectId;
  }

  private _metric(label: string, value: string, detail: string): string {
    return `
      <div class="metric">
        <span class="label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
    `;
  }

  private _safetyItem(label: string, ok: boolean): string {
    return `
      <div class="safety-item ${ok ? "ok" : "bad"}">
        <span></span>
        ${escapeHtml(label)}
      </div>
    `;
  }

  private _state(entityId?: string): EntityState | undefined {
    return entityId ? this._hass?.states[entityId] : undefined;
  }

  private _stateText(entityId?: string): string {
    const state = this._state(entityId);
    if (!state || state.state === "unknown" || state.state === "unavailable") {
      return "-";
    }
    return state.state;
  }

  private _isOn(entityId?: string): boolean {
    return this._state(entityId)?.state === "on";
  }

  private _number(entityId?: string): number {
    const value = Number(this._state(entityId)?.state);
    return Number.isFinite(value) ? value : 0;
  }

  private _formatPower(entityId?: string): string {
    const state = this._state(entityId);
    const value = Number(state?.state);
    if (!state || !Number.isFinite(value)) {
      return "-";
    }
    const unit = String(state.attributes.unit_of_measurement || "W");
    const watts = unit.toLowerCase() === "kw" ? value * 1000 : value;
    if (Math.abs(watts) >= 1000) {
      return `${(watts / 1000).toFixed(1)} kW`;
    }
    return `${Math.round(watts)} W`;
  }

  private _formatCurrent(entityId?: string): string {
    const state = this._state(entityId);
    const value = Number(state?.state);
    if (!state || !Number.isFinite(value)) {
      return "-";
    }
    const rounded = Math.abs(value - Math.round(value)) < 0.05
      ? Math.round(value).toString()
      : value.toFixed(1);
    return `${rounded} A`;
  }

  private _formatPercent(entityId?: string): string {
    const state = this._state(entityId);
    const value = Number(state?.state);
    if (!state || !Number.isFinite(value)) {
      return "-";
    }
    return `${Math.round(value)}%`;
  }

  private _isCarConnected(chargerStatus: string): boolean {
    if (!chargerStatus || chargerStatus === "-") {
      return false;
    }

    const statusLower = chargerStatus.toLowerCase();

    // OCPP status indicating NO car connected
    if (statusLower === "available") {
      return false;
    }

    // Common status values indicating car is NOT connected
    const disconnectedStates = new Set([
      "unavailable",
      "disconnected",
      "not connected",
      "idle",
      "ready",
    ]);
    if (disconnectedStates.has(statusLower)) {
      return false;
    }

    // All other statuses likely indicate a car is connected
    // (Preparing, Charging, SuspendedEV, SuspendedEVSE, Finishing, etc.)
    return true;
  }
}

const CARD_CSS = `
  :host {
    display: block;
    color: var(--primary-text-color, #1f2933);
  }

  .card {
    background: var(--ha-card-background, var(--card-background-color, #fff));
    border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.22));
    border-radius: var(--ha-card-border-radius, 8px);
    box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0, 0, 0, 0.16));
    overflow: hidden;
  }

  .card::before {
    content: "";
    display: block;
    height: 4px;
    background: #6b7280;
  }

  .card.active::before {
    background: #14866d;
  }

  .card.danger::before {
    background: #c24135;
  }

  .power-flow {
    padding-top: 20px;
    padding-bottom: 20px;
    background: linear-gradient(to bottom, rgba(240, 243, 246, 0.4), transparent);
  }

  .flow-diagram {
    position: relative;
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    aspect-ratio: 4 / 3;
  }

  .flow-node {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition: all 0.3s ease;
  }

  .flow-node.solar {
    top: 0;
    left: 10%;
  }

  .flow-node.grid {
    top: 0;
    right: 10%;
  }

  .flow-node.home {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .flow-node.battery {
    bottom: 0;
    left: 5%;
  }

  .flow-node.charger {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
  }

  .flow-node.load {
    bottom: 0;
    right: 5%;
  }

  .flow-icon {
    width: 56px;
    height: 56px;
    padding: 12px;
    border-radius: 50%;
    background: var(--card-background-color, #fff);
    border: 2px solid var(--divider-color, rgba(127, 127, 127, 0.22));
    color: var(--secondary-text-color, #667085);
    transition: all 0.3s ease;
  }

  .flow-node.home .flow-icon {
    width: 64px;
    height: 64px;
    border-width: 3px;
    border-color: var(--primary-color, #1d6f9f);
    color: var(--primary-color, #1d6f9f);
  }

  .flow-node.active .flow-icon {
    border-color: #14866d;
    color: #14866d;
    background: rgba(20, 134, 109, 0.08);
    box-shadow: 0 0 0 4px rgba(20, 134, 109, 0.12);
  }

  .flow-node.exporting .flow-icon {
    border-color: #2563eb;
    color: #2563eb;
    background: rgba(37, 99, 235, 0.08);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  }

  .flow-node.discharging .flow-icon {
    border-color: #f59e0b;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
  }

  .flow-icon svg {
    width: 100%;
    height: 100%;
  }

  .flow-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--primary-text-color, #1f2933);
    white-space: nowrap;
  }

  .flow-label {
    font-size: 0.75rem;
    color: var(--secondary-text-color, #667085);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    font-weight: 600;
  }

  .flow-lines {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .flow-line {
    stroke: var(--divider-color, rgba(127, 127, 127, 0.3));
    stroke-width: 2;
    fill: none;
    transition: stroke 0.3s ease;
  }

  .flow-line.active {
    stroke: #14866d;
    stroke-width: 3;
  }

  .flow-line.export {
    stroke: #2563eb;
  }

  .header,
  .mode-row,
  .power-flow,
  .primary,
  .metrics,
  .reason,
  .safety,
  .controls {
    padding-inline: 16px;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    padding-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: 0;
  }

  p {
    margin: 0;
  }

  .header p,
  .label,
  small {
    color: var(--secondary-text-color, #667085);
  }

  .header p {
    margin-top: 4px;
    font-size: 0.9rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(107, 114, 128, 0.12);
    color: var(--primary-text-color, #1f2933);
    font-size: 0.82rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .status-pill span,
  .safety-item span {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }

  .status-pill.active {
    background: rgba(20, 134, 109, 0.14);
    color: #14866d;
  }

  .status-pill.danger {
    background: rgba(194, 65, 53, 0.14);
    color: #c24135;
  }

  .mode-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
    border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  }

  .mode-row > div {
    min-width: 0;
    padding: 12px 0;
  }

  .mode-row > div + div {
    padding-left: 16px;
    border-left: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  }

  .label {
    display: block;
    margin-bottom: 4px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  strong {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 1rem;
    line-height: 1.25;
  }

  .primary,
  .metrics {
    display: grid;
    gap: 8px;
  }

  .primary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-top: 14px;
    padding-bottom: 8px;
  }

  .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-bottom: 14px;
  }

  .metric {
    min-width: 0;
    min-height: 82px;
    padding: 10px;
    border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-background-color, #f7f8fa) 72%, transparent);
  }

  .metric strong {
    font-size: 1.28rem;
    font-weight: 720;
  }

  .metric small {
    display: block;
    margin-top: 6px;
    font-size: 0.76rem;
    line-height: 1.25;
  }

  .reason {
    padding-top: 12px;
    padding-bottom: 12px;
    border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  }

  .reason p {
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .safety {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding-top: 12px;
    padding-bottom: 12px;
    border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  }

  .safety-item {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--secondary-text-color, #667085);
    font-size: 0.78rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .safety-item.ok {
    color: #14866d;
  }

  .safety-item.bad {
    color: #c24135;
  }

  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    padding-top: 12px;
    padding-bottom: 16px;
    border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  }

  .mode-buttons {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }

  button {
    min-width: 0;
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.26));
    border-radius: 8px;
    background: var(--secondary-background-color, #eef1f5);
    color: var(--primary-text-color, #1f2933);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--primary-color, #1d6f9f);
  }

  button.selected,
  .control-toggle.enabled {
    border-color: transparent;
    background: var(--primary-color, #1d6f9f);
    color: var(--text-primary-color, #fff);
  }

  .control-toggle {
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .header {
      align-items: stretch;
      flex-direction: column;
    }

    .status-pill {
      width: fit-content;
    }

    .flow-icon {
      width: 48px;
      height: 48px;
      padding: 10px;
    }

    .flow-node.home .flow-icon {
      width: 56px;
      height: 56px;
    }

    .flow-value {
      font-size: 0.85rem;
    }

    .flow-label {
      font-size: 0.68rem;
    }

    .primary,
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .safety {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .controls {
      grid-template-columns: 1fr;
    }

    .mode-buttons {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

if (!customElements.get("solar-charge-card")) {
  customElements.define("solar-charge-card", SolarChargeCard);
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "solar-charge-card",
  name: "Solar Charge",
  description: "Operational EV charging card for Solar Charge",
});

export {};
