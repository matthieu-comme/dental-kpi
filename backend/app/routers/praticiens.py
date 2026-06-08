from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import schemas, crud
from app.database import get_db

router = APIRouter(prefix="/api/v1/praticiens", tags=["Praticiens"])


@router.post("/", response_model=schemas.PraticienResponse)
def create_praticien(praticien: schemas.PraticienCreate, db: Session = Depends(get_db)):
    return crud.create_praticien(db, praticien)
