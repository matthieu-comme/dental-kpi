from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api/v1/systeme", tags=["Système"])


@router.get("/config", response_model=schemas.ConfigSystemeResponse)
def read_config(db: Session = Depends(get_db)):
    db_config = crud.get_config(db)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuration système introuvable")
    return db_config


@router.put("/config", response_model=schemas.ConfigSystemeResponse)
def update_config(
    config_update: schemas.ConfigSystemeUpdate, db: Session = Depends(get_db)
):
    db_config = crud.update_config(db, config_update=config_update)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuration système introuvable")
    return db_config


@router.post("/logs", response_model=schemas.LogResponse, status_code=201)
def create_log(log_in: schemas.LogCreate, db: Session = Depends(get_db)):
    return crud.create_log(db=db, log=log_in)


@router.get("/logs", response_model=List[schemas.LogResponse])
def read_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_logs(db, skip=skip, limit=limit)
