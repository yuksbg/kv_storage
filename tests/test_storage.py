import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

from custom_components.kv_storage.storage import Database


@pytest.fixture
def db(tmp_path):
    database = Database(tmp_path / "storage" / "kv.sqlite3")
    database.initialize()
    return database


@pytest.mark.parametrize(
    "value", ["0012", 42, 1.5, True, None, [1, "x"], {"a": [False, None]}, "🔑"]
)
def test_roundtrip_after_restart(db, value):
    db.set("one", "key", value)
    reopened = Database(db.path)
    reopened.initialize()
    assert reopened.load("one") == {"key": value}


def test_isolation_overwrite_delete(db):
    db.set("one", "key", "first")
    db.set("two", "key", "second")
    db.set("one", "key", "updated")
    assert db.load("one") == {"key": "updated"}
    assert db.delete("one", "key") == {}
    assert db.delete("one", "absent") == {}
    assert db.load("two") == {"key": "second"}


def test_sql_parameters(db):
    key = "x'); DROP TABLE kv_values; --"
    db.set("one", key, "<script>alert(1)</script>")
    assert db.load("one")[key] == "<script>alert(1)</script>"


@pytest.mark.parametrize("key", ["", " ", "a" * 256, "friendly_name", "kv_storage_store"])
def test_invalid_keys(db, key):
    with pytest.raises(ValueError):
        db.set("one", key, 1)
    assert db.load("one") == {}


@pytest.mark.parametrize(
    "value", [float("nan"), float("inf"), {1: "bad"}, {1, 2}, (1, 2), "x" * 16384]
)
def test_invalid_values(db, value):
    db.set("one", "key", "original")
    with pytest.raises(ValueError):
        db.set("one", "key", value)
    assert db.load("one") == {"key": "original"}


def test_store_limit_rolls_back(db):
    for key in ("a", "b", "c"):
        db.set("one", key, "x" * 15000)
    with pytest.raises(ValueError, match="Store exceeds"):
        db.set("one", "d", "x" * 10000)
    assert set(db.load("one")) == {"a", "b", "c"}


def test_concurrent_writes(db):
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: db.set("one", f"key{i}", i), range(40)))
    assert db.load("one") == {f"key{i}": i for i in range(40)}


def test_failed_commit_keeps_original(db):
    db.set("one", "key", 1)
    with sqlite3.connect(db.path) as connection:
        connection.execute("""CREATE TRIGGER reject_update BEFORE UPDATE ON kv_values
            BEGIN SELECT RAISE(ABORT, 'test failure'); END""")
    with pytest.raises(sqlite3.Error):
        db.set("one", "key", 2)
    assert db.load("one") == {"key": 1}
