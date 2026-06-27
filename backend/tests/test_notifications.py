"""
Tests d'intégration pour GET /api/v1/notifications.
"""

from datetime import date, timedelta

from app import models
from app.routers.auth import create_access_token
from tests.conftest import client, TestingSessionLocal

TODAY = date.today()
DELAI = 15  # délai configuré dans conftest


def _devis(
    praticien_id,
    date_emission,
    statut="EN_ATTENTE",
    montant=1000.0,
    date_decision=None,
    motif_refus=None,
):
    p = {
        "id_praticien": praticien_id,
        "id_patient": "P001",
        "montant": montant,
        "temps_previsionnel_minutes": 60,
        "date_emission": date_emission.isoformat(),
        "statut": statut,
    }
    if date_decision:
        p["date_decision"] = date_decision.isoformat()
    if motif_refus:
        p["motif_refus"] = motif_refus
    return p


def _cheque(praticien_id, date_depot_prevue=None, statut="EN_ATTENTE", montant=500.0):
    p = {
        "id_praticien": praticien_id,
        "id_patient": "P001",
        "montant": montant,
        "date_reception": TODAY.isoformat(),
        "statut": statut,
    }
    if date_depot_prevue:
        p["date_depot_prevue"] = date_depot_prevue.isoformat()
    return p


URL = "/api/v1/notifications"


# ── Auth ─────────────────────────────────────────────────────────────────────


def test_notif_sans_token_retourne_401():
    assert client.get(URL).status_code == 401


def test_notif_praticien_retourne_403(prat_headers):
    assert client.get(URL, headers=prat_headers).status_code == 403


# ── État vide ─────────────────────────────────────────────────────────────────


def test_notif_vide(sec_headers):
    d = client.get(URL, headers=sec_headers).json()
    assert d["total"] == 0
    assert d["devis_relance"] == []
    assert d["cheques_depot"] == []


# ── Devis à relancer ──────────────────────────────────────────────────────────


def test_notif_devis_delai_depasse(sec_headers, prat_headers, praticien_id):
    date_ancienne = TODAY - timedelta(days=DELAI + 1)
    client.post(
        "/api/v1/devis/", json=_devis(praticien_id, date_ancienne), headers=prat_headers
    )

    d = client.get(URL, headers=sec_headers).json()
    assert d["total"] == 1
    assert len(d["devis_relance"]) == 1
    assert d["devis_relance"][0]["jours_attente"] == DELAI + 1


def test_notif_devis_exactement_au_delai(sec_headers, prat_headers, praticien_id):
    # Émis exactement il y a DELAI jours → doit apparaître (<=)
    date_limite = TODAY - timedelta(days=DELAI)
    client.post(
        "/api/v1/devis/", json=_devis(praticien_id, date_limite), headers=prat_headers
    )

    d = client.get(URL, headers=sec_headers).json()
    assert len(d["devis_relance"]) == 1


def test_notif_devis_recent_exclu(sec_headers, prat_headers, praticien_id):
    # Émis il y a DELAI - 1 jours → pas encore en retard
    date_recente = TODAY - timedelta(days=DELAI - 1)
    client.post(
        "/api/v1/devis/", json=_devis(praticien_id, date_recente), headers=prat_headers
    )

    d = client.get(URL, headers=sec_headers).json()
    assert d["total"] == 0


def test_notif_devis_accepte_exclu(sec_headers, prat_headers, praticien_id):
    date_ancienne = TODAY - timedelta(days=DELAI + 5)
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, date_ancienne, statut="ACCEPTE", date_decision=TODAY),
        headers=prat_headers,
    )

    assert client.get(URL, headers=sec_headers).json()["total"] == 0


def test_notif_devis_refuse_exclu(sec_headers, prat_headers, praticien_id):
    date_ancienne = TODAY - timedelta(days=DELAI + 5)
    client.post(
        "/api/v1/devis/",
        json=_devis(
            praticien_id,
            date_ancienne,
            statut="REFUSE",
            date_decision=TODAY,
            motif_refus="Trop cher",
        ),
        headers=prat_headers,
    )

    assert client.get(URL, headers=sec_headers).json()["total"] == 0


def test_notif_devis_champs_retournes(sec_headers, prat_headers, praticien_id):
    date_ancienne = TODAY - timedelta(days=DELAI + 3)
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, date_ancienne, montant=1500.0),
        headers=prat_headers,
    )

    item = client.get(URL, headers=sec_headers).json()["devis_relance"][0]
    assert "id_devis" in item
    assert "id_patient" in item
    assert item["montant"] == 1500.0
    assert item["jours_attente"] == DELAI + 3
    assert item["praticien"] == "Dr. Test"
    assert item["delai_relance_jours"] == DELAI


