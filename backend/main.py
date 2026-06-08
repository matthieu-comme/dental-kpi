from fastapi import FastAPI
from app.routers import devis, praticiens

app = FastAPI()

app.include_router(praticiens.router)
app.include_router(devis.router)


@app.get("/")
def root():
    return {"Hello": "World"}


@app.get("/api/v1/status")
def read_root():
    return {"status": "Back-end opérationnel"}
