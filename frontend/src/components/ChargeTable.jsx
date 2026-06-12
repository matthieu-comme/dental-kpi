import { useState, useEffect, useMemo } from "react";
import ChargeForm from "./ChargeForm";

const API_BASE = "http://localhost:8000";

const PERIO_LABELS = {
  PONCTUEL: "Ponctuel",
  MENSUEL: "Mensuel",
  TRIMESTRIEL: "Trimestriel",
  ANNUEL: "Annuel",
};

const INIT_FILTERS = {
  designation: "",
  periodicite: "",
  dateFrom: "",
  dateTo: "",
  montantMin: "",
  montantMax: "",
};

function buildEditForm(item) {
  return {
    designation: item.designation,
    montant: String(item.montant),
    periodicite: item.periodicite,
    date_debut: item.date_debut,
    date_fin: item.date_fin ?? "",
    lissage_mensuel: item.lissage_mensuel,
  };
}

export default function ChargeTable({ token, idPraticien }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filters, setFilters] = useState(INIT_FILTERS);
  const [feedback, setFeedback] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  async function load() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/charges/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
      else setFetchError("Impossible de charger les charges.");
    } catch {
      setFetchError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = useMemo(
    () =>
      data.filter((c) => {
        if (
          filters.designation &&
          !c.designation.toLowerCase().includes(filters.designation.toLowerCase())
        )
          return false;
        if (filters.periodicite && c.periodicite !== filters.periodicite)
          return false;
        if (filters.dateFrom && c.date_debut < filters.dateFrom) return false;
        if (filters.dateTo && c.date_debut > filters.dateTo) return false;
        if (
          filters.montantMin &&
          c.montant < parseFloat(filters.montantMin)
        )
          return false;
        if (
          filters.montantMax &&
          c.montant > parseFloat(filters.montantMax)
        )
          return false;
        return true;
      }),
    [data, filters]
  );

  function onFilterChange(e) {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm(buildEditForm(item));
    setEditError("");
  }

  function onEditChange(e) {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");

    const payload = {
      designation: editForm.designation,
      montant: parseFloat(editForm.montant),
      periodicite: editForm.periodicite,
      date_debut: editForm.date_debut,
      lissage_mensuel: editForm.lissage_mensuel,
    };
    if (editForm.periodicite !== "PONCTUEL" && editForm.date_fin) {
      payload.date_fin = editForm.date_fin;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/charges/${editItem.id_charge}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setEditError(
          Array.isArray(result.detail)
            ? result.detail.map((d) => d.msg).join(", ")
            : result.detail
        );
      } else {
        setEditItem(null);
        setFeedback({
          type: "success",
          message: `Charge "${result.designation}" modifiée.`,
        });
        load();
      }
    } catch {
      setEditError("Erreur réseau.");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="data-section">
      <div className="data-section-header">
        <h2>Mes charges</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          + Ajouter une charge
        </button>
      </div>

      {feedback && (
        <div className={`alert alert--${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="filters-bar">
        <div className="filter-item">
          <label>Désignation</label>
          <input
            type="text"
            name="designation"
            value={filters.designation}
            onChange={onFilterChange}
            placeholder="Rechercher..."
          />
        </div>
        <div className="filter-item">
          <label>Périodicité</label>
          <select
            name="periodicite"
            value={filters.periodicite}
            onChange={onFilterChange}
          >
            <option value="">Toutes</option>
            <option value="PONCTUEL">Ponctuel</option>
            <option value="MENSUEL">Mensuel</option>
            <option value="TRIMESTRIEL">Trimestriel</option>
            <option value="ANNUEL">Annuel</option>
          </select>
        </div>
        <div className="filter-item">
          <label>Date début — du</label>
          <input
            type="date"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={onFilterChange}
          />
        </div>
        <div className="filter-item">
          <label>au</label>
          <input
            type="date"
            name="dateTo"
            value={filters.dateTo}
            onChange={onFilterChange}
          />
        </div>
        <div className="filter-item">
          <label>Montant min (€)</label>
          <input
            type="number"
            name="montantMin"
            value={filters.montantMin}
            onChange={onFilterChange}
            min="0"
            step="0.01"
            placeholder="0"
          />
        </div>
        <div className="filter-item">
          <label>Montant max (€)</label>
          <input
            type="number"
            name="montantMax"
            value={filters.montantMax}
            onChange={onFilterChange}
            min="0"
            step="0.01"
            placeholder="∞"
          />
        </div>
        <button
          className="btn-ghost-sm"
          onClick={() => setFilters(INIT_FILTERS)}
        >
          Réinitialiser
        </button>
      </div>

      {loading && <p className="text-muted">Chargement...</p>}
      {fetchError && <div className="alert alert--error">{fetchError}</div>}

      {!loading && !fetchError && (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Désignation</th>
                  <th>Montant</th>
                  <th>Périodicité</th>
                  <th>Date début</th>
                  <th>Date fin</th>
                  <th>Lissage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      Aucun résultat
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id_charge}>
                      <td>{c.id_charge}</td>
                      <td>{c.designation}</td>
                      <td>{c.montant.toFixed(2)} €</td>
                      <td>{PERIO_LABELS[c.periodicite] ?? c.periodicite}</td>
                      <td>{c.date_debut}</td>
                      <td>{c.date_fin ?? "—"}</td>
                      <td>{c.lissage_mensuel ? "Oui" : "Non"}</td>
                      <td>
                        <button
                          className="btn-action btn-action--edit"
                          onClick={() => openEdit(c)}
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="table-count">{filtered.length} résultat(s)</p>
        </>
      )}

      {showAddModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Ajouter une charge</h3>
              <button
                className="modal-close"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <ChargeForm
              token={token}
              idPraticien={idPraticien}
              embedded
              onSuccess={() => {
                setShowAddModal(false);
                load();
              }}
            />
          </div>
        </div>
      )}

      {editItem && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditItem(null);
          }}
        >
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Modifier la charge #{editItem.id_charge}</h3>
              <button
                className="modal-close"
                onClick={() => setEditItem(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditSubmit} noValidate>
              {editError && (
                <div className="alert alert--error">{editError}</div>
              )}
              <div className="form-group">
                <label>Désignation *</label>
                <input
                  type="text"
                  name="designation"
                  value={editForm.designation}
                  onChange={onEditChange}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Montant (€) *</label>
                  <input
                    type="number"
                    name="montant"
                    value={editForm.montant}
                    onChange={onEditChange}
                    required
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Périodicité *</label>
                  <select
                    name="periodicite"
                    value={editForm.periodicite}
                    onChange={onEditChange}
                    required
                  >
                    <option value="PONCTUEL">Ponctuel</option>
                    <option value="MENSUEL">Mensuel</option>
                    <option value="TRIMESTRIEL">Trimestriel</option>
                    <option value="ANNUEL">Annuel</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date de début *</label>
                  <input
                    type="date"
                    name="date_debut"
                    value={editForm.date_debut}
                    onChange={onEditChange}
                    required
                    min="2020-01-01"
                  />
                </div>
                {editForm.periodicite !== "PONCTUEL" && (
                  <div className="form-group">
                    <label>Date de fin</label>
                    <input
                      type="date"
                      name="date_fin"
                      value={editForm.date_fin}
                      onChange={onEditChange}
                      min={editForm.date_debut || "2020-01-02"}
                    />
                  </div>
                )}
              </div>
              <div className="form-group form-group--checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="lissage_mensuel"
                    checked={editForm.lissage_mensuel}
                    onChange={onEditChange}
                  />
                  <span>Lissage mensuel</span>
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setEditItem(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={editLoading}
                >
                  {editLoading ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
