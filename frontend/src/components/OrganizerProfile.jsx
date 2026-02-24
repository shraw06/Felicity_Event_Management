import React, { useEffect, useState } from 'react';
import { organizerAPI } from '../services/api';

export default function OrganizerProfile() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    category: '',
    description: '',
    contact_number: '',
    email: '',
    discordWebhook: '',
  });

  const [resetReason, setResetReason] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const email = localStorage.getItem('organizerEmail');
        if (!email) {
          setMessage('No organizer email found. Please login.');
          setLoading(false);
          return;
        }

        const res = await organizerAPI.getOrganizer(email);
        const org = res.data && res.data.data ? res.data.data : null;
        if (!org) {
          setMessage('Organizer not found');
          setLoading(false);
          return;
        }

        setForm({
          first_name: org.first_name || '',
          last_name: org.last_name || '',
          category: org.category || '',
          description: org.description || '',
          contact_number: org.contact_number || '',
          email: org.email || '',
          discordWebhook: org.discordWebhook || '',
        });

        try {
          const rr = await organizerAPI.getMyResetRequests();
          if (rr?.data?.success) setMyRequests(rr.data.data);
        } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('Failed to load organizer', err);
        setMessage('Failed to load organizer');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setMessage(null);
    try {
      const email = form.email;
      await organizerAPI.updateOrganizer(email, {
        first_name: form.first_name,
        last_name: form.last_name,
        category: form.category,
        description: form.description,
        contact_number: form.contact_number,
        discordWebhook: form.discordWebhook,
      });
      setMessage('Profile saved (server response).');
    } catch (err) {
      console.error('Save failed', err);
      setMessage('Save failed (server may not support organizer update).');
    }
  };

  if (loading) return <div>Loading organizer profile...</div>;

  return (
    <div className="organizer-profile container" style={{ maxWidth: 700 }}>
      <h2>Organizer Profile</h2>
      {message && <div style={{ marginBottom: 12 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label>First Name</label>
          <input name="first_name" value={form.first_name} onChange={handleChange} />
        </div>
        <div>
          <label>Last Name</label>
          <input name="last_name" value={form.last_name} onChange={handleChange} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Category</label>
        <input name="category" value={form.category} onChange={handleChange} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Description</label>
        <textarea name="description" value={form.description} onChange={handleChange} rows={4} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Contact Number</label>
        <input name="contact_number" value={form.contact_number} onChange={handleChange} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Discord Webhook URL</label>
        <input 
          name="discordWebhook" 
          value={form.discordWebhook} 
          onChange={handleChange} 
          placeholder="https://discord.com/api/webhooks/..." 
          style={{ width: '100%' }}
        />
        <small style={{ display: 'block', color: '#666', marginTop: 4 }}>
          Optional. New published events will be automatically posted to this channel.
        </small>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Login Email (read-only)</label>
        <div style={{ padding: '8px 0' }}>{form.email}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn-submit" onClick={handleSave}>Save Profile</button>
      </div>

      <hr style={{ margin: '24px 0' }} />
      <h3>Request Password Reset</h3>
      <p style={{ fontSize: 13, color: '#666' }}>
        Submit a request to the Admin. Once approved, the Admin will share a new password with you.
      </p>
      <div style={{ marginBottom: 8 }}>
        <textarea
          placeholder="Reason for password reset…"
          value={resetReason}
          onChange={(e) => setResetReason(e.target.value)}
          rows={3}
          maxLength={1000}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      <button
        onClick={async () => {
          if (!resetReason.trim()) { setResetMsg('Please provide a reason.'); return; }
          setResetLoading(true); setResetMsg('');
          try {
            const res = await organizerAPI.createResetRequest({ reason: resetReason.trim() });
            if (res?.data?.success) {
              setResetMsg('Request submitted successfully!');
              setResetReason('');
              setMyRequests((prev) => [res.data.data, ...prev]);
            } else {
              setResetMsg(res.data?.error || 'Failed');
            }
          } catch (e) {
            setResetMsg(e.response?.data?.error || e.message);
          } finally { setResetLoading(false); }
        }}
        disabled={resetLoading}
      >
        {resetLoading ? 'Submitting…' : 'Submit Reset Request'}
      </button>
      {resetMsg && <div style={{ marginTop: 6, color: resetMsg.includes('success') ? '#2e7d32' : '#c00' }}>{resetMsg}</div>}

      {myRequests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Your Reset Requests</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: 4 }}>Date</th>
                <th style={{ padding: 4 }}>Reason</th>
                <th style={{ padding: 4 }}>Status</th>
                <th style={{ padding: 4 }}>Admin Comments</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((r) => (
                <tr key={r._id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: 4 }}>{r.reason}</td>
                  <td style={{ padding: 4 }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 4, fontSize: 11,
                      background: r.status === 'Pending' ? '#fff3e0' : r.status === 'Approved' ? '#e8f5e9' : '#ffebee',
                      color: r.status === 'Pending' ? '#e65100' : r.status === 'Approved' ? '#2e7d32' : '#c62828',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: 4 }}>{r.adminComments || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}