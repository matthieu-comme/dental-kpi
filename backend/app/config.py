from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "cle-par-defaut"
    ALGORITHM: str = "HS256"
    GLOBAL_USERNAME: str = "admin"
    GLOBAL_PASSWORD: str = "admin"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 600
    NOM_CABINET: str = "Cabinet Défaut"
    TELEPHONE_CABINET: str = "0100000000"

    class Config:
        env_file = ".env"


settings = Settings()
