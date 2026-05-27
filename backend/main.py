from fastapi import FastAPI

app = FastAPI()


@app.get("/api/v1/status")
def read_root():
    return {"status": "Back-end opérationnel"}
