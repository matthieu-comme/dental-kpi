import { useState } from 'react'

import { API_BASE } from '../utils/api'

const RESOURCES = {
  devis: {
    label: 'Devis',
    columns: [
      { key: 'id_devis', label: 'N° devis' },
      { key: 'id_praticien', label: 'N° praticien' },
      { key: 'id_patient', label: 'N° patient' },
      { key: 'montant', label: 'Montant (€)' },
      { key: 'temps_previsionnel_minutes', label: 'Temps prévu (min)' },
      { key: 'date_emission', label: 'Date émission' },
      { key: 'date_decision', label: 'Date décision' },
      { key: 'statut', label: 'Statut' },
      { key: 'motif_refus', label: 'Motif refus' },
    ],
  },
  cheques: {
    label: 'Chèques',
    columns: [
      { key: 'id_cheque', label: 'N° chèque' },
      { key: 'id_praticien', label: 'N° praticien' },
      { key: 'id_patient', label: 'N° patient' },
      { key: 'montant', label: 'Montant (€)' },
      { key: 'date_reception', label: 'Date réception' },
      { key: 'date_depot_prevue', label: 'Date dépôt prévue' },
      { key: 'statut', label: 'Statut' },
    ],
  },
  journees: {
    label: 'Journées',
    columns: [
      { key: 'id_journee', label: 'N° journée' },
      { key: 'id_praticien', label: 'N° praticien' },
      { key: 'date_jour', label: 'Date' },
      { key: 'nb_patients_vus', label: 'Patients vus' },
      { key: 'nb_nouveaux_patients', label: 'Nouveaux patients' },
      { key: 'nb_rdv_manques_connus', label: 'RDV manqués connus' },
      { key: 'nb_rdv_manques_nouveaux', label: 'RDV manqués nouveaux' },
      { key: 'temps_presence_minutes', label: 'Présence (min)' },
      { key: 'temps_perdu_minutes', label: 'Temps perdu (min)' },
    ],
  },
  charges: {
    label: 'Charges',
    columns: [
      { key: 'id_charge', label: 'N° charge' },
      { key: 'id_praticien', label: 'N° praticien' },
      { key: 'designation', label: 'Désignation' },
      { key: 'montant', label: 'Montant (€)' },
      { key: 'periodicite', label: 'Périodicité' },
      { key: 'date_debut', label: 'Date début' },
      { key: 'date_fin', label: 'Date fin' },
      { key: 'lissage_mensuel', label: 'Lissage mensuel' },
    ],
  },
}

export default function ExportCsv({ token, resources: allowedKeys, standalone = false }) {
  const [open, setOpen] = useState(false)
  const [resource, setResource] = useState(null)
  const [selectedCols, setSelectedCols] = useState([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const entries = (allowedKeys ?? Object.keys(RESOURCES))
    .filter(k => RESOURCES[k])
    .map(k => [k, RESOURCES[k]])

  function pickResource(key) {
    setResource(key)
    setSelectedCols(RESOURCES[key].columns.map(c => c.key))
    setError('')
    setSuccess('')
  }

  function toggleCol(key) {
    setSelectedCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function toggleAll() {
    const all = RESOURCES[resource].columns.map(c => c.key)
    setSelectedCols(prev => (prev.length === all.length ? [] : all))
  }

  function reset() {
    setResource(null)
    setSelectedCols([])
    setError('')
    setSuccess('')
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  async function handleExport() {
    if (!resource || selectedCols.length === 0) {
      setError('Sélectionnez au moins une colonne.')
      return
    }
    setExporting(true)
    setError('')
    setSuccess('')
    const params = new URLSearchParams({ resource, columns: selectedCols.join(',') })
    try {
      const res = await fetch(`${API_BASE}/api/v1/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || "Erreur lors de l'export.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${resource}_export.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      if (standalone) {
        setSuccess(`Fichier ${resource}_export.csv téléchargé.`)
      } else {
        handleClose()
      }
    } catch {
      setError('Erreur réseau.')
    } finally {
      setExporting(false)
    }
  }

  const allCols = resource ? RESOURCES[resource].columns.map(c => c.key) : []
  const allSelected = selectedCols.length === allCols.length && allCols.length > 0

  const formBody = (
    <>
      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      <div className="form-group">
        <label>Type de données</label>
        <div className="export-type-tabs">
          {entries.map(([key, cfg]) => (
            <button
              key={key}
              className={`export-type-tab${resource === key ? ' export-type-tab--active' : ''}`}
              onClick={() => pickResource(key)}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {resource && (
        <div className="form-group">
          <div className="export-cols-header">
            <label>Colonnes à exporter ({selectedCols.length}/{allCols.length})</label>
            <button className="btn-ghost-sm" type="button" onClick={toggleAll}>
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="export-cols-grid">
            {RESOURCES[resource].columns.map(col => (
              <label key={col.key} className="export-col-item">
                <input
                  type="checkbox"
                  checked={selectedCols.includes(col.key)}
                  onChange={() => toggleCol(col.key)}
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="modal-actions">
        {!standalone && (
          <button className="btn-ghost" onClick={handleClose}>Annuler</button>
        )}
        <button
          className="btn-primary"
          onClick={handleExport}
          disabled={!resource || selectedCols.length === 0 || exporting}
        >
          {exporting ? 'Export en cours…' : 'Télécharger'}
        </button>
      </div>
    </>
  )

  if (standalone) {
    return (
      <div className="data-section">
        <div className="data-section-header">
          <h2>Exporter en CSV</h2>
        </div>
        {formBody}
      </div>
    )
  }

  return (
    <>
      <button className="btn-ghost-sm" onClick={() => setOpen(true)}>
        ↓ Exporter CSV
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="modal-card modal-card--wide">
            <div className="modal-header">
              <h3>Exporter en CSV</h3>
              <button className="modal-close" onClick={handleClose}>×</button>
            </div>
            {formBody}
          </div>
        </div>
      )}
    </>
  )
}
