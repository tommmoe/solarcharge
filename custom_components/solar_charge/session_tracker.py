"""Persistence wrapper around the charge-session engine.

Stores session history and daily EV energy totals in HA storage so the
"when did the car last actually charge?" question survives restarts.
"""

from __future__ import annotations

from datetime import datetime
import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .session_engine import EVENT_ENDED, EVENT_STARTED, SessionEngine

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "solar_charge_sessions"
STORAGE_VERSION = 1

# While charging, persist accumulated energy at most this often so a
# restart mid-session loses only a few minutes of accounting.
ACTIVE_SAVE_EVERY_N_UPDATES = 5


class ChargeSessionTracker:
    """Track EV charge sessions and persist them across HA restarts."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._hass = hass
        self._store: Store = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry_id}"
        )
        self.engine = SessionEngine()
        self._loaded = False
        self._updates_since_save = 0

    async def async_load(self) -> None:
        """Restore persisted session data."""
        data = await self._store.async_load()
        if data and isinstance(data, dict):
            self.engine = SessionEngine.from_dict(data)
            _LOGGER.debug(
                "Loaded %d charge sessions from storage", len(self.engine.sessions)
            )
        self._loaded = True

    def update(self, now: datetime, charger_power_w: float | None) -> None:
        """Feed one coordinator cycle into the engine. Saves when needed."""
        if not self._loaded:
            return

        event = self.engine.update(now, charger_power_w)
        self._updates_since_save += 1

        if event == EVENT_STARTED:
            _LOGGER.info("EV charge session started")
        elif event == EVENT_ENDED:
            session = self.engine.last_completed_session
            _LOGGER.info(
                "EV charge session ended: %.2f kWh",
                session.energy_kwh if session else 0.0,
            )

        if event in (EVENT_STARTED, EVENT_ENDED) or (
            self.engine.charging_active
            and self._updates_since_save >= ACTIVE_SAVE_EVERY_N_UPDATES
        ):
            self._updates_since_save = 0
            self._hass.async_create_task(self._async_save())

    async def _async_save(self) -> None:
        await self._store.async_save(self.engine.to_dict())
