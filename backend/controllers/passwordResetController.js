const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const OrganizerPasswordReset = require('../models/OrganizerPasswordReset');
const Organizer = require('../models/Organizer');

const _getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

const _generatePassword = () => {
  return crypto.randomBytes(9).toString('base64url').substring(0, 12); // URL-safe, 12 chars
};


const createResetRequest = async (req, res) => {
  try {
    const organizer = req.organizer;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

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


const approveResetRequest = async (req, res) => {
  try {
    const request = await OrganizerPasswordReset.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, error: `Request already ${request.status}` });
    }

    const plaintext = _generatePassword();

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plaintext, salt);

    const organizer = await Organizer.findById(request.organizerId);
    if (!organizer) return res.status(404).json({ success: false, error: 'Organizer not found' });

    await Organizer.findByIdAndUpdate(organizer._id, { password: hashed });

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

   
    const recipients = [];
    if (organizer.contact_email && organizer.contact_email.trim()) recipients.push(organizer.contact_email.trim());
    else if (request.organizerEmail) recipients.push(request.organizerEmail);
    if (req.admin && req.admin.email) recipients.push(req.admin.email);

    

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject: `Password Reset Approved – ${request.clubName}`,
      html: `<p>Your password reset for <strong>${request.clubName}</strong> has been approved by ${req.admin?.email || 'an administrator'}.</p>
             <p><strong>New Temporary Password:</strong> <code>${plaintext}</code></p>
             <p>Please log in and change your password immediately. The admin has been copied on this email.</p>`,
    };

    res.json({
      success: true,
      data: {
        request: request.toObject(),
        plaintextPassword: plaintext,
      },
    });
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
