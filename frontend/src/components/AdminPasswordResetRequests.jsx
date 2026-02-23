import React, { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';

export default function AdminPasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  // For approve flow
  const [approving, setApproving] = useState(null); // request id
  const [approveComments, setApproveComments] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState(null); // { requestId, password }

  // For reject flow
  const [rejecting, setRejecting] = useState(null); // request id
  const [rejectComments, setRejectComments] = useState('');

  // For viewing details
  const [viewingDetail, setViewingDetail] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminAPI.getResetRequests(statusFilter || undefined);
      if (res?.data?.success) setRequests(res.data.data);
      else setError('Failed to load requests');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  /* ── Approve ─────────────────────────────────────────────────────────────── */
  const handleApprove = async (id) => {
    setError('');
    try {
      const res = await adminAPI.approveResetRequest(id, { comments: approveComments });
      if (res?.data?.success) {
        setGeneratedPassword({ requestId: id, password: res.data.data.plaintextPassword });
        setApproving(null);
        setApproveComments('');
        fetchRequests();
      } else {
        setError(res.data?.error || 'Approve failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  /* ── Reject ──────────────────────────────────────────────────────────────── */
  const handleReject = async (id) => {
    if (!rejectComments.trim()) { setError('Comments are required when rejecting'); return; }
    setError('');
    try {
      const res = await adminAPI.rejectResetRequest(id, { comments: rejectComments });
      if (res?.data?.success) {
        setRejecting(null);
        setRejectComments('');
        fetchRequests();
      } else {
        setError(res.data?.error || 'Reject failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  /* ── View details ────────────────────────────────────────────────────────── */
  const handleViewDetail = async (id) => {
    try {
      const res = await adminAPI.getResetRequestById(id);
      if (res?.data?.success) setViewingDetail(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Organizer Password Reset Requests</h2>

      {error && <div style={{ color: '#c00', marginBottom: 8 }}>{error}</div>}

      {/* ── Generated password display (shown once after approval) ──────────── */}
      {generatedPassword && (
        <div style={{ border: '2px solid #388e3c', background: '#e8f5e9', padding: 12, borderRadius: 6, marginBottom: 12 }}>
          <strong>✅ Password reset approved!</strong>
          <div style={{ margin: '8px 0' }}>
            New password: <code style={{ fontSize: 16, background: '#fff', padding: '2px 8px', border: '1px solid #ccc', borderRadius: 4 }}>{generatedPassword.password}</code>
            <button onClick={() => copyToClipboard(generatedPassword.password)} style={{ marginLeft: 8 }}>📋 Copy</button>
          </div>
          <div style={{ fontSize: 13, color: '#555' }}>
            This password has also been emailed to your admin email. Share it with the organizer securely.
          </div>
          <button onClick={() => setGeneratedPassword(null)} style={{ marginTop: 8 }}>Dismiss</button>
        </div>
      )}

      {/* ── Detail modal ───────────────────────────────────────────────────── */}
      {viewingDetail && (
        <div style={{ border: '1px solid #ccc', background: '#fafafa', padding: 12, borderRadius: 6, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0 }}>Request Details</h4>
            <button onClick={() => setViewingDetail(null)}>✕ Close</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <div><strong>Club:</strong> {viewingDetail.clubName}</div>
            <div><strong>Email:</strong> {viewingDetail.organizerEmail}</div>
            <div><strong>Reason:</strong> {viewingDetail.reason}</div>
            <div><strong>Status:</strong> {viewingDetail.status}</div>
            <div><strong>Admin Comments:</strong> {viewingDetail.adminComments || '—'}</div>
            <div><strong>Created:</strong> {new Date(viewingDetail.createdAt).toLocaleString()}</div>
          </div>
          {viewingDetail.history && viewingDetail.history.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>History:</strong>
              <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                {viewingDetail.history.map((h, i) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                    <strong>{h.action}</strong> by {h.role} at {new Date(h.timestamp).toLocaleString()}
                    {h.comments && <span> — "{h.comments}"</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Status filter ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>Filter:</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <button onClick={fetchRequests}>Refresh</button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ color: '#666' }}>No requests found.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Club Name</th>
              <th style={{ padding: 6 }}>Email</th>
              <th style={{ padding: 6 }}>Reason</th>
              <th style={{ padding: 6 }}>Date</th>
              <th style={{ padding: 6 }}>Status</th>
              <th style={{ padding: 6 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r._id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6 }}>{r.clubName}</td>
                <td style={{ padding: 6 }}>{r.organizerEmail}</td>
                <td style={{ padding: 6, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: 6 }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: r.status === 'Pending' ? '#fff3e0' : r.status === 'Approved' ? '#e8f5e9' : '#ffebee',
                    color: r.status === 'Pending' ? '#e65100' : r.status === 'Approved' ? '#2e7d32' : '#c62828',
                  }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: 6 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => handleViewDetail(r._id)} style={{ fontSize: 12 }}>View</button>
                    {r.status === 'Pending' && (
                      <>
                        <button
                          onClick={() => { setApproving(r._id); setRejecting(null); }}
                          style={{ fontSize: 12, color: '#2e7d32' }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setRejecting(r._id); setApproving(null); }}
                          style={{ fontSize: 12, color: '#c62828' }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Approve inline form ────────────────────────────────────────────── */}
      {approving && (
        <div style={{ border: '1px solid #388e3c', padding: 12, borderRadius: 6, marginTop: 12 }}>
          <strong>Approve Request</strong>
          <div style={{ margin: '8px 0' }}>
            <textarea
              placeholder="Optional comments…"
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
            A new password will be generated. It will be shown here once and emailed to your admin email.
          </div>
          <button onClick={() => handleApprove(approving)} style={{ marginRight: 8 }}>Confirm Approve</button>
          <button onClick={() => { setApproving(null); setApproveComments(''); }}>Cancel</button>
        </div>
      )}

      {/* ── Reject inline form ─────────────────────────────────────────────── */}
      {rejecting && (
        <div style={{ border: '1px solid #c62828', padding: 12, borderRadius: 6, marginTop: 12 }}>
          <strong>Reject Request</strong>
          <div style={{ margin: '8px 0' }}>
            <textarea
              placeholder="Rejection reason (required)…"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <button onClick={() => handleReject(rejecting)} style={{ marginRight: 8 }}>Confirm Reject</button>
          <button onClick={() => { setRejecting(null); setRejectComments(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
