import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { participantAPI } from '../services/api';

const tabs = [
  { label: 'Dashboard', to: '/participant/dashboard' },
  { label: 'Browse Events', to: '/participant/browse-events' },
  { label: 'Clubs/Organizers', to: '/participant/clubs-organizers' },
  { label: 'Profile', to: '/participant/profile' },
  { label: 'Logout', to: '/participant/logout' },
];

const navStyle = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid #e6e6e6',
  background: '#fff'
};

const linkStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  textDecoration: 'none',
  color: '#333'
};

const activeStyle = {
  background: '#007bff',
  color: '#fff'
};

export default function ParticipantDashboard() {
  const [participantId, setParticipantId] = useState(null);

  useEffect(() => {
    const email = localStorage.getItem('participantEmail');
    if (!email) return;
    participantAPI.getParticipant(email)
      .then(res => setParticipantId(res.data?.data?._id || null))
      .catch(() => {});
  }, []);

  return (
    <div className="participant-dashboard container">
      <nav style={{ ...navStyle, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        {participantId && <NotificationBell myId={participantId} />}
      </nav>

      <div style={{ padding: 16 }}>
        <Outlet />
      </div>
    </div>
  );
}

