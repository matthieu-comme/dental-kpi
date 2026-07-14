import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.models import RoleUser
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/admin", tags=["Sauvegarde"])

# DB_PATH relatif au CWD du serveur (backend/) ; BACKUP_DIR à la racine du projet
DB_PATH = Path("database.db")
BACKUP_DIR = Path(__file__).resolve().parent.parent.parent.parent / "backups"
MAX_BACKUPS = 30


def _require_secretary(current_user: dict):
    if current_user.get("role") != RoleUser.SECRETAIRE:
        raise HTTPException(status_code=403, detail="Réservé à la secrétaire.")


def _do_backup() -> Path:
    """Copie atomique via l'API SQLite online backup (safe pendant l'écriture)."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dest = BACKUP_DIR / f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.db"
    # Note : sqlite3.connect() as context manager gère les transactions mais
    # ne ferme pas la connexion — on ferme explicitement pour libérer le verrou Windows.
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(dest))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return dest


def _rotate() -> list[str]:
    """Supprime les sauvegardes au-delà de MAX_BACKUPS (les plus anciennes en premier)."""
    files = sorted(BACKUP_DIR.glob("backup_*.db"))
    removed = []
    while len(files) > MAX_BACKUPS:
        f = files.pop(0)
        f.unlink()
        removed.append(f.name)
    return removed


def _parse_ts(stem: str) -> str:
    """Convertit 'backup_20260714_143000[_ffffff]' en ISO datetime string."""
    raw = stem[len("backup_"):]
    for fmt in ("%Y%m%d_%H%M%S_%f", "%Y%m%d_%H%M%S"):
        try:
            return datetime.strptime(raw, fmt).isoformat()
        except ValueError:
            continue
    return ""


@router.get("/backups")
def list_backups(current_user: dict = Depends(get_current_user)):
    """Liste les sauvegardes présentes sur le serveur."""
    _require_secretary(current_user)
    if not BACKUP_DIR.exists():
        return {"backups": []}
    files = sorted(BACKUP_DIR.glob("backup_*.db"), reverse=True)
    return {
        "backups": [
            {
                "name": f.name,
                "size_kb": round(f.stat().st_size / 1024, 1),
                "created_at": _parse_ts(f.stem),
            }
            for f in files
        ]
    }


@router.post("/backup", status_code=201)
def create_backup(current_user: dict = Depends(get_current_user)):
    """Crée une sauvegarde sur le serveur et retourne ses métadonnées."""
    _require_secretary(current_user)
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de données introuvable.")
    dest = _do_backup()
    removed = _rotate()
    return {
        "name": dest.name,
        "size_kb": round(dest.stat().st_size / 1024, 1),
        "created_at": _parse_ts(dest.stem),
        "removed": removed,
    }


@router.get("/backup/download")
def download_backup(current_user: dict = Depends(get_current_user)):
    """Crée une sauvegarde et la renvoie en téléchargement direct."""
    _require_secretary(current_user)
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Base de données introuvable.")
    dest = _do_backup()
    _rotate()
    return FileResponse(
        path=str(dest),
        filename=dest.name,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{dest.name}"'},
    )
