"""
Tests d'intégration pour POST /api/v1/imports/devis et /cheques.
"""
import io
import pytest
from datetime import date, timedelta

from app import models
from tests.conftest import client, TestingSessionLocal

TODAY = date.today()

DEVIS_HEADER  = "id_patient,montant,temps_previsionnel_minutes,date_emission,statut,date_decision,motif_refus"
CHEQUE_HEADER = "id_patient,montant,date_reception,date_depot_prevue,statut"


def _csv(header: str, *rows: str) -> bytes:
    return "\n".join([header, *rows]).encode("utf-8")


def _csv_semicolon(header: str, *rows: str) -> bytes:
    h = header.replace(",", ";")
    rs = [r.replace(",", ";") for r in rows]
    return "\n".join([h, *rs]).encode("utf-8")


def _upload(content: bytes, filename: str = "test.csv"):
    return {"file": (filename, io.BytesIO(content), "text/csv")}


def _post_devis(praticien_id, content, headers):
    return client.post(
        f"/api/v1/imports/devis?id_praticien={praticien_id}",
        files=_upload(content),
        headers=headers,
    )


def _post_cheques(praticien_id, content, headers):
    return client.post(
        f"/api/v1/imports/cheques?id_praticien={praticien_id}",
        files=_upload(content),
        headers=headers,
    )


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_import_devis_sans_token_retourne_401(praticien_id):
    csv = _csv(DEVIS_HEADER)
    assert client.post(
        f"/api/v1/imports/devis?id_praticien={praticien_id}",
        files=_upload(csv),
    ).status_code == 401


def test_import_cheques_sans_token_retourne_401(praticien_id):
    csv = _csv(CHEQUE_HEADER)
    assert client.post(
        f"/api/v1/imports/cheques?id_praticien={praticien_id}",
        files=_upload(csv),
    ).status_code == 401


def test_import_devis_praticien_autre_retourne_403(praticien_id, sec_headers):
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "222222"})
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    from app.routers.auth import create_access_token
    autre_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(autre_id), 'role': 'praticien'})}"}

    csv = _csv(DEVIS_HEADER)
    assert _post_devis(praticien_id, csv, autre_headers).status_code == 403


# ── Import devis — cas nominaux ───────────────────────────────────────────────

def test_import_devis_csv_vide(praticien_id, sec_headers):
    csv = _csv(DEVIS_HEADER)
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["total"] == 0
    assert d["importes"] == 0
    assert d["erreurs"] == []


def test_import_devis_une_ligne(praticien_id, sec_headers):
    csv = _csv(DEVIS_HEADER, f"P001,1500,60,{TODAY},EN_ATTENTE,,")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1
    assert d["erreurs"] == []

    db = TestingSessionLocal()
    assert db.query(models.Devis).filter_by(id_praticien=praticien_id).count() == 1
    db.close()


def test_import_devis_plusieurs_lignes(praticien_id, sec_headers):
    csv = _csv(
        DEVIS_HEADER,
        f"P001,1500,60,{TODAY},EN_ATTENTE,,",
        f"P002,3000,120,{TODAY},EN_ATTENTE,,",
        f"P003,500,30,{TODAY},EN_ATTENTE,,",
    )
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["total"] == 3
    assert d["importes"] == 3
    assert d["erreurs"] == []


def test_import_devis_accepte_avec_date_decision(praticien_id, sec_headers):
    decision = TODAY.isoformat()
    csv = _csv(DEVIS_HEADER, f"P001,2000,90,{TODAY},ACCEPTE,{decision},")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    devis = db.query(models.Devis).filter_by(id_praticien=praticien_id).first()
    assert devis is not None
    assert devis.statut == models.StatutDevis.ACCEPTE
    db.close()


def test_import_devis_refuse_avec_motif(praticien_id, sec_headers):
    decision = TODAY.isoformat()
    csv = _csv(DEVIS_HEADER, f"P001,800,45,{TODAY},REFUSE,{decision},Trop cher")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    devis = db.query(models.Devis).filter_by(id_praticien=praticien_id).first()
    assert devis is not None
    assert devis.motif_refus == "Trop cher"
    db.close()


def test_import_devis_separateur_point_virgule(praticien_id, sec_headers):
    csv = _csv_semicolon(DEVIS_HEADER, f"P001;1500;60;{TODAY};EN_ATTENTE;;")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1


def test_import_devis_statut_par_defaut(praticien_id, sec_headers):
    # statut vide → EN_ATTENTE par défaut
    csv = _csv(DEVIS_HEADER, f"P001,1000,60,{TODAY},,,")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    devis = db.query(models.Devis).filter_by(id_praticien=praticien_id).first()
    assert devis is not None
    assert devis.statut == models.StatutDevis.EN_ATTENTE
    db.close()


def test_import_devis_praticien_peut_importer_pour_lui(prat_headers, praticien_id):
    csv = _csv(DEVIS_HEADER, f"P001,1500,60,{TODAY},EN_ATTENTE,,")
    d = _post_devis(praticien_id, csv, prat_headers).json()
    assert d["importes"] == 1


# ── Import devis — erreurs ────────────────────────────────────────────────────

