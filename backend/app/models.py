# structure des tables dans la bdd
import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    ForeignKey,
    Date,
    DateTime,
    Time,
    Enum,
    CheckConstraint,
)
from sqlalchemy.sql import func
from app.database import Base

# TABLES DE CONFIG


class Praticien(Base):
    __tablename__ = "praticiens"

    id_praticien = Column(Integer, primary_key=True, autoincrement=True)
    nom = Column(String, nullable=False)
    est_actif = Column(Boolean, default=True, nullable=False)
    pin_hash = Column(String, nullable=False)


class ConfigSysteme(Base):
    __tablename__ = "config_systeme"
    __table_args__ = (CheckConstraint("id_config = 1", name="check_single_config"),)

    id_config = Column(Integer, primary_key=True, autoincrement=True)
    password_global_hash = Column(String, nullable=False)
    cle_api_sms = Column(String)
    nom_cabinet = Column(String, nullable=False)
    telephone_cabinet = Column(String, nullable=False)
    heure_execution_cron = Column(Time, nullable=False)


class TypeAction(str, enum.Enum):
    SMS_ENVOYE = "SMS_ENVOYE"
    ALERTE_SECRETAIRE_CREEE = "ALERTE_SECRETAIRE_CREEE"
    ALERTE_PRATICIEN_CREEE = "ALERTE_PRATICIEN_CREEE"
    ERREUR_RESEAU = "ERREUR_RESEAU"
    AJOUT_DEVIS = "AJOUT_DEVIS"
    MODIF_DEVIS = "MODIF_DEVIS"
    SUPPR_DEVIS = "SUPPR_DEVIS"
    AJOUT_CHEQUE = "AJOUT_CHEQUE"
    MODIF_CHEQUE = "MODIF_CHEQUE"
    SUPPR_CHEQUE = "SUPPR_CHEQUE"


class ParametresPraticien(Base):
    __tablename__ = "parametres_praticien"

    id_parametre = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), unique=True, nullable=False
    )
    taux_horaire_cible = Column(Float, nullable=False)
    ca_mensuel_cible = Column(Float, nullable=False)
    delai_relance_jours = Column(Integer, nullable=False, server_default="15")
    seuil_devis_sms = Column(Float, nullable=False, server_default="500")
    seuil_devis_assistante = Column(Float, nullable=False, server_default="1500")


class TypeEntite(str, enum.Enum):
    DEVIS = "DEVIS"
    CHEQUE = "CHEQUE"


class Log(Base):
    __tablename__ = "logs"

    id_log = Column(Integer, primary_key=True, autoincrement=True)
    date_evenement = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    type_action = Column(Enum(TypeAction), nullable=False, index=True)
    type_entite = Column(Enum(TypeEntite), index=True)
    id_entite = Column(Integer, index=True)
    details = Column(String, nullable=False)


# TABLES METIER


class Journee(Base):
    __tablename__ = "journees"

    id_journee = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    date_jour = Column(Date, index=True, nullable=False)
    nb_patients_vus = Column(Integer, nullable=False)
    nb_rdv_manques_connus = Column(Integer, nullable=False)
    nb_rdv_manques_nouveaux = Column(Integer, nullable=False)
    temps_presence_minutes = Column(Integer, nullable=False)
    temps_perdu_minutes = Column(Integer, nullable=False)


class StatutDevis(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACCEPTE = "ACCEPTE"
    REFUSE = "REFUSE"


class Devis(Base):
    __tablename__ = "devis"

    id_devis = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    id_patient = Column(String, index=True, nullable=False)
    montant = Column(Float, nullable=False)
    temps_previsionnel_minutes = Column(Integer, nullable=False)
    date_saisie = Column(Date, server_default=func.current_date(), nullable=False)
    date_emission = Column(Date, nullable=False, index=True)
    date_decision = Column(Date, index=True)
    date_relance_effectuee = Column(DateTime(timezone=True))
    statut = Column(Enum(StatutDevis), nullable=False, index=True)
    motif_refus = Column(String)


class StatutCheque(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    DEPOSE = "DEPOSE"


class Cheque(Base):
    __tablename__ = "cheques"

    id_cheque = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    id_patient = Column(String, nullable=False, index=True)
    montant = Column(Float, nullable=False)
    date_reception = Column(Date, nullable=False)
    date_depot_prevue = Column(Date)
    statut = Column(Enum(StatutCheque), default=StatutCheque.EN_ATTENTE)
    date_saisie = Column(Date, server_default=func.current_date(), nullable=False)


class PerformanceMensuelle(Base):
    __tablename__ = "performances_mensuelles"

    id_perf_mens = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    mois = Column(Integer, nullable=False, index=True)
    annee = Column(Integer, nullable=False, index=True)
    ca_declare = Column(Float, nullable=False)


class PeriodiciteCharge(str, enum.Enum):
    PONCTUEL = "PONCTUEL"
    MENSUEL = "MENSUEL"
    TRIMESTRIEL = "TRIMESTRIEL"
    ANNUEL = "ANNUEL"


class Charge(Base):
    __tablename__ = "charges"

    id_charge = Column(Integer, primary_key=True, autoincrement=True)
    id_praticien = Column(
        Integer, ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    designation = Column(String, nullable=False)
    montant = Column(Float, nullable=False)
    periodicite = Column(Enum(PeriodiciteCharge), nullable=False)
    date_debut = Column(Date, nullable=False, index=True)
    date_fin = Column(Date, index=True)
    lissage_mensuel = Column(Boolean, nullable=False, default=True)
