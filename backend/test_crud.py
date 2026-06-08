import pytest
from datetime import date, time, datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas, crud
from app.database import Base
from app.utils import check_pin

# Configuration de la base de données en mémoire pour les tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db():
    models.Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    # Initialisation de la config globale
    config = models.ConfigSysteme(
        id_config=1,
        password_global_hash="hash_initial",
        nom_cabinet="Cabinet Test",
        telephone_cabinet="0123456789",
        heure_execution_cron=time(20, 0),
    )
    session.add(config)
    session.commit()

    yield session

    session.close()
    models.Base.metadata.drop_all(bind=engine)


# --- TESTS CONFIG ---


def test_update_config(db):
    update_data = schemas.ConfigSystemeUpdate(
        nom_cabinet="Nouveau Nom", password_global_clair="SuperPassword"
    )
    config = crud.update_config(db, update_data)

    assert config is not None
    assert config.nom_cabinet == "Nouveau Nom"
    assert check_pin("SuperPassword", config.password_global_hash)


# --- TESTS PRATICIEN ---


def test_create_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="1234")
    praticien = crud.create_praticien(db, praticien_in)

    assert praticien.id_praticien is not None
    assert praticien.nom == "Dr. House"
    assert check_pin("1234", praticien.pin_hash)


def test_get_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="1234")
    cree = crud.create_praticien(db, praticien_in)

    recupere = crud.get_praticien(db, cree.id_praticien)
    assert recupere is not None
    assert recupere.nom == "Dr. House"


def test_update_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="1234")
    cree = crud.create_praticien(db, praticien_in)

    update_data = schemas.PraticienUpdate(nom="Dr. Gregory House", pin_clair="9999")
    mis_a_jour = crud.update_praticien(db, cree.id_praticien, update_data)

    assert mis_a_jour is not None
    assert mis_a_jour.nom == "Dr. Gregory House"
    assert check_pin("9999", mis_a_jour.pin_hash)


# --- TESTS PARAMETRES PRATICIEN ---


