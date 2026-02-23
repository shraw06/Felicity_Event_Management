const Organizer = require('../models/Organizer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const signToken = (organizerId) => {
  return jwt.sign({ id: organizerId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d', // Token expires in 1 day
  });
}

// @desc  Get a single organizer
// @route GET /api/organizers/:email
const getOrganizer = async (req, res) => {
  try {
    const organizer = await Organizer.findOne({ email: req.params.email });

    if (!organizer) {
      return res.status(404).json({
        success: false,
        error: 'Organizer not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: organizer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc  Get all organizers
// @route GET /api/organizers
const getOrganizers = async (req, res) => {
  try {
    // return a small projection for listing
    const organizers = await Organizer.find({}, 'first_name last_name email description category');
    res.status(200).json({
      success: true,
      count: organizers.length,
      data: organizers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc  login organizer
// @route POST /api/organizers/login
const loginOrganizer = async (req, res) => {
  const { email, password } = req.body;

  try {
        const organizer = await Organizer.findOne({ email }).select('+password');
    
    if (!organizer) {
      return res.status(404).json({
        success: false,
        error: 'Organizer not found',
      });
    }

    const isMatch = await organizer.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const token = signToken(organizer._id);
    res.status(200).json({
      success: true,
      token,
      data: organizer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc  Update an organizer (editable fields only)
// @route PUT /api/organizers/:email
const updateOrganizer = async (req, res) => {
  try {
    const email = req.params.email;

    // Ensure requester is authenticated and is the same organizer
    if (!req.organizer) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (String(req.organizer.email) !== String(email)) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot update other organizer profile' });
    }

    // Only allow specific fields to be updated
    const allowed = ['first_name', 'last_name', 'category', 'description', 'contact_number', 'discordWebhook'];
    const update = {};
    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        update[field] = req.body[field];
      }
    });

    const organizer = await Organizer.findOneAndUpdate(
      { email },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!organizer) {
      return res.status(404).json({ success: false, error: 'Organizer not found' });
    }

    res.status(200).json({ success: true, data: organizer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getOrganizer,
  getOrganizers,
  loginOrganizer,
  updateOrganizer,
  createOrganizer,
  deleteOrganizer,
};

// @desc Delete an organizer and cascade delete their events and registrations (admin only)
async function deleteOrganizer(req, res) {
  try {
    const ident = req.params.email; // route uses :email path param historically
    let organizer = null;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(ident)) {
      organizer = await Organizer.findById(ident);
    }
    if (!organizer) {
      // try by email
      organizer = await Organizer.findOne({ email: ident });
    }
    if (!organizer) return res.status(404).json({ success: false, error: 'Organizer not found' });

    const Event = require('../models/Event');
    const EventRegistration = require('../models/EventRegistration');

    // find events by this organizer
    const events = await Event.find({ organizer_id: organizer._id }, '_id').lean();
    const eventIds = events.map(e => e._id);

    // delete registrations for these events
    if (eventIds.length > 0) {
      await EventRegistration.deleteMany({ eventId: { $in: eventIds } });
    }

    // delete events
    await Event.deleteMany({ organizer_id: organizer._id });

    // finally delete organizer
    await Organizer.findByIdAndDelete(organizer._id);

    return res.status(200).json({ success: true, data: { message: 'Organizer and related events/registrations deleted' } });
  } catch (err) {
    console.error('deleteOrganizer error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// @desc  Create a new organizer account (admin only)
// Auto-generates login email + password, sends credentials to contact email
async function createOrganizer(req, res) {
  try {
    const { contactEmail, first_name = 'Club', last_name = 'Organizer', category = '', description = '' } = req.body;
    if (!contactEmail) return res.status(400).json({ success: false, error: 'contactEmail is required' });

    // auto-generate login email using a bcrypt-derived unique token
    const slug = first_name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'org';
    // use bcrypt salt rounds to produce a unique string; take last 8 chars of the hash as suffix
    const saltForSuffix = await bcrypt.genSalt(8);
    const suffix = saltForSuffix.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    const loginEmail = `${slug}.${suffix}@felicity.internal`;

    // generate password: hash a timestamp string with bcrypt, then take first 12 alphanumeric chars of hash
    const saltForPass = await bcrypt.genSalt(10);
    const rawHash = await bcrypt.hash(String(Date.now()), saltForPass);
    const rawPassword = rawHash.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

    // create organizer (password gets hashed by pre-save hook)
    const organizer = await Organizer.create({
      first_name,
      last_name,
      category,
      description,
      email: loginEmail,
      contact_email: contactEmail,
      password: rawPassword,
    });

    // send credentials to the contact email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: contactEmail,
      subject: 'Your Felicity Organizer Account Credentials',
      html: `<p>Hello ${first_name} ${last_name},</p>
             <p>Your organizer account on Felicity has been created by an administrator.</p>
             <p><strong>Login Email:</strong> ${loginEmail}</p>
             <p><strong>Password:</strong> ${rawPassword}</p>
             <p>Please log in at <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/organizers/login">Organizer Login</a> and change your profile details after your first login.</p>
             <p>Keep these credentials safe.</p>`,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error('Failed to send organizer credentials email', err);
      else console.log('Organizer credentials email sent', info && info.messageId);
    });

    return res.status(201).json({
      success: true,
      data: {
        organizer: { _id: organizer._id, email: loginEmail, first_name, last_name },
        message: `Account created. Credentials sent to ${contactEmail}.`,
      },
    });
  } catch (err) {
    console.error('createOrganizer error', err);
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'Generated email collision, please retry.' });
    return res.status(500).json({ success: false, error: err.message });
  }
}