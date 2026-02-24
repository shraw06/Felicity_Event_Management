import React, { useEffect, useState } from 'react';
import { participantAPI, organizerAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const AREAS = [
  'Arts & Performance',
  'Technology & Innovation',
  'Gaming & Esports',
  'Knowledge & Speaking',
  'Creative & Design',
  'Sports & Fitness',
  'Career & Workshops',
  'Social & Fun Events'
];

const Preferences = () => {
  const navigate = useNavigate();
  const [areas, setAreas] = useState([]);
  const [organizers, setOrganizers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('preferences') || 'null');
      if (saved) {
        setAreas(saved.areas || []);
        setFollowing((saved.following || []).map(String));
      }
    } catch (e) {
      // ignore
    }

    // fetch organizers from backend to show as followable options
    const fetchOrgs = async () => {
      try {
        const res = await organizerAPI.getOrganizers();
        const list = (res && res.data && res.data.data) || [];
        setOrganizers(list);
      } catch (err) {
        console.error('Failed to load organizers', err);
      }
    };
    fetchOrgs();
  }, []);

  const toggleArea = (area) => {
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const toggleFollowOrganizer = async (orgId) => {
    const email = localStorage.getItem('participantEmail');

    const next = following.includes(orgId) ? following.filter(x => x !== orgId) : [...following, orgId];
    setFollowing(next);
    try {
      const prefs = { areas, following: next };
      localStorage.setItem('preferences', JSON.stringify(prefs));

      if (email) {
        await participantAPI.updateParticipant(email, { preferences: prefs });
        setMessage('Preferences updated.');
      } else {
        setMessage('Preferences saved locally.');
      }
    } catch (err) {
      setFollowing(prev => prev.includes(orgId) ? prev.filter(x => x !== orgId) : [...prev, orgId]);
      setMessage('Failed to update preferences on server. Reverted.');
      console.error('Failed to update follow state', err);
    }
  };

  const handleSave = async () => {
    const prefs = { areas, following };
    localStorage.setItem('preferences', JSON.stringify(prefs));
    setMessage('Preferences saved locally.');

    const email = localStorage.getItem('participantEmail');
    try {
      if (email) {
        await participantAPI.updateParticipant(email, { preferences: prefs });
        setMessage('Preferences saved to server.');
      }
    } catch (err) {
      setMessage('Saved locally; failed to save to server.');
      console.error('Failed to save prefs to server', err);
    }
    navigate('/participant/dashboard');

  };

  return (
    <div className="preferences-page container">
      <h2>Your Preferences</h2>

      <section>
        <h3>Areas of Interest</h3>
        <div className="areas-grid">
          {AREAS.map(area => (
            <label key={area} className="area-chip">
              <input type="checkbox" checked={areas.includes(area)} onChange={() => toggleArea(area)} />
              {area}
            </label>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h3>Organizers to follow</h3>
        <div className="organizers-list">
          {organizers.length === 0 && <div>No organizers found.</div>}
          {organizers.map(org => {
            const id = String(org._id);
            const isFollowing = following.includes(id);
            return (
              <div key={id} className="organizer-item" style={{border: '1px solid #ddd', padding: 8, marginBottom: 8}}>
                <div style={{fontWeight: 600}}>{org.first_name} {org.last_name} {isFollowing ? '(Following)' : ''}</div>
                <div style={{fontSize: 12, color: '#555'}}>{org.category} — {org.description}</div>
                <div style={{marginTop: 6}}>
                  <button className="btn-submit" onClick={() => toggleFollowOrganizer(id)}>
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div style={{ marginTop: 20 }}>
        <button className="btn-submit" onClick={handleSave}>Save Preferences</button>
        {message && <div style={{ marginTop: 10 }}>{message}</div>}
      </div>
    </div>
  );
};

export default Preferences;
