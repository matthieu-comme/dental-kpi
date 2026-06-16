import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DevisForm from '../components/DevisForm'
import ChequeForm from '../components/ChequeForm'
import ChargeTable from '../components/ChargeTable'
import ParametresForm from '../components/ParametresForm'
import ConsultationView from '../components/ConsultationView'
import PipContent from '../components/PipContent'
import { usePip } from '../hooks/usePip'

export default function PraticienPage() {
  const { praticienToken, activeUser, hasSecretaireSession, backToSecretaire, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('saisie')
  const { isOpen: isPipOpen, isSupported: isPipSupported, open: openPip, close: closePip } = usePip()

  // activeUser.sub contient l'id du praticien (string dans le JWT)
  const idPraticien = parseInt(activeUser?.sub, 10)

  function handlePip() {
    if (isPipOpen) { closePip(); return }
    openPip(
      <PipContent
        token={praticienToken}
        isSecretary={false}
        praticiens={[]}
        initialPraticienId={idPraticien}
      />
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dental KPI — Praticien</h1>
        <div className="header-actions">
          {isPipSupported && (
            <button
              className={`btn-pip${isPipOpen ? ' btn-pip--active' : ''}`}
              onClick={handlePip}
            >
              {isPipOpen ? '⚡ Fermer saisie rapide' : '⚡ Mode rapide'}
            </button>
          )}
          {hasSecretaireSession && (
            <button className="btn-outline" onClick={backToSecretaire}>
              ← Espace secrétaire
            </button>
          )}
          <button className="btn-ghost" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        <button
          className={`tab-btn ${activeTab === 'saisie' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('saisie')}
        >
          Saisie
        </button>
        <button
          className={`tab-btn ${activeTab === 'charges' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('charges')}
        >
          Charges
        </button>
        <button
          className={`tab-btn ${activeTab === 'parametres' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('parametres')}
        >
          Paramètres
        </button>
        <button
          className={`tab-btn ${activeTab === 'donnees' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('donnees')}
        >
          Données
        </button>
        <button
          className={`tab-btn ${activeTab === 'kpis' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('kpis')}
        >
          KPIs
        </button>
      </nav>

      <main className={`dashboard-main ${activeTab === 'donnees' || activeTab === 'charges' ? 'dashboard-main--wide' : ''}`}>
        {activeTab === 'saisie' && (
          <div className="forms-grid">
            <DevisForm token={praticienToken} idPraticien={idPraticien} />
            <ChequeForm token={praticienToken} idPraticien={idPraticien} />
          </div>
        )}
        {activeTab === 'charges' && (
          <ChargeTable token={praticienToken} idPraticien={idPraticien} />
        )}
        {activeTab === 'parametres' && (
          <ParametresForm token={praticienToken} idPraticien={idPraticien} />
        )}
        {activeTab === 'donnees' && (
          <ConsultationView
            token={praticienToken}
            isSecretary={false}
            praticiens={[]}
          />
        )}
        {activeTab === 'kpis' && (
          <div className="form-card">
            <h2>Indicateurs de performance</h2>
            <p className="text-muted">Les KPIs seront disponibles ici une fois les routes backend implémentées.</p>
          </div>
        )}
      </main>
    </div>
  )
}
