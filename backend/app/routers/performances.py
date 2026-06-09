from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db

router = APIRouter(prefix="/api/v1/performances", tags=["Performances Mensuelles"])


@router.post("/", response_model=schemas.PerformanceMensuelleResponse, status_code=201)
def create_performance(
    perf_in: schemas.PerformanceMensuelleCreate, db: Session = Depends(get_db)
):
    try:
        return crud.create_performance(db=db, perf=perf_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer la performance : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_perf}", response_model=schemas.PerformanceMensuelleResponse)
def read_performance(id_perf: int, db: Session = Depends(get_db)):
    db_perf = (
        db.query(models.PerformanceMensuelle)
        .filter(models.PerformanceMensuelle.id_perf == id_perf)
        .first()
    )
    if db_perf is None:
        raise HTTPException(status_code=404, detail="Performance introuvable.")
    return db_perf


@router.put("/{id_perf}", response_model=schemas.PerformanceMensuelleResponse)
def update_performance(
    id_perf: int,
    perf_update: schemas.PerformanceMensuelleUpdate,
    db: Session = Depends(get_db),
):
    db_perf = crud.update_performance(db, id_perf=id_perf, perf_update=perf_update)
    if db_perf is None:
        raise HTTPException(status_code=404, detail="Performance introuvable.")
    return db_perf
