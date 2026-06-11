import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import DevisForm from '../components/DevisForm'
import ChequeForm from '../components/ChequeForm'
import PraticienModal from '../components/PraticienModal'

const API_BASE = 'http://localhost:8000'

export default function SecretairePage() {
  const { secretaireToken, switchToPraticien, logout } = useAuth()
  const [praticiens, setPraticiens] = useState([])
  const [selectedPraticien, setSelectedPraticien] = useState(null)
  const [activeForm, setActiveForm] = useState('devis')
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

      <nav className="dashboard-nav">
        <button
          className={`tab-btn ${activeForm === 'devis' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveForm('devis')}
        >
          Devis
        </button>
        <button
          className={`tab-btn ${activeForm === 'cheque' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveForm('cheque')}
        >
          Chèques
        </button>
      </nav>

      <main className="dashboard-main">
        {!loading && !selectedPraticien && (
          <div className="alert alert--error">
            Aucun praticien actif trouvé. Veuillez en créer un via l'API.
          </div>
        )}
        {selectedPraticien && activeForm === 'devis' && (
          <DevisForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} />
        )}
        {selectedPraticien && activeForm === 'cheque' && (
          <ChequeForm token={secretaireToken} idPraticien={selectedPraticien.id_praticien} />
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
