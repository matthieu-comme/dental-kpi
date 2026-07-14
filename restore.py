#!/usr/bin/env python3
"""
Restauration de la base de données Dental KPI depuis une sauvegarde.

Usage :
    python restore.py                              # menu interactif
    python restore.py backup_20260714_143000.db   # restauration directe

ATTENTION : arrêtez le serveur avant de restaurer.
"""
import sys
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "backend" / "database.db"
BACKUP_DIR = ROOT / "backups"


def list_backups() -> list[Path]:
    if not BACKUP_DIR.exists():
        return []
    return sorted(BACKUP_DIR.glob("backup_*.db"), reverse=True)


def restore(backup_path: Path):
    if not backup_path.exists():
        print(f"[ERREUR] Fichier introuvable : {backup_path}")
        sys.exit(1)

    # Sécurité : copie de l'état actuel avant restauration
    if DB_PATH.exists():
        safety = DB_PATH.parent / f"database_avant_restauration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        shutil.copy2(DB_PATH, safety)
        print(f"[OK] Base actuelle sauvegardée dans : {safety.name}")

    with sqlite3.connect(str(backup_path)) as src, sqlite3.connect(str(DB_PATH)) as dst:
        src.backup(dst)

    print(f"[OK] Base restaurée depuis : {backup_path.name}")


if __name__ == "__main__":
    backups = list_backups()

    if not backups:
        print("[ERREUR] Aucune sauvegarde trouvée dans ./backups/")
        sys.exit(1)

    if len(sys.argv) > 1:
        target = BACKUP_DIR / sys.argv[1]
    else:
        print("Sauvegardes disponibles :\n")
        for i, b in enumerate(backups):
            size = b.stat().st_size // 1024
            print(f"  [{i}] {b.name}  ({size} Ko)")
        print()
        choice = input("Numéro de la sauvegarde à restaurer [0 = la plus récente] : ").strip()
        idx = int(choice) if choice.isdigit() else 0
        target = backups[idx]

    print(f"\nRestauration depuis : {target.name}")
    confirm = input("Cette opération écrase la base actuelle. Continuer ? [o/N] : ").strip().lower()
    if confirm == "o":
        restore(target)
    else:
        print("[ANNULÉ]")
