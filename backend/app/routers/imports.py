import csv
import io
import re
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from pydantic import ValidationError
from app import schemas, crud
from app.database import get_db
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/imports", tags=["Imports CSV"])

DEVIS_COLONNES = "id_patient,montant,temps_previsionnel_minutes,date_emission,statut,date_decision,motif_refus"
CHEQUE_COLONNES = "id_patient,montant,date_reception,date_depot_prevue,statut"

# Mapping labels français (export) → noms techniques (import)
_DEVIS_LABELS: dict[str, str] = {
    "N° devis": "id_devis",
    "N° praticien": "id_praticien",
    "N° patient": "id_patient",
    "Montant (€)": "montant",
    "Temps prévu (min)": "temps_previsionnel_minutes",
    "Date émission": "date_emission",
    "Date décision": "date_decision",
    "Statut": "statut",
    "Motif refus": "motif_refus",
}

_CHEQUE_LABELS: dict[str, str] = {
    "N° chèque": "id_cheque",
    "N° praticien": "id_praticien",
    "N° patient": "id_patient",
    "Montant (€)": "montant",
    "Date réception": "date_reception",
    "Date dépôt prévue": "date_depot_prevue",
    "Statut": "statut",
}


_STATUT_DEVIS_ALIASES: dict[str, str] = {
    "ok": "ACCEPTE",
    "accepte": "ACCEPTE",
    "accepté": "ACCEPTE",
    "oui": "ACCEPTE",
    "refus": "REFUSE",
    "refusé": "REFUSE",
    "refuse": "REFUSE",
    "non": "REFUSE",
    "rappeler": "EN_ATTENTE",
    "rappel": "EN_ATTENTE",
    "attente": "EN_ATTENTE",
    "en_attente": "EN_ATTENTE",
    "en attente": "EN_ATTENTE",
}

_STATUT_CHEQUE_ALIASES: dict[str, str] = {
    "ok": "DEPOSE",
    "déposé": "DEPOSE",
    "depose": "DEPOSE",
    "deposé": "DEPOSE",
    "attente": "EN_ATTENTE",
    "en_attente": "EN_ATTENTE",
    "en attente": "EN_ATTENTE",
}


def _norm_montant(s: str) -> str:
    """'10 366,04 €' → '10366.04' ; '1500.00' inchangé."""
    s = re.sub(r"[€$£\s ]", "", s.strip())  # strip currency + (non-breaking) spaces
    if "," in s:
        # Virgule = séparateur décimal (format FR) ; points éventuels = milliers
        s = s.replace(".", "").replace(",", ".")
    return s


def _norm_date(s: str) -> str:
    """Normalise DD/MM/YY, DD/MM/YYYY, YYYY/MM/DD → YYYY-MM-DD. Laisse inchangé si déjà ISO."""
    s = s.strip()
    if not s:
        return s
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    if re.match(r"^\d{4}/\d{2}/\d{2}$", s):
        return s.replace("/", "-")
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{mo}-{d}"
    m = re.match(r"^(\d{2})/(\d{2})/(\d{2})$", s)
    if m:
        d, mo, y = m.groups()
        return f"20{y}-{mo}-{d}"
    return s  # format non reconnu → Pydantic renverra une erreur lisible


def _norm_statut(s: str, aliases: dict[str, str]) -> str:
    return aliases.get(s.strip().lower(), s.strip().upper() or "EN_ATTENTE")


def _maybe_date(raw: str | None) -> str | None:
    if not raw:
        return None
    normed = _norm_date(raw)
    return normed or None


def _normalize(rows: list[dict], label_map: dict[str, str]) -> list[dict]:
    """Renomme les clés françaises en noms techniques ; laisse les noms déjà techniques intacts."""
    return [{label_map.get(k, k): v for k, v in row.items()} for row in rows]


def _opt(row: dict, key: str) -> str | None:
    v = row.get(key, "").strip()
    return v if v else None


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    lines = text.splitlines()

    # Cherche la vraie ligne d'en-têtes (ignore les lignes titre type "DEVIS,,,,")
    header_idx = 0
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(k in lower for k in ("id_patient", "montant", "n° patient", "date_")):
            header_idx = i
            break

    csv_text = "\n".join(lines[header_idx:])
    sample = csv_text[:1024]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.DictReader(io.StringIO(csv_text), dialect=dialect))
    # Filtre les lignes entièrement vides
    return [r for r in rows if any(v.strip() for v in r.values())]


