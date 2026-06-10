from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.routers import (
    devis,
    praticiens,
    systeme,
    journees,
    cheques,
    charges,
    performances,
    auth,
)
from app.database import SessionLocal, engine
from app import models, crud, schemas
from datetime import time

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if crud.get_config(db) is None:
            config_initiale = schemas.ConfigSystemeCreate(
                nom_cabinet="Cabinet Initial",
                telephone_cabinet="0123456789",
                heure_execution_cron=time(8, 30),
                password_global_clair="Admin123",  # À modifier par le praticien plus tard via PUT
            )
            crud.create_config(db, config_initiale)
    finally:
        db.close()
    yield


app = FastAPI(title="API Dental KPI", version="1.0.0", lifespan=lifespan)


app.include_router(systeme.router)
app.include_router(auth.router)
app.include_router(praticiens.router)
app.include_router(journees.router)
app.include_router(devis.router)
app.include_router(cheques.router)
app.include_router(charges.router)
app.include_router(performances.router)


@app.get("/")
def root():
    return {"Hello": "World"}


@app.get("/api/v1/status")
def read_root():
    return {"status": "Back-end opérationnel"}
