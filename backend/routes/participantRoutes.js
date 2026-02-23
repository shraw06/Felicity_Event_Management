const express = require('express');
const router = express.Router();
const {
  getParticipants,
  getParticipant,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  loginParticipant,
} = require('../controllers/participantController');

// /api/participants
router.route('/')
  .get(getParticipants)
  .post(createParticipant);

  // /api/participants/login
router.route('/login')
  .post(loginParticipant);
  
// /api/participants/:email
router.route('/:email')
  .get(getParticipant)
  .put(updateParticipant)
  .delete(deleteParticipant);

module.exports = router;