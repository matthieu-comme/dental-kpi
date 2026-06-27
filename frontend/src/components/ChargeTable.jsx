import { useState, useEffect, useRef } from "react";
import ChargeForm from "./ChargeForm";
import ExportCsv from "./ExportCsv";
import Pagination from "./Pagination";
import { formatApiErrors } from "../utils/apiErrors";

import { API_BASE } from '../utils/api'

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pageRef = useRef(page);
  pageRef.current = page;
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;

  async function load() {
    const f = filtersRef.current;
    setLoading(true);
    setFetchError("");
    const params = new URLSearchParams();
    if (f.designation) params.set("designation", f.designation);
    if (f.periodicite) params.set("periodicite", f.periodicite);
    if (f.dateFrom) params.set("date_from", f.dateFrom);
    if (f.dateTo) params.set("date_to", f.dateTo);
    if (f.montantMin) params.set("montant_min", f.montantMin);
    if (f.montantMax) params.set("montant_max", f.montantMax);
    params.set("skip", (pageRef.current - 1) * pageSizeRef.current);
    params.set("limit", pageSizeRef.current);
    try {
      const res = await fetch(`${API_BASE}/api/v1/charges/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
        setTotal(parseInt(res.headers.get("x-total-count") ?? "0", 10));
      } else setFetchError("Impossible de charger les charges.");
    } catch {
      setFetchError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [token, filters, page, pageSize]);

  function onFilterChange(e) {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
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
          formatApiErrors(result.detail)
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

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer la charge "${item.designation}" ?\nCette action est irréversible.`)) return
    try {
      const res = await fetch(`${API_BASE}/api/v1/charges/${item.id_charge}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setFeedback({ type: 'success', message: `Charge "${item.designation}" supprimée.` })
        load()
      } else {
        const d = await res.json()
        setFeedback({ type: 'error', message: d.detail || 'Erreur lors de la suppression.' })
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau.' })
    }
  }

  return (
    <div className="data-section">
      <div className="data-section-header">
        <h2>Mes charges</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ExportCsv token={token} resources={['charges']} />
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            + Ajouter une charge
          </button>
        </div>
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
          onClick={() => { setFilters(INIT_FILTERS); setPage(1); }}
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
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      Aucun résultat
                    </td>
                  </tr>
                ) : (
                  data.map((c) => (
                    <tr key={c.id_charge}>
                      <td>{c.id_charge}</td>
                      <td>{c.designation}</td>
                      <td>{c.montant.toFixed(2)} €</td>
                      <td>{PERIO_LABELS[c.periodicite] ?? c.periodicite}</td>
                      <td>{c.date_debut}</td>
                      <td>{c.date_fin ?? "—"}</td>
                      <td>{c.lissage_mensuel ? "Oui" : "Non"}</td>
                      <td>
                        <div className="action-btns">
                          <button
                            className="btn-action btn-action--edit"
                            onClick={() => openEdit(c)}
                          >
                            Modifier
                          </button>
                          <button
                            className="btn-action btn-action--delete"
                            onClick={() => handleDelete(c)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
