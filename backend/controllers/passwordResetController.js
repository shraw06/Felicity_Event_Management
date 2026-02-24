const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const OrganizerPasswordReset = require('../models/OrganizerPasswordReset');
const Organizer = require('../models/Organizer');

/* ── helper: create nodemailer transporter (matches existing project pattern) ── */
const _getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

/* ── helper: generate a secure random password (12 alphanumeric chars) ──────── */
const _generatePassword = () => {
  return crypto.randomBytes(9).toString('base64url').substring(0, 12); // URL-safe, 12 chars
};

/* ================================================================
   POST /api/organizers/reset-request
   Organizer submits a password reset request
   Body: { reason }
   Auth: protectOrganizer
   ================================================================ */
const createResetRequest = async (req, res) => {
  try {
    const organizer = req.organizer;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    // Check for existing pending request
    const existing = await OrganizerPasswordReset.findOne({
      organizerId: organizer._id,
      status: 'Pending',
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending password reset request',
      });
    }

    const clubName = `${organizer.first_name} ${organizer.last_name}`.trim();

    const request = await OrganizerPasswordReset.create({
      organizerId: organizer._id,
      organizerEmail: organizer.email,
      clubName,
      reason: reason.trim(),
      history: [
        {
          action: 'created',
          by: organizer._id,
          role: 'organizer',
          comments: reason.trim(),
        },
      ],
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    console.error('createResetRequest error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================================================================
   GET /api/admin/organizer-reset-requests?status=Pending
   Admin lists all password reset requests (optional status filter)
   Auth: protectAdmin
   ================================================================ */
const getResetRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && ['Pending', 'Approved', 'Rejected'].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const requests = await OrganizerPasswordReset.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: requests });
  } catch (err) {
    console.error('getResetRequests error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================================================================
   GET /api/admin/organizer-reset-requests/:id
   Admin views single request with full history
   Auth: protectAdmin
   ================================================================ */
const getResetRequestById = async (req, res) => {
  try {
    const request = await OrganizerPasswordReset.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    res.json({ success: true, data: request });
  } catch (err) {
    console.error('getResetRequestById error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================================================================
   PATCH /api/admin/organizer-reset-requests/:id/approve
   Admin approves → generate password, hash & update Organizer,
   return plaintext in response, email plaintext to admin
   Body: { comments? }
   Auth: protectAdmin
   ================================================================ */
const approveResetRequest = async (req, res) => {
  try {
    const request = await OrganizerPasswordReset.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, error: `Request already ${request.status}` });
    }

    // Generate new password
    const plaintext = _generatePassword();

    // Hash with bcrypt (matching Organizer model's approach)
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plaintext, salt);

    // Update Organizer's password directly (bypass pre-save hook since we already hashed)
    const organizer = await Organizer.findById(request.organizerId);
    if (!organizer) return res.status(404).json({ success: false, error: 'Organizer not found' });

    await Organizer.findByIdAndUpdate(organizer._id, { password: hashed });

    // Update request
    request.status = 'Approved';
    request.adminId = req.admin._id;
    request.adminComments = (req.body.comments || '').trim();
    request.history.push({
      action: 'approved',
      by: req.admin._id,
      role: 'admin',
      comments: request.adminComments,
    });
    await request.save();

    // // Email the new password to organizer's contact email (and CC admin)
    // try {
    //   const transporter = _getTransporter();
    //   const recipients = [];

    //   // primary: organizer's contact email if available, otherwise fall back to the organizer login email
    //   if (organizer.contact_email && organizer.contact_email.trim()) recipients.push(organizer.contact_email.trim());
    //   else if (request.organizerEmail) recipients.push(request.organizerEmail);

    //   // also CC the approving admin for record (optional copy)
    //   if (req.admin && req.admin.email) recipients.push(req.admin.email);

    // Prepare email options (don't send synchronously) so we can return the plaintext immediately
    const recipients = [];
    if (organizer.contact_email && organizer.contact_email.trim()) recipients.push(organizer.contact_email.trim());
    else if (request.organizerEmail) recipients.push(request.organizerEmail);
    if (req.admin && req.admin.email) recipients.push(req.admin.email);

    //   await transporter.sendMail({
    //     from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    //     to: recipients.join(','),
    //     subject: `Password Reset Approved – ${request.clubName}`,
    //     html: `<p>Your password reset for <strong>${request.clubName}</strong> has been approved by ${req.admin?.email || 'an administrator'}.</p>
    //            <p><strong>New Temporary Password:</strong> <code>${plaintext}</code></p>
    //            <p>Please log in and change your password immediately. The admin has been copied on this email.</p>`,
    //   });
    // } catch (mailErr) {
    //   console.error('Failed to email new password to organizer/admin', mailErr);
    //   // Don't fail the request — admin still gets plaintext in the response
    // }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject: `Password Reset Approved – ${request.clubName}`,
      html: `<p>Your password reset for <strong>${request.clubName}</strong> has been approved by ${req.admin?.email || 'an administrator'}.</p>
             <p><strong>New Temporary Password:</strong> <code>${plaintext}</code></p>
             <p>Please log in and change your password immediately. The admin has been copied on this email.</p>`,
    };

    // Return plaintext once (never stored in DB) immediately
    res.json({
      success: true,
      data: {
        request: request.toObject(),
        plaintextPassword: plaintext,
      },
    });
    // Send the email asynchronously (do not await) — log errors but don't affect response
    try {
      const transporter = _getTransporter();
      transporter.sendMail(mailOptions).catch((mailErr) => {
        console.error('Failed to email new password to organizer/admin', mailErr);
      });
    } catch (mailErr) {
      console.error('Failed to start email send for new password', mailErr);
    }
  } catch (err) {
    console.error('approveResetRequest error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================================================================
   PATCH /api/admin/organizer-reset-requests/:id/reject
   Admin rejects with comments
   Body: { comments }
   Auth: protectAdmin
   ================================================================ */
const rejectResetRequest = async (req, res) => {
  try {
    const request = await OrganizerPasswordReset.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, error: `Request already ${request.status}` });
    }

    const comments = (req.body.comments || '').trim();
    if (!comments) {
      return res.status(400).json({ success: false, error: 'Comments are required when rejecting' });
    }

    request.status = 'Rejected';
    request.adminId = req.admin._id;
    request.adminComments = comments;
    request.history.push({
      action: 'rejected',
      by: req.admin._id,
      role: 'admin',
      comments,
    });
    await request.save();

    res.json({ success: true, data: request });
  } catch (err) {
    console.error('rejectResetRequest error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================================================================
   GET /api/organizers/my-reset-requests
   Organizer views their own requests
   Auth: protectOrganizer
   ================================================================ */
const getMyResetRequests = async (req, res) => {
  try {
    const requests = await OrganizerPasswordReset.find({
      organizerId: req.organizer._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: requests });
  } catch (err) {
    console.error('getMyResetRequests error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createResetRequest,
  getResetRequests,
  getResetRequestById,
  approveResetRequest,
  rejectResetRequest,
  getMyResetRequests,
};
