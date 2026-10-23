# KV Storage for Home Assistant

A custom integration providing independent, persistent named key-value stores. Each store is a sensor: its state is the number of keys, and its attributes contain the stored values. The **KV Storage** sidebar shows a live table with add, edit and delete controls. No frontend build or external JavaScript dependencies are needed.

## Installation

1. Copy `custom_components/kv_storage` into your Home Assistant configuration directory's `custom_components` folder.
2. Restart Home Assistant.
3. Open **Settings → Devices & services → Add integration → KV Storage**.
4. Enter a store name, for example `my_store1`. Repeat to create more stores.
5. Open **KV Storage** in the sidebar. If it has not appeared, refresh the browser.

Requires Home Assistant 2024.12 or newer. Store names use 1–64 lowercase letters, digits and underscores, beginning with a letter. The default entity ID is `sensor.my_store1`; Home Assistant may append a suffix if that ID is already in use. Renaming the entity does not change the store name used by services. Keep the sensor enabled for the sidebar to discover it.

## Services / actions

The service domain is **`kv_storage`**. Use the configured store name, not the sensor entity ID.

```yaml
# Save a string. Quoting preserves leading zeroes.
action: kv_storage.set
data:
  store: my_store1
  key: door_code
  value: "0012"
```

```yaml
action: kv_storage.set
data:
  store: my_store1
  key: preferences
  value:
    enabled: true
    rooms: [kitchen, hallway]
```

```yaml
# In an automation or script sequence:
- action: kv_storage.get
  data:
    store: my_store1
    key: door_code
  response_variable: saved_code
- action: persistent_notification.create
  data:
    message: "Found: {{ saved_code.found }}, value: {{ saved_code.value }}"
```

`get` returns `{store, key, found, value}`. Missing keys return `found: false` and `value: null`, distinguishing them from a stored JSON null. Omit `key` to get `{store, values}` with all key-value pairs. Calls must request response data; scripts use `response_variable`.

```yaml
action: kv_storage.delete
data:
  store: my_store1
  key: door_code
```

Deleting an absent key succeeds without changes. Unknown or unloaded stores report an error. Services appear in **Developer tools → Actions** with field descriptions.

Read values directly in templates:

```jinja2
{{ state_attr('sensor.my_store1', 'door_code') }}
{{ state_attr('sensor.my_store1', 'preferences') }}
```

## Persistence and limits

Data is committed to `<config>/.storage/kv_storage.sqlite3` before the sensor is updated or a write action completes. SQLite work runs outside Home Assistant's event loop. Concurrent mutations within a store are serialized; stores have separate namespaces. Every operation closes its connection. Both `custom_components/kv_storage/` and `.storage/kv_storage.sqlite3` live inside the Home Assistant configuration directory, so backups that include the Home Assistant configuration normally include them automatically. No separate backup selection is needed for this integration. A partial backup that omits Home Assistant configuration will not include them. This refers to files installed in Home Assistant, not this development checkout. For manual copies of the SQLite file, stop Home Assistant first or use SQLite's backup API for a consistent live copy. See the [Home Assistant backup documentation](https://www.home-assistant.io/common-tasks/general/backups/).

Unloading or removing an integration entry **retains its data**. Add the same store name again to recover it. Delete individual keys through the UI or service when you want to remove data permanently. There is no automatic expiry.

Values support JSON strings, numbers, booleans, null, arrays and objects with string keys. Individual values are limited to 16 KiB of encoded JSON and a store to 48,000 bytes to keep sensor state attributes manageable. Keys are nonblank strings up to 255 characters. These metadata keys are reserved: `friendly_name`, `icon`, `unit_of_measurement`, `device_class`, `state_class`, `supported_features`, `attribution`, `entity_picture`, `assumed_state`, `last_reset`, `restored`, `kv_storage_store`.

This is not encrypted secret storage. Values are visible in entity attributes to Home Assistant users, and may be recorded in history and backups. To avoid duplicating values in recorder history, optionally merge this into your existing recorder configuration:

```yaml
recorder:
  exclude:
    entities:
      - sensor.my_store1
```

## Development

```sh
uv venv --python 3.12
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python -m pytest
.venv/bin/ruff check .
```

The integration uses Home Assistant's [service response API](https://developers.home-assistant.io/docs/dev_101_services/) and [custom sidebar panels](https://developers.home-assistant.io/docs/frontend/custom-ui/creating-custom-panels/).
