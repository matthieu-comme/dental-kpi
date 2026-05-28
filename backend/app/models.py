# structure des tables dans la bdd
import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Date, Enum
from app.database import Base


class StatutDevis(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACCEPTE = "ACCEPTE"
    REFUSE = "REFUSE"


class StatutCheque(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    DEPOSE = "DEPOSE"


class Praticien(Base):
    __tablename__ = "praticiens"

    id_praticien = Column(Integer, primary_key=True, autoincrement=True)
    nom_praticien = Column(String, nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    pin_hash = Column(String, nullable=False)


class Cheque(Base):
    __tablename__ = "cheques"

    id_cheque = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(Integer, ForeignKey("praticiens.id_praticien"))
    id_patient = Column(String, nullable=False, index=True)
    montant = Column(Float, nullable=False)
    # date_reception
    # date_depot_prevue
    # Statut
