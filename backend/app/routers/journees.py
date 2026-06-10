from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/journees", tags=["Journées"])


@router.post("/", response_model=schemas.JourneeResponse, status_code=201)
def create_journee(journee_in: schemas.JourneeCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_journee(db=db, journee=journee_in)
    except IntegrityError as e:
        db.rollback()

        error_msg = str(e.orig).lower()

        if "unique" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Une clôture journalière existe déjà pour ce praticien à cette date.",
            )

        raise HTTPException(
            status_code=400,
            detail="Impossible de créer la journée : le praticien spécifié n'existe pas.",
        )


@router.get("/{id_journee}", response_model=schemas.JourneeResponse)
def read_journee(
    id_journee: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_journee = crud.get_journee(db, id_journee=id_journee)
    if db_journee is None:
        raise HTTPException(status_code=404, detail="Journée introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_journee.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")
    return db_journee


@router.put("/{id_journee}", response_model=schemas.JourneeResponse)
def update_journee(
    id_journee: int,
    journee_update: schemas.JourneeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_journee = crud.get_journee(db, id_journee=id_journee)
    if db_journee is None:
        raise HTTPException(status_code=404, detail="Journée introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_journee.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    return crud.update_journee(db, id_journee=id_journee, journee_update=journee_update)
