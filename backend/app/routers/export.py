import csv
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app import models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/export", tags=["Export"])

RESOURCE_CONFIG: dict = {
    "devis": {
        "model": models.Devis,
        "praticien_col": "id_praticien",
        "columns": {
            "id_devis": "N° devis",
            "id_praticien": "N° praticien",
            "id_patient": "N° patient",
            "montant": "Montant (€)",
            "temps_previsionnel_minutes": "Temps prévu (min)",
            "date_emission": "Date émission",
            "date_decision": "Date décision",
            "statut": "Statut",
            "motif_refus": "Motif refus",
        },
    },
    "cheques": {
        "model": models.Cheque,
        "praticien_col": "id_praticien",
        "columns": {
            "id_cheque": "N° chèque",
            "id_praticien": "N° praticien",
            "id_patient": "N° patient",
            "montant": "Montant (€)",
            "date_reception": "Date réception",
            "date_depot_prevue": "Date dépôt prévue",
            "statut": "Statut",
        },
    },
    "journees": {
        "model": models.Journee,
        "praticien_col": "id_praticien",
        "columns": {
            "id_journee": "N° journée",
            "id_praticien": "N° praticien",
            "date_jour": "Date",
            "nb_patients_vus": "Patients vus",
            "nb_nouveaux_patients": "Nouveaux patients",
            "nb_rdv_manques_connus": "RDV manqués connus",
            "nb_rdv_manques_nouveaux": "RDV manqués nouveaux",
            "temps_presence_minutes": "Présence (min)",
            "temps_perdu_minutes": "Temps perdu (min)",
        },
    },
    "charges": {
        "model": models.Charge,
        "praticien_col": "id_praticien",
        "columns": {
            "id_charge": "N° charge",
            "id_praticien": "N° praticien",
            "designation": "Désignation",
            "montant": "Montant (€)",
            "periodicite": "Périodicité",
            "date_debut": "Date début",
            "date_fin": "Date fin",
            "lissage_mensuel": "Lissage mensuel",
        },
    },
}


def _serialize(val) -> str:
    if val is None:
        return ""
    if isinstance(val, bool):
        return "Oui" if val else "Non"
    if hasattr(val, "value"):
        return val.value
    return str(val)


@router.get("/csv")
def export_csv(
    resource: str,
    columns: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if resource not in RESOURCE_CONFIG:
        raise HTTPException(status_code=400, detail=f"Type inconnu : {resource!r}")

    config = RESOURCE_CONFIG[resource]
    model_cls = config["model"]
    allowed = config["columns"]

    col_list = [c.strip() for c in columns.split(",") if c.strip()]
    invalid = [c for c in col_list if c not in allowed]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Colonnes inconnues : {', '.join(invalid)}",
        )
    if not col_list:
        raise HTTPException(status_code=400, detail="Aucune colonne sélectionnée.")

    query = db.query(model_cls)
    if current_user["role"] == RoleUser.PRATICIEN:
        query = query.filter(
            getattr(model_cls, config["praticien_col"]) == int(current_user["id"])
        )

    rows = query.all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([allowed[c] for c in col_list])
    for row in rows:
        writer.writerow([_serialize(getattr(row, col, None)) for col in col_list])

    # utf-8-sig adds BOM so Excel opens the file correctly
    content = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{resource}_export.csv",
        },
    )
