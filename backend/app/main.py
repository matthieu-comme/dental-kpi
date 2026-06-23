import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import (
    devis,
    praticiens,
    systeme,
    journees,
    cheques,
    charges,
    performances,
    auth,
    kpis,
    notifications,
    imports,
    export,
)
from app.database import SessionLocal, engine
from app import models, crud, schemas
from datetime import time
from app.config import settings

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if crud.get_config(db) is None:
            config_initiale = schemas.ConfigSystemeCreate(
                nom_cabinet=settings.NOM_CABINET,
                telephone_cabinet=settings.TELEPHONE_CABINET,
                heure_execution_cron=time(8, 30),
                password_global_clair=settings.GLOBAL_PASSWORD,
            )
            crud.create_config(db, config_initiale)
    finally:
        db.close()
    yield


app = FastAPI(title="API Dental KPI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Total-Count"],
)

app.include_router(systeme.router)
app.include_router(auth.router)
app.include_router(praticiens.router)
app.include_router(journees.router)
app.include_router(devis.router)
app.include_router(cheques.router)
app.include_router(charges.router)
app.include_router(performances.router)
app.include_router(kpis.router)
app.include_router(notifications.router)
app.include_router(imports.router)
app.include_router(export.router)


@app.get("/api/v1/status")
def read_root():
    return {"status": "Back-end opérationnel"}


_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="spa")
