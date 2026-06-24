"""
Tests unitaires et d'intégration pour les KPIs.

Unitaires : _compute_monthly_charges (logique de calcul des charges mensualisées).
Intégration : les 3 endpoints /kpis/mensuel, /kpis/hebdomadaire, /kpis/encours.
"""
import pytest
import types
from datetime import date, timedelta

from app import models
from app.models import PeriodiciteCharge
from app.routers.auth import create_access_token
from app.routers.kpis import _compute_monthly_charges
from tests.conftest import client, TestingSessionLocal

# ============================================================
# HELPERS
# ============================================================

MOIS = 1
ANNEE = 2023
TODAY = date.today()
LUNDI = TODAY - timedelta(days=TODAY.weekday())
DIMANCHE = LUNDI + timedelta(days=6)


def make_charge(periodicite, montant, date_debut, date_fin=None, lissage_mensuel=True):
    """Objet léger simulant un modèle Charge pour les tests unitaires."""
    return types.SimpleNamespace(
        periodicite=PeriodiciteCharge(periodicite),
        montant=montant,
        date_debut=date.fromisoformat(date_debut),
        date_fin=date.fromisoformat(date_fin) if date_fin else None,
        lissage_mensuel=lissage_mensuel,
    )


def _perf(praticien_id, mois=MOIS, annee=ANNEE, ca=20000.0):
    return {"id_praticien": praticien_id, "mois": mois, "annee": annee, "ca_declare": ca}


def _journee(praticien_id, date_jour="2023-01-10",
             nb_patients=10, nb_nouveaux=3, nb_mq_nv=1,
             presence=480, perdu=60):
    return {
        "id_praticien": praticien_id,
        "date_jour": date_jour,
        "nb_patients_vus": nb_patients,
        "nb_nouveaux_patients": nb_nouveaux,
        "nb_rdv_manques_connus": 0,
        "nb_rdv_manques_nouveaux": nb_mq_nv,
        "temps_presence_minutes": presence,
        "temps_perdu_minutes": perdu,
    }


def _devis(praticien_id, montant=1000.0, statut="EN_ATTENTE",
           date_emission="2023-01-15", date_decision=None, motif_refus=None):
    p = {
        "id_praticien": praticien_id,
        "id_patient": "P001",
        "montant": montant,
        "temps_previsionnel_minutes": 60,
        "date_emission": date_emission,
        "statut": statut,
    }
    if date_decision:
        p["date_decision"] = date_decision
    if motif_refus:
        p["motif_refus"] = motif_refus
    return p


def _charge(praticien_id, montant=1000.0, periodicite="MENSUEL",
            date_debut="2023-01-01", lissage_mensuel=True):
    return {
        "id_praticien": praticien_id,
        "designation": "Charge test",
        "montant": montant,
        "periodicite": periodicite,
        "date_debut": date_debut,
        "lissage_mensuel": lissage_mensuel,
    }


def _kpi_url(mois=MOIS, annee=ANNEE):
    return f"/api/v1/kpis/mensuel?mois={mois}&annee={annee}"


def _hebdo_url(debut=None, fin=None):
    d = (debut or LUNDI).isoformat()
    f = (fin or DIMANCHE).isoformat()
    return f"/api/v1/kpis/hebdomadaire?date_debut={d}&date_fin={f}"


# ============================================================
# TESTS UNITAIRES — _compute_monthly_charges
# ============================================================

def test_charge_mensuel_dans_la_periode():
    c = make_charge("MENSUEL", 1000.0, "2023-01-01")
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(1000.0)


def test_charge_mensuel_date_fin_expiree():
    c = make_charge("MENSUEL", 1000.0, "2023-01-01", date_fin="2023-05-31")
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(0.0)


def test_charge_mensuel_date_debut_future():
    c = make_charge("MENSUEL", 1000.0, "2023-07-01")
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(0.0)


def test_charge_mensuel_date_fin_derniere_jour_incluse():
    c = make_charge("MENSUEL", 1000.0, "2023-01-01", date_fin="2023-06-30")
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(1000.0)


def test_charge_trimestriel_avec_lissage():
    # 900 € / 3 mois = 300 € par mois
    c = make_charge("TRIMESTRIEL", 900.0, "2023-01-01", lissage_mensuel=True)
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(300.0)


def test_charge_trimestriel_sans_lissage_mois_applicable():
    # date_debut = janvier → applicable : jan(0), avr(3), jul(6), oct(9)
    c = make_charge("TRIMESTRIEL", 900.0, "2023-01-01", lissage_mensuel=False)
    assert _compute_monthly_charges([c], 4, 2023) == pytest.approx(900.0)


