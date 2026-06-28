import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import DevisForm from '../components/DevisForm'
import ChequeForm from '../components/ChequeForm'
import ChargeTable from '../components/ChargeTable'
import ParametresForm from '../components/ParametresForm'
import ConsultationView from '../components/ConsultationView'
import KpiView from '../components/KpiView'
import PipContent from '../components/PipContent'
import { usePip } from '../hooks/usePip'
import { API_BASE } from '../utils/api'

export default function PraticienPage() {
  const { praticienToken, activeUser, hasSecretaireSession, backToSecretaire, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('saisie')
  const [tauxHoraireCible, setTauxHoraireCible] = useState(null)
  const { isOpen: isPipOpen, isSupported: isPipSupported, open: openPip, close: closePip } = usePip()

  const idPraticien = parseInt(activeUser?.sub, 10)

  useEffect(() => {
    if (!praticienToken || !idPraticien) return
    fetch(`${API_BASE}/api/v1/praticiens/${idPraticien}/parametres`, {
      headers: { Authorization: `Bearer ${praticienToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.taux_horaire_cible) setTauxHoraireCible(data.taux_horaire_cible) })
      .catch(() => {})
  }, [praticienToken, idPraticien])

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

  const tauxMap = tauxHoraireCible != null ? { [idPraticien]: tauxHoraireCible } : {}

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

      <main className={`dashboard-main ${['donnees', 'charges', 'kpis'].includes(activeTab) ? 'dashboard-main--wide' : ''}`}>
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
            tauxMap={tauxMap}
          />
        )}
        {activeTab === 'kpis' && (
          <KpiView token={praticienToken} idPraticien={idPraticien} />
        )}
      </main>
    </div>
  )
}
