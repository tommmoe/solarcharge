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

  .header,
  .mode-row,
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