def test_charge_trimestriel_sans_lissage_mois_hors_cycle():
    c = make_charge("TRIMESTRIEL", 900.0, "2023-01-01", lissage_mensuel=False)
    assert _compute_monthly_charges([c], 2, 2023) == pytest.approx(0.0)


def test_charge_annuel_avec_lissage():
    # 1200 € / 12 = 100 € par mois
    c = make_charge("ANNUEL", 1200.0, "2023-01-01", lissage_mensuel=True)
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(100.0)


def test_charge_annuel_sans_lissage_mois_anniversaire():
    c = make_charge("ANNUEL", 2400.0, "2023-03-01", lissage_mensuel=False)
    assert _compute_monthly_charges([c], 3, 2023) == pytest.approx(2400.0)


def test_charge_annuel_sans_lissage_autre_mois():
    c = make_charge("ANNUEL", 2400.0, "2023-03-01", lissage_mensuel=False)
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(0.0)


def test_charge_ponctuel_bon_mois():
    c = make_charge("PONCTUEL", 500.0, "2023-06-15")
    assert _compute_monthly_charges([c], 6, 2023) == pytest.approx(500.0)


def test_charge_ponctuel_autre_mois():
    c = make_charge("PONCTUEL", 500.0, "2023-06-15")
    assert _compute_monthly_charges([c], 7, 2023) == pytest.approx(0.0)


def test_charge_cumul_plusieurs_types():
    charges = [
        make_charge("MENSUEL", 1000.0, "2023-01-01"),           # 1000
        make_charge("TRIMESTRIEL", 300.0, "2023-01-01"),         # 100 (lissage)
        make_charge("PONCTUEL", 200.0, "2023-06-01"),            # 200
        make_charge("MENSUEL", 500.0, "2023-07-01"),             # 0 (pas encore)
    ]
    assert _compute_monthly_charges(charges, 6, 2023) == pytest.approx(1300.0)


# ============================================================
# TESTS D'INTÉGRATION — /kpis/mensuel
# ============================================================

def test_kpi_mensuel_sans_token_retourne_401():
    assert client.get(_kpi_url()).status_code == 401


def test_kpi_mensuel_mois_invalide(prat_headers):
    assert client.get("/api/v1/kpis/mensuel?mois=13&annee=2023", headers=prat_headers).status_code == 422


def test_kpi_mensuel_sans_donnees_tous_nuls(prat_headers):
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["ca_declare"] is None
    assert d["taux_horaire_reel"] is None
    assert d["taux_conversion_nb"] is None
    assert d["nb_patients_vus"] == 0
    assert d["nb_devis_emis"] == 0


def test_kpi_mensuel_parametres_inclus(prat_headers):
    d = client.get(_kpi_url(), headers=prat_headers).json()
    # Les paramètres du praticien sont toujours retournés (fixture setup_db)
    assert d["taux_horaire_cible"] == 300.0
    assert d["ca_mensuel_cible"] == 20000.0


def test_kpi_mensuel_taux_horaire_reel(prat_headers, praticien_id):
    # CA=20000, présence=480min, perdu=60min → productif=420min=7h → THR=20000/7≈2857
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    client.post("/api/v1/journees/", json=_journee(praticien_id), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_horaire_reel"] == pytest.approx(20000 / 7, rel=1e-2)
    assert d["ecart_taux_horaire"] == pytest.approx(20000 / 7 - 300.0, rel=1e-2)


def test_kpi_mensuel_taux_horaire_null_sans_journees(prat_headers, praticien_id):
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_horaire_reel"] is None
    assert d["ecart_taux_horaire"] is None


def test_kpi_mensuel_taux_conversion_nb(prat_headers, praticien_id):
    # 2 acceptés + 1 refusé → 66.7 %
    client.post("/api/v1/devis/", json=_devis(praticien_id, statut="ACCEPTE", date_emission="2023-01-10", date_decision="2023-01-12"), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, statut="ACCEPTE", date_emission="2023-01-11", date_decision="2023-01-13"), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, statut="REFUSE",  date_emission="2023-01-12", date_decision="2023-01-14", motif_refus="Trop cher"), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_conversion_nb"] == pytest.approx(200 / 3, abs=0.1)


def test_kpi_mensuel_taux_conversion_montant(prat_headers, praticien_id):
    # Accepté 3000 € + Refusé 1000 € → 75 %
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=3000, statut="ACCEPTE", date_emission="2023-01-10", date_decision="2023-01-12"), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=1000, statut="REFUSE",  date_emission="2023-01-11", date_decision="2023-01-13", motif_refus="Trop cher"), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_conversion_montant"] == pytest.approx(75.0, abs=0.1)


