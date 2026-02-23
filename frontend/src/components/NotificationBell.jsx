import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { forumAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const SOCKET_URL = 'http://localhost:5000';

/**
 * Notification bell for participants.
 * Shows unread count, dropdown with notifications, navigates to event forum on click.
 * Props:
 *  myId   – participant ObjectId string (to join personal socket room)
 */
export default function NotificationBell({ myId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const socketRef = useRef(null);
  const dropRef = useRef(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const unread = notifications.filter((n) => !n.read).length;

  // Load notifications on mount
  useEffect(() => {
    if (!myId) return;
    forumAPI.getNotifications()
      .then((res) => setNotifications(res.data.data || []))
      .catch(() => {});
  }, [myId]);

  // Socket: listen for new notifications pushed from server
  useEffect(() => {
    if (!myId || !token) return;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('new-notification', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    });
    return () => socket.disconnect();
  }, [myId, token]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (notif) => {
    if (!notif.read) {
      await forumAPI.markRead(notif._id).catch(() => {});
      setNotifications((prev) => prev.map((n) => n._id === notif._id ? { ...n, read: true } : n));
    }
    setOpen(false);
    // Navigate to event detail with a hash indicating the message
    navigate(`/events/${notif.eventId}#msg-${notif.messageId}`);
  };

  const markAllRead = async () => {
    await forumAPI.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div ref={dropRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, position: 'relative', padding: '2px 6px',
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#e53935', color: '#fff',
            fontSize: 10, fontWeight: 700, borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 200,
          background: '#fff', border: '1px solid #ddd', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 320, maxHeight: 400,
          overflowY: 'auto',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: '#5865f2', background: 'none', border: 'none', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && (
            <div style={{ padding: 16, color: '#999', fontSize: 13, textAlign: 'center' }}>No notifications yet</div>
          )}
          {notifications.map((n) => (
            <div key={n._id} onClick={() => markRead(n)}
              style={{
                padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                background: n.read ? '#fff' : '#f0f4ff',
              }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 700 }}>
                📢 Organizer announcement
              </div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                {n.previewText || 'New announcement in your event'}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
