const express = require('express');
const router = express.Router();

const {
  createEvent,
  getEvent,
  updateEvent,
  getEventsByOrganizer,
  getAllEvents,
  getTrendingEvents,
  registerForEvent,
  purchaseMerchandise,
  getParticipantRegistrations,
  getParticipantRegistration,
  cancelRegistration,
  getRegistrationsForEvent,
  createMerchandiseOrder,
  uploadPaymentProof,
  getEventOrders,
  updateOrderStatus,
  getOrderById,
  getOrganizerPayments,
  scanTicket,
  getEventAttendance,
  manualAttendance,
  exportAttendanceCsv,
} = require('../controllers/eventController');

const {
  submitFeedback,
  getMyFeedback,
  getFeedbackSummary,
  getFeedback,
  exportFeedbackCsv,
} = require('../controllers/feedbackController');

const { protectOrganizer, protectParticipant } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');
const updateRegistrationsAfterEventEnd = require('../middleware/updateRegistrationsAfterEventEnd');

// Run registration status update for routes that reference an event, registration or order.
router.use('/:id', updateRegistrationsAfterEventEnd);
router.use('/registrations/:regId', updateRegistrationsAfterEventEnd);
router.use('/orders/:orderId', updateRegistrationsAfterEventEnd);
router.use('/registrations', updateRegistrationsAfterEventEnd);

// Create event (organizer only) and list all events
router.route('/')
  .post(protectOrganizer, createEvent)
  .get(getAllEvents);

// Trending events
router.route('/trending').get(getTrendingEvents);

//  Payment-proof merchandise routes 
// Organizer: all merchandise orders across their events
router.route('/organizer-payments')
  .get(protectOrganizer, getOrganizerPayments);

// Participant registrations 
router.route('/registrations')
  .get(protectParticipant, getParticipantRegistrations);

// ticket retrieval for a specific registration
router.route('/registrations/:regId/ticket')
  .get(protectParticipant, require('../controllers/eventController').getRegistrationTicket);

// Get events by organizer
router.route('/organizer/:organizerId')
  .get(getEventsByOrganizer);

// Order-level routes (participant) 
// Participant: get own order details
router.route('/orders/:orderId')
  .get(protectParticipant, getOrderById);

// Participant: upload payment proof (multipart image)
router.route('/orders/:orderId/payment-proof')
  .post(protectParticipant, upload.single('paymentProof'), uploadPaymentProof);

// Organizer: approve / reject an order
router.route('/orders/:orderId/status')
  .patch(protectOrganizer, updateOrderStatus);

// Attendance: manual override on a registration 
router.route('/registrations/:regId/manual-attendance')
  .post(protectOrganizer, manualAttendance);

// Participant registration / purchase
router.route('/:id/register')
  .post(protectParticipant, registerForEvent)
  .delete(protectParticipant, cancelRegistration);

router.route('/:id/purchase')
  .post(protectParticipant, purchaseMerchandise);

// Merchandise orders for an event
router.route('/:id/orders')
  .get(protectOrganizer, getEventOrders)        // organizer: list orders
  .post(protectParticipant, createMerchandiseOrder); // participant: place order

router.route('/:id/registration')
  .get(protectParticipant, getParticipantRegistration);

// Organizer-only: list registrations for an event
router.route('/:id/registrations')
  .get(protectOrganizer, getRegistrationsForEvent);

//  Attendance / scanner routes 
router.route('/:id/scan')
  .post(protectOrganizer, scanTicket);

router.route('/:id/attendance/export')
  .get(protectOrganizer, exportAttendanceCsv);

router.route('/:id/attendance')
  .get(protectOrganizer, getEventAttendance);

// Anonymous Feedback routes 
// Participant: submit / update own feedback
router.route('/:id/feedback')
  .post(protectParticipant, submitFeedback)
  .get(protectOrganizer, getFeedback);           // Organizer: list feedback (anonymous)

router.route('/:id/feedback/summary')
  .get(protectOrganizer, getFeedbackSummary);     // Organizer: aggregated summary

router.route('/:id/feedback/export')
  .get(protectOrganizer, exportFeedbackCsv);      // Organizer: CSV export

router.route('/:id/my-feedback')
  .get(protectParticipant, getMyFeedback);        // Participant: own feedback

// Event by ID 
router.route('/:id')
  .get(getEvent)
  .put(protectOrganizer, updateEvent);

module.exports = router;