def test_parametres_praticien(db):
    # Setup
    p = crud.create_praticien(db, schemas.PraticienCreate(nom="Doc", pin_clair="0000"))

    # Create
    param_in = schemas.ParametresPraticienCreate(
        id_praticien=p.id_praticien,
        taux_horaire_cible=150.0,
        ca_mensuel_cible=10000.0,
        delai_relance_jours=10,
        seuil_devis_sms=100,
        seuil_devis_assistante=1000,
    )
    param = crud.create_parametres_praticien(db, param_in)
    assert param.taux_horaire_cible == 150.0

    # Get
    recupere = crud.get_parametres_praticien(db, p.id_praticien)
    assert recupere is not None
    assert recupere.ca_mensuel_cible == 10000.0

    # Update
    update_data = schemas.ParametresPraticienUpdate(taux_horaire_cible=200.0)
    mis_a_jour = crud.update_parametres_praticien(db, p.id_praticien, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.taux_horaire_cible == 200.0


# --- TESTS LOGS ---


def test_logs(db):
    log_in = schemas.LogCreate(
        type_action=models.TypeAction.SMS_ENVOYE, details="Test SMS"
    )
    log = crud.create_log(db, log_in)
    assert log.id_log is not None

    logs = crud.get_logs(db)
    assert len(logs) == 1
    assert logs[0].type_action == models.TypeAction.SMS_ENVOYE


# --- TESTS DEVIS ---


@pytest.fixture
def praticien(db):
    return crud.create_praticien(
        db, schemas.PraticienCreate(nom="Dr. D", pin_clair="1111")
    )


def test_create_devis(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)
    assert devis.montant == 500.0


def test_update_devis_success(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)

    update_data = schemas.DevisUpdate(statut=models.StatutDevis.ACCEPTE)
    mis_a_jour = crud.update_devis(db, devis.id_devis, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.statut == models.StatutDevis.ACCEPTE


def test_update_devis_fail_dates(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 5, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)

    update_data = schemas.DevisUpdate(date_decision=date(2023, 1, 1))
    with pytest.raises(ValueError, match="antérieure à la date d'émission"):
        crud.update_devis(db, devis.id_devis, update_data)


def test_update_devis_fail_motif_refus(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)

    update_data = schemas.DevisUpdate(statut=models.StatutDevis.REFUSE)
    with pytest.raises(ValueError, match="motif de refus est obligatoire"):
        crud.update_devis(db, devis.id_devis, update_data)


# --- TESTS CHEQUES ---


def test_cheques(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P2",
        montant=250.0,
        date_reception=date(2023, 1, 1),
    )
    cheque = crud.create_cheque(db, cheque_in)
    assert cheque.montant == 250.0

    update_data = schemas.ChequeUpdate(statut=models.StatutCheque.DEPOSE)
    mis_a_jour = crud.update_cheque(db, cheque.id_cheque, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.statut == models.StatutCheque.DEPOSE


# --- TESTS JOURNEES ---


def test_journees(db, praticien):
    journee_in = schemas.JourneeCreate(
        id_praticien=praticien.id_praticien,
        date_jour=date(2023, 1, 1),
        nb_patients_vus=10,
        nb_rdv_manques_connus=1,
        nb_rdv_manques_nouveaux=0,
        temps_presence_minutes=480,
        temps_perdu_minutes=30,
    )
    journee = crud.create_journee(db, journee_in)

    recupere = crud.get_journee(db, journee.id_journee)
    assert recupere is not None
    assert recupere.nb_patients_vus == 10

    update_data = schemas.JourneeUpdate(nb_patients_vus=12)
    mis_a_jour = crud.update_journee(db, journee.id_journee, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.nb_patients_vus == 12


# --- TESTS CHARGES ---


def test_create_charge(db, praticien):
    charge_in = schemas.ChargeCreate(
        id_praticien=praticien.id_praticien,
        designation="Loyer",
        montant=1000.0,
        periodicite=models.PeriodiciteCharge.MENSUEL,
        date_debut=date(2023, 1, 1),
    )
    charge = crud.create_charge(db, charge_in)
    assert charge.designation == "Loyer"


def test_update_charge_ponctuel_force_date_fin(db, praticien):
    charge_in = schemas.ChargeCreate(
        id_praticien=praticien.id_praticien,
        designation="Abo",
        montant=100.0,
        periodicite=models.PeriodiciteCharge.ANNUEL,
        date_debut=date(2023, 1, 1),
        date_fin=date(2024, 1, 1),
    )
    charge = crud.create_charge(db, charge_in)

    update_data = schemas.ChargeUpdate(periodicite=models.PeriodiciteCharge.PONCTUEL)
    mis_a_jour = crud.update_charge(db, charge.id_charge, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.date_fin is None


def test_update_charge_fail_dates(db, praticien):
    charge_in = schemas.ChargeCreate(
        id_praticien=praticien.id_praticien,
        designation="Abo",
        montant=100.0,
        periodicite=models.PeriodiciteCharge.ANNUEL,
        date_debut=date(2023, 5, 1),
    )
    charge = crud.create_charge(db, charge_in)

    update_data = schemas.ChargeUpdate(date_fin=date(2023, 1, 1))
    with pytest.raises(ValueError, match="strictement postérieure à la date de début"):
        crud.update_charge(db, charge.id_charge, update_data)


# --- TESTS PERFORMANCES ---


def test_performances(db, praticien):
    perf_in = schemas.PerformanceMensuelleCreate(
        id_praticien=praticien.id_praticien, mois=5, annee=2023, ca_declare=15000.0
    )
    perf = crud.create_performance(db, perf_in)
    assert perf.ca_declare == 15000.0

    update_data = schemas.PerformanceMensuelleUpdate(ca_declare=16000.0)
    mis_a_jour = crud.update_performance(db, perf.id_perf, update_data)
    assert mis_a_jour is not None
    assert mis_a_jour.ca_declare == 16000.0
