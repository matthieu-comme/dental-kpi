import pytest
from app import models
from app.routers.auth import create_access_token
from tests.conftest import client, TestingSessionLocal, SEC_PASSWORD, PRAT_PIN, SEC_USERNAME


# --- helpers payload ---

def _devis_payload(praticien_id):
    return {
        "id_praticien": praticien_id,
        "id_patient": "P_TEST",
        "montant": 500.0,
        "temps_previsionnel_minutes": 30,
        "date_emission": "2023-01-01",
        "statut": "EN_ATTENTE",
    }


def _cheque_payload(praticien_id):
    return {
        "id_praticien": praticien_id,
        "id_patient": "P_TEST",
        "montant": 250.0,
        "date_reception": "2023-01-01",
    }


def _journee_payload(praticien_id):
    return {
        "id_praticien": praticien_id,
        "date_jour": "2023-01-01",
        "nb_patients_vus": 10,
        "nb_nouveaux_patients": 2,
        "nb_rdv_manques_connus": 1,
        "nb_rdv_manques_nouveaux": 0,
        "temps_presence_minutes": 480,
        "temps_perdu_minutes": 30,
    }


def _charge_payload(praticien_id):
    return {
        "id_praticien": praticien_id,
        "designation": "Loyer",
        "montant": 1000.0,
        "periodicite": "MENSUEL",
        "date_debut": "2023-01-01",
    }


# ============================================================
# AUTH
# ============================================================


def test_status():
    r = client.get("/api/v1/status")
    assert r.status_code == 200


