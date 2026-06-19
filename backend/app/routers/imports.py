import csv
import io
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from pydantic import ValidationError
from app import schemas, crud
from app.database import get_db
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/imports", tags=["Imports CSV"])

DEVIS_COLONNES = "id_patient,montant,temps_previsionnel_minutes,date_emission,statut,date_decision,motif_refus"
CHEQUE_COLONNES = "id_patient,montant,date_reception,date_depot_prevue,statut"


def _opt(row: dict, key: str) -> str | None:
    v = row.get(key, "").strip()
    return v if v else None


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    sample = text[:1024]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except csv.Error:
        dialect = csv.excel
    return list(csv.DictReader(io.StringIO(text), dialect=dialect))


def _fmt_errors(e: ValidationError) -> str:
    return ", ".join(
        f"{err['loc'][-1] if err['loc'] else 'valeur'}: {err['msg']}"
        for err in e.errors()
    )


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

    rows = _parse_csv(await file.read())
    valides: list[schemas.DevisCreate] = []
    erreurs: list[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            valides.append(
                schemas.DevisCreate.model_validate(
                    {
                        "id_praticien": id_praticien,
                        "id_patient": row.get("id_patient", "").strip(),
                        "montant": row.get("montant", "").strip(),
                        "temps_previsionnel_minutes": row.get(
                            "temps_previsionnel_minutes", ""
                        ).strip(),
                        "date_emission": row.get("date_emission", "").strip(),
                        "statut": row.get("statut", "EN_ATTENTE").strip()
                        or "EN_ATTENTE",
                        "date_decision": _opt(row, "date_decision"),
                        "motif_refus": _opt(row, "motif_refus"),
                    }
                )
            )
        except ValidationError as e:
            erreurs.append({"ligne": i, "message": _fmt_errors(e)})
        except Exception as e:
            erreurs.append({"ligne": i, "message": str(e)})

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

    rows = _parse_csv(await file.read())
    valides: list[schemas.ChequeCreate] = []
    erreurs: list[dict] = []

    for i, row in enumerate(rows, start=2):
        try:
            valides.append(
                schemas.ChequeCreate.model_validate(
                    {
                        "id_praticien": id_praticien,
                        "id_patient": row.get("id_patient", "").strip(),
                        "montant": row.get("montant", "").strip(),
                        "date_reception": row.get("date_reception", "").strip(),
                        "date_depot_prevue": _opt(row, "date_depot_prevue"),
                        "statut": row.get("statut", "EN_ATTENTE").strip()
                        or "EN_ATTENTE",
                    }
                )
            )
        except ValidationError as e:
            erreurs.append({"ligne": i, "message": _fmt_errors(e)})
        except Exception as e:
            erreurs.append({"ligne": i, "message": str(e)})

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
