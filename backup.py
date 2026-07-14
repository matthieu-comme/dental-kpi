#!/usr/bin/env python3
"""
Sauvegarde automatique de la base de données Dental KPI.

Usage :
    python backup.py               # depuis la racine du projet
    python backup.py --list        # lister les sauvegardes existantes

Planifier via Windows Task Scheduler pour une exécution quotidienne.
"""
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "backend" / "database.db"
BACKUP_DIR = ROOT / "backups"
MAX_BACKUPS = 30


def create_backup() -> Path:
    if not DB_PATH.exists():
        print(f"[ERREUR] Base de données introuvable : {DB_PATH}")
        sys.exit(1)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dest = BACKUP_DIR / f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.db"

    with sqlite3.connect(str(DB_PATH)) as src, sqlite3.connect(str(dest)) as dst:
        src.backup(dst)

    print(f"[OK] Sauvegarde créée : {dest.name}  ({dest.stat().st_size // 1024} Ko)")
    return dest


def rotate_backups():
    files = sorted(BACKUP_DIR.glob("backup_*.db"))
    while len(files) > MAX_BACKUPS:
        oldest = files.pop(0)
        oldest.unlink()
        print(f"[OK] Ancienne sauvegarde supprimée : {oldest.name}")


def list_backups():
    if not BACKUP_DIR.exists() or not list(BACKUP_DIR.glob("backup_*.db")):
        print("Aucune sauvegarde trouvée.")
        return
    files = sorted(BACKUP_DIR.glob("backup_*.db"), reverse=True)
    print(f"{'Nom':<35} {'Taille':>8}")
    print("-" * 45)
    for f in files:
        print(f"{f.name:<35} {f.stat().st_size // 1024:>6} Ko")


if __name__ == "__main__":
    if "--list" in sys.argv:
        list_backups()
    else:
        create_backup()
        rotate_backups()
