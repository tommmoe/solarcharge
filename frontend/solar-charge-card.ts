// Solar Charge – Lovelace cards
// Card 1: solar-charge-card       — live power flow diagram
// Card 2: solar-charge-tariff-card — tariff timeline + ZeroHero + overnight reserve

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

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] ?? c,
  );
}

function stateNum(state: EntityState | undefined): number {
  const v = Number(state?.state);
  return Number.isFinite(v) ? v : 0;
}

function stateText(state: EntityState | undefined): string {
  if (!state || state.state === "unknown" || state.state === "unavailable") return "-";
  return state.state;
}

function isOn(state: EntityState | undefined): boolean {
  return state?.state === "on";
}

function fmtPower(state: EntityState | undefined): string {
  const v = Number(state?.state);
  if (!state || !Number.isFinite(v)) return "-";
  const unit = String(state.attributes.unit_of_measurement ?? "W");
  const w = unit.toLowerCase() === "kw" ? v * 1000 : v;
  return Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;
}

function fmtKwh(kwh: number | null | undefined, decimals = 2): string {
  if (kwh == null || !Number.isFinite(kwh)) return "-";
  return `${kwh.toFixed(decimals)} kWh`;
}

function fmtCurrent(state: EntityState | undefined): string {
  const v = Number(state?.state);
  if (!state || !Number.isFinite(v)) return "-";
  const r = Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v).toString() : v.toFixed(1);
  return `${r} A`;
}

function fmtPct(state: EntityState | undefined): string {
  const v = Number(state?.state);
  if (!state || !Number.isFinite(v)) return "-";
  return `${Math.round(v)}%`;
}

function fmtRelTime(iso: string | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function hoursSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return (Date.now() - then) / 3600000;
}

// ═══════════════════════════════════════════════════════════════════════════
// Card 1 — Power Flow
// ═══════════════════════════════════════════════════════════════════════════

type FlowEntityKey =
  | "status" | "reason" | "gridImport" | "chargerPower" | "baseGridImport"
  | "safeImportLimit" | "spareCapacity" | "targetAmps" | "actualCurrent"
  | "offeredCurrent" | "pvPower" | "loadPower" | "batterySoc" | "batteryPower"
  | "chargerStatus" | "allowedToCharge" | "inFreeWindow" | "gridSensorOk"
  | "chargerSensorOk" | "breakerLimitOk" | "mode" | "controlEnabled"
  | "zeroheroEligible" | "zeroheroImportKwh" | "superExportKwh"
  | "overnightReservePct"
  | "evCharging" | "evEnergyToday" | "evLastSessionEnergy" | "evLastCharged";

type FlowCardConfig = {
  type: string;
  entity?: string;
  title?: string;
  show_controls?: boolean;
  entities?: Partial<Record<FlowEntityKey, string>>;
};

const FLOW_SUFFIXES: Record<FlowEntityKey, [string, string]> = {
  status:             ["sensor",        "status"],
  reason:             ["sensor",        "reason"],
  gridImport:         ["sensor",        "grid_import"],
  chargerPower:       ["sensor",        "charger_power"],
  baseGridImport:     ["sensor",        "base_grid_import"],
  safeImportLimit:    ["sensor",        "safe_import_limit"],
  spareCapacity:      ["sensor",        "spare_capacity"],
  targetAmps:         ["sensor",        "target_amps"],
  actualCurrent:      ["sensor",        "actual_current"],
  offeredCurrent:     ["sensor",        "offered_current"],
  pvPower:            ["sensor",        "pv_power"],
  loadPower:          ["sensor",        "load_power"],
  batterySoc:         ["sensor",        "battery_soc"],
  batteryPower:       ["sensor",        "battery_power"],
  chargerStatus:      ["sensor",        "charger_status"],
  allowedToCharge:    ["binary_sensor", "allowed_to_charge"],
  inFreeWindow:       ["binary_sensor", "in_free_window"],
  gridSensorOk:       ["binary_sensor", "grid_sensor_ok"],
  chargerSensorOk:    ["binary_sensor", "charger_sensor_ok"],
  breakerLimitOk:     ["binary_sensor", "breaker_limit_ok"],
  zeroheroEligible:   ["binary_sensor", "zerohero_eligible"],
  zeroheroImportKwh:  ["sensor",        "zerohero_import_kwh"],
  superExportKwh:     ["sensor",        "super_export_kwh"],
  overnightReservePct:["sensor",        "overnight_reserve_pct"],
  mode:               ["select",        "mode"],
  controlEnabled:     ["switch",        "control_enabled"],
  evCharging:         ["binary_sensor", "ev_charging"],
  evEnergyToday:      ["sensor",        "ev_energy_today"],
  evLastSessionEnergy:["sensor",        "ev_last_session_energy"],
  evLastCharged:      ["sensor",        "ev_last_charged"],
};

const MODE_OPTIONS = [
  { label: "Off",    option: "Off" },
  { label: "Solar",  option: "Solar only" },
  { label: "Free",   option: "Free hours only" },
  { label: "Hybrid", option: "Free hours or solar" },
  { label: "Force",  option: "Force charge" },
];

// GloBird Zero Hero tariff periods
type TariffPeriod = { start: number; end: number; label: string; color: string; cost: string };
const TARIFF_PERIODS: TariffPeriod[] = [
  { start: 0,  end: 11, label: "Shoulder",    color: "#4b5563", cost: "46.2c" },
  { start: 11, end: 14, label: "Free ☀️",     color: "#16a34a", cost: "FREE" },
  { start: 14, end: 16, label: "Shoulder",    color: "#4b5563", cost: "46.2c" },
  { start: 16, end: 18, label: "Peak",        color: "#b45309", cost: "57.2c" },
  { start: 18, end: 21, label: "⚡ Export",   color: "#7c3aed", cost: "20c*" },
  { start: 21, end: 23, label: "Peak",        color: "#b45309", cost: "57.2c" },
  { start: 23, end: 24, label: "Shoulder",    color: "#4b5563", cost: "46.2c" },
];

function currentPeriod(hour: number): TariffPeriod {
  return TARIFF_PERIODS.find(p => hour >= p.start && hour < p.end) ?? TARIFF_PERIODS[0];
}

class SolarChargeCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: FlowCardConfig;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e) => void this._handleClick(e));
  }

  setConfig(config: FlowCardConfig): void {
    if (!config.entity && !config.entities?.status) {
      throw new Error("Solar Charge card requires entity or entities.status");
    }
    this._config = { title: "Solar Charge", show_controls: true, ...config };
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._render();
  }

  getCardSize(): number { return 8; }

  static getStubConfig(): FlowCardConfig {
    return { type: "custom:solar-charge-card", entity: "sensor.solar_charge_status", title: "Solar Charge" };
  }

  private _baseId(): string | undefined {
    const id = (this._config?.entities?.status ?? this._config?.entity)?.split(".")[1];
    return id?.endsWith("_status") ? id.slice(0, -7) : id;
  }

  private _ent(): Record<FlowEntityKey, string | undefined> {
    const cfg = this._config?.entities ?? {};
    const base = this._baseId();
    const out = {} as Record<FlowEntityKey, string | undefined>;
    for (const key of Object.keys(FLOW_SUFFIXES) as FlowEntityKey[]) {
      const [domain, suffix] = FLOW_SUFFIXES[key];
      out[key] = cfg[key] ?? (base ? `${domain}.${base}_${suffix}` : undefined);
    }
    if (this._config?.entity) out.status = cfg.status ?? this._config.entity;
    return out;
  }

  private _s(id?: string): EntityState | undefined {
    return id ? this._hass?.states[id] : undefined;
  }

  private async _handleClick(e: Event): Promise<void> {
    const target = e.composedPath().find(
      (n) => n instanceof HTMLElement && (n as HTMLElement).dataset.action
    ) as HTMLElement | undefined;
    if (!target || !this._hass) return;

    const ent = this._ent();
    if (target.dataset.action === "mode" && ent.mode) {
      await this._hass.callService("select", "select_option", {
        entity_id: ent.mode, option: target.dataset.option,
      });
    } else if (target.dataset.action === "toggle-control" && ent.controlEnabled) {
      const on = isOn(this._s(ent.controlEnabled));
      await this._hass.callService("switch", on ? "turn_off" : "turn_on", {
        entity_id: ent.controlEnabled,
      });
    }
  }

  private _render(): void {
    if (!this.shadowRoot || !this._config) return;

    const ent = this._ent();
    const status      = stateText(this._s(ent.status));
    const allowed     = isOn(this._s(ent.allowedToCharge));
    const ctrlEnabled = isOn(this._s(ent.controlEnabled));
    const safetyOk    = isOn(this._s(ent.gridSensorOk)) &&
                        isOn(this._s(ent.chargerSensorOk)) &&
                        isOn(this._s(ent.breakerLimitOk));
    const mode        = stateText(this._s(ent.mode));
    const chargerSt   = stateText(this._s(ent.chargerStatus));
    const carConnected = this._carConnected(chargerSt);
    const showControls = this._config.show_controls !== false;
    const statusClass  = !safetyOk ? "danger" : allowed ? "active" : "idle";

    // Tariff period
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const period = currentPeriod(nowH);
    const inExportWindow = nowH >= 18 && nowH < 21;
    const zeroheroOk = inExportWindow && isOn(this._s(ent.zeroheroEligible));

    // EV charge history
    const evCharging = isOn(this._s(ent.evCharging));
    const lastChargedIso = this._s(ent.evLastCharged)?.state;
    const lastChargedOk = !!lastChargedIso &&
      lastChargedIso !== "unknown" && lastChargedIso !== "unavailable";
    const idleHours = lastChargedOk ? hoursSince(lastChargedIso) : null;
    const staleCharge = carConnected && !evCharging &&
      (!lastChargedOk || (idleHours != null && idleHours >= 24));

    this.shadowRoot.innerHTML = `
      <style>${FLOW_CSS}</style>
      <article class="card ${statusClass}">

        <header class="header">
          <div class="header-left">
            <h2>${escapeHtml(this._config.title ?? "Solar Charge")}</h2>
            <p>${escapeHtml(status)}</p>
          </div>
          <div class="header-right">
            ${inExportWindow ? `
              <div class="zerohero-badge ${zeroheroOk ? "ok" : "risk"}">
                ${zeroheroOk ? "✓" : "⚠"} ZeroHero
              </div>` : ""}
            <div class="period-badge" style="background:${period.color}20;color:${period.color};border-color:${period.color}40">
              ${escapeHtml(period.label)} · ${escapeHtml(period.cost)}
            </div>
            <div class="status-pill ${statusClass}">
              <span></span>${allowed ? "Charging" : safetyOk ? "Waiting" : "Check"}
            </div>
          </div>
        </header>

        ${staleCharge ? `
          <section class="stale-banner">
            ⚠ Plugged in but hasn't charged ${lastChargedOk
              ? `in ${fmtRelTime(lastChargedIso).replace(" ago", "")}`
              : "yet"} — check reason below
          </section>` : ""}

        <section class="flow-section">
          ${this._renderFlow(ent)}
        </section>

        <section class="info-row">
          <div><span class="lbl">Mode</span><strong>${escapeHtml(mode)}</strong></div>
          <div><span class="lbl">Control</span><strong>${ctrlEnabled ? "On" : "Off"}</strong></div>
          <div><span class="lbl">Car</span><strong>${carConnected ? "Connected" : "Away"}</strong></div>
          <div><span class="lbl">Free window</span><strong>${isOn(this._s(ent.inFreeWindow)) ? "Active ☀️" : "—"}</strong></div>
        </section>

        <section class="metrics-grid">
          ${this._metric("Base import", fmtPower(this._s(ent.baseGridImport)), "excl. EV")}
          ${this._metric("Safe limit",  fmtPower(this._s(ent.safeImportLimit)), "breaker")}
          ${this._metric("Spare",       fmtPower(this._s(ent.spareCapacity)),   "headroom")}
          ${this._metric("Target",      fmtCurrent(this._s(ent.targetAmps)),    "calc. limit")}
          ${this._metric("Actual",      fmtCurrent(this._s(ent.actualCurrent)), "charger")}
          ${this._metric("Reserve",     fmtPct(this._s(ent.overnightReservePct)), "overnight")}
        </section>

        <section class="ev-history">
          <div class="ev-stats">
            <div>
              <span class="lbl">EV today</span>
              <strong>${fmtKwh(Number(this._s(ent.evEnergyToday)?.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last session</span>
              <strong>${fmtKwh(Number(this._s(ent.evLastSessionEnergy)?.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last charged</span>
              <strong class="${staleCharge ? "warn-text" : ""}">
                ${evCharging ? "Charging now ⚡" : lastChargedOk ? fmtRelTime(lastChargedIso) : "never"}
              </strong>
            </div>
          </div>
          ${this._renderEvWeek(ent)}
        </section>

        <section class="reason-row">
          <span class="lbl">Reason</span>
          <p>${escapeHtml(stateText(this._s(ent.reason)))}</p>
        </section>

        <section class="safety-row">
          ${this._safetyItem("Grid sensor", isOn(this._s(ent.gridSensorOk)))}
          ${this._safetyItem("Charger",     isOn(this._s(ent.chargerSensorOk)))}
          ${this._safetyItem("Breaker",     isOn(this._s(ent.breakerLimitOk)))}
          ${this._safetyItem("Free window", isOn(this._s(ent.inFreeWindow)))}
        </section>

        ${showControls ? `
          <section class="controls-row">
            <div class="mode-buttons">
              ${MODE_OPTIONS.map(m => `
                <button class="${mode === m.option ? "sel" : ""}"
                  data-action="mode" data-option="${m.option}" type="button">
                  ${m.label}
                </button>`).join("")}
            </div>
            <button class="ctrl-toggle ${ctrlEnabled ? "on" : ""}"
              data-action="toggle-control" type="button">
              ${ctrlEnabled ? "Disable" : "Enable"} control
            </button>
          </section>` : ""}

      </article>`;
  }

  // ── Power flow diagram ────────────────────────────────────────────────

  private _renderFlow(ent: Record<FlowEntityKey, string | undefined>): string {
    const pv      = stateNum(this._s(ent.pvPower));
    const grid    = stateNum(this._s(ent.gridImport));
    const batPwr  = stateNum(this._s(ent.batteryPower));
    const evPwr   = stateNum(this._s(ent.chargerPower));
    const load    = stateNum(this._s(ent.loadPower));
    const soc     = stateNum(this._s(ent.batterySoc));

    const pvOn    = pv > 50;
    const gridImp = grid > 50;
    const gridExp = grid < -50;
    const batChg  = batPwr > 50;
    const batDis  = batPwr < -50;
    const evOn    = evPwr > 50;
    const loadOn  = load > 50;

    // Arc colours
    const pvCol   = "#f59e0b";
    const gridCol = gridExp ? "#22c55e" : "#ef4444";
    const batCol  = batChg ? "#3b82f6" : batDis ? "#f59e0b" : "#6b7280";
    const evCol   = "#a855f7";
    const loadCol = "#64748b";

    return `
    <div class="flow-wrap">
      <!-- SVG layer for paths -->
      <svg class="flow-svg" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet">
        <defs>
          ${this._gradDef("g-pv",   "#f59e0b", pvOn)}
          ${this._gradDef("g-grid", gridCol,   gridImp || gridExp)}
          ${this._gradDef("g-bat",  batCol,    batChg || batDis)}
          ${this._gradDef("g-ev",   evCol,     evOn)}
          ${this._gradDef("g-load", loadCol,   loadOn)}
        </defs>

        <!-- Solar → Home -->
        ${this._flowPath("M 72 55 C 72 130 180 55 180 130",
          pvOn, pvCol, "g-pv", "0 → 1", fmtPower(this._s(ent.pvPower)))}

        <!-- Grid → Home  /  Home → Grid -->
        ${this._flowPath("M 288 55 C 288 130 180 55 180 130",
          gridImp, gridCol, "g-grid", "1 → 0", gridImp ? fmtPower(this._s(ent.gridImport)) : "")}
        ${this._flowPath("M 180 130 C 180 55 288 130 288 55",
          gridExp, "#22c55e", "g-grid", "0 → 1", gridExp ? fmtPower(this._s(ent.gridImport)) : "")}

        <!-- Home → Battery  /  Battery → Home -->
        ${this._flowPath("M 180 130 C 180 210 60 130 60 210",
          batChg, batCol, "g-bat", "0 → 1", batChg ? fmtPower(this._s(ent.batteryPower)) : "")}
        ${this._flowPath("M 60 210 C 60 130 180 210 180 130",
          batDis, batCol, "g-bat", "0 → 1", batDis ? fmtPower(this._s(ent.batteryPower)) : "")}

        <!-- Home → EV -->
        ${this._flowPath("M 180 130 L 180 210",
          evOn, evCol, "g-ev", "0 → 1", evOn ? fmtPower(this._s(ent.chargerPower)) : "")}

        <!-- Home → Load -->
        ${this._flowPath("M 180 130 C 180 210 300 130 300 210",
          loadOn, loadCol, "g-load", "0 → 1", loadOn ? fmtPower(this._s(ent.loadPower)) : "")}
      </svg>

      <!-- Nodes -->
      <div class="node solar ${pvOn ? "on" : ""}" style="--nc:${pvCol}">
        ${this._solarIcon()}
        <div class="nval">${fmtPower(this._s(ent.pvPower))}</div>
        <div class="nlbl">Solar</div>
      </div>

      <div class="node grid ${gridImp ? "on" : gridExp ? "exp" : ""}" style="--nc:${gridCol}">
        ${this._gridIcon()}
        <div class="nval">${fmtPower(this._s(ent.gridImport))}</div>
        <div class="nlbl">${gridExp ? "Exporting" : "Grid"}</div>
      </div>

      <div class="node home" style="--nc:var(--primary-color,#1d6f9f)">
        ${this._homeIcon()}
      </div>

      <div class="node battery ${batChg ? "chg" : batDis ? "dis" : ""}" style="--nc:${batCol}">
        ${this._batteryRing(soc, batChg, batDis)}
        <div class="nval">${fmtPower(this._s(ent.batteryPower))}</div>
        <div class="nlbl">Battery</div>
      </div>

      <div class="node ev ${evOn ? "on" : ""}" style="--nc:${evCol}">
        ${this._evIcon(evOn)}
        <div class="nval">${fmtPower(this._s(ent.chargerPower))}</div>
        <div class="nlbl">EV</div>
      </div>

      <div class="node house-load ${loadOn ? "on" : ""}" style="--nc:${loadCol}">
        ${this._loadIcon()}
        <div class="nval">${fmtPower(this._s(ent.loadPower))}</div>
        <div class="nlbl">Load</div>
      </div>
    </div>`;
  }

  private _gradDef(id: string, color: string, active: boolean): string {
    if (!active) return "";
    return `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.4"/>
    </linearGradient>`;
  }

  private _flowPath(
    d: string, active: boolean, color: string,
    gradId: string, animDir: string, label: string
  ): string {
    if (!active) {
      return `<path d="${d}" fill="none" stroke="var(--divider-color,rgba(127,127,127,0.2))" stroke-width="2"/>`;
    }
    const fromOffset = animDir === "0 → 1" ? "0" : "24";
    const toOffset   = animDir === "0 → 1" ? "24" : "0";
    return `
      <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="6 10">
        <animate attributeName="stroke-dashoffset"
          from="${fromOffset}" to="${toOffset}" dur="1.2s" repeatCount="indefinite"/>
      </path>
      ${label ? `<title>${label}</title>` : ""}`;
  }

  // ── EV 7-day history strip ────────────────────────────────────────────

  private _renderEvWeek(ent: Record<FlowEntityKey, string | undefined>): string {
    const totals = this._s(ent.evEnergyToday)?.attributes?.daily_totals as
      Record<string, number> | undefined;

    const days: { date: string; kwh: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const kwh = Number(totals?.[iso] ?? 0);
      days.push({
        date: iso,
        kwh: Number.isFinite(kwh) ? kwh : 0,
        label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      });
    }

    const max = Math.max(...days.map((d) => d.kwh), 1);
    return `
    <div class="ev-week">
      ${days.map((d, i) => `
        <div class="ev-day" title="${d.date}: ${d.kwh.toFixed(1)} kWh">
          <span class="ev-day-val">${d.kwh >= 0.05 ? d.kwh.toFixed(1) : ""}</span>
          <div class="ev-day-bar">
            <div class="ev-day-fill ${d.kwh >= 0.05 ? "" : "empty"} ${i === 6 ? "today" : ""}"
              style="height:${Math.max(4, (d.kwh / max) * 100).toFixed(1)}%"></div>
          </div>
          <span class="ev-day-lbl ${i === 6 ? "today" : ""}">${d.label}</span>
        </div>`).join("")}
    </div>`;
  }

  // ── Node icons ────────────────────────────────────────────────────────

  private _solarIcon(): string {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="7" r="2.5"/>
      <line x1="12" y1="2" x2="12" y2="3.5"/>
      <line x1="17.5" y1="7" x2="16" y2="7"/>
      <line x1="15.5" y1="3.5" x2="14.5" y2="4.5"/>
      <line x1="15.5" y1="10.5" x2="14.5" y2="9.5"/>
      <line x1="6.5" y1="7" x2="8" y2="7"/>
      <line x1="8.5" y1="3.5" x2="9.5" y2="4.5"/>
      <line x1="8.5" y1="10.5" x2="9.5" y2="9.5"/>
      <rect x="7" y="11" width="10" height="5.5" rx="0.5"/>
      <line x1="9.5" y1="11" x2="9.5" y2="16.5"/>
      <line x1="12" y1="11" x2="12" y2="16.5"/>
      <line x1="14.5" y1="11" x2="14.5" y2="16.5"/>
      <line x1="7" y1="13.5" x2="17" y2="13.5"/>
      <line x1="12" y1="16.5" x2="12" y2="19"/>
      <line x1="9" y1="19" x2="15" y2="19"/>
      <line x1="10" y1="19" x2="10" y2="21"/>
      <line x1="14" y1="19" x2="14" y2="21"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
    </svg>`;
  }

  private _gridIcon(): string {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="2" x2="12" y2="22"/>
      <line x1="5" y1="6" x2="19" y2="6"/>
      <line x1="5" y1="6" x2="3" y2="8"/>
      <line x1="19" y1="6" x2="21" y2="8"/>
      <line x1="7" y1="11" x2="17" y2="11"/>
      <line x1="7" y1="11" x2="5" y2="13"/>
      <line x1="17" y1="11" x2="19" y2="13"/>
      <line x1="8.5" y1="16" x2="15.5" y2="16"/>
      <line x1="8.5" y1="16" x2="6.5" y2="18"/>
      <line x1="15.5" y1="16" x2="17.5" y2="18"/>
      <path d="M10 8 L12 6 L14 8"/>
      <path d="M9.5 13 L12 11 L14.5 13"/>
      <path d="M9 18 L12 16 L15 18"/>
    </svg>`;
  }

  private _homeIcon(): string {
    return `<svg class="nicon home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12 L12 3 L21 12"/>
      <path d="M5 10 L5 20 C5 20.5 5.5 21 6 21 L18 21 C18.5 21 19 20.5 19 20 L19 10"/>
      <path d="M9 21 L9 15 C9 14.5 9.5 14 10 14 L14 14 C14.5 14 15 14.5 15 15 L15 21"/>
    </svg>`;
  }

  private _loadIcon(): string {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12 L12 3 L21 12 L21 20 C21 20.5 20.5 21 20 21 L4 21 C3.5 21 3 20.5 3 20 Z"/>
      <path d="M9 21 L9 16 C9 15.5 9.5 15 10 15 L14 15 C14.5 15 15 15.5 15 16 L15 21"/>
      <circle cx="12" cy="11" r="2"/>
      <line x1="12" y1="8" x2="12" y2="9"/>
      <line x1="12" y1="13" x2="12" y2="14"/>
    </svg>`;
  }

  private _batteryRing(soc: number, charging: boolean, discharging: boolean): string {
    const r = 26;
    const cx = 36, cy = 36;
    const circ = 2 * Math.PI * r;
    const filled = (soc / 100) * circ;
    // Arc colour encodes state: blue=charging, amber=discharging, green/amber/red=idle by SOC
    const arcColor = charging   ? "#3b82f6"
                   : discharging ? "#f59e0b"
                   : soc > 50   ? "#22c55e"
                   : soc > 20   ? "#f59e0b"
                   :               "#ef4444";

    return `
    <svg class="bat-ring" viewBox="0 0 72 72">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="var(--divider-color,rgba(127,127,127,0.18))" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${arcColor}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${filled.toFixed(1)} ${circ.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle"
        font-size="15" font-weight="700" fill="${arcColor}" stroke="none">${Math.round(soc)}%</text>
    </svg>`;
  }

  private _evIcon(active: boolean): string {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="9" width="18" height="10" rx="2"/>
      <path d="M7 9 L7 6 C7 5.5 7.5 5 8 5 L16 5 C16.5 5 17 5.5 17 6 L17 9"/>
      <rect x="5" y="11" width="5" height="3" rx="0.5"/>
      <rect x="14" y="11" width="5" height="3" rx="0.5"/>
      <line x1="12" y1="11" x2="12" y2="14"/>
      ${active ? `<path d="M11.5 5.5 L10 8 L11.5 8 L10 11" fill="none" stroke="#a855f7" stroke-width="1.5"/>` : ""}
      <line x1="7" y1="19" x2="7" y2="21"/>
      <line x1="17" y1="19" x2="17" y2="21"/>
    </svg>`;
  }

  // ── Small helper renderers ────────────────────────────────────────────

  private _metric(label: string, value: string, detail: string): string {
    return `<div class="metric">
      <span class="lbl">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>`;
  }

  private _safetyItem(label: string, ok: boolean): string {
    return `<div class="safety-item ${ok ? "ok" : "bad"}">
      <span></span>${escapeHtml(label)}
    </div>`;
  }

  private _carConnected(status: string): boolean {
    if (!status || status === "-") return false;
    const s = status.toLowerCase();
    return !["available","unavailable","disconnected","not connected","idle","ready"].includes(s);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Card 2 — Tariff & Schedule
// ═══════════════════════════════════════════════════════════════════════════

type TariffEntityKey =
  | "zeroheroEligible" | "zeroheroImportKwh" | "superExportKwh"
  | "overnightAvgConsumption" | "overnightReservePct" | "overnightSnapshotCount"
  | "batterySoc" | "currentInverterSlot" | "status";

type TariffCardConfig = {
  type: string;
  entity?: string;
  title?: string;
  battery_capacity_kwh?: number;
  entities?: Partial<Record<TariffEntityKey, string>>;
};

const TARIFF_SUFFIXES: Record<TariffEntityKey, [string, string]> = {
  status:                  ["sensor",        "status"],
  zeroheroEligible:        ["binary_sensor", "zerohero_eligible"],
  zeroheroImportKwh:       ["sensor",        "zerohero_import_kwh"],
  superExportKwh:          ["sensor",        "super_export_kwh"],
  overnightAvgConsumption: ["sensor",        "overnight_avg_consumption"],
  overnightReservePct:     ["sensor",        "overnight_reserve_pct"],
  overnightSnapshotCount:  ["sensor",        "overnight_snapshot_count"],
  batterySoc:              ["sensor",        "battery_soc"],
  currentInverterSlot:     ["sensor",        "current_inverter_slot"],
};

class SolarChargeTariffCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: TariffCardConfig;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config: TariffCardConfig): void {
    this._config = { title: "Energy Schedule", battery_capacity_kwh: 48, ...config };
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._render();
  }

  getCardSize(): number { return 6; }

  static getStubConfig(): TariffCardConfig {
    return { type: "custom:solar-charge-tariff-card", entity: "sensor.solar_charge_status" };
  }

  private _baseId(): string | undefined {
    const id = (this._config?.entities?.status ?? this._config?.entity)?.split(".")[1];
    return id?.endsWith("_status") ? id.slice(0, -7) : id;
  }

  private _ent(): Record<TariffEntityKey, string | undefined> {
    const cfg = this._config?.entities ?? {};
    const base = this._baseId();
    const out = {} as Record<TariffEntityKey, string | undefined>;
    for (const key of Object.keys(TARIFF_SUFFIXES) as TariffEntityKey[]) {
      const [domain, suffix] = TARIFF_SUFFIXES[key];
      out[key] = cfg[key] ?? (base ? `${domain}.${base}_${suffix}` : undefined);
    }
    if (this._config?.entity) out.status = cfg.status ?? this._config.entity;
    return out;
  }

  private _s(id?: string): EntityState | undefined {
    return id ? this._hass?.states[id] : undefined;
  }

  private _render(): void {
    if (!this.shadowRoot || !this._config) return;

    const ent = this._ent();
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const period = currentPeriod(nowH);
    const capKwh = this._config.battery_capacity_kwh ?? 48;

    const zeroheroOk   = isOn(this._s(ent.zeroheroEligible));
    const zhImport     = stateNum(this._s(ent.zeroheroImportKwh));
    const superExport  = stateNum(this._s(ent.superExportKwh));
    const avgKwh       = stateNum(this._s(ent.overnightAvgConsumption)) || null;
    const reservePct   = stateNum(this._s(ent.overnightReservePct));
    const snapCount    = stateNum(this._s(ent.overnightSnapshotCount));
    const slot         = stateNum(this._s(ent.currentInverterSlot)) || 0;
    const soc          = stateNum(this._s(ent.batterySoc));

    const inExportWindow = nowH >= 18 && nowH < 21;
    const inFreeWindow   = nowH >= 11 && nowH < 14;

    // Next period countdown
    const nextPeriodStart = TARIFF_PERIODS.find(p => p.start > nowH)?.start
      ?? TARIFF_PERIODS[0].start + 24;
    const minsToNext = Math.round((nextPeriodStart - nowH) * 60);
    const nextLabel = TARIFF_PERIODS.find(p => p.start === nextPeriodStart % 24)?.label ?? "";

    this.shadowRoot.innerHTML = `
      <style>${TARIFF_CSS}</style>
      <article class="card">

        <header class="t-header">
          <h2>${escapeHtml(this._config.title ?? "Energy Schedule")}</h2>
          <div class="current-period" style="color:${period.color}">
            ${escapeHtml(period.label)} &nbsp;·&nbsp; ${escapeHtml(period.cost)}/kWh
          </div>
        </header>

        <section class="timeline-wrap">
          ${this._renderTimeline(nowH)}
          <div class="next-period">
            Next: <strong>${escapeHtml(nextLabel)}</strong>
            in ${Math.floor(minsToNext / 60)}h ${minsToNext % 60}m
          </div>
        </section>

        <section class="two-col">

          <!-- ZeroHero -->
          <div class="panel ${inExportWindow ? (zeroheroOk ? "panel-ok" : "panel-warn") : "panel-dim"}">
            <div class="panel-title">🏆 ZeroHero Credit</div>
            <div class="panel-sub">$1/day if imports ≤ 0.09 kWh (6pm–9pm)</div>
            ${inExportWindow ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill ${zeroheroOk ? "green" : "red"}"
                    style="width:${Math.min(100, (zhImport / 0.09) * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${zhImport.toFixed(3)} / 0.09 kWh</span>
              </div>
              <div class="panel-status ${zeroheroOk ? "ok" : "bad"}">
                ${zeroheroOk ? "✓ On track" : "✗ Limit exceeded"}
              </div>` :
              nowH >= 21 ? `<div class="panel-status dim">Window closed</div>` :
              `<div class="panel-status dim">Window starts ${21 - Math.ceil(nowH)}h ${nowH < 18 ? Math.round((18 - nowH) * 60) + "m" : ""}~</div>`
            }
          </div>

          <!-- Super Export -->
          <div class="panel ${inExportWindow ? "panel-purple" : "panel-dim"}">
            <div class="panel-title">⚡ Super Export</div>
            <div class="panel-sub">15c/kWh on first 15 kWh (6pm–9pm)</div>
            ${inExportWindow || superExport > 0 ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill purple"
                    style="width:${Math.min(100, (superExport / 15) * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${superExport.toFixed(2)} / 15 kWh</span>
              </div>
              <div class="panel-status purple">
                ≈ $${(superExport * 0.20).toFixed(2)} earned
              </div>` :
              `<div class="panel-status dim">${nowH < 18 ? "Starts at 6pm" : "No data yet"}</div>`
            }
          </div>

        </section>

        <section class="overnight-section">
          <div class="panel-title">🔋 Overnight Reserve</div>
          <div class="overnight-grid">
            <div class="ov-stat">
              <span class="ov-val">${avgKwh != null ? fmtKwh(avgKwh) : "—"}</span>
              <span class="ov-lbl">Avg overnight use</span>
              <span class="ov-sub">${snapCount} day${snapCount !== 1 ? "s" : ""} of data</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${reservePct ? reservePct + "%" : "—"}</span>
              <span class="ov-lbl">Reserve target</span>
              <span class="ov-sub">≈ ${reservePct ? fmtKwh((reservePct / 100) * capKwh) : "—"}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${soc ? Math.round(soc) + "%" : "—"}</span>
              <span class="ov-lbl">Current SOC</span>
              <span class="ov-sub">≈ ${fmtKwh((soc / 100) * capKwh)}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${slot ? `Slot ${slot}` : "—"}</span>
              <span class="ov-lbl">Active slot</span>
              <span class="ov-sub">${this._slotLabel(slot)}</span>
            </div>
          </div>
          ${snapCount < 3 ? `<p class="data-notice">Collecting data — ${3 - snapCount} more night${3 - snapCount !== 1 ? "s" : ""} needed for smart reserve.</p>` : ""}
        </section>

      </article>`;
  }

  private _renderTimeline(nowH: number): string {
    const w = 100;
    const bars = TARIFF_PERIODS.map(p => {
      const pct  = ((p.end - p.start) / 24) * w;
      const left = (p.start / 24) * w;
      return `<div class="t-bar" title="${p.label} ${p.cost}"
        style="width:${pct.toFixed(2)}%;background:${p.color};opacity:0.85"></div>`;
    }).join("");

    const nowPct = (nowH / 24) * w;

    return `
    <div class="timeline">
      <div class="t-bars">${bars}</div>
      <div class="t-now" style="left:${nowPct.toFixed(2)}%">
        <div class="t-now-line"></div>
        <div class="t-now-label">Now</div>
      </div>
      <div class="t-labels">
        ${[0,4,8,11,14,16,18,21,24].map(h =>
          `<span style="left:${((h/24)*100).toFixed(1)}%">${h === 24 ? "0" : h}</span>`
        ).join("")}
      </div>
    </div>`;
  }

  private _slotLabel(slot: number): string {
    const labels: Record<number, string> = {
      1: "00:00 coast",
      2: "11:00 free charge",
      3: "14:00 hold",
      4: "16:00 peak",
      5: "18:00 export",
      6: "21:00 reserve",
    };
    return labels[slot] ?? "—";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS — Power Flow Card
// ═══════════════════════════════════════════════════════════════════════════

const FLOW_CSS = `
:host { display: block; color: var(--primary-text-color, #1f2933); }

.card {
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border: 1px solid var(--divider-color, rgba(127,127,127,.22));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.12));
  overflow: hidden;
}
.card::before {
  content: ""; display: block; height: 4px; background: #6b7280;
}
.card.active::before { background: #14866d; }
.card.danger::before { background: #c24135; }

/* Header */
.header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; padding: 14px 16px 10px;
}
.header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
h2 { margin: 0; font-size: 1.1rem; font-weight: 650; line-height: 1.2; }
p  { margin: 4px 0 0; font-size: 0.88rem; color: var(--secondary-text-color, #667085); }

.period-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px; border: 1px solid;
  font-size: 0.78rem; font-weight: 700; white-space: nowrap;
}
.zerohero-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 0.78rem; font-weight: 700; white-space: nowrap;
}
.zerohero-badge.ok   { background: rgba(34,197,94,.15);  color: #16a34a; }
.zerohero-badge.risk { background: rgba(239,68,68,.15);  color: #dc2626; }
.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px;
  background: rgba(107,114,128,.12); font-size: 0.8rem; font-weight: 650;
  white-space: nowrap;
}
.status-pill span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.status-pill.active { background: rgba(20,134,109,.14); color: #14866d; }
.status-pill.danger { background: rgba(194,65,53,.14);  color: #c24135; }

/* Power flow diagram */
.flow-section {
  padding: 8px 12px 12px;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--primary-background-color,#f7f8fa) 60%, transparent), transparent);
}
.flow-wrap {
  position: relative; width: 100%; max-width: 460px; margin: 0 auto;
  aspect-ratio: 360 / 260;
}
.flow-svg {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 0;
}

/* Nodes */
.node {
  position: absolute; display: flex; flex-direction: column;
  align-items: center; gap: 4px; z-index: 1;
}
.node.solar    { top: 0%;   left: 12%; transform: translateX(-50%); }
.node.grid     { top: 0%;   right: 2%; transform: translateX(-50%); }
.node.home     { top: 34%;  left: 50%; transform: translate(-50%,-50%); }
.node.battery  { bottom: 0; left: 10%; transform: translateX(-50%); }
.node.ev       { bottom: 0; left: 50%; transform: translateX(-50%); }
.node.house-load { bottom: 0; right: 2%; transform: translateX(-50%); }

.nicon {
  width: 44px; height: 44px; padding: 9px;
  border-radius: 50%;
  background: var(--card-background-color, #fff);
  border: 2.5px solid var(--divider-color, rgba(127,127,127,.25));
  color: var(--secondary-text-color, #6b7280);
  transition: border-color .3s, color .3s, box-shadow .3s;
}
.home-icon { width: 52px; height: 52px; padding: 10px; border-width: 3px; }

.node.on  .nicon,
.node.chg .nicon { border-color: var(--nc); color: var(--nc); background: color-mix(in srgb, var(--nc) 10%, var(--card-background-color,#fff)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--nc) 15%, transparent); }
.node.dis .nicon { border-color: var(--nc); color: var(--nc); background: color-mix(in srgb, var(--nc) 10%, var(--card-background-color,#fff)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--nc) 15%, transparent); }
.node.exp .nicon { border-color: #22c55e; color: #22c55e; background: rgba(34,197,94,.08); box-shadow: 0 0 0 4px rgba(34,197,94,.15); }
.node.home .nicon { border-color: var(--primary-color,#1d6f9f); color: var(--primary-color,#1d6f9f); }

.bat-ring { width: 72px; height: 72px; }

.nval { font-size: 0.82rem; font-weight: 700; white-space: nowrap; }
.nlbl { font-size: 0.68rem; font-weight: 600; color: var(--secondary-text-color,#667085); text-transform: uppercase; letter-spacing: .02em; }

/* Info row */
.info-row {
  display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
  border-top: 1px solid var(--divider-color, rgba(127,127,127,.18));
  border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.18));
  padding: 0 16px;
}
.info-row > div { padding: 10px 0; min-width: 0; }
.info-row > div + div { padding-left: 12px; border-left: 1px solid var(--divider-color,rgba(127,127,127,.18)); }

/* Generic label */
.lbl {
  display: block; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .02em;
  color: var(--secondary-text-color, #667085); margin-bottom: 3px;
}
strong { display: block; font-size: 0.95rem; line-height: 1.25; overflow-wrap: anywhere; }

/* Metrics grid */
.metrics-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 8px; padding: 12px 16px;
}
.metric {
  padding: 9px 10px; border: 1px solid var(--divider-color,rgba(127,127,127,.18));
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary-background-color,#f7f8fa) 70%, transparent);
}
.metric strong { font-size: 1.15rem; font-weight: 720; }
.metric small  { display: block; margin-top: 4px; font-size: 0.72rem; color: var(--secondary-text-color,#667085); }

/* Stale-charge warning banner */
.stale-banner {
  padding: 9px 16px;
  background: rgba(245,158,11,.14);
  border-top: 1px solid rgba(245,158,11,.4);
  border-bottom: 1px solid rgba(245,158,11,.4);
  color: #b45309;
  font-size: 0.85rem; font-weight: 700; line-height: 1.3;
}

/* EV charge history */
.ev-history {
  padding: 10px 16px 12px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
.ev-stats {
  display: grid; grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 8px; margin-bottom: 10px;
}
.warn-text { color: #b45309; }
.ev-week {
  display: grid; grid-template-columns: repeat(7, minmax(0,1fr));
  gap: 6px; align-items: end;
}
.ev-day { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ev-day-val { font-size: 0.62rem; font-weight: 700; color: var(--secondary-text-color,#667085); min-height: 12px; }
.ev-day-bar {
  width: 100%; max-width: 34px; height: 44px;
  display: flex; align-items: flex-end;
  background: color-mix(in srgb, var(--divider-color,rgba(127,127,127,.18)) 50%, transparent);
  border-radius: 5px; overflow: hidden;
}
.ev-day-fill { width: 100%; background: #a855f7; border-radius: 5px 5px 0 0; }
.ev-day-fill.empty { background: var(--divider-color,rgba(127,127,127,.3)); }
.ev-day-fill.today { background: #7c3aed; }
.ev-day-lbl { font-size: 0.64rem; font-weight: 700; color: var(--secondary-text-color,#667085); }
.ev-day-lbl.today { color: var(--primary-text-color,#1f2933); }

/* Reason */
.reason-row {
  padding: 10px 16px 10px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
.reason-row p { margin: 0; line-height: 1.35; font-size: 0.9rem; overflow-wrap: anywhere; }

/* Safety */
.safety-row {
  display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 8px; padding: 10px 16px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
.safety-item {
  display: flex; align-items: center; gap: 6px; font-size: 0.76rem; font-weight: 650; line-height: 1.2;
  color: var(--secondary-text-color,#667085);
}
.safety-item span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.safety-item.ok  { color: #14866d; }
.safety-item.bad { color: #c24135; }

/* Controls */
.controls-row {
  display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
.mode-buttons { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 5px; }
button {
  min-height: 34px; padding: 0 8px;
  border: 1px solid var(--divider-color,rgba(127,127,127,.26)); border-radius: 8px;
  background: var(--secondary-background-color,#eef1f5);
  color: var(--primary-text-color,#1f2933);
  font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer;
}
button:hover { border-color: var(--primary-color,#1d6f9f); }
button.sel, .ctrl-toggle.on {
  border-color: transparent;
  background: var(--primary-color,#1d6f9f);
  color: var(--text-primary-color,#fff);
}
.ctrl-toggle { white-space: nowrap; }

@media (max-width: 520px) {
  .info-row { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .metrics-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .safety-row { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .controls-row { grid-template-columns: 1fr; }
  .mode-buttons { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .header-right { flex-direction: row; flex-wrap: wrap; justify-content: flex-end; }
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// CSS — Tariff Card
// ═══════════════════════════════════════════════════════════════════════════

const TARIFF_CSS = `
:host { display: block; color: var(--primary-text-color, #1f2933); }

.card {
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border: 1px solid var(--divider-color, rgba(127,127,127,.22));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.12));
  overflow: hidden;
}

.t-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
h2 { margin: 0; font-size: 1.1rem; font-weight: 650; }
.current-period { font-size: 0.92rem; font-weight: 700; }

/* Timeline */
.timeline-wrap { padding: 14px 16px 6px; }
.timeline { position: relative; }
.t-bars { display: flex; height: 18px; border-radius: 6px; overflow: hidden; }
.t-bar { height: 100%; }
.t-now { position: absolute; top: 0; transform: translateX(-50%); }
.t-now-line { height: 18px; width: 2px; background: #fff; border-radius: 1px; box-shadow: 0 0 4px rgba(0,0,0,.4); }
.t-now-label { font-size: 0.65rem; font-weight: 700; color: #fff; text-align: center; white-space: nowrap; transform: translateX(-50%); background: rgba(0,0,0,.5); padding: 1px 4px; border-radius: 3px; margin-top: 2px; }
.t-labels { position: relative; height: 16px; margin-top: 2px; }
.t-labels span { position: absolute; transform: translateX(-50%); font-size: 0.62rem; color: var(--secondary-text-color,#667085); }
.next-period { margin-top: 8px; font-size: 0.82rem; color: var(--secondary-text-color,#667085); }
.next-period strong { color: var(--primary-text-color,#1f2933); }

/* Two-column section */
.two-col {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}

/* Panels */
.panel {
  padding: 12px; border-radius: 10px;
  border: 1px solid var(--divider-color,rgba(127,127,127,.18));
  background: color-mix(in srgb, var(--primary-background-color,#f7f8fa) 70%, transparent);
}
.panel-ok   { border-color: rgba(34,197,94,.4);  background: rgba(34,197,94,.06); }
.panel-warn { border-color: rgba(239,68,68,.4);  background: rgba(239,68,68,.06); }
.panel-dim  { opacity: 0.7; }
.panel-purple { border-color: rgba(168,85,247,.4); background: rgba(168,85,247,.06); }

.panel-title { font-size: 0.82rem; font-weight: 700; margin-bottom: 2px; }
.panel-sub   { font-size: 0.7rem; color: var(--secondary-text-color,#667085); margin-bottom: 8px; }
.panel-status { margin-top: 6px; font-size: 0.78rem; font-weight: 700; }
.panel-status.ok     { color: #16a34a; }
.panel-status.bad    { color: #dc2626; }
.panel-status.purple { color: #7c3aed; }
.panel-status.dim    { color: var(--secondary-text-color,#667085); }

/* Progress bars */
.bar-wrap { display: flex; align-items: center; gap: 8px; }
.bar-track {
  flex: 1; height: 8px; border-radius: 4px;
  background: var(--divider-color,rgba(127,127,127,.2)); overflow: hidden;
}
.bar-fill { height: 100%; border-radius: 4px; transition: width .6s ease; min-width: 2px; }
.bar-fill.green  { background: #22c55e; }
.bar-fill.red    { background: #ef4444; }
.bar-fill.purple { background: #a855f7; }
.bar-val { font-size: 0.72rem; font-weight: 600; white-space: nowrap; color: var(--secondary-text-color,#667085); }

/* Overnight */
.overnight-section {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--divider-color,rgba(127,127,127,.18));
}
.panel-title { font-size: 0.82rem; font-weight: 700; margin-bottom: 10px; }
.overnight-grid {
  display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px;
}
.ov-stat {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 8px; border-radius: 8px;
  border: 1px solid var(--divider-color,rgba(127,127,127,.18));
  background: color-mix(in srgb, var(--primary-background-color,#f7f8fa) 70%, transparent);
  text-align: center;
}
.ov-val  { font-size: 1.05rem; font-weight: 720; }
.ov-lbl  { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--secondary-text-color,#667085); }
.ov-sub  { font-size: 0.68rem; color: var(--secondary-text-color,#667085); }

.data-notice {
  margin: 10px 0 0; font-size: 0.78rem;
  color: var(--secondary-text-color,#667085);
  font-style: italic;
}

@media (max-width: 480px) {
  .two-col { grid-template-columns: 1fr; }
  .overnight-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .t-header { flex-direction: column; align-items: flex-start; gap: 4px; }
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// Register both cards
// ═══════════════════════════════════════════════════════════════════════════

if (!customElements.get("solar-charge-card")) {
  customElements.define("solar-charge-card", SolarChargeCard);
}
if (!customElements.get("solar-charge-tariff-card")) {
  customElements.define("solar-charge-tariff-card", SolarChargeTariffCard);
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "solar-charge-card",
    name: "Solar Charge — Power Flow",
    description: "Live power flow diagram with EV charging control",
  },
  {
    type: "solar-charge-tariff-card",
    name: "Solar Charge — Energy Schedule",
    description: "Tariff timeline, ZeroHero tracker, and overnight reserve",
  },
);

export {};
