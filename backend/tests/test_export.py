"""
Tests d'intégration pour GET /api/v1/export/csv.
"""
import csv
import io
import pytest
from datetime import date

from app import models
from tests.conftest import client, TestingSessionLocal

URL = "/api/v1/export/csv"


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_csv(content: bytes) -> tuple[list[str], list[dict]]:
    """Retourne (headers, rows) depuis un CSV UTF-8-sig."""
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    return list(reader.fieldnames or []), rows


def _create_devis(praticien_id, headers):
    return client.post("/api/v1/devis/", json={
        "id_praticien": praticien_id,
        "id_patient": "P001",
        "montant": 1500.0,
        "temps_previsionnel_minutes": 60,
        "date_emission": "2023-01-15",
        "statut": "EN_ATTENTE",
    }, headers=headers)


def _create_cheque(praticien_id, headers):
    return client.post("/api/v1/cheques/", json={
        "id_praticien": praticien_id,
        "id_patient": "P001",
        "montant": 250.0,
        "date_reception": "2023-01-15",
    }, headers=headers)


def _create_journee(praticien_id, headers):
    return client.post("/api/v1/journees/", json={
        "id_praticien": praticien_id,
        "date_jour": "2023-01-15",
        "nb_patients_vus": 8,
        "nb_nouveaux_patients": 2,
        "nb_rdv_manques_connus": 0,
        "nb_rdv_manques_nouveaux": 0,
        "temps_presence_minutes": 480,
        "temps_perdu_minutes": 30,
    }, headers=headers)


def _create_charge(praticien_id, headers):
    return client.post("/api/v1/charges/", json={
        "id_praticien": praticien_id,
        "designation": "Loyer",
        "montant": 2000.0,
        "periodicite": "MENSUEL",
        "date_debut": "2023-01-01",
    }, headers=headers)


# ── auth ─────────────────────────────────────────────────────────────────────

def test_export_sans_token_retourne_401():
    assert client.get(URL, params={"resource": "devis", "columns": "id_devis"}).status_code == 401


# ── ressource invalide ────────────────────────────────────────────────────────

def test_export_ressource_inconnue(sec_headers):
    r = client.get(URL, params={"resource": "inconnu", "columns": "id"}, headers=sec_headers)
    assert r.status_code == 400


def test_export_colonne_inconnue(sec_headers):
    r = client.get(URL, params={"resource": "devis", "columns": "champ_inexistant"}, headers=sec_headers)
    assert r.status_code == 400


def test_export_colonnes_vides(sec_headers):
    r = client.get(URL, params={"resource": "devis", "columns": ""}, headers=sec_headers)
    assert r.status_code == 400


# ── export devis ──────────────────────────────────────────────────────────────

