from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db

router = APIRouter(prefix="/api/v1/cheques", tags=["Chèques"])


@router.post("/", response_model=schemas.ChequeResponse, status_code=201)
def create_cheque(cheque_in: schemas.ChequeCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_cheque(db=db, cheque=cheque_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer le chèque : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_cheque}", response_model=schemas.ChequeResponse)
def read_cheque(id_cheque: int, db: Session = Depends(get_db)):
    db_cheque = (
        db.query(models.Cheque).filter(models.Cheque.id_cheque == id_cheque).first()
    )
    if db_cheque is None:
        raise HTTPException(status_code=404, detail="Chèque introuvable.")
    return db_cheque


@router.put("/{id_cheque}", response_model=schemas.ChequeResponse)
def update_cheque(
    id_cheque: int,
    cheque_update: schemas.ChequeUpdate,
    db: Session = Depends(get_db),
):
    db_cheque = crud.update_cheque(db, id_cheque=id_cheque, cheque_update=cheque_update)
    if db_cheque is None:
        raise HTTPException(status_code=404, detail="Chèque introuvable.")
    return db_cheque
