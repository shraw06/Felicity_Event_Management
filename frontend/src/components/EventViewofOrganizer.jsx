import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventAPI, organizerAPI } from '../services/api';
import Forum from './Forum';

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch (e) { return String(d); }
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export default function EventViewofOrganizer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'forum'
  const [organizerProfile, setOrganizerProfile] = useState(null);

  // Filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Feedback state
  const [fbSummary, setFbSummary] = useState(null);
  const [fbItems, setFbItems] = useState([]);
  const [fbTotal, setFbTotal] = useState(0);
  const [fbPage, setFbPage] = useState(1);
  const [fbPages, setFbPages] = useState(1);
  const [fbRatingFilter, setFbRatingFilter] = useState('');
  const [fbLoading, setFbLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const res = await eventAPI.getEventRegistrations(id);
        if (!res.data || !res.data.success) throw new Error(res.data?.error || 'Failed to load');
        const data = res.data.data || {};
        setEvent(data.event);
        setRegistrations(data.registrations || []);
        setAnalytics(data.analytics || {});

        // Load feedback summary
        try {
          const fbRes = await eventAPI.getFeedbackSummary(id);
          if (fbRes?.data?.success) setFbSummary(fbRes.data.data);
        } catch { /* no feedback yet */ }

        // Load organizer profile for Forum identity
        try {
          const email = localStorage.getItem('organizerEmail');
          if (email) {
            const oRes = await organizerAPI.getOrganizer(email);
            if (oRes?.data?.data) setOrganizerProfile(oRes.data.data);
          }
        } catch { /* ignore */ }
      } catch (err) {
        console.error('Failed loading event view', err);
        setError(err.response?.data?.error || err.message || 'Failed to load');
      } finally { setLoading(false); }
    };
    load();
  }, [id]);

  // Load feedback items whenever page or rating filter changes
  useEffect(() => {
    if (!event) return;
    const loadFb = async () => {
      setFbLoading(true);
      try {
        const params = { page: fbPage, limit: 10 };
        if (fbRatingFilter) params.rating = fbRatingFilter;
        const r = await eventAPI.getFeedback(id, params);
        if (r?.data?.success) {
          setFbItems(r.data.data.items || []);
          setFbTotal(r.data.data.total || 0);
          setFbPages(r.data.data.pages || 1);
        }
      } catch { /* ignore */ }
      finally { setFbLoading(false); }
    };
    loadFb();
  }, [id, event, fbPage, fbRatingFilter]);

  const filtered = useMemo(() => {
    const qq = (q || '').trim().toLowerCase();
    return registrations.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!qq) return true;
      const p = r.participant || {};
      return (p.first_name || '').toLowerCase().includes(qq) || (p.last_name || '').toLowerCase().includes(qq) || (p.email || '').toLowerCase().includes(qq) || (r.ticketId || '').toLowerCase().includes(qq);
    });
  }, [registrations, q, statusFilter]);

  const exportCsv = () => {
    const rows = [];
    rows.push(['Name','Email','Registration Date','Status','Ticket ID']);
    for (const r of filtered) {
      const p = r.participant || {};
      rows.push([
        `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        p.email || '',
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
        r.status || '',
        r.ticketId || '',
      ]);
    }
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event && event.name) ? event.name.replace(/[^a-z0-9]/gi,'_').toLowerCase() : 'event'}_registrations.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 20 }}>Loading event...</div>;
  if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;
  if (!event) return <div style={{ padding: 20 }}>Event not found.</div>;

  return (
    <div className="event-view-organizer container" style={{ maxWidth: 900, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{event.name || '(Untitled)'}</h2>
        <div>
          <button onClick={() => navigate('/organizer/dashboard')} style={{ marginRight: 8 }}>← Back</button>
          <button onClick={() => navigate(`/organizer/events/${id}/attendance`)} style={{ marginRight: 8 }}>Scan Attendance</button>
          <button onClick={() => navigate('/organizer/create-events', { state: { eventToEdit: event } })}>Edit</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e0e0e0', margin: '12px 0 16px' }}>
        {['overview', 'forum'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === tab ? 700 : 400,
              borderBottom: activeTab === tab ? '2px solid #5865f2' : '2px solid transparent',
              color: activeTab === tab ? '#5865f2' : '#555',
              marginBottom: -2, fontSize: 14, textTransform: 'capitalize',
            }}>
            {tab === 'forum' ? '💬 Forum' : '📋 Overview'}
          </button>
        ))}
      </div>

      {activeTab === 'forum' && (
        <div style={{ height: 560, display: 'flex', flexDirection: 'column', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
          <Forum
            eventId={id}
            isOrganizer={true}
            myId={organizerProfile?._id}
            myName={organizerProfile ? `${organizerProfile.first_name} ${organizerProfile.last_name}` : 'Organizer'}
          />
        </div>
      )}

      {activeTab === 'overview' && (<>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
        <h3>Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <strong>Type</strong>
            <div>{event.type || '—'}</div>
          </div>
          <div>
            <strong>Status</strong>
            <div>{event.status || '—'}</div>
          </div>
          <div>
            <strong>Start</strong>
            <div>{formatDate(event.event_start_date)}</div>
          </div>
          <div>
            <strong>End</strong>
            <div>{formatDate(event.event_end_date)}</div>
          </div>
          <div>
            <strong>Eligibility</strong>
            <div>{event.non_iiit_eligibility ? 'Non-IIIT allowed' : 'IIIT only / Default'}</div>
          </div>
          <div>
            <strong>Pricing</strong>
            <div>{(Number(event.registration_fee) || 0) > 0 ? `₹ ${Number(event.registration_fee).toFixed(2)}` : 'Free'}</div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
        <h3>Analytics</h3>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{analytics.totalRegistrations || 0}</div>
            <div style={{ color: '#666' }}>Total registrations</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{analytics.activeRegistrations || 0}</div>
            <div style={{ color: '#666' }}>Active registrations</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>₹ {(analytics.estimatedRevenue || 0).toFixed(2)}</div>
            <div style={{ color: '#666' }}>Estimated revenue</div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Participants</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Search name, email, ticket" value={q} onChange={e=>setQ(e.target.value)} style={{ flex: 1 }} />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button onClick={exportCsv}>Export CSV</button>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 6, background: '#fff', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>Email</th>
                <th style={{ padding: 8 }}>Reg Date</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 12, color: '#666' }}>No participants found</td></tr>
              )}
              {filtered.map(r => {
                const p = r.participant || {};
                return (
                  <tr key={r.registrationId} style={{ borderBottom: '1px solid #fafafa' }}>
                    <td style={{ padding: 8 }}>{(p.first_name || '') + ' ' + (p.last_name || '')}</td>
                    <td style={{ padding: 8 }}>{p.email || ''}</td>
                    <td style={{ padding: 8 }}>{formatDate(r.createdAt)}</td>
                    <td style={{ padding: 8 }}>{r.status}</td>
                    <td style={{ padding: 8 }}>{r.ticketId || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Anonymous Feedback Section ──────────────────────────────────────────── */}
      <section style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
        <h3>Anonymous Feedback</h3>

        {fbSummary && fbSummary.count > 0 ? (
          <>
            {/* Summary card */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f5a623' }}>
                  {'★'.repeat(Math.round(fbSummary.avgRating))}{'☆'.repeat(5 - Math.round(fbSummary.avgRating))}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{fbSummary.avgRating} / 5</div>
                <div style={{ color: '#666' }}>{fbSummary.count} review{fbSummary.count !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const cnt = fbSummary.distribution?.[star] || 0;
                  const pct = fbSummary.count ? Math.round((cnt / fbSummary.count) * 100) : 0;
                  return (
                    <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ width: 18, textAlign: 'right' }}>{star}★</span>
                      <div style={{ width: 120, height: 10, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#f5a623', borderRadius: 4 }} />
                      </div>
                      <span style={{ color: '#666', minWidth: 30 }}>{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filter + export */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select value={fbRatingFilter} onChange={(e) => { setFbRatingFilter(e.target.value); setFbPage(1); }}>
                <option value="">All ratings</option>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
              </select>
              <button onClick={async () => {
                try {
                  const r = await eventAPI.exportFeedbackCsv(id);
                  const url = URL.createObjectURL(r.data);
                  const a = document.createElement('a'); a.href = url; a.download = `feedback-${id}.csv`;
                  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                } catch (e) { alert('Export failed: ' + (e.response?.data?.error || e.message)); }
              }}>Export CSV</button>
              <span style={{ color: '#666', fontSize: 13 }}>{fbTotal} feedback item{fbTotal !== 1 ? 's' : ''}</span>
            </div>

            {fbLoading ? <div>Loading feedback…</div> : (
              <div>
                {fbItems.length === 0 && <div style={{ color: '#666', padding: 8 }}>No feedback matching filter.</div>}
                {fbItems.map((fb) => (
                  <div key={fb._id} style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 0' }}>
                    <div style={{ color: '#f5a623', fontSize: 16 }}>{'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}</div>
                    {fb.comment && <div style={{ marginTop: 4, color: '#333' }}>{fb.comment}</div>}
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{formatDate(fb.createdAt)}</div>
                  </div>
                ))}
                {fbPages > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <button disabled={fbPage <= 1} onClick={() => setFbPage((p) => p - 1)}>← Prev</button>
                    <span style={{ fontSize: 13 }}>Page {fbPage} / {fbPages}</span>
                    <button disabled={fbPage >= fbPages} onClick={() => setFbPage((p) => p + 1)}>Next →</button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#666' }}>No feedback received yet.</div>
        )}
      </section>

      </>)}
    </div>
  );
}
