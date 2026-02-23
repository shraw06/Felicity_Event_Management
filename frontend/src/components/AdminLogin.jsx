import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AdminLogin = ({ onLogin }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/admins/login', {
        email: form.email.trim(),
        password: form.password,
      });

      const token = res?.data?.token;
      if (token) {
        localStorage.setItem('token', token);
      }

      setSuccessMsg('Login successful! Redirecting...');
      setForm({ email: '', password: '' });
      if (onLogin) onLogin(res.data);
      setTimeout(() => navigate('/admin'), 700);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h2>Admin Login</h2>
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => navigate('/')} style={{ padding: '6px 10px' }}>← Back to Home</button>
      </div>

      {successMsg && <div className="success-message">{successMsg}</div>}
      {error && <div className="error-message">{error}</div>}

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email"
            required
          />
        </div>

        <div className="form-group">
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Password"
            required
          />
        </div>

        <div className="form-group">
          <button type="submit" disabled={loading} className="btn-submit">
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminLogin;
