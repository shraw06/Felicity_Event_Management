import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { forumAPI } from '../services/api';

const SOCKET_URL = 'http://localhost:5000';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];

// ── tiny helpers ─────────────────────────────────────────────────────────────

function timeStr(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateSep(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// Group reactions: { emoji → count, myReacted }
function groupReactions(reactions, myId) {
  const map = {};
  reactions.forEach(({ emoji, userId }) => {
    if (!map[emoji]) map[emoji] = { count: 0, mine: false };
    map[emoji].count += 1;
    if (String(userId) === String(myId)) map[emoji].mine = true;
  });
  return map;
}

// ── sub-components ────────────────────────────────────────────────────────────

function EmojiPicker({ onPick, onClose }) {
  return (
    <div style={{
      position: 'absolute', bottom: 28, left: 0, zIndex: 100,
      background: '#fff', border: '1px solid #ddd', borderRadius: 8,
      padding: 6, display: 'flex', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      {EMOJI_LIST.map((e) => (
        <button key={e} onClick={() => { onPick(e); onClose(); }}
          style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
          {e}
        </button>
      ))}
    </div>
  );
}

function ReactionBar({ reactions, myId, onReact }) {
  const grouped = groupReactions(reactions, myId);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {Object.entries(grouped).map(([emoji, { count, mine }]) => (
        <button key={emoji} onClick={() => onReact(emoji)}
          style={{
            fontSize: 13, padding: '1px 7px', borderRadius: 12, cursor: 'pointer',
            border: mine ? '1.5px solid #5865f2' : '1px solid #ddd',
            background: mine ? '#ebedff' : '#f8f8f8',
          }}>
          {emoji} {count}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  msg, myId, isOrganizer, onReply, onDelete, onPin, onReact, highlightId,
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const deleted = !!msg.deletedAt;
  const isMe = String(msg.senderId) === String(myId);
  const highlighted = String(msg._id) === String(highlightId);

  return (
    <div
      id={`msg-${msg._id}`}
      style={{
        marginBottom: 4,
        padding: '6px 10px',
        borderRadius: 6,
        background: highlighted ? '#fff9c4' : msg.isPinned ? '#f0fff0' : msg.isAnnouncement ? '#fff3e0' : '#fafafa',
        border: msg.isPinned ? '1px solid #c3e6cb' : '1px solid transparent',
        transition: 'background 0.4s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: msg.senderRole === 'organizer' ? '#5865f2' : '#333' }}>
          {msg.senderName}
          {msg.senderRole === 'organizer' && (
            <span style={{ fontSize: 10, background: '#5865f2', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 5 }}>
              Organizer
            </span>
          )}
          {msg.isAnnouncement && (
            <span style={{ fontSize: 10, background: '#ff9800', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
              📢 Announcement
            </span>
          )}
          {msg.isPinned && (
            <span style={{ fontSize: 10, background: '#43a047', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
              📌 Pinned
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: '#999' }}>{timeStr(msg.createdAt)}</span>
      </div>

      {/* Content */}
      <div style={{ fontSize: 14, color: deleted ? '#999' : '#222', fontStyle: deleted ? 'italic' : 'normal', marginLeft: 2 }}>
        {msg.content}
      </div>

      {/* Reactions */}
      {!deleted && (
        <ReactionBar reactions={msg.reactions || []} myId={myId} onReact={(emoji) => onReact(msg._id, emoji)} />
      )}

      {/* Action bar */}
      {!deleted && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, position: 'relative' }}>
          <button onClick={() => onReply(msg)} style={btnStyle}>↩ Reply</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowEmoji((v) => !v)} style={btnStyle}>😊</button>
            {showEmoji && <EmojiPicker onPick={(e) => onReact(msg._id, e)} onClose={() => setShowEmoji(false)} />}
          </div>
          {isOrganizer && (
            <>
              <button onClick={() => onPin(msg._id, !msg.isPinned)} style={btnStyle}>
                {msg.isPinned ? '📌 Unpin' : '📌 Pin'}
              </button>
              <button onClick={() => onDelete(msg._id)} style={{ ...btnStyle, color: '#e53935' }}>🗑 Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', color: '#555',
};

// ── Main Forum component ───────────────────────────────────────────────────────

/**
 * Props:
 *  eventId        – MongoDB ObjectId string of the event
 *  isOrganizer    – boolean: true if the viewer is the event organizer
 *  myId           – the viewer's MongoDB ObjectId string
 *  myName         – the viewer's display name
 */
export default function Forum({ eventId, isOrganizer, myId, myName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [connected, setConnected] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const token = localStorage.getItem('token');

  // ── Load history ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    forumAPI.getMessages(eventId)
      .then((res) => setMessages(res.data.data || []))
      .catch(() => {}); // silently fail if not registered
  }, [eventId]);

  // ── Socket connection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId || !token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-event-room', eventId);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('new-message', (msg) => {
      setMessages((prev) => {
        if (prev.find((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    });

    socket.on('message-deleted', (payload) => {
      // payload may be { messageId } (legacy) or { messageIds: [...] }
      const ids = payload?.messageIds || (payload?.messageId ? [payload.messageId] : []);
      if (!ids || ids.length === 0) return;
      setMessages((prev) =>
        prev.map((m) => (ids.includes(m._id) ? { ...m, deletedAt: new Date().toISOString(), content: '[This message was deleted]', reactions: [] } : m))
      );
    });

    socket.on('message-pinned', ({ messageId, isPinned }) => {
      setMessages((prev) =>
        prev.map((m) => m._id === messageId ? { ...m, isPinned } : m)
      );
    });

    socket.on('reaction-updated', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => m._id === messageId ? { ...m, reactions } : m)
      );
    });

    return () => {
      socket.emit('leave-event-room', eventId);
      socket.disconnect();
    };
  }, [eventId, token]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const sendMessage = () => {
    const content = input.trim();
    if (!content || !socketRef.current) return;
    socketRef.current.emit('send-message', {
      eventId,
      content,
      parentMessageId: replyTo?._id || null,
      isAnnouncement: isOrganizer && asAnnouncement,
    });
    setInput('');
    setReplyTo(null);
    setAsAnnouncement(false);
  };

  const handleDelete = (messageId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('delete-message', { eventId, messageId });
  };

  const handlePin = (messageId, pin) => {
    if (!socketRef.current) return;
    socketRef.current.emit('pin-message', { eventId, messageId, pin });
  };

  const handleReact = (messageId, emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit('react-message', { eventId, messageId, emoji });
  };

  const scrollToMessage = useCallback((msgId) => {
    setHighlightId(msgId);
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightId(null), 2500);
  }, []);

  // ── Separate pinned messages ─────────────────────────────────────────────────
  const pinned = messages.filter((m) => m.isPinned && !m.deletedAt);
  const topLevelMsgs = messages.filter((m) => !m.parentMessageId);
  const repliesFor = (parentId) => messages.filter((m) => String(m.parentMessageId) === String(parentId));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'inherit' }}>
      {/* Pinned messages */}
      {pinned.length > 0 && (
        <div style={{ borderBottom: '1px solid #e0e0e0', padding: '8px 12px', background: '#f0fff0' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#43a047', marginBottom: 4 }}>📌 Pinned Messages</div>
          {pinned.map((m) => (
            <div key={m._id} onClick={() => scrollToMessage(m._id)}
              style={{ fontSize: 13, padding: '3px 6px', cursor: 'pointer', color: '#333',
                borderLeft: '3px solid #43a047', paddingLeft: 8, marginBottom: 3 }}>
              <strong>{m.senderName}:</strong> {m.content.slice(0, 100)}{m.content.length > 100 ? '…' : ''}
            </div>
          ))}
        </div>
      )}

      {/* Message feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {messages.length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
            No messages yet. Start the conversation!
          </div>
        )}

        {(() => {
          // Render top-level messages with their replies inline
          let lastDate = '';
          return topLevelMsgs.map((msg) => {
            const dateLabel = dateSep(msg.createdAt);
            const showDate = dateLabel !== lastDate;
            lastDate = dateLabel;
            const replies = repliesFor(msg._id);
            return (
              <React.Fragment key={msg._id}>
                {showDate && (
                  <div style={{ textAlign: 'center', margin: '10px 0', fontSize: 11, color: '#aaa' }}>
                    <span style={{ background: '#f0f0f0', padding: '2px 10px', borderRadius: 10 }}>{dateLabel}</span>
                  </div>
                )}
                <MessageBubble
                  msg={msg} myId={myId} isOrganizer={isOrganizer}
                  onReply={setReplyTo} onDelete={handleDelete}
                  onPin={handlePin} onReact={handleReact} highlightId={highlightId}
                />
                {/* Threaded replies */}
                {replies.length > 0 && (
                  <div style={{ marginLeft: 24, borderLeft: '2px solid #e0e0e0', paddingLeft: 8, marginBottom: 4 }}>
                    {replies.map((r) => (
                      <MessageBubble key={r._id}
                        msg={r} myId={myId} isOrganizer={isOrganizer}
                        onReply={setReplyTo} onDelete={handleDelete}
                        onPin={handlePin} onReact={handleReact} highlightId={highlightId}
                      />
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          });
        })()}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div style={{ padding: '4px 12px', background: '#eef', fontSize: 12,
          borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>↩ Replying to <strong>{replyTo.senderName}</strong>: {replyTo.content.slice(0, 60)}</span>
          <button onClick={() => setReplyTo(null)} style={{ ...btnStyle, fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0', background: '#fff' }}>
        {isOrganizer && (
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={asAnnouncement} onChange={(e) => setAsAnnouncement(e.target.checked)} />
              📢 Post as announcement (notifies all registered participants)
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={connected ? 'Type a message… (Enter to send, Shift+Enter for newline)' : 'Connecting…'}
            rows={2}
            disabled={!connected}
            style={{ flex: 1, resize: 'none', borderRadius: 6, border: '1px solid #ddd', padding: '6px 10px', fontSize: 14 }}
          />
          <button onClick={sendMessage} disabled={!connected || !input.trim()}
            style={{ padding: '0 16px', borderRadius: 6, border: 'none', background: '#5865f2', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            Send
          </button>
        </div>
        <div style={{ fontSize: 11, color: connected ? '#43a047' : '#e53935', marginTop: 4 }}>
          {connected ? '● Connected' : '● Reconnecting…'}
        </div>
      </div>
    </div>
  );
}
