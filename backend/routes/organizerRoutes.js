const express = require('express');
const router = express.Router();
const {
  getOrganizer,
  getOrganizers,
  loginOrganizer,
  updateOrganizer,
  createOrganizer,
} = require('../controllers/organizerController');

const {
  createResetRequest,
  getMyResetRequests,
} = require('../controllers/passwordResetController');

const { protectOrganizer, protectAdmin } = require('../middleware/authMiddleware');

// /api/organizers  -> list organizers | POST -> create organizer (admin only)
router.route('/')
  .get(getOrganizers)
  .post(protectAdmin, createOrganizer);

// /api/organizers/login
router.route('/login')
  .post(loginOrganizer);

// ── Password reset request (organizer submits) ─────────────────────────────
router.route('/reset-request')
  .post(protectOrganizer, createResetRequest);

// ── Organizer views own reset requests ──────────────────────────────────────
router.route('/my-reset-requests')
  .get(protectOrganizer, getMyResetRequests);

// /api/organizers/:email
router.route('/:email')
  .get(getOrganizer)
  .put(protectOrganizer, updateOrganizer)
  .delete(protectAdmin, require('../controllers/organizerController').deleteOrganizer);

module.exports = router;