from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db

router = APIRouter(prefix="/api/v1/charges", tags=["Charges"])


@router.post("/", response_model=schemas.ChargeResponse, status_code=201)
def create_charge(charge_in: schemas.ChargeCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_charge(db=db, charge=charge_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer la charge : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_charge}", response_model=schemas.ChargeResponse)
def read_charge(id_charge: int, db: Session = Depends(get_db)):
    db_charge = (
        db.query(models.Charge).filter(models.Charge.id_charge == id_charge).first()
    )
    if db_charge is None:
        raise HTTPException(status_code=404, detail="Charge introuvable.")
    return db_charge


@router.put("/{id_charge}", response_model=schemas.ChargeResponse)
def update_charge(
    id_charge: int,
    charge_update: schemas.ChargeUpdate,
    db: Session = Depends(get_db),
):
    try:
        db_charge = crud.update_charge(
            db, id_charge=id_charge, charge_update=charge_update
        )
        if db_charge is None:
            raise HTTPException(status_code=404, detail="Charge introuvable.")
        return db_charge
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
