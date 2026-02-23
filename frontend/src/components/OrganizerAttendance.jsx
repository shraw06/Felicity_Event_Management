import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { eventAPI } from '../services/api';

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function fmtDate(d) { return d ? new Date(d).toLocaleString() : '—'; }

/* ── OrganizerAttendance ─────────────────────────────────────────────────────── */
export default function OrganizerAttendance() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();

  /* data */
  const [event, setEvent] = useState(null);
  const [counts, setCounts] = useState({ total: 0, scanned: 0, remaining: 0 });
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* filters */
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // all | scanned | not_scanned

  /* scanner */
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { type, msg, reg? }
  const scannerRef = useRef(null);
  const readerRef = useRef(null);

  /* manual override */
  const [overrideReg, setOverrideReg] = useState(null); // { _id, action }
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideErr, setOverrideErr] = useState('');

  /* audit detail toggle */
  const [auditOpen, setAuditOpen] = useState(null); // regId

  /* ── fetch attendance data ─────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const r = await eventAPI.getEventAttendance(eventId, { search, filter: filterMode });
      if (r?.data?.success) {
        setEvent(r.data.data.event);
        setCounts(r.data.data.counts);
        setRegs(r.data.data.registrations);
        setError('');
      } else { setError(r.data?.error || 'Failed'); }
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [eventId, search, filterMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── camera scanner ────────────────────────────────────────────────────────── */
  const startScanner = async () => {
    setScanResult(null);
    try {
      const html5Qr = new Html5Qrcode('qr-reader');
      readerRef.current = html5Qr;
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          // pause scanning while processing
          try { await html5Qr.pause(true); } catch {}
          await handleDecodedQr(decoded, 'camera');
          // resume after short delay
          setTimeout(() => { try { html5Qr.resume(); } catch {} }, 1500);
        },
        () => {}, // ignore errors (no qr found in frame)
      );
      setScanning(true);
    } catch (e) {
      setScanResult({ type: 'error', msg: 'Camera error: ' + (e.message || e) });
    }
  };

  const stopScanner = async () => {
    try {
      if (readerRef.current) { await readerRef.current.stop(); readerRef.current = null; }
    } catch {}
    setScanning(false);
  };

  /* handle file upload QR decode */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanResult(null);
    try {
      const html5Qr = new Html5Qrcode('qr-reader-file');
      const decoded = await html5Qr.scanFile(file, true);
      await handleDecodedQr(decoded, 'upload');
      html5Qr.clear();
    } catch (err) {
      setScanResult({ type: 'error', msg: 'Could not decode QR from image' });
    }
    e.target.value = '';
  };

  /* common: extract ticketId from decoded string and call scan API */
  const handleDecodedQr = async (decoded, method) => {
    let ticketId = null;
    try {
      const obj = JSON.parse(decoded);
      ticketId = obj.ticketId || null;
    } catch {
      // maybe it's just the ticketId string
      ticketId = decoded;
    }
    if (!ticketId) { setScanResult({ type: 'error', msg: 'Invalid QR data' }); return; }

    try {
      const r = await eventAPI.scanTicket(eventId, ticketId, method);
      if (r?.data?.success) {
        const result = r.data.result; // 'scanned' | 'duplicate'
        const reg = r.data.registration || {};
        if (result === 'scanned') {
          setScanResult({ type: 'success', msg: `✓ ${reg.participant?.name || ''} checked in`, reg });
        } else if (result === 'duplicate') {
          setScanResult({ type: 'duplicate', msg: `Already scanned — ${reg.participant?.name || ''} at ${fmtDate(reg.firstScanAt)}`, reg });
        } else {
          setScanResult({ type: 'info', msg: r.data.message || result });
        }
        fetchData(); // refresh counts
      } else {
        setScanResult({ type: 'error', msg: r.data?.error || 'Scan failed' });
      }
    } catch (err) {
      setScanResult({ type: 'error', msg: err.response?.data?.error || err.message });
    }
  };

  /* ── manual override ───────────────────────────────────────────────────────── */
  const submitOverride = async () => {
    if (!overrideReg) return;
    if (!overrideReason.trim()) { setOverrideErr('Reason is required'); return; }
    setOverrideBusy(true); setOverrideErr('');
    try {
      const r = await eventAPI.manualAttendance(overrideReg._id, { action: overrideReg.action, reason: overrideReason.trim() });
      if (r?.data?.success) { setOverrideReg(null); setOverrideReason(''); fetchData(); }
      else setOverrideErr(r.data?.error || 'Failed');
    } catch (e) { setOverrideErr(e.response?.data?.error || e.message); }
    finally { setOverrideBusy(false); }
  };

  /* ── CSV export ────────────────────────────────────────────────────────────── */
  const exportCsv = async () => {
    try {
      const r = await eventAPI.exportAttendanceCsv(eventId);
      const blob = new Blob([r.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(event?.name || 'event').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + (e.response?.data?.error || e.message)); }
  };

  /* cleanup scanner on unmount */
  useEffect(() => () => { try { if (readerRef.current) readerRef.current.stop(); } catch {} }, []);

  /* ── render ────────────────────────────────────────────────────────────────── */
  if (loading) return <div style={{ padding: 20 }}>Loading attendance…</div>;
  if (error && !event) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;

  const scanBg = { success: '#d4edda', duplicate: '#fff3cd', error: '#f8d7da', info: '#d1ecf1' };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Attendance — {event?.name || ''}</h2>
        <button onClick={() => navigate(-1)}>← Back</button>
      </div>

      {/* counts */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div><strong>{counts.total}</strong> Total</div>
        <div style={{ color: 'green' }}><strong>{counts.scanned}</strong> Scanned</div>
        <div style={{ color: '#c00' }}><strong>{counts.remaining}</strong> Remaining</div>
      </div>

      {/* two-column: scanner | list */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* ── scanner column ──────────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 320px', maxWidth: 350 }}>
          <h4 style={{ marginTop: 0 }}>QR Scanner</h4>

          {/* camera area */}
          <div id="qr-reader" ref={scannerRef} style={{ width: '100%', marginBottom: 8 }}></div>
          {/* hidden div for file-based scanning */}
          <div id="qr-reader-file" style={{ display: 'none' }}></div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {!scanning
              ? <button onClick={startScanner}>Start Camera</button>
              : <button onClick={stopScanner}>Stop Camera</button>}
          </div>

          <div style={{ marginBottom: 8 }}>
            <label>Or upload QR image: </label>
            <input type="file" accept="image/*" onChange={handleFileUpload} />
          </div>

          {scanResult && (
            <div style={{ padding: 8, marginBottom: 8, borderRadius: 4, background: scanBg[scanResult.type] || '#eee' }}>
              {scanResult.msg}
            </div>
          )}
        </div>

        {/* ── list column ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 400 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <input placeholder="Search name, email, ticket…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <select value={filterMode} onChange={e => setFilterMode(e.target.value)}>
              <option value="all">All</option>
              <option value="scanned">Scanned</option>
              <option value="not_scanned">Not scanned</option>
            </select>
            <button onClick={fetchData}>Refresh</button>
            <button onClick={exportCsv}>Export CSV</button>
          </div>

          {error && <div style={{ color: 'red', marginBottom: 6 }}>{error}</div>}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Name','Email','Ticket','Attended','Scanned At','Method','Actions','Audit'].map(h =>
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px 4px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {regs.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 12, color: '#666' }}>No registrations found.</td></tr>
              )}
              {regs.map(r => (
                <React.Fragment key={r._id}>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 4px' }}>{r.participant?.name || '—'}</td>
                    <td style={{ padding: '6px 4px' }}>{r.participant?.email || '—'}</td>
                    <td style={{ padding: '6px 4px', fontSize: 11 }}>{r.ticketId || '—'}</td>
                    <td style={{ padding: '6px 4px', color: r.attended ? 'green' : '#c00' }}>{r.attended ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '6px 4px' }}>{fmtDate(r.firstScanAt)}</td>
                    <td style={{ padding: '6px 4px' }}>{r.scanMethod || '—'}</td>
                    <td style={{ padding: '6px 4px' }}>
                      {r.attended
                        ? <button onClick={() => { setOverrideReg({ _id: r._id, action: 'unset' }); setOverrideReason(''); setOverrideErr(''); }}>Unmark</button>
                        : <button onClick={() => { setOverrideReg({ _id: r._id, action: 'set' }); setOverrideReason(''); setOverrideErr(''); }}>Mark Present</button>}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <button onClick={() => setAuditOpen(auditOpen === r._id ? null : r._id)}>
                        {auditOpen === r._id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {auditOpen === r._id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '4px 8px', background: '#f9f9f9', fontSize: 12 }}>
                        <div><strong>Scan History</strong></div>
                        {(!r.scanHistory || r.scanHistory.length === 0) ? <div>No scans</div> : (
                          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                            {r.scanHistory.map((s, i) => (
                              <li key={i}>{fmtDate(s.ts)} — {s.method} by {s.name} {s.notes ? `(${s.notes})` : ''}</li>
                            ))}
                          </ul>
                        )}
                        <div style={{ marginTop: 4 }}><strong>Manual Overrides</strong></div>
                        {(!r.manualOverrides || r.manualOverrides.length === 0) ? <div>None</div> : (
                          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                            {r.manualOverrides.map((o, i) => (
                              <li key={i}>{fmtDate(o.ts)} — {o.action} by {o.name}: {o.reason}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* manual override modal */}
      {overrideReg && (
        <div onClick={() => setOverrideReg(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: 16, borderRadius: 4, minWidth: 280 }}>
            <h4 style={{ marginTop: 0 }}>{overrideReg.action === 'set' ? 'Mark Present' : 'Unmark Attendance'}</h4>
            <div style={{ marginBottom: 8 }}>
              <label>Reason (required):</label><br />
              <textarea rows={2} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            {overrideErr && <div style={{ color: '#c00', marginBottom: 6 }}>{overrideErr}</div>}
            <button onClick={submitOverride} disabled={overrideBusy}>{overrideBusy ? 'Saving…' : 'Confirm'}</button>{' '}
            <button onClick={() => setOverrideReg(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
