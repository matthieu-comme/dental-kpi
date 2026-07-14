"""
Tests pour les endpoints de sauvegarde (/api/v1/admin/backup*).

Stratégie :
- DB_PATH est monkeypatché vers un vrai fichier SQLite temporaire
  (les endpoints utilisent sqlite3 directement, pas SQLAlchemy).
- BACKUP_DIR est monkeypatché vers un répertoire temporaire pytest.
"""
import sqlite3
import pytest
from pathlib import Path

import app.routers.backup as backup_module
from tests.conftest import client


# ── Helpers ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def real_db(tmp_path):
    """Crée un vrai fichier SQLite minimal pour que _do_backup() fonctionne."""
    db_file = tmp_path / "database.db"
    with sqlite3.connect(str(db_file)) as conn:
        conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)")
        conn.execute("INSERT INTO test VALUES (1, 'hello')")
        conn.commit()
    return db_file


@pytest.fixture()
def patched_paths(tmp_path, real_db, monkeypatch):
    """Monkeypatche DB_PATH et BACKUP_DIR dans le module backup."""
    backup_dir = tmp_path / "backups"
    monkeypatch.setattr(backup_module, "DB_PATH", real_db)
    monkeypatch.setattr(backup_module, "BACKUP_DIR", backup_dir)
    return {"db": real_db, "backups": backup_dir}


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_list_backups_requires_auth():
    res = client.get("/api/v1/admin/backups")
    assert res.status_code == 401


def test_create_backup_requires_auth():
    res = client.post("/api/v1/admin/backup")
    assert res.status_code == 401


def test_download_backup_requires_auth():
    res = client.get("/api/v1/admin/backup/download")
    assert res.status_code == 401


def test_create_backup_forbidden_for_praticien(prat_headers, patched_paths):
    res = client.post("/api/v1/admin/backup", headers=prat_headers)
    assert res.status_code == 403


def test_list_backups_forbidden_for_praticien(prat_headers, patched_paths):
    res = client.get("/api/v1/admin/backups", headers=prat_headers)
    assert res.status_code == 403


def test_download_forbidden_for_praticien(prat_headers, patched_paths):
    res = client.get("/api/v1/admin/backup/download", headers=prat_headers)
    assert res.status_code == 403


# ── Fonctionnalité ───────────────────────────────────────────────────────────

def test_list_backups_empty(sec_headers, patched_paths):
    res = client.get("/api/v1/admin/backups", headers=sec_headers)
    assert res.status_code == 200
    assert res.json() == {"backups": []}


def test_create_backup_success(sec_headers, patched_paths):
    res = client.post("/api/v1/admin/backup", headers=sec_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["name"].startswith("backup_")
    assert data["name"].endswith(".db")
    assert data["size_kb"] > 0
    assert data["created_at"] != ""
    assert data["removed"] == []

    # Le fichier existe réellement
    backup_file = patched_paths["backups"] / data["name"]
    assert backup_file.exists()


def test_list_backups_after_create(sec_headers, patched_paths):
    client.post("/api/v1/admin/backup", headers=sec_headers)
    client.post("/api/v1/admin/backup", headers=sec_headers)

    res = client.get("/api/v1/admin/backups", headers=sec_headers)
    assert res.status_code == 200
    backups = res.json()["backups"]
    assert len(backups) == 2
    # Ordre décroissant (plus récent en premier)
    assert backups[0]["name"] >= backups[1]["name"]
    for b in backups:
        assert b["size_kb"] > 0
        assert b["created_at"] != ""


def test_backup_is_valid_sqlite(sec_headers, patched_paths):
    """Le fichier de sauvegarde doit être un SQLite lisible avec les mêmes données."""
    client.post("/api/v1/admin/backup", headers=sec_headers)
    files = list(patched_paths["backups"].glob("backup_*.db"))
    assert len(files) == 1

    with sqlite3.connect(str(files[0])) as conn:
        rows = conn.execute("SELECT val FROM test WHERE id=1").fetchall()
    assert rows == [("hello",)]


def test_download_backup(sec_headers, patched_paths):
    res = client.get("/api/v1/admin/backup/download", headers=sec_headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/octet-stream"
    assert "backup_" in res.headers.get("content-disposition", "")
    # Le contenu est un fichier SQLite (magic bytes)
    assert res.content[:16] == b"SQLite format 3\x00"


def test_rotation_removes_oldest(sec_headers, patched_paths, monkeypatch):
    """Après MAX_BACKUPS+1 sauvegardes, la plus ancienne doit être supprimée."""
    monkeypatch.setattr(backup_module, "MAX_BACKUPS", 3)

    for _ in range(3):
        client.post("/api/v1/admin/backup", headers=sec_headers)

    # La 4e doit déclencher la rotation
    res = client.post("/api/v1/admin/backup", headers=sec_headers)
    assert res.status_code == 201
    assert len(res.json()["removed"]) == 1

    remaining = list(patched_paths["backups"].glob("backup_*.db"))
    assert len(remaining) == 3


def test_create_backup_db_missing(sec_headers, monkeypatch):
    monkeypatch.setattr(backup_module, "DB_PATH", Path("/nonexistent/database.db"))
    res = client.post("/api/v1/admin/backup", headers=sec_headers)
    assert res.status_code == 500
    assert "introuvable" in res.json()["detail"]


def test_download_backup_db_missing(sec_headers, monkeypatch):
    monkeypatch.setattr(backup_module, "DB_PATH", Path("/nonexistent/database.db"))
    res = client.get("/api/v1/admin/backup/download", headers=sec_headers)
    assert res.status_code == 500
