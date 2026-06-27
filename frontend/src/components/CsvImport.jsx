import { useState, useRef } from 'react'

import { API_BASE } from '../utils/api'
import { formatApiErrors } from '../utils/apiErrors'

const TYPES = {
  devis: {
    label: 'Devis',
    colonnes: 'id_patient,montant,temps_previsionnel_minutes,date_emission,statut,date_decision,motif_refus',
    exemple: [
      'P001,1500.00,60,2024-01-15,EN_ATTENTE,,',
      'P002,3000.00,120,2024-01-16,ACCEPTE,2024-01-20,',
    ],
  },
  cheques: {
    label: 'Chèques',
    colonnes: 'id_patient,montant,date_reception,date_depot_prevue,statut',
    exemple: [
      'P001,250.00,2024-01-15,2024-02-01,EN_ATTENTE',
      'P002,500.00,2024-01-16,,EN_ATTENTE',
    ],
  },
}

function downloadTemplate(type) {
  const t = TYPES[type]
  const csv = [t.colonnes, ...t.exemple].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `template_${type}.csv`
  a.click()
}

export default function CsvImport({ token, idPraticien, onSuccess }) {
  const [type, setType]       = useState('devis')
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `${API_BASE}/api/v1/imports/${type}?id_praticien=${idPraticien}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
      )
      const data = await res.json()
      setResult(data)
      if (data.importes > 0) onSuccess?.()
    } catch {
      setResult({ total: 0, importes: 0, erreurs: [{ ligne: '—', message: 'Erreur réseau.' }] })
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setResult(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadErreurs() {
    const cols = t.colonnes.split(',')
    const rows = result.erreurs
      .filter(e => e.row)
      .map(e => cols.map(c => {
        const val = (e.row[c] ?? '').toString()
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(','))
    const csv = [t.colonnes, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erreurs_${type}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const t = TYPES[type]

  return (
    <div className="csv-import">
      <div className="csv-import__type-bar">
        {Object.entries(TYPES).map(([key, val]) => (
          <button
            key={key}
            className={`csv-import__type-btn${type === key ? ' csv-import__type-btn--active' : ''}`}
            onClick={() => { setType(key); reset() }}
          >
            {val.label}
          </button>
        ))}
      </div>

      <div className="csv-import__body">
        <div className="csv-import__help">
          <p>Colonnes attendues :</p>
          <code className="csv-import__cols">{t.colonnes}</code>
          <button className="btn-ghost-sm" onClick={() => downloadTemplate(type)}>
            ↓ Télécharger le modèle .csv
          </button>
        </div>

        <div className="csv-import__drop" onClick={() => fileRef.current?.click()}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="csv-import__file-input"
            onChange={e => { setFileName(e.target.files?.[0]?.name ?? ''); setResult(null) }}
          />
          {fileName
            ? <span className="csv-import__filename">📄 {fileName}</span>
            : <span className="csv-import__placeholder">Cliquer pour choisir un fichier .csv</span>
          }
        </div>

        <button
          className="btn-primary"
          onClick={handleImport}
          disabled={!fileName || loading}
        >
          {loading ? 'Import en cours…' : `Importer les ${t.label.toLowerCase()}`}
        </button>

        {result && (
          <div className="csv-import__result">
            <div className="csv-import__summary-row">
              <div className={`csv-import__summary ${result.importes > 0 ? 'csv-import__summary--ok' : 'csv-import__summary--warn'}`}>
                {result.importes} / {result.total} ligne{result.total > 1 ? 's' : ''} importée{result.importes > 1 ? 's' : ''}
                {result.erreurs.length > 0 && ` · ${result.erreurs.length} erreur${result.erreurs.length > 1 ? 's' : ''}`}
              </div>
              {result.erreurs.length > 0 && result.erreurs.some(e => e.row) && (
                <button className="btn-ghost-sm" onClick={downloadErreurs}>
                  ↓ Télécharger les lignes en erreur
                </button>
              )}
            </div>
            {result.erreurs.length > 0 && (
              <ul className="csv-import__errors">
                {result.erreurs.map((e, i) => (
                  <li key={i} className="csv-import__error">
                    <div className="csv-import__error-header">
                      <span className="csv-import__error-line">Ligne {e.ligne}</span>
                      <span className="csv-import__error-msg">
                        {e.errors ? formatApiErrors(e.errors) : e.message}
                      </span>
                    </div>
                    {e.contenu && (
                      <div className="csv-import__error-contenu">{e.contenu}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
