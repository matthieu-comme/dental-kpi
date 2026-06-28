# regles de validation Pydantic

from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date, time, datetime, timezone
from typing import Optional
from app.models import (
    PeriodiciteCharge,
    TypeAction,
    TypeEntite,
    StatutDevis,
    StatutCheque,
)

##### SCHEMAS CONFIG


class PraticienBase(BaseModel):
    nom: str
    est_actif: bool = True


class PraticienCreate(PraticienBase):
    pin_clair: str = Field(pattern=r"^\d{6}$")


class PraticienUpdate(BaseModel):
    nom: Optional[str] = None
    est_actif: Optional[bool] = None
    pin_clair: Optional[str] = Field(default=None, pattern=r"^\d{6}$")


class PraticienResponse(PraticienBase):
    id_praticien: int
    taux_horaire_cible: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class ConfigSystemeBase(BaseModel):
    cle_api_sms: Optional[str] = None
    nom_cabinet: str
    telephone_cabinet: str = Field(pattern=r"^0[1-9]\d{8}$")
    heure_execution_cron: time


class ConfigSystemeCreate(ConfigSystemeBase):
    password_global_clair: str = Field(max_length=70)


class ConfigSystemeUpdate(BaseModel):
    cle_api_sms: Optional[str] = None
    nom_cabinet: Optional[str] = None
    telephone_cabinet: Optional[str] = Field(default=None, pattern=r"^0[1-9]\d{8}$")
    heure_execution_cron: Optional[time] = None
    password_global_clair: Optional[str] = Field(default=None, max_length=70)


class ConfigSystemeResponse(ConfigSystemeBase):
    id_config: int

    model_config = ConfigDict(from_attributes=True)


class ParametresPraticienBase(BaseModel):
    taux_horaire_cible: float = Field(gt=0)
    ca_mensuel_cible: float = Field(gt=0)
    delai_relance_jours: int = Field(gt=0)
    seuil_devis_sms: float = Field(gt=0)
    seuil_devis_assistante: float = Field(gt=0)


class ParametresPraticienCreate(ParametresPraticienBase):
    id_praticien: int


class ParametresPraticienUpdate(BaseModel):
    taux_horaire_cible: Optional[float] = Field(default=None, gt=0)
    ca_mensuel_cible: Optional[float] = Field(default=None, gt=0)
    delai_relance_jours: Optional[int] = Field(default=None, gt=0)
    seuil_devis_sms: Optional[float] = Field(default=None, gt=0)
    seuil_devis_assistante: Optional[float] = Field(default=None, gt=0)


class ParametresPraticienResponse(ParametresPraticienBase):
    id_parametre: int
    id_praticien: int

    model_config = ConfigDict(from_attributes=True)


class LogBase(BaseModel):
    type_action: TypeAction
    details: str


class LogCreate(LogBase):
    type_entite: Optional[TypeEntite] = None
    id_entite: Optional[int] = None


class LogResponse(LogBase):
    id_log: int
    date_evenement: datetime
    type_entite: Optional[TypeEntite]
    id_entite: Optional[int]

    model_config = ConfigDict(from_attributes=True)


##### SCHEMAS METIER


class JourneeBase(BaseModel):
    date_jour: date = Field(gt=date(2020, 1, 1))
    nb_patients_vus: int = Field(ge=0)
    nb_nouveaux_patients: int = Field(ge=0)
    nb_rdv_manques_connus: int = Field(ge=0)
    nb_rdv_manques_nouveaux: int = Field(ge=0)
    temps_presence_minutes: int = Field(gt=0)
    temps_perdu_minutes: int = Field(ge=0)

    @model_validator(mode="after")
    def check_temps(self):
        if self.temps_perdu_minutes > self.temps_presence_minutes:
            raise ValueError(
                "Le temps perdu à cause des absences ne peut pas être supérieur au temps de présence total."
            )
        return self

    @model_validator(mode="after")
    def check_nb_patients(self):
        if self.nb_nouveaux_patients > self.nb_patients_vus:
            raise ValueError(
                "Le nombre de nouveaux patients ne peut pas être supérieur au nombre de patients vus."
            )
        return self


class JourneeCreate(JourneeBase):
    id_praticien: int


class JourneeUpdate(BaseModel):
    date_jour: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    nb_patients_vus: Optional[int] = Field(default=None, ge=0)
    nb_nouveaux_patients: Optional[int] = Field(default=None, ge=0)
    nb_rdv_manques_connus: Optional[int] = Field(default=None, ge=0)
    nb_rdv_manques_nouveaux: Optional[int] = Field(default=None, ge=0)
    temps_presence_minutes: Optional[int] = Field(default=None, gt=0)
    temps_perdu_minutes: Optional[int] = Field(default=None, ge=0)


