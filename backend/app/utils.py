from passlib.context import CryptContext

# Configuration du hachage (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return pwd_context.hash(pin)


def check_pin(plain_pin: str, hashed_pin: str) -> bool:
    return pwd_context.verify(plain_pin, hashed_pin)
