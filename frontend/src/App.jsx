import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import SecretairePage from './pages/SecretairePage'
import PraticienPage from './pages/PraticienPage'
import './App.css'

function AppContent() {
  const { view } = useAuth()

  if (view === 'secretaire') return <SecretairePage />
  if (view === 'praticien') return <PraticienPage />
  return <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
