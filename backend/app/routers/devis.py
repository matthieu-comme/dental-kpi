from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db

router = APIRouter(prefix="/api/v1/devis", tags=["Devis"])


@router.post("/", response_model=schemas.DevisResponse, status_code=201)
def create_devis(devis_in: schemas.DevisCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_devis(db=db, devis=devis_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer le devis : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_devis}", response_model=schemas.DevisResponse)
def read_devis(id_devis: int, db: Session = Depends(get_db)):
    db_devis = db.query(models.Devis).filter(models.Devis.id_devis == id_devis).first()
    if db_devis is None:
        raise HTTPException(status_code=404, detail="Devis introuvable.")
    return db_devis


@router.put("/{id_devis}", response_model=schemas.DevisResponse)
def update_devis(
    id_devis: int,
    devis_update: schemas.DevisUpdate,
    db: Session = Depends(get_db),
):
    try:
        db_devis = crud.update_devis(db, id_devis=id_devis, devis_update=devis_update)
        if db_devis is None:
            raise HTTPException(status_code=404, detail="Devis introuvable.")
        return db_devis
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
