function v(s) {
  return s.replace(
    /[&<>"']/g,
    (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[e] ?? e
  );
}
function b(s) {
  const e = Number(s == null ? void 0 : s.state);
  return Number.isFinite(e) ? e : 0;
}
function C(s) {
  return !s || s.state === "unknown" || s.state === "unavailable" ? "-" : s.state;
}
function g(s) {
  return (s == null ? void 0 : s.state) === "on";
}
function $(s) {
  const e = Number(s == null ? void 0 : s.state);
  if (!s || !Number.isFinite(e)) return "-";
  const t = String(s.attributes.unit_of_measurement ?? "W").toLowerCase() === "kw" ? e * 1e3 : e;
  return Math.abs(t) >= 1e3 ? `${(t / 1e3).toFixed(1)} kW` : `${Math.round(t)} W`;
}
function F(s, e = 2) {
  return s == null || !Number.isFinite(s) ? "-" : `${s.toFixed(e)} kWh`;
}
function N(s) {
  const e = Number(s == null ? void 0 : s.state);
  return !s || !Number.isFinite(e) ? "-" : `${Math.abs(e - Math.round(e)) < 0.05 ? Math.round(e).toString() : e.toFixed(1)} A`;
}
function K(s) {
  const e = Number(s == null ? void 0 : s.state);
  return !s || !Number.isFinite(e) ? "-" : `${Math.round(e)}%`;
}
function R(s) {
  if (!s) return "never";
  const e = new Date(s).getTime();
  if (!Number.isFinite(e)) return "never";
  const o = Math.floor((Date.now() - e) / 6e4);
  if (o < 1) return "just now";
  if (o < 60) return `${o}m ago`;
  const t = Math.floor(o / 60);
  return t < 24 ? `${t}h ${o % 60}m ago` : `${Math.floor(t / 24)}d ${t % 24}h ago`;
}
function B(s) {
  if (!s) return null;
  const e = new Date(s).getTime();
  return Number.isFinite(e) ? (Date.now() - e) / 36e5 : null;
}
function V(s) {
  const e = Math.max(0, Math.ceil(s / 1e3)), o = Math.floor(e / 60), t = e % 60;
  return `${o}:${t.toString().padStart(2, "0")}`;
}
const A = {
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
}, q = [
  { label: "Off", option: "Off" },
  { label: "Solar", option: "Solar only" },
  { label: "Free", option: "Free hours only" },
  { label: "Hybrid", option: "Free hours or solar" },
  { label: "Force", option: "Force charge" }
], S = [
  { start: 0, end: 11, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 11, end: 14, label: "Free ☀️", color: "#16a34a", cost: "FREE" },
  { start: 14, end: 16, label: "Shoulder", color: "#4b5563", cost: "46.2c" },
  { start: 16, end: 18, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 18, end: 21, label: "⚡ Export", color: "#7c3aed", cost: "20c*" },
  { start: 21, end: 23, label: "Peak", color: "#b45309", cost: "57.2c" },
  { start: 23, end: 24, label: "Shoulder", color: "#4b5563", cost: "46.2c" }
];
function j(s) {
  return S.find((e) => s >= e.start && s < e.end) ?? S[0];
}
const D = {
  solar: [104, 52],
  grid: [256, 52],
  home: [180, 150],
  battery: [70, 244],
  ev: [180, 244],
  load: [290, 244]
}, E = {
  solar: 26,
  grid: 26,
  ev: 26,
  load: 26,
  home: 28,
  battery: 26
};
function G(s, e) {
  const o = D[s], t = D[e], a = t[0] - o[0], r = t[1] - o[1], n = Math.hypot(a, r) || 1, i = a / n, l = r / n, p = o[0] + i * E[s], d = o[1] + l * E[s], c = t[0] - i * E[e], h = t[1] - l * E[e], f = (p + c) / 2, u = (d + h) / 2, x = n * 0.05 * (f < 180 ? -1 : f > 180 ? 1 : 0), w = f + -l * x, m = u + i * x;
  return `M ${p.toFixed(1)} ${d.toFixed(1)} Q ${w.toFixed(1)} ${m.toFixed(1)} ${c.toFixed(1)} ${h.toFixed(1)}`;
}
class X extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" }), this.shadowRoot.addEventListener("click", (e) => void this._handleClick(e));
  }
  connectedCallback() {
    this._loadSnooze() && this._startSnoozeTimer();
  }
  disconnectedCallback() {
    this._clearSnoozeTimer();
  }
  _snoozeKey() {
    return `solar_charge_snooze_${this._baseId() ?? "default"}`;
  }
  _loadSnooze() {
    try {
      const e = localStorage.getItem(this._snoozeKey());
      if (!e) return null;
      const o = JSON.parse(e);
      return typeof o.endsAt == "number" && typeof o.prevMode == "string" ? o : null;
    } catch {
      return null;
    }
  }
  _saveSnooze(e) {
    try {
      localStorage.setItem(this._snoozeKey(), JSON.stringify(e));
    } catch {
    }
  }
  _clearSnooze() {
    try {
      localStorage.removeItem(this._snoozeKey());
    } catch {
    }
    this._clearSnoozeTimer();
  }
  _startSnoozeTimer() {
    this._clearSnoozeTimer(), this._snoozeInterval = setInterval(() => {
      const e = this._loadSnooze();
      if (!e) {
        this._clearSnoozeTimer(), this._render();
        return;
      }
      Date.now() >= e.endsAt ? this._restoreFromSnooze(e) : this._render();
    }, 5e3);
  }
  _clearSnoozeTimer() {
    this._snoozeInterval != null && (clearInterval(this._snoozeInterval), this._snoozeInterval = void 0);
  }
  async _restoreFromSnooze(e) {
    if (this._clearSnooze(), this._render(), !this._hass) return;
    const o = this._ent();
    o.mode && await this._hass.callService("select", "select_option", {
      entity_id: o.mode,
      option: e.prevMode
    });
  }
  setConfig(e) {
    var o;
    if (!e.entity && !((o = e.entities) != null && o.status))
      throw new Error("Solar Charge card requires entity or entities.status");
    this._config = { title: "Solar Charge", show_controls: !0, ...e }, this._render();
  }
  set hass(e) {
    this._hass = e, this._render();
  }
  getCardSize() {
    return 5;
  }
  static getStubConfig() {
    return { type: "custom:solar-charge-card", entity: "sensor.solar_charge_status", title: "Solar Charge" };
  }
  _baseId() {
    var o, t, a, r;
    const e = (r = ((t = (o = this._config) == null ? void 0 : o.entities) == null ? void 0 : t.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : r.split(".")[1];
    return e != null && e.endsWith("_status") ? e.slice(0, -7) : e;
  }
  _ent() {
    var a, r;
    const e = ((a = this._config) == null ? void 0 : a.entities) ?? {}, o = this._baseId(), t = {};
    for (const n of Object.keys(A)) {
      const [i, l] = A[n], p = o ? `${i}.${o}_${l}` : void 0;
      t[n] = e[n] ?? this._resolveGeneratedEntity(i, l, p);
    }
    return (r = this._config) != null && r.entity && (t.status = e.status ?? this._config.entity), t;
  }
  _resolveGeneratedEntity(e, o, t) {
    if (!this._hass || !t || this._hass.states[t]) return t;
    const a = `_${o}`, r = Object.keys(this._hass.states).filter((n) => {
      const [i, l] = n.split(".", 2);
      return i === e && (l == null ? void 0 : l.endsWith(a));
    });
    return r.length === 1 ? r[0] : t;
  }
  _s(e) {
    var o;
    return e ? (o = this._hass) == null ? void 0 : o.states[e] : void 0;
  }
  async _handleClick(e) {
    var a;
    const o = e.composedPath().find(
      (r) => r instanceof HTMLElement && r.dataset.action
    );
    if (!o || !this._hass) return;
    const t = this._ent();
    if (o.dataset.action === "mode" && t.mode)
      await this._hass.callService("select", "select_option", {
        entity_id: t.mode,
        option: o.dataset.option
      });
    else if (o.dataset.action === "toggle-control" && t.controlEnabled) {
      const r = g(this._s(t.controlEnabled));
      await this._hass.callService("switch", r ? "turn_off" : "turn_on", {
        entity_id: t.controlEnabled
      });
    } else if (o.dataset.action === "snooze" && t.mode) {
      const r = C(this._s(t.mode)), n = ((a = this._config) == null ? void 0 : a.snooze_minutes) ?? 5;
      this._saveSnooze({ endsAt: Date.now() + n * 6e4, prevMode: r }), this._startSnoozeTimer(), await this._hass.callService("select", "select_option", {
        entity_id: t.mode,
        option: "Off"
      });
    } else if (o.dataset.action === "cancel-snooze") {
      const r = this._loadSnooze();
      this._clearSnooze(), this._render(), r && this._hass && t.mode && await this._hass.callService("select", "select_option", {
        entity_id: t.mode,
        option: r.prevMode
      });
    }
  }
  _render() {
    var P, T, W;
    if (!this.shadowRoot || !this._config) return;
    const e = this._ent(), o = C(this._s(e.status)), t = g(this._s(e.allowedToCharge)), a = g(this._s(e.controlEnabled)), r = g(this._s(e.gridSensorOk)) && g(this._s(e.chargerSensorOk)) && g(this._s(e.breakerLimitOk)), n = C(this._s(e.mode)), i = C(this._s(e.chargerStatus)), l = this._carConnected(i), p = this._config.show_controls !== !1, d = r ? t ? "active" : "idle" : "danger", c = this._loadSnooze(), h = !!c && Date.now() < c.endsAt;
    c && Date.now() >= c.endsAt && this._restoreFromSnooze(c);
    const f = h ? V(c.endsAt - Date.now()) : "", u = this._config.snooze_minutes ?? 5, x = /* @__PURE__ */ new Date(), w = x.getHours() + x.getMinutes() / 60, m = j(w), y = w >= 18 && w < 21, _ = y && g(this._s(e.zeroheroEligible)), k = g(this._s(e.evCharging)), z = (P = this._s(e.evLastCharged)) == null ? void 0 : P.state, M = !!z && z !== "unknown" && z !== "unavailable", O = M ? B(z) : null, L = l && !k && (!M || O != null && O >= 24);
    this.shadowRoot.innerHTML = `
      <style>${U}</style>
      <article class="card ${d}">

        <header class="header">
          <div class="header-left">
            <h2>${v(this._config.title ?? "Solar Charge")}</h2>
            <p>${v(o)}</p>
          </div>
          <div class="header-right">
            ${y ? `
              <div class="zerohero-badge ${_ ? "ok" : "risk"}">
                ${_ ? "✓" : "⚠"} ZeroHero
              </div>` : ""}
            <div class="period-badge" style="background:${m.color}20;color:${m.color};border-color:${m.color}40">
              ${v(m.label)} · ${v(m.cost)}
            </div>
            <div class="status-pill ${d}">
              <span></span>${t ? "Charging" : r ? "Waiting" : "Check"}
            </div>
          </div>
        </header>

        ${L ? `
          <section class="stale-banner">
            ⚠ Plugged in but hasn't charged ${M ? `in ${R(z).replace(" ago", "")}` : "yet"} — check reason below
          </section>` : ""}

        <section class="flow-section">
          ${this._renderFlow(e)}
        </section>

        <section class="info-row">
          <div><span class="lbl">Mode</span><strong>${v(n)}</strong></div>
          <div><span class="lbl">Control</span><strong>${a ? "On" : "Off"}</strong></div>
          <div><span class="lbl">Car</span><strong>${l ? "Connected" : "Away"}</strong></div>
          <div><span class="lbl">Free window</span><strong>${g(this._s(e.inFreeWindow)) ? "Active ☀️" : "—"}</strong></div>
        </section>

        <section class="metrics-grid">
          ${this._metric("Base import", $(this._s(e.baseGridImport)), "excl. EV")}
          ${this._metric("Safe limit", $(this._s(e.safeImportLimit)), "breaker")}
          ${this._metric("Spare", $(this._s(e.spareCapacity)), "headroom")}
          ${this._metric("Target", N(this._s(e.targetAmps)), "calc. limit")}
          ${this._metric("Actual", N(this._s(e.actualCurrent)), "charger")}
          ${this._metric("Reserve", K(this._s(e.overnightReservePct)), "overnight")}
        </section>

        <section class="ev-history">
          <div class="ev-stats">
            <div>
              <span class="lbl">EV today</span>
              <strong>${F(Number((T = this._s(e.evEnergyToday)) == null ? void 0 : T.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last session</span>
              <strong>${F(Number((W = this._s(e.evLastSessionEnergy)) == null ? void 0 : W.state), 1)}</strong>
            </div>
            <div>
              <span class="lbl">Last charged</span>
              <strong class="${L ? "warn-text" : ""}">
                ${k ? "Charging now ⚡" : M ? R(z) : "never"}
              </strong>
            </div>
          </div>
          ${this._renderEvWeek(e)}
        </section>

        <section class="reason-row">
          <span class="lbl">Reason</span>
          <p>${v(C(this._s(e.reason)))}</p>
        </section>

        <section class="safety-row">
          ${this._safetyItem("Grid sensor", g(this._s(e.gridSensorOk)))}
          ${this._safetyItem("Charger", g(this._s(e.chargerSensorOk)))}
          ${this._safetyItem("Breaker", g(this._s(e.breakerLimitOk)))}
          ${this._safetyItem("Free window", g(this._s(e.inFreeWindow)))}
        </section>

        ${p ? `
          <section class="controls-row">
            <div class="mode-buttons">
              ${q.map((I) => `
                <button class="${n === I.option ? "sel" : ""}"
                  data-action="mode" data-option="${I.option}" type="button">
                  ${I.label}
                </button>`).join("")}
            </div>
            <button class="ctrl-toggle ${a ? "on" : ""}"
              data-action="toggle-control" type="button">
              ${a ? "Disable" : "Enable"} control
            </button>
          </section>
          <section class="snooze-row">
            ${h ? `
              <div class="snooze-active">
                <span class="snooze-label">&#9654; Resuming in ${f}</span>
                <button class="snooze-cancel" data-action="cancel-snooze" type="button">Cancel</button>
              </div>
            ` : `
              <button class="snooze-btn" data-action="snooze" type="button">
                Off (${u} min)
              </button>
            `}
          </section>` : ""}

      </article>`;
  }
  // ── Power flow diagram ────────────────────────────────────────────────
  _renderFlow(e) {
    const o = b(this._s(e.pvPower)), t = b(this._s(e.gridImport)), a = b(this._s(e.batteryPower)), r = b(this._s(e.chargerPower)), n = b(this._s(e.loadPower)), i = b(this._s(e.batterySoc)), l = o > 50, p = t > 50, d = t < -50, c = a > 50, h = a < -50, f = r > 50, u = n > 50, x = "#f59e0b", w = d ? "#22c55e" : "#ef4444", m = c ? "#3b82f6" : h ? "#f59e0b" : "#6b7280", y = "#a855f7", _ = "#64748b";
    return `
    <div class="flow-wrap">
      <svg class="flow-svg" viewBox="0 0 360 300" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="sc-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        ${this._flowEdge("solar", "home", l, x, !1)}
        ${this._flowEdge("grid", "home", p || d, w, d)}
        ${this._flowEdge("home", "battery", c || h, m, h)}
        ${this._flowEdge("home", "ev", f, y, !1)}
        ${this._flowEdge("home", "load", u, _, !1)}
      </svg>

      <div class="node solar ${l ? "on" : ""}" style="--nc:${x}">
        ${this._solarIcon()}
        <div class="ntext"><div class="nval">${$(this._s(e.pvPower))}</div><div class="nlbl">Solar</div></div>
      </div>

      <div class="node grid ${p || d ? "on" : ""}" style="--nc:${w}">
        ${this._gridIcon()}
        <div class="ntext"><div class="nval">${$(this._s(e.gridImport))}</div><div class="nlbl">${d ? "Export" : "Grid"}</div></div>
      </div>

      <div class="node home" style="--nc:var(--primary-color,#1d6f9f)">
        ${this._homeIcon()}
      </div>

      <div class="node battery ${c || h ? "on" : ""}" style="--nc:${m}">
        ${this._batteryRing(i, c, h)}
        <div class="ntext"><div class="nval">${$(this._s(e.batteryPower))}</div><div class="nlbl">Battery</div></div>
      </div>

      <div class="node ev ${f ? "on" : ""}" style="--nc:${y}">
        ${this._evIcon(f)}
        <div class="ntext"><div class="nval">${$(this._s(e.chargerPower))}</div><div class="nlbl">EV</div></div>
      </div>

      <div class="node load ${u ? "on" : ""}" style="--nc:${_}">
        ${this._loadIcon()}
        <div class="ntext"><div class="nval">${$(this._s(e.loadPower))}</div><div class="nlbl">Load</div></div>
      </div>
    </div>`;
  }
  _flowEdge(e, o, t, a, r) {
    const n = G(e, o);
    return t ? `
      <path d="${n}" fill="none" stroke="${a}" stroke-width="3" stroke-opacity="0.5" stroke-linecap="round"/>
      <circle class="flow-dot" r="3.8" fill="${a}" filter="url(#sc-glow)">
        <animateMotion dur="2s" repeatCount="indefinite" path="${n}" ${r ? 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ""}/>
      </circle>` : `<path d="${n}" fill="none" stroke="var(--divider-color,rgba(127,127,127,0.22))" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  // ── EV 7-day history strip ────────────────────────────────────────────
  _renderEvWeek(e) {
    var r, n;
    const o = (n = (r = this._s(e.evEnergyToday)) == null ? void 0 : r.attributes) == null ? void 0 : n.daily_totals, t = [];
    for (let i = 6; i >= 0; i--) {
      const l = /* @__PURE__ */ new Date();
      l.setDate(l.getDate() - i);
      const p = `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`, d = Number((o == null ? void 0 : o[p]) ?? 0);
      t.push({
        date: p,
        kwh: Number.isFinite(d) ? d : 0,
        label: ["S", "M", "T", "W", "T", "F", "S"][l.getDay()]
      });
    }
    const a = Math.max(...t.map((i) => i.kwh), 1);
    return `
    <div class="ev-week">
      ${t.map((i, l) => `
        <div class="ev-day" title="${i.date}: ${i.kwh.toFixed(1)} kWh">
          <span class="ev-day-val">${i.kwh >= 0.05 ? i.kwh.toFixed(1) : ""}</span>
          <div class="ev-day-bar">
            <div class="ev-day-fill ${i.kwh >= 0.05 ? "" : "empty"} ${l === 6 ? "today" : ""}"
              style="height:${Math.max(4, i.kwh / a * 100).toFixed(1)}%"></div>
          </div>
          <span class="ev-day-lbl ${l === 6 ? "today" : ""}">${i.label}</span>
        </div>`).join("")}
    </div>`;
  }
  // ── Node icons ────────────────────────────────────────────────────────
  _solarIcon() {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4.5" width="18" height="11" rx="1"/>
      <line x1="3" y1="8.2" x2="21" y2="8.2"/><line x1="3" y1="11.8" x2="21" y2="11.8"/>
      <line x1="9" y1="4.5" x2="9" y2="15.5"/><line x1="15" y1="4.5" x2="15" y2="15.5"/>
      <line x1="12" y1="15.5" x2="12" y2="19"/><line x1="8.5" y1="20" x2="15.5" y2="20"/>
      <line x1="12" y1="19" x2="12" y2="20"/>
    </svg>`;
  }
  _gridIcon() {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="2.5" x2="6.5" y2="21.5"/><line x1="12" y1="2.5" x2="17.5" y2="21.5"/>
      <line x1="9.4" y1="5" x2="14.6" y2="5"/>
      <line x1="8.9" y1="9" x2="15.1" y2="9"/><line x1="8" y1="14" x2="16" y2="14"/>
      <line x1="7.1" y1="19" x2="16.9" y2="19"/>
      <path d="M8.9 9 L15.1 14"/><path d="M15.1 9 L8.9 14"/>
      <path d="M8 14 L16.9 19"/><path d="M16 14 L7.1 19"/>
    </svg>`;
  }
  _homeIcon() {
    return `<svg class="nicon home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 11.5 L12 3.5 L21 11.5"/>
      <path d="M5.2 9.8 V20 C5.2 20.5 5.6 20.8 6 20.8 H18 C18.4 20.8 18.8 20.5 18.8 20 V9.8"/>
      <path d="M9.3 20.8 V15 C9.3 14.5 9.7 14.2 10.1 14.2 H13.9 C14.3 14.2 14.7 14.5 14.7 15 V20.8"/>
    </svg>`;
  }
  _loadIcon() {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.4 14.5 C7.9 13.6 7.3 13 6.6 12.3 A5.2 5.2 0 1 1 17.4 12.3 C16.7 13 16.1 13.6 15.6 14.5"/>
      <line x1="9" y1="17.5" x2="15" y2="17.5"/><line x1="10" y1="20.5" x2="14" y2="20.5"/>
    </svg>`;
  }
  _batteryRing(e, o, t) {
    const i = 2 * Math.PI * 22, l = e / 100 * i, p = o ? "#3b82f6" : t ? "#f59e0b" : e > 50 ? "#22c55e" : e > 20 ? "#f59e0b" : "#ef4444";
    return `
    <svg class="bat-ring" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="22" fill="none"
        stroke="var(--divider-color,rgba(127,127,127,0.18))" stroke-width="5"/>
      <circle cx="28" cy="28" r="22" fill="none"
        stroke="${p}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${l.toFixed(1)} ${i.toFixed(1)}"
        transform="rotate(-90 28 28)"/>
      <text x="28" y="33" text-anchor="middle"
        font-size="15" font-weight="700" fill="${p}" stroke="none">${Math.round(e)}</text>
    </svg>`;
  }
  _evIcon(e) {
    return `<svg class="nicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 16.5 H3.4 C2.9 16.5 2.5 16.1 2.5 15.6 V13.2 C2.5 12.8 2.6 12.4 2.8 12 L4 9.6 C4.3 9.1 4.8 8.8 5.3 8.8 H13 C13.6 8.8 14.1 9 14.5 9.4 L16.8 11.6 C17 11.8 17.3 11.9 17.6 12 L19.8 12.5 C20.5 12.7 21 13.3 21 14 V15.6 C21 16.1 20.6 16.5 20.1 16.5 H18.6"/>
      <circle cx="7.4" cy="16.6" r="1.9"/><circle cx="16.2" cy="16.6" r="1.9"/>
      <line x1="9.3" y1="16.6" x2="14.3" y2="16.6"/>
      ${e ? '<path d="M12.4 10.3 L10.6 13 L12.2 13 L11.2 15.4" fill="none" stroke="#a855f7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' : ""}
    </svg>`;
  }
  // ── Small helper renderers ────────────────────────────────────────────
  _metric(e, o, t) {
    return `<div class="metric">
      <span class="lbl">${v(e)}</span>
      <strong>${v(o)}</strong>
      <small>${v(t)}</small>
    </div>`;
  }
  _safetyItem(e, o) {
    return `<div class="safety-item ${o ? "ok" : "bad"}">
      <span></span>${v(e)}
    </div>`;
  }
  _carConnected(e) {
    if (!e || e === "-") return !1;
    const o = e.toLowerCase();
    return !["available", "unavailable", "disconnected", "not connected", "idle", "ready"].includes(o);
  }
}
const H = {
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
class Z extends HTMLElement {
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
    var o, t, a, r;
    const e = (r = ((t = (o = this._config) == null ? void 0 : o.entities) == null ? void 0 : t.status) ?? ((a = this._config) == null ? void 0 : a.entity)) == null ? void 0 : r.split(".")[1];
    return e != null && e.endsWith("_status") ? e.slice(0, -7) : e;
  }
  _ent() {
    var a, r;
    const e = ((a = this._config) == null ? void 0 : a.entities) ?? {}, o = this._baseId(), t = {};
    for (const n of Object.keys(H)) {
      const [i, l] = H[n];
      t[n] = e[n] ?? (o ? `${i}.${o}_${l}` : void 0);
    }
    return (r = this._config) != null && r.entity && (t.status = e.status ?? this._config.entity), t;
  }
  _s(e) {
    var o;
    return e ? (o = this._hass) == null ? void 0 : o.states[e] : void 0;
  }
  _render() {
    var y, _;
    if (!this.shadowRoot || !this._config) return;
    const e = this._ent(), o = /* @__PURE__ */ new Date(), t = o.getHours() + o.getMinutes() / 60, a = j(t), r = this._config.battery_capacity_kwh ?? 48, n = g(this._s(e.zeroheroEligible)), i = b(this._s(e.zeroheroImportKwh)), l = b(this._s(e.superExportKwh)), p = b(this._s(e.overnightAvgConsumption)) || null, d = b(this._s(e.overnightReservePct)), c = b(this._s(e.overnightSnapshotCount)), h = b(this._s(e.currentInverterSlot)) || 0, f = b(this._s(e.batterySoc)), u = t >= 18 && t < 21, x = ((y = S.find((k) => k.start > t)) == null ? void 0 : y.start) ?? S[0].start + 24, w = Math.round((x - t) * 60), m = ((_ = S.find((k) => k.start === x % 24)) == null ? void 0 : _.label) ?? "";
    this.shadowRoot.innerHTML = `
      <style>${J}</style>
      <article class="card">

        <header class="t-header">
          <h2>${v(this._config.title ?? "Energy Schedule")}</h2>
          <div class="current-period" style="color:${a.color}">
            ${v(a.label)} &nbsp;·&nbsp; ${v(a.cost)}/kWh
          </div>
        </header>

        <section class="timeline-wrap">
          ${this._renderTimeline(t)}
          <div class="next-period">
            Next: <strong>${v(m)}</strong>
            in ${Math.floor(w / 60)}h ${w % 60}m
          </div>
        </section>

        <section class="two-col">

          <!-- ZeroHero -->
          <div class="panel ${u ? n ? "panel-ok" : "panel-warn" : "panel-dim"}">
            <div class="panel-title">🏆 ZeroHero Credit</div>
            <div class="panel-sub">$1/day if imports ≤ 0.09 kWh (6pm–9pm)</div>
            ${u ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill ${n ? "green" : "red"}"
                    style="width:${Math.min(100, i / 0.09 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${i.toFixed(3)} / 0.09 kWh</span>
              </div>
              <div class="panel-status ${n ? "ok" : "bad"}">
                ${n ? "✓ On track" : "✗ Limit exceeded"}
              </div>` : t >= 21 ? '<div class="panel-status dim">Window closed</div>' : `<div class="panel-status dim">Window starts ${21 - Math.ceil(t)}h ${t < 18 ? Math.round((18 - t) * 60) + "m" : ""}~</div>`}
          </div>

          <!-- Super Export -->
          <div class="panel ${u ? "panel-purple" : "panel-dim"}">
            <div class="panel-title">⚡ Super Export</div>
            <div class="panel-sub">15c/kWh on first 15 kWh (6pm–9pm)</div>
            ${u || l > 0 ? `
              <div class="bar-wrap">
                <div class="bar-track">
                  <div class="bar-fill purple"
                    style="width:${Math.min(100, l / 15 * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-val">${l.toFixed(2)} / 15 kWh</span>
              </div>
              <div class="panel-status purple">
                ≈ $${(l * 0.2).toFixed(2)} earned
              </div>` : `<div class="panel-status dim">${t < 18 ? "Starts at 6pm" : "No data yet"}</div>`}
          </div>

        </section>

        <section class="overnight-section">
          <div class="panel-title">🔋 Overnight Reserve</div>
          <div class="overnight-grid">
            <div class="ov-stat">
              <span class="ov-val">${p != null ? F(p) : "—"}</span>
              <span class="ov-lbl">Avg overnight use</span>
              <span class="ov-sub">${c} day${c !== 1 ? "s" : ""} of data</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${d ? d + "%" : "—"}</span>
              <span class="ov-lbl">Reserve target</span>
              <span class="ov-sub">≈ ${d ? F(d / 100 * r) : "—"}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${f ? Math.round(f) + "%" : "—"}</span>
              <span class="ov-lbl">Current SOC</span>
              <span class="ov-sub">≈ ${F(f / 100 * r)}</span>
            </div>
            <div class="ov-stat">
              <span class="ov-val">${h ? `Slot ${h}` : "—"}</span>
              <span class="ov-lbl">Active slot</span>
              <span class="ov-sub">${this._slotLabel(h)}</span>
            </div>
          </div>
          ${c < 3 ? `<p class="data-notice">Collecting data — ${3 - c} more night${3 - c !== 1 ? "s" : ""} needed for smart reserve.</p>` : ""}
        </section>

      </article>`;
  }
  _renderTimeline(e) {
    const t = S.map((r) => {
      const n = (r.end - r.start) / 24 * 100;
      return r.start / 24 * 100, `<div class="t-bar" title="${r.label} ${r.cost}"
        style="width:${n.toFixed(2)}%;background:${r.color};opacity:0.85"></div>`;
    }).join(""), a = e / 24 * 100;
    return `
    <div class="timeline">
      <div class="t-bars">${t}</div>
      <div class="t-now" style="left:${a.toFixed(2)}%">
        <div class="t-now-line"></div>
        <div class="t-now-label">Now</div>
      </div>
      <div class="t-labels">
        ${[0, 4, 8, 11, 14, 16, 18, 21, 24].map(
      (r) => `<span style="left:${(r / 24 * 100).toFixed(1)}%">${r === 24 ? "0" : r}</span>`
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
const U = `
:host {
  display: block;
  color: var(--primary-text-color, #1f2933);
  container-type: inline-size;
}

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
  padding: 10px 12px 14px;
  background: radial-gradient(120% 80% at 50% 50%,
    color-mix(in srgb, var(--primary-color,#1d6f9f) 8%, transparent), transparent 70%);
}
.flow-wrap {
  position: relative; width: 100%; max-width: 420px; margin: 0 auto;
  aspect-ratio: 360 / 300; container-type: inline-size;
}
.flow-svg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 0;
}

/* Nodes — anchored on the icon centre so text never shifts the icon off the
   point the connector line targets. Positions mirror FLOW_POS / [360,300]. */
.node { position: absolute; z-index: 1; transform: translate(-50%,-50%); line-height: 0; }
.node.solar   { left: 28.9%; top: 17.3%; }
.node.grid    { left: 71.1%; top: 17.3%; }
.node.home    { left: 50%;   top: 50%; }
.node.battery { left: 19.4%; top: 81.3%; }
.node.ev      { left: 50%;   top: 81.3%; }
.node.load    { left: 80.6%; top: 81.3%; }

.ntext {
  position: absolute; top: calc(100% + 5px); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  white-space: nowrap; line-height: 1.15;
}

.nicon {
  display: block; width: 13.5cqw; height: 13.5cqw; padding: 2.7cqw;
  border-radius: 50%;
  background: var(--card-background-color, #fff);
  border: 2px solid var(--divider-color, rgba(127,127,127,.25));
  color: var(--secondary-text-color, #6b7280);
  transition: border-color .35s, color .35s, box-shadow .35s, background .35s;
}
.home-icon { width: 14.5cqw; height: 14.5cqw; padding: 3cqw; border-width: 2px; }

.node.on .nicon {
  border-color: var(--nc); color: var(--nc);
  background: color-mix(in srgb, var(--nc) 14%, var(--card-background-color,#fff));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--nc) 12%, transparent),
              0 0 14px color-mix(in srgb, var(--nc) 32%, transparent);
}
.node.home .nicon {
  border-color: var(--primary-color,#1d6f9f); color: var(--primary-color,#1d6f9f);
  background: color-mix(in srgb, var(--primary-color,#1d6f9f) 10%, var(--card-background-color,#fff));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color,#1d6f9f) 11%, transparent);
}

.bat-ring { display: block; width: 19cqw; height: 19cqw; }

.nval { font-size: 0.8rem; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.nlbl { font-size: 0.62rem; font-weight: 600; color: var(--secondary-text-color,#667085); text-transform: uppercase; letter-spacing: .04em; }

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

/* Snooze */
.snooze-row {
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 16px 12px; gap: 8px;
}
.snooze-btn {
  font-size: 0.75rem; min-height: 28px; padding: 0 10px;
  opacity: 0.75;
}
.snooze-btn:hover { opacity: 1; }
.snooze-active {
  display: flex; align-items: center; gap: 8px;
  background: rgba(168,85,247,.12); border: 1px solid rgba(168,85,247,.35);
  border-radius: 8px; padding: 4px 10px;
}
.snooze-label { font-size: 0.78rem; font-weight: 700; color: #a855f7; white-space: nowrap; }
.snooze-cancel {
  font-size: 0.72rem; min-height: 24px; padding: 0 8px;
  background: transparent; border-color: rgba(168,85,247,.45); color: #a855f7;
}
.snooze-cancel:hover { background: rgba(168,85,247,.15); border-color: #a855f7; }

@media (prefers-reduced-motion: reduce) {
  .flow-dot { display: none; }
}

/* Use the available card width, rather than the viewport width, to switch to
   a compact landscape layout. This keeps the existing layout in a narrow HA
   section and on mobile, while a section-spanning card becomes much shorter. */
@container (min-width: 760px) {
  .card {
    display: grid;
    grid-template-columns: minmax(330px, 5fr) minmax(390px, 7fr);
    grid-template-areas:
      "accent accent"
      "header header"
      "banner banner"
      "flow info"
      "flow metrics"
      "flow history"
      "flow reason"
      "flow safety"
      "controls controls"
      "snooze snooze";
    align-items: stretch;
  }
  .card::before { grid-area: accent; }
  .header { grid-area: header; padding-bottom: 8px; }
  .stale-banner { grid-area: banner; }
  .flow-section {
    grid-area: flow;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 8px 14px 12px;
    border-right: 1px solid var(--divider-color,rgba(127,127,127,.18));
  }
  .flow-wrap { max-width: 390px; }
  .info-row { grid-area: info; }
  .metrics-grid { grid-area: metrics; padding-top: 10px; padding-bottom: 10px; }
  .ev-history { grid-area: history; }
  .ev-day-bar { height: 32px; }
  .reason-row { grid-area: reason; }
  .safety-row { grid-area: safety; }
  .controls-row { grid-area: controls; }
  .snooze-row { grid-area: snooze; }
}

@media (max-width: 520px) {
  .info-row { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .metrics-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .safety-row { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .controls-row { grid-template-columns: 1fr; }
  .mode-buttons { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .header-right { flex-direction: row; flex-wrap: wrap; justify-content: flex-end; }
}
`, J = `
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
customElements.get("solar-charge-card") || customElements.define("solar-charge-card", X);
customElements.get("solar-charge-tariff-card") || customElements.define("solar-charge-tariff-card", Z);
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