def _fmt_errors(e: ValidationError) -> str:
    return ", ".join(
        f"{err['loc'][-1] if err['loc'] else 'valeur'}: {err['msg']}"
        for err in e.errors()
    )


def _row_summary(row: dict) -> str:
    """Résumé lisible d'une ligne CSV pour affichage dans les erreurs d'import."""
    return " | ".join(f"{k}: {v}" for k, v in row.items() if v and v.strip())


def _check_auth(current_user: dict, id_praticien: int):
    if current_user["role"] == "praticien" and int(current_user["id"]) != id_praticien:
        raise HTTPException(status_code=403, detail="Accès refusé")


@router.post("/devis")
async def import_devis(
    id_praticien: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _check_auth(current_user, id_praticien)

    rows = _normalize(_parse_csv(await file.read()), _DEVIS_LABELS)
    valides: list[schemas.DevisCreate] = []
    erreurs: list[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            temps_raw = row.get("temps_previsionnel_minutes", "").strip()
            valides.append(
                schemas.DevisCreate.model_validate(
                    {
                        "id_praticien": id_praticien,
                        "id_patient": row.get("id_patient", "").strip(),
                        "montant": _norm_montant(row.get("montant", "")),
                        "temps_previsionnel_minutes": temps_raw if temps_raw else "1",
                        "date_emission": _norm_date(row.get("date_emission", "")),
                        "statut": _norm_statut(row.get("statut", "EN_ATTENTE"), _STATUT_DEVIS_ALIASES),
                        "date_decision": _maybe_date(_opt(row, "date_decision")),
                        "motif_refus": _opt(row, "motif_refus"),
                    }
                )
            )
        except ValidationError as e:
            erreurs.append({"ligne": i, "errors": e.errors(), "contenu": _row_summary(row), "row": dict(row)})
        except Exception as e:
            erreurs.append({"ligne": i, "message": str(e), "contenu": _row_summary(row), "row": dict(row)})

    importes = 0
    for schema in valides:
        try:
            crud.create_devis(db, schema)
            importes += 1
        except Exception as e:
            erreurs.append({"ligne": "?", "message": str(e)})

    return {"total": len(rows), "importes": importes, "erreurs": erreurs}


@router.post("/cheques")
async def import_cheques(
    id_praticien: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _check_auth(current_user, id_praticien)

    rows = _normalize(_parse_csv(await file.read()), _CHEQUE_LABELS)
    valides: list[schemas.ChequeCreate] = []
    erreurs: list[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            valides.append(
                schemas.ChequeCreate.model_validate(
                    {
                        "id_praticien": id_praticien,
                        "id_patient": row.get("id_patient", "").strip(),
                        "montant": _norm_montant(row.get("montant", "")),
                        "date_reception": _norm_date(row.get("date_reception", "")),
                        "date_depot_prevue": _maybe_date(_opt(row, "date_depot_prevue")),
                        "statut": _norm_statut(row.get("statut", "EN_ATTENTE"), _STATUT_CHEQUE_ALIASES),
                    }
                )
            )
        except ValidationError as e:
            erreurs.append({"ligne": i, "errors": e.errors(), "contenu": _row_summary(row), "row": dict(row)})
        except Exception as e:
            erreurs.append({"ligne": i, "message": str(e), "contenu": _row_summary(row), "row": dict(row)})

    importes = 0
    for schema in valides:
        try:
            crud.create_cheque(db, schema)
            importes += 1
        except Exception as e:
            erreurs.append({"ligne": "?", "message": str(e)})

    return {"total": len(rows), "importes": importes, "erreurs": erreurs}


@router.get("/template/devis")
def template_devis():
    from fastapi.responses import Response

    return Response(
        content=DEVIS_COLONNES
        + "\n1234,1500.00,60,2024-01-15,EN_ATTENTE,,\n5678,3000.00,120,2024-01-16,ACCEPTE,2024-01-20,\n",
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_devis.csv"},
    )


@router.get("/template/cheques")
def template_cheques():
    from fastapi.responses import Response

    return Response(
        content=CHEQUE_COLONNES
        + "\n1234,250.00,2024-01-15,2024-02-01,EN_ATTENTE\n5678,500.00,2024-01-16,,EN_ATTENTE\n",
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_cheques.csv"},
    )
