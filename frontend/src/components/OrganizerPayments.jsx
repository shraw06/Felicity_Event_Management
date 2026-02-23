import React, { useEffect, useState, useCallback } from 'react';
import { eventAPI } from '../services/api';

const BACKEND = 'http://localhost:5000';

const OrganizerPayments = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [proofUrl, setProofUrl] = useState(null);
  const [actionOrder, setActionOrder] = useState(null); // { order, type:'approve'|'reject' }
  const [actionItem, setActionItem] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await eventAPI.getOrganizerPayments(filter || undefined);
      if (r?.data?.success) setOrders(r.data.data || []);
      else setError(r.data?.error || 'Failed');
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const openAction = (order, type) => {
    setActionOrder({ order, type });
    setActionErr('');
    setActionReason('');
    const items = order.eventId?.merchandise || [];
    setActionItem(items[0]?._id || '');
  };

  const submitAction = async () => {
    if (!actionOrder) return;
    const { order, type } = actionOrder;
    setActionBusy(true); setActionErr('');
    try {
      const body = type === 'approve'
        ? { status: 'successful', itemId: actionItem, quantity: 1 }
        : { status: 'rejected', reason: actionReason };
      if (type === 'approve' && !actionItem) { setActionErr('Select an item'); setActionBusy(false); return; }
      if (type === 'reject' && !actionReason.trim()) { setActionErr('Reason required'); setActionBusy(false); return; }
      const r = await eventAPI.updateOrderStatus(order._id, body);
      if (r?.data?.success) { setActionOrder(null); fetch_(); }
      else setActionErr(r.data?.error || 'Failed');
    } catch (e) { setActionErr(e.response?.data?.error || e.message); }
    finally { setActionBusy(false); }
  };

  const labels = { awaiting_payment: 'Awaiting Payment', pending_approval: 'Pending Approval', rejected: 'Rejected', successful: 'Approved' };

  return (
    <div>
      <h3>Merchandise Payments</h3>

      {/* filter */}
      <div style={{ marginBottom: 10 }}>
        <label>Filter: </label>
        {['', 'awaiting_payment', 'pending_approval', 'rejected', 'successful'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ marginRight: 4, fontWeight: filter === s ? 700 : 400, textDecoration: filter === s ? 'underline' : 'none' }}>
            {s === '' ? 'All' : labels[s]}
          </button>
        ))}
        <button onClick={fetch_} style={{ marginLeft: 8 }}>Refresh</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#c00' }}>{error}</div>}

      {!loading && !error && orders.length === 0 && <div>No orders found.</div>}

      {!loading && orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>{['Event','Participant','Date','Proof','Status','Actions'].map(h =>
              <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px 8px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const ps = o.payment_status;
              const proof = o.paymentProofUrl ? `${BACKEND}/${o.paymentProofUrl}` : null;
              return (
                <tr key={o._id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>{o.eventId?.name || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{o.participantId?.first_name} {o.participantId?.last_name}<br/><small>{o.participantId?.email}</small></td>
                  <td style={{ padding: '6px 8px' }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {proof ? <button onClick={() => setProofUrl(proof)}>View</button> : <span style={{ color: '#999' }}>—</span>}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{labels[ps] || ps}
                    {ps === 'rejected' && o.rejectionReason && <div style={{ fontSize: 11, color: '#c00' }}>{o.rejectionReason}</div>}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {ps === 'pending_approval' && <>
                      <button onClick={() => openAction(o, 'approve')}>Approve</button>{' '}
                      <button onClick={() => openAction(o, 'reject')}>Reject</button>
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* proof modal */}
      {proofUrl && (
        <div onClick={() => setProofUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: 8, borderRadius: 4 }}>
            <img src={proofUrl} alt="proof" style={{ maxWidth: '80vw', maxHeight: '80vh' }} />
            <div style={{ textAlign: 'center', marginTop: 6 }}><button onClick={() => setProofUrl(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* approve / reject modal */}
      {actionOrder && (
        <div onClick={() => setActionOrder(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: 16, borderRadius: 4, minWidth: 280 }}>
            <h4 style={{ marginTop: 0 }}>{actionOrder.type === 'approve' ? 'Approve Order' : 'Reject Order'}</h4>
            <div style={{ marginBottom: 8 }}>Participant: {actionOrder.order.participantId?.email}</div>
            {actionOrder.type === 'approve' && (() => {
              const items = actionOrder.order.eventId?.merchandise || [];
              return (
                <div style={{ marginBottom: 8 }}>
                  <label>Merchandise item: </label>
                  <select value={actionItem} onChange={e => setActionItem(e.target.value)}>
                    {items.map(it => <option key={it._id} value={it._id}>{it.itemName} (stock: {it.stockQuantity})</option>)}
                  </select>
                </div>
              );
            })()}
            {actionOrder.type === 'reject' && (
              <div style={{ marginBottom: 8 }}>
                <label>Reason: </label><br/>
                <textarea rows={2} value={actionReason} onChange={e => setActionReason(e.target.value)} style={{ width: '100%' }} />
              </div>
            )}
            {actionErr && <div style={{ color: '#c00', marginBottom: 6 }}>{actionErr}</div>}
            <button onClick={submitAction} disabled={actionBusy}>{actionBusy ? 'Processing…' : (actionOrder.type === 'approve' ? 'Approve' : 'Reject')}</button>
            {' '}<button onClick={() => setActionOrder(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizerPayments;
