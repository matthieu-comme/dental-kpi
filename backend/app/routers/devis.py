from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, schemas, models
from app.database import get_db
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/devis", tags=["Devis"])


@router.post("/", response_model=schemas.DevisResponse, status_code=201)
def create_devis(
    devis_in: schemas.DevisCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.PRATICIEN:
        devis_data = devis_in.model_dump()
        devis_data["id_praticien"] = int(current_user["id"])
        devis_in = schemas.DevisCreate(**devis_data)

    try:
        return crud.create_devis(db=db, devis=devis_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer le devis : le praticien spécifié n'existe pas.",
        )


@router.get("/", response_model=list[schemas.DevisResponse])
def read_deviss(
    id_patient: Optional[str] = None,
    id_praticien: Optional[int] = None,
    statut: Optional[models.StatutDevis] = None,
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
    query = db.query(models.Devis)
    if current_user["role"] == RoleUser.PRATICIEN:
        query = query.filter(models.Devis.id_praticien == int(current_user["id"]))
    elif id_praticien is not None:
        query = query.filter(models.Devis.id_praticien == id_praticien)
    if id_patient:
        query = query.filter(models.Devis.id_patient.ilike(f"%{id_patient}%"))
    if statut:
        query = query.filter(models.Devis.statut == statut)
    if date_from:
        query = query.filter(models.Devis.date_emission >= date_from)
    if date_to:
        query = query.filter(models.Devis.date_emission <= date_to)
    if montant_min is not None:
        query = query.filter(models.Devis.montant >= montant_min)
    if montant_max is not None:
        query = query.filter(models.Devis.montant <= montant_max)
    response.headers["X-Total-Count"] = str(query.count())
    return query.offset(skip).limit(limit).all()


@router.get("/{id_devis}", response_model=schemas.DevisResponse)
def read_devis(
    id_devis: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_devis = db.query(models.Devis).filter(models.Devis.id_devis == id_devis).first()
    if db_devis is None:
        raise HTTPException(status_code=404, detail="Devis introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_devis.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")
    return db_devis


@router.put("/{id_devis}", response_model=schemas.DevisResponse)
def update_devis(
    id_devis: int,
    devis_update: schemas.DevisUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_devis = db.query(models.Devis).filter(models.Devis.id_devis == id_devis).first()
    if db_devis is None:
        raise HTTPException(status_code=404, detail="Devis introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_devis.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    try:
        return crud.update_devis(db, id_devis=id_devis, devis_update=devis_update)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{id_devis}", status_code=204)
def delete_devis(
    id_devis: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    db_devis = db.query(models.Devis).filter(models.Devis.id_devis == id_devis).first()
    if db_devis is None:
        raise HTTPException(status_code=404, detail="Devis introuvable.")

    if current_user["role"] == RoleUser.PRATICIEN and db_devis.id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    crud.delete_devis(db, id_devis=id_devis)
