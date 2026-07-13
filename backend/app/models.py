# structure des tables dans la bdd
import enum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date, datetime, time
from typing import Optional
from sqlalchemy import (
    ForeignKey,
    DateTime,
    CheckConstraint,
    UniqueConstraint,
)
from sqlalchemy.sql import func
from app.database import Base

# TABLES DE CONFIG


class Praticien(Base):
    __tablename__ = "praticiens"

    id_praticien: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nom: Mapped[str] = mapped_column(nullable=False)
    est_actif: Mapped[bool] = mapped_column(default=True)
    pin_hash: Mapped[str] = mapped_column(nullable=False)


class ConfigSysteme(Base):
    __tablename__ = "config_systeme"
    __table_args__ = (CheckConstraint("id_config = 1", name="check_single_config"),)

    id_config: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    password_global_hash: Mapped[str] = mapped_column(nullable=False)
    cle_api_sms: Mapped[Optional[str]] = mapped_column()
    nom_cabinet: Mapped[str] = mapped_column(nullable=False)
    telephone_cabinet: Mapped[str] = mapped_column(nullable=False)
    heure_execution_cron: Mapped[time] = mapped_column(nullable=False)


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
    SUPPR_JOURNEE = "SUPPR_JOURNEE"


class ParametresPraticien(Base):
    __tablename__ = "parametres_praticien"

    id_parametre: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), unique=True, nullable=False
    )
    taux_horaire_cible: Mapped[float] = mapped_column(nullable=False)
    ca_mensuel_cible: Mapped[float] = mapped_column(nullable=False)
    delai_relance_jours: Mapped[int] = mapped_column(
        nullable=False, server_default="15"
    )
    seuil_devis_sms: Mapped[float] = mapped_column(nullable=False, server_default="500")
    seuil_devis_assistante: Mapped[float] = mapped_column(
        nullable=False, server_default="1500"
    )


class TypeEntite(str, enum.Enum):
    DEVIS = "DEVIS"
    CHEQUE = "CHEQUE"
    JOURNEE = "JOURNEE"


class Log(Base):
    __tablename__ = "logs"

    id_log: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date_evenement: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    type_action: Mapped[TypeAction] = mapped_column(nullable=False, index=True)
    type_entite: Mapped[Optional[TypeEntite]] = mapped_column(index=True)
    id_entite: Mapped[Optional[int]] = mapped_column(index=True)
    details: Mapped[str] = mapped_column(nullable=False)


# TABLES METIER


class Journee(Base):
    __tablename__ = "journees"

    __table_args__ = (
        UniqueConstraint("id_praticien", "date_jour", name="uq_praticien_date"),
    )

    id_journee: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    date_jour: Mapped[date] = mapped_column(index=True, nullable=False)
    nb_patients_vus: Mapped[int] = mapped_column(nullable=False)
    nb_nouveaux_patients: Mapped[int] = mapped_column(nullable=False)
    nb_rdv_manques_connus: Mapped[int] = mapped_column(nullable=False)
    nb_rdv_manques_nouveaux: Mapped[int] = mapped_column(nullable=False)
    temps_presence_minutes: Mapped[int] = mapped_column(nullable=False)
    temps_perdu_minutes: Mapped[int] = mapped_column(nullable=False)


class StatutDevis(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACCEPTE = "ACCEPTE"
    REFUSE = "REFUSE"


class Devis(Base):
    __tablename__ = "devis"

    id_devis: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    id_patient: Mapped[str] = mapped_column(index=True, nullable=False)
    montant: Mapped[float] = mapped_column(nullable=False)
    temps_previsionnel_minutes: Mapped[int] = mapped_column(nullable=False)
    date_saisie: Mapped[date] = mapped_column(
        server_default=func.current_date(), nullable=False
    )
    date_emission: Mapped[date] = mapped_column(nullable=False, index=True)
    date_decision: Mapped[Optional[date]] = mapped_column(index=True)
    date_relance_effectuee: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    statut: Mapped[StatutDevis] = mapped_column(nullable=False, index=True)
    motif_refus: Mapped[Optional[str]] = mapped_column()


class StatutCheque(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    DEPOSE = "DEPOSE"


class Cheque(Base):
    __tablename__ = "cheques"

    id_cheque: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    id_patient: Mapped[str] = mapped_column(nullable=False, index=True)
    montant: Mapped[float] = mapped_column(nullable=False)
    date_reception: Mapped[date] = mapped_column(nullable=False)
    date_depot_prevue: Mapped[Optional[date]] = mapped_column()
    statut: Mapped[StatutCheque] = mapped_column(default=StatutCheque.EN_ATTENTE)
    date_saisie: Mapped[date] = mapped_column(
        server_default=func.current_date(), nullable=False
    )


class PerformanceMensuelle(Base):
    __tablename__ = "performances_mensuelles"

    id_perf: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    mois: Mapped[int] = mapped_column(nullable=False, index=True)
    annee: Mapped[int] = mapped_column(nullable=False, index=True)
    ca_declare: Mapped[float] = mapped_column(nullable=False)


class PeriodiciteCharge(str, enum.Enum):
    PONCTUEL = "PONCTUEL"
    MENSUEL = "MENSUEL"
    TRIMESTRIEL = "TRIMESTRIEL"
    ANNUEL = "ANNUEL"


class Charge(Base):
    __tablename__ = "charges"

    id_charge: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_praticien: Mapped[int] = mapped_column(
        ForeignKey("praticiens.id_praticien"), nullable=False, index=True
    )
    designation: Mapped[str] = mapped_column(nullable=False)
    montant: Mapped[float] = mapped_column(nullable=False)
    periodicite: Mapped[PeriodiciteCharge] = mapped_column(nullable=False)
    date_debut: Mapped[date] = mapped_column(index=True, nullable=False)
    date_fin: Mapped[Optional[date]] = mapped_column(index=True)
    lissage_mensuel: Mapped[bool] = mapped_column(nullable=False, default=True)


class RoleUser(str, enum.Enum):
    SECRETAIRE = "secretaire"
    PRATICIEN = "praticien"
