import React, { useEffect, useState } from 'react';
import { organizerAPI, participantAPI } from '../services/api';

// ParticipantViewofOrganizers: lists approved organizers and allows follow/unfollow
export default function ParticipantViewofOrganizers() {
  const [organizers, setOrganizers] = useState([]);
  const [following, setFollowing] = useState([]); // array of organizer ids (strings)
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [orgRes] = await Promise.all([
          organizerAPI.getOrganizers(),
        ]);
        const orgs = (orgRes && orgRes.data && orgRes.data.data) ? orgRes.data.data : [];
        setOrganizers(orgs);

        const email = localStorage.getItem('participantEmail');
        if (email) {
          const pRes = await participantAPI.getParticipant(email);
          const participant = pRes && pRes.data && pRes.data.data ? pRes.data.data : null;
          const prefFollowing = (participant && participant.preferences && participant.preferences.following) || [];
          // normalize to strings of ObjectId
          setFollowing(prefFollowing.map(String));
        }
      } catch (err) {
        console.error('Failed to load organizers or participant', err);
        setMessage('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const toggleFollow = async (orgId) => {
    setMessage(null);
    const email = localStorage.getItem('participantEmail');
    if (!email) {
      setMessage('Please log in to follow organizers');
      return;
    }

    // optimistic update
    const isFollowing = following.includes(orgId);
    const next = isFollowing ? following.filter(x => x !== orgId) : [...following, orgId];
    setFollowing(next);

    // persist: fetch current participant to avoid overwriting areas
    try {
      setSavingId(orgId);
      const pRes = await participantAPI.getParticipant(email);
      const participant = pRes && pRes.data && pRes.data.data ? pRes.data.data : null;
      const existingAreas = (participant && participant.preferences && participant.preferences.areas) || [];

      const prefs = { areas: existingAreas, following: next };
      await participantAPI.updateParticipant(email, { preferences: prefs });
      setMessage(isFollowing ? 'Unfollowed' : 'Following');
    } catch (err) {
      console.error('Failed to update follow state', err);
      // revert optimistic
      setFollowing(prev => (prev.includes(orgId) ? prev.filter(x => x !== orgId) : [...prev, orgId]));
      setMessage('Failed to update follow state');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div>Loading organizers...</div>;

  return (
    <div className="participant-organizers container">
      <h3>Clubs & Organizers</h3>
      {message && <div style={{ marginBottom: 8 }}>{message}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {organizers.length === 0 && <div>No organizers found.</div>}
        {organizers.map(org => {
          const id = String(org._id || org.email || org.id);
          const isFollowing = following.includes(id);
          return (
            <div key={id} style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{org.first_name} {org.last_name}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>{org.category}</div>
                </div>
                <div>
                  <button
                    className="btn-submit"
                    onClick={() => toggleFollow(id)}
                    disabled={savingId === id}
                  >
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                  <button onClick={() => window.location.href = `/organizers/${org.email}`} style={{ marginTop: 6, padding: '4px 8px', fontSize: 12 }}>View</button>

                </div>
              </div>
              {org.description && <div style={{ marginTop: 8, color: '#444' }}>{org.description}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
