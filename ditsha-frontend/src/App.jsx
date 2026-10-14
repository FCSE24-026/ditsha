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
  const [updatingId, setUpdatingId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [note, setNote] = useState('')
  const [assistanceLoading, setAssistanceLoading] = useState(false)

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

  async function loadDetails(applicationId) {
    setSelectedId(applicationId)
    setDetailsLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/officer/applications/${applicationId}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setDetails(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDetailsLoading(false)
    }
  }

  async function updateStatus(applicationId, nextStatus, notes = '') {
    setUpdatingId(applicationId)
    setError('')
    try {
      await apiRequest(`/officer/applications/${applicationId}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ status: nextStatus, notes }),
      })
      const refreshed = await apiRequest(`/officer/applications?page=1&limit=50&status=${status}&sortBy=${sortBy}&sortOrder=${sortOrder}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setApplications(refreshed.applications || [])
      if (selectedId === applicationId) await loadDetails(applicationId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }

    async function decide(application) {
      const notes = application.current_status === 'under_review' && application.nextStatus === 'rejected'
        ? window.prompt('Enter the rejection reason (at least 5 characters):', '')
        : ''
      if (application.nextStatus === 'rejected' && notes === null) return
      if (application.nextStatus === 'rejected' && notes.trim().length < 5) {
        setError('A rejection reason of at least 5 characters is required')
        return
      }
      await updateStatus(application.application_id, application.nextStatus, notes)
    }

    async function requestAssistance() {
      if (!selectedId) return
      setAssistanceLoading(true)
      setError('')
      try {
        const result = await apiRequest(`/officer/applications/${selectedId}/assistance`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        })
        setDetails((current) => ({ ...current, prediction: result.prediction }))
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setAssistanceLoading(false)
      }
    }

    async function addNote(event) {
      event.preventDefault()
      if (!note.trim() || !selectedId) return
      try {
        const result = await apiRequest(`/officer/applications/${selectedId}/notes`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ body: note }),
        })
        setDetails((current) => ({ ...current, notes: [result.note, ...(current.notes || [])] }))
        setNote('')
      } catch (requestError) {
        setError(requestError.message)
      }
    }
  }

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
        {loading ? <div className="empty-state">Loading queue...</div> : applications.length === 0 ? <div className="empty-state">No applications match this filter.</div> : <div className="table-wrap"><table><thead><tr><th><button className="sort-button" onClick={() => toggleSort('reference_number')}>Reference {sortBy === 'reference_number' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th><th>Citizen name</th><th>Application type</th><th><button className="sort-button" onClick={() => toggleSort('current_status')}>Status {sortBy === 'current_status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th><th><button className="sort-button" onClick={() => toggleSort('submitted_at')}>Submitted {sortBy === 'submitted_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</button></th><th>Actions</th></tr></thead><tbody>{applications.map((application) => <tr key={application.application_id}><td className="reference"><button className="link-button" onClick={() => loadDetails(application.application_id)}>{application.reference_number}</button></td><td>{application.citizen_name || '—'}</td><td>{application.application_type?.replaceAll('_', ' ')}</td><td><span className={`status status-${application.current_status}`}>{application.current_status?.replaceAll('_', ' ')}</span></td><td>{new Date(application.submitted_at).toLocaleDateString()}</td><td className="actions">{application.current_status === 'submitted' && <button className="quiet-button" disabled={updatingId === application.application_id} onClick={() => updateStatus(application.application_id, 'under_review')}>Review</button>}{application.current_status === 'under_review' && <><button className="quiet-button" disabled={updatingId === application.application_id} onClick={() => updateStatus(application.application_id, 'approved')}>Approve</button><button className="quiet-button" disabled={updatingId === application.application_id} onClick={() => decide({ ...application, nextStatus: 'rejected' })}>Reject</button></>}</td></tr>)}</tbody></table></div>}
      </section>
      {selectedId && <aside className="details-panel">
        <div className="panel-heading"><div><p className="eyebrow">Case review</p><h2>{details?.application?.reference_number || 'Application details'}</h2></div><button className="quiet-button" onClick={() => { setSelectedId(null); setDetails(null) }}>Close</button></div>
        {detailsLoading ? <div className="empty-state">Loading application...</div> : details && <div className="details-content">
          <div className="detail-grid"><div><strong>Applicant</strong><span>{details.application.citizen_name}</span><span>{details.application.citizen_email || details.application.citizen_phone || 'No contact recorded'}</span></div><div><strong>Status</strong><span className={`status status-${details.application.current_status}`}>{details.application.current_status.replaceAll('_', ' ')}</span></div><div><strong>Type</strong><span>{details.application.application_type?.replaceAll('_', ' ')}</span></div><div><strong>Description</strong><span>{details.application.description || 'No description provided'}</span></div></div>
          <section><div className="section-heading"><h3>Documents</h3><span>{details.documents.length} uploaded</span></div>{details.documents.length ? <ul className="plain-list">{details.documents.map((document) => <li key={document.document_id}>{document.original_name}<small>{document.scan_status}</small></li>)}</ul> : <p className="muted">No documents uploaded.</p>}</section>
          <section><div className="section-heading"><h3>ML assistance</h3><button className="quiet-button" disabled={assistanceLoading} onClick={requestAssistance}>{assistanceLoading ? 'Checking...' : 'Run check'}</button></div>{details.prediction ? <div className="prediction"><strong>{details.prediction.category}</strong><span>Score: {details.prediction.score ?? '—'} · {details.prediction.model_version}</span><ul className="plain-list">{(details.prediction.reasons || []).map((reason, index) => <li key={index}>{reason}</li>)}</ul></div> : <p className="muted">Advisory only; an officer always makes the decision.</p>}</section>
          <section><div className="section-heading"><h3>Internal notes</h3></div><form className="note-form" onSubmit={addNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record a review note..." rows="3" /><button className="primary-button" type="submit">Add note</button></form>{details.notes.length ? <ul className="plain-list">{details.notes.map((item) => <li key={item.note_id}>{item.body}<small>{new Date(item.created_at).toLocaleString()}</small></li>)}</ul> : <p className="muted">No notes yet.</p>}</section>
          <section><div className="section-heading"><h3>Timeline</h3></div><ul className="plain-list">{details.events.map((event, index) => <li key={`${event.event_timestamp}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong> {event.notes || ''}<small>{new Date(event.event_timestamp).toLocaleString()}</small></li>)}</ul></section>
        </div>}
      </aside>}
    </section>
  </main>
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('ditsha-officer') || 'null'))
  function login(nextSession) { localStorage.setItem('ditsha-officer', JSON.stringify(nextSession)); setSession(nextSession) }
  function logout() { localStorage.removeItem('ditsha-officer'); setSession(null) }
  return session ? <Dashboard session={session} onLogout={logout} /> : <Login onLogin={login} />
}