def test_import_devis_montant_invalide(praticien_id, sec_headers):
    csv = _csv(DEVIS_HEADER, f"P001,abc,60,{TODAY},EN_ATTENTE,,")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert len(d["erreurs"]) == 1
    assert d["erreurs"][0]["ligne"] == 2


def test_import_devis_date_invalide(praticien_id, sec_headers):
    csv = _csv(DEVIS_HEADER, "P001,1500,60,pas-une-date,EN_ATTENTE,,")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert d["erreurs"][0]["ligne"] == 2


def test_import_devis_refuse_sans_motif(praticien_id, sec_headers):
    decision = TODAY.isoformat()
    csv = _csv(DEVIS_HEADER, f"P001,800,45,{TODAY},REFUSE,{decision},")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert len(d["erreurs"]) == 1


def test_import_devis_date_decision_avant_emission(praticien_id, sec_headers):
    hier = (TODAY - timedelta(days=1)).isoformat()
    demain = (TODAY + timedelta(days=1)).isoformat()
    csv = _csv(DEVIS_HEADER, f"P001,1500,60,{demain},ACCEPTE,{hier},")
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert len(d["erreurs"]) == 1


def test_import_devis_mixte_valides_et_erreurs(praticien_id, sec_headers):
    csv = _csv(
        DEVIS_HEADER,
        f"P001,1500,60,{TODAY},EN_ATTENTE,,",   # valide
        "P002,abc,60,2024-01-01,EN_ATTENTE,,",  # montant invalide
        f"P003,500,30,{TODAY},EN_ATTENTE,,",     # valide
    )
    d = _post_devis(praticien_id, csv, sec_headers).json()
    assert d["total"] == 3
    assert d["importes"] == 2
    assert len(d["erreurs"]) == 1
    assert d["erreurs"][0]["ligne"] == 3


# ── Import chèques — cas nominaux ─────────────────────────────────────────────

def test_import_cheques_csv_vide(praticien_id, sec_headers):
    csv = _csv(CHEQUE_HEADER)
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["total"] == 0
    assert d["importes"] == 0


def test_import_cheques_une_ligne(praticien_id, sec_headers):
    depot = (TODAY + timedelta(days=30)).isoformat()
    csv = _csv(CHEQUE_HEADER, f"P001,250,{TODAY},{depot},EN_ATTENTE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    assert db.query(models.Cheque).filter_by(id_praticien=praticien_id).count() == 1
    db.close()


def test_import_cheques_sans_date_depot(praticien_id, sec_headers):
    # date_depot_prevue optionnelle
    csv = _csv(CHEQUE_HEADER, f"P001,300,{TODAY},,EN_ATTENTE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    cheque = db.query(models.Cheque).filter_by(id_praticien=praticien_id).first()
    assert cheque is not None
    assert cheque.date_depot_prevue is None
    db.close()


def test_import_cheques_depose(praticien_id, sec_headers):
    csv = _csv(CHEQUE_HEADER, f"P001,500,{TODAY},,DEPOSE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1

    db = TestingSessionLocal()
    cheque = db.query(models.Cheque).filter_by(id_praticien=praticien_id).first()
    assert cheque is not None
    assert cheque.statut == models.StatutCheque.DEPOSE
    db.close()


def test_import_cheques_separateur_point_virgule(praticien_id, sec_headers):
    csv = _csv_semicolon(CHEQUE_HEADER, f"P001;250;{TODAY};;EN_ATTENTE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 1


def test_import_cheques_plusieurs_lignes(praticien_id, sec_headers):
    csv = _csv(
        CHEQUE_HEADER,
        f"P001,100,{TODAY},,EN_ATTENTE",
        f"P002,200,{TODAY},,EN_ATTENTE",
        f"P003,300,{TODAY},,EN_ATTENTE",
    )
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["total"] == 3
    assert d["importes"] == 3


# ── Import chèques — erreurs ──────────────────────────────────────────────────

def test_import_cheques_montant_invalide(praticien_id, sec_headers):
    csv = _csv(CHEQUE_HEADER, f"P001,xyz,{TODAY},,EN_ATTENTE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert len(d["erreurs"]) == 1


def test_import_cheques_date_invalide(praticien_id, sec_headers):
    csv = _csv(CHEQUE_HEADER, "P001,250,pas-une-date,,EN_ATTENTE")
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 0
    assert len(d["erreurs"]) == 1


def test_import_cheques_mixte_valides_et_erreurs(praticien_id, sec_headers):
    csv = _csv(
        CHEQUE_HEADER,
        f"P001,100,{TODAY},,EN_ATTENTE",   # valide
        "P002,xyz,2024-01-01,,EN_ATTENTE", # montant invalide
        f"P003,300,{TODAY},,EN_ATTENTE",   # valide
    )
    d = _post_cheques(praticien_id, csv, sec_headers).json()
    assert d["importes"] == 2
    assert len(d["erreurs"]) == 1
    assert d["erreurs"][0]["ligne"] == 3


# ── Templates ─────────────────────────────────────────────────────────────────

def test_template_devis_telechargeable(sec_headers):
    r = client.get("/api/v1/imports/template/devis", headers=sec_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "id_patient" in r.text
    assert "montant" in r.text


def test_template_cheques_telechargeable(sec_headers):
    r = client.get("/api/v1/imports/template/cheques", headers=sec_headers)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "date_reception" in r.text
