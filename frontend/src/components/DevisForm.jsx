import { useState } from "react";

import { API_BASE } from '../utils/api'
import { formatApiErrors } from '../utils/apiErrors'

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const initialState = {
  id_patient: "",
  temps_time: "",
  montant: "",
  date_emission: todayStr(),
  date_decision: "",
  statut: "EN_ATTENTE",
  motif_refus: "",
};

export default function DevisForm({ token, idPraticien, embedded = false, onSuccess }) {
  const [form, setForm] = useState(initialState);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: name === "id_patient" ? value.replace(/\D/g, "") : value };
      if (name === "statut") {
        if (value === "EN_ATTENTE") {
          next.date_decision = "";
        } else if (!next.date_decision) {
          next.date_decision = todayStr();
        }
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    const _decisionAuto = form.statut !== "EN_ATTENTE" && form.date_emission === todayStr();
    if (form.statut !== "EN_ATTENTE" && !_decisionAuto && !form.date_decision) {
      setFeedback({ type: "error", message: "La date de décision est requise pour un devis accepté ou refusé." });
      return;
    }
    if (form.statut === "REFUSE" && !form.motif_refus.trim()) {
      setFeedback({ type: "error", message: "Le motif de refus est obligatoire." });
      return;
    }

    setLoading(true);

    const payload = {
      id_patient: form.id_patient,
      montant: parseFloat(form.montant),
      temps_previsionnel_minutes: timeToMin(form.temps_time),
      date_emission: form.date_emission,
      statut: form.statut,
      id_praticien: idPraticien,
      date_decision: form.statut !== "EN_ATTENTE" ? (_decisionAuto ? todayStr() : form.date_decision) : null,
    };

    if (form.statut === "REFUSE") payload.motif_refus = form.motif_refus;

    try {
      const res = await fetch(`${API_BASE}/api/v1/devis/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message: formatApiErrors(data.detail),
        });
      } else {
        setFeedback({
          type: "success",
          message: `Devis #${data.id_devis} créé avec succès pour le patient ${data.id_patient}.`,
        });
        setForm(initialState);
        onSuccess?.();
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Erreur réseau. Vérifiez que le serveur est démarré.",
      });
    } finally {
      setLoading(false);
    }
  }

  const decisionAuto = form.statut !== "EN_ATTENTE" && form.date_emission === todayStr();

  const formContent = (
    <>
      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="d-id_patient">ID Patient *</label>
          <input
            id="d-id_patient"
            type="text"
            inputMode="numeric"
            name="id_patient"
            value={form.id_patient}
            onChange={handleChange}
            required
            placeholder=""
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="d-montant">Montant (€) *</label>
            <input
              id="d-montant"
              type="number"
              name="montant"
              value={form.montant}
              onChange={handleChange}
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label htmlFor="d-temps">Temps prévisionnel *</label>
            <input
              id="d-temps"
              type="time"
              name="temps_time"
              value={form.temps_time}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div>
          <div className="form-group">
            <label htmlFor="d-date_emission">Date d'émission *</label>
            <input
              id="d-date_emission"
              type="date"
              name="date_emission"
              value={form.date_emission}
              onChange={handleChange}
              required
              min="2020-01-02"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="d-statut">Statut *</label>
          <select
            id="d-statut"
            name="statut"
            value={form.statut}
            onChange={handleChange}
            required
          >
            <option value="EN_ATTENTE">En attente</option>
            <option value="ACCEPTE">Accepté</option>
            <option value="REFUSE">Refusé</option>
          </select>
        </div>

        {form.statut !== "EN_ATTENTE" && !decisionAuto && (
          <div className="form-group">
            <label htmlFor="d-date_decision">Date de décision *</label>
            <input
              id="d-date_decision"
              type="date"
              name="date_decision"
              value={form.date_decision}
              onChange={handleChange}
              min={form.date_emission || "2020-01-02"}
              required
            />
          </div>
        )}

        {form.statut === "REFUSE" && (
          <div className="form-group">
            <label htmlFor="d-motif_refus">Motif de refus *</label>
            <textarea
              id="d-motif_refus"
              name="motif_refus"
              value={form.motif_refus}
              onChange={handleChange}
              required
              rows={3}
              placeholder=""
            />
          </div>
        )}

        <button
          type="submit"
          className={`btn-primary${embedded ? " btn-full" : ""}`}
          disabled={loading}
        >
          {loading ? "Envoi en cours..." : "Enregistrer le devis"}
        </button>
      </form>
    </>
  );

  if (embedded) return formContent;

  return (
    <div className="form-card">
      <h2>Enregistrer un devis</h2>
      {formContent}
    </div>
  );
}
