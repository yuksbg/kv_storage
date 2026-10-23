"""Transactional SQLite persistence. All methods run in HA's executor."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path

from .const import MAX_STORE_BYTES, MAX_VALUE_BYTES, RESERVED_KEYS


def encode_value(value):
    """Accept JSON values only, preserving their types."""

    def validate(item):
        if item is None or type(item) in (str, bool, int, float):
            return
        if type(item) is list:
            for child in item:
                validate(child)
            return
        if type(item) is dict and all(isinstance(key, str) for key in item):
            for child in item.values():
                validate(child)
            return
        raise ValueError("Value must contain only JSON types and string object keys")

    validate(value)
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
    if len(encoded.encode("utf-8")) > MAX_VALUE_BYTES:
        raise ValueError(f"Value exceeds {MAX_VALUE_BYTES} bytes")
    return encoded


def validate_key(key):
    """Protect HA metadata and keep attribute names manageable."""
    if not isinstance(key, str) or not key.strip() or len(key) > 255:
        raise ValueError("Key must be a non-empty string of at most 255 characters")
    if key in RESERVED_KEYS:
        raise ValueError(f"Key '{key}' is reserved for Home Assistant metadata")
    return key


class Database:
    """One database shared by independent named stores."""

    def __init__(self, path):
        self.path = Path(path)

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS kv_values (
                store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
                PRIMARY KEY (store, key))""")

    def load(self, store):
        with closing(sqlite3.connect(self.path)) as connection:
            return self._load(connection, store)

    @staticmethod
    def _load(connection, store):
        return {
            key: json.loads(value)
            for key, value in connection.execute(
                "SELECT key, value FROM kv_values WHERE store = ? ORDER BY key", (store,)
            )
        }

    def set(self, store, key, value):
        validate_key(key)
        encoded = encode_value(value)
        with closing(sqlite3.connect(self.path, timeout=30)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            values = self._load(connection, store)
            values[key] = json.loads(encoded)
            if len(json.dumps(values, ensure_ascii=False).encode("utf-8")) > MAX_STORE_BYTES:
                raise ValueError(f"Store exceeds {MAX_STORE_BYTES} bytes; use another store")
            connection.execute(
                "INSERT INTO kv_values VALUES (?, ?, ?) "
                "ON CONFLICT(store, key) DO UPDATE SET value = excluded.value",
                (store, key, encoded),
            )
        return values

    def delete(self, store, key):
        validate_key(key)
        with closing(sqlite3.connect(self.path, timeout=30)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM kv_values WHERE store = ? AND key = ?", (store, key))
            values = self._load(connection, store)
        return values