def test_kpi_mensuel_ratio_charges(prat_headers, praticien_id):
    # CA=20000, charge mensuelle=4000 → ratio=20 %
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    client.post("/api/v1/charges/", json=_charge(praticien_id, montant=4000), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["charges_mensuelles"] == pytest.approx(4000.0)
    assert d["ratio_charges"] == pytest.approx(20.0)


def test_kpi_mensuel_salaire_estime(prat_headers, praticien_id):
    # CA=20000, charges=5000 → salaire estimé=15000
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    client.post("/api/v1/charges/", json=_charge(praticien_id, montant=5000), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["salaire_estime"] == pytest.approx(15000.0)


def test_kpi_mensuel_salaire_par_taux_structure(prat_headers, praticien_id):
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    spt = d["salaire_par_taux"]
    assert set(spt.keys()) == {"15", "16", "18", "19", "20"}
    assert spt["15"] == pytest.approx(20000 * 0.15)
    assert spt["18"] == pytest.approx(20000 * 0.18)
    assert spt["20"] == pytest.approx(20000 * 0.20)


def test_kpi_mensuel_taux_atteinte_ca(prat_headers, praticien_id):
    # CA=16000, cible=20000 → 80 %
    client.post("/api/v1/performances/", json=_perf(praticien_id, ca=16000), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_atteinte_ca"] == pytest.approx(80.0)


def test_kpi_mensuel_taux_proposition(prat_headers, praticien_id):
    # 5 devis pour 10 patients → 50 %
    client.post("/api/v1/journees/", json=_journee(praticien_id, nb_patients=10), headers=prat_headers)
    for i in range(5):
        client.post("/api/v1/devis/", json=_devis(praticien_id, date_emission=f"2023-01-{10+i}"), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_proposition"] == pytest.approx(50.0)


def test_kpi_mensuel_taux_desistement_nouveaux(prat_headers, praticien_id):
    # 3 nouveaux vus + 1 non-honoré nouveau → 1/(3+1)=25 %
    client.post("/api/v1/journees/", json=_journee(praticien_id, nb_nouveaux=3, nb_mq_nv=1), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["taux_desistement_nouveaux"] == pytest.approx(25.0)


def test_kpi_mensuel_cout_absenteisme(prat_headers, praticien_id):
    # THR=20000/7, perdu=60min=1h → coût=20000/7≈2857
    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    client.post("/api/v1/journees/", json=_journee(praticien_id, presence=480, perdu=60), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["cout_absenteisme"] == pytest.approx(20000 / 7, rel=1e-2)


def test_kpi_mensuel_ratio_anticipation(prat_headers, praticien_id):
    # 50000 € de devis émis / CA cible 20000 → ratio=2.5
    for i in range(5):
        client.post("/api/v1/devis/", json=_devis(praticien_id, montant=10000, date_emission=f"2023-01-{5+i:02d}"), headers=prat_headers)
    d = client.get(_kpi_url(), headers=prat_headers).json()
    assert d["montant_devis_emis"] == pytest.approx(50000.0)
    assert d["ratio_anticipation"] == pytest.approx(2.5)


def test_kpi_mensuel_isolation_entre_praticiens(prat_headers, praticien_id, sec_headers):
    # Les données du Dr. Test ne doivent pas apparaître pour un autre praticien
    client.post("/api/v1/praticiens/", json={"nom": "Dr. Autre", "pin_clair": "222222"}, headers=sec_headers)
    db = TestingSessionLocal()
    autre = db.query(models.Praticien).filter(models.Praticien.nom == "Dr. Autre").first()
    assert autre is not None
    db.close()
    autre_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(autre.id_praticien), 'role': 'praticien'})}"}

    client.post("/api/v1/performances/", json=_perf(praticien_id), headers=prat_headers)
    client.post("/api/v1/journees/", json=_journee(praticien_id), headers=prat_headers)

    d = client.get(_kpi_url(), headers=autre_headers).json()
    assert d["ca_declare"] is None
    assert d["nb_patients_vus"] == 0
    assert d["nb_devis_emis"] == 0


# ============================================================
# TESTS D'INTÉGRATION — /kpis/hebdomadaire
# ============================================================

def test_kpi_hebdo_sans_token_retourne_401():
    assert client.get(_hebdo_url()).status_code == 401


def test_kpi_hebdo_semaine_vide(prat_headers):
    d = client.get(_hebdo_url(), headers=prat_headers).json()
    assert d["temps_productif_minutes"] == 0
    assert d["taux_occupation"] is None
    assert d["nb_devis_emis"] == 0


def test_kpi_hebdo_taux_occupation(prat_headers, praticien_id):
    # présence=480, perdu=60 → productif=420 → taux=87.5 %
    client.post("/api/v1/journees/", json=_journee(praticien_id, date_jour=LUNDI.isoformat()), headers=prat_headers)
    d = client.get(_hebdo_url(), headers=prat_headers).json()
    assert d["temps_productif_minutes"] == 420
    assert d["temps_perdu_minutes"] == 60
    assert d["taux_occupation"] == pytest.approx(87.5)


def test_kpi_hebdo_ratio_anticipation(prat_headers, praticien_id):
    # Devis=3000 €, CA cible mensuelle=20000 → hebdo cible=5000 → ratio=0.60
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=3000, date_emission=LUNDI.isoformat()), headers=prat_headers)
    d = client.get(_hebdo_url(), headers=prat_headers).json()
    assert d["montant_devis_semaine"] == pytest.approx(3000.0)
    assert d["ratio_anticipation"] == pytest.approx(3000 / (20000 / 4), rel=1e-2)


def test_kpi_hebdo_devis_hors_semaine_exclus(prat_headers, praticien_id):
    # Devis émis la semaine précédente ne doit pas apparaître
    semaine_prec = (LUNDI - timedelta(days=7)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, date_emission=semaine_prec), headers=prat_headers)
    d = client.get(_hebdo_url(), headers=prat_headers).json()
    assert d["nb_devis_emis"] == 0


