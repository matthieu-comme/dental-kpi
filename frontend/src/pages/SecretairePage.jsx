import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import DevisForm from '../components/DevisForm'
import ChequeForm from '../components/ChequeForm'
import ClotureJournee from '../components/ClotureJournee'
import PraticienModal from '../components/PraticienModal'
import ConsultationView from '../components/ConsultationView'
import PipContent from '../components/PipContent'
import { usePip } from '../hooks/usePip'
import NotificationBell from '../components/NotificationBell'
import CsvImport from '../components/CsvImport'
import ExportCsv from '../components/ExportCsv'

import { API_BASE } from '../utils/api'

export default function SecretairePage() {
  const { secretaireToken, switchToPraticien, logout } = useAuth()
  const [praticiens, setPraticiens] = useState([])
  const [selectedPraticien, setSelectedPraticien] = useState(null)
  const [activeTab, setActiveTab] = useState('devis')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notifKey, setNotifKey] = useState(0)
  const bumpNotif = useCallback(() => setNotifKey(k => k + 1), [])
  const { isOpen: isPipOpen, isSupported: isPipSupported, open: openPip, close: closePip } = usePip()

  function handlePip() {
    if (isPipOpen) { closePip(); return }
    openPip(
      <PipContent
        token={secretaireToken}
        isSecretary={true}
        praticiens={praticiens}
        initialPraticienId={selectedPraticien?.id_praticien ?? null}
      />
    )
  }

  useEffect(() => {
    async function loadPraticiens() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/praticiens/`, {
          headers: { Authorization: `Bearer ${secretaireToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          const actifs = data.filter(p => p.est_actif)
          setPraticiens(actifs)
          if (actifs.length > 0) setSelectedPraticien(actifs[0])
        }
      } finally {
        setLoading(false)
      }
    }
    loadPraticiens()
  }, [secretaireToken])

  const isDonnees = activeTab === 'donnees'
  const isCloture = activeTab === 'cloture'
  const isExport = activeTab === 'export'

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dental KPI — Secrétaire</h1>
        <div className="header-actions">
          <NotificationBell token={secretaireToken} refreshKey={notifKey} />
          {isPipSupported && (
            <button
              className={`btn-pip${isPipOpen ? ' btn-pip--active' : ''}`}
              onClick={handlePip}
            >
              {isPipOpen ? '⚡ Fermer saisie rapide' : '⚡ Mode rapide'}
            </button>
          )}
          <button className="btn-outline" onClick={() => setShowModal(true)}>
            Accès Praticien
          </button>
          <button className="btn-ghost" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Barre de sélection praticien — masquée sur les onglets sans contexte praticien */}
      {!isDonnees && !isExport && (
        <div className="praticien-bar">
          <span className="praticien-bar__label">Praticien :</span>
          {loading ? (
            <span className="praticien-bar__info">Chargement...</span>
          ) : praticiens.length === 0 ? (
            <span className="praticien-bar__info">Aucun praticien actif</span>
          ) : (
            <div className="praticien-bar__chips">
              {praticiens.map(p => (
                <button
                  key={p.id_praticien}
                  className={`praticien-chip ${selectedPraticien?.id_praticien === p.id_praticien ? 'praticien-chip--active' : ''}`}
                  onClick={() => setSelectedPraticien(p)}
                >
                  {p.nom}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="dashboard-nav">
        <button
          className={`tab-btn ${activeTab === 'devis' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('devis')}
        >
          Devis
        </button>
        <button
          className={`tab-btn ${activeTab === 'cheque' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('cheque')}
        >
          Chèques
        </button>
        <button
          className={`tab-btn ${activeTab === 'donnees' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('donnees')}
        >
          Données
        </button>
        <button
          className={`tab-btn ${activeTab === 'cloture' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('cloture')}
        >
          Clôture journée
        </button>
        <button
          className={`tab-btn ${activeTab === 'import' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          Import CSV
        </button>
        <button
          className={`tab-btn ${activeTab === 'export' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export CSV
        </button>
      </nav>

      <main className={`dashboard-main ${isDonnees || isExport ? 'dashboard-main--wide' : ''}`}>
        {!isDonnees && !isCloture && !isExport && !loading && !selectedPraticien && (
          <div className="alert alert--error">
            Aucun praticien actif trouvé. Veuillez en créer un via l'API.
          </div>
        )}
        {activeTab === 'devis' && selectedPraticien && (
          <DevisForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} onSuccess={bumpNotif} />
        )}
        {activeTab === 'cheque' && selectedPraticien && (
          <ChequeForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} onSuccess={bumpNotif} />
        )}
        {activeTab === 'donnees' && (
          <ConsultationView
            token={secretaireToken}
            isSecretary={true}
            praticiens={praticiens}
            onMutate={bumpNotif}
          />
        )}
        {activeTab === 'cloture' && selectedPraticien && (
          <ClotureJournee
            token={secretaireToken}
            idPraticien={selectedPraticien.id_praticien}
            praticienNom={selectedPraticien.nom}
            onClose={() => setActiveTab('devis')}
          />
        )}
        {activeTab === 'import' && selectedPraticien && (
          <CsvImport
            token={secretaireToken}
            idPraticien={selectedPraticien.id_praticien}
            onSuccess={bumpNotif}
          />
        )}
        {activeTab === 'import' && !loading && !selectedPraticien && (
          <div className="alert alert--error">Aucun praticien actif trouvé.</div>
        )}
        {activeTab === 'export' && (
          <ExportCsv
            token={secretaireToken}
            resources={['devis', 'cheques', 'journees']}
            standalone
          />
        )}
        {activeTab === 'cloture' && !loading && !selectedPraticien && (
          <div className="alert alert--error">
            Aucun praticien actif trouvé. Veuillez en créer un via l'API.
          </div>
        )}
      </main>

      {showModal && (
        <PraticienModal
          onClose={() => setShowModal(false)}
          onSuccess={token => {
            switchToPraticien(token)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
