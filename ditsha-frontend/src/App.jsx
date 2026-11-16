import React, { useEffect, useState, useCallback, useRef } from 'react'
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
      <aside className="login-aside">
        <span>DITSHA / 01</span>
        <strong>Clarity for every land application.</strong>
        <p>One calm workspace for queues, decisions, and public trust.</p>
      </aside>
    </main>
  )
}

function Stat({ label, value, accent }) {
  return (
    <article className={`stat-card ${accent || ''}`}>
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </article>
  )
}

function Dashboard({ session, onLogout }) {
  const [applications, setApplications] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [analytics, setAnalytics] = useState(null)
  const [landBoards, setLandBoards] = useState([])
  const [boardOfficers, setBoardOfficers] = useState([])
  
  // Filters & Sorting
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedLandBoard, setSelectedLandBoard] = useState('')
  const [sortBy, setSortBy] = useState('submitted_at')
  const [sortOrder, setSortOrder] = useState('desc')

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [assistanceLoading, setAssistanceLoading] = useState(false)

  // Modals & Action States
  const [modalType, setModalType] = useState(null) // 'reject' | 'request-info' | 'override-priority' | 'reassign'
  const [modalApp, setModalApp] = useState(null)
  const [modalInput, setModalInput] = useState('')
  const [modalInput2, setModalInput2] = useState('')
  const [modalBusy, setModalBusy] = useState(false)

  // Internal Notes
  const [noteBody, setNoteBody] = useState('')
  const [noteVisible, setNoteVisible] = useState(false)

  const headers = useRef({ Authorization: `Bearer ${session.token}` })
  headers.current = { Authorization: `Bearer ${session.token}` }

  // Load land boards and officers
  useEffect(() => {
    apiRequest('/land-boards', { headers: headers.current })
      .then((data) => setLandBoards(data.land_boards || []))
      .catch(() => {})

    apiRequest('/officers', { headers: headers.current })
      .then((data) => setBoardOfficers(data.officers || []))
      .catch(() => {})
  }, [])

  // Load Queue & Analytics
  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status,
        sortBy,
        sortOrder,
        search,
      })
      if (selectedLandBoard) queryParams.set('land_board_id', selectedLandBoard)

      const [queue, summary] = await Promise.all([
        apiRequest(`/officer/applications?${queryParams.toString()}`, { headers: headers.current }),
        apiRequest('/officer/analytics/dashboard', { headers: headers.current }),
      ])

      setApplications(queue.applications || [])
      setTotalCount(queue.total || 0)
      setAnalytics(summary)
      setError('')
    } catch (requestError) {
      if (!silent) setError(requestError.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, status, sortBy, sortOrder, search, selectedLandBoard])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Periodic polling for live updates every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchQueue(true)
    }, 15000)
    return () => clearInterval(timer)
  }, [fetchQueue])

  async function loadDetails(applicationId) {
    setSelectedId(applicationId)
    setDetailsLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/officer/applications/${applicationId}`, {
        headers: headers.current,
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
    setSuccess('')
    try {
      await apiRequest(`/officer/applications/${applicationId}/status`, {
        method: 'POST',
        headers: headers.current,
        body: JSON.stringify({ status: nextStatus, notes }),
      })
      setSuccess(`Application marked as ${nextStatus.replace('_', ' ')}`)
      await fetchQueue(true)
      if (selectedId === applicationId) await loadDetails(applicationId)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleApprove(application) {
    if (window.confirm(`Are you sure you want to approve application ${application.reference_number}?`)) {
      await updateStatus(application.application_id, 'approved', 'Application approved after verified review')
    }
  }

  function openRejectModal(application) {
    setModalApp(application)
    setModalType('reject')
    setModalInput('')
  }

  function openRequestInfoModal(application) {
    setModalApp(application)
    setModalType('request-info')
    setModalInput('')
  }

  function openPriorityOverrideModal(application) {
    setModalApp(application)
    setModalType('override-priority')
    setModalInput(application.priority_score != null ? String(application.priority_score) : '0.85')
    setModalInput2('')
  }

  function openReassignModal(application) {
    setModalApp(application)
    setModalType('reassign')
    setModalInput(boardOfficers[0]?.officer_id || '')
  }

  function closeModal() {
    setModalType(null)
    setModalApp(null)
    setModalInput('')
    setModalInput2('')
  }

  async function handleModalSubmit(event) {
    event.preventDefault()
    if (!modalApp) return
    setModalBusy(true)
    setError('')
    setSuccess('')

    try {
      if (modalType === 'reject') {
        if (!modalInput.trim() || modalInput.trim().length < 5) {
          throw new Error('A rejection reason of at least 5 characters is required')
        }
        await updateStatus(modalApp.application_id, 'rejected', modalInput.trim())
      } else if (modalType === 'request-info') {
        if (!modalInput.trim() || modalInput.trim().length < 5) {
          throw new Error('A clear explanation of what is required is mandatory (at least 5 characters)')
        }
        await apiRequest(`/officer/applications/${modalApp.application_id}/request-info`, {
          method: 'POST',
          headers: headers.current,
          body: JSON.stringify({ notes: modalInput.trim() }),
        })
        setSuccess('Information request sent to citizen')
        await fetchQueue(true)
        if (selectedId === modalApp.application_id) await loadDetails(modalApp.application_id)
      } else if (modalType === 'override-priority') {
        const score = parseFloat(modalInput)
        if (isNaN(score) || score < 0 || score > 1) {
          throw new Error('Priority score must be a number between 0 and 1')
        }
        if (!modalInput2.trim() || modalInput2.trim().length < 5) {
          throw new Error('A mandatory override reason of at least 5 characters is required')
        }
        await apiRequest(`/officer/applications/${modalApp.application_id}/override-priority`, {
          method: 'POST',
          headers: headers.current,
          body: JSON.stringify({ priority_score: score, reason: modalInput2.trim() }),
        })
        setSuccess('Priority score overridden with audit event recorded')
        await fetchQueue(true)
        if (selectedId === modalApp.application_id) await loadDetails(modalApp.application_id)
      } else if (modalType === 'reassign') {
        if (!modalInput) throw new Error('Please select an officer to assign')
        await apiRequest(`/officer/applications/${modalApp.application_id}/assign`, {
          method: 'POST',
          headers: headers.current,
          body: JSON.stringify({ officer_id: modalInput }),
        })
        setSuccess('Application reassigned successfully')
        await fetchQueue(true)
        if (selectedId === modalApp.application_id) await loadDetails(modalApp.application_id)
      }
      closeModal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setModalBusy(false)
    }
  }

  async function requestAssistance() {
    if (!selectedId) return
    setAssistanceLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/officer/applications/${selectedId}/assistance`, {
        method: 'POST',
        headers: headers.current,
      })
      setDetails((current) => ({ ...current, prediction: result.prediction }))
      setSuccess('ML assistance check completed')
      await fetchQueue(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAssistanceLoading(false)
    }
  }

  async function addNote(event) {
    event.preventDefault()
    if (!noteBody.trim() || !selectedId) return
    try {
      const result = await apiRequest(`/officer/applications/${selectedId}/notes`, {
        method: 'POST',
        headers: headers.current,
        body: JSON.stringify({ body: noteBody.trim(), citizen_visible: noteVisible }),
      })
      setDetails((current) => ({
        ...current,
        notes: [result.note, ...(current.notes || [])],
      }))
      setNoteBody('')
      setSuccess('Note recorded successfully')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function toggleSort(nextSort) {
    if (sortBy === nextSort) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(nextSort)
      setSortOrder('asc')
    }
  }

  const totalPages = Math.ceil(totalCount / limit) || 1

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="wordmark">
          <span className="mini-mark">D</span> ditsha
        </div>
        <div className="topbar-right">
          <span>{session.full_name} ({session.role || 'Officer'})</span>
          <button className="quiet-button" onClick={onLogout}>Sign out</button>
        </div>
      </nav>

      <section className="content">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Officer workspace</p>
            <h1>Application queue</h1>
            <p className="muted">Live case management, eligibility checks, and transparent public decisions.</p>
          </div>
          <div className="date-chip">
            <span className="pulse-dot"></span> Live Queue
          </div>
        </header>

        {error && <div className="alert">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <section className="stats-grid">
          <Stat label="Total assigned" value={analytics?.total_applications} accent="accent-teal" />
          <Stat label="Avg. processing time" value={analytics?.avg_processing_days != null ? `${analytics.avg_processing_days} days` : '—'} />
          <Stat label="Under review" value={analytics?.applications_by_status?.under_review ?? 0} accent="accent-amber" />
          <Stat label="Approved" value={analytics?.applications_by_status?.approved ?? 0} accent="accent-green" />
        </section>

        <section className="queue-panel">
          <div className="panel-heading">
            <div>
              <h2>Assigned cases</h2>
              <p className="muted">Total matching cases: {totalCount}</p>
            </div>
            <div className="filter-row">
              <input
                type="text"
                placeholder="Search reference or citizen..."
                className="search-input"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value) }}
              />
              <select
                value={status}
                onChange={(e) => { setPage(1); setStatus(e.target.value) }}
              >
                <option value="all">All statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="information_requested">Info requested</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
              <select
                value={selectedLandBoard}
                onChange={(e) => { setPage(1); setSelectedLandBoard(e.target.value) }}
              >
                <option value="">All Land Boards</option>
                {landBoards.map((b) => (
                  <option key={b.land_board_id} value={b.land_board_id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading queue...</div>
          ) : applications.length === 0 ? (
            <div className="empty-state">No applications match this filter or search.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button className="sort-button" onClick={() => toggleSort('reference_number')}>
                        Reference {sortBy === 'reference_number' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>Citizen name</th>
                    <th>Application type</th>
                    <th>Land Board</th>
                    <th>
                      <button className="sort-button" onClick={() => toggleSort('current_status')}>
                        Status {sortBy === 'current_status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => toggleSort('submitted_at')}>
                        Submitted {sortBy === 'submitted_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>Priority</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.application_id}>
                      <td className="reference">
                        <button className="link-button" onClick={() => loadDetails(app.application_id)}>
                          {app.reference_number}
                        </button>
                      </td>
                      <td>{app.citizen_name || '—'}</td>
                      <td>{app.application_type?.replaceAll('_', ' ')}</td>
                      <td>{app.land_board_name || '—'}</td>
                      <td>
                        <span className={`status status-${app.current_status}`}>
                          {app.current_status?.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td>{new Date(app.submitted_at).toLocaleDateString()}</td>
                      <td>{app.priority_score != null ? `${Math.round(app.priority_score * 100)}%` : '—'}</td>
                      <td className="actions">
                        {app.current_status === 'submitted' && (
                          <button
                            className="action-btn"
                            disabled={updatingId === app.application_id}
                            onClick={() => updateStatus(app.application_id, 'under_review')}
                          >
                            Start review
                          </button>
                        )}
                        {app.current_status === 'under_review' && (
                          <>
                            <button
                              className="action-btn"
                              disabled={updatingId === app.application_id}
                              onClick={() => handleApprove(app)}
                            >
                              Approve
                            </button>
                            <button
                              className="action-btn"
                              disabled={updatingId === app.application_id}
                              onClick={() => openRequestInfoModal(app)}
                            >
                              Request info
                            </button>
                            <button
                              className="action-btn"
                              disabled={updatingId === app.application_id}
                              onClick={() => openRejectModal(app)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {app.current_status === 'information_requested' && (
                          <span className="muted" style={{ fontSize: '11px' }}>Awaiting citizen</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pagination-row">
            <span>Showing page {page} of {totalPages}</span>
            <div className="pagination-controls">
              <button
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {selectedId && (
          <aside className="details-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Case inspection & adjudication</p>
                <h2>{details?.application?.reference_number || 'Application details'}</h2>
              </div>
              <button className="quiet-button" onClick={() => { setSelectedId(null); setDetails(null) }}>
                Close panel
              </button>
            </div>

            {detailsLoading ? (
              <div className="empty-state">Loading application details...</div>
            ) : details && (
              <div className="details-content">
                <div className="detail-grid">
                  <div>
                    <strong>Applicant</strong>
                    <span>{details.application.citizen_name}</span>
                    <span>{details.application.citizen_email || details.application.citizen_phone || 'No contact recorded'}</span>
                    <span>District: {details.application.citizen_district || '—'}</span>
                  </div>
                  <div>
                    <strong>Status & Stage</strong>
                    <span className={`status status-${details.application.current_status}`}>
                      {details.application.current_status?.replaceAll('_', ' ')}
                    </span>
                    <span className="muted">Stage: {details.application.current_stage?.replaceAll('_', ' ')}</span>
                  </div>
                  <div>
                    <strong>Type & Land Board</strong>
                    <span>{details.application.application_type?.replaceAll('_', ' ')}</span>
                    <span className="muted">{details.application.land_board_name || '—'}</span>
                  </div>
                  <div>
                    <strong>Priority Score</strong>
                    <span>{details.application.priority_score != null ? `${Math.round(details.application.priority_score * 100)}%` : 'Not set'}</span>
                    <button className="link-button" onClick={() => openPriorityOverrideModal(details.application)}>
                      Override priority
                    </button>
                  </div>
                </div>

                <section>
                  <div className="section-heading">
                    <h3>Case Management</h3>
                    <button className="action-btn" onClick={() => openReassignModal(details.application)}>
                      Reassign Officer
                    </button>
                  </div>
                  <p className="muted">
                    Description: {details.application.description || 'No description provided by applicant.'}
                  </p>
                </section>

                <section>
                  <div className="section-heading">
                    <h3>Supporting Documents</h3>
                    <span>{details.documents.length} verified files</span>
                  </div>
                  {details.documents.length ? (
                    <ul className="plain-list">
                      {details.documents.map((doc) => (
                        <li key={doc.document_id}>
                          <div>
                            <strong>{doc.original_name}</strong>
                            <small> · {(doc.byte_size / 1024).toFixed(1)} KB · {doc.content_type}</small>
                          </div>
                          <a
                            href={`${API_URL}/applications/${details.application.application_id}/documents/${doc.document_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="link-button"
                            style={{ fontSize: '12px' }}
                          >
                            Preview / Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No supporting documents uploaded yet.</p>
                  )}
                </section>

                <section>
                  <div className="section-heading">
                    <h3>ML Assistance & Completeness Check</h3>
                    <button
                      className="quiet-button"
                      disabled={assistanceLoading}
                      onClick={requestAssistance}
                    >
                      {assistanceLoading ? 'Running check...' : 'Re-run analysis'}
                    </button>
                  </div>
                  {details.prediction ? (
                    <div className="prediction">
                      <div className="prediction-metrics">
                        <span>Category: {details.prediction.category}</span>
                        <span>Completeness: {details.prediction.score != null ? `${Math.round(details.prediction.score * 100)}%` : '—'}</span>
                        <span>Model: {details.prediction.model_version}</span>
                      </div>
                      <ul className="plain-list">
                        {(details.prediction.reasons || []).map((reason, idx) => (
                          <li key={idx}>● {reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="muted">Advisory only; ML never autonomously makes land allocations or decisions.</p>
                  )}
                </section>

                <section>
                  <div className="section-heading">
                    <h3>Notes & Communications</h3>
                  </div>
                  <form className="note-form" onSubmit={addNote}>
                    <textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Add an internal officer note or instructions..."
                      rows="3"
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={noteVisible}
                          onChange={(e) => setNoteVisible(e.target.checked)}
                        />
                        Citizen visible note
                      </label>
                      <button className="primary-button" type="submit">Save note</button>
                    </div>
                  </form>

                  {details.notes.length ? (
                    <ul className="plain-list">
                      {details.notes.map((n) => (
                        <li key={n.note_id}>
                          <div>
                            <span>{n.body}</span>
                            {n.citizen_visible && <span style={{ marginLeft: 8, color: '#168278', fontSize: 11, fontWeight: 700 }}>(Citizen visible)</span>}
                          </div>
                          <small>{new Date(n.created_at).toLocaleString()}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No notes recorded yet.</p>
                  )}
                </section>

                <section>
                  <div className="section-heading">
                    <h3>Audit Timeline & Status Transitions</h3>
                  </div>
                  <ul className="plain-list">
                    {details.events.map((ev, i) => (
                      <li key={`${ev.event_timestamp}-${i}`}>
                        <div>
                          <strong>{ev.event_type?.replaceAll('_', ' ')}</strong>
                          {ev.notes ? ` — ${ev.notes}` : ''}
                        </div>
                        <small>{new Date(ev.event_timestamp).toLocaleString()}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </aside>
        )}
      </section>

      {/* Modal Dialogs */}
      {modalType && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {modalType === 'reject' && (
              <form onSubmit={handleModalSubmit}>
                <h3>Reject Application</h3>
                <p>Provide a mandatory rejection reason (at least 5 characters). This will be recorded in the audit log and sent to the citizen.</p>
                <div style={{ marginTop: 12 }}>
                  <textarea
                    rows="4"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="danger-button" disabled={modalBusy}>
                    {modalBusy ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            )}

            {modalType === 'request-info' && (
              <form onSubmit={handleModalSubmit}>
                <h3>Request Additional Information</h3>
                <p>Specify what missing documents or clarifications are required from the citizen.</p>
                <div style={{ marginTop: 12 }}>
                  <textarea
                    rows="4"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder="Specify requested documents or questions..."
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={modalBusy}>
                    {modalBusy ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </form>
            )}

            {modalType === 'override-priority' && (
              <form onSubmit={handleModalSubmit}>
                <h3>Override Priority Score</h3>
                <p>Manual priority score adjustment (between 0.00 and 1.00) with mandatory justification.</p>
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  <label>
                    New priority score (0.00 - 1.00)
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={modalInput}
                      onChange={(e) => setModalInput(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Mandatory justification reason
                    <textarea
                      rows="3"
                      value={modalInput2}
                      onChange={(e) => setModalInput2(e.target.value)}
                      placeholder="Explain why the priority was adjusted..."
                      required
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={modalBusy}>
                    {modalBusy ? 'Saving...' : 'Save Override'}
                  </button>
                </div>
              </form>
            )}

            {modalType === 'reassign' && (
              <form onSubmit={handleModalSubmit}>
                <h3>Reassign Case</h3>
                <p>Select another authorized officer in this Land Board to take over this application.</p>
                <div style={{ marginTop: 12 }}>
                  <select
                    style={{ width: '100%' }}
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    required
                  >
                    {boardOfficers.map((off) => (
                      <option key={off.officer_id} value={off.officer_id}>
                        {off.full_name} ({off.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={modalBusy}>
                    {modalBusy ? 'Reassigning...' : 'Confirm Reassignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function AdminDashboard({ session, onLogout }) {
  const [tab, setTab] = useState('overview')
  const [metrics, setMetrics] = useState(null)
  const [officers, setOfficers] = useState([])
  const [roles, setRoles] = useState([])
  const [config, setConfig] = useState([])
  const [audit, setAudit] = useState([])
  const [landBoards, setLandBoards] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newOfficer, setNewOfficer] = useState({
    full_name: '', email: '', password: '', role: 'clerk', land_board_id: '',
  })
  const [newRole, setNewRole] = useState({ name: '', description: '', permissions: '' })
  const headers = { Authorization: `Bearer ${session.token}` }

  const request = useCallback(async (path, options = {}) => (
    apiRequest(path, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  ), [session.token])

  const loadAdminData = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [metricData, officerData, roleData, configData, auditData, boardData] = await Promise.all([
        request('/admin/metrics'),
        request(`/admin/officers?search=${encodeURIComponent(search)}`),
        request('/admin/roles'),
        request('/admin/config'),
        request('/admin/audit?limit=100'),
        request('/land-boards'),
      ])
      setMetrics(metricData)
      setOfficers(officerData.officers || [])
      setRoles(roleData.roles || [])
      setConfig(configData.config || [])
      setAudit(auditData.events || [])
      setLandBoards(boardData.land_boards || [])
      setNewOfficer((value) => ({ ...value, land_board_id: value.land_board_id || boardData.land_boards?.[0]?.land_board_id || '' }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }, [request, search])

  useEffect(() => { loadAdminData() }, [loadAdminData])

  async function createOfficer(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await request('/admin/officers', { method: 'POST', body: JSON.stringify(newOfficer) })
      setSuccess('Officer created successfully.')
      setNewOfficer({ full_name: '', email: '', password: '', role: 'clerk', land_board_id: landBoards[0]?.land_board_id || '' })
      await loadAdminData()
    } catch (requestError) {
      setError(requestError.message)
    } finally { setBusy(false) }
  }

  async function deactivateOfficer(officer) {
    if (!window.confirm(`Deactivate ${officer.full_name}?`)) return
    try {
      await request(`/admin/officers/${officer.officer_id}`, { method: 'DELETE' })
      setSuccess('Officer deactivated and sessions revoked.')
      await loadAdminData()
    } catch (requestError) { setError(requestError.message) }
  }

  async function editOfficer(officer) {
    const full_name = window.prompt('Officer full name', officer.full_name)
    if (full_name === null) return
    const role = window.prompt('Role: clerk, inspector, or manager', officer.role)
    if (role === null) return
    const land_board_id = window.prompt('Land board ID', officer.land_board_id)
    if (land_board_id === null) return
    try {
      await request(`/admin/officers/${officer.officer_id}`, {
        method: 'PUT',
        body: JSON.stringify({ full_name, role, land_board_id }),
      })
      setSuccess('Officer updated successfully.')
      await loadAdminData()
    } catch (requestError) { setError(requestError.message) }
  }

  async function createRole(event) {
    event.preventDefault()
    try {
      await request('/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: newRole.name,
          description: newRole.description,
          permissions: newRole.permissions.split(',').map((item) => item.trim()).filter(Boolean),
        }),
      })
      setSuccess('Role created successfully.')
      setNewRole({ name: '', description: '', permissions: '' })
      await loadAdminData()
    } catch (requestError) { setError(requestError.message) }
  }

  async function editPermissions(role) {
    const value = window.prompt('Permissions, comma separated', role.permissions.join(', '))
    if (value === null) return
    try {
      await request(`/admin/roles/${role.role_id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: value.split(',').map((item) => item.trim()).filter(Boolean) }),
      })
      setSuccess('Role permissions updated.')
      await loadAdminData()
    } catch (requestError) { setError(requestError.message) }
  }

  async function updateConfig(item) {
    const value = window.prompt(`Update ${item.config_key}`, item.config_value)
    if (value === null) return
    try {
      await request(`/admin/config/${encodeURIComponent(item.config_key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value, description: item.description }),
      })
      setSuccess('Configuration updated.')
      await loadAdminData()
    } catch (requestError) { setError(requestError.message) }
  }

  const statusCounts = Object.fromEntries((metrics?.application_status_breakdown || []).map((item) => [item.current_status, item.count]))
  const nav = [
    ['overview', 'Overview'], ['officers', 'Officers'], ['roles', 'Roles & permissions'],
    ['config', 'Configuration'], ['audit', 'Audit log'],
  ]

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="wordmark"><span className="mini-mark">D</span> ditsha / admin</div>
        <div className="topbar-right">
          <span>{session.full_name} (Manager)</span>
          <button className="quiet-button" onClick={onLogout}>Sign out</button>
        </div>
      </nav>
      <section className="content">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Manager workspace</p>
            <h1>Administration</h1>
            <p className="muted">Manage access, platform settings, and operational accountability.</p>
          </div>
          <button className="secondary-button" onClick={loadAdminData} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh data'}</button>
        </header>
        {error && <div className="alert">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        <div className="admin-tabs">
          {nav.map(([key, label]) => <button key={key} className={tab === key ? 'admin-tab active' : 'admin-tab'} onClick={() => { setTab(key); setError(''); setSuccess('') }}>{label}</button>)}
        </div>

        {tab === 'overview' && (
          <>
            <section className="stats-grid">
              <Stat label="Total officers" value={metrics?.total_officers} accent="accent-teal" />
              <Stat label="Total applications" value={Object.values(statusCounts).reduce((sum, value) => sum + Number(value), 0)} />
              <Stat label="Awaiting review" value={statusCounts.submitted || 0} accent="accent-amber" />
              <Stat label="Unread notifications" value={metrics?.unread_notifications} accent="accent-purple" />
            </section>
            <section className="queue-panel admin-card">
              <div className="panel-heading"><div><h2>Application status</h2><p className="muted">System-wide operational snapshot.</p></div></div>
              <div className="admin-status-grid">
                {(metrics?.application_status_breakdown || []).map((item) => <div key={item.current_status}><strong>{item.count}</strong><span>{item.current_status.replaceAll('_', ' ')}</span></div>)}
              </div>
            </section>
          </>
        )}

        {tab === 'officers' && (
          <>
            <section className="queue-panel admin-card">
              <div className="panel-heading"><div><h2>Officer accounts</h2><p className="muted">{officers.length} accounts shown</p></div><input className="search-input" placeholder="Search name or email..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
              <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Land board</th><th>Actions</th></tr></thead><tbody>
                {officers.map((officer) => <tr key={officer.officer_id}><td>{officer.full_name}</td><td>{officer.email}</td><td>{officer.role}</td><td>{officer.land_board_name || '—'}</td><td className="actions"><button className="action-btn" onClick={() => editOfficer(officer)}>Edit</button>{officer.officer_id !== session.officer_id && officer.role !== 'deactivated' ? <button className="danger-button" onClick={() => deactivateOfficer(officer)}>Deactivate</button> : <span className="muted">Protected</span>}</td></tr>)}
              </tbody></table></div>
            </section>
            <section className="queue-panel admin-card">
              <div className="panel-heading"><div><h2>Create officer</h2><p className="muted">Provision a role-scoped account.</p></div></div>
              <form className="admin-form" onSubmit={createOfficer}>
                <input required placeholder="Full name" value={newOfficer.full_name} onChange={(e) => setNewOfficer({ ...newOfficer, full_name: e.target.value })} />
                <input required type="email" placeholder="Email" value={newOfficer.email} onChange={(e) => setNewOfficer({ ...newOfficer, email: e.target.value })} />
                <input required minLength="10" placeholder="Temporary password (10+ characters)" value={newOfficer.password} onChange={(e) => setNewOfficer({ ...newOfficer, password: e.target.value })} />
                <select value={newOfficer.role} onChange={(e) => setNewOfficer({ ...newOfficer, role: e.target.value })}><option value="clerk">Clerk</option><option value="inspector">Inspector</option><option value="manager">Manager</option></select>
                <select required value={newOfficer.land_board_id} onChange={(e) => setNewOfficer({ ...newOfficer, land_board_id: e.target.value })}>{landBoards.map((board) => <option key={board.land_board_id} value={board.land_board_id}>{board.name}</option>)}</select>
                <button className="primary-button" disabled={busy}>Create officer</button>
              </form>
            </section>
          </>
        )}

        {tab === 'roles' && (
          <>
            <section className="queue-panel admin-card"><div className="panel-heading"><div><h2>Roles & permissions</h2><p className="muted">Available role definitions and granted capabilities.</p></div></div><div className="admin-list">{roles.map((role) => <article key={role.role_id} className="admin-list-item"><div><strong>{role.name}</strong><p className="muted">{role.description || 'No description'}</p></div><div className="permission-list">{role.permissions.map((permission) => <span key={permission} className="status status-under_review">{permission}</span>)}<button className="action-btn" onClick={() => editPermissions(role)}>Edit permissions</button></div></article>)}</div></section>
            <section className="queue-panel admin-card"><div className="panel-heading"><div><h2>Create role</h2></div></div><form className="admin-form" onSubmit={createRole}><input required placeholder="Role name" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} /><input placeholder="Description" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} /><input placeholder="Permissions, comma separated" value={newRole.permissions} onChange={(e) => setNewRole({ ...newRole, permissions: e.target.value })} /><button className="primary-button">Create role</button></form></section>
          </>
        )}

        {tab === 'config' && <section className="queue-panel admin-card"><div className="panel-heading"><div><h2>System configuration</h2><p className="muted">Update runtime settings without editing deployment files.</p></div></div><div className="table-wrap"><table><thead><tr><th>Key</th><th>Value</th><th>Description</th><th>Action</th></tr></thead><tbody>{config.map((item) => <tr key={item.config_key}><td><strong>{item.config_key}</strong></td><td>{item.config_value}</td><td>{item.description || '—'}</td><td><button className="action-btn" onClick={() => updateConfig(item)}>Edit value</button></td></tr>)}</tbody></table></div></section>}

        {tab === 'audit' && <section className="queue-panel admin-card"><div className="panel-heading"><div><h2>Audit log</h2><p className="muted">Recent workflow and administrative events.</p></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Officer</th><th>Application</th><th>Notes</th></tr></thead><tbody>{audit.map((event) => <tr key={event.event_id}><td>{new Date(event.event_timestamp).toLocaleString()}</td><td>{event.event_type?.replaceAll('_', ' ')}</td><td>{event.officer_name || 'System'}</td><td>{event.application_id || '—'}</td><td>{event.notes || '—'}</td></tr>)}</tbody></table></div></section>}
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('ditsha-officer') || 'null'))
  function login(nextSession) {
    localStorage.setItem('ditsha-officer', JSON.stringify(nextSession))
    setSession(nextSession)
  }
  function logout() {
    localStorage.removeItem('ditsha-officer')
    setSession(null)
  }
  return session
    ? (session.officer_role === 'manager' ? <AdminDashboard session={session} onLogout={logout} /> : <Dashboard session={session} onLogout={logout} />)
    : <Login onLogin={login} />
}
