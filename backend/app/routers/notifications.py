from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from app import models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import StatutDevis, StatutCheque

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "secretaire":
        raise HTTPException(status_code=403, detail="Réservé à la secrétaire")

    today = date.today()

    praticiens = {p.id_praticien: p.nom for p in db.query(models.Praticien).all()}

    # Devis EN_ATTENTE dépassant le délai de relance propre à chaque praticien
    pairs = (
        db.query(models.Devis, models.ParametresPraticien)
        .join(
            models.ParametresPraticien,
            models.Devis.id_praticien == models.ParametresPraticien.id_praticien,
        )
        .filter(models.Devis.statut == StatutDevis.EN_ATTENTE)
        .all()
    )
    devis_relance = [
        {
            "id_devis": d.id_devis,
            "id_patient": d.id_patient,
            "montant": d.montant,
            "date_emission": d.date_emission,
            "jours_attente": (today - d.date_emission).days,
            "praticien": praticiens.get(d.id_praticien, "—"),
            "delai_relance_jours": p.delai_relance_jours,
        }
        for d, p in pairs
        if d.date_emission <= today - timedelta(days=p.delai_relance_jours)
    ]

    # Chèques EN_ATTENTE dont la date de dépôt prévue est atteinte ou dépassée
    cheques = (
        db.query(models.Cheque)
        .filter(
            models.Cheque.statut == StatutCheque.EN_ATTENTE,
            models.Cheque.date_depot_prevue.is_not(None),
            models.Cheque.date_depot_prevue <= today,
        )
        .all()
    )
    cheques_depot = [
        {
            "id_cheque": c.id_cheque,
            "id_patient": c.id_patient,
            "montant": c.montant,
            "date_depot_prevue": c.date_depot_prevue,
            "jours_retard": (today - c.date_depot_prevue).days,
            "praticien": praticiens.get(c.id_praticien, "—"),
        }
        for c in cheques
        if c.date_depot_prevue is not None
    ]

    return {
        "total": len(devis_relance) + len(cheques_depot),
        "devis_relance": sorted(devis_relance, key=lambda x: x["jours_attente"], reverse=True),
        "cheques_depot": sorted(cheques_depot, key=lambda x: x["jours_retard"], reverse=True),
    }
