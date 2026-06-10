from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/cheques", tags=["Chèques"])


@router.post("/", response_model=schemas.ChequeResponse, status_code=201)
def create_cheque(
    cheque_in: schemas.ChequeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.PRATICIEN:
        cheque_data = cheque_in.model_dump()
        cheque_data["id_praticien"] = int(current_user["id"])
        cheque_in = schemas.ChequeCreate(**cheque_data)

    try:
        return crud.create_cheque(db=db, cheque=cheque_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer le chèque : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_cheque}", response_model=schemas.ChequeResponse)
def read_cheque(
    id_cheque: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_cheque = (
        db.query(models.Cheque).filter(models.Cheque.id_cheque == id_cheque).first()
    )
    if db_cheque is None:
        raise HTTPException(status_code=404, detail="Chèque introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_cheque.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")
    return db_cheque


@router.put("/{id_cheque}", response_model=schemas.ChequeResponse)
def update_cheque(
    id_cheque: int,
    cheque_update: schemas.ChequeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_cheque = (
        db.query(models.Cheque).filter(models.Cheque.id_cheque == id_cheque).first()
    )
    if db_cheque is None:
        raise HTTPException(status_code=404, detail="Chèque introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_cheque.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    return crud.update_cheque(db, id_cheque=id_cheque, cheque_update=cheque_update)
