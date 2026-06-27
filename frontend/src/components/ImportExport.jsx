import { useState } from 'react'
import CsvImport from './CsvImport'
import ExportCsv from './ExportCsv'

export default function ImportExport({ token, idPraticien, praticiens, onSuccess }) {
  const [mode, setMode] = useState(null)

  const praticienNom = praticiens.find(p => p.id_praticien === idPraticien)?.nom

  if (mode === 'import') {
    return (
      <div className="import-export-form">
        <button className="btn-ghost-sm import-export-back" onClick={() => setMode(null)}>
          ← Retour
        </button>
        {praticienNom && (
          <div className="import-export-praticien-info">
            Praticien ciblé : <strong>{praticienNom}</strong>
          </div>
        )}
        <CsvImport token={token} idPraticien={idPraticien} onSuccess={onSuccess} />
      </div>
    )
  }

  if (mode === 'export') {
    return (
      <div className="import-export-form">
        <button className="btn-ghost-sm import-export-back" onClick={() => setMode(null)}>
          ← Retour
        </button>
        <ExportCsv
          token={token}
          resources={['devis', 'cheques', 'journees']}
          praticiens={praticiens}
          standalone
        />
      </div>
    )
  }

  return (
    <div className="import-export-choice">
      <button className="import-export-card" onClick={() => setMode('import')}>
        <span className="import-export-card__icon">↑</span>
        <span className="import-export-card__title">Importer</span>
        <span className="import-export-card__desc">
          Charger des données depuis un fichier CSV
        </span>
      </button>
      <button className="import-export-card" onClick={() => setMode('export')}>
        <span className="import-export-card__icon">↓</span>
        <span className="import-export-card__title">Exporter</span>
        <span className="import-export-card__desc">
          Télécharger les données au format CSV
        </span>
      </button>
    </div>
  )
}
