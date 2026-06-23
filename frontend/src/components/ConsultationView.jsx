import { useState, useMemo } from 'react'
import DevisTable from './DevisTable'
import ChequeTable from './ChequeTable'
import JourneeTable from './JourneeTable'
import LogsTable from './LogsTable'
import ExportCsv from './ExportCsv'

export default function ConsultationView({ token, isSecretary, praticiens, onMutate }) {
  const [activeTab, setActiveTab] = useState('devis')

  // Map id_praticien → nom pour l'affichage dans les tables
  const praticiensMap = useMemo(() => {
    const map = {}
    praticiens.forEach(p => { map[p.id_praticien] = p.nom })
    return map
  }, [praticiens])

  const tabs = [
    { key: 'devis', label: 'Devis' },
    { key: 'cheques', label: 'Chèques' },
    { key: 'journees', label: 'Journées' },
    { key: 'logs', label: 'Logs' },
  ]

  return (
    <div>
      <div className="sub-tabs-bar">
        <div className="sub-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`sub-tab ${activeTab === t.key ? 'sub-tab--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ExportCsv token={token} resources={['devis', 'cheques', 'journees']} />
      </div>

      {activeTab === 'devis' && (
        <DevisTable token={token} isSecretary={isSecretary} praticiensMap={praticiensMap} onMutate={onMutate} />
      )}
      {activeTab === 'cheques' && (
        <ChequeTable token={token} isSecretary={isSecretary} praticiensMap={praticiensMap} onMutate={onMutate} />
      )}
      {activeTab === 'journees' && (
        <JourneeTable token={token} isSecretary={isSecretary} praticiensMap={praticiensMap} />
      )}
      {activeTab === 'logs' && (
        <LogsTable token={token} />
      )}
    </div>
  )
}
