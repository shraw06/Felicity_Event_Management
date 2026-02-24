import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { organizerAPI, eventAPI } from '../services/api';

const OrganizerDetail = () => {
  const { email } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [organizerData, setOrganizerData] = useState(null); // will hold { event, registrationCount }
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchEvent = async () => {
      setLoading(true);
      try {
        const res = await organizerAPI.getOrganizer(email);
        if (!mounted) return;
        if (res && res.data && res.data.success) {
          setOrganizerData(res.data.data);
        } else {
          setError((res && res.data && res.data.error) || 'Failed to load organizer');
        }
      } catch (err) {
        setError(err.message || 'Failed to load organizer');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchEvent();

    const fetchEvents = async () => {
      try {
        const orgRes = await organizerAPI.getOrganizer(email);
        const org = orgRes && orgRes.data && orgRes.data.data ? orgRes.data.data : null;
        if (!org || !org._id) return;
        const evRes = await eventAPI.getEventsByOrganizer(org._id);
        const evs = evRes && evRes.data && evRes.data.data ? evRes.data.data : [];
        if (!mounted) return;
        setEvents(evs);

        const now = new Date();
        const upcomingList = evs.filter(e => {
          try {
            if (e.status !== 'published' && e.status !== 'ongoing') return false;
            if (e.event_end_date && new Date(e.event_end_date) <= now) return false;
            return true;
          } catch (err) { return false; }
        });
        const pastList = evs.filter(e => {
          try {
            if (e.event_end_date && new Date(e.event_end_date) <= now) return true;
            return false;
          } catch (err) { return false; }
        });

        setUpcoming(upcomingList);
        setPast(pastList);
      } catch (err) {
        console.error('Failed to load organizer events', err);
      }
    };
    fetchEvents();
    return () => { mounted = false; };
  }, [email]);

  if (loading) return <div style={{ padding: 12 }}>Loading organizer...</div>;
  if (error) return <div style={{ padding: 12, color: 'red' }}>{error}</div>;
  if (!organizerData) return <div style={{ padding: 12 }}>No organizer data.</div>;

  return (
    <div style={{ padding: 12 }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>← Back</button>

      <h2>{organizerData.first_name} {organizerData.last_name}</h2>
      <div style={{ marginBottom: 10, color: '#555' }}>{organizerData.description}</div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div><strong>Category:</strong> {organizerData.category}</div>
        <div><strong>Contact:</strong> {organizerData.contact_number}</div>
        <div><strong>Email:</strong> {organizerData.email}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3>Events</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 12 }}>
          <div>
            <h4>Upcoming</h4>
            {upcoming.length === 0 ? (
              <div style={{ color: '#666', fontStyle: 'italic', padding: 12 }}>No upcoming events</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {upcoming.map(ev => (
                  <div key={ev._id} style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
                    <div style={{ fontWeight: 700 }}>{ev.name}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>{ev.type} • {ev.event_start_date ? new Date(ev.event_start_date).toLocaleString() : '—'}</div>
                    <div style={{ marginTop: 8 }}>{ev.description && (ev.description.length > 120 ? ev.description.substring(0, 120) + '...' : ev.description)}</div>
                    <div style={{ marginTop: 8, textAlign: 'right' }}>
                      <button onClick={() => window.location.href = `/events/${ev._id}`} style={{ padding: '6px 10px' }}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4>Past</h4>
            {past.length === 0 ? (
              <div style={{ color: '#666', fontStyle: 'italic', padding: 12 }}>No past events</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {past.map(ev => (
                  <div key={ev._id} style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
                    <div style={{ fontWeight: 700 }}>{ev.name}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>{ev.type} • {ev.event_start_date ? new Date(ev.event_start_date).toLocaleString() : '—'}</div>
                    <div style={{ marginTop: 8 }}>{ev.description && (ev.description.length > 120 ? ev.description.substring(0, 120) + '...' : ev.description)}</div>
                    <div style={{ marginTop: 8, textAlign: 'right' }}>
                      <button onClick={() => window.location.href = `/events/${ev._id}`} style={{ padding: '6px 10px' }}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizerDetail;
