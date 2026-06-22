from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, schemas
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/systeme", tags=["Système"])

_SECRETAIRE_ONLY = "Réservé à la secrétaire."


def _require_secretaire(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != RoleUser.SECRETAIRE:
        raise HTTPException(status_code=403, detail=_SECRETAIRE_ONLY)
    return current_user


@router.get("/config", response_model=schemas.ConfigSystemeResponse)
def read_config(db: Session = Depends(get_db)):
    db_config = crud.get_config(db)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuration système introuvable")
    return db_config


@router.put("/config", response_model=schemas.ConfigSystemeResponse)
def update_config(
    config_update: schemas.ConfigSystemeUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(_require_secretaire),
):
    db_config = crud.update_config(db, config_update=config_update)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuration système introuvable")
    return db_config


@router.post("/logs", response_model=schemas.LogResponse, status_code=201)
def create_log(
    log_in: schemas.LogCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(_require_secretaire),
):
    return crud.create_log(db=db, log=log_in)


@router.get("/logs", response_model=List[schemas.LogResponse])
def read_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: dict = Depends(_require_secretaire),
):
    return crud.get_logs(db, skip=skip, limit=limit)
