import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventAPI, organizerAPI } from '../services/api';

const STATUS_COLORS = {
  draft: '#ffc107',
  published: '#17a2b8',
  ongoing: '#28a745',
  completed: '#6c757d',
  closed: '#dc3545',
};

function EventCard({ ev, onEdit, analytics, attendance }) {
  const statusColor = STATUS_COLORS[ev.status] || '#999';
  const navigate = useNavigate();

  const handleClick = () => {
    if (ev.status === 'draft') onEdit(ev);
  };
  const handleView = () => {
    const id = ev._id || ev.id;
    if (id) navigate(`/organizer/events/${id}`);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        cursor: ev.status === 'draft' ? 'pointer' : 'default',
        background: '#fff',
        minWidth: 280,
        flex: '0 0 auto',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <strong>{ev.name || '(Untitled)'}</strong>
        <span style={{
          background: statusColor,
          color: '#fff',
          padding: '2px 10px',
          borderRadius: 12,
          fontSize: 12,
          textTransform: 'uppercase',
        }}>{ev.status}</span>
      </div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{ev.type || 'No type'}</div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
        {ev.formFields ? ev.formFields.length : 0} form field(s)
        {ev.registration_limit ? ` · Limit: ${ev.registration_limit}` : ''}
      </div>

      {ev.event_start_date && new Date(ev.event_start_date) <= new Date() && (
        <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>
          <strong style={{ fontWeight: 700 }}>{attendance ? (attendance.scanned ?? attendance.total ?? 0) : '—'}</strong>
          <span style={{ marginLeft: 6, color: '#666', fontSize: 11 }}>attendance</span>
        </div>
      )}

      {analytics && ev.status === 'published' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 13 }}>
            <strong>{analytics.totalRegistrations ?? 0}</strong>
            <div style={{ fontSize: 11, color: '#666' }}>Registrations</div>
          </div>
          <div style={{ fontSize: 13 }}>
            <strong>{analytics.activeRegistrations ?? 0}</strong>
            <div style={{ fontSize: 11, color: '#666' }}>Sales</div>
          </div>
          <div style={{ fontSize: 13 }}>
            <strong>₹{analytics.estimatedRevenue ?? 0}</strong>
            <div style={{ fontSize: 11, color: '#666' }}>Revenue</div>
          </div>
        </div>
      )}

      {ev.status === 'draft' && (
        <div style={{ fontSize: 11, color: '#007bff', marginTop: 4 }}>
          Click to edit
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={handleView} style={{ padding: '6px 10px' }}>View</button>
        <button onClick={() => onEdit(ev)} style={{ padding: '6px 10px' }}>Edit</button>
      </div>
    </div>
  );
}

export default function OrganizerOngoingEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyticsByEventId, setAnalyticsByEventId] = useState({});
  const [attendanceByEventId, setAttendanceByEventId] = useState({});
  const navigate = useNavigate();

  const getOrganizerId = useCallback(async () => {
    const email = localStorage.getItem('organizerEmail');
    if (!email) return null;
    try {
      const res = await organizerAPI.getOrganizer(email);
      return res.data?.data?._id || null;
    } catch { return null; }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const orgId = await getOrganizerId();
      if (!orgId) { setError('Unable to get organizer information'); return; }
      const res = await eventAPI.getEventsByOrganizer(orgId);
      const all = res.data?.data || [];
      const now = new Date();
      const ongoing = all.filter(e => {
        try {
          const start = e.event_start_date ? new Date(e.event_start_date) : null;
          const end = e.event_end_date ? new Date(e.event_end_date) : null;
          if (start && end) return start <= now && now <= end;
          if (start && !end) return start <= now;
          if (!start && end) return now <= end;
          return false;
        } catch (ex) { return false; }
      });
      setEvents(ongoing);
    } catch (err) {
      console.error('Failed to load ongoing events', err);
      setError('Failed to load ongoing events');
    } finally { setLoading(false); }
  }, [getOrganizerId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // fetch analytics for published ongoing events
  useEffect(() => {
    let cancelled = false;
    const fetchForPublished = async () => {
      const pub = events.filter(e => e.status === 'published');
      if (!pub || pub.length === 0) { setAnalyticsByEventId({}); return; }
      try {
        const promises = pub.map(ev =>
          eventAPI.getEventRegistrations(ev._id)
            .then(res => ({ id: ev._id, analytics: res.data?.analytics || res.data?.data?.analytics || res.data?.data }))
            .catch(() => ({ id: ev._id, analytics: null }))
        );
        const results = await Promise.all(promises);
        if (cancelled) return;
        const map = {};
        for (const r of results) map[r.id] = r.analytics || null;
        setAnalyticsByEventId(map);
      } catch (e) {
        if (!cancelled) setAnalyticsByEventId({});
      }
    };
    fetchForPublished();
    return () => { cancelled = true; };
  }, [events]);

  // attendance for started events
  useEffect(() => {
    let cancelled = false;
    const loadAttendance = async () => {
      try {
        const now = new Date();
        const started = events.filter(e => e.event_start_date && new Date(e.event_start_date) <= now);
        if (!started || started.length === 0) { setAttendanceByEventId({}); return; }
        const promises = started.map(ev =>
          eventAPI.getEventAttendance(ev._id)
            .then(res => ({ id: ev._id, counts: res.data?.data?.counts || null }))
            .catch(() => ({ id: ev._id, counts: null }))
        );
        const results = await Promise.all(promises);
        if (cancelled) return;
        const map = {};
        for (const r of results) map[r.id] = r.counts || null;
        setAttendanceByEventId(map);
      } catch (err) { if (!cancelled) setAttendanceByEventId({}); }
    };
    loadAttendance();
    return () => { cancelled = true; };
  }, [events]);

  const handleEditEvent = (ev) => navigate('/organizer/create-events', { state: { eventToEdit: ev } });

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading ongoing events...</div>;
  if (error) return <div style={{ padding: 20, textAlign: 'center', color: '#dc3545' }}>{error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Ongoing Events</h2>
      {events.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#666', background: '#f8f9fa', borderRadius: 8 }}>
          No ongoing events found for your account.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {events.map(ev => (
            <EventCard key={ev._id} ev={ev} onEdit={handleEditEvent} analytics={analyticsByEventId[ev._id]} attendance={attendanceByEventId[ev._id]} />
          ))}
        </div>
      )}
    </div>
  );
}
