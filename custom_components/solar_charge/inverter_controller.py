"""Inverter control logic for Solar Charge.

Writes Deye/Sunsynk program slot entities based on a calculated
InverterSchedule. Entity IDs are auto-derived from a configurable prefix
(e.g. "deye" → ``select.deye_prog1_time``, ``number.deye_prog1_capacity``, …).

Only writes to entities when values have actually changed, to avoid
hammering the Modbus connection every 60 seconds.
"""

from __future__ import annotations

from datetime import time
import logging
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import CONF_DEYE_ENTITY_PREFIX, CONF_INVERTER_CONTROL_ENABLED
from .inverter_schedule import InverterSlot, format_slot_time, current_slot_index

_LOGGER = logging.getLogger(__name__)

NUM_SLOTS = 6


class InverterController:
    """Apply inverter schedule to Deye program-slot entities."""

    def __init__(self, hass: HomeAssistant, coordinator: Any) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.last_action: dict[str, Any] | None = None

        # Track what was last successfully written so we don't repeat writes
        self._last_written_slots: list[InverterSlot] | None = None
        self._last_written_load_limit: str | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def async_apply_schedule(
        self,
        slots: list[InverterSlot],
        force: bool = False,
    ) -> None:
        """Write the schedule to the inverter entities if anything has changed.

        Args:
            slots: Exactly 6 InverterSlot objects in prog1→prog6 order.
            force: Write all entities regardless of cached state.
        """
        settings = self.coordinator.settings

        if not settings.get(CONF_INVERTER_CONTROL_ENABLED, False):
            self._record("Inverter control disabled; no writes")
            return

        prefix = settings.get(CONF_DEYE_ENTITY_PREFIX, "")
        if not prefix:
            self._record("Deye entity prefix not configured; no writes")
            return

        # Write program slots only when they change (not every 60 s)
        if force or self._slots_changed(slots):
            await self._write_all_slots(prefix, slots)

        # Load limit changes intraday (e.g. 18:00 → Allow Export) — check every cycle
        await self._manage_load_limit(prefix, slots)

    # ------------------------------------------------------------------
    # Slot writing
    # ------------------------------------------------------------------

    def _slots_changed(self, slots: list[InverterSlot]) -> bool:
        if self._last_written_slots is None:
            return True
        if len(slots) != len(self._last_written_slots):
            return True
        return any(a != b for a, b in zip(slots, self._last_written_slots, strict=True))

    async def _write_all_slots(self, prefix: str, slots: list[InverterSlot]) -> None:
        """Write all 6 slots to the Deye entities."""
        errors: list[str] = []

        for i, slot in enumerate(slots):
            n = i + 1
            label = f"prog{n}"

            time_ok = await self._set_select(
                f"select.{prefix}_prog{n}_time",
                format_slot_time(slot.start_time),
                f"{label} time",
            )
            charge_ok = await self._set_select(
                f"select.{prefix}_prog{n}_charge",
                slot.charge_mode,
                f"{label} charge",
            )
            cap_ok = await self._set_number(
                f"number.{prefix}_prog{n}_capacity",
                float(slot.capacity_pct),
                f"{label} capacity",
            )
            pwr_ok = await self._set_number(
                f"number.{prefix}_prog{n}_power",
                float(slot.power_w),
                f"{label} power",
            )

            if not all([time_ok, charge_ok, cap_ok, pwr_ok]):
                errors.append(label)

        if errors:
            self._record(
                f"Wrote inverter slots (errors on: {', '.join(errors)})"
            )
            _LOGGER.warning(
                "Inverter schedule write had errors on slots: %s", errors
            )
        else:
            self._record(f"Wrote {NUM_SLOTS} inverter program slots")
            _LOGGER.info("Inverter schedule written successfully")

        self._last_written_slots = list(slots)

    # ------------------------------------------------------------------
    # Load limit management
    # ------------------------------------------------------------------

    async def _manage_load_limit(
        self, prefix: str, slots: list[InverterSlot]
    ) -> None:
        """Set the load-limit entity to match the currently active slot."""
        now = dt_util.now()
        now_time = now.timetz().replace(tzinfo=None)

        idx = current_slot_index(now_time, slots)
        active_slot = slots[idx]
        target = active_slot.load_limit

        entity_id = f"select.{prefix}_load_limit"
        state = self.hass.states.get(entity_id)

        if state is None or state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
            _LOGGER.debug("Load limit entity not available: %s", entity_id)
            return

        if state.state == target:
            return  # Already correct

        if self._last_written_load_limit == target and state.state == target:
            return

        await self.hass.services.async_call(
            "select",
            "select_option",
            {"entity_id": entity_id, "option": target},
            blocking=True,
        )
        _LOGGER.info(
            "Load limit: %s → %s (slot %d, %s)",
            state.state,
            target,
            idx + 1,
            format_slot_time(active_slot.start_time),
        )
        self._record(
            f"Load limit {state.state} → {target}",
            service="select.select_option",
            entity_id=entity_id,
            option=target,
        )
        self._last_written_load_limit = target

    # ------------------------------------------------------------------
    # Low-level entity writers
    # ------------------------------------------------------------------

    async def _set_select(
        self, entity_id: str, option: str, label: str
    ) -> bool:
        """Select an option on a select entity. Returns True on success."""
        state = self.hass.states.get(entity_id)
        if state is None or state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
            _LOGGER.debug("Select entity unavailable: %s", entity_id)
            return False

        if state.state == option:
            return True  # Already correct — no write needed

        try:
            await self.hass.services.async_call(
                "select",
                "select_option",
                {"entity_id": entity_id, "option": option},
                blocking=True,
            )
            _LOGGER.debug("Set %s: %r → %r", label, state.state, option)
            return True
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Failed to set %s (%s): %s", label, entity_id, err)
            return False

    async def _set_number(
        self, entity_id: str, value: float, label: str
    ) -> bool:
        """Set a number entity. Returns True on success."""
        state = self.hass.states.get(entity_id)
        if state is None or state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}:
            _LOGGER.debug("Number entity unavailable: %s", entity_id)
            return False

        try:
            current = float(state.state)
        except (TypeError, ValueError):
            current = None

        if current is not None and abs(current - value) < 0.5:
            return True  # Close enough — skip write

        try:
            await self.hass.services.async_call(
                "number",
                "set_value",
                {"entity_id": entity_id, "value": value},
                blocking=True,
            )
            _LOGGER.debug("Set %s: %s → %s", label, current, value)
            return True
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Failed to set %s (%s): %s", label, entity_id, err)
            return False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _record(self, message: str, **extra: Any) -> None:
        self.last_action = {
            "time": dt_util.utcnow().isoformat(),
            "message": message,
            **extra,
        }
