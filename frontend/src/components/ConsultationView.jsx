import { useState, useMemo, useEffect } from 'react'
import DevisTable from './DevisTable'
import ChequeTable from './ChequeTable'
import JourneeTable from './JourneeTable'
import LogsTable from './LogsTable'
import ExportCsv from './ExportCsv'

export default function ConsultationView({ token, isSecretary, praticiens, onMutate, focus, tauxMap = {} }) {
  const [activeTab, setActiveTab] = useState('devis')
  const [focusPatientId, setFocusPatientId] = useState(null)
  const [focusType, setFocusType] = useState(null)

  const praticiensMap = useMemo(() => {
    const map = {}
    praticiens.forEach(p => { map[p.id_praticien] = p.nom })
    return map
  }, [praticiens])

  // Réagit à chaque nouvelle navigation depuis une notification
  useEffect(() => {
    if (!focus) return
    const subTab = focus.type === 'devis' ? 'devis' : 'cheques'
    setActiveTab(subTab)
    setFocusPatientId(focus.idPatient)
    setFocusType(focus.type)
  }, [focus?.key])

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
        <ExportCsv token={token} resources={['devis', 'cheques', 'journees']} praticiens={praticiens} />
      </div>

      {activeTab === 'devis' && (
        <DevisTable
          token={token}
          isSecretary={isSecretary}
          praticiensMap={praticiensMap}
          onMutate={onMutate}
          focusPatientId={focusType === 'devis' ? focusPatientId : null}
          tauxMap={tauxMap}
        />
      )}
      {activeTab === 'cheques' && (
        <ChequeTable
          token={token}
          isSecretary={isSecretary}
          praticiensMap={praticiensMap}
          onMutate={onMutate}
          focusPatientId={focusType === 'cheques' ? focusPatientId : null}
        />
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
