import { useState } from "react";

const API_BASE = "http://localhost:8000";

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return date.toLocaleDateString("en-CA");
}

const initialState = {
  id_patient: "",
  montant: "",
  date_reception: todayStr(),
  date_depot_prevue: addDays(todayStr(), 30),
  statut: "EN_ATTENTE",
};

export default function ChequeForm({ token, idPraticien }) {
  const [form, setForm] = useState(initialState);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: name === "id_patient" ? value.replace(/\D/g, "") : value };
      if (name === "date_reception" && value) {
        next.date_depot_prevue = addDays(value, 30);
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const payload = {
      id_patient: form.id_patient,
      montant: parseFloat(form.montant),
      date_reception: form.date_reception,
      statut: form.statut,
      id_praticien: idPraticien,
    };

    if (form.date_depot_prevue)
      payload.date_depot_prevue = form.date_depot_prevue;

    try {
      const res = await fetch(`${API_BASE}/api/v1/cheques/`, {
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
          message: `Chèque #${data.id_cheque} créé avec succès pour le patient ${data.id_patient}.`,
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
      <h2>Enregistrer un chèque</h2>

      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="c-id_patient">ID Patient *</label>
          <input
            id="c-id_patient"
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
            <label htmlFor="c-montant">Montant (€) *</label>
            <input
              id="c-montant"
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
            <label htmlFor="c-statut">Statut *</label>
            <select
              id="c-statut"
              name="statut"
              value={form.statut}
              onChange={handleChange}
              required
            >
              <option value="EN_ATTENTE">En attente</option>
              <option value="DEPOSE">Déposé</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="c-date_reception">Date de réception *</label>
            <input
              id="c-date_reception"
              type="date"
              name="date_reception"
              value={form.date_reception}
              onChange={handleChange}
              required
              min="2020-01-02"
            />
          </div>

          <div className="form-group">
            <label htmlFor="c-date_depot_prevue">Date de dépôt prévue</label>
            <input
              id="c-date_depot_prevue"
              type="date"
              name="date_depot_prevue"
              value={form.date_depot_prevue}
              onChange={handleChange}
              min={form.date_reception || "2020-01-02"}
            />
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Envoi en cours..." : "Enregistrer le chèque"}
        </button>
      </form>
    </div>
  );
}
