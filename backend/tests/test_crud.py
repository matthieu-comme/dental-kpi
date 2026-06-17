import pytest
from datetime import date, time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas, crud
from app.utils import check_pin

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


def test_create_config_already_exists(db):
    config_in = schemas.ConfigSystemeCreate(
        nom_cabinet="Doublon",
        telephone_cabinet="0100000000",
        heure_execution_cron=time(9, 0),
        password_global_clair="testpass",
    )
    with pytest.raises(ValueError):
        crud.create_config(db, config_in)


def test_update_config_not_found(db):
    db.query(models.ConfigSysteme).delete()
    db.commit()
    result = crud.update_config(db, schemas.ConfigSystemeUpdate(nom_cabinet="X"))
    assert result is None


# --- TESTS PRATICIEN ---


def test_create_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="123456")
    praticien = crud.create_praticien(db, praticien_in)

    assert praticien.id_praticien is not None
    assert praticien.nom == "Dr. House"
    assert check_pin("123456", praticien.pin_hash)


def test_get_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="123456")
    cree = crud.create_praticien(db, praticien_in)

    recupere = crud.get_praticien(db, cree.id_praticien)
    assert recupere is not None
    assert recupere.nom == "Dr. House"


def test_get_praticien_not_found(db):
    assert crud.get_praticien(db, 9999) is None


def test_update_praticien(db):
    praticien_in = schemas.PraticienCreate(nom="Dr. House", pin_clair="123456")
    cree = crud.create_praticien(db, praticien_in)

    update_data = schemas.PraticienUpdate(nom="Dr. Gregory House", pin_clair="999999")
    updated = crud.update_praticien(db, cree.id_praticien, update_data)

    assert updated is not None
    assert updated.nom == "Dr. Gregory House"
    assert check_pin("999999", updated.pin_hash)


def test_update_praticien_not_found(db):
    result = crud.update_praticien(db, 9999, schemas.PraticienUpdate(nom="Inconnu"))
    assert result is None


def test_update_praticien_preserves_pin(db):
    praticien = crud.create_praticien(
        db, schemas.PraticienCreate(nom="Dr. A", pin_clair="111111")
    )
    original_hash = praticien.pin_hash

    updated = crud.update_praticien(
        db, praticien.id_praticien, schemas.PraticienUpdate(nom="Dr. B")
    )
    assert updated is not None
    assert updated.nom == "Dr. B"
    assert updated.pin_hash == original_hash


# --- TESTS PARAMETRES PRATICIEN ---


def test_parametres_praticien(db):
    # create_praticien crée automatiquement des paramètres par défaut
    p = crud.create_praticien(
        db, schemas.PraticienCreate(nom="Doc", pin_clair="000000")
    )

    recupere = crud.get_parametres_praticien(db, p.id_praticien)
    assert recupere is not None
    assert recupere.taux_horaire_cible == 300.0

    update_data = schemas.ParametresPraticienUpdate(taux_horaire_cible=200.0)
    updated = crud.update_parametres_praticien(db, p.id_praticien, update_data)
    assert updated is not None
    assert updated.taux_horaire_cible == 200.0


def test_get_parametres_praticien_not_found(db):
    assert crud.get_parametres_praticien(db, 9999) is None


def test_update_parametres_praticien_not_found(db):
    result = crud.update_parametres_praticien(
        db, 9999, schemas.ParametresPraticienUpdate(taux_horaire_cible=100.0)
    )
    assert result is None


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


def test_get_logs_pagination(db):
    for i in range(5):
        crud.create_log(
            db,
            schemas.LogCreate(
                type_action=models.TypeAction.SMS_ENVOYE, details=f"Log {i}"
            ),
        )

    page1 = crud.get_logs(db, skip=0, limit=3)
    assert len(page1) == 3

    page2 = crud.get_logs(db, skip=3, limit=3)
    assert len(page2) == 2


# --- TESTS DEVIS ---


@pytest.fixture
def praticien(db):
    return crud.create_praticien(
        db, schemas.PraticienCreate(nom="Dr. D", pin_clair="111111")
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


def test_create_devis_creates_log(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    crud.create_devis(db, devis_in)
    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.AJOUT_DEVIS for log in logs)


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
    updated = crud.update_devis(db, devis.id_devis, update_data)
    assert updated is not None
    assert updated.statut == models.StatutDevis.ACCEPTE


def test_update_devis_not_found(db):
    result = crud.update_devis(
        db, 9999, schemas.DevisUpdate(statut=models.StatutDevis.ACCEPTE)
    )
    assert result is None


def test_update_devis_clears_motif_refus(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)

    crud.update_devis(
        db,
        devis.id_devis,
        schemas.DevisUpdate(
            statut=models.StatutDevis.REFUSE, motif_refus="Patient absent"
        ),
    )

    updated = crud.update_devis(
        db, devis.id_devis, schemas.DevisUpdate(statut=models.StatutDevis.ACCEPTE)
    )
    assert updated is not None
    assert updated.motif_refus is None


def test_update_devis_creates_log(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)
    crud.update_devis(
        db, devis.id_devis, schemas.DevisUpdate(statut=models.StatutDevis.ACCEPTE)
    )

    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.MODIF_DEVIS for log in logs)


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


