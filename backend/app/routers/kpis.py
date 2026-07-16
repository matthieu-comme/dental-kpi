from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import date, timedelta
from calendar import monthrange
from app import models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import StatutDevis, PeriodiciteCharge

router = APIRouter(prefix="/api/v1/kpis", tags=["KPIs"])


def _rnd(v, d=2):
    return round(v, d) if v is not None else None


def _compute_monthly_charges(charges: list, mois: int, annee: int) -> float:
    period_start = date(annee, mois, 1)
    period_end = date(annee, mois, monthrange(annee, mois)[1])
    total = 0.0
    for c in charges:
        if c.date_debut > period_end:
            continue
        if c.date_fin and c.date_fin < period_start:
            continue
        if c.periodicite == PeriodiciteCharge.PONCTUEL:
            if c.date_debut.year == annee and c.date_debut.month == mois:
                total += c.montant
        elif c.periodicite == PeriodiciteCharge.MENSUEL:
            total += c.montant
        elif c.periodicite == PeriodiciteCharge.TRIMESTRIEL:
            if c.lissage_mensuel:
                total += c.montant / 3
            else:
                diff = (annee - c.date_debut.year) * 12 + (mois - c.date_debut.month)
                if diff >= 0 and diff % 3 == 0:
                    total += c.montant
        elif c.periodicite == PeriodiciteCharge.ANNUEL:
            if c.lissage_mensuel:
                total += c.montant / 12
            else:
                if mois == c.date_debut.month:
                    total += c.montant
    return total


def _distinct_ym(db, col, id_prat_col, id_prat) -> set[str]:
    """Return distinct 'YYYY-MM' strings for a date column, filtered by praticien."""
    rows = (
        db.query(
            func.extract('year',  col).label('y'),
            func.extract('month', col).label('m'),
        )
        .filter(id_prat_col == id_prat)
        .distinct()
        .all()
    )
    return {f"{int(r.y)}-{int(r.m):02d}" for r in rows}


@router.get("/periodes-disponibles")
def periodes_disponibles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    id_prat = int(current_user["id"])

    months = (
        _distinct_ym(db, models.Journee.date_jour,      models.Journee.id_praticien,      id_prat)
        | _distinct_ym(db, models.Devis.date_emission,   models.Devis.id_praticien,         id_prat)
        | _distinct_ym(db, models.Cheque.date_reception, models.Cheque.id_praticien,        id_prat)
    )

    # PerformanceMensuelle stocke mois/annee en entiers, pas en date
    perfs = (
        db.query(models.PerformanceMensuelle.mois, models.PerformanceMensuelle.annee)
        .filter_by(id_praticien=id_prat)
        .distinct()
        .all()
    )
    months |= {f"{annee}-{mois:02d}" for mois, annee in perfs}

    return {"mois_disponibles": sorted(months)}


