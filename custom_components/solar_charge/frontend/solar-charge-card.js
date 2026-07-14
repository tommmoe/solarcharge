function f(o) {
  return o.replace(
    /[&<>"']/g,
    (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[e] ?? e
  );
}
function u(o) {
  const e = Number(o == null ? void 0 : o.state);
  return Number.isFinite(e) ? e : 0;
}
function L(o) {
  return !o || o.state === "unknown" || o.state === "unavailable" ? "-" : o.state;
}
function b(o) {
  return (o == null ? void 0 : o.state) === "on";
}
function h(o) {
  const e = Number(o == null ? void 0 : o.state);
  if (!o || !Number.isFinite(e)) return "-";
  const r = String(o.attributes.unit_of_measurement ?? "W").toLowerCase() === "kw" ? e * 1e3 : e;
  return Math.abs(r) >= 1e3 ? `${(r / 1e3).toFixed(1)} kW` : `${Math.round(r)} W`;
}
function S(o, e = 2) {
  return o == null || !Number.isFinite(o) ? "-" : `${o.toFixed(e)} kWh`;
}
function P(o) {
  const e = Number(o == null ? void 0 : o.state);
  return !o || !Number.isFinite(e) ? "-" : `${Math.abs(e - Math.round(e)) < 0.05 ? Math.round(e).toString() : e.toFixed(1)} A`;
}
function H(o) {
  const e = Number(o == null ? void 0 : o.state);
  return !o || !Number.isFinite(e) ? "-" : `${Math.round(e)}%`;
}
function I(o) {
  if (!o) return "never";
  const e = new Date(o).getTime();
  if (!Number.isFinite(e)) return "never";
  const t = Math.floor((Date.now() - e) / 6e4);
  if (t < 1) return "just now";
  if (t < 60) return `${t}m ago`;
  const r = Math.floor(t / 60);
  return r < 24 ? `${r}h ${t % 60}m ago` : `${Math.floor(r / 24)}d ${r % 24}h ago`;
}
function N(o) {
  if (!o) return null;
  const e = new Date(o).getTime();
  return Number.isFinite(e) ? (Date.now() - e) / 36e5 : null;
}
const O = {
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
  controlEnabled: ["switch", "control_enabled"],
  evCharging: ["binary_sensor", "ev_charging"],
  evEnergyToday: ["sensor", "ev_energy_today"],
  evLastSessionEnergy: ["sensor", "ev_last_session_energy"],
  evLastCharged: ["sensor", "ev_last_charged"]
}, R = [
  { label: "Off", option: "Off" },
  { label: "Solar", option: "Solar only" },
  { label: "Free", option: "Free hours only" },
  { label: "Hybrid", option: "Free hours or solar" },
  { label: "Force", option: "Force charge" }
], C = [
  { start: 0, end: 11, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 11, end: 14, label: "Free ☀️", color: "#16a34a", cost: "FREE" },
  { start: 14, end: 16, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 16, end: 18, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 18, end: 21, label: "⚡ Export", color: "#7c3aed", cost: "20c*" },
  { start: 21, end: 23, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 23, end: 24, label: "Shoulder", color: "#4b5563", cost: "46.2c" }
];
function W(o) {
  return C.find((e) => o >= e.start && o < e.end) ?? C[0];
}
class D extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" }), this.shadowRoot.addEventListener("click", (e) => void this._handleClick(e));
  }
  setConfig(e) {
    var t;
    if (!e.entity && !((t = e.entities) != null && t.status))
      throw new Error("Solar Charge card requires entity or entities.status");
    this._config = { title: "Solar Charge", show_controls: !0, ...e }, this._render();
  }
  set hass(e) {
    this._hass = e, this._render();
  }
  getCardSize() {
    return 8;
  }
  static getStubConfig() {
    return { type: "custom:solar-charge-card", entity: "sensor.solar_charge_status", title: "Solar Charge" };
  }
  _baseId() {
    var t, r, a, s;
    const e = (s = ((r = (t = this._config) == null ? void 0 : t.entities) == null ? void 0 : r.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : s.split(".")[1];
    return e != null && e.endsWith("_status") ? e.slice(0, -7) : e;
  }
  _ent() {
    var a, s;
    const e = ((a = this._config) == null ? void 0 : a.entities) ?? {}, t = this._baseId(), r = {};
    for (const l of Object.keys(O)) {
      const [i, n] = O[l];
      r[l] = e[l] ?? (t ? `${i}.${t}_${n}` : void 0);
    }
    return (s = this._config) != null && s.entity && (r.status = e.status ?? this._config.entity), r;
  }
  _s(e) {
    var t;
    return e ? (t = this._hass) == null ? void 0 : t.states[e] : void 0;
  }
  async _handleClick(e) {
    const t = e.composedPath().find(
      (a) => a instanceof HTMLElement && a.dataset.action
    );
    if (!t || !this._hass) return;
    const r = this._ent();
    if (t.dataset.action === "mode" && r.mode)
      await this._hass.callService("select", "select_option", {
        entity_id: r.mode,
        option: t.dataset.option
      });
    else if (t.dataset.action === "toggle-control" && r.controlEnabled) {
      const a = b(this._s(r.controlEnabled));
      await this._hass.callService("switch", a ? "turn_off" : "turn_on", {
        entity_id: r.controlEnabled
      });
    }
  }
  _render() {
    var E, F, M;
    if (!this.shadowRoot || !this._config) return;
    const e = this._ent(), t = L(this._s(e.status)), r = b(this._s(e.allowedToCharge)), a = b(this._s(e.controlEnabled)), s = b(this._s(e.gridSensorOk)) && b(this._s(e.chargerSensorOk)) && b(this._s(e.breakerLimitOk)), l = L(this._s(e.mode)), i = L(this._s(e.chargerStatus)), n = this._carConnected(i), c = this._config.show_controls !== !1, d = s ? r ? "active" : "idle" : "danger", p = /* @__PURE__ */ new Date(), v = p.getHours() + p.getMinutes() / 60, g = W(v), m = v >= 18 && v < 21, $ = m && b(this._s(e.zeroheroEligible)), w = b(this._s(e.evCharging)), x = (E = this._s(e.evLastCharged)) == null ? void 0 : E.state, y = !!x && x !== "unknown" && x !== "unavailable", _ = y ? N(x) : null, k = n && !w && (!y || _ != null && _ >= 24);
    this.shadowRoot.innerHTML = `
      <style>${A}</style>
      <article class="card ${d}">

        <header class="header">
          <div class="header-left">
            <h2>${f(this._config.title ?? "Solar Charge")}</h2>
            <p>${f(t)}</p>
          </div>
          <div class="header-right">
            ${m ? `
              <div class="zerohero-badge ${$ ? "ok" : "risk"}">
                ${$ ? "✓" : "⚠"} ZeroHero
              </div>` : ""}
            <div class="period-badge" style="background:${g.color}20;color:${g.color};border-color:${g.color}40">
              ${f(g.label)} · ${f(g.cost)}
            </div>
            <div class="status-pill ${d}">
              <span></span>${r ? "Charging" : s ? "Waiting" : "Check"}
            </div>
          </div>
        </header>

        ${k ? `
          <section class="stale-banner">
            ⚠ Plugged in but hasn't charged ${y ? `in ${I(x).replace(" ago", "")}` : "yet"} — check reason below
          </section>` : ""}

        <section class="flow-section">
          ${this._renderFlow(e)}
        </section>

        <section class="info-row">
          <div><span class="lbl">Mode</span><strong>${f(l)}</strong></div>
          <div><span class="lbl">Control</span><strong>${a ? "On" : "Off"}</strong></div>
          <div><span class="lbl">Car</span><strong>${n ? "Connected" : "Away"}</strong></div>
          <div><span class="lbl">Free window</span><strong>${b(this._s(e.inFreeWindow)) ? "Active ☀️" : "—"}</strong></div>
        </section>

        <section class="metrics-grid">
          ${this._metric("Base import", h(this._s(e.baseGridImport)), "excl. EV")}
          ${this._metric("Safe limit", h(this._s(e.safeImportLimit)), "breaker")}
          ${this._metric("Spare", h(this._s(e.spareCapacity)), "headroom")}
          ${this._metric("Target", P(this._s(e.targetAmps)), "calc. limit")}
          ${this._metric("Actual", P(this._s(e.actualCurrent)), "charger")}
          ${this._metric("Reserve", H(this._s(e.overnightReservePct)), "overnight")}
        </section>

        <section class="ev-history">
          <div class="ev-stats">
            <div>
              <span class="lbl">EV today</span>
              <strong>${S(Number((F = this._s(e.evEnergyToday)) == null ? void 0 : F.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last session</span>
              <strong>${S(Number((M = this._s(e.evLastSessionEnergy)) == null ? void 0 : M.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last charged</span>
              <strong class="${k ? "warn-text" : ""}">
                ${w ? "Charging now ⚡" : y ? I(x) : "never"}
              </strong>
            </div>
          </div>
          ${this._renderEvWeek(e)}
        </section>

        <section class="reason-row">
          <span class="lbl">Reason</span>
          <p>${f(L(this._s(e.reason)))}</p>
        </section>

        <section class="safety-row">
          ${this._safetyItem("Grid sensor", b(this._s(e.gridSensorOk)))}
          ${this._safetyItem("Charger", b(this._s(e.chargerSensorOk)))}
          ${this._safetyItem("Breaker", b(this._s(e.breakerLimitOk)))}
          ${this._safetyItem("Free window", b(this._s(e.inFreeWindow)))}
        </section>

        ${c ? `
          <section class="controls-row">
            <div class="mode-buttons">
              ${R.map((z) => `
                <button class="${l === z.option ? "sel" : ""}"
                  data-action="mode" data-option="${z.option}" type="button">
                  ${z.label}
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
  _renderFlow(e) {
    const t = u(this._s(e.pvPower)), r = u(this._s(e.gridImport)), a = u(this._s(e.batteryPower)), s = u(this._s(e.chargerPower)), l = u(this._s(e.loadPower)), i = u(this._s(e.batterySoc)), n = t > 50, c = r > 50, d = r < -50, p = a > 50, v = a < -50, g = s > 50, m = l > 50, $ = "#f59e0b", w = d ? "#22c55e" : "#ef4444", x = p ? "#3b82f6" : v ? "#f59e0b" : "#6b7280", y = "#a855f7", _ = "#64748b";
    return `
    <div class="flow-wrap">
      <!-- SVG layer for paths -->
      <svg class="flow-svg" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet">
        <defs>
          ${this._gradDef("g-pv", "#f59e0b", n)}
          ${this._gradDef("g-grid", w, c || d)}
          ${this._gradDef("g-bat", x, p || v)}
          ${this._gradDef("g-ev", y, g)}
          ${this._gradDef("g-load", _, m)}
        </defs>

        <!-- Solar → Home -->
        ${this._flowPath(
      "M 72 55 C 72 130 180 55 180 130",
      n,
      $,
      "g-pv",
      "0 → 1",
      h(this._s(e.pvPower))
    )}

        <!-- Grid → Home  /  Home → Grid -->
        ${this._flowPath(
      "M 288 55 C 288 130 180 55 180 130",
      c,
      w,
      "g-grid",
      "1 → 0",
      c ? h(this._s(e.gridImport)) : ""
    )}
        ${this._flowPath(
      "M 180 130 C 180 55 288 130 288 55",
      d,
      "#22c55e",
      "g-grid",
      "0 → 1",
      d ? h(this._s(e.gridImport)) : ""
    )}

        <!-- Home → Battery  /  Battery → Home -->
        ${this._flowPath(
      "M 180 130 C 180 210 60 130 60 210",
      p,
      x,
      "g-bat",
      "0 → 1",
      p ? h(this._s(e.batteryPower)) : ""
    )}
        ${this._flowPath(
      "M 60 210 C 60 130 180 210 180 130",
      v,
      x,
      "g-bat",
      "0 → 1",
      v ? h(this._s(e.batteryPower)) : ""
    )}

        <!-- Home → EV -->
        ${this._flowPath(
      "M 180 130 L 180 210",
      g,
      y,
      "g-ev",
      "0 → 1",
      g ? h(this._s(e.chargerPower)) : ""
    )}

        <!-- Home → Load -->
        ${this._flowPath(
      "M 180 130 C 180 210 300 130 300 210",
      m,
      _,
      "g-load",
      "0 → 1",
      m ? h(this._s(e.loadPower)) : ""
    )}
      </svg>

      <!-- Nodes -->
      <div class="node solar ${n ? "on" : ""}" style="--nc:${$}">
        ${this._solarIcon()}
        <div class="nval">${h(this._s(e.pvPower))}</div>
        <div class="nlbl">Solar</div>
      </div>

      <div class="node grid ${c ? "on" : d ? "exp" : ""}" style="--nc:${w}">
        ${this._gridIcon()}
        <div class="nval">${h(this._s(e.gridImport))}</div>
        <div class="nlbl">${d ? "Exporting" : "Grid"}</div>
      </div>

      <div class="node home" style="--nc:var(--primary-color,#1d6f9f)">
        ${this._homeIcon()}
      </div>

      <div class="node battery ${p ? "chg" : v ? "dis" : ""}" style="--nc:${x}">
        ${this._batteryRing(i, p, v)}
        <div class="nval">${h(this._s(e.batteryPower))}</div>
        <div class="nlbl">Battery</div>
      </div>

      <div class="node ev ${g ? "on" : ""}" style="--nc:${y}">
        ${this._evIcon(g)}
        <div class="nval">${h(this._s(e.chargerPower))}</div>
        <div class="nlbl">EV</div>
      </div>

      <div class="node house-load ${m ? "on" : ""}" style="--nc:${_}">
        ${this._loadIcon()}
        <div class="nval">${h(this._s(e.loadPower))}</div>
        <div class="nlbl">Load</div>
      </div>
    </div>`;
  }
  _gradDef(e, t, r) {
    return r ? `<linearGradient id="${e}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${t}" stop-opacity="0.4"/>
    </linearGradient>` : "";
  }
  _flowPath(e, t, r, a, s, l) {
    return t ? `
      <path d="${e}" fill="none" stroke="${r}" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
      <path d="${e}" fill="none" stroke="${r}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="6 10">
        <animate attributeName="stroke-dashoffset"
          from="${s === "0 → 1" ? "0" : "24"}" to="${s === "0 → 1" ? "24" : "0"}" dur="1.2s" repeatCount="indefinite"/>
      </path>
      ${l ? `<title>${l}</title>` : ""}` : `<path d="${e}" fill="none" stroke="var(--divider-color,rgba(127,127,127,0.2))" stroke-width="2"/>`;
  }
  // ── EV 7-day history strip ────────────────────────────────────────────
  _renderEvWeek(e) {
    var s, l;
    const t = (l = (s = this._s(e.evEnergyToday)) == null ? void 0 : s.attributes) == null ? void 0 : l.daily_totals, r = [];
    for (let i = 6; i >= 0; i--) {
      const n = /* @__PURE__ */ new Date();
      n.setDate(n.getDate() - i);
      const c = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`, d = Number((t == null ? void 0 : t[c]) ?? 0);
      r.push({
        date: c,
        kwh: Number.isFinite(d) ? d : 0,
        label: ["S", "M", "T", "W", "T", "F", "S"][n.getDay()]
      });
    }
    const a = Math.max(...r.map((i) => i.kwh), 1);
    return `
    <div class="ev-week">
      ${r.map((i, n) => `
        <div class="ev-day" title="${i.date}: ${i.kwh.toFixed(1)} kWh">
          <span class="ev-day-val">${i.kwh >= 0.05 ? i.kwh.toFixed(1) : ""}</span>
          <div class="ev-day-bar">
            <div class="ev-day-fill ${i.kwh >= 0.05 ? "" : "empty"} ${n === 6 ? "today" : ""}"
              style="height:${Math.max(4, i.kwh / a * 100).toFixed(1)}%"></div>
          </div>
          <span class="ev-day-lbl ${n === 6 ? "today" : ""}">${i.label}</span>
        </div>`).join("")}
    </div>`;
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
  _batteryRing(e, t, r) {
    const i = 2 * Math.PI * 26, n = e / 100 * i, c = t ? "#3b82f6" : r ? "#f59e0b" : e > 50 ? "#22c55e" : e > 20 ? "#f59e0b" : "#ef4444";
    return `
    <svg class="bat-ring" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r="26" fill="none"
        stroke="var(--divider-color,rgba(127,127,127,0.18))" stroke-width="6"/>
      <circle cx="36" cy="36" r="26" fill="none"
        stroke="${c}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${n.toFixed(1)} ${i.toFixed(1)}"
        transform="rotate(-90 36 36)"/>
      <text x="36" y="42" text-anchor="middle"
        font-size="15" font-weight="700" fill="${c}" stroke="none">${Math.round(e)}%</text>
    </svg>`;
  }
  _evIcon(e) {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="9" width="18" height="10" rx="2"/>
      <path d="M7 9 L7 6 C7 5.5 7.5 5 8 5 L16 5 C16.5 5 17 5.5 17 6 L17 9"/>
      <rect x="5" y="11" width="5" height="3" rx="0.5"/>
      <rect x="14" y="11" width="5" height="3" rx="0.5"/>
      <line x1="12" y1="11" x2="12" y2="14"/>
      ${e ? '<path d="M11.5 5.5 L10 8 L11.5 8 L10 11" fill="none" stroke="#a855f7" stroke-width="1.5"/>' : ""}
      <line x1="7" y1="19" x2="7" y2="21"/>
      <line x1="17" y1="19" x2="17" y2="21"/>
    </svg>`;
  }
  // ── Small helper renderers ────────────────────────────────────────────
  _metric(e, t, r) {
    return `<div class="metric">
      <span class="lbl">${f(e)}</span>
      <strong>${f(t)}</strong>
      <small>${f(r)}</small>
    </div>`;
  }
  _safetyItem(e, t) {
    return `<div class="safety-item ${t ? "ok" : "bad"}">
      <span></span>${f(e)}
    </div>`;
  }
  _carConnected(e) {
    if (!e || e === "-") return !1;
    const t = e.toLowerCase();
    return !["available", "unavailable", "disconnected", "not connected", "idle", "ready"].includes(t);
  }
}
const T = {
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
class j extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" });
  }
  setConfig(e) {
    this._config = { title: "Energy Schedule", battery_capacity_kwh: 48, ...e }, this._render();
  }
  set hass(e) {
    this._hass = e, this._render();
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:solar-charge-tariff-card", entity: "sensor.solar_charge_status" };
  }
  _baseId() {
    var t, r, a, s;
    const e = (s = ((r = (t = this._config) == null ? void 0 : t.entities) == null ? void 0 : r.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : s.split(".")[1];
    return e != null && e.endsWith("_status") ? e.slice(0, -7) : e;
  }
  _ent() {
    var a, s;
    const e = ((a = this._config) == null ? void 0 : a.entities) ?? {}, t = this._baseId(), r = {};
    for (const l of Object.keys(T)) {
      const [i, n] = T[l];
      r[l] = e[l] ?? (t ? `${i}.${t}_${n}` : void 0);
    }
    return (s = this._config) != null && s.entity && (r.status = e.status ?? this._config.entity), r;
  }
  _s(e) {
    var t;
    return e ? (t = this._hass) == null ? void 0 : t.states[e] : void 0;
  }
  _render() {
    var y, _;
    if (!this.shadowRoot || !this._config) return;
    const e = this._ent(), t = /* @__PURE__ */ new Date(), r = t.getHours() + t.getMinutes() / 60, a = W(r), s = this._config.battery_capacity_kwh ?? 48, l = b(this._s(e.zeroheroEligible)), i = u(this._s(e.zeroheroImportKwh)), n = u(this._s(e.superExportKwh)), c = u(this._s(e.overnightAvgConsumption)) || null, d = u(this._s(e.overnightReservePct)), p = u(this._s(e.overnightSnapshotCount)), v = u(this._s(e.currentInverterSlot)) || 0, g = u(this._s(e.batterySoc)), m = r >= 18 && r < 21, $ = ((y = C.find((k) => k.start > r)) == null ? void 0 : y.start) ?? C[0].start + 24, w = Math.round(($ - r) * 60), x = ((_ = C.find((k) => k.start === $ % 24)) == null ? void 0 : _.label) ?? "";
    this.shadowRoot.innerHTML = `
      <style>${B}</style>
      <article class="card">

        <header class="t-header">
          <h2>${f(this._config.title ?? "Energy Schedule")}</h2>
          <div class="current-period" style="color:${a.color}">
            ${f(a.label)} &nbsp;·&nbsp; ${f(a.cost)}/kWh
          </div>
        </header>

        <section class="timeline-wrap">
          ${this._renderTimeline(r)}
          <div class="next-period">
            Next: <strong>${f(x)}</strong>
            in ${Math.floor(w / 60)}h ${w % 60}m
          </div>
        </section>

        <section class="two-col">

          <!-- ZeroHero -->
          <div class="panel ${m ? l ? "panel-ok" : "panel-warn" : "panel-dim"}">
            <div class="panel-title">🏆 ZeroHero Credit</div>
            <div class="panel-sub">$1/day if imports ≤ 0.09 kWh (6pm–9pm)</div>
            ${m ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill ${l ? "green" : "red"}"
                    style="width:${Math.min(100, i / 0.09 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${i.toFixed(3)} / 0.09 kWh</span>
              </div>
              <div class="panel-status ${l ? "ok" : "bad"}">
                ${l ? "✓ On track" : "✗ Limit exceeded"}
              </div>` : r >= 21 ? '<div class="panel-status dim">Window closed</div>' : `<div class="panel-status dim">Window starts ${21 - Math.ceil(r)}h ${r < 18 ? Math.round((18 - r) * 60) + "m" : ""}~</div>`}
          </div>

          <!-- Super Export -->
          <div class="panel ${m ? "panel-purple" : "panel-dim"}">
            <div class="panel-title">⚡ Super Export</div>
            <div class="panel-sub">15c/kWh on first 15 kWh (6pm–9pm)</div>
            ${m || n > 0 ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill purple"
                    style="width:${Math.min(100, n / 15 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${n.toFixed(2)} / 15 kWh</span>
              </div>
              <div class="panel-status purple">
                ≈ $${(n * 0.2).toFixed(2)} earned
              </div>` : `<div class="panel-status dim">${r < 18 ? "Starts at 6pm" : "No data yet"}</div>`}
          </div>

        </section>

        <section class="overnight-section">
          <div class="panel-title">🔋 Overnight Reserve</div>
          <div class="overnight-grid">
            <div class="ov-stat">
              <span class="ov-val">${c != null ? S(c) : "—"}</span>
              <span class="ov-lbl">Avg overnight use</span>
              <span class="ov-sub">${p} day${p !== 1 ? "s" : ""} of data</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${d ? d + "%" : "—"}</span>
              <span class="ov-lbl">Reserve target</span>
              <span class="ov-sub">≈ ${d ? S(d / 100 * s) : "—"}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${g ? Math.round(g) + "%" : "—"}</span>
              <span class="ov-lbl">Current SOC</span>
              <span class="ov-sub">≈ ${S(g / 100 * s)}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${v ? `Slot ${v}` : "—"}</span>
              <span class="ov-lbl">Active slot</span>
              <span class="ov-sub">${this._slotLabel(v)}</span>
            </div>
          </div>
          ${p < 3 ? `<p class="data-notice">Collecting data — ${3 - p} more night${3 - p !== 1 ? "s" : ""} needed for smart reserve.</p>` : ""}
        </section>

      </article>`;
  }
  _renderTimeline(e) {
    const r = C.map((s) => {
      const l = (s.end - s.start) / 24 * 100;
      return s.start / 24 * 100, `<div class="t-bar" title="${s.label} ${s.cost}"
        style="width:${l.toFixed(2)}%;background:${s.color};opacity:0.85"></div>`;
    }).join(""), a = e / 24 * 100;
    return `
    <div class="timeline">
      <div class="t-bars">${r}</div>
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
  _slotLabel(e) {
    return {
      1: "00:00 coast",
      2: "11:00 free charge",
      3: "14:00 hold",
      4: "16:00 peak",
      5: "18:00 export",
      6: "21:00 reserve"
    }[e] ?? "—";
  }
}
const A = `
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
`, B = `
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
customElements.get("solar-charge-card") || customElements.define("solar-charge-card", D);
customElements.get("solar-charge-tariff-card") || customElements.define("solar-charge-tariff-card", j);
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
