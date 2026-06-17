"""
Infrastructure partagée entre tous les fichiers de tests.
Un seul moteur SQLite en mémoire + un seul override de la dépendance get_db.
"""
import pytest
from datetime import time
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app import models
from app.database import get_db
from app.utils import hash_pin
from app.routers.auth import create_access_token

# ── Base de données de test ──────────────────────────────────────────────────

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Constantes partagées
SEC_PASSWORD = "motdepasse"
PRAT_PIN = "111111"
SEC_USERNAME = "secretaire"


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Override unique : toutes les routes utilisent cet engine de test
app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


# ── Fixtures communes ────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    models.Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    db.add(models.ConfigSysteme(
        id_config=1,
        password_global_hash=hash_pin(SEC_PASSWORD),
        nom_cabinet="Cabinet Test",
        telephone_cabinet="0123456789",
        heure_execution_cron=time(8, 0),
    ))

    praticien = models.Praticien(nom="Dr. Test", pin_hash=hash_pin(PRAT_PIN), est_actif=True)
    db.add(praticien)
    db.flush()

    db.add(models.ParametresPraticien(
        id_praticien=praticien.id_praticien,
        taux_horaire_cible=300.0,
        ca_mensuel_cible=20000.0,
        delai_relance_jours=15,
        seuil_devis_sms=500.0,
        seuil_devis_assistante=1500.0,
    ))
    db.commit()
    db.close()

    yield

    models.Base.metadata.drop_all(bind=engine)


@pytest.fixture
def praticien_id():
    db = TestingSessionLocal()
    p = db.query(models.Praticien).first()
    assert p is not None
    db.close()
    return p.id_praticien


@pytest.fixture
def sec_headers():
    token = create_access_token({"sub": SEC_USERNAME, "role": "secretaire"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def prat_headers(praticien_id):
    token = create_access_token({"sub": str(praticien_id), "role": "praticien"})
    return {"Authorization": f"Bearer {token}"}
