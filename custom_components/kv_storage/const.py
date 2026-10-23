"""Constants for KV Storage."""

DOMAIN = "kv_storage"
PLATFORMS = ["sensor"]
# HA merges these attributes into the entity state; reserving them prevents data loss.
RESERVED_KEYS = frozenset(
    {
        "friendly_name",
        "icon",
        "unit_of_measurement",
        "device_class",
        "state_class",
        "supported_features",
        "attribution",
        "entity_picture",
        "assumed_state",
        "last_reset",
        "restored",
        "kv_storage_store",
    }
)
MAX_VALUE_BYTES = 16384
MAX_STORE_BYTES = 48000