def test_delete_devis(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)

    supprime = crud.delete_devis(db, devis.id_devis)
    assert supprime is not None
    assert (
        db.query(models.Devis).filter(models.Devis.id_devis == devis.id_devis).first()
        is None
    )


def test_delete_devis_not_found(db):
    assert crud.delete_devis(db, 9999) is None


def test_delete_devis_creates_log(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P1",
        montant=500.0,
        temps_previsionnel_minutes=30,
        date_emission=date(2023, 1, 1),
        statut=models.StatutDevis.EN_ATTENTE,
    )
    devis = crud.create_devis(db, devis_in)
    crud.delete_devis(db, devis.id_devis)

    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.SUPPR_DEVIS for log in logs)


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
    updated = crud.update_cheque(db, cheque.id_cheque, update_data)
    assert updated is not None
    assert updated.statut == models.StatutCheque.DEPOSE


def test_create_cheque_creates_log(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P2",
        montant=250.0,
        date_reception=date(2023, 1, 1),
    )
    crud.create_cheque(db, cheque_in)
    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.AJOUT_CHEQUE for log in logs)


def test_update_cheque_not_found(db):
    result = crud.update_cheque(
        db, 9999, schemas.ChequeUpdate(statut=models.StatutCheque.DEPOSE)
    )
    assert result is None


def test_update_cheque_creates_log(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P2",
        montant=250.0,
        date_reception=date(2023, 1, 1),
    )
    cheque = crud.create_cheque(db, cheque_in)
    crud.update_cheque(
        db, cheque.id_cheque, schemas.ChequeUpdate(statut=models.StatutCheque.DEPOSE)
    )

    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.MODIF_CHEQUE for log in logs)


def test_delete_cheque(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P2",
        montant=250.0,
        date_reception=date(2023, 1, 1),
    )
    cheque = crud.create_cheque(db, cheque_in)

    supprime = crud.delete_cheque(db, cheque.id_cheque)
    assert supprime is not None
    assert (
        db.query(models.Cheque)
        .filter(models.Cheque.id_cheque == cheque.id_cheque)
        .first()
        is None
    )


def test_delete_cheque_not_found(db):
    assert crud.delete_cheque(db, 9999) is None


def test_delete_cheque_creates_log(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P2",
        montant=250.0,
        date_reception=date(2023, 1, 1),
    )
    cheque = crud.create_cheque(db, cheque_in)
    crud.delete_cheque(db, cheque.id_cheque)

    logs = crud.get_logs(db)
    assert any(log.type_action == models.TypeAction.SUPPR_CHEQUE for log in logs)


# --- TESTS JOURNEES ---


