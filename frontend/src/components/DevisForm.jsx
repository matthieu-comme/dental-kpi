import { useState } from "react";

const API_BASE = "http://localhost:8000";

const initialState = {
  id_patient: "",
  montant: "",
  temps_previsionnel_minutes: "",
  date_emission: "",
  date_decision: "",
  statut: "EN_ATTENTE",
  motif_refus: "",
};

export default function DevisForm({ token, idPraticien }) {
  const [form, setForm] = useState(initialState);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const payload = {
      id_patient: form.id_patient,
      montant: parseFloat(form.montant),
      temps_previsionnel_minutes: parseInt(form.temps_previsionnel_minutes, 10),
      date_emission: form.date_emission,
      statut: form.statut,
      id_praticien: idPraticien,
    };

    if (form.date_decision) payload.date_decision = form.date_decision;
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
        const detail = Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).join(", ")
          : data.detail;
        setFeedback({
          type: "error",
          message: detail || "Une erreur est survenue.",
        });
      } else {
        setFeedback({
          type: "success",
          message: `Devis #${data.id_devis} créé avec succès pour le patient ${data.id_patient}.`,
        });
        setForm(initialState);
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

  return (
    <div className="form-card">
      <h2>Enregistrer un devis</h2>

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
            <label htmlFor="d-temps">Temps prévisionnel (min) *</label>
            <input
              id="d-temps"
              type="number"
              name="temps_previsionnel_minutes"
              value={form.temps_previsionnel_minutes}
              onChange={handleChange}
              required
              min="1"
              placeholder=""
            />
          </div>
        </div>

        <div className="form-row">
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

          <div className="form-group">
            <label htmlFor="d-date_decision">Date de décision</label>
            <input
              id="d-date_decision"
              type="date"
              name="date_decision"
              value={form.date_decision}
              onChange={handleChange}
              min={form.date_emission || "2020-01-02"}
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

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Envoi en cours..." : "Enregistrer le devis"}
        </button>
      </form>
    </div>
  );
}
