import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { eventAPI, participantAPI } from '../services/api';
import Forum from './Forum';

/* ── Star-rating helper ─────────────────────────────────────────────────────── */
const StarRating = ({ value, onChange, readonly }) => {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ fontSize: 24, cursor: readonly ? 'default' : 'pointer', userSelect: 'none' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{ color: star <= (hover || value) ? '#f5a623' : '#ccc' }}
          onClick={() => !readonly && onChange && onChange(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
        >
          ★
        </span>
      ))}
    </span>
  );
};

/* ── Feedback widget (shown to participants after event ends) ───────────────── */
const FeedbackWidget = ({ eventId, event, registered }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only show after event end date
  const eventEnded = event.event_end_date && new Date(event.event_end_date) <= new Date();
  const canFeedback = registered && eventEnded;

  useEffect(() => {
    if (!canFeedback) { setLoading(false); return; }
    let m = true;
    (async () => {
      try {
        const r = await eventAPI.getMyFeedback(eventId);
        if (!m) return;
        if (r?.data?.success) {
          setExisting(r.data.data);
          setRating(r.data.data.rating);
          setComment(r.data.data.comment || '');
        }
      } catch { /* no existing feedback */ }
      finally { if (m) setLoading(false); }
    })();
    return () => { m = false; };
  }, [eventId, canFeedback]);

  if (!canFeedback) return null;
  if (loading) return <div style={{ marginTop: 16 }}>Loading feedback…</div>;

  const handleSubmit = async () => {
    if (!rating) { setMsg('Please select a star rating'); return; }
    setSubmitting(true); setMsg('');
    try {
      const r = await eventAPI.submitFeedback(eventId, { rating, comment: comment.trim() });
      if (r?.data?.success) {
        setExisting(r.data.data);
        setMsg(existing ? 'Feedback updated!' : 'Feedback submitted!');
      } else {
        setMsg(r.data?.error || 'Submission failed');
      }
    } catch (e) {
      setMsg(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <section style={{ marginTop: 20, padding: 16, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
      <h4 style={{ marginTop: 0 }}>{existing ? 'Update Your Feedback' : 'Leave Feedback'}</h4>
      <div style={{ marginBottom: 8 }}>
        <label style={{ marginRight: 8 }}>Rating:</label>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional, max 2000 chars)"
          maxLength={2000}
          rows={3}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'vertical' }}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting || !rating}
        style={{ padding: '8px 18px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        {submitting ? 'Submitting…' : existing ? 'Update Feedback' : 'Submit Feedback'}
      </button>
      {msg && <div style={{ marginTop: 6, color: msg.includes('!') ? 'green' : '#c00' }}>{msg}</div>}
    </section>
  );
};

/* ── Small merchandise-order sub-component ──────────────────────────────────── */
const MerchandiseOrderSection = ({ eventId, canPurchase, purchaseBlockedReason, onOrderCreated }) => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let m = true;
    (async () => {
      try {
        const r = await eventAPI.getRegistration(eventId);
        if (!m) return;
        if (r?.data?.success && r.data.data?.registration) {
          const reg = r.data.data.registration;
          if (reg.payment_status) {
            try {
              const o = await eventAPI.getOrder(reg._id);
              if (o?.data?.success) { setOrder(o.data.data); } else { setOrder(reg); }
            } catch { setOrder(reg); }
          }
        }
      } catch { /* not registered */ }
      finally { if (m) setLoading(false); }
    })();
    return () => { m = false; };
  }, [eventId]);

  const pickFile = (e) => {
    const f = e.target.files[0];
    if (f && !['image/jpeg','image/png','image/webp'].includes(f.type)) {
      setMsg('Only JPEG, PNG or WebP images allowed'); setFile(null); setPreview(null); return;
    }
    if (f && f.size > 5 * 1024 * 1024) {
      setMsg('File must be under 5 MB'); setFile(null); setPreview(null); return;
    }
    setFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
    setMsg('');
  };

  const placeOrder = async () => {
    setMsg('');
    try {
      const r = await eventAPI.createOrder(eventId);
      if (r?.data?.success) { setOrder(r.data.data); onOrderCreated && onOrderCreated(); setMsg('Order placed — upload proof below.'); }
      else setMsg(r.data?.error || 'Failed');
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
  };

  const uploadProof = async () => {
    if (!file || !order?._id) return;
    setUploading(true); setMsg('');
    try {
      const fd = new FormData(); fd.append('paymentProof', file);
      const r = await eventAPI.uploadPaymentProof(order._id, fd);
      if (r?.data?.success) {
        setOrder(r.data.data); setFile(null); setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
        setMsg('Proof uploaded — awaiting approval.');
      } else setMsg(r.data?.error || 'Upload failed');
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setUploading(false); }
  };

  if (loading) return <div>Checking order…</div>;

  /* no order yet */
  if (!order) return (
    <div>
      {canPurchase
        ? <button onClick={placeOrder}>Place Order</button>
        : <button disabled title={purchaseBlockedReason}>{purchaseBlockedReason || 'Not available'}</button>}
      {msg && <div style={{ color: '#c00', marginTop: 4 }}>{msg}</div>}
    </div>
  );

  const ps = order.payment_status;

  /* awaiting_payment or rejected → show upload */
  if (ps === 'awaiting_payment' || ps === 'rejected') return (
    <div style={{ border: '1px solid #ccc', padding: 10, marginTop: 6 }}>
      <div><strong>Status:</strong> {ps === 'rejected' ? 'Rejected' : 'Awaiting Payment'}</div>
      {ps === 'rejected' && order.rejectionReason && (
        <div style={{ color: '#c00', margin: '4px 0' }}>Reason: {order.rejectionReason}</div>
      )}
      <div style={{ margin: '6px 0' }}>{ps === 'rejected' ? 'Re-upload proof:' : 'Upload payment proof:'}</div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} />
      {preview && <img src={preview} alt="preview" style={{ display: 'block', maxWidth: 180, marginTop: 4 }} />}
      <div style={{ marginTop: 6 }}>
        <button onClick={uploadProof} disabled={uploading || !file}>{uploading ? 'Uploading…' : 'Submit Proof'}</button>
      </div>
      {msg && <div style={{ marginTop: 4 }}>{msg}</div>}
    </div>
  );

  /* pending_approval */
  if (ps === 'pending_approval') return (
    <div style={{ border: '1px solid #ccc', padding: 10, marginTop: 6 }}>
      <div><strong>Status:</strong> Pending Approval</div>
      <div style={{ color: '#555', fontSize: 13 }}>Your proof is under review. You'll get an email when approved.</div>
    </div>
  );

  /* successful → show ticket */
  if (ps === 'successful') return (
    <div style={{ border: '1px solid #ccc', padding: 10, marginTop: 6 }}>
      <div><strong>Status:</strong> Approved ✓</div>
      <div><strong>Ticket ID:</strong> <code>{order.ticketId}</code></div>
      {order.ticketQrBase64 && (
        <img src={`data:${order.ticketQrContentType || 'image/png'};base64,${order.ticketQrBase64}`}
          alt="QR" style={{ width: 160, height: 160, marginTop: 4 }} />
      )}
    </div>
  );

  return <div>Status: {ps}</div>;
};

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState(null);
  const [error, setError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [registrationObj, setRegistrationObj] = useState(null);
  const [participantProfile, setParticipantProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'forum'

  // If navigated here with a #msg-<id> hash (from notification), open forum tab and highlight
  useEffect(() => {
    if (location.hash && location.hash.startsWith('#msg-')) {
      setActiveTab('forum');
    }
  }, [location.hash]);

  useEffect(() => {
    let mounted = true;
    const fetchEvent = async () => {
      setLoading(true);
      try {
        const res = await eventAPI.getEvent(id);
        if (!mounted) return;
        if (res && res.data && res.data.success) {
          setEventData(res.data.data);
          // if participant is logged in, try to fetch their profile to check IIIT status
          try {
            const email = localStorage.getItem('participantEmail');
            if (email) {
              const pRes = await participantAPI.getParticipant(email);
              if (pRes && pRes.data && pRes.data.data) setParticipantProfile(pRes.data.data);
            }
          } catch (e) {
            // ignore profile fetch errors
          }
          // check whether current participant is registered
          try {
            const r = await eventAPI.getRegistration(id);
            if (r && r.data && r.data.success && r.data.data) {
              if (r.data.data.registered) {
                const regObj = r.data.data.registration || null;
                setRegistrationObj(regObj);
                if (regObj && (regObj.status || '').toLowerCase() === 'cancelled') {
                  setRegistered(false);
                } else {
                  setRegistered(true);
                }
              } else {
                setRegistered(false);
                setRegistrationObj(null);
              }
            }
          } catch (e) {
            // ignore — participant may be unauthenticated
          }
        } else {
          setError((res && res.data && res.data.error) || 'Failed to load event');
        }
      } catch (err) {
        setError(err.message || 'Failed to load event');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchEvent();
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <div style={{ padding: 12 }}>Loading event...</div>;
  if (error) return <div style={{ padding: 12, color: 'red' }}>{error}</div>;
  if (!eventData) return <div style={{ padding: 12 }}>No event data.</div>;

  const { event, registrationCount } = eventData;

  const isParticipantIIIT = !!participantProfile?.iiit_participant;

  // Helpers for blocking rules
  const now = new Date();
  const deadlinePassed = event.registration_deadline ? new Date(event.registration_deadline) < now : false;
  const limitReached = typeof event.registration_limit === 'number' && event.registration_limit > 0 && (registrationCount >= event.registration_limit);

  let canRegister = false;
  let registerBlockedReason = null;

  const eventType = (event.type || '').toLowerCase();

  if (eventType === 'normal') {
    if (deadlinePassed) {
      registerBlockedReason = 'Registration deadline has passed';
    } else if (limitReached) {
      registerBlockedReason = 'Registration limit has been reached';
    } else if (event.non_iiit_eligibility === false && !isParticipantIIIT) {
      registerBlockedReason = 'This event is for IIIT participants only';
    } else if (event.status !== 'published' && event.status !== 'ongoing') {
      registerBlockedReason = 'Event is not open for registration';
    } else {
      canRegister = true;
    }
  }

  // For merchandise: allow purchase if at least one item has stock > 0
  let canPurchase = false;
  let purchaseBlockedReason = null;
  if (eventType === 'merchandise') {
    // If overall registration limit is reached, block purchases as well
    if (limitReached) {
      purchaseBlockedReason = 'Registration limit has been reached';
    } else if (event.non_iiit_eligibility === false && !isParticipantIIIT) {
      purchaseBlockedReason = 'This event is for IIIT participants only';
    } else {
      const anyInStock = Array.isArray(event.merchandise) && event.merchandise.some(it => typeof it.stockQuantity === 'number' && it.stockQuantity > 0);
      if (!anyInStock) purchaseBlockedReason = 'All items are out of stock';
      else if (event.status !== 'published' && event.status !== 'ongoing') purchaseBlockedReason = 'Merchandise sales are not open';
      else canPurchase = anyInStock && !deadlinePassed; // use deadline to gate sales too
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>← Back</button>

      <h2>{event.name}</h2>
      <div style={{ marginBottom: 10, color: '#555' }}>{event.description}</div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div><strong>Type:</strong> {event.type}</div>
        <div><strong>Status:</strong> {event.status}</div>
        <div><strong>Organizer:</strong> {event.organizer_name || event.organizer_id}</div>
        {/* Primary action button: Register or Purchase based on type (case-insensitive) */}

        <div style={{ marginLeft: 'auto' }}>
          {/* If participant already registered, show Cancel button */}
          {registered ? (
            <button
              onClick={async () => {
                if (!window.confirm('Are you sure you want to cancel your registration?')) return;
                try {
                  const resp = await eventAPI.cancelRegistration(event._id);
                  if (resp && resp.data && resp.data.success) {
                    alert('Registration cancelled');
                    setRegistered(false);
                    // keep the registration object updated (status = CANCELLED)
                    setRegistrationObj(resp.data.data && resp.data.data.registration ? resp.data.data.registration : null);
                    // decrement local registration count if present
                    setEventData(prev => prev ? { ...prev, registrationCount: Math.max(0, (prev.registrationCount || 1) - 1) } : prev);
                  } else {
                    alert('Cancel failed: ' + (resp.data && resp.data.error));
                  }
                } catch (err) {
                  alert('Cancel error: ' + (err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message));
                }
              }}
              style={{ padding: '10px 14px', backgroundColor: '#c00', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Cancel
            </button>
          ) : (
            <>
              {eventType === 'normal' && (
                canRegister ? (
                  <button
                    onClick={async () => {
                      try {
                        // call register API
                        const resp = await eventAPI.register(event._id);
                        if (resp && resp.data && resp.data.success) {
                          alert('Registration successful! Ticket ID: ' + (resp.data.data && resp.data.data.ticketId));
                          // if backend returned a registration object, use it; otherwise mark registered
                          const regObj = resp.data.data && resp.data.data.registration ? resp.data.data.registration : null;
                          if (regObj && (regObj.status || '').toLowerCase() === 'cancelled') {
                            // odd case: backend created/returned a cancelled registration — treat as not registered
                            setRegistered(false);
                            setRegistrationObj(regObj);
                          } else {
                            setRegistered(true);
                            setRegistrationObj(regObj);
                          }
                          setEventData(prev => prev ? { ...prev, registrationCount: (prev.registrationCount || 0) + 1 } : prev);
                        } else {
                          alert('Registration failed: ' + (resp.data && resp.data.error));
                        }
                      } catch (err) {
                        alert('Registration error: ' + (err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message));
                      }
                    }}
                    style={{ padding: '10px 14px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    Register
                  </button>
                ) : (
                  <button
                    disabled
                    title={registerBlockedReason || 'Registration not available'}
                    style={{ padding: '10px 14px', backgroundColor: '#ddd', color: '#666', border: 'none', borderRadius: 4 }}
                  >
                    {registerBlockedReason || 'Registration not available'}
                  </button>
                )
              )}

              {eventType === 'merchandise' && (
                <MerchandiseOrderSection
                  eventId={event._id}
                  canPurchase={canPurchase}
                  purchaseBlockedReason={purchaseBlockedReason}
                  onOrderCreated={() =>
                    setEventData(prev => prev ? { ...prev, registrationCount: (prev.registrationCount || 0) + 1 } : prev)
                  }
                />
              )}
            </>
          )}

          {/* Fallback: if event type isn't recognized, show a subtle hint */}
          {eventType !== 'normal' && eventType !== 'merchandise' && (
            <div style={{ color: '#666', fontSize: 13 }}>No direct action available for this event type.</div>
          )}
        </div>
      </div>

      {/* Tabs: Details / Forum */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e0e0e0', marginBottom: 16 }}>
        {['details', 'forum'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === tab ? 700 : 400,
              borderBottom: activeTab === tab ? '2px solid #5865f2' : '2px solid transparent',
              color: activeTab === tab ? '#5865f2' : '#555',
              marginBottom: -2, fontSize: 14, textTransform: 'capitalize',
            }}>
            {tab === 'forum' ? '💬 Forum' : '📋 Details'}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {activeTab === 'details' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12 }}>
            <div>
              <section style={{ marginBottom: 12 }}>
                <h4>Details</h4>
                <div><strong>Start:</strong> {event.event_start_date ? new Date(event.event_start_date).toLocaleString() : '—'}</div>
                <div><strong>End:</strong> {event.event_end_date ? new Date(event.event_end_date).toLocaleString() : '—'}</div>
                <div><strong>Registration deadline:</strong> {event.registration_deadline ? new Date(event.registration_deadline).toLocaleString() : '—'}</div>
                <div><strong>Registration limit:</strong> {event.registration_limit || 'No limit'}</div>
                <div><strong>Registered:</strong> {registrationCount}</div>
                <div><strong>Fee:</strong> {event.registration_fee || 0}</div>
              </section>

              {event.type === 'normal' && (
                <section>
                  <h4>Registration</h4>
                  <div style={{ fontSize: 13, color: '#666' }}>Note: registration is subject to availability and deadlines.</div>
                </section>
              )}

              {event.type === 'merchandise' && (
                <section>
                  <h4>Merchandise</h4>
                  {Array.isArray(event.merchandise) && event.merchandise.length > 0 ? (
                    <div>
                      {event.merchandise.map((it, idx) => (
                        <div key={idx} style={{ border: '1px solid #eee', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                          <div style={{ fontWeight: 600 }}>{it.itemName}</div>
                          <div style={{ fontSize: 13, color: '#555' }}>Sizes: {Array.isArray(it.sizes) ? it.sizes.join(', ') : '—'}</div>
                          <div style={{ fontSize: 13, color: '#555' }}>Colors: {Array.isArray(it.colors) ? it.colors.join(', ') : '—'}</div>
                          <div style={{ fontSize: 13, color: '#555' }}>Variants: {Array.isArray(it.variants) ? it.variants.join(', ') : '—'}</div>
                          <div style={{ fontSize: 13, color: it.stockQuantity > 0 ? '#111' : '#c00' }}>In stock: {it.stockQuantity}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#666' }}>No merchandise listed for this event.</div>
                  )}
                </section>
              )}
            </div>

            <aside style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
              <h4>Quick Info</h4>
              <div><strong>Tags:</strong> {Array.isArray(event.event_tags) ? event.event_tags.join(', ') : '—'}</div>
              <div style={{ marginTop: 8 }}><strong>Eligibility:</strong> {event.non_iiit_eligibility ? 'IIIT + Non-IIIT' : 'IIIT only'}</div>
            </aside>
          </div>

          {/* Anonymous feedback widget — visible after event ends for registered participants */}
          <FeedbackWidget eventId={event._id} event={event} registered={registered} />
        </>
      )}

      {/* Forum tab */}
      {activeTab === 'forum' && (
        <div style={{ height: 560, display: 'flex', flexDirection: 'column', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
          {registered || participantProfile === null ? (
            <Forum
              eventId={event._id}
              isOrganizer={false}
              myId={participantProfile?._id}
              myName={participantProfile ? `${participantProfile.first_name} ${participantProfile.last_name}` : 'Participant'}
            />
          ) : (
            <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>
              You must be registered for this event to access the forum.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EventDetail;
