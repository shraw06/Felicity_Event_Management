import React, { useEffect, useState } from 'react';
import { eventAPI } from '../services/api';

export default function ParticipantDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [error, setError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [activeTab, setActiveTab] = useState('Normal');

  useEffect(() => {
    let mounted = true;
    const fetchUpcomingEvents = async () => {
      setLoading(true);
      try {
        // request upcoming registrations only from backend
        const res = await eventAPI.getMyRegistrations(true);
        if (!mounted) return;
        if (res && res.data && res.data.success) {
          setUpcomingEvents(res.data.data || []);
        } else {
          setError((res && res.data && res.data.error) || 'Failed to load upcoming events');
        }
      } catch (err) {
        if (mounted) {
          setError(err.response && err.response.data && err.response.data.error ? 
            err.response.data.error : err.message || 'Failed to load upcoming events');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await eventAPI.getMyRegistrations(); // full history
        if (!mounted) return;
        if (res && res.data && res.data.success) {
          setHistoryItems(res.data.data || []);
        } else {
          setHistoryError((res && res.data && res.data.error) || 'Failed to load participation history');
        }
      } catch (err) {
        if (mounted) {
          setHistoryError(err.response && err.response.data && err.response.data.error ?
            err.response.data.error : err.message || 'Failed to load participation history');
        }
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };
    fetchUpcomingEvents();
    fetchHistory();
    return () => { mounted = false; };
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return '—';
    }
  };

  // categorize history items into tabs
  const categorized = (() => {
    const normal = [];
    const merch = [];
    const completed = [];
    const cancelled = [];

    for (const it of historyItems) {
      const reg = it.registration;
      const ev = it.event || {};
      const status = (reg && reg.status) || '';
      const type = (ev.type || '').toLowerCase();

      if (status === 'UPCOMING') {
        if (type === 'merchandise') merch.push(it);
        else normal.push(it);
      } else if (status === 'COMPLETED') {
        completed.push(it);
      } else if (status === 'CANCELLED') {
        cancelled.push(it);
      } else {
        // fallback: treat unknown as normal
        if (type === 'merchandise') merch.push(it);
        else normal.push(it);
      }
    }

    return { normal, merch, completed, cancelled };
  })();

  return (
    <div>
      <h3>Dashboard</h3>
      <p>Welcome to your dashboard. Here's an overview of your activity.</p>

      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
        <div>
          <h3>Upcoming Events</h3>

          {loading && <div>Loading upcoming events...</div>}

          {error && (
            <div style={{ color: 'red', padding: 12, border: '1px solid #fdd', borderRadius: 6, backgroundColor: '#fef5f5' }}>
              {error}
            </div>
          )}

          {!loading && !error && upcomingEvents.length === 0 && (
            <div style={{ color: '#666', fontStyle: 'italic', padding: 16, textAlign: 'center', border: '1px dashed #ddd', borderRadius: 6 }}>
              You have no upcoming registered events. <a href="/participant/browse-events" style={{ color: '#007bff' }}>Browse Events</a> to find something interesting!
            </div>
          )}

          {!loading && !error && upcomingEvents.length > 0 && (
            <div style={{ display: 'grid', gap: 16 }}>
              {upcomingEvents.map(({ registration, event }) => (
                <div 
                  key={registration._id} 
                  style={{ 
                    border: '1px solid #e6e6e6', 
                    padding: 16, 
                    borderRadius: 8, 
                    backgroundColor: '#fafafa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                      {event.name}
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 14, color: '#555' }}>
                      <span><strong>Type:</strong> {event.type}</span>
                      <span><strong>Organizer:</strong> {event.organizer_name || event.organizer_id}</span>
                    </div>

                    <div style={{ fontSize: 14, color: '#444' }}>
                      <div><strong>Start:</strong> {formatDate(event.event_start_date)}</div>
                      <div><strong>End:</strong> {formatDate(event.event_end_date)}</div>
                      {event.registration_deadline && (
                        <div><strong>Registration Deadline:</strong> {formatDate(event.registration_deadline)}</div>
                      )}
                    </div>

                    {event.description && (
                      <div style={{ marginTop: 8, fontSize: 14, color: '#666', fontStyle: 'italic' }}>
                        {event.description.length > 100 ? event.description.substring(0, 100) + '...' : event.description}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', marginLeft: 16 }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                      Reg. ID: {registration._id.substring(registration._id.length - 6)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      <button 
                        onClick={() => window.location.href = `/events/${event._id}`}
                        style={{ 
                          padding: '6px 12px', 
                          backgroundColor: '#007bff', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: 4, 
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        View Details
                      </button>
                      <a href={`/participant/registration/${registration._id}/ticket`} style={{ fontSize: 12, color: '#007bff' }}>Ticket Details</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3>Participation History</h3>

          <div style={{ border: '1px solid #e9e9e9', borderRadius: 8, padding: 12, background: '#fff' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {['Normal','Merchandise','Completed','Cancelled/Rejected'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: activeTab === tab ? '1px solid #007bff' : '1px solid #ddd',
                    background: activeTab === tab ? '#e7f0ff' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div style={{ minHeight: 140 }}>
              {historyLoading && <div>Loading participation history...</div>}
              {historyError && <div style={{ color: 'red' }}>{historyError}</div>}

              {!historyLoading && !historyError && (
                (() => {
                  let list = [];
                  if (activeTab === 'Normal') list = categorized.normal;
                  else if (activeTab === 'Merchandise') list = categorized.merch;
                  else if (activeTab === 'Completed') list = categorized.completed;
                  else if (activeTab === 'Cancelled/Rejected') list = categorized.cancelled;

                  if (!list || list.length === 0) {
                    return (
                      <div style={{ color: '#666', fontStyle: 'italic', padding: 12, textAlign: 'center' }}>
                        No participation history
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {list.map(({ registration, event }) => (
                        <div key={registration._id} style={{ border: '1px solid #f1f1f1', padding: 8, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{event.name}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{event.type} • Reg ID: {registration._id.substring(registration._id.length - 6)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, color: '#444' }}>{formatDate(event.event_start_date)}</div>
                            <button onClick={() => window.location.href = `/events/${event._id}`} style={{ marginTop: 6, padding: '4px 8px', fontSize: 12 }}>View</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}