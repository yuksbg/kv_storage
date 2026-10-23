"""Persistent named key-value stores for Home Assistant."""

import asyncio
import logging
import sqlite3
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import SupportsResponse
from homeassistant.exceptions import ConfigEntryNotReady, HomeAssistantError, ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, PLATFORMS
from .panel import PanelSettings
from .storage import Database, validate_key

_LOGGER = logging.getLogger(__name__)


@dataclass
class Store:
    """Loaded store state; lock serializes commits and sensor publication."""

    name: str
    values: dict
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    loaded: bool = True


def signal(name):
    return f"{DOMAIN}_{name}_updated"


async def async_setup(hass, config):
    """Register services and the frontend once per HA runtime."""
    database = Database(hass.config.path(".storage", "kv_storage.sqlite3"))
    hass.data[DOMAIN] = {"database": database, "stores": {}}

    async def handle(call):
        name = call.data["store"]
        store = hass.data[DOMAIN]["stores"].get(name)
        if store is None:
            raise ServiceValidationError(f"Store '{name}' is not loaded")
        key = call.data.get("key")
        async with store.lock:
            if not store.loaded:
                raise ServiceValidationError(f"Store '{name}' is not loaded")
            if call.service == "get":
                if key is None:
                    return {"store": name, "values": deepcopy(store.values)}
                return {
                    "store": name,
                    "key": key,
                    "found": key in store.values,
                    "value": deepcopy(store.values.get(key)),
                }
            try:
                operation = database.set if call.service == "set" else database.delete
                args = (name, key, call.data["value"]) if call.service == "set" else (name, key)
                store.values = await hass.async_add_executor_job(operation, *args)
            except (ValueError, TypeError, RecursionError) as err:
                raise ServiceValidationError(str(err)) from err
            except sqlite3.Error as err:
                _LOGGER.exception("Failed to persist store %s", name)
                raise HomeAssistantError("SQLite write failed; value was not updated") from err
            async_dispatcher_send(hass, signal(name))

    def key_schema(value):
        try:
            return validate_key(value)
        except ValueError as err:
            raise vol.Invalid(str(err)) from err

    base = {vol.Required("store"): vol.All(str, vol.Length(min=1))}
    hass.services.async_register(
        DOMAIN,
        "get",
        handle,
        schema=vol.Schema(
            {
                **base,
                vol.Optional("key"): key_schema,
            }
        ),
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "set",
        handle,
        schema=vol.Schema(
            {
                **base,
                vol.Required("key"): key_schema,
                vol.Required("value"): object,
            }
        ),
    )
    hass.services.async_register(
        DOMAIN,
        "delete",
        handle,
        schema=vol.Schema(
            {
                **base,
                vol.Required("key"): key_schema,
            }
        ),
    )
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/kv_storage_static",
                str(Path(__file__).parent / "frontend"),
                False,
            )
        ]
    )
    panel = PanelSettings(hass)
    hass.data[DOMAIN]["panel"] = panel
    await panel.async_initialize()
    return True


async def async_setup_entry(hass, entry):
    """Load one named store and its sensor."""
    data = hass.data[DOMAIN]
    database = data["database"]
    name = entry.data["name"]
    try:
        await hass.async_add_executor_job(database.initialize)
        values = await hass.async_add_executor_job(database.load, name)
    except (OSError, sqlite3.Error, ValueError) as err:
        raise ConfigEntryNotReady(f"Cannot load SQLite store {name}") from err
    data["stores"][name] = Store(name, values)
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        data["stores"].pop(name, None)
        raise
    return True


async def async_unload_entry(hass, entry):
    """Unload the entity, retaining persistent data for re-adding the store."""
    store = hass.data[DOMAIN]["stores"][entry.data["name"]]
    async with store.lock:
        if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
            return False
        store.loaded = False
        hass.data[DOMAIN]["stores"].pop(store.name)
    return True