# ============================================================
# TESTS D'INTÉGRATION — /kpis/encours
# ============================================================

def test_kpi_encours_sans_token_retourne_401():
    assert client.get("/api/v1/kpis/encours").status_code == 401


def test_kpi_encours_vide(prat_headers):
    d = client.get("/api/v1/kpis/encours", headers=prat_headers).json()
    assert d["total"] == 0
    assert d["montant_total"] == pytest.approx(0.0)


def test_kpi_encours_devis_recent_exclu(prat_headers, praticien_id):
    # Devis d'aujourd'hui → dans le délai de relance (15j) → non inclus
    client.post("/api/v1/devis/", json=_devis(praticien_id, date_emission=TODAY.isoformat()), headers=prat_headers)
    assert client.get("/api/v1/kpis/encours", headers=prat_headers).json()["total"] == 0


def test_kpi_encours_devis_ancien_inclus(prat_headers, praticien_id):
    # Devis émis il y a 30 jours (> 15j de délai) → dans l'encours
    date_30j = (TODAY - timedelta(days=30)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, date_emission=date_30j), headers=prat_headers)
    d = client.get("/api/v1/kpis/encours", headers=prat_headers).json()
    assert d["total"] == 1
    assert d["devis"][0]["jours_attente"] == 30


def test_kpi_encours_filtre_seuil(prat_headers, praticien_id):
    date_30j = (TODAY - timedelta(days=30)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=300, date_emission=date_30j), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=800, date_emission=date_30j), headers=prat_headers)
    d = client.get("/api/v1/kpis/encours?seuil=500", headers=prat_headers).json()
    assert d["total"] == 1
    assert d["devis"][0]["montant"] == pytest.approx(800.0)


def test_kpi_encours_devis_accepte_exclu(prat_headers, praticien_id):
    # Seuls les EN_ATTENTE doivent apparaître
    date_30j = (TODAY - timedelta(days=30)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, statut="ACCEPTE", date_emission=date_30j, date_decision=date_30j), headers=prat_headers)
    assert client.get("/api/v1/kpis/encours", headers=prat_headers).json()["total"] == 0


def test_kpi_encours_montant_total(prat_headers, praticien_id):
    date_30j = (TODAY - timedelta(days=30)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=1000, date_emission=date_30j), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=2500, date_emission=date_30j), headers=prat_headers)
    d = client.get("/api/v1/kpis/encours", headers=prat_headers).json()
    assert d["total"] == 2
    assert d["montant_total"] == pytest.approx(3500.0)


def test_kpi_encours_delai_depuis_parametres(prat_headers, praticien_id):
    # Le délai retourné correspond au paramètre du praticien (15j dans le fixture)
    d = client.get("/api/v1/kpis/encours", headers=prat_headers).json()
    assert d["delai_relance_jours"] == 15


def test_kpi_encours_tri_par_date_emission(prat_headers, praticien_id):
    # Les devis doivent être triés du plus ancien au plus récent
    date_40j = (TODAY - timedelta(days=40)).isoformat()
    date_20j = (TODAY - timedelta(days=20)).isoformat()
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=500, date_emission=date_20j), headers=prat_headers)
    client.post("/api/v1/devis/", json=_devis(praticien_id, montant=700, date_emission=date_40j), headers=prat_headers)
    d = client.get("/api/v1/kpis/encours", headers=prat_headers).json()
    assert d["devis"][0]["jours_attente"] > d["devis"][1]["jours_attente"]
