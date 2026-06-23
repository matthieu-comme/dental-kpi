from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/charges", tags=["Charges"])


@router.post("/", response_model=schemas.ChargeResponse, status_code=201)
def create_charge(
    charge_in: schemas.ChargeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.SECRETAIRE:
        raise HTTPException(
            status_code=403,
            detail="Seul un praticien peut créer une charge",
        )

    charge_data = charge_in.model_dump()
    charge_data["id_praticien"] = int(current_user["id"])
    charge_in = schemas.ChargeCreate(**charge_data)

    return crud.create_charge(db=db, charge=charge_in)


@router.get("/", response_model=list[schemas.ChargeResponse])
def read_charges(
    designation: Optional[str] = None,
    periodicite: Optional[models.PeriodiciteCharge] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    montant_min: Optional[float] = None,
    montant_max: Optional[float] = None,
    skip: int = 0,
    limit: int = Query(default=50, le=500),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(models.Charge)
    if current_user["role"] == RoleUser.PRATICIEN:
        query = query.filter(models.Charge.id_praticien == int(current_user["id"]))
    if designation:
        query = query.filter(models.Charge.designation.ilike(f"%{designation}%"))
    if periodicite:
        query = query.filter(models.Charge.periodicite == periodicite)
    if date_from:
        query = query.filter(models.Charge.date_debut >= date_from)
    if date_to:
        query = query.filter(models.Charge.date_debut <= date_to)
    if montant_min is not None:
        query = query.filter(models.Charge.montant >= montant_min)
    if montant_max is not None:
        query = query.filter(models.Charge.montant <= montant_max)
    response.headers["X-Total-Count"] = str(query.count())
    return query.offset(skip).limit(limit).all()


@router.get("/{id_charge}", response_model=schemas.ChargeResponse)
def read_charge(
    id_charge: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_charge = (
        db.query(models.Charge).filter(models.Charge.id_charge == id_charge).first()
    )
    if db_charge is None:
        raise HTTPException(status_code=404, detail="Charge introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_charge.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")
    return db_charge


@router.put("/{id_charge}", response_model=schemas.ChargeResponse)
def update_charge(
    id_charge: int,
    charge_update: schemas.ChargeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_charge = (
        db.query(models.Charge).filter(models.Charge.id_charge == id_charge).first()
    )
    if db_charge is None:
        raise HTTPException(status_code=404, detail="Charge introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_charge.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    try:
        return crud.update_charge(db, id_charge=id_charge, charge_update=charge_update)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{id_charge}", status_code=204)
def delete_charge(
    id_charge: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.SECRETAIRE:
        raise HTTPException(status_code=403, detail="Seul un praticien peut supprimer une charge.")

    db_charge = db.query(models.Charge).filter(models.Charge.id_charge == id_charge).first()
    if db_charge is None:
        raise HTTPException(status_code=404, detail="Charge introuvable.")

    if db_charge.id_praticien != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    crud.delete_charge(db, id_charge=id_charge)
