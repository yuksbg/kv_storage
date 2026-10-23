"""A sensor exposing the key count and values of each store."""

from copy import deepcopy

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from . import signal
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([StoreSensor(hass.data[DOMAIN]["stores"][entry.data["name"]])])


class StoreSensor(SensorEntity):
    _attr_should_poll = False
    _attr_icon = "mdi:database"

    def __init__(self, store):
        self.store = store
        self._attr_name = store.name
        self._attr_unique_id = f"{DOMAIN}_{store.name}"
        self.entity_id = f"sensor.{store.name}"

    @property
    def native_value(self):
        return len(self.store.values)

    @property
    def extra_state_attributes(self):
        return {**deepcopy(self.store.values), "kv_storage_store": self.store.name}

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal(self.store.name),
                self._updated,
            )
        )

    @callback
    def _updated(self):
        self.async_write_ha_state()
