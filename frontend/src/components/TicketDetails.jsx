import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventAPI } from '../services/api';

export default function TicketDetails() {
  const { regId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchTicket = async () => {
      setLoading(true);
      try {
        const res = await eventAPI.getRegistrationTicket(regId);
        if (!mounted) return;
        if (res && res.data && res.data.success) {
          setTicket(res.data.data);
        } else {
          setError((res && res.data && res.data.error) || 'Failed to load ticket');
        }
      } catch (err) {
        setError(err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message || 'Failed to load ticket');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (!regId) {
      setError('Invalid registration id');
      setLoading(false);
    } else {
      fetchTicket();
    }
    return () => { mounted = false; };
  }, [regId]);

  if (loading) return <div style={{ padding: 20 }}>Loading ticket...</div>;
  if (error) return (
    <div style={{ padding: 20 }}>
      <div style={{ color: 'red' }}>{error}</div>
      <div style={{ marginTop: 12 }}><button onClick={() => navigate(-1)}>Go back</button></div>
    </div>
  );

  const { ticketId, ticketQrBase64, contentType, event } = ticket || {};
  const imgSrc = ticketQrBase64 ? `data:${contentType};base64,${ticketQrBase64}` : null;

  return (
    <div style={{ padding: 20 }}>
      <h3>Ticket Details</h3>
      {event && <div style={{ marginBottom: 8 }}><strong>Event:</strong> {event.name}</div>}
      <div style={{ marginBottom: 8 }}><strong>Registration ID:</strong> {regId}</div>
      <div style={{ marginBottom: 8 }}><strong>Ticket ID:</strong> {ticketId}</div>
      {imgSrc ? (
        <div style={{ marginTop: 12 }}>
          <img src={imgSrc} alt="Ticket QR" style={{ maxWidth: 320, height: 'auto', border: '1px solid #ddd', padding: 8, borderRadius: 8 }} />
        </div>
      ) : (
        <div>No QR available</div>
      )}

      <div style={{ marginTop: 16 }}>
        <button onClick={() => navigate(-1)} style={{ padding: '6px 12px' }}>Back</button>
      </div>
    </div>
  );
}
