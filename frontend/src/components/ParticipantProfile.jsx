// Editable Fields: First Name, Last Name, Contact Number, College/Organization Name,
// Selected Interests, Followed Clubs
// • Non-Editable Fields: Email Address, Participant Type (IIIT / Non-IIIT)
// • Security Settings: Provides a password reset or change mechanism with appropriate au-
// thentication and validation, allowing flexibility in implementation design.

import React, { useEffect, useState } from 'react';
import { participantAPI } from '../services/api';

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

const ParticipantProfile = () => {
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);

    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        contact_number: '',
        college_name: '',
        areas: [],
        following: [], // organizer ids
        email: '',
        iiit_participant: false,
    });

    // password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // organizers list removed: follow/unfollow moved out of participant profile

    useEffect(() => {
        const init = async () => {
            const email = localStorage.getItem('participantEmail');
            if (!email) {
                setMessage('No participant email in localStorage. Please login.');
                setLoading(false);
                return;
            }

            try {
                const pRes = await participantAPI.getParticipant(email);
                const participant = pRes.data.data;

                setForm(prev => ({
                    ...prev,
                    first_name: participant.first_name || '',
                    last_name: participant.last_name || '',
                    contact_number: participant.contact_number || '',
                    college_name: participant.college_name || '',
                    areas: (participant.preferences && participant.preferences.areas) || [],
                    email: participant.email || '',
                    iiit_participant: !!participant.iiit_participant,
                }));
            } catch (err) {
                console.error('Failed to load participant profile', err);
                setMessage('Failed to load profile. See console for details.');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const toggleArea = (area) => {
        setForm(prev => ({
            ...prev,
            areas: prev.areas.includes(area) ? prev.areas.filter(a => a !== area) : [...prev.areas, area]
        }));
    };

    // follow/unfollow removed from profile UI

    const handleSaveProfile = async () => {
        setMessage(null);
        const email = form.email;
        const payload = {
            first_name: form.first_name,
            last_name: form.last_name,
            contact_number: form.contact_number,
            college_name: form.college_name,
            preferences: {
                areas: form.areas,
            }
        };

        try {
            await participantAPI.updateParticipant(email, payload);
            setMessage('Profile saved successfully.');
        } catch (err) {
            console.error('Failed to save profile', err);
            setMessage('Failed to save profile.');
        }
    };

    const handleChangePassword = async () => {
        setMessage(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage('Please fill all password fields.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage('New password and confirmation do not match.');
            return;
        }
        setChangingPassword(true);
        try {
            // verify current password by logging in
            const email = form.email;
            await participantAPI.login({ email, password: currentPassword });

            // if login succeeds, update password
            await participantAPI.updateParticipant(email, { password: newPassword });

            setMessage('Password changed successfully.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error('Password change failed', err);
            const msg = err?.response?.data?.error || 'Failed to change password. Current password may be incorrect.';
            setMessage(msg);
        } finally {
            setChangingPassword(false);
        }
    };

    if (loading) return <div>Loading profile...</div>;

    return (
        <div className="participant-profile container" style={{ maxWidth: 800 }}>
            <h2>Participant Profile</h2>

            {message && <div style={{ marginBottom: 12 }}>{message}</div>}

            <div style={{ marginBottom: 16 }}>
                <label><strong>Email (read-only):</strong></label>
                <div>{form.email}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label><strong>Participant Type:</strong></label>
                <div>{form.iiit_participant ? 'IIIT Participant' : 'Non-IIIT Participant'}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label>First Name</label>
                    <input name="first_name" value={form.first_name} onChange={handleChange} />
                </div>
                <div>
                    <label>Last Name</label>
                    <input name="last_name" value={form.last_name} onChange={handleChange} />
                </div>
            </div>

            <div style={{ marginTop: 12 }}>
                <label>Contact Number</label>
                <input name="contact_number" value={form.contact_number} onChange={handleChange} />
            </div>

            <div style={{ marginTop: 12 }}>
                <label>College / Organization</label>
                <input name="college_name" value={form.college_name} onChange={handleChange} />
            </div>

            <section style={{ marginTop: 18 }}>
                <h4>Areas of Interest</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {AREAS.map(area => (
                        <label key={area} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={form.areas.includes(area)} onChange={() => toggleArea(area)} />
                            {area}
                        </label>
                    ))}
                </div>
            </section>

            {/* Follow/unfollow organizers removed from profile page */}

            <div style={{ marginTop: 18 }}>
                <button className="btn-submit" onClick={handleSaveProfile}>Save Profile</button>
            </div>

            <section style={{ marginTop: 28 }}>
                <h4>Change Password</h4>
                <div style={{ maxWidth: 480 }}>
                    <div>
                        <label>Current Password</label>
                        <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    </div>
                    <div>
                        <label>New Password</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                    <div>
                        <label>Confirm New Password</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </div>

                    <div style={{ marginTop: 12 }}>
                        <button className="btn-submit" onClick={handleChangePassword} disabled={changingPassword}>
                            {changingPassword ? 'Changing...' : 'Change Password'}
                        </button>
                    </div>
                </div>
            </section>

        </div>
    );
};

export default ParticipantProfile;