import { useState } from 'react'
import DevisForm from './components/DevisForm'
import ChequeForm from './components/ChequeForm'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('devis')
  const [token, setToken] = useState(localStorage.getItem('access_token') || '')

  function handleTokenChange(e) {
    const value = e.target.value
    setToken(value)
    localStorage.setItem('access_token', value)
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dental KPI</h1>
        <div className="token-input">
          <label htmlFor="jwt-token">Token JWT</label>
          <input
            id="jwt-token"
            type="password"
            value={token}
            onChange={handleTokenChange}
            placeholder="Collez votre token ici..."
          />
        </div>
      </header>

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
      </nav>

      <main className="dashboard-main">
        {!token && (
          <div className="alert alert--error" role="alert">
            Veuillez renseigner votre token JWT pour utiliser les formulaires.
          </div>
        )}
        {activeTab === 'devis' && <DevisForm token={token} />}
        {activeTab === 'cheque' && <ChequeForm token={token} />}
      </main>
    </div>
  )
}
