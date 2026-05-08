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
    const batteryPower = this._number(entities.chargerPower);
    const loadPower = this._number(entities.loadPower);
    const batterySoc = this._number(entities.batterySoc);

    // Determine flow directions
    const pvActive = pvPower > 50;
    const gridActive = Math.abs(gridPower) > 50;
    const gridExporting = gridPower < -50;
    const batteryCharging = batteryPower > 50;
    const loadActive = loadPower > 50;

    return `
      <div class="flow-diagram">
        <!-- Solar -->
        <div class="flow-node solar ${pvActive ? 'active' : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24"><path d="M11.45 2v3.55L15 3l-1 4 3.6-1.6-2.2 3.6L20 7l-3.4 3L20 13h-3.4l2.2 3.6L15 15l1 4-3.55-2.5V20h-1v-3.55L8 19l1-4-3.6 1.6 2.2-3.6L4 15l3.4-3L4 9h3.4L5.2 5.4 9 7 8 3l3.45 2.55V2h1z" fill="currentColor"/></svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.pvPower)}</div>
          <div class="flow-label">Production</div>
        </div>

        <!-- Grid -->
        <div class="flow-node grid ${gridActive ? (gridExporting ? 'exporting' : 'importing') : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24"><path d="M14,2L20,8V10H14V16H20V18L14,24V22H10V18H4V16L2,14L4,12V6H10V2H14M12,4H10V12H4V14H10V20H12V14H18V12H12V4Z" fill="currentColor"/></svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.gridImport)}</div>
          <div class="flow-label">${gridExporting ? 'Export' : 'Grid'}</div>
        </div>

        <!-- Center Home -->
        <div class="flow-node home">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>
          </div>
        </div>

        <!-- Battery/Charger -->
        <div class="flow-node battery ${batteryCharging ? 'active' : ''}">
          <div class="flow-icon">
            ${this._batteryIcon(batterySoc)}
          </div>
          <div class="flow-value">${this._formatPower(entities.chargerPower)}</div>
          <div class="flow-label">EV Charger</div>
        </div>

        <!-- Load -->
        <div class="flow-node load ${loadActive ? 'active' : ''}">
          <div class="flow-icon">
            <svg viewBox="0 0 24 24"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" fill="currentColor"/></svg>
          </div>
          <div class="flow-value">${this._formatPower(entities.loadPower)}</div>
          <div class="flow-label">Load</div>
        </div>

        <!-- Flow lines -->
        <svg class="flow-lines" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
          <!-- Solar to Home -->
          <line x1="100" y1="75" x2="200" y2="150" class="flow-line ${pvActive ? 'active' : ''}" stroke-dasharray="4 4">
            ${pvActive ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Grid to Home -->
          <line x1="300" y1="75" x2="200" y2="150" class="flow-line ${gridActive && !gridExporting ? 'active' : ''}" stroke-dasharray="4 4">
            ${gridActive && !gridExporting ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Grid (export) -->
          <line x1="200" y1="150" x2="300" y2="75" class="flow-line ${gridExporting ? 'active export' : ''}" stroke-dasharray="4 4">
            ${gridExporting ? '<animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Battery/Charger -->
          <line x1="200" y1="150" x2="100" y2="225" class="flow-line ${batteryCharging ? 'active' : ''}" stroke-dasharray="4 4">
            ${batteryCharging ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
          
          <!-- Home to Load -->
          <line x1="200" y1="150" x2="300" y2="225" class="flow-line ${loadActive ? 'active' : ''}" stroke-dasharray="4 4">
            ${loadActive ? '<animate attributeName="stroke-dashoffset" from="0" to="8" dur="1s" repeatCount="indefinite"/>' : ''}
          </line>
        </svg>
      </div>
    `;
  }

  private _batteryIcon(soc: number): string {
    const level = Math.round(soc / 25) * 25; // Round to 0, 25, 50, 75, 100
    return `
      <svg viewBox="0 0 24 24">
        <path d="M16 18H8V6h8M16.67 4H15V2H9v2H7.33A1.33 1.33 0 0 0 6 5.33v15.33A1.34 1.34 0 0 0 7.33 22h9.34A1.34 1.34 0 0 0 18 20.67V5.33A1.33 1.33 0 0 0 16.67 4z" fill="currentColor" opacity="0.3"/>
        <path d="M8 ${6 + (100 - level) * 0.12}h8v${level * 0.12}" fill="currentColor"/>
        <text x="12" y="13" text-anchor="middle" font-size="6" fill="currentColor" font-weight="bold">${Math.round(soc)}%</text>
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
    left: 10%;
  }

  .flow-node.load {
    bottom: 0;
    right: 10%;
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
