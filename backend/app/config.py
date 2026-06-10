from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "cle-par-defaut"
    ALGORITHM: str = "HS256"
    GLOBAL_USERNAME: str = "admin"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 600

    class Config:
        env_file = ".env"


settings = Settings()
