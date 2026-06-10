from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, schemas, models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/performances", tags=["Performances Mensuelles"])


@router.post("/", response_model=schemas.PerformanceMensuelleResponse, status_code=201)
def create_performance(
    perf_in: schemas.PerformanceMensuelleCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    perf_data = perf_in.model_dump()
    perf_data["id_praticien"] = int(current_user["id"])
    perf_in = schemas.PerformanceMensuelleCreate(**perf_data)

    if current_user["role"] == RoleUser.PRATICIEN and perf_in.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    return crud.create_performance(db=db, perf=perf_in)


@router.get("/", response_model=list[schemas.PerformanceMensuelleResponse])
def read_performances(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(models.PerformanceMensuelle)
    if current_user["role"] == RoleUser.PRATICIEN:
        query = query.filter(
            models.PerformanceMensuelle.id_praticien == int(current_user["id"])
        )
    return query.all()


@router.get("/{id_perf}", response_model=schemas.PerformanceMensuelleResponse)
def read_performance(
    id_perf: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    db_perf = (
        db.query(models.PerformanceMensuelle)
        .filter(models.PerformanceMensuelle.id_perf == id_perf)
        .first()
    )
    if db_perf is None:
        raise HTTPException(status_code=404, detail="Performance introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_perf.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")
    return db_perf


@router.put("/{id_perf}", response_model=schemas.PerformanceMensuelleResponse)
def update_performance(
    id_perf: int,
    perf_update: schemas.PerformanceMensuelleUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_perf = (
        db.query(models.PerformanceMensuelle)
        .filter(models.PerformanceMensuelle.id_perf == id_perf)
        .first()
    )
    if db_perf is None:
        raise HTTPException(status_code=404, detail="Performance introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_perf.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    return crud.update_performance(db, id_perf=id_perf, perf_update=perf_update)