def test_notif_devis_tri_par_urgence_decroissante(
    sec_headers, prat_headers, praticien_id
):
    # Le plus ancien doit apparaître en premier
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, TODAY - timedelta(days=DELAI + 2)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, TODAY - timedelta(days=DELAI + 10)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, TODAY - timedelta(days=DELAI + 5)),
        headers=prat_headers,
    )

    relances = client.get(URL, headers=sec_headers).json()["devis_relance"]
    jours = [r["jours_attente"] for r in relances]
    assert jours == sorted(jours, reverse=True)


def test_notif_devis_delai_par_praticien(sec_headers, prat_headers, praticien_id):
    # Créer un second praticien avec un délai différent (30j)
    client.post(
        "/api/v1/praticiens/",
        json={"nom": "Dr. Long", "pin_clair": "222222"},
        headers=sec_headers,
    )
    db = TestingSessionLocal()
    autre = (
        db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Long").first()
    )
    assert autre is not None
    autre_id = autre.id_praticien
    db.close()

    autre_headers = {
        "Authorization": f"Bearer {create_access_token({'sub': str(autre_id), 'role': 'praticien'})}"
    }
    client.put(
        f"/api/v1/praticiens/{autre_id}/parametres",
        json={"delai_relance_jours": 30},
        headers=autre_headers,
    )

    # Devis à 20j : dépasse le délai de Dr. Test (15j) mais pas celui de Dr. Long (30j)
    date_20j = TODAY - timedelta(days=20)
    client.post(
        "/api/v1/devis/", json=_devis(praticien_id, date_20j), headers=prat_headers
    )
    client.post(
        "/api/v1/devis/", json=_devis(autre_id, date_20j), headers=autre_headers
    )

    relances = client.get(URL, headers=sec_headers).json()["devis_relance"]
    assert len(relances) == 1
    assert relances[0]["praticien"] == "Dr. Test"


# ── Chèques à déposer ─────────────────────────────────────────────────────────


def test_notif_cheque_date_depassee(sec_headers, prat_headers, praticien_id):
    hier = TODAY - timedelta(days=1)
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=hier),
        headers=prat_headers,
    )

    d = client.get(URL, headers=sec_headers).json()
    assert d["total"] == 1
    assert len(d["cheques_depot"]) == 1
    assert d["cheques_depot"][0]["jours_retard"] == 1


def test_notif_cheque_date_aujourdhui(sec_headers, prat_headers, praticien_id):
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=TODAY),
        headers=prat_headers,
    )

    d = client.get(URL, headers=sec_headers).json()
    assert len(d["cheques_depot"]) == 1
    assert d["cheques_depot"][0]["jours_retard"] == 0


def test_notif_cheque_date_future_exclue(sec_headers, prat_headers, praticien_id):
    demain = TODAY + timedelta(days=1)
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=demain),
        headers=prat_headers,
    )

    assert client.get(URL, headers=sec_headers).json()["total"] == 0


def test_notif_cheque_sans_date_depot_exclu(sec_headers, prat_headers, praticien_id):
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=None),
        headers=prat_headers,
    )

    assert client.get(URL, headers=sec_headers).json()["total"] == 0


def test_notif_cheque_depose_exclu(sec_headers, prat_headers, praticien_id):
    hier = TODAY - timedelta(days=1)
    r = client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=hier),
        headers=prat_headers,
    )
    id_cheque = r.json()["id_cheque"]
    client.put(
        f"/api/v1/cheques/{id_cheque}", json={"statut": "DEPOSE"}, headers=prat_headers
    )

    assert client.get(URL, headers=sec_headers).json()["total"] == 0


def test_notif_cheque_champs_retournes(sec_headers, prat_headers, praticien_id):
    hier = TODAY - timedelta(days=1)
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=hier, montant=750.0),
        headers=prat_headers,
    )

    item = client.get(URL, headers=sec_headers).json()["cheques_depot"][0]
    assert "id_cheque" in item
    assert "id_patient" in item
    assert item["montant"] == 750.0
    assert item["jours_retard"] == 1
    assert item["praticien"] == "Dr. Test"


def test_notif_cheque_tri_par_urgence_decroissante(
    sec_headers, prat_headers, praticien_id
):
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=TODAY - timedelta(days=3)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=TODAY - timedelta(days=10)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=TODAY - timedelta(days=1)),
        headers=prat_headers,
    )

    depots = client.get(URL, headers=sec_headers).json()["cheques_depot"]
    jours = [c["jours_retard"] for c in depots]
    assert jours == sorted(jours, reverse=True)


# ── Total et combinaison ──────────────────────────────────────────────────────


def test_notif_total_combine(sec_headers, prat_headers, praticien_id):
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, TODAY - timedelta(days=DELAI + 1)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/devis/",
        json=_devis(praticien_id, TODAY - timedelta(days=DELAI + 2)),
        headers=prat_headers,
    )
    client.post(
        "/api/v1/cheques/",
        json=_cheque(praticien_id, date_depot_prevue=TODAY - timedelta(days=1)),
        headers=prat_headers,
    )

    d = client.get(URL, headers=sec_headers).json()
    assert d["total"] == 3
    assert len(d["devis_relance"]) == 2
    assert len(d["cheques_depot"]) == 1
