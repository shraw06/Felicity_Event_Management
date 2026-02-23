import React, { useEffect, useState } from 'react';
import { organizerAPI } from '../services/api';

export default function AdminManageOrganizers() {
  const [organizers, setOrganizers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ contactEmail: '', first_name: '', last_name: '', category: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null); // { success, message }

  const fetchOrganizers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organizerAPI.getOrganizers();
      if (res && res.data && res.data.success) {
        setOrganizers(res.data.data || []);
      } else {
        setError((res && res.data && res.data.error) || 'Failed to load organizers');
      }
    } catch (err) {
      setError(err.message || 'Failed to load organizers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrganizers(); }, []);

  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (org) => {
    const identifier = org._id || org.email;
    if (!identifier) return;
    const confirmed = window.confirm(`Delete organizer ${org.first_name} ${org.last_name}? This will also remove their events and registrations.`);
    if (!confirmed) return;
    try {
      setDeletingId(identifier);
      const res = await organizerAPI.deleteOrganizer(identifier);
      if (res && res.data && res.data.success) {
        // refresh list
        await fetchOrganizers();
      } else {
        alert((res && res.data && res.data.error) || 'Failed to delete organizer');
      }
    } catch (err) {
      alert(err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message || 'Failed to delete organizer');
    } finally {
      setDeletingId(null);
    }
  };

  const openModal = () => {
    setForm({ contactEmail: '', first_name: '', last_name: '', category: '', description: '' });
    setSubmitResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSubmitResult(null);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.contactEmail.trim()) { setSubmitResult({ success: false, message: 'Contact email is required.' }); return; }
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await organizerAPI.createOrganizer(form);
      if (res && res.data && res.data.success) {
        const { organizer, message } = res.data.data;
        setSubmitResult({ success: true, message: message || 'Organizer created successfully.', loginEmail: organizer.email });
        fetchOrganizers(); // refresh list
      } else {
        setSubmitResult({ success: false, message: (res && res.data && res.data.error) || 'Failed to create organizer.' });
      }
    } catch (err) {
      const msg = err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message || 'Failed to create organizer.';
      setSubmitResult({ success: false, message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Manage Clubs &amp; Organizers</h3>
        <button
          onClick={openModal}
          style={{ padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          + Add New Club/Organizer
        </button>
      </div>

      {loading && <div>Loading organizers...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gap: 12 }}>
          {organizers.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No organizers found.</div>}
          {organizers.map(org => (
            <div key={org._id || org.email} style={{ border: '1px solid #e6e6e6', padding: 14, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{org.first_name} {org.last_name}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{org.category || '—'}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Login email: {org.email}</div>
                {org.description && <div style={{ marginTop: 6, color: '#555', fontSize: 13 }}>{org.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.location.href = `/organizers/${org.email}`} style={{ padding: '6px 10px' }}>View</button>
                <button onClick={() => handleDelete(org)} disabled={deletingId === (org._id || org.email)} style={{ padding: '6px 10px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {deletingId === (org._id || org.email) ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Modal ---- */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h4 style={{ margin: '0 0 16px' }}>Add New Club / Organizer</h4>

            {submitResult && submitResult.success ? (
              <div>
                <div style={{ padding: 14, borderRadius: 6, background: '#eaffea', border: '1px solid #b2e0b2', marginBottom: 16 }}>
                  <div style={{ color: '#2a7a2a', fontWeight: 600 }}>✓ {submitResult.message}</div>
                  {submitResult.loginEmail && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#444' }}>
                      Generated login email: <strong>{submitResult.loginEmail}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setSubmitResult(null); }} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>Add Another</button>
                  <button onClick={closeModal} style={{ padding: '7px 16px', borderRadius: 6, background: '#007bff', color: '#fff', border: 'none', cursor: 'pointer' }}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
                  Provide the organizer's contact email. The system will auto-generate a login email and password and send them there.
                </p>

                <label style={labelStyle}>Contact Email <span style={{ color: 'red' }}>*</span></label>
                <input name="contactEmail" type="email" required value={form.contactEmail} onChange={handleChange} style={inputStyle} placeholder="contact@club.org" />

                <label style={labelStyle}>First Name / Club Short Name</label>
                <input name="first_name" type="text" value={form.first_name} onChange={handleChange} style={inputStyle} placeholder="e.g. Robotics" />

                <label style={labelStyle}>Last Name / Club Full Name</label>
                <input name="last_name" type="text" value={form.last_name} onChange={handleChange} style={inputStyle} placeholder="e.g. Club" />

                <label style={labelStyle}>Category</label>
                <input name="category" type="text" value={form.category} onChange={handleChange} style={inputStyle} placeholder="e.g. Technical, Cultural…" />

                <label style={labelStyle}>Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} style={{ ...inputStyle, height: 72, resize: 'vertical' }} placeholder="Short description (optional)" />

                {submitResult && !submitResult.success && (
                  <div style={{ color: 'red', fontSize: 13, marginBottom: 10 }}>{submitResult.message}</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={closeModal} disabled={submitting} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: '#fff' }}>Cancel</button>
                  <button type="submit" disabled={submitting} style={{ padding: '7px 16px', borderRadius: 6, background: '#007bff', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    {submitting ? 'Creating…' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, marginTop: 12, color: '#333' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' };
