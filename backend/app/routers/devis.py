from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import schemas, crud
from app.database import get_db

router = APIRouter(prefix="/api/v1/devis", tags=["Devis"])


@router.post("/", response_model=schemas.DevisResponse)
def create_devis(devis: schemas.DevisCreate, db: Session = Depends(get_db)):
    return crud.create_devis(db, devis)
