function f(t) {
  return t.replace(
    /[&<>"']/g,
    (r) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[r] ?? r
  );
}
function v(t) {
  const r = Number(t == null ? void 0 : t.state);
  return Number.isFinite(r) ? r : 0;
}
function C(t) {
  return !t || t.state === "unknown" || t.state === "unavailable" ? "-" : t.state;
}
function b(t) {
  return (t == null ? void 0 : t.state) === "on";
}
function d(t) {
  const r = Number(t == null ? void 0 : t.state);
  if (!t || !Number.isFinite(r)) return "-";
  const e = String(t.attributes.unit_of_measurement ?? "W").toLowerCase() === "kw" ? r * 1e3 : r;
  return Math.abs(e) >= 1e3 ? `${(e / 1e3).toFixed(1)} kW` : `${Math.round(e)} W`;
}
function z(t, r = 2) {
  return t == null || !Number.isFinite(t) ? "-" : `${t.toFixed(r)} kWh`;
}
function L(t) {
  const r = Number(t == null ? void 0 : t.state);
  return !t || !Number.isFinite(r) ? "-" : `${Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r).toString() : r.toFixed(1)} A`;
}
function M(t) {
  const r = Number(t == null ? void 0 : t.state);
  return !t || !Number.isFinite(r) ? "-" : `${Math.round(r)}%`;
}
const P = {
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
  zeroheroEligible: ["binary_sensor", "zerohero_eligible"],
  zeroheroImportKwh: ["sensor", "zerohero_import_kwh"],
  superExportKwh: ["sensor", "super_export_kwh"],
  overnightReservePct: ["sensor", "overnight_reserve_pct"],
  mode: ["select", "mode"],
  controlEnabled: ["switch", "control_enabled"]
}, F = [
  { label: "Off", option: "Off" },
  { label: "Solar", option: "Solar only" },
  { label: "Free", option: "Free hours only" },
  { label: "Hybrid", option: "Free hours or solar" },
  { label: "Force", option: "Force charge" }
], k = [
  { start: 0, end: 11, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 11, end: 14, label: "Free ☀️", color: "#16a34a", cost: "FREE" },
  { start: 14, end: 16, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 16, end: 18, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 18, end: 21, label: "⚡ Export", color: "#7c3aed", cost: "20c*" },
  { start: 21, end: 23, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 23, end: 24, label: "Shoulder", color: "#4b5563", cost: "46.2c" }
];
function E(t) {
  return k.find((r) => t >= r.start && t < r.end) ?? k[0];
}
class O extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" }), this.shadowRoot.addEventListener("click", (r) => void this._handleClick(r));
  }
  setConfig(r) {
    var o;
    if (!r.entity && !((o = r.entities) != null && o.status))
      throw new Error("Solar Charge card requires entity or entities.status");
    this._config = { title: "Solar Charge", show_controls: !0, ...r }, this._render();
  }
  set hass(r) {
    this._hass = r, this._render();
  }
  getCardSize() {
    return 8;
  }
  static getStubConfig() {
    return { type: "custom:solar-charge-card", entity: "sensor.solar_charge_status", title: "Solar Charge" };
  }
  _baseId() {
    var o, e, a, s;
    const r = (s = ((e = (o = this._config) == null ? void 0 : o.entities) == null ? void 0 : e.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : s.split(".")[1];
    return r != null && r.endsWith("_status") ? r.slice(0, -7) : r;
  }
  _ent() {
    var a, s;
    const r = ((a = this._config) == null ? void 0 : a.entities) ?? {}, o = this._baseId(), e = {};
    for (const i of Object.keys(P)) {
      const [p, n] = P[i];
      e[i] = r[i] ?? (o ? `${p}.${o}_${n}` : void 0);
    }
    return (s = this._config) != null && s.entity && (e.status = r.status ?? this._config.entity), e;
  }
  _s(r) {
    var o;
    return r ? (o = this._hass) == null ? void 0 : o.states[r] : void 0;
  }
  async _handleClick(r) {
    const o = r.composedPath().find(
      (a) => a instanceof HTMLElement && a.dataset.action
    );
    if (!o || !this._hass) return;
    const e = this._ent();
    if (o.dataset.action === "mode" && e.mode)
      await this._hass.callService("select", "select_option", {
        entity_id: e.mode,
        option: o.dataset.option
      });
    else if (o.dataset.action === "toggle-control" && e.controlEnabled) {
      const a = b(this._s(e.controlEnabled));
      await this._hass.callService("switch", a ? "turn_off" : "turn_on", {
        entity_id: e.controlEnabled
      });
    }
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    const r = this._ent(), o = C(this._s(r.status)), e = b(this._s(r.allowedToCharge)), a = b(this._s(r.controlEnabled)), s = b(this._s(r.gridSensorOk)) && b(this._s(r.chargerSensorOk)) && b(this._s(r.breakerLimitOk)), i = C(this._s(r.mode)), p = C(this._s(r.chargerStatus)), n = this._carConnected(p), x = this._config.show_controls !== !1, h = s ? e ? "active" : "idle" : "danger", l = /* @__PURE__ */ new Date(), g = l.getHours() + l.getMinutes() / 60, c = E(g), u = g >= 18 && g < 21, w = u && b(this._s(r.zeroheroEligible));
    this.shadowRoot.innerHTML = `
      <style>${R}</style>
      <article class="card ${h}">

        <header class="header">
          <div class="header-left">
            <h2>${f(this._config.title ?? "Solar Charge")}</h2>
            <p>${f(o)}</p>
          </div>
          <div class="header-right">
            ${u ? `
              <div class="zerohero-badge ${w ? "ok" : "risk"}">
                ${w ? "✓" : "⚠"} ZeroHero
              </div>` : ""}
            <div class="period-badge" style="background:${c.color}20;color:${c.color};border-color:${c.color}40">
              ${f(c.label)} · ${f(c.cost)}
            </div>
            <div class="status-pill ${h}">
              <span></span>${e ? "Charging" : s ? "Waiting" : "Check"}
            </div>
          </div>
        </header>

        <section class="flow-section">
          ${this._renderFlow(r)}
        </section>

        <section class="info-row">
          <div><span class="lbl">Mode</span><strong>${f(i)}</strong></div>
          <div><span class="lbl">Control</span><strong>${a ? "On" : "Off"}</strong></div>
          <div><span class="lbl">Car</span><strong>${n ? "Connected" : "Away"}</strong></div>
          <div><span class="lbl">Free window</span><strong>${b(this._s(r.inFreeWindow)) ? "Active ☀️" : "—"}</strong></div>
        </section>

        <section class="metrics-grid">
          ${this._metric("Base import", d(this._s(r.baseGridImport)), "excl. EV")}
          ${this._metric("Safe limit", d(this._s(r.safeImportLimit)), "breaker")}
          ${this._metric("Spare", d(this._s(r.spareCapacity)), "headroom")}
          ${this._metric("Target", L(this._s(r.targetAmps)), "calc. limit")}
          ${this._metric("Actual", L(this._s(r.actualCurrent)), "charger")}
          ${this._metric("Reserve", M(this._s(r.overnightReservePct)), "overnight")}
        </section>

        <section class="reason-row">
          <span class="lbl">Reason</span>
          <p>${f(C(this._s(r.reason)))}</p>
        </section>

        <section class="safety-row">
          ${this._safetyItem("Grid sensor", b(this._s(r.gridSensorOk)))}
          ${this._safetyItem("Charger", b(this._s(r.chargerSensorOk)))}
          ${this._safetyItem("Breaker", b(this._s(r.breakerLimitOk)))}
          ${this._safetyItem("Free window", b(this._s(r.inFreeWindow)))}
        </section>

        ${x ? `
          <section class="controls-row">
            <div class="mode-buttons">
              ${F.map((m) => `
                <button class="${i === m.option ? "sel" : ""}"
                  data-action="mode" data-option="${m.option}" type="button">
                  ${m.label}
                </button>`).join("")}
            </div>
            <button class="ctrl-toggle ${a ? "on" : ""}"
              data-action="toggle-control" type="button">
              ${a ? "Disable" : "Enable"} control
            </button>
          </section>` : ""}

      </article>`;
  }
  // ── Power flow diagram ────────────────────────────────────────────────
  _renderFlow(r) {
    const o = v(this._s(r.pvPower)), e = v(this._s(r.gridImport)), a = v(this._s(r.batteryPower)), s = v(this._s(r.chargerPower)), i = v(this._s(r.loadPower)), p = v(this._s(r.batterySoc)), n = o > 50, x = e > 50, h = e < -50, l = a > 50, g = a < -50, c = s > 50, u = i > 50, w = "#f59e0b", m = h ? "#22c55e" : "#ef4444", y = l ? "#3b82f6" : g ? "#f59e0b" : "#6b7280", _ = "#a855f7", $ = "#64748b";
    return `
    <div class="flow-wrap">
      <!-- SVG layer for paths -->
      <svg class="flow-svg" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet">
        <defs>
          ${this._gradDef("g-pv", "#f59e0b", n)}
          ${this._gradDef("g-grid", m, x || h)}
          ${this._gradDef("g-bat", y, l || g)}
          ${this._gradDef("g-ev", _, c)}
          ${this._gradDef("g-load", $, u)}
        </defs>

        <!-- Solar → Home -->
        ${this._flowPath(
      "M 72 55 C 72 130 180 55 180 130",
      n,
      w,
      "g-pv",
      "0 → 1",
      d(this._s(r.pvPower))
    )}

        <!-- Grid → Home  /  Home → Grid -->
        ${this._flowPath(
      "M 288 55 C 288 130 180 55 180 130",
      x,
      m,
      "g-grid",
      "1 → 0",
      x ? d(this._s(r.gridImport)) : ""
    )}
        ${this._flowPath(
      "M 180 130 C 180 55 288 130 288 55",
      h,
      "#22c55e",
      "g-grid",
      "0 → 1",
      h ? d(this._s(r.gridImport)) : ""
    )}

        <!-- Home → Battery  /  Battery → Home -->
        ${this._flowPath(
      "M 180 130 C 180 210 60 130 60 210",
      l,
      y,
      "g-bat",
      "0 → 1",
      l ? d(this._s(r.batteryPower)) : ""
    )}
        ${this._flowPath(
      "M 60 210 C 60 130 180 210 180 130",
      g,
      y,
      "g-bat",
      "0 → 1",
      g ? d(this._s(r.batteryPower)) : ""
    )}

        <!-- Home → EV -->
        ${this._flowPath(
      "M 180 130 L 180 210",
      c,
      _,
      "g-ev",
      "0 → 1",
      c ? d(this._s(r.chargerPower)) : ""
    )}

        <!-- Home → Load -->
        ${this._flowPath(
      "M 180 130 C 180 210 300 130 300 210",
      u,
      $,
      "g-load",
      "0 → 1",
      u ? d(this._s(r.loadPower)) : ""
    )}
      </svg>

      <!-- Nodes -->
      <div class="node solar ${n ? "on" : ""}" style="--nc:${w}">
        ${this._solarIcon()}
        <div class="nval">${d(this._s(r.pvPower))}</div>
        <div class="nlbl">Solar</div>
      </div>

      <div class="node grid ${x ? "on" : h ? "exp" : ""}" style="--nc:${m}">
        ${this._gridIcon()}
        <div class="nval">${d(this._s(r.gridImport))}</div>
        <div class="nlbl">${h ? "Exporting" : "Grid"}</div>
      </div>

      <div class="node home" style="--nc:var(--primary-color,#1d6f9f)">
        ${this._homeIcon()}
      </div>

      <div class="node battery ${l ? "chg" : g ? "dis" : ""}" style="--nc:${y}">
        ${this._batteryRing(p, l, g)}
        <div class="nval">${d(this._s(r.batteryPower))}</div>
        <div class="nlbl">Battery</div>
      </div>

      <div class="node ev ${c ? "on" : ""}" style="--nc:${_}">
        ${this._evIcon(c)}
        <div class="nval">${d(this._s(r.chargerPower))}</div>
        <div class="nlbl">EV</div>
      </div>

      <div class="node house-load ${u ? "on" : ""}" style="--nc:${$}">
        ${this._loadIcon()}
        <div class="nval">${d(this._s(r.loadPower))}</div>
        <div class="nlbl">Load</div>
      </div>
    </div>`;
  }
  _gradDef(r, o, e) {
    return e ? `<linearGradient id="${r}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${o}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${o}" stop-opacity="0.4"/>
    </linearGradient>` : "";
  }
  _flowPath(r, o, e, a, s, i) {
    return o ? `
      <path d="${r}" fill="none" stroke="${e}" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
      <path d="${r}" fill="none" stroke="${e}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="6 10">
        <animate attributeName="stroke-dashoffset"
          from="${s === "0 → 1" ? "0" : "24"}" to="${s === "0 → 1" ? "24" : "0"}" dur="1.2s" repeatCount="indefinite"/>
      </path>
      ${i ? `<title>${i}</title>` : ""}` : `<path d="${r}" fill="none" stroke="var(--divider-color,rgba(127,127,127,0.2))" stroke-width="2"/>`;
  }
  // ── Node icons ────────────────────────────────────────────────────────
  _solarIcon() {
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
  _gridIcon() {
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
  _homeIcon() {
    return `<svg class="nicon home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12 L12 3 L21 12"/>
      <path d="M5 10 L5 20 C5 20.5 5.5 21 6 21 L18 21 C18.5 21 19 20.5 19 20 L19 10"/>
      <path d="M9 21 L9 15 C9 14.5 9.5 14 10 14 L14 14 C14.5 14 15 14.5 15 15 L15 21"/>
    </svg>`;
  }
  _loadIcon() {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12 L12 3 L21 12 L21 20 C21 20.5 20.5 21 20 21 L4 21 C3.5 21 3 20.5 3 20 Z"/>
      <path d="M9 21 L9 16 C9 15.5 9.5 15 10 15 L14 15 C14.5 15 15 15.5 15 16 L15 21"/>
      <circle cx="12" cy="11" r="2"/>
      <line x1="12" y1="8" x2="12" y2="9"/>
      <line x1="12" y1="13" x2="12" y2="14"/>
    </svg>`;
  }
  _batteryRing(r, o, e) {
    const p = 2 * Math.PI * 22, n = r / 100 * p, x = r > 60 ? "#22c55e" : r > 25 ? "#f59e0b" : "#ef4444";
    return `
    <svg class="bat-ring" viewBox="0 0 72 72">
      <!-- Background track -->
      <circle cx="36" cy="36" r="22" fill="none"
        stroke="var(--divider-color,rgba(127,127,127,0.2))" stroke-width="5"/>
      <!-- SOC arc — starts at top (−90°) -->
      <circle cx="36" cy="36" r="22" fill="none"
        stroke="${x}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${n} ${p}"
        transform="rotate(-90 36 36)"/>
      <!-- SOC text -->
      <text x="36" y="41" text-anchor="middle"
        font-size="13" font-weight="700" fill="${x}" stroke="none">${Math.round(r)}%</text>
      ${o ? '<text x="36" y="54" text-anchor="middle" font-size="8" fill="#3b82f6" stroke="none">▲ CHG</text>' : e ? '<text x="36" y="54" text-anchor="middle" font-size="8" fill="#f59e0b" stroke="none">▼ DIS</text>' : ""}
    </svg>`;
  }
  _evIcon(r) {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="9" width="18" height="10" rx="2"/>
      <path d="M7 9 L7 6 C7 5.5 7.5 5 8 5 L16 5 C16.5 5 17 5.5 17 6 L17 9"/>
      <rect x="5" y="11" width="5" height="3" rx="0.5"/>
      <rect x="14" y="11" width="5" height="3" rx="0.5"/>
      <line x1="12" y1="11" x2="12" y2="14"/>
      ${r ? '<path d="M11.5 5.5 L10 8 L11.5 8 L10 11" fill="none" stroke="#a855f7" stroke-width="1.5"/>' : ""}
      <line x1="7" y1="19" x2="7" y2="21"/>
      <line x1="17" y1="19" x2="17" y2="21"/>
    </svg>`;
  }
  // ── Small helper renderers ────────────────────────────────────────────
  _metric(r, o, e) {
    return `<div class="metric">
      <span class="lbl">${f(r)}</span>
      <strong>${f(o)}</strong>
      <small>${f(e)}</small>
    </div>`;
  }
  _safetyItem(r, o) {
    return `<div class="safety-item ${o ? "ok" : "bad"}">
      <span></span>${f(r)}
    </div>`;
  }
  _carConnected(r) {
    if (!r || r === "-") return !1;
    const o = r.toLowerCase();
    return !["available", "unavailable", "disconnected", "not connected", "idle", "ready"].includes(o);
  }
}
const I = {
  status: ["sensor", "status"],
  zeroheroEligible: ["binary_sensor", "zerohero_eligible"],
  zeroheroImportKwh: ["sensor", "zerohero_import_kwh"],
  superExportKwh: ["sensor", "super_export_kwh"],
  overnightAvgConsumption: ["sensor", "overnight_avg_consumption"],
  overnightReservePct: ["sensor", "overnight_reserve_pct"],
  overnightSnapshotCount: ["sensor", "overnight_snapshot_count"],
  batterySoc: ["sensor", "battery_soc"],
  currentInverterSlot: ["sensor", "current_inverter_slot"]
};
class H extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" });
  }
  setConfig(r) {
    this._config = { title: "Energy Schedule", battery_capacity_kwh: 48, ...r }, this._render();
  }
  set hass(r) {
    this._hass = r, this._render();
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:solar-charge-tariff-card", entity: "sensor.solar_charge_status" };
  }
  _baseId() {
    var o, e, a, s;
    const r = (s = ((e = (o = this._config) == null ? void 0 : o.entities) == null ? void 0 : e.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : s.split(".")[1];
    return r != null && r.endsWith("_status") ? r.slice(0, -7) : r;
  }
  _ent() {
    var a, s;
    const r = ((a = this._config) == null ? void 0 : a.entities) ?? {}, o = this._baseId(), e = {};
    for (const i of Object.keys(I)) {
      const [p, n] = I[i];
      e[i] = r[i] ?? (o ? `${p}.${o}_${n}` : void 0);
    }
    return (s = this._config) != null && s.entity && (e.status = r.status ?? this._config.entity), e;
  }
  _s(r) {
    var o;
    return r ? (o = this._hass) == null ? void 0 : o.states[r] : void 0;
  }
  _render() {
    var _, $;
    if (!this.shadowRoot || !this._config) return;
    const r = this._ent(), o = /* @__PURE__ */ new Date(), e = o.getHours() + o.getMinutes() / 60, a = E(e), s = this._config.battery_capacity_kwh ?? 48, i = b(this._s(r.zeroheroEligible)), p = v(this._s(r.zeroheroImportKwh)), n = v(this._s(r.superExportKwh)), x = v(this._s(r.overnightAvgConsumption)) || null, h = v(this._s(r.overnightReservePct)), l = v(this._s(r.overnightSnapshotCount)), g = v(this._s(r.currentInverterSlot)) || 0, c = v(this._s(r.batterySoc)), u = e >= 18 && e < 21, w = ((_ = k.find((S) => S.start > e)) == null ? void 0 : _.start) ?? k[0].start + 24, m = Math.round((w - e) * 60), y = (($ = k.find((S) => S.start === w % 24)) == null ? void 0 : $.label) ?? "";
    this.shadowRoot.innerHTML = `
      <style>${W}</style>
      <article class="card">

        <header class="t-header">
          <h2>${f(this._config.title ?? "Energy Schedule")}</h2>
          <div class="current-period" style="color:${a.color}">
            ${f(a.label)} &nbsp;·&nbsp; ${f(a.cost)}/kWh
          </div>
        </header>

        <section class="timeline-wrap">
          ${this._renderTimeline(e)}
          <div class="next-period">
            Next: <strong>${f(y)}</strong>
            in ${Math.floor(m / 60)}h ${m % 60}m
          </div>
        </section>

        <section class="two-col">

          <!-- ZeroHero -->
          <div class="panel ${u ? i ? "panel-ok" : "panel-warn" : "panel-dim"}">
            <div class="panel-title">🏆 ZeroHero Credit</div>
            <div class="panel-sub">$1/day if imports ≤ 0.09 kWh (6pm–9pm)</div>
            ${u ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill ${i ? "green" : "red"}"
                    style="width:${Math.min(100, p / 0.09 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${p.toFixed(3)} / 0.09 kWh</span>
              </div>
              <div class="panel-status ${i ? "ok" : "bad"}">
                ${i ? "✓ On track" : "✗ Limit exceeded"}
              </div>` : e >= 21 ? '<div class="panel-status dim">Window closed</div>' : `<div class="panel-status dim">Window starts ${21 - Math.ceil(e)}h ${e < 18 ? Math.round((18 - e) * 60) + "m" : ""}~</div>`}
          </div>

          <!-- Super Export -->
          <div class="panel ${u ? "panel-purple" : "panel-dim"}">
            <div class="panel-title">⚡ Super Export</div>
            <div class="panel-sub">15c/kWh on first 15 kWh (6pm–9pm)</div>
            ${u || n > 0 ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill purple"
                    style="width:${Math.min(100, n / 15 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${n.toFixed(2)} / 15 kWh</span>
              </div>
              <div class="panel-status purple">
                ≈ $${(n * 0.2).toFixed(2)} earned
              </div>` : `<div class="panel-status dim">${e < 18 ? "Starts at 6pm" : "No data yet"}</div>`}
          </div>

        </section>

        <section class="overnight-section">
          <div class="panel-title">🔋 Overnight Reserve</div>
          <div class="overnight-grid">
            <div class="ov-stat">
              <span class="ov-val">${x != null ? z(x) : "—"}</span>
              <span class="ov-lbl">Avg overnight use</span>
              <span class="ov-sub">${l} day${l !== 1 ? "s" : ""} of data</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${h ? h + "%" : "—"}</span>
              <span class="ov-lbl">Reserve target</span>
              <span class="ov-sub">≈ ${h ? z(h / 100 * s) : "—"}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${c ? Math.round(c) + "%" : "—"}</span>
              <span class="ov-lbl">Current SOC</span>
              <span class="ov-sub">≈ ${z(c / 100 * s)}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${g ? `Slot ${g}` : "—"}</span>
              <span class="ov-lbl">Active slot</span>
              <span class="ov-sub">${this._slotLabel(g)}</span>
            </div>
          </div>
          ${l < 3 ? `<p class="data-notice">Collecting data — ${3 - l} more night${3 - l !== 1 ? "s" : ""} needed for smart reserve.</p>` : ""}
        </section>

      </article>`;
  }
  _renderTimeline(r) {
    const e = k.map((s) => {
      const i = (s.end - s.start) / 24 * 100;
      return s.start / 24 * 100, `<div class="t-bar" title="${s.label} ${s.cost}"
        style="width:${i.toFixed(2)}%;background:${s.color};opacity:0.85"></div>`;
    }).join(""), a = r / 24 * 100;
    return `
    <div class="timeline">
      <div class="t-bars">${e}</div>
      <div class="t-now" style="left:${a.toFixed(2)}%">
        <div class="t-now-line"></div>
        <div class="t-now-label">Now</div>
      </div>
      <div class="t-labels">
        ${[0, 4, 8, 11, 14, 16, 18, 21, 24].map(
      (s) => `<span style="left:${(s / 24 * 100).toFixed(1)}%">${s === 24 ? "0" : s}</span>`
    ).join("")}
      </div>
    </div>`;
  }
  _slotLabel(r) {
    return {
      1: "00:00 coast",
      2: "11:00 free charge",
      3: "14:00 hold",
      4: "16:00 peak",
      5: "18:00 export",
      6: "21:00 reserve"
    }[r] ?? "—";
  }
}
const R = `
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
`, W = `
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
customElements.get("solar-charge-card") || customElements.define("solar-charge-card", O);
customElements.get("solar-charge-tariff-card") || customElements.define("solar-charge-tariff-card", H);
window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "solar-charge-card",
    name: "Solar Charge — Power Flow",
    description: "Live power flow diagram with EV charging control"
  },
  {
    type: "solar-charge-tariff-card",
    name: "Solar Charge — Energy Schedule",
    description: "Tariff timeline, ZeroHero tracker, and overnight reserve"
  }
);
