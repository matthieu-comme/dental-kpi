from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    SECRET_KEY: str = "cle-par-defaut"
    ALGORITHM: str = "HS256"
    GLOBAL_USERNAME: str = "admin"
    GLOBAL_PASSWORD: str = "admin"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 600
    NOM_CABINET: str = "Cabinet Défaut"
    TELEPHONE_CABINET: str = "0100000000"


settings = Settings()
