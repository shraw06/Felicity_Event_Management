import React, { useEffect, useState } from 'react';
import { organizerAPI, adminAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboardOverview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [counts, setCounts] = useState({ organizers: 0, pendingResets: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [orgRes, resetRes] = await Promise.all([
          organizerAPI.getOrganizers(),
          adminAPI.getResetRequests('Pending'),
        ]);

        if (cancelled) return;

  const orgs = orgRes?.data?.success ? (orgRes.data.data || []) : [];
  const resets = resetRes?.data?.success ? (resetRes.data.data || []) : [];

  setCounts({ organizers: orgs.length, pendingResets: resets.length });
      } catch (err) {
        console.error('AdminOverview load error', err);
        if (!cancelled) setError('Failed to load overview data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div>Loading admin overview…</div>;
  if (error) return <div style={{ color: '#c00' }}>{error}</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h3 style={{ margin: 0 }}>Admin Overview</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ padding: 16, borderRadius: 8, background: '#fff', border: '1px solid #eee', minWidth: 180 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.organizers}</div>
          <div style={{ color: '#666' }}>Clubs / Organizers</div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => navigate('/admin/manage-organizers')} style={{ padding: '6px 10px' }}>Manage</button>
          </div>
        </div>

        

        <div style={{ padding: 16, borderRadius: 8, background: '#fff', border: '1px solid #eee', minWidth: 220 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.pendingResets}</div>
          <div style={{ color: '#666' }}>Pending Password Reset Requests</div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => navigate('/admin/password-reset-requests')} style={{ padding: '6px 10px' }}>Review Requests</button>
          </div>
        </div>
      </div>

      
    </div>
  );
}
