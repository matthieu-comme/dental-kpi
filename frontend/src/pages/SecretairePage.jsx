import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import DevisForm from '../components/DevisForm'
import ChequeForm from '../components/ChequeForm'
import ClotureJournee from '../components/ClotureJournee'
import PraticienModal from '../components/PraticienModal'
import ConsultationView from '../components/ConsultationView'

const API_BASE = 'http://localhost:8000'

export default function SecretairePage() {
  const { secretaireToken, switchToPraticien, logout } = useAuth()
  const [praticiens, setPraticiens] = useState([])
  const [selectedPraticien, setSelectedPraticien] = useState(null)
  const [activeTab, setActiveTab] = useState('devis')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dental KPI — Secrétaire</h1>
        <div className="header-actions">
          <button className="btn-outline" onClick={() => setShowModal(true)}>
            Accès Praticien
          </button>
          <button className="btn-ghost" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Barre de sélection praticien — masquée sur l'onglet Données */}
      {!isDonnees && (
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
      </nav>

      <main className={`dashboard-main ${isDonnees ? 'dashboard-main--wide' : ''}`}>
        {!isDonnees && !isCloture && !loading && !selectedPraticien && (
          <div className="alert alert--error">
            Aucun praticien actif trouvé. Veuillez en créer un via l'API.
          </div>
        )}
        {activeTab === 'devis' && selectedPraticien && (
          <DevisForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} />
        )}
        {activeTab === 'cheque' && selectedPraticien && (
          <ChequeForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} />
        )}
        {activeTab === 'donnees' && (
          <ConsultationView
            token={secretaireToken}
            isSecretary={true}
            praticiens={praticiens}
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
