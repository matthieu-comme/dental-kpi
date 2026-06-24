import { useState, useEffect, useMemo } from 'react'

import { API_BASE } from '../utils/api'

const TYPE_ACTION_LABELS = {
  SMS_ENVOYE: 'SMS envoyé',
  ALERTE_SECRETAIRE_CREEE: 'Alerte secrétaire',
  ALERTE_PRATICIEN_CREEE: 'Alerte praticien',
  ERREUR_RESEAU: 'Erreur réseau',
  AJOUT_DEVIS: 'Ajout devis',
  MODIF_DEVIS: 'Modif. devis',
  SUPPR_DEVIS: 'Suppr. devis',
  AJOUT_CHEQUE: 'Ajout chèque',
  MODIF_CHEQUE: 'Modif. chèque',
  SUPPR_CHEQUE: 'Suppr. chèque',
}

const INIT_FILTERS = {
  typeAction: '',
  typeEntite: '',
  dateFrom: '',
  dateTo: '',
  recherche: '',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function LogsTable({ token }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [filters, setFilters] = useState(INIT_FILTERS)

  useEffect(() => {
    setLoading(true)
    setFetchError('')
    fetch(`${API_BASE}/api/v1/systeme/logs?limit=1000`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setFetchError('Impossible de charger les logs.'))
      .finally(() => setLoading(false))
  }, [token])

  const filtered = useMemo(() => data.filter(log => {
    if (filters.typeAction && log.type_action !== filters.typeAction) return false
    if (filters.typeEntite && log.type_entite !== filters.typeEntite) return false
    if (filters.dateFrom) {
      const logDate = log.date_evenement.slice(0, 10)
      if (logDate < filters.dateFrom) return false
    }
    if (filters.dateTo) {
      const logDate = log.date_evenement.slice(0, 10)
      if (logDate > filters.dateTo) return false
    }
    if (filters.recherche) {
      const q = filters.recherche.toLowerCase()
      if (!log.details.toLowerCase().includes(q)) return false
    }
    return true
  }), [data, filters])

  function onFilterChange(e) {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="data-section">
      <div className="filters-bar">
        <div className="filter-item">
          <label>Action</label>
          <select name="typeAction" value={filters.typeAction} onChange={onFilterChange}>
            <option value="">Toutes</option>
            {Object.entries(TYPE_ACTION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label>Entité</label>
          <select name="typeEntite" value={filters.typeEntite} onChange={onFilterChange}>
            <option value="">Toutes</option>
            <option value="DEVIS">Devis</option>
            <option value="CHEQUE">Chèque</option>
          </select>
        </div>
        <div className="filter-item">
          <label>Du</label>
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={onFilterChange} />
        </div>
        <div className="filter-item">
          <label>Au</label>
          <input type="date" name="dateTo" value={filters.dateTo} onChange={onFilterChange} />
        </div>
        <div className="filter-item">
          <label>Recherche dans les détails</label>
          <input
            type="text"
            name="recherche"
            value={filters.recherche}
            onChange={onFilterChange}
            placeholder="mot-clé..."
          />
        </div>
        <button className="btn-ghost-sm" onClick={() => setFilters(INIT_FILTERS)}>
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
                  <th>Date</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>ID entité</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">Aucun résultat</td>
                  </tr>
                ) : filtered.map(log => (
                  <tr key={log.id_log}>
                    <td>{log.id_log}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.date_evenement)}</td>
                    <td>{TYPE_ACTION_LABELS[log.type_action] ?? log.type_action}</td>
                    <td>{log.type_entite ?? '—'}</td>
                    <td>{log.id_entite ?? '—'}</td>
                    <td>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-count">{filtered.length} résultat(s)</p>
        </>
      )}
    </div>
  )
}
