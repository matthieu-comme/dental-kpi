from typing import List, Optional
from datetime import date
from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException, Query, Response
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


@router.get("/", response_model=list[schemas.ChequeResponse])
def read_cheques(
    id_patient: Optional[str] = None,
    id_praticien: Optional[int] = None,
    statut: List[models.StatutCheque] = Query(default=[]),
    depot_echu: Optional[bool] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    montant_min: Optional[float] = None,
    montant_max: Optional[float] = None,
    skip: int = 0,
    limit: int = Query(default=50, le=500),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(models.Cheque)
    if current_user["role"] == RoleUser.PRATICIEN:
        query = query.filter(models.Cheque.id_praticien == int(current_user["id"]))
    elif id_praticien is not None:
        query = query.filter(models.Cheque.id_praticien == id_praticien)
    if id_patient:
        query = query.filter(models.Cheque.id_patient.ilike(f"%{id_patient}%"))
    if statut:
        query = query.filter(models.Cheque.statut.in_(statut))
    if depot_echu is True:
        query = query.filter(
            models.Cheque.date_depot_prevue.isnot(None),
            models.Cheque.date_depot_prevue <= date.today(),
        )
    elif depot_echu is False:
        query = query.filter(
            or_(
                models.Cheque.date_depot_prevue.is_(None),
                models.Cheque.date_depot_prevue > date.today(),
            )
        )
    if date_from:
        query = query.filter(models.Cheque.date_reception >= date_from)
    if date_to:
        query = query.filter(models.Cheque.date_reception <= date_to)
    if montant_min is not None:
        query = query.filter(models.Cheque.montant >= montant_min)
    if montant_max is not None:
        query = query.filter(models.Cheque.montant <= montant_max)
    response.headers["X-Total-Count"] = str(query.count())
    return query.offset(skip).limit(limit).all()


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


@router.delete("/{id_cheque}", status_code=204)
def delete_cheque(
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

    crud.delete_cheque(db, id_cheque=id_cheque)
