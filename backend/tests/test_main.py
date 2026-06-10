import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app import models
from app.database import get_db, Base

# base éphémère
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


# Nettoyage de la base entre chaque test
@pytest.fixture(autouse=True)
def setup_database():
    models.Base.metadata.create_all(bind=engine)
    yield
    models.Base.metadata.drop_all(bind=engine)


def test_hello():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["Hello"] == "World"


def test_create_praticien():
    response = client.post(
        "/api/v1/praticiens/",
        json={"nom": "Dr. Shaq", "est_actif": True, "pin_clair": "1234"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nom"] == "Dr. Shaq"
    assert "id_praticien" in data
    assert "pin_hash" not in data
