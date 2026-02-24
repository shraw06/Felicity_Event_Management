import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// Participant API endpoints
export const participantAPI = {
  // Get all participants
  getAllParticipants: () => api.get('/participants'),

  // Get single participant
  getParticipant: (email) => api.get(`/participants/${email}`),

  // Create participant
  createParticipant: (participantData) => api.post('/participants', participantData),

  // Update participant
  updateParticipant: (email, participantData) => api.put(`/participants/${email}`, participantData),

  // Delete participant
  deleteParticipant: (email) => api.delete(`/participants/${email}`),
  // Login participant (used for verifying current password for sensitive actions)
  login: (credentials) => api.post('/participants/login', credentials),
};

// Organizer API endpoints
export const organizerAPI = {
  // Get all organizers
  getOrganizers: () => api.get('/organizers'),
  // Get single organizer by email
  getOrganizer: (email) => api.get(`/organizers/${email}`),
  // Update organizer (may require backend support)
  updateOrganizer: (email, data) => api.put(`/organizers/${email}`, data),
  login: (creds) => api.post('/organizers/login', creds),
  // Admin: create a new organizer account (sends credentials to contactEmail)
  createOrganizer: (payload) => api.post('/organizers', payload),
  // Admin: delete an organizer (by id or email)
  deleteOrganizer: (identifier) => api.delete(`/organizers/${identifier}`),
  // Organizer: submit password reset request
  createResetRequest: (payload) => api.post('/organizers/reset-request', payload),
  // Organizer: view own reset requests
  getMyResetRequests: () => api.get('/organizers/my-reset-requests'),
};

// Event API endpoints
export const eventAPI = {
  // Create event (returns created event)
  createEvent: (payload) => api.post('/events', payload),
  // Get event by id
  getEvent: (id) => api.get(`/events/${id}`),
  // Register for an event (participant must be authenticated)
  register: (id) => api.post(`/events/${id}/register`),
  // Check whether the current participant is registered for the event
  getRegistration: (id) => api.get(`/events/${id}/registration`),
  // Cancel the current participant's registration for the event
  cancelRegistration: (id) => api.delete(`/events/${id}/register`),
  // Purchase merchandise for an event
  purchase: (id, payload) => api.post(`/events/${id}/purchase`, payload),
  // Update event by id
  updateEvent: (id, payload) => api.put(`/events/${id}`, payload),
  // Get all events by organizer id
  getEventsByOrganizer: (organizerId) => api.get(`/events/organizer/${organizerId}`),
  // Get all events
  getAllEvents: () => api.get('/events'),
  // Get trending events (top 5 in past 24h)
  getTrending: () => api.get('/events/trending'),
  // Get current participant's registrations. Pass upcoming=true to return only upcoming registrations.
  getMyRegistrations: (upcoming = false) => {
    const params = {};
    if (upcoming) params.upcoming = 'true';
    return api.get('/events/registrations', { params });
  },
  // Organizer: get registrations and analytics for an event
  getEventRegistrations: (id) => api.get(`/events/${id}/registrations`),
  // Get ticket details (ticketId + base64 QR) for a registration id
  getRegistrationTicket: (regId) => api.get(`/events/registrations/${regId}/ticket`),

  // Merchandise payment-proof flow 
  createOrder: (eventId) => api.post(`/events/${eventId}/orders`),
  getOrder: (orderId) => api.get(`/events/orders/${orderId}`),
  uploadPaymentProof: (orderId, formData) =>
    api.post(`/events/orders/${orderId}/payment-proof`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getEventOrders: (eventId, status) =>
    api.get(`/events/${eventId}/orders`, { params: status ? { status } : {} }),
  updateOrderStatus: (orderId, payload) =>
    api.patch(`/events/orders/${orderId}/status`, payload),
  getOrganizerPayments: (status) =>
    api.get('/events/organizer-payments', { params: status ? { status } : {} }),

  // Attendance / scanner 
  scanTicket: (eventId, ticketId, method) =>
    api.post(`/events/${eventId}/scan`, { ticketId, method }),
  getEventAttendance: (eventId, params) =>
    api.get(`/events/${eventId}/attendance`, { params: params || {} }),
  manualAttendance: (regId, payload) =>
    api.post(`/events/registrations/${regId}/manual-attendance`, payload),
  exportAttendanceCsv: (eventId) =>
    api.get(`/events/${eventId}/attendance/export`, { responseType: 'blob' }),

  // Anonymous Feedback 
  submitFeedback: (eventId, payload) =>
    api.post(`/events/${eventId}/feedback`, payload),
  getMyFeedback: (eventId) =>
    api.get(`/events/${eventId}/my-feedback`),
  getFeedbackSummary: (eventId) =>
    api.get(`/events/${eventId}/feedback/summary`),
  getFeedback: (eventId, params) =>
    api.get(`/events/${eventId}/feedback`, { params: params || {} }),
  exportFeedbackCsv: (eventId) =>
    api.get(`/events/${eventId}/feedback/export`, { responseType: 'blob' }),
};

// Forum API endpoints
export const forumAPI = {
  getMessages: (eventId) => api.get(`/forum/${eventId}/messages`),
  getNotifications: () => api.get('/forum/notifications'),
  markRead: (id) => api.patch(`/forum/notifications/${id}/read`),
  markAllRead: () => api.patch('/forum/notifications/read-all'),
};

// Admin API endpoints
export const adminAPI = {
  getResetRequests: (status) =>
    api.get('/admins/organizer-reset-requests', { params: status ? { status } : {} }),
  getResetRequestById: (id) =>
    api.get(`/admins/organizer-reset-requests/${id}`),
  approveResetRequest: (id, payload) =>
    api.patch(`/admins/organizer-reset-requests/${id}/approve`, payload || {}),
  rejectResetRequest: (id, payload) =>
    api.patch(`/admins/organizer-reset-requests/${id}/reject`, payload),
};

export default api;