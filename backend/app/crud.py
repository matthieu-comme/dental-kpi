from sqlalchemy.orm import Session
from app import models, schemas
from utils import hash_pin, check_pin

# CONFIG


def get_config(db: Session):
    return (
        db.query(models.ConfigSysteme)
        .filter(models.ConfigSysteme.id_config == 1)
        .first()
    )


def update_config(db: Session, config_update: schemas.ConfigSystemeUpdate):
    db_config = get_config(db)
    if not db_config:
        return None

    update_data = config_update.model_dump(exclude_unset=True)

    if "password_global_clair" in update_data:
        update_data["password_global_hash"] = hash_pin(
            update_data.pop("password_global_clair")
        )

    for key, value in update_data.items():
        setattr(db_config, key, value)

    db.commit()
    db.refresh(db_config)
    return db_config


# PRATICIEN


def create_praticien(db: Session, praticien: schemas.PraticienCreate):
    praticien_data = praticien.model_dump()
    praticien_data["pin_hash"] = hash_pin(praticien_data.pop("pin_clair"))
    db_praticien = models.Praticien(**praticien_data)
    db.add(db_praticien)
    db.commit()
    db.refresh(db_praticien)
    return db_praticien


def get_praticien(db: Session, id_praticien: int):
    return (
        db.query(models.Praticien)
        .filter(models.Praticien.id_praticien == id_praticien)
        .first()
    )


def update_praticien(
    db: Session, id_praticien: int, praticien_update: schemas.PraticienUpdate
):
    db_praticien = get_praticien(db, id_praticien)
    if not db_praticien:
        return None

    update_data = praticien_update.model_dump(exclude_unset=True)

    if "pin_clair" in update_data:
        update_data["pin_hash"] = hash_pin(update_data.pop("pin_clair"))

    for key, value in update_data.items():
        setattr(db_praticien, key, value)

    db.commit()
    db.refresh(db_praticien)
    return db_praticien


## PARAMETRES PRATICIEN


def create_parametres_praticien(
    db: Session, parametres: schemas.ParametresPraticienCreate
):
    db_parametres = models.ParametresPraticien(**parametres.model_dump())
    db.add(db_parametres)
    db.commit()
    db.refresh(db_parametres)
    return db_parametres


def get_parametres_praticien(db: Session, id_praticien: int):
    return (
        db.query(models.ParametresPraticien)
        .filter(models.ParametresPraticien.id_praticien == id_praticien)
        .first()
    )


def update_parametres_praticien(
    db: Session, id_praticien: int, parametres_update: schemas.ParametresPraticienUpdate
):
    db_parametres = get_parametres_praticien(db, id_praticien)
    if not db_parametres:
        return None

    for key, value in parametres_update.model_dump(exclude_unset=True).items():
        setattr(db_parametres, key, value)

    db.commit()
    db.refresh(db_parametres)
    return db_parametres


# LOGS


def create_log(db: Session, log: schemas.LogCreate):
    db_log = models.Log(**log.model_dump())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