@router.get("/mensuel")
def kpis_mensuel(
    mois: int = Query(..., ge=1, le=12),
    annee: int = Query(..., ge=2020),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    id_prat = int(current_user["id"])
    period_start = date(annee, mois, 1)
    period_end = date(annee, mois, monthrange(annee, mois)[1])

    params = db.query(models.ParametresPraticien).filter_by(id_praticien=id_prat).first()
    taux_h_cible = params.taux_horaire_cible if params else None
    ca_cible = params.ca_mensuel_cible if params else None

    perf = db.query(models.PerformanceMensuelle).filter_by(
        id_praticien=id_prat, mois=mois, annee=annee
    ).first()
    ca_declare = perf.ca_declare if perf else None

    journees = db.query(models.Journee).filter(
        models.Journee.id_praticien == id_prat,
        models.Journee.date_jour.between(period_start, period_end),
    ).all()
    t_presence = sum(j.temps_presence_minutes for j in journees)
    t_perdu = sum(j.temps_perdu_minutes for j in journees)
    t_productif = t_presence - t_perdu
    nb_patients = sum(j.nb_patients_vus for j in journees)
    nb_nouveaux = sum(j.nb_nouveaux_patients for j in journees)
    nb_rdv_mq_nv = sum(j.nb_rdv_manques_nouveaux for j in journees)

    devis_emis = db.query(models.Devis).filter(
        models.Devis.id_praticien == id_prat,
        models.Devis.date_emission.between(period_start, period_end),
    ).all()
    nb_devis = len(devis_emis)
    montant_devis = sum(d.montant for d in devis_emis)
    nb_acc = sum(1 for d in devis_emis if d.statut in (StatutDevis.ACCEPTE, StatutDevis.TERMINE))
    m_acc = sum(d.montant for d in devis_emis if d.statut in (StatutDevis.ACCEPTE, StatutDevis.TERMINE))

    charges_all = db.query(models.Charge).filter_by(id_praticien=id_prat).all()
    charges_m = _compute_monthly_charges(charges_all, mois, annee)

    taux_h_reel = (ca_declare / (t_productif / 60)) if (ca_declare and t_productif > 0) else None
    ecart_th = (taux_h_reel - taux_h_cible) if (taux_h_reel is not None and taux_h_cible) else None
    mm_devis = (montant_devis / nb_devis) if nb_devis > 0 else None
    ratio_charges = (charges_m / ca_declare * 100) if (ca_declare and ca_declare > 0) else None
    salaire = (ca_declare - charges_m) if ca_declare is not None else None
    salaire_par_taux = (
        {str(t): _rnd(ca_declare * t / 100) for t in [15, 16, 18, 19, 20]}
        if ca_declare is not None else None
    )
    taux_att = (ca_declare / ca_cible * 100) if (ca_declare is not None and ca_cible) else None
    tc_nb = (nb_acc / nb_devis * 100) if nb_devis > 0 else None
    tc_m = (m_acc / montant_devis * 100) if montant_devis > 0 else None
    ratio_ant = (montant_devis / ca_cible) if ca_cible else None
    cout_abs = ((t_perdu / 60) * taux_h_reel) if (taux_h_reel and t_perdu > 0) else 0.0
    t_prop = (nb_devis / nb_patients * 100) if nb_patients > 0 else None
    total_rdv_nv = nb_nouveaux + nb_rdv_mq_nv
    t_desist = (nb_rdv_mq_nv / total_rdv_nv * 100) if total_rdv_nv > 0 else None

    return {
        "mois": mois,
        "annee": annee,
        "ca_declare": ca_declare,
        "ca_mensuel_cible": ca_cible,
        "charges_mensuelles": _rnd(charges_m),
        "taux_horaire_cible": taux_h_cible,
        "temps_productif_minutes": t_productif,
        "temps_perdu_minutes": t_perdu,
        "temps_presence_minutes": t_presence,
        "nb_patients_vus": nb_patients,
        "nb_devis_emis": nb_devis,
        "montant_devis_emis": _rnd(montant_devis),
        "nb_nouveaux_patients": nb_nouveaux,
        "taux_horaire_reel": _rnd(taux_h_reel),
        "ecart_taux_horaire": _rnd(ecart_th),
        "montant_moyen_devis": _rnd(mm_devis),
        "ratio_charges": _rnd(ratio_charges, 1),
        "salaire_estime": _rnd(salaire),
        "salaire_par_taux": salaire_par_taux,
        "taux_atteinte_ca": _rnd(taux_att, 1),
        "taux_conversion_nb": _rnd(tc_nb, 1),
        "taux_conversion_montant": _rnd(tc_m, 1),
        "ratio_anticipation": _rnd(ratio_ant, 2),
        "cout_absenteisme": _rnd(cout_abs),
        "taux_proposition": _rnd(t_prop, 1),
        "taux_desistement_nouveaux": _rnd(t_desist, 1),
    }


@router.get("/hebdomadaire")
def kpis_hebdomadaire(
    date_debut: date = Query(...),
    date_fin: date = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    id_prat = int(current_user["id"])

    params = db.query(models.ParametresPraticien).filter_by(id_praticien=id_prat).first()
    ca_cible = params.ca_mensuel_cible if params else None

    journees = db.query(models.Journee).filter(
        models.Journee.id_praticien == id_prat,
        models.Journee.date_jour.between(date_debut, date_fin),
    ).all()
    t_presence = sum(j.temps_presence_minutes for j in journees)
    t_perdu = sum(j.temps_perdu_minutes for j in journees)
    t_productif = t_presence - t_perdu

    t_occ = (t_productif / t_presence * 100) if t_presence > 0 else None

    devis_sem = db.query(models.Devis).filter(
        models.Devis.id_praticien == id_prat,
        models.Devis.date_emission.between(date_debut, date_fin),
    ).all()
    m_devis_sem = sum(d.montant for d in devis_sem)
    ratio_ant = (m_devis_sem / (ca_cible / 4)) if ca_cible else None

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "temps_productif_minutes": t_productif,
        "temps_perdu_minutes": t_perdu,
        "temps_presence_minutes": t_presence,
        "taux_occupation": _rnd(t_occ, 1),
        "nb_devis_emis": len(devis_sem),
        "montant_devis_semaine": _rnd(m_devis_sem),
        "ratio_anticipation": _rnd(ratio_ant, 2),
    }


@router.get("/encours")
def kpis_encours(
    seuil: float = Query(0.0, ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    id_prat = int(current_user["id"])

    params = db.query(models.ParametresPraticien).filter_by(id_praticien=id_prat).first()
    delai = params.delai_relance_jours if params else 14

    cutoff = date.today() - timedelta(days=delai)
    devis = (
        db.query(models.Devis)
        .filter(
            models.Devis.id_praticien == id_prat,
            models.Devis.statut == StatutDevis.EN_ATTENTE,
            models.Devis.date_emission <= cutoff,
            models.Devis.montant >= seuil,
        )
        .order_by(models.Devis.date_emission.asc())
        .all()
    )

    return {
        "delai_relance_jours": delai,
        "seuil": seuil,
        "total": len(devis),
        "montant_total": _rnd(sum(d.montant for d in devis)),
        "devis": [
            {
                "id_devis": d.id_devis,
                "id_patient": d.id_patient,
                "montant": d.montant,
                "date_emission": d.date_emission,
                "jours_attente": (date.today() - d.date_emission).days,
            }
            for d in devis
        ],
    }
