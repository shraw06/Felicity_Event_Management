import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { participantAPI } from '../services/api';

const ParticipantSignup = ({ onSignup }) => {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        iiit_participant: false,
        college_name: '',
        contact_number: '',
        password: '',
        confirmPassword: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const validate = () => {
        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First name and last name are required.');
            return false;
        }
        if (/\S+@\S+\.(students|research)\.iiit\.ac\.in/.test(form.email)) {
                setForm(prev => ({
                    ...prev,
                    iiit_participant: true,
                    college_name: 'IIIT Hyderabad',
                }));
                return true;
            }
        if (!/\S+@\S+\.\S+/.test(form.email)) {
            setError('Please enter a valid email.');
            return false;
        }
        if (!form.password) {
            setError('Password is required.');
            return false;
        }
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!validate()) return;

        try {
            setLoading(true);

            const isIIITEmail = /^[a-z]+\.[a-z]+@(students|research)\.iiit\.ac\.in/.test(form.email);
            console.log(isIIITEmail);

            setForm(prev => ({
            ...prev,
            iiit_participant: isIIITEmail,
            college_name: isIIITEmail ? 'IIIT Hyderabad' : prev.college_name,
            }));

            const payload = {
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                email: form.email.trim(),
                iiit_participant: isIIITEmail,
                college_name: isIIITEmail ? 'IIIT Hyderabad' : form.college_name.trim(),
                contact_number: form.contact_number.trim(),
                password: form.password,
            };
            const res = await participantAPI.createParticipant(payload);
            setSuccessMsg('Signup successful! Redirecting...');
            // persist token and email so preferences page can update the participant
            const token = res?.data?.token;
            const created = res?.data?.data;
            if (token) localStorage.setItem('token', token);
            if (created && created.email) localStorage.setItem('participantEmail', created.email);

            setForm({
                first_name: '',
                last_name: '',
                email: '',
                iiit_participant: true,
                college_name: 'IIIT Hyderabad',
                contact_number: '',
                password: '',
                confirmPassword: '',
            });
            if (onSignup) onSignup(res.data);
            // navigate to preferences after short delay
            setTimeout(() => navigate('/preferences'), 800);
        } catch (err) {
            const serverMsg = err?.response?.data?.error || err.message;
            setError(serverMsg || 'Signup failed.');
        } finally {
            setLoading(false);
        }
    };

        return (
            <div className="signup-page">
                <h2>Participant Signup</h2>
                <div style={{ marginBottom: 8 }}>
                    <button onClick={() => navigate('/')} style={{ padding: '6px 10px' }}>← Back to Home</button>
                </div>

    {successMsg && <div className="success-message">{successMsg}</div>}
    {error && <div className="error-message">{error}</div>}

                <form className="signup-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <input name="first_name" value={form.first_name} onChange={handleChange} placeholder="First Name *" required />
                    </div>
                    <div className="form-group">
                        <input name="last_name" value={form.last_name} onChange={handleChange} placeholder="Last Name *" required />
                    </div>
                    <div className="form-group">
                        <input name="email" value={form.email} onChange={handleChange} placeholder="Email *" required />
                    </div>
                    <div className="form-group">
                        <input name="contact_number" value={form.contact_number} onChange={handleChange} placeholder="Contact Number" />
                    </div>
                <div className="form-group">
                    <input name="college_name" value={form.college_name} onChange={handleChange} placeholder="College Name" />
                </div>
                    <div className="form-group">
                        <input name="password" value={form.password} onChange={handleChange} type="password" placeholder="Password *" required />
                    </div>
                    <div className="form-group">
                        <input name="confirmPassword" value={form.confirmPassword} onChange={handleChange} type="password" placeholder="Confirm Password *" required />
                    </div>
        <div className="form-group">
          <button type="submit" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign up'}
          </button>
        </div>
                </form>
            </div>
        );
    };

export default ParticipantSignup;