class JourneeResponse(JourneeBase):
    id_journee: int
    id_praticien: int

    model_config = ConfigDict(from_attributes=True)


class DevisBase(BaseModel):
    id_patient: str
    montant: float = Field(gt=0)
    temps_previsionnel_minutes: int = Field(gt=0)
    date_emission: date = Field(gt=date(2020, 1, 1))
    date_decision: Optional[date] = Field(gt=date(2020, 1, 1), default=None)

    statut: StatutDevis
    motif_refus: Optional[str] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.date_decision is not None and self.date_decision < self.date_emission:
            raise ValueError(
                "La date de décision ne peut pas être antérieure à la date d'émission"
            )

        return self

    @model_validator(mode="after")
    def check_motif_refus(self):
        if self.statut == StatutDevis.REFUSE and not self.motif_refus:
            raise ValueError("Un motif de refus est obligatoire pour clore un devis.")
        if self.statut != StatutDevis.REFUSE and self.motif_refus:
            self.motif_refus = None
        return self


class DevisCreate(DevisBase):
    id_praticien: int


class DevisUpdate(BaseModel):
    id_patient: Optional[str] = None
    montant: Optional[float] = Field(gt=0, default=None)
    temps_previsionnel_minutes: Optional[int] = Field(gt=0, default=None)
    date_emission: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    date_decision: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    date_relance_effectuee: Optional[datetime] = Field(
        gt=datetime(2020, 1, 1, tzinfo=timezone.utc), default=None
    )
    statut: Optional[StatutDevis] = None
    motif_refus: Optional[str] = None


class DevisResponse(DevisBase):
    id_devis: int
    id_praticien: int
    date_saisie: date
    date_relance_effectuee: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ChequeBase(BaseModel):
    id_patient: str
    montant: float = Field(gt=0)
    date_reception: date = Field(gt=date(2020, 1, 1))
    date_depot_prevue: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    statut: StatutCheque = StatutCheque.EN_ATTENTE


class ChequeCreate(ChequeBase):
    id_praticien: int


class ChequeUpdate(BaseModel):
    id_patient: Optional[str] = None
    montant: Optional[float] = Field(gt=0, default=None)
    date_reception: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    date_depot_prevue: Optional[date] = Field(gt=date(2020, 1, 1), default=None)
    statut: Optional[StatutCheque] = None


class ChequeResponse(ChequeBase):
    id_cheque: int
    id_praticien: int
    date_saisie: date

    model_config = ConfigDict(from_attributes=True)


class PerformanceMensuelleBase(BaseModel):
    mois: int = Field(gt=0, lt=13)
    annee: int = Field(ge=2020)
    ca_declare: float = Field(ge=0)


class PerformanceMensuelleCreate(PerformanceMensuelleBase):
    id_praticien: int


class PerformanceMensuelleUpdate(BaseModel):
    mois: Optional[int] = Field(gt=0, lt=13, default=None)
    annee: Optional[int] = Field(ge=2020, default=None)
    ca_declare: Optional[float] = Field(ge=0, default=None)


class PerformanceMensuelleResponse(PerformanceMensuelleBase):
    id_perf: int
    id_praticien: int

    model_config = ConfigDict(from_attributes=True)


class ChargeBase(BaseModel):
    designation: str
    montant: float = Field(gt=0)
    periodicite: PeriodiciteCharge
    date_debut: date = Field(ge=date(2020, 1, 1))
    date_fin: Optional[date] = None
    lissage_mensuel: bool = True

    @model_validator(mode="after")
    def check_dates(self):
        if self.periodicite == PeriodiciteCharge.PONCTUEL:
            self.date_fin = None
        elif self.date_fin is not None:
            if self.date_fin <= self.date_debut:
                raise ValueError(
                    "La date de fin doit être strictement postérieure à la date de début"
                )

        return self


class ChargeCreate(ChargeBase):
    id_praticien: int


class ChargeUpdate(BaseModel):
    designation: Optional[str] = None
    montant: Optional[float] = Field(default=None, gt=0)
    periodicite: Optional[PeriodiciteCharge] = None
    date_debut: Optional[date] = Field(default=None, ge=date(2020, 1, 1))
    date_fin: Optional[date] = None
    lissage_mensuel: Optional[bool] = None


class ChargeResponse(ChargeBase):
    id_charge: int
    id_praticien: int

    model_config = ConfigDict(from_attributes=True)