def test_journees(db, praticien):
    journee_in = schemas.JourneeCreate(
        id_praticien=praticien.id_praticien,
        date_jour=date(2023, 1, 1),
        nb_patients_vus=10,
        nb_nouveaux_patients=0,
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
    updated = crud.update_journee(db, journee.id_journee, update_data)
    assert updated is not None
    assert updated.nb_patients_vus == 12


def test_update_journee_not_found(db):
    result = crud.update_journee(db, 9999, schemas.JourneeUpdate(nb_patients_vus=5))
    assert result is None


def test_update_journee_fail_temps_perdu(db, praticien):
    journee_in = schemas.JourneeCreate(
        id_praticien=praticien.id_praticien,
        date_jour=date(2023, 1, 2),
        nb_patients_vus=10,
        nb_nouveaux_patients=0,
        nb_rdv_manques_connus=0,
        nb_rdv_manques_nouveaux=0,
        temps_presence_minutes=480,
        temps_perdu_minutes=30,
    )
    journee = crud.create_journee(db, journee_in)

    with pytest.raises(ValueError, match="temps perdu"):
        crud.update_journee(
            db, journee.id_journee, schemas.JourneeUpdate(temps_perdu_minutes=500)
        )


def test_update_journee_fail_nouveaux_patients(db, praticien):
    journee_in = schemas.JourneeCreate(
        id_praticien=praticien.id_praticien,
        date_jour=date(2023, 1, 3),
        nb_patients_vus=5,
        nb_nouveaux_patients=0,
        nb_rdv_manques_connus=0,
        nb_rdv_manques_nouveaux=0,
        temps_presence_minutes=480,
        temps_perdu_minutes=30,
    )
    journee = crud.create_journee(db, journee_in)

    with pytest.raises(ValueError, match="nouveaux patients"):
        crud.update_journee(
            db, journee.id_journee, schemas.JourneeUpdate(nb_nouveaux_patients=10)
        )


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
    updated = crud.update_charge(db, charge.id_charge, update_data)
    assert updated is not None
    assert updated.date_fin is None


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


def test_update_charge_not_found(db):
    result = crud.update_charge(db, 9999, schemas.ChargeUpdate(montant=100.0))
    assert result is None


# --- TESTS PERFORMANCES ---


def test_performances(db, praticien):
    perf_in = schemas.PerformanceMensuelleCreate(
        id_praticien=praticien.id_praticien, mois=5, annee=2023, ca_declare=15000.0
    )
    perf = crud.create_performance(db, perf_in)
    assert perf.ca_declare == 15000.0

    update_data = schemas.PerformanceMensuelleUpdate(ca_declare=16000.0)
    updated = crud.update_performance(db, perf.id_perf, update_data)
    assert updated is not None
    assert updated.ca_declare == 16000.0


def test_update_performance_not_found(db):
    result = crud.update_performance(
        db, 9999, schemas.PerformanceMensuelleUpdate(ca_declare=1000.0)
    )
    assert result is None


# --- TESTS SUPPLEMENTAIRES ---


def test_get_config(db):
    config = crud.get_config(db)
    assert config is not None
    assert config.id_config == 1
    assert config.nom_cabinet == "Cabinet Test"


def test_get_config_not_found(db):
    db.query(models.ConfigSysteme).delete()
    db.commit()
    assert crud.get_config(db) is None


def test_get_logs_ordering(db):
    # Les logs doivent être retournés du plus récent au plus ancien
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    for i in range(3):
        log = models.Log(
            type_action=models.TypeAction.SMS_ENVOYE,
            details=f"Log {i}",
            date_evenement=now + timedelta(seconds=i),
        )
        db.add(log)
    db.commit()

    logs = crud.get_logs(db)
    dates = [log.date_evenement for log in logs]
    assert dates == sorted(dates, reverse=True)


def test_create_praticien_auto_creates_parametres(db):
    praticien = crud.create_praticien(
        db, schemas.PraticienCreate(nom="Dr. Auto", pin_clair="202020")
    )
    params = crud.get_parametres_praticien(db, praticien.id_praticien)
    assert params is not None
    assert params.taux_horaire_cible == 300.0
    assert params.ca_mensuel_cible == 20000.0


def test_update_praticien_est_actif(db):
    praticien = crud.create_praticien(
        db, schemas.PraticienCreate(nom="Dr. Actif", pin_clair="303030")
    )
    assert praticien.est_actif is True

    desactive = crud.update_praticien(
        db, praticien.id_praticien, schemas.PraticienUpdate(est_actif=False)
    )
    assert desactive is not None
    assert desactive.est_actif is False

    reactive = crud.update_praticien(
        db, praticien.id_praticien, schemas.PraticienUpdate(est_actif=True)
    )
    assert reactive is not None
    assert reactive.est_actif is True


def test_create_devis_with_refuse(db, praticien):
    devis_in = schemas.DevisCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P_REFUSE",
        montant=800.0,
        temps_previsionnel_minutes=60,
        date_emission=date(2023, 3, 1),
        statut=models.StatutDevis.REFUSE,
        motif_refus="Trop cher",
    )
    devis = crud.create_devis(db, devis_in)
    assert devis.statut == models.StatutDevis.REFUSE
    assert devis.motif_refus == "Trop cher"


def test_create_cheque_with_date_depot(db, praticien):
    cheque_in = schemas.ChequeCreate(
        id_praticien=praticien.id_praticien,
        id_patient="P3",
        montant=400.0,
        date_reception=date(2023, 2, 1),
        date_depot_prevue=date(2023, 2, 15),
    )
    cheque = crud.create_cheque(db, cheque_in)
    assert cheque.date_depot_prevue == date(2023, 2, 15)


def test_create_charge_with_date_fin(db, praticien):
    charge_in = schemas.ChargeCreate(
        id_praticien=praticien.id_praticien,
        designation="Crédit matériel",
        montant=500.0,
        periodicite=models.PeriodiciteCharge.MENSUEL,
        date_debut=date(2023, 1, 1),
        date_fin=date(2025, 1, 1),
    )
    charge = crud.create_charge(db, charge_in)
    assert charge.date_fin == date(2025, 1, 1)
