const express = require('express');
const router = express.Router();
const { protectParticipant, protectOrganizer } = require('../middleware/authMiddleware');
const {
  getMessages,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/forumController');

// Middleware that accepts either a participant or organizer token
const protectAny = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token' });
  }
  const jwt = require('jsonwebtoken');
  const Participant = require('../models/Participant');
  const Organizer = require('../models/Organizer');

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  const tryOrganizer = async () => {
    const org = await Organizer.findById(decoded.id).select('-password');
    if (org) { req.organizer = org; return next(); }
    return res.status(401).json({ success: false, error: 'User not found' });
  };

  Participant.findById(decoded.id).select('-password').then((p) => {
    if (p) { req.participant = p; return next(); }
    return tryOrganizer();
  }).catch(() => tryOrganizer());
};

// Message history (participant or organizer)
router.get('/:eventId/messages', protectAny, getMessages);

// Notifications (participant only)
router.get('/notifications', protectParticipant, getNotifications);
router.patch('/notifications/read-all', protectParticipant, markAllNotificationsRead);
router.patch('/notifications/:id/read', protectParticipant, markNotificationRead);

module.exports = router;
