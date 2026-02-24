const express = require('express');
const router = express.Router();
const {
  getAdmin,
  loginAdmin,
} = require('../controllers/adminController');

const {
  getResetRequests,
  getResetRequestById,
  approveResetRequest,
  rejectResetRequest,
} = require('../controllers/passwordResetController');

const { protectAdmin } = require('../middleware/authMiddleware');

// /api/admins/login
router.route('/login')
  .post(loginAdmin);

//  Password reset request management (admin only) 
router.route('/organizer-reset-requests')
  .get(protectAdmin, getResetRequests);

router.route('/organizer-reset-requests/:id')
  .get(protectAdmin, getResetRequestById);

router.route('/organizer-reset-requests/:id/approve')
  .patch(protectAdmin, approveResetRequest);

router.route('/organizer-reset-requests/:id/reject')
  .patch(protectAdmin, rejectResetRequest);

// /api/admins/:email
router.route('/:email')
  .get(getAdmin);

module.exports = router;