def test_export_devis_vide(sec_headers):
    r = client.get(URL, params={"resource": "devis", "columns": "id_devis,montant"}, headers=sec_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    headers, rows = _parse_csv(r.content)
    assert "N° devis" in headers
    assert "Montant (€)" in headers
    assert rows == []


def test_export_devis_contenu(sec_headers, prat_headers, praticien_id):
    _create_devis(praticien_id, prat_headers)
    r = client.get(URL, params={
        "resource": "devis",
        "columns": "id_devis,id_patient,montant,statut",
    }, headers=sec_headers)
    assert r.status_code == 200
    _, rows = _parse_csv(r.content)
    assert len(rows) == 1
    assert rows[0]["N° patient"] == "P001"
    assert rows[0]["Montant (€)"] == "1500.0"
    assert rows[0]["Statut"] == "EN_ATTENTE"


def test_export_devis_colonnes_selectionnees(sec_headers, prat_headers, praticien_id):
    _create_devis(praticien_id, prat_headers)
    r = client.get(URL, params={"resource": "devis", "columns": "id_devis"}, headers=sec_headers)
    headers, rows = _parse_csv(r.content)
    assert headers == ["N° devis"]
    assert len(rows[0]) == 1


def test_export_devis_bom_utf8(sec_headers):
    r = client.get(URL, params={"resource": "devis", "columns": "id_devis"}, headers=sec_headers)
    assert r.content[:3] == b"\xef\xbb\xbf"


def test_export_devis_content_disposition(sec_headers):
    r = client.get(URL, params={"resource": "devis", "columns": "id_devis"}, headers=sec_headers)
    assert "devis_export.csv" in r.headers["content-disposition"]


# ── export chèques ────────────────────────────────────────────────────────────

def test_export_cheques_contenu(sec_headers, prat_headers, praticien_id):
    _create_cheque(praticien_id, sec_headers)
    r = client.get(URL, params={
        "resource": "cheques",
        "columns": "id_cheque,montant,statut",
    }, headers=sec_headers)
    assert r.status_code == 200
    _, rows = _parse_csv(r.content)
    assert len(rows) == 1
    assert rows[0]["Montant (€)"] == "250.0"
    assert rows[0]["Statut"] == "EN_ATTENTE"


# ── export journées ───────────────────────────────────────────────────────────

def test_export_journees_contenu(sec_headers, prat_headers, praticien_id):
    _create_journee(praticien_id, sec_headers)
    r = client.get(URL, params={
        "resource": "journees",
        "columns": "date_jour,nb_patients_vus,temps_presence_minutes",
    }, headers=sec_headers)
    assert r.status_code == 200
    _, rows = _parse_csv(r.content)
    assert len(rows) == 1
    assert rows[0]["Date"] == "2023-01-15"
    assert rows[0]["Patients vus"] == "8"


# ── export charges ────────────────────────────────────────────────────────────

def test_export_charges_contenu(sec_headers, prat_headers, praticien_id):
    _create_charge(praticien_id, prat_headers)
    r = client.get(URL, params={
        "resource": "charges",
        "columns": "designation,montant,periodicite,lissage_mensuel",
    }, headers=sec_headers)
    assert r.status_code == 200
    _, rows = _parse_csv(r.content)
    assert len(rows) == 1
    assert rows[0]["Désignation"] == "Loyer"
    assert rows[0]["Montant (€)"] == "2000.0"
    assert rows[0]["Périodicité"] == "MENSUEL"
    assert rows[0]["Lissage mensuel"] == "Oui"


# ── sérialisation des valeurs spéciales ───────────────────────────────────────

def test_export_valeur_none_serialisee_en_chaine_vide(sec_headers, prat_headers, praticien_id):
    # date_decision est None sur un devis EN_ATTENTE
    _create_devis(praticien_id, prat_headers)
    r = client.get(URL, params={
        "resource": "devis",
        "columns": "date_decision,motif_refus",
    }, headers=sec_headers)
    _, rows = _parse_csv(r.content)
    assert rows[0]["Date décision"] == ""
    assert rows[0]["Motif refus"] == ""


def test_export_enum_serialise_en_valeur(sec_headers, prat_headers, praticien_id):
    # statut est un enum — doit être exporté comme "EN_ATTENTE" pas "<StatutDevis.EN_ATTENTE>"
    _create_devis(praticien_id, prat_headers)
    r = client.get(URL, params={"resource": "devis", "columns": "statut"}, headers=sec_headers)
    _, rows = _parse_csv(r.content)
    assert rows[0]["Statut"] == "EN_ATTENTE"


# ── isolation praticien ───────────────────────────────────────────────────────

def test_export_praticien_voit_seulement_ses_donnees(prat_headers, praticien_id, sec_headers):
    # Créer un second praticien avec ses propres devis
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "222222"}, headers=sec_headers)
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    from app.routers.auth import create_access_token
    autre_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(autre_id), 'role': 'praticien'})}"}

    _create_devis(praticien_id, prat_headers)
    _create_devis(autre_id, autre_headers)

    # Dr. Test ne voit que son devis
    r = client.get(URL, params={"resource": "devis", "columns": "id_praticien"}, headers=prat_headers)
    _, rows = _parse_csv(r.content)
    assert len(rows) == 1
    assert rows[0]["N° praticien"] == str(praticien_id)


def test_export_secretaire_voit_tous_les_devis(prat_headers, praticien_id, sec_headers):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre2", "pin_clair": "333333"}, headers=sec_headers)
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre2").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    from app.routers.auth import create_access_token
    autre_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(autre_id), 'role': 'praticien'})}"}

    _create_devis(praticien_id, prat_headers)
    _create_devis(autre_id, autre_headers)

    r = client.get(URL, params={"resource": "devis", "columns": "id_praticien"}, headers=sec_headers)
    _, rows = _parse_csv(r.content)
    assert len(rows) == 2
