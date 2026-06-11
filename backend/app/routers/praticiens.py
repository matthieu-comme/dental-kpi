# praticiens et parametrespraticien

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas, crud, models
from app.database import get_db
from sqlalchemy.exc import IntegrityError
from app.routers.auth import get_current_user
from app.models import RoleUser

router = APIRouter(prefix="/api/v1/praticiens", tags=["Praticiens"])


@router.post("/", response_model=schemas.PraticienResponse)
def create_praticien(
    praticien: schemas.PraticienCreate,
    db: Session = Depends(get_db),
):
    return crud.create_praticien(db, praticien)


@router.get("/", response_model=list[schemas.PraticienResponse])
def read_praticiens(
    db: Session = Depends(get_db),
):
    return db.query(models.Praticien).all()


@router.get("/{id_praticien}", response_model=schemas.PraticienResponse)
def read_praticien(
    id_praticien: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.PRATICIEN and id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    db_praticien = crud.get_praticien(db, id_praticien=id_praticien)
    if db_praticien is None:
        raise HTTPException(status_code=404, detail="Praticien non trouvé")
    return db_praticien


@router.put("/{id_praticien}", response_model=schemas.PraticienResponse)
def update_praticien(
    id_praticien: int,
    praticien_update: schemas.PraticienUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.PRATICIEN and id_praticien != int(
        current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    db_praticien = crud.update_praticien(
        db, id_praticien=id_praticien, praticien_update=praticien_update
    )
    if db_praticien is None:
        raise HTTPException(status_code=404, detail="Praticien non trouvé")
    return db_praticien


@router.post(
    "/parametres", response_model=schemas.ParametresPraticienResponse, status_code=201
)
def create_parametres_praticien(
    parametres: schemas.ParametresPraticienCreate, db: Session = Depends(get_db)
):
    try:
        return crud.create_parametres_praticien(db=db, parametres=parametres)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer les paramètres : le praticien spécifié n'existe pas.",
        )


@router.get(
    "/{id_praticien}/parametres", response_model=schemas.ParametresPraticienResponse
)
def read_parametres_praticien(
    id_praticien: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.SECRETAIRE:
        raise HTTPException(
            status_code=403, detail="Seul un praticien peut consulter ses paramètres."
        )

    if id_praticien != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    db_param = crud.get_parametres_praticien(db, id_praticien=id_praticien)
    if db_param is None:
        raise HTTPException(
            status_code=404, detail="Paramètres du praticien non trouvés"
        )
    return db_param


@router.put(
    "/{id_praticien}/parametres", response_model=schemas.ParametresPraticienResponse
)
def update_parametres_praticien(
    id_praticien: int,
    parametres_update: schemas.ParametresPraticienUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == RoleUser.SECRETAIRE:
        raise HTTPException(
            status_code=403, detail="Seul un praticien peut modifier ses paramètres."
        )

    if id_praticien != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Accès non autorisé.")

    db_param = crud.update_parametres_praticien(
        db, id_praticien=id_praticien, parametres_update=parametres_update
    )
    if db_param is None:
        raise HTTPException(
            status_code=404, detail="Paramètres du praticien non trouvés"
        )
    return db_param
