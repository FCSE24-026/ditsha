import React, { useEffect, useState } from 'react'
import './styles.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.error || 'Request failed')
  return body
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('officer@example.com')
  const [password, setPassword] = useState('OfficerPass123!')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = await apiRequest('/auth/officer/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      onLogin(session)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark">D</div>
        <p className="eyebrow">Land administration platform</p>
        <h1>Welcome back, officer.</h1>
        <p className="muted">Sign in to review applications and keep cases moving.</p>
        <form onSubmit={submit} className="login-form">
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <p className="login-note">Use the seeded officer account for local development.</p>
      </section>
      <aside className="login-aside"><span>DITSHA / 01</span><strong>Clarity for every land application.</strong><p>One calm workspace for queues, decisions, and public trust.</p></aside>
    </main>
  )
}

function Stat({ label, value, accent }) {
  return <article className={`stat-card ${accent || ''}`}><span>{label}</span><strong>{value ?? '—'}</strong></article>
}

function Dashboard({ session, onLogout }) {
  const [applications, setApplications] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [status, setStatus] = useState('all')
  const [sortBy, setSortBy] = useState('submitted_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const headers = { Authorization: `Bearer ${session.token}` }
    Promise.all([
      apiRequest(`/officer/applications?page=1&limit=50&status=${status}&sortBy=${sortBy}&sortOrder=${sortOrder}`, { headers }),
      apiRequest('/officer/analytics/dashboard', { headers }),
    ]).then(([queue, summary]) => {
      setApplications(queue.applications || [])
      setAnalytics(summary)
      setError('')
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [session.token, status, sortBy, sortOrder])

  function toggleSort(nextSort) {
    setLoading(true)
    if (sortBy === nextSort) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(nextSort); setSortOrder('asc') }
  }

  return <main className="app-shell">
    <nav className="topbar"><div className="wordmark"><span className="mini-mark">D</span> ditsha</div><div className="topbar-right"><span>{session.full_name}</span><button className="quiet-button" onClick={onLogout}>Sign out</button></div></nav>
    <section className="content">
      <header className="page-heading"><div><p className="eyebrow">Officer workspace</p><h1>Application queue</h1><p className="muted">A live view of cases assigned to your board.</p></div><div className="date-chip">● Live queue</div></header>
      {error && <div className="alert">{error}</div>}
      <section className="stats-grid"><Stat label="Assigned applications" value={analytics?.total_applications} accent="accent-teal" /><Stat label="Avg. processing time" value={analytics?.avg_processing_days ? `${analytics.avg_processing_days} days` : '—'} /><Stat label="Approved" value={analytics?.applications_by_status?.approved} accent="accent-green" /><Stat label="Needs review" value={analytics?.applications_by_status?.under_review} accent="accent-amber" /></section>
      <section className="queue-panel"><div className="panel-heading"><div><h2>Assigned cases</h2><p className="muted">Prioritise the oldest submissions first.</p></div><select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value) }}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
        {loading ? <div className="empty-state">Loading queue...</div> : applications.length === 0 ? <div className="empty-state">No applications match this filter.</div> : <div className="table-wrap"><table><thead><tr><th><button className="sort-button" onClick={() => toggleSort('reference_number')}>Reference {sortBy === 'reference_number' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th><th>Citizen name</th><th>Application type</th><th><button className="sort-button" onClick={() => toggleSort('current_status')}>Status {sortBy === 'current_status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th><th><button className="sort-button" onClick={() => toggleSort('submitted_at')}>Submitted {sortBy === 'submitted_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th></tr></thead><tbody>{applications.map((application) => <tr key={application.application_id}><td className="reference">{application.reference_number}</td><td>{application.citizen_name || '—'}</td><td>{application.application_type?.replaceAll('_', ' ')}</td><td><span className={`status status-${application.current_status}`}>{application.current_status?.replaceAll('_', ' ')}</span></td><td>{new Date(application.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
  </main>
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('ditsha-officer') || 'null'))
  function login(nextSession) { localStorage.setItem('ditsha-officer', JSON.stringify(nextSession)); setSession(nextSession) }
  function logout() { localStorage.removeItem('ditsha-officer'); setSession(null) }
  return session ? <Dashboard session={session} onLogout={logout} /> : <Login onLogin={login} />
}
