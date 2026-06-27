from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from app import models
from app.database import get_db
from app.utils import check_pin
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

router = APIRouter(prefix="/api/v1/auth", tags=["Authentification"])


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=15)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    if form_data.username == settings.GLOBAL_USERNAME:
        config = db.query(models.ConfigSysteme).first()
        if not config or not check_pin(form_data.password, config.password_global_hash):
            raise HTTPException(status_code=401, detail="Mot de passe incorrect")

        user_data = {"sub": "secretaire", "role": "secretaire"}

    # Cas 2 : Connexion d'un Praticien
    else:
        praticien = (
            db.query(models.Praticien)
            .filter(models.Praticien.id_praticien == form_data.username)
            .first()
        )
        if not praticien or not check_pin(form_data.password, praticien.pin_hash):
            raise HTTPException(status_code=401, detail="ID ou PIN incorrect")

        user_data = {"sub": str(praticien.id_praticien), "role": "praticien"}

    access_token = create_access_token(
        data=user_data,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None or role is None:
            raise HTTPException(status_code=401, detail="Token invalide")

        return {"id": user_id, "role": role}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
