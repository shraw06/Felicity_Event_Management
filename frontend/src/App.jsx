import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import ParticipantSignup from './components/ParticipantSignup';
import ParticipantLogin from './components/ParticipantLogin';
import OrganizerLogin from './components/OrganizerLogin';
import AdminLogin from './components/AdminLogin';
import Preferences from './components/Preferences';
import ParticipantDashboard from './components/ParticipantDashboard';
import ParticipantDashboardContent from './components/ParticipantDashboardContent';
import TicketDetails from './components/TicketDetails';
import ParticipantProfile from './components/ParticipantProfile';
import ParticipantViewofOrganizers from './components/ParticipantViewofOrganizers';
import OrganizerDashboard from './components/OrganizerDashboard';
import OrganizerDashboardContent from './components/OrganizerDashboardContent';
import OrganizerProfile from './components/OrganizerProfile';
import CreateEvent from './components/CreateEvent';
import BrowseEvents from './components/BrowseEvents';
import EventDetail from './components/EventDetail';
import OrganizerDetail from './components/OrganizerDetail';
import AdminDashboard from './components/AdminDashboard';
import AdminDashboardOverview from './components/AdminDashboardOverview';
import AdminManageOrganizers from './components/AdminManageOrganizers';
import AdminPasswordResetRequests from './components/AdminPasswordResetRequests';
import EventViewofOrganizer from './components/EventViewofOrganizer';
import OrganizerPayments from './components/OrganizerPayments';
import OrganizerAttendance from './components/OrganizerAttendance';
import OrganizerOngoingEvents from './components/OrganizerOngoingEvents';

import './App.css';

function Home() {
  return (
    <div className="container">
      <header className="app-header">
        <h1>Felicity Event Management System</h1>
      </header>
      <div style={{ marginTop: 20 }}>
        <Link to="/signup" className="btn-submit">Go to Participant Signup</Link>
      </div>
      <div style={{ marginTop: 20 }}>
        <Link to="/login" className="btn-submit">Go to Participant Login</Link>
      </div>
      <div style={{ marginTop: 20 }}>
        <Link to="/organizers/login" className="btn-submit">Go to Organizer Login</Link>
      </div>
      <div style={{ marginTop: 20 }}>
        <Link to="/admins/login" className="btn-submit">Go to Admin Login</Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        {/* <nav className="main-nav" style={{ padding: '0.5rem 1rem' }}>
          <Link to="/">Home</Link> | <Link to="/signup">Sign Up</Link>
        </nav> */}

        <Routes>
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<ParticipantSignup />} />
          <Route path="/login" element={<ParticipantLogin />} />
          <Route path="/organizers/login" element={<OrganizerLogin />} />
          <Route path="/admins/login" element={<AdminLogin />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/participants/login" element={<ParticipantLogin />} />
          <Route path="/participant" element={<ParticipantDashboard />}>
            <Route index element={<ParticipantDashboardContent />} />
            <Route path="dashboard" element={<ParticipantDashboardContent />} />
              <Route path="registration/:regId/ticket" element={<TicketDetails />} />
            <Route path="browse-events" element={<BrowseEvents />} />
            <Route path="clubs-organizers" element={<ParticipantViewofOrganizers />} />
            <Route path="profile" element={<ParticipantProfile />} />
            <Route path="logout" element={<LogoutHandlerParticipant />} />
          </Route>
          <Route path="/organizers/:email" element={<OrganizerDetail />} />
          <Route path="/organizer" element={<OrganizerDashboard />}>
            <Route index element={<OrganizerDashboardContent />} />
            <Route path="dashboard" element={<OrganizerDashboardContent />} />
            <Route path="create-events" element={<CreateEvent />} />
            <Route path="profile" element={<OrganizerProfile />} />
            <Route path="ongoing-events" element={<OrganizerOngoingEvents />} />
            <Route path="payments" element={<OrganizerPayments />} />
            <Route path="logout" element={<LogoutHandlerOrganizer />} />
            <Route path="events/:id" element={<EventViewofOrganizer />} />
            <Route path="events/:id/attendance" element={<OrganizerAttendance />} />
          </Route>
          <Route path="/admin" element={<AdminDashboard />}>
            <Route index element={<AdminDashboardOverview />} />
            <Route path="dashboard" element={<AdminDashboardOverview />} />
            <Route path="manage-organizers" element={<AdminManageOrganizers />} />
            <Route path="password-reset-requests" element={<AdminPasswordResetRequests />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

function LogoutHandlerParticipant() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('participantEmail');
    } catch (e) {
      // ignore
    }
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}

function LogoutHandlerOrganizer() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('organizerEmail');
    } catch (e) {
      // ignore
    }
    navigate('/organizers/login', { replace: true });
  }, [navigate]);
  return null;
}