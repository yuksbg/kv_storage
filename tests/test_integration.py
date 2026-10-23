import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
import voluptuous as vol
from homeassistant.config_entries import ConfigEntries
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import device_registry, entity_registry
from homeassistant.helpers.entity_component import EntityComponent

from custom_components.kv_storage import async_setup, async_setup_entry, async_unload_entry
from custom_components.kv_storage.sensor import StoreSensor


@pytest.fixture
async def hass(tmp_path):
    instance = HomeAssistant(str(tmp_path))
    instance.config_entries = ConfigEntries(instance, {})
    await entity_registry.async_load(instance)
    await device_registry.async_load(instance)
    instance.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with patch("custom_components.kv_storage.panel_custom.async_register_panel", new=AsyncMock()):
        await async_setup(instance, {})
    yield instance
    await instance.async_stop(force=True)


async def add_store(hass, name):
    entry = SimpleNamespace(data={"name": name})
    with patch.object(hass.config_entries, "async_forward_entry_setups", new=AsyncMock()):
        await async_setup_entry(hass, entry)
    return entry


async def call(hass, service, **data):
    return await hass.services.async_call(
        "kv_storage",
        service,
        data,
        blocking=True,
        return_response=service == "get",
    )


async def test_services_sensor_and_restart(hass):
    entry = await add_store(hass, "my_store1")
    component = EntityComponent(logging.getLogger(__name__), "sensor", hass)
    sensor = StoreSensor(hass.data["kv_storage"]["stores"]["my_store1"])
    await component.async_add_entities([sensor])
    await call(hass, "set", store="my_store1", key="code", value="0012")
    await hass.async_block_till_done()
    state = hass.states.get("sensor.my_store1")
    assert state.state == "1"
    assert state.attributes["code"] == "0012"
    assert (await call(hass, "get", store="my_store1", key="code"))["value"] == "0012"
    await component.async_remove_entity("sensor.my_store1")
    with patch.object(
        hass.config_entries, "async_unload_platforms", new=AsyncMock(return_value=True)
    ):
        assert await async_unload_entry(hass, entry)
    await add_store(hass, "my_store1")
    assert (await call(hass, "get", store="my_store1"))["values"] == {"code": "0012"}


async def test_missing_and_null(hass):
    await add_store(hass, "one")
    assert await call(hass, "get", store="one", key="absent") == {
        "store": "one",
        "key": "absent",
        "found": False,
        "value": None,
    }
    await call(hass, "set", store="one", key="null", value=None)
    assert (await call(hass, "get", store="one", key="null"))["found"] is True
    await call(hass, "delete", store="one", key="absent")
    await call(hass, "delete", store="one", key="null")
    assert (await call(hass, "get", store="one"))["values"] == {}


async def test_concurrency_isolation_and_response_copy(hass):
    await add_store(hass, "one")
    await add_store(hass, "two")
    await asyncio.gather(*(call(hass, "set", store="one", key=f"k{i}", value=i) for i in range(20)))
    assert len((await call(hass, "get", store="one"))["values"]) == 20
    assert (await call(hass, "get", store="two"))["values"] == {}
    await call(hass, "set", store="two", key="nested", value={"items": [1]})
    response = await call(hass, "get", store="two")
    response["values"]["nested"]["items"].append(2)
    assert (await call(hass, "get", store="two", key="nested"))["value"] == {"items": [1]}


async def test_errors_leave_state_intact(hass):
    await add_store(hass, "one")
    with pytest.raises(ServiceValidationError):
        await call(hass, "set", store="missing", key="k", value=1)
    with pytest.raises(vol.Invalid):
        await call(hass, "set", store="one", key="friendly_name", value=1)
    with pytest.raises(ServiceValidationError):
        await call(hass, "set", store="one", key="k", value="x" * 17000)
    import sqlite3

    database = hass.data["kv_storage"]["database"]
    with (
        patch.object(database, "set", side_effect=sqlite3.OperationalError("disk full")),
        pytest.raises(HomeAssistantError),
    ):
        await call(hass, "set", store="one", key="k", value=1)
    assert (await call(hass, "get", store="one"))["values"] == {}


async def test_unloaded_store_rejected(hass):
    entry = await add_store(hass, "one")
    with patch.object(
        hass.config_entries, "async_unload_platforms", new=AsyncMock(return_value=True)
    ):
        await async_unload_entry(hass, entry)
    with pytest.raises(ServiceValidationError):
        await call(hass, "get", store="one")


@pytest.mark.parametrize("name", ["Uppercase", "bad-name", "1store", "a" * 65, ""])
async def test_config_flow_rejects_invalid_names(hass, name):
    from custom_components.kv_storage.config_flow import KVStorageConfigFlow

    flow = KVStorageConfigFlow()
    flow.hass = hass
    result = await flow.async_step_user({"name": name})
    assert result["errors"] == {"name": "invalid_name"}


async def test_config_flow_creates_store(hass):
    from custom_components.kv_storage.config_flow import KVStorageConfigFlow

    flow = KVStorageConfigFlow()
    flow.hass = hass
    flow.handler = "kv_storage"
    flow.context = {"source": "user"}
    result = await flow.async_step_user({"name": " my_store1 "})
    assert result["type"] == "create_entry"
    assert result["data"] == {"name": "my_store1"}
    assert result["title"] == "my_store1"