def get_logs(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(models.Log)
        .order_by(models.Log.date_evenement.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# DEVIS


def create_devis(db: Session, devis: schemas.DevisCreate):
    db_devis = models.Devis(**devis.model_dump())
    db.add(db_devis)
    db.commit()
    db.refresh(db_devis)
    return db_devis


def update_devis(db: Session, id_devis: int, devis_update: schemas.DevisUpdate):
    db_devis = db.query(models.Devis).filter(models.Devis.id_devis == id_devis).first()
    if not db_devis:
        return None

    update_data = devis_update.model_dump(exclude_unset=True)

    nouvelle_date_emission = update_data.get("date_emission", db_devis.date_emission)
    nouvelle_date_decision = update_data.get("date_decision", db_devis.date_decision)

    if nouvelle_date_decision and nouvelle_date_decision < nouvelle_date_emission:
        raise ValueError(
            "La date de décision ne peut pas être antérieure à la date d'émission."
        )

    nouveau_statut = update_data.get("statut", db_devis.statut)
    nouveau_motif = update_data.get("motif_refus", db_devis.motif_refus)

    if nouveau_statut == models.StatutDevis.REFUSE and not nouveau_motif:
        raise ValueError("Un motif de refus est obligatoire pour clore un devis.")

    if nouveau_statut != models.StatutDevis.REFUSE:
        update_data["motif_refus"] = None

    for key, value in update_data.items():
        setattr(db_devis, key, value)

    db.commit()
    db.refresh(db_devis)
    return db_devis


# CHEQUE


def create_cheque(db: Session, cheque: schemas.ChequeCreate):
    db_cheque = models.Cheque(**cheque.model_dump())
    db.add(db_cheque)
    db.commit()
    db.refresh(db_cheque)
    return db_cheque


def update_cheque(db: Session, id_cheque: int, cheque_update: schemas.ChequeUpdate):
    db_cheque = (
        db.query(models.Cheque).filter(models.Cheque.id_cheque == id_cheque).first()
    )
    if not db_cheque:
        return None

    for key, value in cheque_update.model_dump(exclude_unset=True).items():
        setattr(db_cheque, key, value)

    db.commit()
    db.refresh(db_cheque)
    return db_cheque


# JOURNEES


def create_journee(db: Session, journee: schemas.JourneeCreate):
    db_journee = models.Journee(**journee.model_dump())
    db.add(db_journee)
    db.commit()
    db.refresh(db_journee)
    return db_journee


def get_journee(db: Session, id_journee: int):
    return (
        db.query(models.Journee).filter(models.Journee.id_journee == id_journee).first()
    )


def update_journee(db: Session, id_journee: int, journee_update: schemas.JourneeUpdate):
    db_journee = get_journee(db, id_journee)
    if not db_journee:
        return None

    for key, value in journee_update.model_dump(exclude_unset=True).items():
        setattr(db_journee, key, value)

    db.commit()
    db.refresh(db_journee)
    return db_journee


# CHARGE


def create_charge(db: Session, charge: schemas.ChargeCreate):
    db_charge = models.Charge(**charge.model_dump())
    db.add(db_charge)
    db.commit()
    db.refresh(db_charge)
    return db_charge


def update_charge(db: Session, id_charge: int, charge_update: schemas.ChargeUpdate):
    db_charge = (
        db.query(models.Charge).filter(models.Charge.id_charge == id_charge).first()
    )
    if not db_charge:
        return None

    update_data = charge_update.model_dump(exclude_unset=True)

    nouvelle_periodicite = update_data.get("periodicite", db_charge.periodicite)
    if nouvelle_periodicite == models.PeriodiciteCharge.PONCTUEL:
        update_data["date_fin"] = None

    nouvelle_date_debut = update_data.get("date_debut", db_charge.date_debut)
    nouvelle_date_fin = update_data.get("date_fin", db_charge.date_fin)

    if nouvelle_date_fin and nouvelle_date_fin <= nouvelle_date_debut:
        raise ValueError(
            "La date de fin doit être strictement postérieure à la date de début."
        )

    for key, value in update_data.items():
        setattr(db_charge, key, value)

    db.commit()
    db.refresh(db_charge)
    return db_charge


# PERFORMANCES MENSUELLES


def create_performance(db: Session, perf: schemas.PerformanceMensuelleCreate):
    db_perf = models.PerformanceMensuelle(**perf.model_dump())
    db.add(db_perf)
    db.commit()
    db.refresh(db_perf)
    return db_perf


def update_performance(
    db: Session, id_perf: int, perf_update: schemas.PerformanceMensuelleUpdate
):
    db_perf = (
        db.query(models.PerformanceMensuelle)
        .filter(models.PerformanceMensuelle.id_perf == id_perf)
        .first()
    )
    if not db_perf:
        return None

    for key, value in perf_update.model_dump(exclude_unset=True).items():
        setattr(db_perf, key, value)

    db.commit()
    db.refresh(db_perf)
    return db_perf
