import csv
import io
import re
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError
from app import schemas, crud
from app.database import get_db
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/imports", tags=["Imports CSV"])

DEVIS_COLONNES = "id_patient,montant,temps_previsionnel_minutes,date_emission,statut,date_decision,motif_refus"
CHEQUE_COLONNES = "id_patient,montant,date_reception,date_depot_prevue,statut"
JOURNEE_COLONNES = "date_jour,nb_patients_vus,nb_nouveaux_patients,nb_rdv_manques_connus,nb_rdv_manques_nouveaux,temps_presence_minutes,temps_perdu_minutes"

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

_JOURNEE_LABELS: dict[str, str] = {
    "N° journée": "id_journee",           # ignoré à l'import
    "Praticien": "id_praticien",           # ignoré à l'import
    "Date": "date_jour",
    "Patients vus": "nb_patients_vus",
    "Nouveaux patients": "nb_nouveaux_patients",
    "RDV manqués connus": "nb_rdv_manques_connus",
    "RDV manqués nouveaux": "nb_rdv_manques_nouveaux",
    "Présence (min)": "temps_presence_minutes",
    "Temps perdu (min)": "temps_perdu_minutes",
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


_REQUIRED_COLS: dict[str, list[str]] = {
    "devis":    ["id_patient", "montant", "date_emission"],
    "cheques":  ["id_patient", "montant", "date_reception"],
    "journees": ["date_jour", "temps_presence_minutes"],
}


def _check_headers(rows: list[dict], resource: str) -> None:
    """Lève 400 si les colonnes clés du type attendu sont absentes du fichier."""
    if not rows:
        return
    actual = set(rows[0].keys())
    missing = [c for c in _REQUIRED_COLS.get(resource, []) if c not in actual]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Le fichier ne correspond pas au format « {resource} ». "
                f"Colonnes requises introuvables : {', '.join(missing)}. "
                f"En-têtes détectés : {', '.join(sorted(actual))}."
            ),
        )


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
    _check_headers(rows, "devis")
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
    _check_headers(rows, "cheques")
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


@router.post("/journees")
async def import_journees(
    id_praticien: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _check_auth(current_user, id_praticien)

    rows = _normalize(_parse_csv(await file.read()), _JOURNEE_LABELS)
    _check_headers(rows, "journees")
    valides: list[schemas.JourneeCreate] = []
    erreurs: list[dict] = []

    for i, row in enumerate(rows, start=2):
        def _int(key: str, default: str = "0") -> str:
            v = row.get(key, "").strip()
            return v if v else default

        try:
            valides.append(
                schemas.JourneeCreate.model_validate(
                    {
                        "id_praticien": id_praticien,
                        "date_jour": _norm_date(row.get("date_jour", "")),
                        "nb_patients_vus": _int("nb_patients_vus"),
                        "nb_nouveaux_patients": _int("nb_nouveaux_patients"),
                        "nb_rdv_manques_connus": _int("nb_rdv_manques_connus"),
                        "nb_rdv_manques_nouveaux": _int("nb_rdv_manques_nouveaux"),
                        "temps_presence_minutes": _int("temps_presence_minutes"),
                        "temps_perdu_minutes": _int("temps_perdu_minutes"),
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
            crud.create_journee(db, schema)
            importes += 1
        except IntegrityError:
            db.rollback()
            erreurs.append({
                "ligne": "?",
                "message": f"Une journée existe déjà pour ce praticien au {schema.date_jour}.",
            })
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


@router.get("/template/journees")
def template_journees():
    from fastapi.responses import Response

    return Response(
        content=JOURNEE_COLONNES
        + "\n2024-01-15,8,2,1,0,480,30\n2024-01-16,10,3,0,1,450,0\n",
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_journees.csv"},
    )
