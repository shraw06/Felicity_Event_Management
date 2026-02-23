import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { label: 'Dashboard', to: '/organizer/dashboard' },
  { label: 'Create Events', to: '/organizer/create-events' },
  { label: 'Ongoing Events', to: '/organizer/ongoing-events' },
  { label: 'Payments', to: '/organizer/payments' },
  { label: 'Profile', to: '/organizer/profile' },
  { label: 'Logout', to: '/organizer/logout' },
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

export default function OrganizerDashboard() {
  return (
    <div className="organizer-dashboard container">
      <nav style={navStyle}>
        {tabs.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: 16 }}>
        <Outlet />
      </div>
    </div>
  );
}