def test_login_secretaire():
    r = client.post("/api/v1/auth/token", data={
        "username": SEC_USERNAME, "password": SEC_PASSWORD,
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password():
    r = client.post("/api/v1/auth/token", data={
        "username": SEC_USERNAME, "password": "mauvais",
    })
    assert r.status_code == 401


def test_login_praticien(praticien_id):
    r = client.post("/api/v1/auth/token", data={
        "username": str(praticien_id), "password": PRAT_PIN,
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_praticien_wrong_pin(praticien_id):
    r = client.post("/api/v1/auth/token", data={
        "username": str(praticien_id), "password": "000000",
    })
    assert r.status_code == 401


def test_protected_route_without_token():
    r = client.get("/api/v1/devis/")
    assert r.status_code == 401


def test_protected_route_invalid_token():
    r = client.get("/api/v1/devis/", headers={"Authorization": "Bearer tokenbidon"})
    assert r.status_code == 401


# ============================================================
# SYSTÈME
# ============================================================


def test_get_config():
    r = client.get("/api/v1/systeme/config")
    assert r.status_code == 200
    assert r.json()["nom_cabinet"] == "Cabinet Test"


def test_update_config(sec_headers):
    r = client.put("/api/v1/systeme/config", json={"nom_cabinet": "Nouveau Cabinet"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["nom_cabinet"] == "Nouveau Cabinet"


def test_update_config_no_auth():
    r = client.put("/api/v1/systeme/config", json={"nom_cabinet": "Hack"})
    assert r.status_code == 401


def test_update_config_praticien_forbidden(prat_headers):
    r = client.put("/api/v1/systeme/config", json={"nom_cabinet": "Hack"}, headers=prat_headers)
    assert r.status_code == 403


def test_get_logs(sec_headers):
    r = client.get("/api/v1/systeme/logs", headers=sec_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_logs_no_auth():
    r = client.get("/api/v1/systeme/logs")
    assert r.status_code == 401


def test_get_logs_praticien_forbidden(prat_headers):
    r = client.get("/api/v1/systeme/logs", headers=prat_headers)
    assert r.status_code == 403


def test_create_log(sec_headers):
    r = client.post("/api/v1/systeme/logs", json={"type_action": "AJOUT_DEVIS", "details": "test"}, headers=sec_headers)
    assert r.status_code == 201


def test_create_log_no_auth():
    r = client.post("/api/v1/systeme/logs", json={"type_action": "AJOUT_DEVIS", "details": "test"})
    assert r.status_code == 401


def test_create_log_praticien_forbidden(prat_headers):
    r = client.post("/api/v1/systeme/logs", json={"type_action": "AJOUT_DEVIS", "details": "test"}, headers=prat_headers)
    assert r.status_code == 403


# ============================================================
# PRATICIENS
# ============================================================


def test_create_praticien():
    r = client.post("/api/v1/praticiens/", json={"nom": "Dr. Nouveau", "pin_clair": "222222"})
    assert r.status_code == 200
    data = r.json()
    assert data["nom"] == "Dr. Nouveau"
    assert "pin_hash" not in data


def test_create_praticien_invalid_pin():
    r = client.post("/api/v1/praticiens/", json={"nom": "Dr. Invalide", "pin_clair": "123"})
    assert r.status_code == 422


def test_read_praticiens():
    r = client.get("/api/v1/praticiens/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_read_praticien_as_secretaire(praticien_id, sec_headers):
    r = client.get(f"/api/v1/praticiens/{praticien_id}", headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["id_praticien"] == praticien_id


def test_read_praticien_not_found(sec_headers):
    r = client.get("/api/v1/praticiens/9999", headers=sec_headers)
    assert r.status_code == 404


def test_update_praticien(praticien_id, sec_headers):
    r = client.put(f"/api/v1/praticiens/{praticien_id}", json={"nom": "Dr. Modifié"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["nom"] == "Dr. Modifié"


def test_praticien_cannot_access_other_praticien(praticien_id):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "333333"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    token = create_access_token({"sub": str(praticien_id), "role": "praticien"})
    r = client.get(f"/api/v1/praticiens/{autre_id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_read_parametres_praticien(prat_headers, praticien_id):
    r = client.get(f"/api/v1/praticiens/{praticien_id}/parametres", headers=prat_headers)
    assert r.status_code == 200
    assert r.json()["taux_horaire_cible"] == 300.0


def test_read_parametres_secretaire_forbidden(sec_headers, praticien_id):
    r = client.get(f"/api/v1/praticiens/{praticien_id}/parametres", headers=sec_headers)
    assert r.status_code == 403


def test_update_parametres_praticien(prat_headers, praticien_id):
    r = client.put(f"/api/v1/praticiens/{praticien_id}/parametres",
                   json={"taux_horaire_cible": 400.0}, headers=prat_headers)
    assert r.status_code == 200
    assert r.json()["taux_horaire_cible"] == 400.0


def test_update_parametres_secretaire_forbidden(sec_headers, praticien_id):
    r = client.put(f"/api/v1/praticiens/{praticien_id}/parametres",
                   json={"taux_horaire_cible": 400.0}, headers=sec_headers)
    assert r.status_code == 403


# ============================================================
# DEVIS
# ============================================================


def test_create_devis_secretaire(sec_headers, praticien_id):
    r = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    assert r.status_code == 201
    assert r.json()["montant"] == 500.0


def test_create_devis_praticien(prat_headers, praticien_id):
    r = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=prat_headers)
    assert r.status_code == 201


def test_create_devis_invalid_payload(sec_headers, praticien_id):
    payload = _devis_payload(praticien_id)
    payload["montant"] = -10
    r = client.post("/api/v1/devis/", json=payload, headers=sec_headers)
    assert r.status_code == 422


def test_read_deviss(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    r = client.get("/api/v1/devis/", headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_read_devis(sec_headers, praticien_id):
    created = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers).json()
    r = client.get(f"/api/v1/devis/{created['id_devis']}", headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["id_devis"] == created["id_devis"]


def test_read_devis_not_found(sec_headers):
    r = client.get("/api/v1/devis/9999", headers=sec_headers)
    assert r.status_code == 404


def test_update_devis(sec_headers, praticien_id):
    created = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers).json()
    r = client.put(f"/api/v1/devis/{created['id_devis']}", json={"statut": "ACCEPTE"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["statut"] == "ACCEPTE"


def test_update_devis_not_found(sec_headers):
    r = client.put("/api/v1/devis/9999", json={"statut": "ACCEPTE"}, headers=sec_headers)
    assert r.status_code == 404


def test_update_devis_business_rule(sec_headers, praticien_id):
    created = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers).json()
    r = client.put(f"/api/v1/devis/{created['id_devis']}", json={"statut": "REFUSE"}, headers=sec_headers)
    assert r.status_code == 400


def test_delete_devis(sec_headers, praticien_id):
    created = client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers).json()
    r = client.delete(f"/api/v1/devis/{created['id_devis']}", headers=sec_headers)
    assert r.status_code == 204


def test_delete_devis_not_found(sec_headers):
    r = client.delete("/api/v1/devis/9999", headers=sec_headers)
    assert r.status_code == 404


def test_praticien_cannot_access_other_devis(praticien_id, sec_headers):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "444444"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    devis = client.post("/api/v1/devis/", json=_devis_payload(autre_id), headers=sec_headers).json()

    token = create_access_token({"sub": str(praticien_id), "role": "praticien"})
    r = client.get(f"/api/v1/devis/{devis['id_devis']}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ============================================================
# CHÈQUES
# ============================================================


def test_create_cheque(sec_headers, praticien_id):
    r = client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    assert r.status_code == 201
    assert r.json()["montant"] == 250.0


def test_read_cheques(sec_headers, praticien_id):
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    r = client.get("/api/v1/cheques/", headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_read_cheque(sec_headers, praticien_id):
    created = client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers).json()
    r = client.get(f"/api/v1/cheques/{created['id_cheque']}", headers=sec_headers)
    assert r.status_code == 200


def test_read_cheque_not_found(sec_headers):
    r = client.get("/api/v1/cheques/9999", headers=sec_headers)
    assert r.status_code == 404


def test_update_cheque(sec_headers, praticien_id):
    created = client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers).json()
    r = client.put(f"/api/v1/cheques/{created['id_cheque']}", json={"statut": "DEPOSE"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["statut"] == "DEPOSE"


def test_delete_cheque(sec_headers, praticien_id):
    created = client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers).json()
    r = client.delete(f"/api/v1/cheques/{created['id_cheque']}", headers=sec_headers)
    assert r.status_code == 204


def test_delete_cheque_not_found(sec_headers):
    r = client.delete("/api/v1/cheques/9999", headers=sec_headers)
    assert r.status_code == 404


def test_praticien_cannot_access_other_cheque(praticien_id, sec_headers):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "555555"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    cheque = client.post("/api/v1/cheques/", json=_cheque_payload(autre_id), headers=sec_headers).json()
    token = create_access_token({"sub": str(praticien_id), "role": "praticien"})
    r = client.get(f"/api/v1/cheques/{cheque['id_cheque']}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ============================================================
# JOURNÉES
# ============================================================


def test_create_journee(praticien_id):
    r = client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    assert r.status_code == 201
    assert r.json()["nb_patients_vus"] == 10


def test_create_journee_duplicate(praticien_id):
    client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    r = client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    assert r.status_code == 409


def test_create_journee_praticien_inexistant():
    r = client.post("/api/v1/journees/", json=_journee_payload(9999))
    assert r.status_code == 400


def test_read_journees(sec_headers, praticien_id):
    client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    r = client.get("/api/v1/journees/", headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_read_journee(sec_headers, praticien_id):
    created = client.post("/api/v1/journees/", json=_journee_payload(praticien_id)).json()
    r = client.get(f"/api/v1/journees/{created['id_journee']}", headers=sec_headers)
    assert r.status_code == 200


def test_read_journee_not_found(sec_headers):
    r = client.get("/api/v1/journees/9999", headers=sec_headers)
    assert r.status_code == 404


def test_update_journee(sec_headers, praticien_id):
    created = client.post("/api/v1/journees/", json=_journee_payload(praticien_id)).json()
    r = client.put(f"/api/v1/journees/{created['id_journee']}",
                   json={"nb_patients_vus": 15}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json()["nb_patients_vus"] == 15


# ============================================================
# CHARGES
# ============================================================


def test_create_charge_praticien(prat_headers, praticien_id):
    r = client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    assert r.status_code == 201
    assert r.json()["designation"] == "Loyer"


def test_create_charge_secretaire_forbidden(sec_headers, praticien_id):
    r = client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=sec_headers)
    assert r.status_code == 403


def test_read_charges(prat_headers, praticien_id):
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    r = client.get("/api/v1/charges/", headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_read_charge_not_found(prat_headers):
    r = client.get("/api/v1/charges/9999", headers=prat_headers)
    assert r.status_code == 404


def test_update_charge(prat_headers, praticien_id):
    created = client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers).json()
    r = client.put(f"/api/v1/charges/{created['id_charge']}", json={"montant": 1200.0}, headers=prat_headers)
    assert r.status_code == 200
    assert r.json()["montant"] == 1200.0


def test_update_charge_not_found(prat_headers):
    r = client.put("/api/v1/charges/9999", json={"montant": 100.0}, headers=prat_headers)
    assert r.status_code == 404


def test_update_charge_business_rule(prat_headers, praticien_id):
    payload = _charge_payload(praticien_id)
    payload["periodicite"] = "ANNUEL"
    payload["date_debut"] = "2023-05-01"
    created = client.post("/api/v1/charges/", json=payload, headers=prat_headers).json()
    r = client.put(f"/api/v1/charges/{created['id_charge']}",
                   json={"date_fin": "2022-01-01"}, headers=prat_headers)
    assert r.status_code == 400


def test_delete_charge(prat_headers, praticien_id):
    created = client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers).json()
    r = client.delete(f"/api/v1/charges/{created['id_charge']}", headers=prat_headers)
    assert r.status_code == 204
    r2 = client.get(f"/api/v1/charges/{created['id_charge']}", headers=prat_headers)
    assert r2.status_code == 404


def test_delete_charge_not_found(prat_headers):
    r = client.delete("/api/v1/charges/9999", headers=prat_headers)
    assert r.status_code == 404


def test_delete_charge_secretaire_forbidden(sec_headers, prat_headers, praticien_id):
    created = client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers).json()
    r = client.delete(f"/api/v1/charges/{created['id_charge']}", headers=sec_headers)
    assert r.status_code == 403


# ============================================================
# PERFORMANCES
# ============================================================


def test_create_performance(prat_headers):
    r = client.post("/api/v1/performances/", json={
        "id_praticien": 1, "mois": 5, "annee": 2023, "ca_declare": 15000.0,
    }, headers=prat_headers)
    assert r.status_code == 201
    assert r.json()["ca_declare"] == 15000.0


def test_read_performances(prat_headers):
    r = client.get("/api/v1/performances/", headers=prat_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_read_performance(prat_headers):
    created = client.post("/api/v1/performances/", json={
        "id_praticien": 1, "mois": 6, "annee": 2023, "ca_declare": 12000.0,
    }, headers=prat_headers).json()
    r = client.get(f"/api/v1/performances/{created['id_perf']}", headers=prat_headers)
    assert r.status_code == 200


def test_read_performance_not_found(prat_headers):
    r = client.get("/api/v1/performances/9999", headers=prat_headers)
    assert r.status_code == 404


def test_update_performance(prat_headers):
    created = client.post("/api/v1/performances/", json={
        "id_praticien": 1, "mois": 7, "annee": 2023, "ca_declare": 10000.0,
    }, headers=prat_headers).json()
    r = client.put(f"/api/v1/performances/{created['id_perf']}",
                   json={"ca_declare": 11000.0}, headers=prat_headers)
    assert r.status_code == 200
    assert r.json()["ca_declare"] == 11000.0


def test_update_performance_not_found(prat_headers):
    r = client.put("/api/v1/performances/9999", json={"ca_declare": 1000.0}, headers=prat_headers)
    assert r.status_code == 404


# ============================================================
# FILTRES SERVEUR — DEVIS
# ============================================================

def test_read_deviss_filter_statut(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    payload_acc = {**_devis_payload(praticien_id), "statut": "ACCEPTE", "date_decision": "2023-01-02"}
    client.post("/api/v1/devis/", json=payload_acc, headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"statut": "ACCEPTE"}, headers=sec_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["statut"] == "ACCEPTE"


def test_read_deviss_filter_patient_ilike(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    payload_other = {**_devis_payload(praticien_id), "id_patient": "AUTRE999"}
    client.post("/api/v1/devis/", json=payload_other, headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"id_patient": "p_test"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_patient"] == "P_TEST"


def test_read_deviss_filter_date_range(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    payload_late = {**_devis_payload(praticien_id), "date_emission": "2023-06-15"}
    client.post("/api/v1/devis/", json=payload_late, headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"date_from": "2023-06-01", "date_to": "2023-12-31"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["date_emission"] == "2023-06-15"


def test_read_deviss_filter_montant(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    payload_cheap = {**_devis_payload(praticien_id), "montant": 100.0}
    client.post("/api/v1/devis/", json=payload_cheap, headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"montant_min": "200", "montant_max": "1000"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["montant"] == 500.0


def test_read_deviss_filter_no_match(sec_headers, praticien_id):
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"id_patient": "INEXISTANT"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_read_deviss_praticien_scope(prat_headers, sec_headers, praticien_id):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. ScopeD", "pin_clair": "221122"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. ScopeD").first()
    autre_id = autre.id_praticien
    db.close()
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    client.post("/api/v1/devis/", json=_devis_payload(autre_id), headers=sec_headers)
    r = client.get("/api/v1/devis/", headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_praticien"] == praticien_id


# ============================================================
# FILTRES SERVEUR — CHÈQUES
# ============================================================

def test_read_cheques_filter_statut(sec_headers, praticien_id):
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    payload_dep = {**_cheque_payload(praticien_id), "statut": "DEPOSE"}
    client.post("/api/v1/cheques/", json=payload_dep, headers=sec_headers)
    r = client.get("/api/v1/cheques/", params={"statut": "DEPOSE"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["statut"] == "DEPOSE"


def test_read_cheques_filter_patient_ilike(sec_headers, praticien_id):
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    payload_other = {**_cheque_payload(praticien_id), "id_patient": "AUTRE999"}
    client.post("/api/v1/cheques/", json=payload_other, headers=sec_headers)
    r = client.get("/api/v1/cheques/", params={"id_patient": "p_test"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_patient"] == "P_TEST"


def test_read_cheques_filter_date_range(sec_headers, praticien_id):
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    payload_late = {**_cheque_payload(praticien_id), "date_reception": "2023-06-15"}
    client.post("/api/v1/cheques/", json=payload_late, headers=sec_headers)
    r = client.get("/api/v1/cheques/", params={"date_to": "2023-03-01"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["date_reception"] == "2023-01-01"


def test_read_cheques_filter_montant(sec_headers, praticien_id):
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    payload_cheap = {**_cheque_payload(praticien_id), "montant": 50.0}
    client.post("/api/v1/cheques/", json=payload_cheap, headers=sec_headers)
    r = client.get("/api/v1/cheques/", params={"montant_min": "100"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["montant"] == 250.0


def test_read_cheques_praticien_scope(prat_headers, sec_headers, praticien_id):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. ScopeC", "pin_clair": "331133"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. ScopeC").first()
    autre_id = autre.id_praticien
    db.close()
    client.post("/api/v1/cheques/", json=_cheque_payload(praticien_id), headers=sec_headers)
    client.post("/api/v1/cheques/", json=_cheque_payload(autre_id), headers=sec_headers)
    r = client.get("/api/v1/cheques/", headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_praticien"] == praticien_id


# ============================================================
# FILTRES SERVEUR — JOURNÉES
# ============================================================

def test_read_journees_filter_date_range(sec_headers, praticien_id):
    client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    payload_late = {**_journee_payload(praticien_id), "date_jour": "2023-06-15"}
    client.post("/api/v1/journees/", json=payload_late)
    r = client.get("/api/v1/journees/", params={"date_from": "2023-06-01"}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["date_jour"] == "2023-06-15"


def test_read_journees_filter_praticien(sec_headers, praticien_id):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. ScopeJ", "pin_clair": "441144"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. ScopeJ").first()
    autre_id = autre.id_praticien
    db.close()
    client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    client.post("/api/v1/journees/", json={**_journee_payload(autre_id), "date_jour": "2023-01-02"})
    r = client.get("/api/v1/journees/", params={"id_praticien": praticien_id}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_praticien"] == praticien_id


def test_read_journees_praticien_scope(praticien_id):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. ScopeJ2", "pin_clair": "551155"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. ScopeJ2").first()
    autre_id = autre.id_praticien
    db.close()
    client.post("/api/v1/journees/", json=_journee_payload(praticien_id))
    client.post("/api/v1/journees/", json={**_journee_payload(autre_id), "date_jour": "2023-01-02"})
    token = create_access_token({"sub": str(praticien_id), "role": "praticien"})
    r = client.get("/api/v1/journees/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id_praticien"] == praticien_id


# ============================================================
# PAGINATION — X-Total-Count et skip/limit
# ============================================================

def test_x_total_count_header(sec_headers, praticien_id):
    """X-Total-Count est présent et égal au nombre total de résultats."""
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    r = client.get("/api/v1/devis/", headers=sec_headers)
    assert r.status_code == 200
    assert r.headers["x-total-count"] == "1"


def test_x_total_count_reflects_filters(sec_headers, praticien_id):
    """X-Total-Count correspond au nombre filtré, pas au total de la table entière."""
    client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    payload_acc = {**_devis_payload(praticien_id), "statut": "ACCEPTE", "date_decision": "2023-01-02"}
    client.post("/api/v1/devis/", json=payload_acc, headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"statut": "EN_ATTENTE"}, headers=sec_headers)
    assert r.status_code == 200
    assert r.headers["x-total-count"] == "1"
    assert len(r.json()) == 1


def test_skip_limit_pagination(sec_headers, praticien_id):
    """skip + limit retournent la bonne fenêtre ; X-Total-Count reflète le total, pas la fenêtre."""
    for _ in range(3):
        client.post("/api/v1/devis/", json=_devis_payload(praticien_id), headers=sec_headers)
    r = client.get("/api/v1/devis/", params={"skip": 1, "limit": 1}, headers=sec_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.headers["x-total-count"] == "3"


def test_limit_max_exceeded(sec_headers):
    """limit > 500 est rejeté avec 422."""
    r = client.get("/api/v1/devis/", params={"limit": 501}, headers=sec_headers)
    assert r.status_code == 422


def test_x_total_count_charges(prat_headers, praticien_id):
    """X-Total-Count fonctionne aussi sur /charges/."""
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    r = client.get("/api/v1/charges/", headers=prat_headers)
    assert r.status_code == 200
    assert r.headers["x-total-count"] == "1"


# ============================================================
# FILTRES SERVEUR — CHARGES
# ============================================================

def test_read_charges_filter_designation(prat_headers, praticien_id):
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    payload_other = {**_charge_payload(praticien_id), "designation": "Assurance pro"}
    client.post("/api/v1/charges/", json=payload_other, headers=prat_headers)
    r = client.get("/api/v1/charges/", params={"designation": "loyer"}, headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["designation"] == "Loyer"


def test_read_charges_filter_periodicite(prat_headers, praticien_id):
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    payload_ann = {**_charge_payload(praticien_id), "periodicite": "ANNUEL", "designation": "Taxe foncière"}
    client.post("/api/v1/charges/", json=payload_ann, headers=prat_headers)
    r = client.get("/api/v1/charges/", params={"periodicite": "ANNUEL"}, headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["periodicite"] == "ANNUEL"


def test_read_charges_filter_date_range(prat_headers, praticien_id):
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    payload_late = {**_charge_payload(praticien_id), "date_debut": "2023-09-01", "designation": "Nouveau bail"}
    client.post("/api/v1/charges/", json=payload_late, headers=prat_headers)
    r = client.get("/api/v1/charges/", params={"date_from": "2023-06-01"}, headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["date_debut"] == "2023-09-01"


def test_read_charges_filter_montant(prat_headers, praticien_id):
    client.post("/api/v1/charges/", json=_charge_payload(praticien_id), headers=prat_headers)
    payload_cheap = {**_charge_payload(praticien_id), "montant": 50.0, "designation": "Petit abonnement"}
    client.post("/api/v1/charges/", json=payload_cheap, headers=prat_headers)
    r = client.get("/api/v1/charges/", params={"montant_max": "500"}, headers=prat_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["montant"] == 50.0
